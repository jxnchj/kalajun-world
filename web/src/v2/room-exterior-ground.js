import {DataUtils,MathUtils,Vector3}from 'three';
import {decodeSolarDirection,roomSolarWeights}from './room-solar-transport.js';
const decode=s=>{const b=Uint8Array.from(atob(s),c=>c.charCodeAt(0)),v=new DataView(b.buffer),a=new Float32Array(b.length/2);for(let i=0;i<a.length;i++)a[i]=DataUtils.fromHalfFloat(v.getUint16(i*2,true));return a;};
export function validateGroundDirect(data,indirect){
 for(const k of ['entityId','roomKey','pose','terrainSources','externalSources'])if(JSON.stringify(data[k])!==JSON.stringify(indirect[k]))throw new Error('Ground direct source/entity mismatch: '+k);
 const source=indirect.states.open.sky.first;
 for(const k of ['bounds','size','validProbes','sourceSHA256','blendSHA256','openings'])if(JSON.stringify(data[k])!==JSON.stringify(source[k]))throw new Error('Ground direct grid/source mismatch: '+k);
 if(data.interiorBounceOrder!==0||data.apertureSamples!==36||data.groundSkySamples!==64)throw new Error('Ground direct path/sampling contract changed');
 const count=data.size.reduce((a,b)=>a*b,1)*12;
 for(const state of Object.values(data.states)){
  if(decode(state.sky).length!==count||state.solar.directions.length!==81)throw new Error('Ground direct dimensions mismatch');
  for(const k of ['bounds','size','validProbes','sourceSHA256','blendSHA256','openings'])if(JSON.stringify(state.solar[k])!==JSON.stringify(source[k]))throw new Error('Ground solar grid/source mismatch: '+k);
 }
 return data;
}
export class RoomExteriorGround{
 constructor(){this.solarEnabled=new URLSearchParams(globalThis.location?.search||'').get('roomExteriorGroundSun')!=='0';this.cache=new Map();this.stats={ready:false,active:false,interiorBounceOrder:0};}
 setData(data,indirect){this.data=validateGroundDirect(data,indirect);this.sky={open:decode(data.states.open.sky),closed:decode(data.states.closed.sky)};this.stats.ready=true;}
 direction(state,index){
  const key=state+':'+index;if(this.cache.has(key))return this.cache.get(key);
  const value=decodeSolarDirection(this.data.states[state].solar,index);this.cache.set(key,value);
  while(this.cache.size>12)this.cache.delete(this.cache.keys().next().value);return value;
 }
 apply(output,{daylight,scale,fraction,lighting,normalToLocal,solarEnabled=1}){
  this.stats.active=false;if(!this.data||daylight<=0||scale<=.001)return;
  const skyScale=2*daylight/(2.4*scale),sun=lighting?.sun;
  const localSun=new Vector3(sun?.x??0,sun?.y??0,sun?.z??0).applyMatrix3(normalToLocal).normalize();
  const horizon=MathUtils.smoothstep(sun?.y??0,0,Math.sin(2*Math.PI/180));
  // A blocked room aperture does not imply a blocked external hillside.
  // Its own shadow was traced at every terrain hit in the direction table.
  const sourceVisibility=lighting?.exteriorVisibility??lighting?.visibility??1;
  const sunScale=this.solarEnabled?Math.max(0,lighting?.intensity??0)*MathUtils.clamp(sourceVisibility,0,1)*horizon*MathUtils.clamp(solarEnabled,0,1)/(2.4*scale):0;
  const weights=sunScale>0?roomSolarWeights(this.data.states.open.solar,localSun):[];
  const terms=weights.map(({index,weight})=>({weight,open:this.direction('open',index),closed:this.direction('closed',index)}));
  const rgb=[lighting?.color?.r??0,lighting?.color?.g??0,lighting?.color?.b??0],mix=MathUtils.clamp(fraction,0,1);
  let skySum=0,sunSum=0;
  for(let i=0;i<output.length;i++){
   const channel=i%4;if(channel===3)continue;
   const offset=Math.floor(i/4)*3+channel;
   const sky=MathUtils.lerp(this.sky.closed[offset],this.sky.open[offset],mix)*skyScale;
   let solar=0;for(const t of terms)solar+=MathUtils.lerp(t.closed[offset],t.open[offset],mix)*t.weight;
   solar*=sunScale*rgb[channel];
   output[i]=DataUtils.toHalfFloat(DataUtils.fromHalfFloat(output[i])+sky+solar);
   if(i<output.length/4){skySum+=sky;sunSum+=solar;}
  }
  Object.assign(this.stats,{active:true,skyBandSum:skySum,solarBandSum:sunSum,solarDirectionSamples:weights.length,cacheBytes:[...this.cache.values()].reduce((s,a)=>s+a.byteLength,0),sourceVisibility,model:this.data.scope});
 }
 dispose(){this.cache.clear();this.data=null;this.sky=null;}
}
