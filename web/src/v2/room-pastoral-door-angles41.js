import {selectTextileGI73} from './house-textiles-gi73.js';
import {MathUtils,DataUtils} from 'three';
import {ROOM_BOUNCE_DATA} from './room-bounce-registry.js';
import {RoomDoorTransport} from './room-door-transport.js';
const modules={'./room-pastoral-door-data41/house_a-30.js':()=>selectTextileGI73('house_a',()=>import('./room-pastoral-door-data41/house_a-30.js').then(m=>m.default),{degree:30}).then(data=>({default:data})),
'./room-pastoral-door-data41/house_a-60.js':()=>selectTextileGI73('house_a',()=>import('./room-pastoral-door-data41/house_a-60.js').then(m=>m.default),{degree:60}).then(data=>({default:data})),
'./room-pastoral-door-data41/house_a-90.js':()=>selectTextileGI73('house_a',()=>import('./room-pastoral-door-data41/house_a-90.js').then(m=>m.default),{degree:90}).then(data=>({default:data})),
'./room-pastoral-door-data41/house_a-living-0-30.js':()=>selectTextileGI73('house_a-living-0',()=>import('./room-pastoral-door-data41/house_a-living-0-30.js').then(m=>m.default),{degree:30}).then(data=>({default:data})),
'./room-pastoral-door-data41/house_a-living-0-60.js':()=>selectTextileGI73('house_a-living-0',()=>import('./room-pastoral-door-data41/house_a-living-0-60.js').then(m=>m.default),{degree:60}).then(data=>({default:data})),
'./room-pastoral-door-data41/house_a-living-0-90.js':()=>selectTextileGI73('house_a-living-0',()=>import('./room-pastoral-door-data41/house_a-living-0-90.js').then(m=>m.default),{degree:90}).then(data=>({default:data})),
'./room-pastoral-door-data41/house_a-living-1-30.js':()=>selectTextileGI73('house_a-living-1',()=>import('./room-pastoral-door-data41/house_a-living-1-30.js').then(m=>m.default),{degree:30}).then(data=>({default:data})),
'./room-pastoral-door-data41/house_a-living-1-60.js':()=>selectTextileGI73('house_a-living-1',()=>import('./room-pastoral-door-data41/house_a-living-1-60.js').then(m=>m.default),{degree:60}).then(data=>({default:data})),
'./room-pastoral-door-data41/house_a-living-1-90.js':()=>selectTextileGI73('house_a-living-1',()=>import('./room-pastoral-door-data41/house_a-living-1-90.js').then(m=>m.default),{degree:90}).then(data=>({default:data})),
'./room-pastoral-door-data41/house_a-living-2-30.js':()=>selectTextileGI73('house_a-living-2',()=>import('./room-pastoral-door-data41/house_a-living-2-30.js').then(m=>m.default),{degree:30}).then(data=>({default:data})),
'./room-pastoral-door-data41/house_a-living-2-60.js':()=>selectTextileGI73('house_a-living-2',()=>import('./room-pastoral-door-data41/house_a-living-2-60.js').then(m=>m.default),{degree:60}).then(data=>({default:data})),
'./room-pastoral-door-data41/house_a-living-2-90.js':()=>selectTextileGI73('house_a-living-2',()=>import('./room-pastoral-door-data41/house_a-living-2-90.js').then(m=>m.default),{degree:90}).then(data=>({default:data})),
'./room-pastoral-door-data41/yurt-0-51.js':()=>import('./room-pastoral-door-data41/yurt-0-51.js'),
'./room-pastoral-door-data41/yurt-0-102.js':()=>import('./room-pastoral-door-data41/yurt-0-102.js'),
'./room-pastoral-door-data41/yurt-51-0.js':()=>import('./room-pastoral-door-data41/yurt-51-0.js'),
'./room-pastoral-door-data41/yurt-51-51.js':()=>import('./room-pastoral-door-data41/yurt-51-51.js'),
'./room-pastoral-door-data41/yurt-51-102.js':()=>import('./room-pastoral-door-data41/yurt-51-102.js'),
'./room-pastoral-door-data41/yurt-102-0.js':()=>import('./room-pastoral-door-data41/yurt-102-0.js'),
'./room-pastoral-door-data41/yurt-102-51.js':()=>import('./room-pastoral-door-data41/yurt-102-51.js')};
export const PASTORAL_ANGLE_KEYS41=['house_a','house_a-living-0','house_a-living-1','house_a-living-2','yurt'];
const knots=key=>key==='yurt'?[0,51,102]:[0,30,60,90,102];
export function pastoralAngleWeights41(key,angles){
 const levels=knots(key),brackets=angles.map(angle=>{const d=MathUtils.clamp(angle,0,102);let i=0;while(i<levels.length-2&&d>levels[i+1])i++;return[[levels[i],1-(d-levels[i])/(levels[i+1]-levels[i])],[levels[i+1],(d-levels[i])/(levels[i+1]-levels[i])]];});
 let result=[{degrees:[],weight:1}];for(const b of brackets)result=result.flatMap(r=>b.map(([d,w])=>({degrees:[...r.degrees,d],weight:r.weight*w})));return result.filter(r=>r.weight>1e-12);
}
export function validatePastoralAngle41(data,key,degrees){
 const base=ROOM_BOUNCE_DATA[key],asset=key==='yurt'?'yurt':'house_a',names=asset==='yurt'?['yurt_door0_out','yurt_door1_out']:['house_a_door0'];
 if(!base||data?.key!==key||JSON.stringify(data.degrees)!==JSON.stringify(degrees)||data.doorPoses?.length!==names.length)throw Error('Pastoral angle identity differs');
 for(const name of ['sky','secondSky','solar','secondSolar','apertures'])for(const prop of ['derivedGeometry','sourceSHA256','blendSHA256','bounds','size','openings','validProbes','externalSources'])if(JSON.stringify(data[name]?.[prop])!==JSON.stringify(base[prop]))throw Error('Pastoral angle source/grid differs: '+name+'/'+prop);
 for(const [i,p]of data.doorPoses.entries())if(p.name!==names[i]||Math.abs(Math.abs(p.openEuler[2])*180/Math.PI-102)>.01||Math.abs(Math.abs(p.bakedEuler[2])*180/Math.PI-degrees[i])>.0001)throw Error('Pastoral angle hinge differs');
 if(data.sky.samples!==96||data.secondSky.surfaceSamples!==32||data.solar.directions.length!==81||data.secondSolar.directions.length!==81||data.secondSolar.bounceOrder!==2||data.apertures.apertureSamples!==36)throw Error('Pastoral angle sampling differs');return data;
}
export class PastoralDoorAngles41{
 constructor({enabled=new URLSearchParams(globalThis.location?.search||'').get('roomPastoralDoorAngles41')!=='0'&&new URLSearchParams(globalThis.location?.search||'').get('roomDoorAngles')!=='0',loaders=modules}={}){this.enabled=enabled;this.loaders=loaders;this.rooms=new Map();this.key=null;this.leaves=null;this.disposed=false;this.stats={enabled,ready:false,active:false,pending:false,key:null,model:'source-bound single/dual leaf pose lattice; two static diffuse orders, no new GPU texture'};}
 get room(){return this.rooms.get(this.key);}
 get ready(){return this.room?.ready===true;}
 get error(){return this.room?.error;}
 get angle(){return this.leaves?.map(l=>l.angle).join(',')??null;}
 select(key){this.key=key;Object.assign(this.stats,{key,ready:this.ready,pending:!!this.room?.pending&&!this.ready});}
 setState(leaves){this.leaves=leaves;}
 supports(key){if(!this.enabled||!PASTORAL_ANGLE_KEYS41.includes(key))return false;this.select(key);const names=key==='yurt'?['yurt_door0_out','yurt_door1_out']:['house_a_door0'];if(this.leaves?.length!==names.length)return false;
  const ordered=names.map(n=>this.leaves.find(l=>l.name===n));if(ordered.some(l=>!l||!Number.isFinite(l.angle)||!Number.isFinite(l.open)||Math.abs(Math.abs(l.open)*180/Math.PI-102)>.01||l.angle*l.open<-.00001))return false;this.angles=ordered.map(l=>Math.abs(l.angle)*180/Math.PI);return true;}
 prepare(key){if(!this.enabled||!PASTORAL_ANGLE_KEYS41.includes(key))return Promise.resolve();this.select(key);if(this.rooms.has(key))return this.room.pending;const room={ready:false,children:new Map()};this.rooms.set(key,room);this.stats.pending=true;
  const poses=key==='yurt'?[0,51,102].flatMap(a=>[0,51,102].map(b=>[a,b])).filter(a=>!a.every(v=>v===0)&&!a.every(v=>v===102)):[30,60,90].map(d=>[d]);
  room.pending=Promise.all(poses.map(async degrees=>{const suffix=degrees.join('-'),path='./room-pastoral-door-data41/'+key+'-'+suffix+'.js',load=this.loaders[path];if(!load)throw Error('Missing pastoral angle asset '+path);const data=validatePastoralAngle41((await load()).default,key,degrees);if(this.disposed)return;const child=new RoomDoorTransport({loaders:{[key]:()=>Promise.resolve(data)}});await child.prepare(key);if(this.disposed){child.dispose();return;}room.children.set(suffix,child);})).then(()=>{if(!this.disposed){room.ready=true;if(this.key===key)Object.assign(this.stats,{ready:true,pending:false});}}).catch(e=>{room.error=e;if(this.key===key)this.stats.pending=false;throw e;});return room.pending;
 }
 compose(owner,key,output,normal,lighting,daylight,scale,sky,sun,second){this.stats.active=false;if(!this.supports(key))return false;if(this.error)throw this.error;if(!this.ready)return false;const weights=pastoralAngleWeights41(key,this.angles);if(this.original?.length!==output.length){this.original=new Uint16Array(output.length);this.scratch=new Uint16Array(output.length);this.sum=new Float32Array(output.length);}const original=this.original,sum=this.sum;original.set(output);sum.fill(0);this.weights=weights;
  for(const term of weights){const data=this.scratch;data.set(original);if(!term.degrees.every(d=>d===102)){const child=term.degrees.every(d=>d===0)?owner:this.room.children.get(term.degrees.join('-'));child.compose(key,data,normal,lighting,daylight,scale,sky,sun,second,0);}for(let i=0;i<data.length;i++)if(i%4!==3)sum[i]+=DataUtils.fromHalfFloat(data[i])*term.weight;}
  for(let i=0;i<output.length;i++)if(i%4!==3)output[i]=DataUtils.toHalfFloat(sum[i]);Object.assign(this.stats,{active:true,degrees:[...this.angles],weights});return true;
 }
 aperture(owner,key,open,offset){if(!this.stats.active||key!==this.key)return null;return this.weights.reduce((sum,t)=>sum+t.weight*(t.degrees.every(d=>d===102)?open[offset]:(t.degrees.every(d=>d===0)?owner:this.room.children.get(t.degrees.join('-'))).fields.get(key).apertures[offset]),0);}
 dispose(){this.disposed=true;for(const r of this.rooms.values())for(const c of r.children.values())c.dispose();this.rooms.clear();Object.assign(this.stats,{active:false,ready:false,pending:false});}
}
