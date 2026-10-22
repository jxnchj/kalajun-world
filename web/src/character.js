import * as THREE from "three";
import { stylise, loadAsset } from "./assets.js";
import { STEP } from "./physics.js";

// Third-person walking (T toggles it with the free-fly camera), steered as in World of Warcraft:
//  - the left mouse button held turns the camera round the child (the view goes the way the hand
//    goes); the right one held turns the child with the camera, to face the way it looks; both held
//    walk on; a click of the middle one (or Num Lock) walks on by itself until W or S; the wheel sets
//    the distance
//  - W / S (arrows) walk on or back (back slower, the walk played backwards, still facing ahead);
//    A / D turn the child, the camera turning with it -- with the right button held they step aside;
//    walking, the camera comes round behind again of itself
//  - Shift held runs, or walks when running is chosen (/ or the buttons, main.js); Space jumps
// The child the brain drives (kids.js) walks the old way: W toward where its "camera" faces.
// The walker follows the ground (porches and decks too), cannot climb slopes much
// steeper than ~40 degrees and wades slowly through brooks. Solid things have their real height
// (physics.js, shapes from slice.js and shrubs.js): houses, yurts, sheds, haystacks, fences,
// trunks, boulders, logs, stumps, the household things and the animals stop it; it steps up onto
// what is lower than a step (a flat stone, a thin log, the boardwalk), can jump onto what it
// reaches, and pushes slowly into thickets and among low spruce branches. Sheep and cattle step
// out of the way. It pushes the plants aside as it goes (vegetation.js springs, the grass blades
// and the shrubs through uTrail), and the trodden grass rises again over some seconds.
//
// The figure is the user's character with its Mixamo animations (assets/character.glb, built by
// tools/blender/character_mixamo.py), cross-faded by weights that follow the walker's state:
//  - standing: breathing and shifting weight; after standing still a while it looks around
//  - walk and run blended by speed, in step with the ground covered (their stride known: the
//    feet do not slide)
//  - Space: standing still, a jump with a short crouch; on the move, the running jump, which takes
//    off at once. Both take off at their clip's take-off frame, follow the physics in the air and
//    land when it lands
//  - stepping off something high: the falling pose, and a landing with the knees giving
//  - walking into something low and solid (a rock, a cart, a haystack): leaning into it, pushing
//  - C sits down on the ground / gets up; X lies down on the back / gets up; E opens or shuts the
//    door in reach (else bends to pick something up); G waves. Moving (or Space) gets up first,
//    or stops the gesture.
//  - the second set of clips (the user's commission, 2026-10-10): Q held skips along; F crouches to
//    look at a flower; R spins round, arms out; V stretches; B throws; N points far off; J talks
//    (again: stops); Z sits on the edge of a deck or a step behind (40 cm or so; again: stands up).
//    Sitting and lying breathe and look about; turning on the spot to face someone steps round
//    (turnTo: 90-degree turns, the rest eased).
//  - the face (tools/blender/face_rig.py: a jaw, the upper lip, the mouth's corners, lids; faceUpdate):
//    blinking every few seconds; the mouth moving with the words when talking (pointing, the wave's
//    "hi"), now open, now rounded, a laugh now and then; smiling waving, skipping, chasing, spinning
//    (laughing), with the other child near (the eyes narrowing with it); a wide yawn in the stretch;
//    out of breath running; the eyes shut smelling a flower and, after a while, lying on the back. The head turns to what it attends to: the other
//    child when talking, waving, standing near, looking back from pointing far off; the flower (attend).
// A model without clips is posed procedurally (ProceduralRig); until it has loaded, a stand-in walks.
//
// There are two children (kids.js): the walker and the schoolboy (assets/schoolboy.glb, built by
// tools/blender/character_schoolboy.py). Each is a Character with its own clips' measures (PROFILES);
// the one the player controls (`active`) takes the keys and leads the camera; the other plays on its
// own round 岚川 (kids.js drives its keys).

// the clips' own measures (the build scripts; assets/src/character/clips.json and
// assets/src/character/schoolboy/clips.json): metres per cycle; frames of the jumps and the landing;
// postures and gestures as stretches of a clip played from -> to (backwards if to < from), then a mode
const F = (f) => (f - 1) / 30;                 // time of frame f of the walker's Blender clips
const G = (f) => (f - 2) / 30;                 // the schoolboy's (his start at frame 2)
export const PROFILES = {
  walker: {
    model: "./assets/character.glb",
    face: { jaw: 0.36, lid: "slide", k: 1.36 },   // (face_rig.py; k: its face's size against the schoolboy's, for the lips' moves)
    speed: { walk: 1.25, run: 3.8, skip: 1.68, chase: 3.4 },
    stride: { walk: 1.023, run: 1.763, skip: 1.682, chase: 3.433 },
    ledgeEdge: 0.114,       // the edge it sits on, behind its feet (the commission's 台阶摆放说明.txt)
    jumps: {
      jump: { start: F(6), takeoff: F(17), land: F(34), end: F(52), prep: 1.6, vy: 3.4 },   // (the crouch quickened)
      rjump: { start: F(1), takeoff: F(5), land: F(19), end: F(28), prep: 1.0, vy: 3.6 },
      land: { touchdown: F(9), end: F(33) },
    },
    seq: {
      sitdown: { clip: "standup", from: F(60), to: F(1), rate: 1.25, then: "sit" },     // standing up, backwards
      standup: { clip: "standup", from: F(1), to: F(62), rate: 1.2, then: "free" },
      liedown: { clip: "liedown", from: F(1), to: F(186), rate: 1.35, then: "lie" },
      getup: { clip: "getup", from: F(1), to: F(139), rate: 1.25, then: "free" },
      pickup: { clip: "pickup", from: F(1), to: F(105), rate: 1.2, then: "free", cancel: true },
      wave: { clip: "wave", from: F(1), to: F(96), rate: 1.0, then: "free", cancel: true },
    },
  },
  // walk 0.84 m in 1.33 s, run 3.43 m in 0.93 s (measured from the planted foot: his clips are in
  // place); jump off at f9, down at f35; the running jump (a run spliced to a jump) off at f21, down
  // at f48; the landing on the ground from f2. He walks a little slower than the walker (smaller).
  schoolboy: {
    model: "./assets/schoolboy.glb",
    face: { jaw: 0.34, lid: "slide", k: 1.0, talk: 1.6, painted: true },   // (a small mouth: opens wider talking; eyes painted on, lids on the face: lidNormals)
    speed: { walk: 1.05, run: 3.6, skip: 1.1, chase: 3.5 },
    stride: { walk: 0.837, run: 3.435, skip: 1.101, chase: 3.499 },
    ledgeEdge: 0.235,
    jumps: {
      jump: { start: G(2), takeoff: G(9), land: G(35), end: G(56), prep: 1.0, vy: 3.4 },
      rjump: { start: G(15), takeoff: G(21), land: G(48), end: G(56), prep: 1.0, vy: 3.6 },
      land: { touchdown: G(2), end: G(40) },
    },
    seq: {
      sitdown: { clip: "sitdown", from: G(2), to: G(47), rate: 1.0, then: "sit" },
      standup: { clip: "standup", from: G(2), to: G(47), rate: 1.0, then: "free" },
      liedown: { clip: "liedown", from: G(2), to: G(62), rate: 1.0, then: "lie" },
      getup: { clip: "getup", from: G(2), to: G(62), rate: 1.0, then: "free" },
      pickup: { clip: "pickup", from: G(2), to: G(77), rate: 1.15, then: "free", cancel: true },
      wave: { clip: "wave", from: 0, rate: 1.0, then: "free", cancel: true },        // (WaveStanding: upright)
    },
  },
};
// the second set's clips, the same for both (each played whole: `to` left out is the clip's end);
// a turn's yaw is the way the body faces at its end (the facing then turns with it, the clip handing
// over to the standing pose at once); `anchor`: the child stays put (sat on a ledge, out of reach of
// the collisions that would push it off)
const SET2 = {
  turnL: { clip: "turnL", from: 0, rate: 1.0, then: "free", yaw: Math.PI / 2 },
  turnR: { clip: "turnR", from: 0, rate: 1.0, then: "free", yaw: -Math.PI / 2 },
  crouch: { clip: "crouch", from: 0, rate: 1.0, then: "free", cancel: true },
  spin: { clip: "spin", from: 0, rate: 1.0, then: "free", cancel: true },
  stretch: { clip: "stretch", from: 0, rate: 1.0, then: "free", cancel: true },
  point: { clip: "point", from: 0, rate: 1.0, then: "free", cancel: true },
  throw: { clip: "throw", from: 0, rate: 1.0, then: "free", cancel: true },
  ledgeDown: { clip: "ledgeDown", from: 0, rate: 1.0, then: "ledge", anchor: true, seat: 1 },
  ledgeUp: { clip: "ledgeUp", from: 0, rate: 1.0, then: "free", anchor: true, seat: -1 },
};
for (const P of Object.values(PROFILES)) P.seq = { ...SET2, ...P.seq };
const LOOPS = ["sit", "lie", "ledge", "talk"];   // modes holding a looping clip of that name
const SEAT = 0.4;                                // the ledge's height in the clips, above the feet
const wrap = (a) => Math.atan2(Math.sin(a), Math.cos(a));
const bell = (p, a, b) => (p <= a || p >= b ? 0 : Math.sin((Math.PI * (p - a)) / (b - a)));
const _q = new THREE.Quaternion(), _q2 = new THREE.Quaternion(), _q3 = new THREE.Quaternion();
const _v = new THREE.Vector3(), _v2 = new THREE.Vector3(), _v3 = new THREE.Vector3();
// how fast each clip's weight follows its target (1/s): quick into a jump, slow into lying still
const FADE = { jump: 20, rjump: 20, land: 14, fall: 6, sit: 4, lie: 3, push: 6, ledge: 6, talk: 4 };

const RAD = Math.PI / 180;
const R = 0.26;          // body radius for collisions (a child)
const TRAIL = 24;        // trodden points kept for the grass

function standIn() {
  const root = new THREE.Group();
  const M = (name, color) => new THREE.MeshStandardMaterial({ name, color: new THREE.Color(...color) });
  const coat = M("coat", [0.07, 0.1, 0.12]), skin = M("skin", [0.45, 0.3, 0.22]), boot = M("boot", [0.04, 0.03, 0.025]),
    hat = M("felt", [0.9, 0.88, 0.8]), belt = M("beltk", [0.35, 0.12, 0.06]), trousers = M("trousers", [0.1, 0.09, 0.08]);
  const add = (parent, geo, mat, x, y, z) => { const m = new THREE.Mesh(geo, mat); m.position.set(x, y, z); parent.add(m); return m; };
  const limbs = {};
  for (const s of [-1, 1]) {   // legs: pivot at the hip
    const hip = new THREE.Group(); hip.position.set(s * 0.1, 0.9, 0); root.add(hip);
    add(hip, new THREE.CapsuleGeometry(0.075, 0.62, 4, 10), trousers, 0, -0.42, 0);
    add(hip, new THREE.CapsuleGeometry(0.085, 0.14, 4, 10), boot, 0, -0.8, 0.03);
    limbs[s < 0 ? "legL" : "legR"] = hip;
  }
  add(root, new THREE.CylinderGeometry(0.2, 0.28, 0.85, 14), coat, 0, 0.98, 0);       // the long coat, flaring
  add(root, new THREE.CylinderGeometry(0.205, 0.205, 0.06, 14), belt, 0, 1.08, 0);
  add(root, new THREE.CylinderGeometry(0.1, 0.2, 0.12, 14), coat, 0, 1.45, 0);        // shoulders
  add(root, new THREE.CylinderGeometry(0.05, 0.055, 0.1, 10), skin, 0, 1.53, 0);      // neck
  add(root, new THREE.SphereGeometry(0.11, 16, 12), skin, 0, 1.65, 0.01);
  add(root, new THREE.CylinderGeometry(0.075, 0.115, 0.22, 16), hat, 0, 1.82, 0);      // kalpak: tall felt hat
  add(root, new THREE.CylinderGeometry(0.15, 0.15, 0.03, 16), hat, 0, 1.72, 0);        // its turned-up brim
  for (const s of [-1, 1]) {   // arms: pivot at the shoulder
    const sh = new THREE.Group(); sh.position.set(s * 0.23, 1.44, 0); root.add(sh);
    add(sh, new THREE.CapsuleGeometry(0.058, 0.5, 4, 10), coat, 0, -0.3, 0);
    add(sh, new THREE.SphereGeometry(0.05, 10, 8), skin, 0, -0.62, 0);
    limbs[s < 0 ? "armL" : "armR"] = sh;
  }
  stylise(root);
  return { root, limbs };
}

// Bone rotations about axes of the character's own frame (x = its left, y = up, z = forward),
// whatever the bones' local axes are: local = P^-1 * Q * P * rest, P the parent's rest world
// rotation in the character frame
class ProceduralRig {
  constructor(root) {
    this.root = root;
    root.updateMatrixWorld(true);
    const rq = root.getWorldQuaternion(new THREE.Quaternion()).invert();
    this.b = {};
    root.traverse((o) => {
      if (!o.isBone) return;
      const key = o.name.replace(/[._]/g, "");
      const P = o.parent.getWorldQuaternion(new THREE.Quaternion()).premultiply(rq);
      this.b[key] = { bone: o, rest: o.quaternion.clone(), P, Pi: P.clone().invert(), restPos: o.position.clone() };
    });
    this._q = new THREE.Quaternion();
    this._t = new THREE.Quaternion();
    this.X = new THREE.Vector3(1, 0, 0); this.Y = new THREE.Vector3(0, 1, 0); this.Z = new THREE.Vector3(0, 0, 1);
  }
  // rots: list of [axis, angle] applied in order (the first outermost)
  set(name, rots) {
    const b = this.b[name];
    if (!b) return;
    const q = this._q.identity();
    for (const [ax, a] of rots) if (a) q.multiply(this._t.setFromAxisAngle(ax, a));
    b.bone.quaternion.copy(b.Pi).multiply(q).multiply(b.P).multiply(b.rest);
  }
}

// The AI-made body's surface is faintly faceted: under the sun its normals made patches of light
// and shade over the face. They are smoothed over the surface, the vertices split at the UV seams
// welded, and only between neighbours already near alike (dot > minDot): the folds that draw the
// face -- the smile, the lids, the nostrils -- stay.
function smoothNormals(geo, iters, minDot) {
  const pos = geo.attributes.position, nor = geo.attributes.normal, idx = geo.index.array, n = pos.count;
  const ids = new Map(), wid = new Int32Array(n);
  let nw = 0;
  for (let i = 0; i < n; i++) {
    const k = `${Math.round(pos.getX(i) * 1e4)},${Math.round(pos.getY(i) * 1e4)},${Math.round(pos.getZ(i) * 1e4)}`;
    let w = ids.get(k);
    if (w === undefined) ids.set(k, (w = nw++));
    wid[i] = w;
  }
  const start = new Int32Array(nw + 1);
  for (let t = 0; t < idx.length; t += 3) for (let e = 0; e < 3; e++) { start[wid[idx[t + e]] + 1]++; start[wid[idx[t + (e + 1) % 3]] + 1]++; }
  for (let i = 0; i < nw; i++) start[i + 1] += start[i];
  const adj = new Int32Array(start[nw]), at = start.slice(0, nw);
  for (let t = 0; t < idx.length; t += 3)
    for (let e = 0; e < 3; e++) {
      const a = wid[idx[t + e]], b = wid[idx[t + (e + 1) % 3]];
      adj[at[a]++] = b; adj[at[b]++] = a;
    }
  const unit = (v) => { for (let w = 0; w < nw; w++) { const l = Math.hypot(v[w * 3], v[w * 3 + 1], v[w * 3 + 2]) || 1; v[w * 3] /= l; v[w * 3 + 1] /= l; v[w * 3 + 2] /= l; } };
  let m = new Float32Array(nw * 3);
  for (let i = 0; i < n; i++) { const w = wid[i] * 3; m[w] += nor.getX(i); m[w + 1] += nor.getY(i); m[w + 2] += nor.getZ(i); }
  unit(m);
  for (let it = 0; it < iters; it++) {
    const o = new Float32Array(nw * 3);
    for (let w = 0; w < nw; w++) {
      const x0 = m[w * 3], y0 = m[w * 3 + 1], z0 = m[w * 3 + 2];
      let x = x0, y = y0, z = z0;
      for (let k = start[w]; k < start[w + 1]; k++) {
        const j = adj[k] * 3, d = m[j] * x0 + m[j + 1] * y0 + m[j + 2] * z0;
        if (d <= minDot) continue;
        x += m[j] * d; y += m[j + 1] * d; z += m[j + 2] * d;
      }
      o[w * 3] = x; o[w * 3 + 1] = y; o[w * 3 + 2] = z;
    }
    unit(o);
    m = o;
  }
  for (let i = 0; i < n; i++) { const w = wid[i] * 3; nor.setXYZ(i, m[w], m[w + 1], m[w + 2]); }
  nor.needsUpdate = true;
}

// Painted eyes' lids (and their lash lines) lie on the face a fraction of a millimetre out: lit by
// their own normals they showed as paler patches (the face's are smoothed above). Each of their
// vertices takes the normal of the nearest vertex of the face, as it is shaded. (Not over eyes in
// sockets, the walker's: the nearest of the face there is the socket's wall.)
function lidNormals(lids, face) {
  const bp = face.attributes.position, bn = face.attributes.normal, cell = 0.004, grid = new Map();
  const key = (x, y, z) => `${Math.floor(x / cell)},${Math.floor(y / cell)},${Math.floor(z / cell)}`;
  for (let i = 0; i < bp.count; i++) {
    const k = key(bp.getX(i), bp.getY(i), bp.getZ(i));
    let a = grid.get(k);
    if (!a) grid.set(k, (a = []));
    a.push(i);
  }
  for (const geo of lids) {
    const lp = geo.attributes.position, ln = geo.attributes.normal;
    for (let i = 0; i < lp.count; i++) {
      const x = lp.getX(i), y = lp.getY(i), z = lp.getZ(i);
      const cx = Math.floor(x / cell), cy = Math.floor(y / cell), cz = Math.floor(z / cell);
      let best = Infinity, bi = -1;
      for (let dx = -1; dx <= 1; dx++) for (let dy = -1; dy <= 1; dy++) for (let dz = -1; dz <= 1; dz++) {
        for (const j of grid.get(`${cx + dx},${cy + dy},${cz + dz}`) || []) {
          const d = (bp.getX(j) - x) ** 2 + (bp.getY(j) - y) ** 2 + (bp.getZ(j) - z) ** 2;
          if (d < best) { best = d; bi = j; }
        }
      }
      if (bi >= 0) ln.setXYZ(i, bn.getX(bi), bn.getY(bi), bn.getZ(bi));
    }
    ln.needsUpdate = true;
  }
}

const A2 = { KeyF: "crouch", KeyR: "spin", KeyV: "stretch", KeyB: "throw", KeyN: "point" };   // gesture keys
export const PLAY = { run: false };   // running chosen (/, the buttons): the same whichever child is walked
const TURN = 2.6;                     // A / D: turning, radians a second

export class Character {
  constructor({ scene, camera, dom, terrain, collision, profile = "walker" }) {
    this.P = PROFILES[profile];
    this.profile = profile;
    this.present = false;    // in the scene, living (kids.js); `active`: the one the player controls
    this.others = [];        // the other children (not walked through)
    this.camera = camera;
    this.terrain = terrain;
    this.collision = collision;
    this.thicket = 0;
    this.active = false;
    this.pos = new THREE.Vector3();
    this.vel = new THREE.Vector3();
    this.facing = 0;
    this.grounded = true;
    this.phase = 0;
    this.walkAmt = 0;
    this.camYaw = 0; this.camPitch = -12; this.camDist = 4.5;
    this.camPos = new THREE.Vector3();
    this.keys = new Set();
    this.trail = [];
    const fig = standIn();
    this.figure = fig.root;
    this.limbs = fig.limbs;
    this.figure.visible = false;
    scene.add(this.figure);
    this.rig = null;
    this.idleT = 0;
    this.look = 0;
    this.anim = null;
    this.mode = "free";      // free | seq (a posture or gesture playing) | sit | lie | ledge | talk
    this.gait = "walk";      // walk | skip | chase (Shift: run)
    this.faceTo = null;      // a way to turn to, standing (turnTo)
    this.seatOff = 0; this.seatNow = 0; this.loopT = 0;
    this.seq = null;
    this.jumpState = null;   // null | "prep" | "air" | "land" | "fland" (after a fall)
    this.airT = 0; this.pushing = 0; this.idleT = 0; this.lookAt = 9; this.lookT = -1;
    loadAsset(this.P.model).then((g) => {
      const root = g.scene;
      stylise(root);
      let face = null;
      const lids = [];
      root.traverse((o) => {
        if (!o.isMesh) return;
        o.frustumCulled = false;
        if (o.geometry.attributes.position.count > 10000) { smoothNormals(o.geometry, 3, 0.6); face = o.geometry; }
        else if (/^Designer_Logic_PBR_lid/.test(o.material.name)) lids.push(o.geometry);
      });
      if (face && lids.length && this.P.face.painted) lidNormals(lids, face);
      root.visible = this.figure.visible;
      scene.remove(this.figure);
      scene.add(root);
      this.figure = root;
      if (g.animations.length) {
        const mixer = new THREE.AnimationMixer(root);
        const acts = {};
        const shifted = new Set();
        for (const clip of g.animations) {
          // the clips start at the first frame's time (1/30 s): shift them to 0 -- once per times
          // array: the tracks of one clip share them (shifting per track moved them many times over)
          const t0 = Math.min(...clip.tracks.map((t) => t.times[0]));
          for (const t of clip.tracks) {
            if (shifted.has(t.times)) continue;
            shifted.add(t.times);
            for (let i = 0; i < t.times.length; i++) t.times[i] -= t0;
          }
          clip.resetDuration();
          const a = mixer.clipAction(clip);
          a.play();
          a.setEffectiveWeight(clip.name === "idle" ? 1 : 0);
          if (clip.name !== "idle") a.timeScale = 0;   // time set by hand, in step with the walker
          acts[clip.name] = a;
        }
        const w = {};
        for (const n of Object.keys(acts)) w[n] = n === "idle" ? 1 : 0;
        this.anim = { mixer, acts, w };
        root.traverse((o) => { if (o.isBone && /Head$/.test(o.name)) this.headBone = o; });
        this.setupFace(root);
      } else this.rig = new ProceduralRig(root);
    }).catch((e) => console.warn("character model not loaded, stand-in kept", e));

    let lx = 0, ly = 0;
    this.mouse = 0;     // the buttons held (1 left, 2 right) while walked
    this.auto = false;  // walking on by itself
    this.skip = false;  // skipping along (the button; or Q held)
    const held = (e) => { this.mouse = this.active ? e.buttons & 3 : 0; };
    dom.addEventListener("contextmenu", (e) => { if (this.active) e.preventDefault(); });
    dom.addEventListener("mousedown", (e) => { if (e.button === 1 && this.active) e.preventDefault(); });   // (no autoscroll)
    dom.addEventListener("pointerdown", (e) => {
      if (!this.active) return;
      if (e.button === 1) { this.toggleAuto(); return; }
      held(e); lx = e.clientX; ly = e.clientY;
      if (dom.setPointerCapture) dom.setPointerCapture(e.pointerId);
    });
    dom.addEventListener("pointermove", (e) => {
      if (!this.active) return;
      held(e);
      if (!this.mouse) return;
      this.camYaw += (e.clientX - lx) * 0.25;
      this.camPitch = Math.max(-60, Math.min(35, this.camPitch - (e.clientY - ly) * 0.2));
      lx = e.clientX; ly = e.clientY;
    });
    window.addEventListener("pointerup", (e) => held(e));
    dom.addEventListener("wheel", (e) => { if (this.active) this.camDist = Math.min(14, Math.max(0.9, this.camDist * (e.deltaY > 0 ? 1.1 : 0.9))); }, { passive: true });
    window.addEventListener("keydown", (e) => {
      if (e.target.tagName === "INPUT" || !this.active) return;   // (the other child's keys are kids.js's)
      this.keys.add(e.code);
      if (/^(KeyW|KeyS|ArrowUp|ArrowDown)$/.test(e.code)) this.auto = false;
      if (e.repeat) return;
      if (e.code === "Slash" || e.code === "NumpadDivide") PLAY.run = !PLAY.run;
      else if (e.code === "NumLock") this.toggleAuto();
      else this.command(e.code);
    });
    window.addEventListener("keyup", (e) => { if (this.active) this.keys.delete(e.code); });
    window.addEventListener("blur", () => { if (this.active) { this.keys.clear(); this.mouse = 0; } });
  }

  // a gesture or posture by its key (the keyboard, the buttons): C sits or gets up, X lies down or
  // gets up, E a door or picking up, G waves, F R V B N the second set, J talks, Z sits on a ledge
  command(code) {
    if (!this.anim) return;
    const calm = this.grounded && this.jumpState !== "prep" && this.jumpState !== "air";
    if (code === "KeyC") {
      if (this.mode === "sit") this.play("standup");
      else if (this.mode === "free" && calm) this.play("sitdown");
    } else if (code === "KeyX") {
      if (this.mode === "lie") this.play("getup");
      else if (this.mode === "free" && calm) this.play("liedown");
    } else if (code === "KeyE" && this.mode === "free" && calm) {
      // a door within reach: open or shut it; else bend to pick something up
      const d = this.doors && this.doors.nearest(this.pos.x, this.pos.z, 2.2);
      if (d) this.doors.toggle(d); else this.play("pickup");
    }
    else if (code === "KeyG" && this.mode === "free" && calm) this.play("wave");
    else if (this.mode === "free" && calm && A2[code] && this.anim.acts[this.P.seq[A2[code]].clip]) this.play(A2[code]);
    else if (code === "KeyJ") {
      if (this.mode === "talk") this.mode = "free";
      else if (this.mode === "free" && calm && this.anim.acts.talk) this.mode = "talk";
    } else if (code === "KeyZ") {
      if (this.mode === "ledge") this.play("ledgeUp");
      else if (this.mode === "free" && calm && this.anim.acts.ledgeDown) { const L = this.findLedge(); if (L) this.sitLedge(L); }
    }
  }

  // a key pressed for a moment (a button: Space, a jump)
  pulse(code, ms = 150) {
    this.keys.add(code);
    setTimeout(() => this.keys.delete(code), ms);
  }

  // walking on by itself (getting up first)
  toggleAuto() {
    this.auto = !this.auto;
    if (this.auto) this.wake();
  }

  // the camera behind the child again, level
  behind() {
    this.camYaw = -this.facing / RAD;
    this.camPitch = -12;
  }

  // in the scene at (x, z), facing that way, living on its own until controlled
  place(x, z, facing = 0) {
    this.pos.set(x, this.groundAt(x, z), z);
    this.vel.set(0, 0, 0);
    this.facing = facing;
    this.present = true;
    this.figure.visible = true;
    this.visY = this.pos.y;
    this.trail.length = 0;
  }

  // take control: where the child is, the camera coming round behind; from the air (T) a child far
  // away (or not yet in the scene) is brought to the ground a few metres ahead of the camera instead,
  // switching (Tab) the camera always goes to the child
  take(here = false) {
    const c = this.camera.position;
    if (!this.present || (!here && Math.hypot(this.pos.x - c.x, this.pos.z - c.z) > 150)) { this.enter(); return; }
    this.keys.clear();
    this.camYaw = -this.facing / RAD;
    this.camPos.copy(c);
    this.active = true;
  }

  // walk from where the camera looks: the ground a few metres ahead of it
  enter() {
    const c = this.camera.position, d = new THREE.Vector3();
    this.camera.getWorldDirection(d);
    d.y = 0; d.normalize();
    const x = c.x + d.x * 5, z = c.z + d.z * 5;
    this.pos.set(x, this.groundAt(x, z), z);
    this.vel.set(0, 0, 0);
    this.facing = Math.atan2(d.x, d.z);
    this.camYaw = Math.atan2(-d.x, d.z) / RAD;
    this.camPos.copy(c);
    this.trail.length = 0;
    this.active = true;
    this.present = true;
    this.keys.clear();
    this.figure.visible = true;
    this.visY = this.pos.y;
  }

  // let go: the child stays and plays on its own (kids.js)
  exit() {
    this.active = false;
    this.keys.clear();
    this.mouse = 0;
    this.auto = false;
    this.skip = false;
  }

  // the ground (porches, floors, steps and the rest of the houses: physics.js support)
  groundAt(x, z) {
    return this.terrain.heightAt(x, z);
  }

  // is the point inside something solid (for the camera); list: the shapes round the camera line
  blocked(q, list) {
    return this.collision.inside(q, list);
  }

  // start a posture or gesture (SEQ)
  play(name) {
    const S = this.P.seq[name];
    const A = this.anim && this.anim.acts[S.clip];
    this.seq = { ...S, name, t: S.from, to: S.to ?? (A ? A.getClip().duration - 1e-3 : 1) };
    this.faceTo = null;
    this.mode = "seq";
    this.jumpState = null;
  }

  // a move key or Space: sitting or lying, get up first; a gesture stops
  wake() {
    if (this.mode === "sit") this.play("standup");
    else if (this.mode === "lie") this.play("getup");
    else if (this.mode === "ledge") this.play("ledgeUp");
    else if (this.mode === "talk") this.mode = "free";
    else if (this.mode === "seq" && this.seq.cancel) { this.mode = "free"; this.seq = null; }
  }

  // turn to face the way `a` (radians, as `facing`), standing: past ~55 degrees step round with a
  // 90-degree turn, then the rest eased; true once facing it
  turnTo(a) {
    const d = wrap(a - this.facing);
    if (Math.abs(d) < 0.12) { this.faceTo = null; return true; }
    if (this.mode !== "free" || this.jumpState) return false;
    if (Math.abs(d) > 0.95 && this.anim && this.anim.acts.turnL) { this.play(d > 0 ? "turnL" : "turnR"); return false; }
    this.faceTo = a;
    return false;
  }

  // a ledge to sit on round the child: an edge 30-50 cm above its feet, at least 35 cm deep and open
  // above, within `reach` m, with room to stand before it; {a: the way to it, d: how far, h: its
  // height, ex, ez: the edge point}, the nearest (the scan in 2 cm steps: the nearest is square to it)
  findLedge(x = this.pos.x, z = this.pos.z, feet = this.pos.y, reach = 0.9) {
    const C = this.collision;
    if (!C) return null;
    const list = C.near(x, z, reach + 1.2).slice();
    const top = (px, pz) => {
      if (!C.solidAt(px, feet + 0.28, feet + 0.3, pz, list) || C.solidAt(px, feet + 0.54, feet + 1.3, pz, list)) return null;
      let h = 0.29;
      while (h < 0.53 && C.solidAt(px, feet + h + 0.01, feet + h + 0.03, pz, list)) h += 0.02;
      return h;
    };
    let best = null;
    for (let i = 0; i < 24; i++) {
      const a = (i / 24) * 2 * Math.PI, sx = Math.sin(a), sz = Math.cos(a);
      for (let d = 0.02; d <= reach && (!best || d < best.d); d += 0.02) {
        if (C.solidAt(x + sx * d, feet + 0.05, feet + 0.27, z + sz * d, list) && !C.solidAt(x + sx * d, feet + 0.28, feet + 0.6, z + sz * d, list)) break;   // (a low step in the way)
        const h = top(x + sx * d, z + sz * d);
        if (h === null) continue;
        const h2 = top(x + sx * (d + 0.35), z + sz * (d + 0.35));
        if (h2 !== null && Math.abs(h2 - h) < 0.06 && !C.solidAt(x + sx * (d + 0.25), feet + h + 0.1, feet + h + 1.0, z + sz * (d + 0.25), list))
          best = { a, d, h, ex: x + sx * d, ez: z + sz * d };
        break;
      }
    }
    return best && this.standFree(best, feet, list) ? best : null;
  }

  // where the child stands to sit on ledge L: its clip's distance in front of the edge
  ledgeStand(L) {
    const e = this.P.ledgeEdge;
    return { x: L.ex - Math.sin(L.a) * e, z: L.ez - Math.cos(L.a) * e };
  }

  // room to stand there (nothing from the ankles to above the head, at the spot and 20 cm to the
  // sides and in front), for either child
  standFree(L, feet, list) {
    const C = this.collision, sx = Math.sin(L.a), sz = Math.cos(L.a);
    for (const e of [0.114, 0.235]) {
      const x = L.ex - sx * e, z = L.ez - sz * e;
      for (const [u, v] of [[0, 0], [0.2, 0], [-0.2, 0], [0, -0.2]])   // (u across, v toward the ledge)
        if (C.solidAt(x + sz * u + sx * v, feet + 0.08, feet + 1.3, z - sx * u + sz * v, list)) return false;
    }
    return true;
  }

  // sit on it: back to the edge, the feet where the clip has them (its edge `ledgeEdge` behind)
  sitLedge(L) {
    const st = this.ledgeStand(L);
    this.pos.set(st.x, this.groundAt(st.x, st.z), st.z);   // (on the ground before it, not up on the deck)
    this.visY = this.pos.y;
    this.facing = L.a + Math.PI;
    this.vel.set(0, 0, 0);
    this.seatOff = Math.max(-0.1, Math.min(0.1, L.h - SEAT));
    this.play("ledgeDown");
  }

  update(dt) {
    if (!this.present || dt <= 0) return;
    // (a slow frame is walked in steps of at most 50 ms, not cut short: below 20 fps the walker
    // used to cover less ground than the time passed -- walking and running felt like wading)
    if (dt > 0.05) {
      const n = Math.ceil(dt / 0.05);
      for (let i = 0; i < n; i++) this.update(dt / n);
      return;
    }
    const k = this.keys;
    let f = (k.has("KeyW") || k.has("ArrowUp") ? 1 : 0) - (k.has("KeyS") || k.has("ArrowDown") ? 1 : 0);
    const r = (k.has("KeyD") || k.has("ArrowRight") ? 1 : 0) - (k.has("KeyA") || k.has("ArrowLeft") ? 1 : 0);
    const shift = k.has("ShiftLeft") || k.has("ShiftRight");
    const run = this.active ? shift !== PLAY.run : shift;
    const T = this.terrain;
    // the way to go. Walked by the player: ahead of the child, A / D turning it (the camera with it);
    // with the right button held ahead of the camera, the child turning to face that way, A / D
    // stepping aside; both buttons, or walking on by itself: on. Driven by the brain: relative to its
    // "camera"
    let cy = this.camYaw * RAD, side = r;
    this.back = false;
    if (this.active) {
      const steer = (this.mouse & 2) !== 0;
      if ((this.mouse & 3) === 3 || this.auto) f = Math.max(f, 1);
      if (!steer) {
        if (r && this.mode === "free") { const a = r * TURN * dt; this.facing -= a; this.camYaw += a / RAD; }
        side = 0;
        cy = -this.facing;
      } else if (!f && !side && this.mode === "free") {   // (standing: turning on the spot with the mouse)
        this.facing += wrap(-cy - this.facing) * Math.min(1, dt * 10);
        this.faceTo = null;
      }
      this.back = f < 0;
    }
    const fx = -Math.sin(cy), fz = Math.cos(cy);            // forward on the ground
    let wx = fx * f - fz * side, wz = fz * f + fx * side;   // (right of forward = (-fz, fx))
    const wl = Math.hypot(wx, wz);
    const wet = T.streamWet ? T.streamWet(this.pos.x, this.pos.z) : 0;
    if (this.active) this.gait = k.has("KeyQ") || this.skip ? "skip" : "walk";   // (Q held, or the button)
    let speed = (run ? this.P.speed.run : this.P.speed[this.anim && this.anim.acts[this.gait] ? this.gait : "walk"]) * (wet > 0.6 ? 0.5 : 1) * (1 - this.thicket);
    if (f || r || k.has("Space")) this.wake();                           // get up first, stop a gesture
    if (this.mode !== "free") speed = 0;                                 // (sitting, lying, getting down or up)
    if (this.back) speed = Math.min(speed, this.P.speed.walk * 0.85);   // (stepping back: slowly)
    if (this.landLock > 0) { this.landLock -= dt; speed *= 0.25; }      // (the knees giving after a fall)
    if (wl > 0) { wx /= wl; wz /= wl; }
    // steep ground: no walking up it
    const e = 0.6, gx = (T.heightAt(this.pos.x + e, this.pos.z) - T.heightAt(this.pos.x - e, this.pos.z)) / (2 * e);
    const gz = (T.heightAt(this.pos.x, this.pos.z + e) - T.heightAt(this.pos.x, this.pos.z - e)) / (2 * e);
    const up = wx * gx + wz * gz;                           // rise per metre in the walking direction
    if (up > 0.85) speed *= Math.max(0, 1 - (up - 0.85) * 4);
    const accel = this.grounded ? 12 : 2;
    this.vel.x += (wx * speed - this.vel.x) * Math.min(1, accel * dt);
    this.vel.z += (wz * speed - this.vel.z) * Math.min(1, accel * dt);
    // jump: standing still, a short crouch first; on the move the running jump, off at once; the
    // take-off at the clip's take-off frame
    if (this.grounded && k.has("Space") && !this.jumpState && this.mode === "free") {
      if (this.anim) {
        this.jumpClip = Math.hypot(this.vel.x, this.vel.z) > 1.0 ? "rjump" : "jump";
        this.jumpState = "prep"; this.jumpT = this.P.jumps[this.jumpClip].start;
      } else { this.vel.y = 4.2; this.grounded = false; }
    }
    if (this.jumpState === "prep") {
      const J = this.P.jumps[this.jumpClip];
      this.jumpT += dt * J.prep;
      if (this.jumpT >= J.takeoff) { this.jumpState = "air"; this.vel.y = J.vy; this.grounded = false; this.v0 = J.vy; }
    }
    this.vel.y -= 11.5 * dt;
    const p = this.pos;
    const x0 = p.x, z0 = p.z;
    p.x += this.vel.x * dt;
    p.z += this.vel.z * dt;
    p.y += this.vel.y * dt;
    // out of whatever stands higher than a step; then the ground is the terrain or the top of
    // what it steps onto (a stone, a log, a stump, the boardwalk)
    const C = this.collision;
    const feet = p.y;
    const anchored = this.mode === "ledge" || (this.mode === "seq" && this.seq.anchor);   // (sat on a ledge: stays put)
    if (C) {
      C.near(p.x, p.z, 2.5);
      if (!anchored) this.thicket = C.resolve(p, R, this.grounded);
    }
    // not through the other child
    for (const o of anchored ? [] : this.others) {
      if (!o.present) continue;
      const dx = p.x - o.pos.x, dz = p.z - o.pos.z, d = Math.hypot(dx, dz);
      if (d < 2 * R && d > 1e-4 && Math.abs(p.y - o.pos.y) < 1.4) { p.x += dx / d * (2 * R - d); p.z += dz / d * (2 * R - d); }
    }
    // leaning into something low and solid (not a wall of a house, a fence or an animal): push
    const want = Math.hypot(this.vel.x, this.vel.z) * dt;
    const got = Math.hypot(p.x - x0, p.z - z0);
    const hit = C && C.hit;
    const pushable = hit && hit.k !== "wall" && hit.k !== "bush" && (hit.top ?? hit.y0 + (hit.h || 0)) - feet < 2.2;
    this.pushing = this.grounded && this.mode === "free" && (f || r) && want > 1e-4 && got < want * 0.45 && pushable ? this.pushing + dt : 0;
    // what the walker really covered (sliding along what stopped it): the pace of the steps
    if (dt > 1e-4) { this.vel.x = (p.x - x0) / dt; this.vel.z = (p.z - z0) / dt; }
    const g = Math.max(this.groundAt(p.x, p.z), C ? C.support(p.x, p.z, feet + (this.grounded ? STEP : 0.15), undefined, feet) : -Infinity);
    if (p.y <= g) {
      if (!this.grounded) {
        if (this.jumpState === "air") { this.jumpState = "land"; this.jumpT = this.P.jumps[this.jumpClip].land; }
        else if (this.airT > 0.5 && this.anim) {   // a real fall: the knees give
          this.jumpState = "fland"; this.jumpClip = "land"; this.jumpT = this.P.jumps.land.touchdown; this.landLock = 0.45;
        }
      }
      p.y = g; this.vel.y = 0; this.grounded = true;
    }
    else if (this.grounded && p.y - g < 0.35 && this.vel.y <= 0) { p.y = g; this.vel.y = 0; }   // stick to the ground going downhill
    else this.grounded = false;
    this.airT = this.grounded ? 0 : this.airT + dt;
    // turn toward the way we go; swing the limbs
    const hs = Math.hypot(this.vel.x, this.vel.z);
    if (hs > 0.15) {
      const want = Math.atan2(this.vel.x, this.vel.z) + (this.back ? Math.PI : 0);   // (stepping back: still facing ahead)
      this.facing += Math.atan2(Math.sin(want - this.facing), Math.cos(want - this.facing)) * Math.min(1, dt * 10);
      this.faceTo = null;
    } else if (this.faceTo !== null && this.mode === "free") {   // turning to someone, standing: eased
      const d = wrap(this.faceTo - this.facing), st = Math.min(Math.abs(d), dt * 2.4);
      this.facing += Math.sign(d) * st;
      if (Math.abs(d) < 0.02) this.faceTo = null;
    }
    // walked on with no button held, the camera comes round behind the child again
    if (this.active && !this.mouse && hs > 0.5 && this.mode === "free") {
      let d = -this.facing / RAD - this.camYaw;
      d -= 360 * Math.round(d / 360);
      this.camYaw += d * Math.min(1, dt * 1.5);
    }
    this.walkAmt += (Math.min(1, hs / 0.9) - this.walkAmt) * Math.min(1, dt * 8);
    const rt = this.gait !== "walk" && !run ? 0 : Math.min(1, Math.max(0, (hs - 1.4) / 2));   // (skipping, chasing: their own clip at speed)
    this.runAmt = (this.runAmt || 0) + (rt - (this.runAmt || 0)) * Math.min(1, dt * 6);
    this.air = (this.air || 0) + ((this.grounded ? 0 : 1) - (this.air || 0)) * Math.min(1, dt * 10);
    // one full cycle (two steps) per ~1.1 m walking, ~2 m running: the feet keep their hold
    this.phase += dt * hs / (1.1 + 0.9 * this.runAmt) * 2 * Math.PI;
    let bob = 0;
    if (this.anim) this.animate(dt, hs);
    else if (this.rig) bob = this.pose(dt);
    else {
      const sw = Math.sin(this.phase) * this.walkAmt * (run ? 0.9 : 0.55);
      this.limbs.legL.rotation.x = sw; this.limbs.legR.rotation.x = -sw;
      this.limbs.armL.rotation.x = -sw * 0.8; this.limbs.armR.rotation.x = sw * 0.8;
      bob = Math.abs(Math.cos(this.phase)) * 0.04 * this.walkAmt;
    }
    // indoors the light is what comes in at the windows and the door: the walker dims with the room
    const ind = C ? C.indoorAt(p.x, p.y, p.z) : 0;
    this.indoor = (this.indoor || 0) + (ind - (this.indoor || 0)) * Math.min(1, dt * 3);
    if (Math.abs(this.indoor - (this.dimSet ?? 0)) > 0.005) {
      this.dimSet = this.indoor;
      this.figure.traverse((o) => { if (o.isMesh && o.material.uniforms?.uDim) o.material.uniforms.uDim.value = 1 - 0.68 * this.indoor; });
    }
    // stepping up and down eases over a few frames (the physics moves in whole steps)
    this.visY = this.grounded && Math.abs(p.y - (this.visY ?? p.y)) < 0.6 ? this.visY + (p.y - this.visY) * Math.min(1, dt * 16) : p.y;
    this.figure.position.set(p.x, this.visY + bob + this.seatNow, p.z);
    this.figure.rotation.y = this.facing;
    // trodden grass: a point every half metre, forgotten after a while
    this.clock = (this.clock || 0) + dt;   // scene time (the trodden grass rises again with it)
    const now = this.clock;
    const last = this.trail[this.trail.length - 1];
    if (this.grounded && (!last || Math.hypot(last[0] - p.x, last[1] - p.z) > 0.5)) {
      this.trail.push([p.x, p.z, now]);
      if (this.trail.length > TRAIL) this.trail.shift();
    }
    // share the trodden points (newest = the body now, full strength)
    const U = this.trailU;
    if (U) {
      for (let i = 0; i < U.length; i++) {
        const t = this.trail[this.trail.length - 1 - i];
        if (t) U[i].set(t[0], t[1], now - t[2], i === 0 ? 1.0 : 0.8); else U[i].set(0, 0, 1e3, 0);
      }
      U[0].set(p.x, p.z, 0, 1.0);
    }
    if (this.anim && this.face) this.faceUpdate(dt, hs);
    if (this.active) this.updateCamera(dt);
  }

  // the face's bones (tools/blender/face_rig.py) and the axes to move them about, from the bind pose
  setupFace(root) {
    const B = {};
    root.traverse((o) => {
      if (!o.isBone) return;
      if (/Jaw$/.test(o.name)) B.jaw = o;
      else if (/LipU$/.test(o.name)) B.lipU = o;
      else if (/MouthL$/.test(o.name)) B.mouthL = o;
      else if (/MouthR$/.test(o.name)) B.mouthR = o;
      else if (/LidL$/.test(o.name)) B.lidL = o;
      else if (/LidR$/.test(o.name)) B.lidR = o;
      else if (/Neck$/.test(o.name)) B.neck = o;
      else if (/Spine2$/.test(o.name)) B.spine2 = o;
    });
    B.head = this.headBone;
    root.updateMatrixWorld(true);
    const qf = root.getWorldQuaternion(new THREE.Quaternion());
    const X = new THREE.Vector3(1, 0, 0).applyQuaternion(qf);     // the child's left: turning about it brings the front down
    const F = new THREE.Vector3(0, 0, 1).applyQuaternion(qf);
    const D = new THREE.Vector3(0, -1, 0).applyQuaternion(qf);
    const local = (b, v) => v.clone().applyQuaternion(b.getWorldQuaternion(new THREE.Quaternion()).invert()).normalize();
    for (const b of [B.jaw, B.lidL, B.lidR]) {
      if (!b) continue;
      b.userData.rest = b.quaternion.clone();
      b.userData.restScale = b.scale.clone();
      b.userData.axis = local(b, X);
      const d = local(b, D), a = [Math.abs(d.x), Math.abs(d.y), Math.abs(d.z)];
      b.userData.down = a.indexOf(Math.max(...a));                // (a sliding lid: scaled along the axis down the face)
    }
    if (B.head) B.fwd = local(B.head, F);
    // the lips' bones move (in their parent's frame: the head's): up, out (to its own side), back
    const Up = new THREE.Vector3(0, 1, 0).applyQuaternion(qf), Bk = F.clone().negate();
    for (const [b, sd] of [[B.lipU, 0], [B.mouthL, 1], [B.mouthR, -1]]) {
      if (!b) continue;
      const wp = b.getWorldPosition(new THREE.Vector3()), p0 = b.parent.worldToLocal(wp.clone());
      const toLocal = (d) => b.parent.worldToLocal(wp.clone().add(d)).sub(p0);
      b.userData.restPos = b.position.clone();
      b.userData.up = toLocal(Up); b.userData.back = toLocal(Bk); b.userData.side = toLocal(X.clone().multiplyScalar(sd));
    }
    this.face = { B, jaw: 0, shut: 0, smile: 0, round: 0, laughT: 2, laugh: 0, blinkAt: 1 + 3 * Math.random(), blinkT: -1, talkPh: 0, pauseT: 0, clock: 0, lieT: 0,
      lookPt: new THREE.Vector3(), lookW: 0 };
  }

  // the face for this frame: blinking, the mouth, the eyes shut; then the head turned to what it
  // attends to
  faceUpdate(dt, hs) {
    const f = this.face, B = f.B, S = this.seq;
    f.clock += dt;
    const prog = S ? (S.t - S.from) / (S.to - S.from) : 0, sq = S ? S.name : "";
    let jawT = 0, shutT = 0, roundT = 0;
    // a smile: waving, laughing, skipping and chasing about, the other child near, a flower
    const moving = this.mode === "free" && hs > 0.5;
    let smileT = this.mode === "sit" || this.mode === "lie" ? 0.2 : this.mode === "ledge" ? 0.3 : 0.12;
    if (sq === "wave") smileT = 0.9;
    else if (sq === "spin") smileT = 1;
    else if (sq === "crouch") smileT = 0.35;
    else if (sq === "point") smileT = 0.45;
    else if (sq === "stretch") smileT = 0;
    if (this.mode === "talk") smileT = 0.3 + 0.6 * f.laugh;
    if (moving && this.gait === "skip") smileT = 0.65;
    if (moving && this.gait === "chase") smileT = 0.55;
    if (this.jumpState) smileT = Math.max(smileT, 0.5);
    if (this.mode === "free" && !moving && f.lookW > 0.4) smileT = Math.max(smileT, 0.5);   // (looking at the other child)
    // talking (and the few words pointing something out, the "hi" of a wave): syllables, now and
    // then a pause
    if (this.mode === "talk" || (sq === "point" && prog > 0.25 && prog < 0.85) || (sq === "wave" && prog > 0.12 && prog < 0.4)) {
      f.pauseT -= dt;
      if (f.pauseT < -1.2 - 1.5 * Math.random()) f.pauseT = 0.25 + 0.35 * Math.random();
      f.talkPh += dt * (5.5 + 1.5 * Math.sin(f.clock * 0.7));
      const syl = Math.max(0, Math.sin(f.talkPh * Math.PI * 2)) * (0.55 + 0.45 * Math.abs(Math.sin(f.talkPh * 1.7)));
      jawT = (f.pauseT > 0 ? 0.03 : 0.08 + 0.42 * syl) * (this.P.face.talk || 1);
      roundT = f.pauseT <= 0 && Math.sin(f.talkPh * 0.77 + 1.3) > 0.35 ? 0.9 * syl : 0;   // (an "o", an "u")
      // a laugh now and then
      f.laughT -= dt;
      if (f.laughT <= 0) { f.laugh = Math.random() < 0.3 ? 1 : 0; f.laughT = f.laugh ? 0.6 + 0.6 * Math.random() : 2 + 2 * Math.random(); }
      if (f.laugh) jawT = Math.max(jawT, 0.35 + 0.15 * Math.sin(f.clock * 14));
    } else f.laugh = 0;
    if (sq === "stretch") { const y = bell(prog, 0.2, 0.85); jawT = Math.max(jawT, 1.3 * Math.pow(y, 0.7)); shutT = Math.max(shutT, 0.65 * y); }   // a yawn (wider than talking)
    if (sq === "spin") jawT = Math.max(jawT, 0.3 + 0.12 * Math.sin(f.clock * 11));                       // laughing
    if (sq === "throw") jawT = Math.max(jawT, 0.25 * bell(prog, 0.25, 0.6));
    if (sq === "crouch") shutT = Math.max(shutT, Math.min(1, 1.6 * bell(prog, 0.3, 0.78)) * 0.92);     // smelling the flower
    if (this.mode === "lie") { f.lieT += dt; if (f.lieT > 3) shutT = Math.max(shutT, Math.min(1, (f.lieT - 3) / 1.5)); } else f.lieT = 0;
    if (this.mode === "free" && hs > 2.4) jawT = Math.max(jawT, 0.14 + 0.07 * Math.sin((this.cycle || 0) * 4 * Math.PI));   // out of breath
    // blinking: every 2-6 s, now and then twice
    if (f.blinkT >= 0) { f.blinkT += dt; if (f.blinkT > 0.22) { f.blinkT = -1; f.blinkAt = Math.random() < 0.18 ? 0.25 : 2 + 4 * Math.random(); } }
    else if ((f.blinkAt -= dt) <= 0 && shutT < 0.5) f.blinkT = 0;
    const bt = f.blinkT, blink = bt < 0 ? 0 : bt < 0.07 ? bt / 0.07 : bt < 0.1 ? 1 : Math.max(0, 1 - (bt - 0.1) / 0.12);
    f.jaw += (jawT - f.jaw) * Math.min(1, dt * 16);
    f.shut += (shutT - f.shut) * Math.min(1, dt * 4);
    f.smile += (smileT - f.smile) * Math.min(1, dt * 4);
    f.round += (roundT - f.round) * Math.min(1, dt * 14);
    if (this.faceForce) Object.assign(f, this.faceForce);   // (dev: hold a face, devtools)
    const lid = Math.max(blink, f.shut, 0.22 * f.smile), F = this.P.face, K = F.k || 1;   // (a smile narrows the eyes)
    for (const b of [B.mouthL, B.mouthR]) {   // the corners: a smile up, out, back; an "o" in and forward
      if (!b) continue;
      const u = b.userData;
      b.position.copy(u.restPos).addScaledVector(u.up, K * 0.005 * f.smile).addScaledVector(u.side, K * (0.003 * f.smile - 0.0028 * f.round))
        .addScaledVector(u.back, K * (0.0015 * f.smile - 0.0012 * f.round));
    }
    if (B.lipU) {   // the upper lip lifts with the jaw (an oval, not a slot), forward in an "o"
      const u = B.lipU.userData;
      B.lipU.position.copy(u.restPos).addScaledVector(u.up, K * (0.0009 * f.jaw + 0.0006 * f.round)).addScaledVector(u.back, -K * 0.001 * f.round);
    }
    if (B.jaw) B.jaw.quaternion.copy(B.jaw.userData.rest).multiply(_q.setFromAxisAngle(B.jaw.userData.axis, f.jaw * F.jaw));
    for (const L of [B.lidL, B.lidR]) {
      if (!L) continue;
      if (F.lid === "turn") L.quaternion.copy(L.userData.rest).multiply(_q.setFromAxisAngle(L.userData.axis, lid * F.close));
      else if (lid < 0.04) L.scale.setScalar(1e-3);                                           // (open: gone)
      else { L.scale.copy(L.userData.restScale); L.scale.setComponent(L.userData.down, L.userData.restScale.getComponent(L.userData.down) * lid); }
    }
    this.attend(dt, prog, sq);
  }

  // turn the head (the neck and the chest a little) to what the child attends to
  attend(dt, prog, sq) {
    const f = this.face, B = f.B;
    if (!B.head || !B.fwd) return;
    let tgt = null, w = 0, max = 1.3;
    const other = this.others.find((o) => o.present && o.headBone && Math.hypot(o.pos.x - this.pos.x, o.pos.z - this.pos.z) < 7);
    const oh = other ? other.headBone.getWorldPosition(_v) : null;
    if (this.mode === "talk" && oh) { tgt = oh; w = 1; }
    else if (sq === "wave" && oh) { tgt = oh; w = 1; }
    else if (sq === "point" && oh && prog > 0.45 && prog < 0.95) { tgt = oh; w = 1; max = 1.9; }   // (looking back to the one shown)
    else if (sq === "crouch" && prog > 0.2 && prog < 0.8) {                                        // the flower before it
      tgt = _v.set(this.pos.x + Math.sin(this.facing) * 0.3, this.pos.y + 0.12, this.pos.z + Math.cos(this.facing) * 0.3); w = 0.9;
    } else if (this.mode === "free" && oh && Math.hypot(this.vel.x, this.vel.z) < 0.5 && !this.jumpState) {
      if (Math.abs(wrap(Math.atan2(oh.x - this.pos.x, oh.z - this.pos.z) - this.facing)) < 2.0) { tgt = oh; w = 0.75; }   // a glance at the other
    }
    if (tgt) f.lookPt.lerp(tgt, f.lookW < 0.05 ? 1 : Math.min(1, dt * 6));
    f.lookW += ((tgt ? w : 0) - f.lookW) * Math.min(1, dt * 3);
    if (f.lookW < 0.01) return;
    this.figure.updateMatrixWorld(true);
    const hp = B.head.getWorldPosition(_v2);
    const cur = _v3.copy(B.fwd).applyQuaternion(B.head.getWorldQuaternion(_q2));
    const want = f.lookPt.clone().sub(hp).normalize();
    const full = new THREE.Quaternion().setFromUnitVectors(cur, want);
    const ang = 2 * Math.acos(Math.min(1, Math.abs(full.w)));
    const q = new THREE.Quaternion().slerp(full, (ang > max ? max / ang : 1) * f.lookW);
    for (const [b, fr] of [[B.spine2, 0.2], [B.neck, 0.35], [B.head, 0.45]]) {
      if (!b) continue;
      const qb = new THREE.Quaternion().slerp(q, fr);
      const wq = b.getWorldQuaternion(_q2);
      const pq = b.parent.getWorldQuaternion(_q3).invert();
      b.quaternion.copy(pq.multiply(qb.multiply(wq)));
      b.updateMatrixWorld(true);
    }
  }

  // the Mixamo clips for this frame: target weights from the state, followed smoothly (so every
  // change is a cross-fade) and normalised; walk/run in step with the ground covered
  animate(dt, hs) {
    const A = this.anim.acts, Wt = this.anim.w, tw = {};
    const dur = (n) => (A[n] ? A[n].getClip().duration : 1);
    const at = (n, t) => { if (A[n]) A[n].time = Math.max(0, Math.min(t, dur(n) - 1e-3)); };
    // postures and gestures
    let snap = null;
    this.seatNow = this.mode === "ledge" ? this.seatOff : 0;
    if (this.mode === "seq") {
      const S = this.seq, dir = Math.sign(S.to - S.from);
      S.t += dt * S.rate * dir;
      at(S.clip, S.t);
      tw[S.clip] = 1;
      const k = Math.min(1, Math.max(0, (S.t - S.from) / (S.to - S.from)));
      if (S.seat) this.seatNow = this.seatOff * (S.seat > 0 ? k : 1 - k);
      if ((S.t - S.to) * dir >= 0) {
        this.mode = S.then; this.seq = null; this.loopT = 0;
        // a turn: the body now faces the new way -- the facing turns with it and the standing pose
        // takes over at once (a cross-fade would swing it round twice)
        if (S.yaw) { this.facing += S.yaw; snap = "idle"; }
      }
    }
    if (LOOPS.includes(this.mode) && A[this.mode]) {   // sitting, lying, on a ledge, talking: the loop running
      this.loopT += dt;
      at(this.mode, this.loopT % dur(this.mode));
      tw[this.mode] = 1;
      if (this.mode === "ledge") this.seatNow = this.seatOff;
    }
    else if (this.mode === "free") {
      // jumps, falls and landings over the walking
      let jw = 0;
      const J = this.P.jumps[this.jumpClip];
      if (this.jumpState === "prep") jw = 1;
      else if (this.jumpState === "air") {
        const frac = Math.min(0.95, (this.v0 - this.vel.y) / (2 * this.v0));   // 0 at take-off, 1 back at the same height
        this.jumpT = J.takeoff + (J.land - J.takeoff) * frac;
        jw = 1;
      } else if (this.jumpState === "land" || this.jumpState === "fland") {
        const t0 = this.jumpState === "fland" ? J.touchdown : J.land;
        this.jumpT += dt * (hs > 0.5 ? 1.8 : 1.15);
        const k = Math.min(1, (this.jumpT - t0) / (J.end - t0));
        jw = hs > 0.5 ? Math.max(0, 1 - k * 1.6) : 1 - k * k;                   // on the move it gives way to the stride sooner
        if (k >= 1) this.jumpState = null;
      }
      if (jw > 0) { at(this.jumpClip, this.jumpT); tw[this.jumpClip] = jw; }
      // off something high, no jump: falling
      const fw = !this.grounded && !this.jumpState && this.airT > 0.25 && this.vel.y < -1 ? 1 - jw : 0;
      if (fw > 0) { at("fall", (this.clock || 0) % dur("fall")); tw.fall = fw; }
      let rest = Math.max(0, 1 - jw - fw);
      // leaning into something: pushing, the feet stepping in place
      if (this.pushing > 0.25 && A.push) {
        this.pushT = ((this.pushT || 0) + dt) % dur("push");
        at("push", this.pushT);
        tw.push = rest;
        rest = 0;
      }
      // standing, walking, running; standing still a while, a look round now and then
      const w = this.walkAmt, r = this.runAmt;
      const g = A[this.gait] ? this.gait : "walk";                          // walking, skipping or chasing
      const stride = this.P.stride[g] + (this.P.stride.run - this.P.stride[g]) * r;
      this.cycle = ((((this.cycle || 0) + dt * hs / stride * (this.back ? -1 : 1)) % 1) + 1) % 1;   // (stepping back: backwards)
      at(g, this.cycle * dur(g));
      at("run", this.cycle * dur("run"));
      const still = hs < 0.05 && this.grounded && !this.jumpState && rest > 0.99;
      this.idleT = still ? this.idleT + dt : 0;
      if (this.lookT < 0 && this.idleT > this.lookAt && A.look) this.lookT = 0;
      let lw = 0;
      if (this.lookT >= 0) {
        if (!still) this.lookT = -1;
        else {
          this.lookT += dt;
          at("look", this.lookT);
          lw = 1;
          if (this.lookT > dur("look") - 0.6) { this.lookT = -1; this.idleT = 0; this.lookAt = 8 + 12 * Math.random(); }
        }
      }
      tw.idle = rest * (1 - w) * (1 - lw);
      tw.look = rest * (1 - w) * lw;
      tw[g] = rest * w * (1 - r);
      tw.run = (tw.run || 0) + rest * w * r;
    }
    // follow the targets, normalise (a weight sum short of 1 would pull toward the bind pose)
    let sum = 0;
    for (const n of Object.keys(A)) {
      const k = Math.min(1, dt * (FADE[n] || (this.mode === "seq" && this.seq?.clip === n ? 6 : 8)));
      Wt[n] = snap ? (n === snap ? 1 : 0) : Wt[n] + ((tw[n] || 0) - Wt[n]) * k;
      sum += Wt[n];
    }
    for (const n of Object.keys(A)) A[n].setEffectiveWeight(sum > 1e-4 ? Wt[n] / sum : n === "idle" ? 1 : 0);
    this.anim.mixer.update(dt);
  }

  // the body's pose for this frame; returns the vertical bob of the hips
  pose(dt) {
    const R = this.rig, X = R.X, Y = R.Y, Z = R.Z;
    const w = this.walkAmt, r = this.runAmt, air = this.air, ph = this.phase;
    const s = Math.sin(ph), c = Math.cos(ph);
    // idle: breathing, and now and then a look round
    this.idleT += dt;
    if (w < 0.1 && Math.random() < dt * 0.15) this.lookTarget = (Math.random() - 0.5) * 1.2;
    if (w > 0.3) this.lookTarget = 0;
    this.look += ((this.lookTarget || 0) - this.look) * Math.min(1, dt * 1.5);
    const breathe = Math.sin(this.idleT * 1.7) * 0.025 * (1 - w);
    const A = 0.42 + 0.4 * r;                                   // thigh swing
    const K = 0.75 + 0.8 * r;                                   // knee flex in the swing phase
    const B = 0.3 + 0.55 * r;                                   // arm swing
    const leg = (sgn) => {                                      // sgn +1 left, -1 right
      const fwd = sgn * s;                                      // how far forward this leg is (-1..1)
      const swing = Math.max(0, sgn * c);                       // moving forward: knee up
      const th = (A * fwd) * w + air * 0.55;
      const kn = (K * swing ** 1.2 + 0.12 + 0.25 * r) * w + air * 1.0;
      return { th, kn, ft: (-th + kn) * 0.8 - 0.1 * r * w };
    };
    for (const [sgn, side] of [[1, "L"], [-1, "R"]]) {
      const L = leg(sgn);
      R.set(`thigh${side}`, [[X, -L.th]]);
      R.set(`shin${side}`, [[X, L.kn]]);
      R.set(`foot${side}`, [[X, L.ft]]);
      const armF = -sgn * s * B * w;                            // opposite to the leg
      R.set(`upperarm${side}`, [[Z, -sgn * (0.1 - 0.35 * air)], [X, armF - air * 0.5]]);
      R.set(`forearm${side}`, [[X, -(0.15 + 0.2 * w + 0.9 * r * w + 0.3 * air)]]);
      R.set(`clavicle${side}`, [[X, breathe * 0.5]]);
    }
    const lean = 0.05 * w + 0.16 * r * w + 0.1 * air;
    R.set("hips", [[Y, 0.1 * s * w], [X, 0.04 * w * Math.abs(c)]]);
    R.set("spine", [[X, lean * 0.5], [Y, -0.06 * s * w]]);
    R.set("chest", [[X, lean * 0.5 - breathe], [Y, -0.05 * s * w]]);
    R.set("neck", [[Y, this.look * 0.4], [X, -lean * 0.4]]);
    R.set("head", [[Y, this.look * 0.6], [X, -lean * 0.4 + breathe * 0.5]]);
    return (Math.abs(c) * (0.025 + 0.05 * r) - 0.01 - 0.03 * r) * w;
  }

  updateCamera(dt) {
    const close = 1 - Math.min(1, Math.max(0, (this.camDist - 0.9) / 1.6));   // zoomed in: look at the face
    // aim at the head as it goes (sitting down, lying on the back), smoothed against its sway
    let hy = (this.visY ?? this.pos.y) + 1.12;
    if (this.headBone) { this.headBone.updateWorldMatrix(true, false); hy = this.headBone.matrixWorld.elements[13]; }
    this.camHead = this.camHead === undefined || Math.abs(this.camHead - hy) > 3 ? hy : this.camHead + (hy - this.camHead) * Math.min(1, dt * 5);
    const tgt = new THREE.Vector3(this.pos.x, Math.max(this.camHead + 0.03 + 0.1 * close * close, (this.visY ?? this.pos.y) + 0.35), this.pos.z);
    const yaw = this.camYaw * RAD, pitch = this.camPitch * RAD;
    const dir = new THREE.Vector3(-Math.sin(yaw) * Math.cos(pitch), Math.sin(pitch), Math.cos(yaw) * Math.cos(pitch));
    let d = this.camDist;
    // out of houses, yurts and trunks: pull the camera in; out of the ground: lift it (on a slope
    // rising behind the walker it looks down from higher up instead of closing in on the face)
    const mid = tgt.clone().addScaledVector(dir, -this.camDist / 2);
    const list = this.collision ? this.collision.near(mid.x, mid.z, this.camDist / 2 + 1) : [];
    for (let s = 0.3; s <= this.camDist; s += 0.1) {   // (fine steps: a log wall is 30 cm thick)
      const q = tgt.clone().addScaledVector(dir, -s);
      if (this.blocked(q, list)) { d = Math.max(0.5, s - 0.3); break; }
    }
    const want = tgt.clone().addScaledVector(dir, -d);
    let gq = 0;
    for (let s = 0.25; s <= 1.0001; s += 0.25) {   // clear the ground along the way too
      const q = tgt.clone().lerp(want, s);
      gq = Math.max(gq, this.terrain.heightAt(q.x, q.z) + 0.45 - (q.y - want.y));
    }
    if (want.y < gq) want.y = gq;
    this.camPos.lerp(want, 1 - Math.exp(-dt / 0.06));
    this.camera.position.copy(this.camPos);
    this.camera.lookAt(tgt);
    this.camera.updateMatrixWorld();
  }
}
