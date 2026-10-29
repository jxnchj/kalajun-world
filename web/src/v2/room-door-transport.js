import {selectTextileGI73} from './house-textiles-gi73.js';
import * as THREE from 'three';
import {ROOM_BOUNCE_DATA} from './room-bounce-registry.js';
import {RoomSolarTransport} from './room-solar-transport.js';
const LOADERS={house_a:()=>selectTextileGI73('house_a',()=>import('./room-closed-door-data/house_a.js').then(m=>m.default),{part:'closed'}),yurt:()=>import('./room-closed-door-data/yurt.js').then(m=>m.default)};
const decode=f=>{const s=atob(f.data),a=new Uint16Array(s.length/2);for(let i=0;i<a.length;i++)a[i]=s.charCodeAt(i*2)|(s.charCodeAt(i*2+1)<<8);return a;};
// Projection of a thin leaf across its original doorway, not linear angle gain.
// doors.openness is clamped angle/(pi/2), keeping initial >90deg pose unchanged.
export function doorApertureFraction(openness=1){
 const p=Number.isFinite(openness)?THREE.MathUtils.clamp(openness,0,1):1;
 return p===1?1:p===0?0:1-Math.cos(p*Math.PI/2);
}
export class RoomDoorTransport{
 constructor({loaders=LOADERS}={}){
  this.loaders=loaders;this.pending=new Map();this.fields=new Map();this.errors=new Map();this.disposed=false;
  this.solar=new RoomSolarTransport({data:{},secondData:{},secondLoaders:{}});this.sky=new Map();this.outputs=new Map();
  this.stats={loadedRooms:0,pending:false,active:false,bypassedBy:null,openness:1,apertureFraction:1,model:'two baked original-door endpoints; intermediate angles interpolate source transport, not full dynamic GI'};
 }
 prepare(key){
  if(this.pending.has(key))return this.pending.get(key);if(!this.loaders[key])return Promise.resolve();
  const pending=Promise.resolve().then(this.loaders[key]).then(data=>{
   if(this.disposed)return;
   const source=ROOM_BOUNCE_DATA[key];
   for(const f of[data.sky,data.secondSky,data.solar,data.secondSolar,data.apertures])for(const prop of['derivedGeometry','sourceSHA256','blendSHA256','bounds','size','openings','validProbes'])
    if(JSON.stringify(f[prop])!==JSON.stringify(source[prop]))throw new Error('Closed door source/grid differs: '+prop);
   const first=decode(data.sky),second=decode(data.secondSky);if(first.length!==second.length||first.length!==source.size.reduce((a,b)=>a*b,1)*16)throw new Error('Invalid closed room field');
   this.fields.set(key,{data,first,second,apertures:Uint8Array.from(atob(data.apertures.data),c=>c.charCodeAt(0))});
   this.solar.data[key]=data.solar;this.solar.secondData[key]=data.secondSolar;this.stats.loadedRooms=this.fields.size;
  }).catch(e=>{this.errors.set(key,e);throw e;});this.pending.set(key,pending);return pending;
 }
 compose(key,output,normalToLocal,lighting,daylight,scale,skyWeight,sunEnabled,sunSecond,fraction){
  this.stats.bypassedBy=null;
  if(this.errors.has(key))throw this.errors.get(key);
  const f=this.fields.get(key);this.stats.active=fraction<1;this.stats.apertureFraction=fraction;
  this.stats.pending=fraction<1&&!f;
  if(fraction>=1)return;
  if(!f){
   // First entry into an already closed room must never display open-door GI.
   // Direct window/roof sources remain live while its endpoint is loading.
   for(let i=0;i<output.length;i++)if(i%4!==3)output[i]=0;return;
  }
  const signature=[skyWeight,daylight,scale].join('|');let entry=this.sky.get(key);
  if(!entry||entry.signature!==signature){
   const data=entry?.data??new Uint16Array(f.first.length),ratio=scale>0?daylight/scale:1;
   for(let i=0;i<data.length;i++)data[i]=i%4===3?f.first[i]:THREE.DataUtils.toHalfFloat((THREE.DataUtils.fromHalfFloat(f.first[i])+skyWeight*THREE.DataUtils.fromHalfFloat(f.second[i]))*ratio);
   entry={data,signature};this.sky.set(key,entry);this.solar.clear();
  }
  let closed=this.outputs.get(key);if(!closed){closed=new Uint16Array(output.length);this.outputs.set(key,closed);}
  this.solar.compose(key,entry.data,closed,normalToLocal,lighting,scale,sunEnabled,sunSecond);
  for(let i=0;i<output.length;i++)if(i%4!==3)output[i]=THREE.DataUtils.toHalfFloat(THREE.MathUtils.lerp(THREE.DataUtils.fromHalfFloat(closed[i]),THREE.DataUtils.fromHalfFloat(output[i]),fraction));
 }
 clear(){this.stats.bypassedBy=null;this.stats.pending=false;this.stats.active=false;this.stats.openness=1;this.stats.apertureFraction=1;this.solar.clear();}
 dispose(){this.disposed=true;this.clear();this.fields.clear();this.pending.clear();this.errors.clear();this.sky.clear();this.outputs.clear();this.solar.dispose();this.stats.loadedRooms=0;}
}
