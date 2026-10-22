import * as THREE from "three";
import { AnimalKind } from "./animals.js";

// Birds of prey over the valley: golden eagles circling high over the ridges, black kites lower over the
// camps (the same model, smaller and darker: the brief, docs/animals/aholo_animals_brief.md). Each circles in
// a thermal -- banked into the turn, climbing slowly -- now and then gives a few wingbeats, and every minute
// or two leaves on a long glide to another thermal (flapping at first). The model of
// tools/blender/animal.py (eagle: glide, flap, flap_fast), drawn by web/src/animals.js.

const G = 9.81;
const KINDS = {
  eagle: { n: 2, size: [0.95, 0.12], coat: [0, 1], speed: 11, radius: [45, 90], above: [150, 350], range: [300, 3200] },
  kite: { n: 3, size: [0.66, 0.06], coat: [2, 2, 3], speed: 8, radius: [30, 55], above: [60, 150], range: [80, 700] },
};
const LOD = [[0, 0, 40, 60], [40, 60, 170, 210], [170, 210, 0, 0]];

function rnd(seed) {
  let s = seed >>> 0 || 1;
  return () => ((s = Math.imul(s, 1664525) + 1013904223 >>> 0) / 4294967296);
}

export class Raptors {
  constructor(gltf, terrain, home) {
    this.terrain = terrain;
    this.home = home;
    this.anim = new AnimalKind(gltf, "eagle", { lod: LOD, terrain: false });
    this.group = this.anim.group;
    this.lists = [[], [], []];
    const r = rnd(4242);
    this.birds = [];
    for (const [kind, K] of Object.entries(KINDS)) {
      for (let i = 0; i < K.n; i++) {
        const b = { kind, K, size: K.size[0] + r() * K.size[1], coat: K.coat[i % K.coat.length], dir: r() < 0.5 ? 1 : -1,
          th: r() * 6.283, clip: "glide", ct: r() * 4, prev: null, pt: 0, bl: 1, flaps: 0, nextFlap: 5 + r() * 30, pitch: 0, roll: 0 };
        this.newThermal(b, r);
        b.alt = b.top - r() * 60;
        b.state = "circle"; b.t = 30 + r() * 90;
        b.x = b.cx + Math.cos(b.th) * b.rad; b.z = b.cz + Math.sin(b.th) * b.rad;
        b.yaw = Math.atan2(-Math.sin(b.th) * b.dir, Math.cos(b.th) * b.dir);   // along the circle
        this.place(b, 0);
        this.birds.push(b);
      }
    }
    this.r = r;
  }

  newThermal(b, r = this.r) {
    const K = b.K, a = r() * 6.283, d = K.range[0] + r() * (K.range[1] - K.range[0]);
    b.cx = this.home.x + Math.cos(a) * d; b.cz = this.home.z + Math.sin(a) * d;
    b.rad = K.radius[0] + r() * (K.radius[1] - K.radius[0]);
    b.top = this.terrain.heightAt(b.cx, b.cz) + K.above[0] + r() * (K.above[1] - K.above[0]);
  }

  place(b, dt) {
    const v = b.K.speed * (0.9 + 0.2 * b.size);
    if (b.state === "circle") {
      b.th += (v / b.rad) * b.dir * dt;
      const x = b.cx + Math.cos(b.th) * b.rad, z = b.cz + Math.sin(b.th) * b.rad;
      if (dt > 0) b.yaw = Math.atan2(x - b.x, z - b.z);
      b.x = x; b.z = z;
      b.alt = Math.min(b.top, b.alt + 0.6 * dt);                     // the thermal lifts it
      const bank = Math.atan((v * v) / (G * b.rad));
      b.roll += (b.dir * bank - b.roll) * Math.min(1, dt * 1.5);    // into the turn
    } else {                                                          // a glide to the next thermal
      const dx = b.cx - b.x, dz = b.cz - b.z, d = Math.hypot(dx, dz);
      const want = Math.atan2(dx, dz);
      const dy = Math.atan2(Math.sin(want - b.yaw), Math.cos(want - b.yaw));
      b.yaw += dy * Math.min(1, dt * 0.4);
      b.roll += (-Math.max(-0.4, Math.min(0.4, dy)) - b.roll) * Math.min(1, dt * 1.5);
      b.x += Math.sin(b.yaw) * v * 1.3 * dt; b.z += Math.cos(b.yaw) * v * 1.3 * dt;
      b.alt -= 0.9 * dt;                                              // sinking as it glides
      const floor = this.terrain.heightAt(b.x, b.z) + b.K.above[0] * 0.6;
      if (b.alt < floor) b.alt = floor;
      if (d < b.rad) {
        b.state = "circle"; b.t = 50 + this.r() * 100;
        b.th = Math.atan2(b.z - b.cz, b.x - b.cx);
      }
    }
    b.y = b.alt;
  }

  setClip(b, name) {
    if (b.clip === name) return;
    b.prev = b.clip; b.pt = b.ct; b.clip = name; b.ct = 0; b.bl = 0;
  }

  update(dt, camera) {
    const A = this.anim;
    for (const l of this.lists) l.length = 0;
    for (const b of this.birds) {
      b.t -= dt;
      if (b.state === "circle" && b.t < 0) {   // off to another thermal, flapping to begin with
        this.newThermal(b);
        b.state = "cruise";
        b.flaps = 6 + Math.floor(this.r() * 6);
      }
      b.nextFlap -= dt;
      if (b.nextFlap < 0 && b.flaps === 0) { b.flaps = 3 + Math.floor(this.r() * 4); b.nextFlap = 20 + this.r() * 40; }
      if (b.flaps > 0) {
        const name = b.kind === "kite" ? "flap_fast" : "flap";
        this.setClip(b, name);
        const T = A.duration(name);
        if (b.ct >= T) { b.ct -= T; b.flaps--; if (b.flaps === 0) this.setClip(b, "glide"); }
      }
      this.place(b, dt);
      b.ct += dt; b.pt += dt;
      if (b.bl < 1) b.bl = Math.min(1, b.bl + dt / 0.3);
      if (camera) {
        const c = camera.position;
        A.levels(Math.hypot(b.x - c.x, b.z - c.z, b.y - c.y), (li) => this.lists[li].push(b));
      }
    }
    this.lists.forEach((l, li) => A.draw(li, l));
    if (camera) A.eye.value.copy(camera.position);
  }
}
