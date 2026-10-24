import {DataUtils,MathUtils} from 'three';
import {LODGE_DOOR,lodgeDoorEnabled} from './lodge-door.js';
import {LODGE_ROOM_KEY,prepareLodgeRoom} from './lodge-room-field.js';
import {LODGE_EAST_OPENINGS} from './lodge-cross-openings.js';
import {RoomSolarTransport} from './room-solar-transport.js';
const loaders=[()=>import('./lodge-door-data/0.js'),()=>import('./lodge-door-data/1.js'),()=>import('./lodge-door-data/2.js')];
const half=DataUtils.fromHalfFloat,toHalf=DataUtils.toHalfFloat;
const decode=f=>{const b=atob(f.data),a=new Uint16Array(b.length/2);for(let i=0;i<a.length;i++)a[i]=b.charCodeAt(i*2)|(b.charCodeAt(i*2+1)<<8);return a;};
export function lodgeDoorBracket(angle){const a=MathUtils.clamp(angle,0,LODGE_DOOR.open)*2/LODGE_DOOR.open,lo=Math.min(1,Math.floor(a));return {lo,hi:lo+1,weight:a-lo};}
export function validateLodgeDoorGI(input,index,local,cross,key=LODGE_ROOM_KEY,door=LODGE_DOOR){
 if(input?.key!==key||JSON.stringify(input.door)!==JSON.stringify(door)||input.index!==index||input.angle!==door.open*index/2||input.glassTransmission!==.9)throw new Error('Lodge articulated door identity differs');
 const source=local.sky,count=source.size.reduce((a,b)=>a*b,1),out={...input};
 for(const group of ['local','cross']){
  out[group]={};const fields=group==='local'?['sky','secondSky','solar','secondSolar','apertures']:['directSky','sky','secondSky','solar','secondSolar'];
  const expected=group==='local'?source.openings:LODGE_EAST_OPENINGS.map((o,i)=>({...o,skyWeight:i===0?1:o.skyWeight}));
  for(const name of fields){
   const f={...input[group]?.[name]};
   if(f.reusePayload){if(f.reusePayload!==group+'/'+name)throw new Error('Lodge door payload reference differs');const base=(group==='local'?local:cross)[name],p=base.directions?'directions':'data';f[p]=base[p];}
   for(const p of ['sourceSHA256','blendSHA256','bounds','size','openings','validProbes'])if(JSON.stringify(f[p])!==JSON.stringify(source[p]))throw new Error('Lodge door source/receiver differs: '+group+'/'+name+'/'+p);
   if(JSON.stringify(f.sourceOpenings)!==JSON.stringify(expected))throw new Error('Lodge door source aperture differs');
   if(name==='solar'||name==='secondSolar'){if(f.directions?.length!==81||(name==='secondSolar'&&f.bounceOrder!==2))throw new Error('Lodge door incomplete solar paths');}
   else if(atob(f.data??'').length!==count*(name==='apertures'?6:32))throw new Error('Lodge door invalid field dimensions');
   out[group][name]=f;
  }
 }
 return out;
}
class Supply{
 constructor(bundle,key=LODGE_ROOM_KEY){this.key=key;this.first=decode(bundle.sky);this.second=decode(bundle.secondSky);this.direct=bundle.directSky?decode(bundle.directSky):null;this.base=new Uint16Array(this.first.length);this.output=new Uint16Array(this.first.length);this.solar=new RoomSolarTransport({data:{[key]:bundle.solar},secondData:{[key]:bundle.secondSolar},secondLoaders:{}});}
 compose(normal,lighting,daylight,scale,sky,sun,second){
  sky=MathUtils.clamp(sky,0,1);const ratio=scale>0?daylight/scale:0,signature=ratio+'|'+sky;
  if(this.signature!==signature){for(let i=0;i<this.base.length;i++)this.base[i]=i%4===3?this.first[i]:toHalf(ratio*(half(this.first[i])+sky*half(this.second[i])+(this.direct?half(this.direct[i])*2/2.4:0)));this.signature=signature;this.solar.clear();}
  this.solar.compose(this.key,this.base,this.output,normal,lighting,scale,sun,second);return this.output;
 }
 dispose(){this.solar.dispose();}
}
export class LodgeDoorGI{
 constructor({enabled=lodgeDoorEnabled()&&new URLSearchParams(globalThis.location?.search??'').get('lodgeDoorGI')!=='0',key=LODGE_ROOM_KEY,load=null,closedFallback=false,trackAngles=true,door=LODGE_DOOR}={}){this.door=door;this.key=key;this.load=load;this.closedFallback=closedFallback;this.trackAngles=trackAngles;this.enabled=enabled;this.ready=false;this.pending=null;this.angle=null;this.states=[];this.stats={enabled,ready:false,active:false,pending:false,model:'actual glazed-door poses 0/0.875/1.75 rad; sky orders 0/1/2 and solar orders 1/2; adjacent-state interpolation, not full dynamic GI',extraSamplers:0,extraTextureFetches:0};}
 setState(leaves){const leaf=this.trackAngles&&leaves?.length===1?leaves[0]:null;this.angle=leaf?.name===this.door.name&&leaf.open===this.door.open&&Number.isFinite(leaf.angle)?MathUtils.clamp(leaf.angle,0,leaf.open):null;this.stats.angle=this.angle;if(this.angle===null)this.clearActive();}
 clearActive(){this.bracket=null;this.stats.active=false;this.stats.bracket=null;}
 supports(key){return this.enabled&&key===this.key&&(this.angle!==null||this.closedFallback);}
 prepare(key){
  if(!this.enabled||key!==this.key)return Promise.resolve();if(this.pending)return this.pending;this.error=null;this.stats.pending=true;
  const request=this.load?this.load(this.stats.delivery??={}):Promise.all([prepareLodgeRoom(),import('./lodge-cross-data.js'),import('./lodge-door-package.js')]).then(async([local,cross,codec])=>({local,cross:cross.default,modules:await codec.loadLodgeDoorPackage({local,cross:cross.default},{fallbackLoaders:loaders,stats:this.stats.delivery??={}})}));
  this.pending=request.then(({local,cross,modules})=>{
   if(this.disposed)return;
   this.states=modules.map((data,i)=>{const b=validateLodgeDoorGI(data,i,local,cross,this.key,this.door);return {local:new Supply(b.local,this.key),cross:new Supply(b.cross,this.key),apertures:Uint8Array.from(atob(b.local.apertures.data),c=>c.charCodeAt(0))};});
   this.ready=true;Object.assign(this.stats,{ready:true,pending:false});
  }).catch(e=>{this.error=e;this.pending=null;this.stats.pending=false;throw e;});this.pending.catch(()=>{});return this.pending;
 }
 compose(key,output,normal,lighting,crossLighting,daylight,scale,sky,sun,second,crossEnabled){
  this.clearActive();if(!this.supports(key))return false;if(this.error)throw this.error;if(!this.ready)return false;
  const bracket=this.bracket=lodgeDoorBracket(this.angle??0),a=this.states[bracket.weight===1?bracket.hi:bracket.lo],b=bracket.weight===0?a:this.states[bracket.hi];
  const la=a.local.compose(normal,lighting,daylight,scale,sky,sun,second),lb=b.local.compose(normal,lighting,daylight,scale,sky,sun,second);
  const ca=crossEnabled?a.cross.compose(normal,crossLighting??lighting,daylight,scale,sky,sun,second):null,cb=crossEnabled?b.cross.compose(normal,crossLighting??lighting,daylight,scale,sky,sun,second):null;
  for(let i=0;i<output.length;i++)if(i%4!==3)output[i]=toHalf(MathUtils.lerp(half(la[i])+(ca?half(ca[i]):0),half(lb[i])+(cb?half(cb[i]):0),bracket.weight));
  Object.assign(this.stats,{active:true,bracket});return true;
 }
 aperture(offset){if(!this.stats.active)return null;const b=this.bracket;return MathUtils.lerp(this.states[b.lo].apertures[offset],this.states[b.hi].apertures[offset],b.weight);}
 dispose(){this.clearActive();this.disposed=true;for(const state of this.states){state.local.dispose();state.cross.dispose();}this.states=[];}
}
