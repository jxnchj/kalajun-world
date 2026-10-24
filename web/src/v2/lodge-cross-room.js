import * as THREE from 'three';
import {RoomSolarTransport} from './room-solar-transport.js';
import {LODGE_ROOM_KEY} from './lodge-room-field.js';
import {LODGE_EAST_OPENINGS} from './lodge-cross-openings.js';
import {ROOM_BOUNCE_DATA} from './room-bounce-registry.js';
const decode=f=>{const s=atob(f.data),a=new Uint16Array(s.length/2);for(let i=0;i<a.length;i++)a[i]=s.charCodeAt(i*2)|(s.charCodeAt(i*2+1)<<8);return a;};
export function validateLodgeCross(bundle,base){
 if(bundle?.key!==LODGE_ROOM_KEY||JSON.stringify(bundle.sourceOpenings)!==JSON.stringify(LODGE_EAST_OPENINGS))throw new Error('Cross-room source apertures differ');
 for(const name of ['directSky','sky','secondSky','solar','secondSolar']){
  const f=bundle[name];if(!f)throw new Error('Incomplete cross-room transport');
  for(const p of ['sourceSHA256','blendSHA256','size','bounds','openings','validProbes'])if(JSON.stringify(f[p])!==JSON.stringify(base[p]))throw new Error('Cross-room source/receiver differs: '+name+'/'+p);
  if(JSON.stringify(f.sourceOpenings)!==JSON.stringify(LODGE_EAST_OPENINGS))throw new Error('Cross-room source identity differs');
 }
 if(bundle.solar.directions.length!==81||bundle.secondSolar.directions.length!==81)throw new Error('Incomplete cross-room solar directions');
 return bundle;
}
export class LodgeCrossRoom{
 constructor({enabled=new URLSearchParams(globalThis.location?.search??'').get('lodgeCrossRoom')}={}){this.enabled=enabled!==false&&enabled!==0&&enabled!=='0';this.ready=false;this.pending=null;this.error=null;this.disposed=false;this.lighting=null;this.solar=new RoomSolarTransport({data:{},secondData:{},secondLoaders:{}});this.stats={enabled:this.enabled,ready:false,pending:false,model:'eleven east exterior sources through original passage and furniture; sky orders 0/1/2, solar orders 1/2; static original closed glazed door'};}
 prepare(key){
  if(!this.enabled||key!==LODGE_ROOM_KEY)return Promise.resolve();if(this.pending)return this.pending;
  this.stats.pending=true;this.pending=import('./lodge-cross-data.js').then(m=>{
   if(this.disposed)return;const b=validateLodgeCross(m.default,ROOM_BOUNCE_DATA[key]);
   this.direct=decode(b.directSky);this.first=decode(b.sky);this.second=decode(b.secondSky);
   const n=ROOM_BOUNCE_DATA[key].size.reduce((a,b)=>a*b,1)*16;
   if([this.direct,this.first,this.second].some(a=>a.length!==n))throw new Error('Cross-room field dimensions differ');
   this.base=new Uint16Array(n);this.output=new Uint16Array(n);this.solar.data[key]=b.solar;this.solar.secondData[key]=b.secondSolar;
   this.ready=true;Object.assign(this.stats,{ready:true,pending:false,sourceOpenings:b.sourceOpenings.length,extraSamplers:0,extraTextureFetches:0});
  }).catch(e=>{this.error=e;this.stats.pending=false;throw e;});this.pending.catch(()=>{});return this.pending;
 }
 apply(key,output,normalToLocal,lighting,daylight,scale,skySecond,sunEnabled,sunSecond){
  if(!this.enabled||key!==LODGE_ROOM_KEY)return;if(this.error)throw this.error;if(!this.ready)return;
  const ratio=scale>0?daylight/scale:0,signature=ratio+'|'+skySecond;
  if(this.signature!==signature){
   for(let i=0;i<this.base.length;i++)this.base[i]=i%4===3?this.first[i]:THREE.DataUtils.toHalfFloat(ratio*(THREE.DataUtils.fromHalfFloat(this.direct[i])*(2/2.4)+THREE.DataUtils.fromHalfFloat(this.first[i])+skySecond*THREE.DataUtils.fromHalfFloat(this.second[i])));
   this.signature=signature;this.solar.clear();
  }
  this.solar.compose(key,this.base,this.output,normalToLocal,this.lighting??lighting,scale,sunEnabled,sunSecond);
  for(let i=0;i<output.length;i++)if(i%4!==3)output[i]=THREE.DataUtils.toHalfFloat(THREE.DataUtils.fromHalfFloat(output[i])+THREE.DataUtils.fromHalfFloat(this.output[i]));
 }
 dispose(){this.disposed=true;this.solar.dispose();this.direct=this.first=this.second=this.base=this.output=null;}
}
