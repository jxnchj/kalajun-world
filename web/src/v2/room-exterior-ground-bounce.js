import {DataUtils,MathUtils,Vector3}from 'three';
import {decodeSolarDirection,roomSolarWeights}from './room-solar-transport.js';
export function validateGroundBounces(data,indirect){
 for(const k of ['entityId','roomKey','pose','terrainSources','externalSources'])
  if(JSON.stringify(data[k])!==JSON.stringify(indirect[k]))throw new Error('Ground bounce source/entity mismatch: '+k);
 if(JSON.stringify(data.interiorBounceOrders)!=='[1,2]'||data.samples!==96||data.surfaceSamples!==32||data.apertureSamples!==4)
  throw new Error('Ground bounce path/sampling contract changed');
 const source=indirect.states.open.sky.first;
 for(const state of ['open','closed'])for(const order of ['first','second']){
  const field=data.states[state][order];
  for(const k of ['bounds','size','validProbes','sourceSHA256','blendSHA256','openings'])
   if(JSON.stringify(field[k])!==JSON.stringify(source[k]))throw new Error('Ground bounce grid/source mismatch: '+k);
  if(field.directions.length!==81||field.encoding!=='zero-run-f16-rgb-sh4-v1')throw new Error('Ground bounce direction table changed');
 }
 return data;
}
export class RoomExteriorGroundBounce{
 constructor(){
  this.enabled=new URLSearchParams(globalThis.location?.search||'').get('roomExteriorGroundBounce')!=='0';
  this.cache=new Map();this.stats={ready:false,active:false,enabled:this.enabled,interiorBounceOrders:[1,2]};
 }
 setData(data,indirect){this.data=validateGroundBounces(data,indirect);this.stats.ready=true;}
 direction(state,order,index){
  const key=state+':'+order+':'+index;if(this.cache.has(key))return this.cache.get(key);
  const value=decodeSolarDirection(this.data.states[state][order],index);this.cache.set(key,value);
  while(this.cache.size>24)this.cache.delete(this.cache.keys().next().value);return value;
 }
 apply(output,{daylight,scale,fraction,lighting,normalToLocal,solarEnabled=1,secondWeight=1}){
  this.stats.active=false;
  if(!this.enabled||!this.data||daylight<=0||scale<=.001)return;
  const sun=lighting?.sun,localSun=new Vector3(sun?.x??0,sun?.y??0,sun?.z??0).applyMatrix3(normalToLocal).normalize();
  const horizon=MathUtils.smoothstep(sun?.y??0,0,Math.sin(2*Math.PI/180));
  // External source visibility remains independent of a fully blocked room sun
  // aperture; terrain and house shadows were traced on the ground itself.
  const sourceVisibility=lighting?.exteriorVisibility??lighting?.visibility??1;
  const sunScale=Math.max(0,lighting?.intensity??0)*MathUtils.clamp(sourceVisibility,0,1)*horizon*MathUtils.clamp(solarEnabled,0,1)/(2.4*scale);
  if(sunScale<=0){Object.assign(this.stats,{active:true,firstBandSum:0,secondBandSum:0,sourceVisibility});return;}
  const weights=roomSolarWeights(this.data.states.open.first,localSun),terms=weights.map(({index,weight})=>({
   weight,firstOpen:this.direction('open','first',index),firstClosed:this.direction('closed','first',index),
   secondOpen:this.direction('open','second',index),secondClosed:this.direction('closed','second',index)
  }));
  const rgb=[lighting?.color?.r??0,lighting?.color?.g??0,lighting?.color?.b??0],mix=MathUtils.clamp(fraction,0,1),second=MathUtils.clamp(secondWeight,0,1);
  let firstSum=0,secondSum=0;
  for(let i=0;i<output.length;i++){
   const channel=i%4;if(channel===3)continue;const offset=Math.floor(i/4)*3+channel;
   let first=0,next=0;
   for(const t of terms){first+=MathUtils.lerp(t.firstClosed[offset],t.firstOpen[offset],mix)*t.weight;next+=MathUtils.lerp(t.secondClosed[offset],t.secondOpen[offset],mix)*t.weight;}
   first*=sunScale*rgb[channel];next*=sunScale*rgb[channel]*second;
   output[i]=DataUtils.toHalfFloat(DataUtils.fromHalfFloat(output[i])+first+next);
   if(i<output.length/4){firstSum+=first;secondSum+=next;}
  }
  Object.assign(this.stats,{active:true,firstBandSum:firstSum,secondBandSum:secondSum,sourceVisibility,solarDirectionSamples:weights.length,cacheBytes:[...this.cache.values()].reduce((n,a)=>n+a.byteLength,0),model:this.data.scope});
 }
 dispose(){this.data=null;this.cache.clear();}
}
