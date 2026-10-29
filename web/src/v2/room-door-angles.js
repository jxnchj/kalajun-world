import {selectTextileGI73} from './house-textiles-gi73.js';
import {PastoralDoorAngles41,PASTORAL_ANGLE_KEYS41} from './room-pastoral-door-angles41.js';
import {MathUtils,DataUtils} from 'three';
import {HOUSEHOLD_ENTRY_ASSET} from './household-entry-steps.js';
import {ROOM_BOUNCE_DATA} from './room-bounce-registry.js';
import {RoomDoorTransport} from './room-door-transport.js';
export const ANGLE_ROOM='house_a-entry-tea-34';
const loaders=[()=>selectTextileGI73('house_a-entry-tea-34',()=>import('./room-door-angle-data/tea-30.js').then(m=>m.default),{degree:30}),()=>selectTextileGI73('house_a-entry-tea-34',()=>import('./room-door-angle-data/tea-60.js').then(m=>m.default),{degree:60}),()=>selectTextileGI73('house_a-entry-tea-34',()=>import('./room-door-angle-data/tea-90.js').then(m=>m.default),{degree:90})];
export function doorAngleBracket(degrees,openDegrees=102){
 const knots=[0,30,60,90,openDegrees],d=MathUtils.clamp(degrees,0,openDegrees);
 for(let i=0;i<knots.length-1;i++)if(d<=knots[i+1])return {lo:knots[i],hi:knots[i+1],weight:(d-knots[i])/(knots[i+1]-knots[i])};
}
export function validateDoorAngle(data,degree){
 const base=ROOM_BOUNCE_DATA[ANGLE_ROOM];if(!base)throw new Error('Prepare source household before door angles');
 if(data.key!==ANGLE_ROOM||data.entityId!==HOUSEHOLD_ENTRY_ASSET.entityId||data.degrees!==degree||data.doorPoses?.length!==1)throw new Error('Door angle identity differs');
 for(const field of ['sky','secondSky','solar','secondSolar','apertures'])for(const prop of ['derivedGeometry','sourceSHA256','blendSHA256','bounds','size','openings','validProbes','externalSources'])
  if(JSON.stringify(data[field]?.[prop])!==JSON.stringify(base[prop]))throw new Error('Door angle source/grid differs: '+prop);
 const pose=data.doorPoses[0];if(pose.name!=='house_a_door0'||Math.abs(Math.abs(pose.openEuler[2])*180/Math.PI-102)>.01)throw new Error('Door angle original hinge differs');if(Math.abs(Math.abs(pose.bakedEuler[2])*180/Math.PI-degree)>1e-4)throw new Error('Door angle transform differs');
 return data;
}
class TeaDoorAngles{
 constructor(){this.enabled=new URLSearchParams(globalThis.location?.search||" ").get("roomDoorAngles")!=="0";this.children=new Map();this.pending=null;this.ready=false;this.disposed=false;this.angle=null;this.openDegrees=102;this.stats={ready:false,active:false,pending:false,degrees:null,model:'tea single-leaf 0/30/60/90/102 degree two-bounce tables; adjacent-angle interpolation, not full dynamic GI'};}
 setState(leaves){this.angle=leaves?.length===1?Math.abs(leaves[0].angle)*180/Math.PI:null;if(leaves?.length===1)this.openDegrees=Math.abs(leaves[0].open)*180/Math.PI;this.stats.degrees=this.angle;}
 supports(key){return this.enabled&&key===ANGLE_ROOM&&Number.isFinite(this.angle)&&Math.abs(this.openDegrees-102)<.01;}
 prepare(key){
  if(!this.enabled||key!==ANGLE_ROOM)return Promise.resolve();if(this.pending)return this.pending;this.stats.pending=true;
  this.pending=Promise.all(loaders.map(async(load,i)=>{
   const data=validateDoorAngle(await load(),[30,60,90][i]);if(this.disposed)return;
   const child=new RoomDoorTransport({loaders:{[ANGLE_ROOM]:()=>Promise.resolve(data)}});await child.prepare(ANGLE_ROOM);if(this.disposed){child.dispose();return;}this.children.set(data.degrees,child);
  })).then(()=>{if(!this.disposed){this.ready=true;this.stats.ready=true;this.stats.pending=false;}}).catch(e=>{this.error=e;this.stats.pending=false;throw e;});return this.pending;
 }
 compose(owner,key,output,normal,lighting,daylight,scale,sky,sun,second){
  this.stats.active=false;if(!this.supports(key))return false;if(this.error)throw this.error;if(!this.ready)return false;
  const b=doorAngleBracket(this.angle,this.openDegrees);this.bracket=b;this.stats.active=true;this.stats.bracket=b;
  const original=this.original?.length===output.length?this.original:this.original=new Uint16Array(output.length);original.set(output);
  const a=this.a?.length===output.length?this.a:this.a=new Uint16Array(output.length),c=this.b?.length===output.length?this.b:this.b=new Uint16Array(output.length);
  const at=(degree,dst)=>{dst.set(original);if(degree===this.openDegrees)return;(degree===0?owner:this.children.get(degree)).compose(key,dst,normal,lighting,daylight,scale,sky,sun,second,0);};
  at(b.lo,a);at(b.hi,c);
  for(let i=0;i<output.length;i++)if(i%4!==3)output[i]=b.weight===0?a[i]:b.weight===1?c[i]:DataUtils.toHalfFloat(MathUtils.lerp(DataUtils.fromHalfFloat(a[i]),DataUtils.fromHalfFloat(c[i]),b.weight));
  return true;
 }
 aperture(owner,key,open,offset){
  if(!this.stats.active)return null;
  const b=this.bracket,at=d=>d===this.openDegrees?open[offset]:(d===0?owner:this.children.get(d)).fields.get(key).apertures[offset];
  return MathUtils.lerp(at(b.lo),at(b.hi),b.weight);
 }
 dispose(){this.disposed=true;for(const child of this.children.values())child.dispose();this.children.clear();}
}

// Select a source-bound implementation per room; never reuse tea-house fields
// for another household or average the independently blocked yurt leaves.
export class RoomDoorAngles{
 constructor(){this.tea=new TeaDoorAngles();this.pastoral=new PastoralDoorAngles41();this.current=this.tea;this.stats={...this.tea.stats};}
 get ready(){return this.current.ready;}
 get error(){return this.current.error;}
 get angle(){return this.current.angle;}
 select(key){this.current=this.pastoral.enabled&&PASTORAL_ANGLE_KEYS41.includes(key)?this.pastoral:this.tea;return this.current;}
 sync(){for(const key of Object.keys(this.stats))if(!(key in this.current.stats))delete this.stats[key];Object.assign(this.stats,this.current.stats);}
 setState(leaves){this.tea.setState(leaves);this.pastoral.setState(leaves);this.sync();}
 supports(key){const result=this.select(key).supports(key);this.sync();return result;}
 prepare(key){const current=this.select(key),pending=current.prepare(key);this.sync();return pending.then(v=>{if(current===this.current)this.sync();return v;},e=>{if(current===this.current)this.sync();throw e;});}
 compose(...args){const result=this.select(args[1]).compose(...args);this.sync();return result;}
 aperture(...args){return this.select(args[1]).aperture(...args);}
 clearActive(){Object.assign(this.tea.stats,{active:false,degrees:null,bracket:null});Object.assign(this.pastoral.stats,{active:false,key:null,degrees:null,weights:null});this.sync();}
 dispose(){this.clearActive();this.tea.dispose();this.pastoral.dispose();}
}
