import { Vector3 } from "three";
import { floorClearance } from "./viewpoints.js";
const rad = Math.PI / 180;
export const CONTROL_STEP=1/60,CONTROL_MAX_STEPS=15;
export class WorldControls {
  constructor(camera, canvas, world) {
    Object.assign(this, {camera, canvas, world});
    this.physicsPosition=camera.position.clone();this.previousPosition=camera.position.clone();this.renderedPosition=camera.position.clone();this.accumulator=0;this.suspended=false;this.moveVector=new Vector3();
    this.stats={steps:0,lastSteps:0,droppedSeconds:0,resets:0,stepSeconds:CONTROL_STEP,maxCatchupSeconds:CONTROL_STEP*CONTROL_MAX_STEPS};
    this.keys = new Set(); this.yaw = 0; this.pitch = 0; this.speed = 14; this.drag = null;
    this.mode="flight";this.modePending=false;this.modeEpoch=0;this.disposed=false;this.controller = new AbortController(); const signal = this.controller.signal;
    const editable = e => e.target?.isContentEditable||/INPUT|TEXTAREA|SELECT|BUTTON/.test(e.target?.tagName??"");
    const panel=globalThis.document?.querySelector("#world-panel details");if(panel){this.modeButton=document.createElement("button");this.modeButton.id="movement-mode";this.modeButton.type="button";this.modeButton.style.cssText="border:0;border-top:1px solid #ffffff26;background:none;padding:12px 0;width:100%;text-align:left;font-size:11px";this.modeButton.title="步行：WASD 移动，C 蹲行过低门。木屋、毡房与溪岸大石支持实体阻挡；自由飞行用于空中观察";this.modeButton.addEventListener("click",()=>this.setMode(this.mode==="walk"?"flight":"walk").catch(error=>{this.modeButton.textContent=error.message;this.modeButton.title=error.message;}),{signal});panel.append(this.modeButton);this.renderMode();}
    canvas.addEventListener("pointerdown", e => {if(e.button !== 0)return;this.drag = [e.clientX,e.clientY];canvas.setPointerCapture(e.pointerId);}, {signal});
    canvas.addEventListener("pointermove", e => {if(!this.drag)return;if(e.clientX!==this.drag[0]||e.clientY!==this.drag[1])this.seating?.takeLookControl();this.yaw += (e.clientX-this.drag[0]) * .16;this.pitch = Math.max(-85,Math.min(85,this.pitch-(e.clientY-this.drag[1])*.16));this.drag=[e.clientX,e.clientY];this.apply();}, {signal});
    const release = () => this.drag = null;
    canvas.addEventListener("pointerup",release,{signal});canvas.addEventListener("pointercancel",release,{signal});
    canvas.addEventListener("wheel",e=>{e.preventDefault();this.speed=Math.min(900,Math.max(2,this.speed*Math.exp(-e.deltaY*.0015)));},{signal,passive:false});
    window.addEventListener("keydown",e=>{if(editable(e))return;if(["Space","ArrowUp","ArrowDown","ArrowLeft","ArrowRight"].includes(e.code))e.preventDefault();this.keys.add(e.code);},{signal});
    window.addEventListener("keyup",e=>this.keys.delete(e.code),{signal});
    window.addEventListener("blur",()=>{this.keys.clear();release();this.suspended=true;this.resetClock(true);},{signal});
    window.addEventListener("focus",()=>{this.suspended=false;this.resetClock(true);},{signal});
    globalThis.document?.addEventListener?.("visibilitychange",()=>{this.keys.clear();release();this.suspended=globalThis.document.hidden;this.resetClock(true);},{signal});
  }
  renderMode(){const help=globalThis.document?.querySelector("footer .help");if(help)help.textContent=this.mode==="walk"?"拖动画面环视 · WASD 步行 · C 蹲行 · F 开关门 · Shift 加速":"拖动画面环视 · WASD 飞行 · Q / E 升降 · Shift 加速 · 滚轮调速";if(this.modeButton){this.modeButton.disabled=this.modePending||!this.collision;this.modeButton.textContent=this.modePending?"准备步行碰撞…":this.mode==="walk"?"步行探索 · C 蹲行（切换自由飞行）":"自由飞行 · 切换步行探索";}}
  setCollision(collision){this.collision=collision;this.renderMode();return this;}
  async setMode(mode){if(!["flight","walk"].includes(mode))throw new Error("Unknown movement mode");if(this.modePending||this.disposed)return false;if(mode===this.mode)return true;this.keys.clear();this.resetClock(true);const epoch=++this.modeEpoch;if(mode==="walk"){if(!this.collision)throw new Error("碰撞资产尚未准备好");this.modePending=true;this.renderMode();try{const ready=await this.collision.enable(this.camera.position);if(!ready||epoch!==this.modeEpoch||this.disposed)return false;this.mode="walk";this.resetClock(false);}finally{if(epoch===this.modeEpoch){this.modePending=false;this.renderMode();}}}else{this.seating?.cancel();this.collision?.disable();this.mode="flight";this.renderMode();}return true;}
  setPose(x,z,above,yaw,pitch,y){this.seating?.cancel();this.modeEpoch++;if(this.mode==="walk"||this.modePending){this.collision?.disable();this.mode="flight";this.modePending=false;this.renderMode();}this.keys.clear();this.camera.position.set(x,Number.isFinite(y)?y:this.world.surface.heightAt(x,z)+above,z);this.yaw=yaw;this.pitch=pitch;this.resetClock(false);this.apply();}
  apply(){this.camera.rotation.set(this.pitch*rad,-this.yaw*rad,0,"YXZ");this.camera.updateMatrixWorld();}
  // A render camera lags at most one fixed step. It never becomes the next
  // collision input: the independent physics position owns integration.
  resetClock(snap=false){if(snap)this.camera.position.copy(this.physicsPosition);this.accumulator=0;this.physicsPosition.copy(this.camera.position);this.previousPosition.copy(this.physicsPosition);this.renderedPosition.copy(this.camera.position);this.stats.lastSteps=0;this.stats.resets++;}
  update(dt) {
    if(this.disposed)return;
    // Respect explicit external camera moves without integrating from a stale body.
    if(!this.camera.position.equals(this.renderedPosition))this.resetClock(false);
    const modal=!!globalThis.document?.querySelector?.("dialog[open]");
    if(modal){this.keys.clear();this.modalPaused=true;this.resetClock(true);return;}
    if(this.modalPaused){this.modalPaused=false;this.keys.clear();this.resetClock(true);return;}
    if(this.modePending||this.suspended||globalThis.document?.hidden){this.keys.clear();this.resetClock(true);return;}
    if(!Number.isFinite(dt)||dt<0){this.resetClock(true);return;}
    const allowed=Math.min(dt,CONTROL_STEP*CONTROL_MAX_STEPS);
    this.stats.droppedSeconds+=dt-allowed;this.accumulator+=allowed;
    let steps=0,moved=false;
    while(this.accumulator+1e-12>=CONTROL_STEP&&steps<CONTROL_MAX_STEPS){
      this.previousPosition.copy(this.physicsPosition);moved=this.fixedStep(CONTROL_STEP)||moved;
      this.accumulator=Math.max(0,this.accumulator-CONTROL_STEP);steps++;
    }
    // Bounds above prevent persistent debt; tolerate only a substep remainder.
    if(this.accumulator>=CONTROL_STEP){const keep=this.accumulator%CONTROL_STEP;this.stats.droppedSeconds+=this.accumulator-keep;this.accumulator=keep;}
    this.stats.steps+=steps;this.stats.lastSteps=steps;
    this.camera.position.lerpVectors(this.previousPosition,this.physicsPosition,this.accumulator/CONTROL_STEP);
    this.renderedPosition.copy(this.camera.position);this.apply();if(moved)this.onMove?.();
  }
  fixedStep(dt) {
    if(this.seating?.active)return this.seating.step(dt);
    const k=this.keys, f=Number(k.has("KeyW")||k.has("ArrowUp"))-Number(k.has("KeyS")||k.has("ArrowDown"));
    const r=Number(k.has("KeyD")||k.has("ArrowRight"))-Number(k.has("KeyA")||k.has("ArrowLeft"));
    const u=Number(k.has("KeyE")||k.has("Space"))-Number(k.has("KeyQ"));
    const p=this.physicsPosition,a=this.yaw*rad;
    if(this.mode==="walk"){
      const speed=(k.has("KeyC")?1.4:2.8)*(k.has("ShiftLeft")||k.has("ShiftRight")?1.7:1);
      const move=this.moveVector.set(f*Math.sin(a)+r*Math.cos(a),0,-f*Math.cos(a)+r*Math.sin(a)).normalize().multiplyScalar(speed*dt);
      this.collision.move(p,move,dt,{crouch:k.has("KeyC")});return !!(f||r);
    }
    if(!f&&!r&&!u)return false;
    const above=Math.max(0,p.y-this.world.surface.heightAt(p.x,p.z));
    const floor=this.floorAt?.(p.x,p.z),baseSpeed=Number.isFinite(floor)&&p.y-floor<3.4?Math.min(this.speed,2.8):this.speed;
    const v=baseSpeed*Math.min(25,1+above/90)*(k.has("ShiftLeft")||k.has("ShiftRight")?4:1)*dt;
    const b=this.pitch*rad,move=this.moveVector.set(f*Math.sin(a)*Math.cos(b)+r*Math.cos(a),f*Math.sin(b)+u,-f*Math.cos(a)*Math.cos(b)+r*Math.sin(a)).normalize().multiplyScalar(v);
    p.add(move);const edge=this.world.meta.far.size/2-100;
    p.x=Math.max(-edge,Math.min(edge,p.x));p.z=Math.max(-edge,Math.min(edge,p.z));
    p.y=Math.max(floorClearance(this.world,this.floorAt,p.x,p.z),Math.min(12000,p.y));return true;
  }
  dispose(){this.seating?.dispose();this.disposed=true;this.modeEpoch++;this.collision?.disable();this.controller.abort();this.modeButton?.remove();}
}
