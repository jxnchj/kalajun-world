import * as THREE from "three";
import { floorAt } from "./slice.js";

const RAD = Math.PI / 180;

// Free-fly camera: drag to look, WASD/arrows to move, Q/E (or C/Space) down/up,
// Shift = fast, wheel = speed. Heading convention: yaw clockwise from north.
export class FlyControls {
  constructor(camera, dom, terrain) {
    this.camera = camera;
    this.dom = dom;
    this.terrain = terrain;
    this.yaw = 0;
    this.pitch = 0;
    this.roll = 0;
    this.speed = 25; // m/s near the ground
    this.minClearance = 1.6;
    this.keys = new Set();
    this.enabled = true;
    this.onUserMove = null; // callback when the user takes control

    let dragging = false, lx = 0, ly = 0;
    dom.addEventListener("pointerdown", (e) => {
      if (e.button !== 0) return;
      dragging = true; lx = e.clientX; ly = e.clientY;
      dom.setPointerCapture(e.pointerId);
    });
    dom.addEventListener("pointermove", (e) => {
      if (!dragging || !this.enabled) return;
      const k = (this.camera.fov / dom.clientHeight) * 1.2;
      this.yaw += (e.clientX - lx) * k;     // (the view goes the way the hand goes: right is right, up is up)
      this.pitch -= (e.clientY - ly) * k;
      this.pitch = Math.max(-89, Math.min(89, this.pitch));
      if (e.clientX !== lx || e.clientY !== ly) this._userMoved();
      lx = e.clientX; ly = e.clientY;
    });
    dom.addEventListener("pointerup", () => (dragging = false));
    dom.addEventListener("wheel", (e) => {
      e.preventDefault();
      this.speed = Math.min(2000, Math.max(2, this.speed * (e.deltaY > 0 ? 0.85 : 1.18)));
    }, { passive: false });
    window.addEventListener("keydown", (e) => {
      if (e.target.tagName === "INPUT") return;
      this.keys.add(e.code);
      if (/^(Key[WASDQEC]|Arrow|Space)/.test(e.code)) this._userMoved();
    });
    window.addEventListener("keyup", (e) => this.keys.delete(e.code));
    window.addEventListener("blur", () => this.keys.clear());
  }

  _userMoved() {
    if (this.roll !== 0) this.roll = 0;
    if (this.onUserMove) this.onUserMove();
  }

  setPose(pos, yaw, pitch, roll = 0) {
    this.camera.position.copy(pos);
    this.yaw = yaw; this.pitch = pitch; this.roll = roll;
    this.apply();
  }

  apply() {
    this.camera.rotation.set(this.pitch * RAD, -this.yaw * RAD, this.roll * RAD, "YXZ");
    this.camera.updateMatrixWorld();
  }

  heightAboveGround() {
    const p = this.camera.position;
    return p.y - this.terrain.heightAt(p.x, p.z);
  }

  update(dt) {
    if (this.enabled) {
      const k = this.keys;
      const f = (k.has("KeyW") || k.has("ArrowUp") ? 1 : 0) - (k.has("KeyS") || k.has("ArrowDown") ? 1 : 0);
      const r = (k.has("KeyD") || k.has("ArrowRight") ? 1 : 0) - (k.has("KeyA") || k.has("ArrowLeft") ? 1 : 0);
      const u = (k.has("KeyE") || k.has("Space") ? 1 : 0) - (k.has("KeyQ") || k.has("KeyC") ? 1 : 0);
      if (f || r || u) {
        const above = Math.max(0, this.heightAboveGround());
        const v = this.speed * (1 + above / 60) * (k.has("ShiftLeft") || k.has("ShiftRight") ? 5 : 1) * dt;
        const y = this.yaw * RAD, p = this.pitch * RAD;
        const fwd = new THREE.Vector3(Math.sin(y) * Math.cos(p), Math.sin(p), -Math.cos(y) * Math.cos(p));
        const right = new THREE.Vector3(Math.cos(y), 0, Math.sin(y));
        this.camera.position.addScaledVector(fwd, f * v).addScaledVector(right, r * v);
        this.camera.position.y += u * v;
      }
    }
    // stay above ground and inside the world
    const p = this.camera.position;
    const lim = this.terrain.far.half - 500;
    p.x = Math.max(-lim, Math.min(lim, p.x));
    p.z = Math.max(-lim, Math.min(lim, p.z));
    let g = this.terrain.heightAt(p.x, p.z);
    const floor = floorAt(p.x, p.z); // porches and decks are walkable
    if (floor > g && p.y > floor - 1.0) g = floor;
    g += this.minClearance;
    if (p.y < g) p.y = g;
    this.apply();
  }
}
