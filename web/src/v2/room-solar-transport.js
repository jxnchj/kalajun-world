import * as THREE from "three";
import {ROOM_TRANSPORT_DATA} from "./room-transport-data.js";
import {ROOM_SECOND_SOLAR_LOADERS} from "./room-second-solar-data.js";

// Compact zero runs only; every nonzero coefficient retains the baked Float16.
export function decodeSolarDirection(field,index){
  const source=atob(field.directions[index]),words=new Uint16Array(source.length/2);
  for(let i=0;i<words.length;i++)words[i]=source.charCodeAt(i*2)|(source.charCodeAt(i*2+1)<<8);
  const count=field.size.reduce((a,b)=>a*b,1)*12,out=new Float32Array(count);let read=0,write=0;
  while(read<words.length){
    const head=words[read++],n=head&32767;if(!n||write+n>count)throw new Error("Invalid room solar run");
    if(head&32768){if(read+n>words.length)throw new Error("Truncated room solar run");for(let i=0;i<n;i++)out[write+i]=THREE.DataUtils.fromHalfFloat(words[read+i]);read+=n;}
    write+=n;
  }
  if(write!==count||!out.every(Number.isFinite))throw new Error("Invalid room solar dimensions");return out;
}
export function roomSolarWeights(field,sun){
  if(!sun||sun.y<=0)return[];
  const length=Math.hypot(sun.x,sun.y,sun.z);if(!Number.isFinite(length)||length<.5)return[];
  const elevation=Math.asin(THREE.MathUtils.clamp(sun.y/length,-1,1))*180/Math.PI;
  const azimuth=((Math.atan2(sun.x,sun.z)/(2*Math.PI))%1+1)%1*field.azimuths;
  const a0=Math.floor(azimuth)%field.azimuths,a1=(a0+1)%field.azimuths,aw=azimuth-Math.floor(azimuth),levels=[...field.elevations,90];
  let lo=0;while(lo<levels.length-2&&elevation>levels[lo+1])lo++;
  const ew=THREE.MathUtils.clamp((elevation-levels[lo])/(levels[lo+1]-levels[lo]),0,1),result=new Map();
  for(const [e,w]of [[lo,1-ew],[lo+1,ew]])for(const [a,weight]of [[a0,1-aw],[a1,aw]]){
    const index=e===field.elevations.length?field.zenithIndex:e*field.azimuths+a,value=w*weight;
    if(value>1e-12)result.set(index,(result.get(index)||0)+value);
  }
  return [...result].map(([index,weight])=>({index,weight}));
}
export class RoomSolarTransport{
  constructor({data=ROOM_TRANSPORT_DATA,secondData={},secondLoaders=ROOM_SECOND_SOLAR_LOADERS,maxCachedDirections=12}={}){
    this.data=data;this.secondData={...secondData};this.secondLoaders=secondLoaders;this.preparations=new Map();this.loadErrors=new Map();this.disposed=false;this.validatedSecond=new Set();this.maxCachedDirections=maxCachedDirections;this.cache=new Map();this.signature=null;this.localSun=new THREE.Vector3();
    this.stats={updates:0,lastCpuMs:0,cacheBytes:0,cachedDirections:0,uploadBytes:0,active:false,directionSamples:0,loadedSecondRooms:0,lastLoadMs:0,solarBounceOrder:1,secondBounceWeight:0,model:"up to two static diffuse solar bounces; no external occluders"};
  }
  prepare(key){
    if(this.preparations.has(key))return this.preparations.get(key);
    const loader=this.secondLoaders[key];
    if(this.secondData[key]||!loader||!this.data[key])return Promise.resolve();
    const start=performance.now();
    const pending=Promise.resolve().then(loader).then(field=>{
      if(this.disposed)return;
      this._validateSecond(key,field);this.secondData[key]=field;
      this.stats.loadedSecondRooms=Object.keys(this.secondData).length;this.stats.lastLoadMs=performance.now()-start;
    }).catch(error=>{if(!this.disposed)this.loadErrors.set(key,error);throw error;});
    this.preparations.set(key,pending);return pending;
  }
  _validateSecond(key,second){
    const field=this.data[key];
    for(const prop of ["sourceSHA256","blendSHA256","size","bounds","openings","azimuths","elevations","zenithIndex"])
      if(JSON.stringify(field[prop])!==JSON.stringify(second[prop]))throw new Error("Room second solar source/grid differs: "+prop);
    if(second.bounceOrder!==2||second.directions.length!==field.directions.length)throw new Error("Invalid second solar bounce directions");
    this.validatedSecond.add(key);
  }
  _direction(key,index,second=false){
    const id=(second?"2:":"1:")+key+":"+index;let value=this.cache.get(id);
    if(value)this.cache.delete(id);else value=decodeSolarDirection((second?this.secondData:this.data)[key],index);
    this.cache.set(id,value);
    while(this.cache.size>this.maxCachedDirections)this.cache.delete(this.cache.keys().next().value);
    return value;
  }
  compose(key,base,output,normalToLocal,lighting,daylight,enabled=1,secondEnabled=1){
    if(secondEnabled>0&&this.loadErrors.has(key))throw this.loadErrors.get(key);
    const field=this.data[key],second=this.secondData[key],sun=lighting?.sun,color=lighting?.color;
    const secondWeight=field&&second?THREE.MathUtils.clamp(secondEnabled,0,1):0;
    if(secondWeight&&!this.validatedSecond.has(key))this._validateSecond(key,second);
    this.localSun.set(sun?.x??0,sun?.y??0,sun?.z??0).applyMatrix3(normalToLocal).normalize();
    const horizon=THREE.MathUtils.smoothstep(sun?.y??0,0,Math.sin(2*Math.PI/180));
    // The unchanged shader multiplies the existing sky field by 2.4*daylight.
    // Divide only the NEW solar term by that scale: one unit baked irradiance
    // becomes precisely the directional light's linear RGB irradiance at runtime.
    const scale=field&&daylight>.001?Math.max(0,lighting?.intensity??0)*THREE.MathUtils.clamp(lighting?.visibility??1,0,1)*
      THREE.MathUtils.clamp(enabled,0,1)*horizon/(2.4*daylight):0;
    const rgb=[color?.r??0,color?.g??0,color?.b??0];
    const signature=[key,...this.localSun.toArray(),...rgb,scale,secondWeight].join("|");
    if(signature===this.signature&&this.lastOutput===output&&this.lastBase===base)return false;
    const start=performance.now(),weights=scale>0?roomSolarWeights(field,this.localSun):[];
    const directions=weights.map(({index,weight})=>({values:this._direction(key,index),weight}));
    // The second table contains only paths with two material interactions.
    // The same sun RGB/intensity is applied once, after both source-material transfers.
    if(secondWeight)for(const {index,weight}of weights)directions.push({values:this._direction(key,index,true),weight:weight*secondWeight});
    output.set(base);
    if(directions.length){
      if(field.size.reduce((a,b)=>a*b,1)*16!==base.length)throw new Error("Room sky/solar grids differ");
      for(let i=0;i<output.length;i++){
        const channel=i%4;if(channel===3)continue;
        // Validity and each bathroom/roof exclusion remain byte-identical.
        if(base[i-channel+3]===0)continue;
        const offset=Math.floor(i/4)*3+channel;let irradiance=0;
        for(const d of directions)irradiance+=d.values[offset]*d.weight;
        output[i]=THREE.DataUtils.toHalfFloat(THREE.DataUtils.fromHalfFloat(base[i])+irradiance*scale*rgb[channel]);
      }
    }
    this.signature=signature;this.lastOutput=output;this.lastBase=base;
    Object.assign(this.stats,{updates:this.stats.updates+1,lastCpuMs:performance.now()-start,active:directions.length>0,directionSamples:weights.length,solarBounceOrder:secondWeight>0?2:1,secondBounceWeight:secondWeight,
      cacheBytes:[...this.cache.values()].reduce((n,v)=>n+v.byteLength,0),cachedDirections:this.cache.size,uploadBytes:output.byteLength});return true;
  }
  clear(){this.signature=null;this.lastOutput=null;this.lastBase=null;this.stats.active=false;}
  dispose(){this.disposed=true;this.clear();this.cache.clear();this.validatedSecond.clear();this.secondData={};this.preparations.clear();this.loadErrors.clear();this.stats.loadedSecondRooms=0;this.stats.cacheBytes=0;this.stats.cachedDirections=0;this.stats.uploadBytes=0;}
}
