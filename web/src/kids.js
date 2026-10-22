// The two children round 岚川 (the user: both live round there; one is controlled, the other carries
// on playing nearby). Each is a Character (character.js); the one not controlled -- both, while the
// camera flies -- is driven here by pressing its keys as a player would, so it walks, runs, jumps,
// sits and lies with the same physics and clips. What it does, by turns:
//   stands a while (looking round now and then: character.js); walks, runs, skips or chases about to
//   somewhere else round the two houses and among the cosmos (a hop now and then); sits on the ground
//   or lies on the back a while, and maybe stretches on getting up; sits on the edge of a deck
//   swinging its legs; crouches to look at a flower, picks one, spins round, throws a stone.
//   With the other child: when it comes up close, turns to it (stepping round) and waves; standing
//   together a while, they talk; or it turns away to point something out far off.
//   Far from 岚川 (left there by the player), out of sight: back home at once.
// Tab (walking): control the other child -- the camera goes to it, the one let go plays on.
// The trodden grass (uTrail): the controlled child's steps in the first 16 points, the other's in the
// last 8.

const RAD = Math.PI / 180;
const wrap = (a) => Math.atan2(Math.sin(a), Math.cos(a));
// what to do next, standing idle: weights
const CHOICES = [["walk", 30], ["run", 5], ["skip", 9], ["chase", 6], ["sit", 8], ["lie", 5], ["ledge", 7], ["crouch", 8],
  ["pickup", 5], ["spin", 4], ["throw", 3], ["stretch", 2], ["wait", 8]];

class Brain {
  constructor(kid, home, radius, terrain, collision, seed) {
    this.kid = kid; this.home = home; this.R = radius; this.terrain = terrain; this.collision = collision;
    this.rnd = mulberry(seed);
    this.state = "idle"; this.t = 1 + 3 * this.rnd();
    this.waved = -99; this.talked = -99; this.pointed = -99; this.clock = 0; this.near = 0;
    this.ledges = [];
    this.flowers = [];   // (where the cosmos grows: to crouch and smell one)
  }

  reset(t = 1.5 + 2 * this.rnd()) { this.state = "idle"; this.t = t; this.target = null; this.kid.gait = "walk"; }

  // a spot to go to: round the houses and in the meadow, not in a house, not steep, not on the other child
  pick(others, from = this.home, R = this.R) {
    const T = this.terrain;
    for (let k = 0; k < 40; k++) {
      const a = this.rnd() * 2 * Math.PI, r = Math.sqrt(this.rnd()) * R;
      const x = from.x + Math.cos(a) * r, z = from.z + Math.sin(a) * r;
      if (Math.hypot(x - this.home.x, z - this.home.z) > this.R) continue;
      if (this.collision.occupied(x, z)) continue;
      const e = 0.8, g = Math.hypot(T.heightAt(x + e, z) - T.heightAt(x - e, z), T.heightAt(x, z + e) - T.heightAt(x, z - e)) / (2 * e);
      if (g > 0.45) continue;
      if (others.some((o) => o.present && Math.hypot(o.pos.x - x, o.pos.z - z) < 2.5)) continue;
      return { x, z };
    }
    return { x: this.home.x, z: this.home.z };
  }

  go(target, gait = "walk", run = false) {
    this.target = target; this.kid.gait = gait; this.run = run;
    this.state = "go"; this.stuck = 0; this.lastD = 1e9; this.hop = gait !== "chase" && this.rnd() < 0.2;
  }

  // turn to the way `a`, then do `then`
  face(a, then) { this.state = "face"; this.faceA = a; this.then = then; this.t = 4; }

  begin(what, others) {
    const k = this.kid;
    this.state = "gesture";
    switch (what) {
      case "wave": k.play("wave"); this.waved = this.clock; break;
      case "talk": k.mode = "talk"; k.loopT = this.rnd() * 3; this.state = "talk"; this.t = 4 + 5 * this.rnd(); this.talked = this.clock; break;
      case "point": k.play("point"); this.pointed = this.clock; break;
      case "ledge": {
        const L = this.ledgeL;
        if (L) { k.sitLedge(L); this.state = "ledge"; this.t = 12 + 20 * this.rnd(); } else this.reset();
        break;
      }
      default: k.play(what);
    }
  }

  update(dt, others) {
    const k = this.kid;
    this.clock += dt;
    if (k.active) { if (this.state !== "idle") this.reset(); return; }
    k.keys.clear();
    const free = k.mode === "free" && k.grounded && !k.jumpState;
    // the other child close by: wave when it comes up; standing together a while, talk; or point
    // something out far off (turned away from it, looking back)
    const o = others.find((o) => o.present && Math.hypot(o.pos.x - k.pos.x, o.pos.z - k.pos.z) < 6);
    const slow = o && Math.hypot(o.vel.x, o.vel.z) < 0.3 && o.mode !== "lie";
    this.near = o && slow && Math.hypot(o.pos.x - k.pos.x, o.pos.z - k.pos.z) < 4 ? this.near + dt : 0;
    if (o && free && (this.state === "idle" || this.state === "go")) {
      const toO = Math.atan2(o.pos.x - k.pos.x, o.pos.z - k.pos.z);
      if (this.clock - this.waved > 25 && Math.hypot(o.vel.x, o.vel.z) < 2.5 && (o.active || this.rnd() < dt * 0.3)) { this.face(toO, "wave"); return; }
      if (this.near > 2 && this.clock - this.talked > 20 && this.clock - this.waved > 3) { this.face(toO, "talk"); return; }
      if (this.near > 2 && this.clock - this.pointed > 40 && this.rnd() < dt * 0.15) { this.face(toO + Math.PI, "point"); return; }
    }
    const dHome = Math.hypot(k.pos.x - this.home.x, k.pos.z - this.home.z);
    const far = dHome > this.R + 8;
    // left far away (by the player), out of sight: back home at once rather than across the hills
    if (far && free && dHome > 120 && this.cam && Math.hypot(k.pos.x - this.cam.x, k.pos.z - this.cam.z) > 90) {
      const p = this.pick(others);
      k.place(p.x, p.z, this.rnd() * 6.28);
      this.reset();
      return;
    }
    switch (this.state) {
      case "idle": {
        this.t -= dt;
        if (this.t > 0 || !free) break;
        if (far) { this.go(this.pick(others), "walk", true); break; }
        let u = this.rnd() * CHOICES.reduce((a, c) => a + c[1], 0), what = "wait";
        for (const [n, w] of CHOICES) { if ((u -= w) < 0) { what = n; break; } }
        const A = k.anim ? k.anim.acts : {};
        if (["skip", "chase", "crouch", "spin", "throw", "stretch", "ledge"].includes(what) && !A[what === "ledge" ? "ledgeDown" : what]) what = "walk";
        if (what === "ledge" && !this.ledges.length) what = "walk";
        if (what === "spin" && this.cramped(k.pos.x, k.pos.z)) what = "crouch";
        switch (what) {
          case "walk": this.go(this.pick(others)); break;
          case "run": this.go(this.pick(others), "walk", true); break;
          case "skip": this.go(this.pick(others), "skip"); break;
          case "chase": this.chases = 2 + Math.floor(this.rnd() * 3); this.go(this.pick(others, k.pos, 9), "chase"); break;
          case "sit": k.play("sitdown"); this.state = "sit"; this.t = 10 + 20 * this.rnd(); break;
          case "lie": k.play("liedown"); this.state = "lie"; this.t = 12 + 25 * this.rnd(); break;
          case "ledge": {
            const L = this.ledges[Math.floor(this.rnd() * this.ledges.length)];
            if (others.some((o) => o.present && Math.hypot(o.pos.x - L.ex, o.pos.z - L.ez) < 1.5)) { this.t = 1; break; }   // (taken)
            this.ledgeTo = L; this.go(k.ledgeStand(L));
            break;
          }
          case "wait": this.t = 2 + 5 * this.rnd(); break;
          case "crouch": {   // to the cosmos first, if there is some near
            const F = this.flowers.filter((q) => Math.hypot(q.x - k.pos.x, q.z - k.pos.z) < 18 && !others.some((o) => Math.hypot(o.pos.x - q.x, o.pos.z - q.z) < 1.5));
            if (F.length) { const q = F[Math.floor(this.rnd() * F.length)]; this.after = "crouch"; this.go({ x: q.x, z: q.z }); }
            else this.begin("crouch", others);
            break;
          }
          default: this.begin(what, others);
        }
        break;
      }
      case "go": {
        const dx = this.target.x - k.pos.x, dz = this.target.z - k.pos.z, d = Math.hypot(dx, dz);
        if (d < (this.ledgeTo ? 0.45 : 0.8)) {
          if (this.ledgeTo) { const L = this.ledgeTo; this.ledgeL = L; this.ledgeTo = null; k.gait = "walk"; this.face(L.a + Math.PI, "ledge"); break; }
          if (k.gait === "chase" && --this.chases > 0) { this.go(this.pick(others, k.pos, 9), "chase"); break; }
          if (this.after) { const a = this.after; this.after = null; k.gait = "walk"; this.begin(a, others); break; }
          this.reset();
          break;
        }
        // chasing something: a zigzag after it
        const wob = k.gait === "chase" ? Math.sin(this.clock * 2.3) * 0.6 : 0;
        k.camYaw = Math.atan2(-dx, dz) / RAD + wob / RAD;   // (W walks the way the "camera" faces)
        k.keys.add("KeyW");
        if (this.run || far) k.keys.add("ShiftLeft");
        if (this.hop && d > 4 && this.rnd() < dt * 0.4) { k.keys.add("Space"); this.hop = false; }
        // not getting closer (a fence, a wall, a bank too steep): somewhere else
        this.stuck = d < this.lastD - 0.02 ? 0 : this.stuck + dt;
        this.lastD = Math.min(this.lastD, d);
        if (this.stuck > 2.5) { this.ledgeTo = null; this.after = null; this.go(this.pick(others), k.gait === "chase" ? "walk" : k.gait); }
        break;
      }
      case "face": {
        this.t -= dt;
        if (k.mode !== "free") break;                  // (a step round playing)
        if (k.turnTo(this.faceA) || this.t < 0) { k.faceTo = null; this.begin(this.then, others); }
        break;
      }
      case "sit":
      case "lie":
      case "ledge":
        if (k.mode === this.state) {
          this.t -= dt;
          if (this.t <= 0) {
            k.play(this.state === "sit" ? "standup" : this.state === "lie" ? "getup" : "ledgeUp");
            this.state = this.state !== "ledge" && this.rnd() < 0.45 ? "rise" : "gesture";   // (and maybe a stretch, up)
          }
        } else if (k.mode === "free") this.reset();   // (did not go down: try something else)
        break;
      case "rise":
        if (k.mode === "free") { k.play("stretch"); this.state = "gesture"; }
        break;
      case "talk":
        this.t -= dt;
        if (k.mode !== "talk") this.reset();
        else if (this.t <= 0 || !o) { k.mode = "free"; this.reset(); }
        break;
      case "gesture":
        if (k.mode === "free") this.reset();
        break;
    }
  }

  // too close to a house, a fence or a yurt to spin round with the arms out
  cramped(x, z) {
    for (let i = 0; i < 8; i++) {
      const a = (i / 8) * 2 * Math.PI;
      if (this.collision.occupied(x + Math.cos(a) * 1.3, z + Math.sin(a) * 1.3)) return true;
    }
    return false;
  }
}

// the ledges round 岚川 to sit on (deck edges and the like 30-50 cm high, character.js findLedge):
// found from points on a 1 m grid near the buildings; the edges kept 2 m apart
function findLedges(kid, home, R, terrain, collision) {
  const out = [];
  for (let x = home.x - R; x <= home.x + R; x += 1)
    for (let z = home.z - R; z <= home.z + R; z += 1) {
      if (Math.hypot(x - home.x, z - home.z) > R || collision.occupied(x, z)) continue;
      let nearB = false;
      for (let i = 0; i < 8 && !nearB; i++) nearB = collision.occupied(x + Math.cos(i * 0.785) * 1.2, z + Math.sin(i * 0.785) * 1.2);
      if (!nearB) continue;
      const L = kid.findLedge(x, z, terrain.heightAt(x, z), 0.9);
      if (!L || out.some((q) => Math.hypot(q.ex - L.ex, q.ez - L.ez) < 2)) continue;
      out.push(L);
    }
  return out;
}

function mulberry(a) {
  return () => {
    a |= 0; a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export class Kids {
  // list: the Characters; home: {x, z} and radius of where they play; starts: where each begins
  constructor(list, { home, radius, starts, terrain, collision, trail, flowers = [] }) {
    this.list = list;
    this.trail = trail;
    this.sel = 0;               // the child taken when walking starts
    this.controlled = null;
    this.brains = list.map((k, i) => new Brain(k, home, radius, terrain, collision, 17 + i * 101));
    for (const b of this.brains) b.flowers = flowers.filter((q) => !collision.occupied(q.x, q.z));
    this.findLedges = () => {   // (once the buildings' collision is in place)
      const L = findLedges(list[0], home, radius, terrain, collision);
      for (const b of this.brains) b.ledges = L;
      return L;
    };
    list.forEach((k, i) => {
      k.others = list.filter((o) => o !== k);
      k.place(starts[i].x, starts[i].z, starts[i].facing || 0);
    });
    this.shareTrail();
  }

  // the controlled child's trodden points first (index 0 is "the body now" for the shrubs)
  shareTrail() {
    const U = this.trail;
    const first = this.controlled || this.list[this.sel];
    const other = this.list.find((k) => k !== first);
    first.trailU = U.slice(0, 16);
    if (other) other.trailU = U.slice(16);
    for (const v of U) v.set(0, 0, 1e3, 0);
  }

  // walking: control the selected child
  take() {
    this.controlled = this.list[this.sel];
    this.controlled.take();
    this.shareTrail();
    return this.controlled;
  }

  // flying again: everyone plays on
  release() {
    if (this.controlled) this.controlled.exit();
    this.controlled = null;
  }

  // Tab: the other child
  switch() {
    if (!this.controlled) return null;
    const prev = this.controlled;
    prev.exit();
    this.sel = (this.list.indexOf(prev) + 1) % this.list.length;
    const next = this.list[this.sel];
    next.camPitch = prev.camPitch; next.camDist = prev.camDist;
    this.controlled = next;
    next.take(true);
    this.shareTrail();
    return next;
  }

  update(dt, camera) {
    this.brains.forEach((b, i) => { b.cam = camera && camera.position; b.update(dt, this.list.filter((_, j) => j !== i)); });
    for (const k of this.list) k.update(dt);
  }
}
