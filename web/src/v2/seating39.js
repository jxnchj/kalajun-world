import * as THREE from 'three';
import source from './generated/seating-39.json' with {type:'json'};
import {lodgeTablesEnabled} from './lodge-tables-definition.js';
export const seating39Enabled=()=>new URLSearchParams(globalThis.location?.search||'').get('seating39')!=='0';
export const SEATED_BODY39=Object.freeze({radius:.22,height:.88,eye:.78});
export function representativeSeats39(world){return source.seats.flatMap(s=>{if(s.kind==='lodge'&&!lodgeTablesEnabled())return[];const e=world.entities.find(e=>e.id===s.entityId);if(!e)return[];const p=world.surface.buildingPose(e),m=new THREE.Matrix4().compose(new THREE.Vector3(p.x,p.y,p.z),new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0,1,0),p.rot),new THREE.Vector3(p.scale.x,p.scale.y,p.scale.z));return[{...s,position:new THREE.Vector3(...s.localSeat).applyMatrix4(m),front:new THREE.Vector3(...s.localFront).transformDirection(m)}];});}
// First-person upper-body capsule only. The furniture and all room colliders
// remain present throughout shrink, swept approach, lowering, and return.
export class Seating39{
 constructor(world,controls,collision,{enabled=seating39Enabled()}={}){Object.assign(this,{world,controls,collision,enabled});this.seats=representativeSeats39(world);this.state='idle';this.stats={enabled,state:'idle',seat:null,blocked:null,sweeps:0,model:'first-person seated upper-body capsule; no leg skeleton'};if(enabled)controls.seating=this;}
 get active(){return this.state!=='idle';}
 canApproach(seat){
  const p=this.controls.physicsPosition,dy=p.y-seat.position.y;
  // Standing eyes above the authored cushion, not another storey or a flying
  // observer. Shared walking eye is 1.55m; actual seats are .355/.530m high.
  if(!Number.isFinite(this.controls.yaw)||dy<.78||dy>1.52)return false;
  const delta=p.clone().sub(seat.position);delta.y=0;const distance=delta.length();
  if(distance>=1.25||distance<.28||delta.dot(seat.front)<=.28)return false;
  const yaw=this.controls.yaw*Math.PI/180,look=new THREE.Vector3(Math.sin(yaw),0,-Math.cos(yaw));
  return look.dot(delta.multiplyScalar(-1/distance))>=Math.cos(65*Math.PI/180);
 }
 nearest(){if(!this.enabled||this.active||this.controls.mode!=='walk'||this.collision.crouching)return null;const p=this.controls.physicsPosition;return this.seats.filter(s=>this.canApproach(s)).sort((a,b)=>a.position.distanceToSquared(p)-b.position.distanceToSquared(p))[0]??null;}

 setState(state){this.state=state;this.stats.state=state;}
 toggle(){if(this.state==='seated')return this.stand();if(this.state==='idle')return this.sit(this.nearest());return false;}
 sit(seat){if(!this.enabled||!seat||!this.seats.includes(seat)&&!this.seats.some(s=>s.id===seat.id&&s.entityId===seat.entityId)||this.controls.mode!=='walk'||!this.collision.enabled||this.active)return false;const p=this.controls.physicsPosition,c=this.collision;if(c.structures?.lodgeStream?.needs(p)){this.stats.blocked='目的地尚未完整';return false;}
  if(!this.canApproach(seat)){this.stats.blocked='请从座位正面靠近';return false;}
  this.returnPosition=p.clone();const eye=seat.position.clone();eye.y+=SEATED_BODY39.eye+.018;const upper=eye.clone();upper.y=Math.max(p.y,eye.y+.08);const raise=p.clone();raise.y=upper.y;const route=[raise,upper,eye];
  if(!c.seatPathClear39(p,route,SEATED_BODY39)){this.stats.blocked='接近座位的身体空间受阻';return false;}
  this.seat=seat;this.route=route;this.reverse=[upper.clone(),raise.clone(),p.clone()];this.stats.seat=seat.id;this.stats.blocked=null;c.useSeatBody39(p,SEATED_BODY39);this.controls.keys.clear();this.beginSeatTurn(seat);this.setState('sitting');return true;
 }
 beginSeatTurn(seat){
  const from=this.controls.yaw,target=Math.atan2(seat.front.x,-seat.front.z)*180/Math.PI;
  const delta=((target-from+540)%360+360)%360-180;
  this.turn={from,delta,elapsed:0,duration:1.15,expectedYaw:from,expectedPitch:this.controls.pitch};this.stats.turn='automatic';
 }
 takeLookControl(){this.turn=null;this.stats.turn='user';}
 updateSeatTurn(dt){
  const t=this.turn;if(!t)return false;
  // Any direct look input takes ownership permanently for this sitting action.
  if(Math.abs(this.controls.yaw-t.expectedYaw)>1e-7||this.controls.pitch!==t.expectedPitch){this.takeLookControl();return false;}
  t.elapsed=Math.min(t.duration,t.elapsed+dt);const u=t.elapsed/t.duration,e=u*u*(3-2*u);
  this.controls.yaw=t.from+t.delta*e;t.expectedYaw=this.controls.yaw;
  if(u===1){this.turn=null;this.stats.turn='complete';}return true;
 }
 stand(){const c=this.collision,p=this.controls.physicsPosition;if(this.state!=='seated')return false;
  if(!c.seatPathClear39(p,this.reverse,SEATED_BODY39)||c.overlaps(this.returnPosition,false)){this.stats.blocked='起身通路或头顶受阻，请清空后重试';return false;}
  this.turn=null;this.route=this.reverse.map(p=>p.clone());this.stats.blocked=null;this.setState('standing');return true;
 }
 step(dt){if(!this.active)return false;const turning=this.updateSeatTurn(dt);const c=this.collision,p=this.controls.physicsPosition;c.ensureNearby(p);if(this.state==='seated')return turning;
  const target=this.route[0],delta=target.clone().sub(p),distance=delta.length();if(distance>.00001)delta.multiplyScalar(Math.min(1,.65*dt/distance));const next=p.clone().add(delta);
  if(!c.seatPathClear39(p,[next],SEATED_BODY39)){this.stats.blocked='移动空间受阻；保持当前安全姿态';return false;}
  this.stats.sweeps++;p.copy(next);c.placeSeatBody39(p,SEATED_BODY39);if(p.distanceTo(target)<.00001)this.route.shift();
  if(!this.route.length){if(this.state==='sitting')this.setState('seated');else{if(c.overlaps(p,false)){this.stats.blocked='站立头顶受阻';this.route=[p.clone()];return false;}c.crouching=false;c.createBody(p);c.velocityY=0;this.cancel();}}
  return distance>0;
 }
 cancel(){this.turn=null;this.setState('idle');this.route=[];this.seat=null;this.stats.seat=null;this.stats.blocked=null;}
 dispose(){if(this.active&&this.collision.enabled){this.collision.disable();this.controls.mode='flight';this.controls.renderMode?.();}if(this.controls.seating===this)this.controls.seating=null;this.cancel();}
}
