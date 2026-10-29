import {DataUtils,MathUtils} from 'three';
import {guestDoorsEnabled41,GUEST_DOORS41} from './guest-doors41.js';
import {prepareGuestLivingRoom,isGuestLivingRoomKey} from './guest-living-gi.js';
import {RoomDoorTransport} from './room-door-transport.js';
import {RoomFixtureTransport} from './room-fixture-transport.js';
const loaders={
 '1-0':()=>import('./guest-door-data41/1-0.js'), '1-51':()=>import('./guest-door-data41/1-51.js'),
 '2-0':()=>import('./guest-door-data41/2-0.js'), '2-51':()=>import('./guest-door-data41/2-51.js'),
 '3-0':()=>import('./guest-door-data41/3-0.js'), '3-51':()=>import('./guest-door-data41/3-51.js'),
};
export function validateGuestDoorGI41(data,base,degree){
 const index=base.key.match(/freedom-(\d)/)[1];
 if(data.key!==base.key||data.degrees!==degree||data.doorName!==`gh_lanchuan_door${index}`||Math.abs(data.openEuler?.[2]-GUEST_DOORS41.open)>1e-6||Math.abs(data.bakedEuler?.[2]+degree*Math.PI/180)>1e-6)throw Error('Guest door GI pose/source identity differs');
 for(const name of ['sky','secondSky','solar','secondSolar','fixtures','secondFixtures','apertures'])for(const prop of ['sourceGLB','sourceSHA256','sourceBlend','blendSHA256','bounds','size','openings','validProbes'])if(JSON.stringify(data[name]?.[prop])!==JSON.stringify(base[name][prop]))throw Error('Guest door GI source/grid differs: '+name+'/'+prop);
 if(data.sky.samples!==96||data.secondSky.surfaceSamples!==32||data.secondSolar.surfaceSamples!==32||data.solar.directions.length!==81||data.secondSolar.directions.length!==81||data.apertures.apertureSamples!==36)throw Error('Guest door GI sampling differs');
 for(const[name,order]of [['fixtures',1],['secondFixtures',2]])if(data[name].bounceOrder!==order||data[name].fixtures.length!==3||data[name].directions.length!==3||JSON.stringify(data[name].fixtures)!==JSON.stringify(base[name].fixtures))throw Error('Guest door fixture source/order differs');return data;
}
export class GuestDoorGI41{
 constructor({enabled=guestDoorsEnabled41()}={}){this.enabled=enabled;this.rooms=new Map();this.leaves=null;this.key=null;this.disposed=false;this.stats={enabled,active:false,ready:false,pending:false,key:null,model:'source-bound 0/51/102 degree guest door, sky/solar/fixture two diffuse orders; static finite interpolation',extraGPUTextures:0};}
 setState(leaves){this.leaves=leaves;if(!leaves)this.clearActive();}
 supports(key){if(!this.enabled||!isGuestLivingRoomKey(key))return false;const name='gh_lanchuan_door'+key.match(/freedom-(\d)/)[1],leaf=this.leaves?.find(l=>l.name===name);if(!leaf||!Number.isFinite(leaf.angle)||Math.abs(leaf.open-GUEST_DOORS41.open)>1e-6||leaf.angle>1e-6)return false;this.degree=MathUtils.clamp(-leaf.angle*180/Math.PI,0,102);return true;}
 get signature(){return `${this.leaves?.map(l=>l.name+':'+l.angle).join('|')}|${this.rooms.get(this.key)?.ready}`;}
 prepare(key){if(!this.enabled||!isGuestLivingRoomKey(key))return Promise.resolve();if(this.rooms.has(key))return this.rooms.get(key).pending;const room={ready:false,states:new Map()};this.rooms.set(key,room);this.stats.pending=true;
  room.pending=prepareGuestLivingRoom(key).then(async base=>{const index=key.match(/freedom-(\d)/)[1];await Promise.all([0,51].map(async degree=>{const b=validateGuestDoorGI41((await loaders[index+'-'+degree]()).default,base,degree),transport=new RoomDoorTransport({loaders:{[key]:()=>Promise.resolve(b)}}),fixtures=new RoomFixtureTransport({loaders:{[key]:()=>Promise.resolve(b.fixtures)}}),secondFixtures=new RoomFixtureTransport({bounceOrder:2,loaders:{[key]:()=>Promise.resolve(b.secondFixtures)}});await Promise.all([transport.prepare(key),fixtures.prepare(key),secondFixtures.prepare(key)]);if(this.disposed){transport.dispose();fixtures.dispose();secondFixtures.dispose();return;}room.states.set(degree,{transport,fixtures,secondFixtures});}));if(!this.disposed)room.ready=true;}).catch(e=>{room.error=e;throw e;});return room.pending;
 }
 compose(key,output,normal,lighting,daylight,scale,sky,sun,second,context,fixtureWeight,fixtureSecondWeight){
  this.clearActive();if(!this.supports(key))return false;this.key=key;const room=this.rooms.get(key);Object.assign(this.stats,{key,ready:!!room?.ready,pending:!room?.ready});if(room?.error)throw room.error;
  if(!room?.ready){for(let i=0;i<output.length;i++)if(i%4!==3)output[i]=0;return true;}
  const d=this.degree,lo=d<=51?0:51,hi=d<=51?51:102,w=(d-lo)/(hi-lo);this.bracket={lo,hi,weight:w};
  if(scale<=0){for(let i=0;i<output.length;i++)if(i%4!==3)output[i]=0;Object.assign(this.stats,{active:true,degree:d,bracket:this.bracket});return true;}
  if(this.original?.length!==output.length){this.original=new Uint16Array(output.length);this.a=new Uint16Array(output.length);this.b=new Uint16Array(output.length);}this.original.set(output);
  const at=(degree,dst)=>{dst.set(this.original);if(degree===102)return;const s=room.states.get(degree);s.transport.compose(key,dst,normal,lighting,daylight,scale,sky,sun,second,0);s.fixtures.add(key,dst,s.fixtures.state(key,context,fixtureWeight),scale);s.secondFixtures.add(key,dst,s.secondFixtures.state(key,context,fixtureWeight*fixtureSecondWeight),scale);};
  at(lo,this.a);at(hi,this.b);for(let i=0;i<output.length;i++)if(i%4!==3)output[i]=w===0?this.a[i]:w===1?this.b[i]:DataUtils.toHalfFloat(MathUtils.lerp(DataUtils.fromHalfFloat(this.a[i]),DataUtils.fromHalfFloat(this.b[i]),w));Object.assign(this.stats,{active:true,degree:d,bracket:this.bracket});return true;
 }
 aperture(key,open,offset){if(!this.supports(key))return null;const room=this.rooms.get(key);if(!room?.ready)return 0;if(!this.stats.active||key!==this.key)return null;const b=this.bracket,at=d=>d===102?open[offset]:room.states.get(d).transport.fields.get(key).apertures[offset];return MathUtils.lerp(at(b.lo),at(b.hi),b.weight);}
 clearActive(){Object.assign(this.stats,{active:false,ready:false,pending:false,key:null,degree:null,bracket:null});this.bracket=null;}
 dispose(){this.disposed=true;for(const r of this.rooms.values())for(const s of r.states.values()){s.transport.dispose();s.fixtures.dispose();s.secondFixtures.dispose();}this.rooms.clear();this.clearActive();}
}
