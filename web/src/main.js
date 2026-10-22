import * as THREE from "three";
import { Terrain } from "./terrain.js";
import { atmos, createSky, updateAtmosphere, daylight } from "./atmosphere.js";
import { sunPosition, sunDirection, beijingTime } from "./sun.js";
import { FlyControls } from "./controls.js";
import { Viewpoints } from "./viewpoints.js";
import { SunShadows, worldUniforms } from "./world.js";
import { createPost } from "./post.js";
import { Forest } from "./trees.js";
import { Grass } from "./grass.js";
import { Flowers } from "./flowers.js";
import { Butterflies } from "./butterflies.js";
import { Streams } from "./streams.js";
import { Trails } from "./trails.js";
import { Character, PLAY } from "./character.js";
import { Kids } from "./kids.js";
import { Shrubs } from "./shrubs.js";
import { Vegetation, cosmosPainted, cosmosBillboard, grassPainted } from "./vegetation.js";
import { MidPlants } from "./midplants.js";
import { buildPropMask } from "./props.js";
import { buildSlice } from "./slice.js";
import { assetUniforms } from "./assets.js";
import { ObjectShadows } from "./shadows.js";

const canvas = document.getElementById("view");
const loadingMsg = document.getElementById("loading-msg");

const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, reversedDepthBuffer: true, powerPreference: "high-performance" });
renderer.setPixelRatio(Math.min(window.devicePixelRatio, 1.5));
renderer.setSize(window.innerWidth, window.innerHeight, false);
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 0.9;
worldUniforms.uToneExposure.value = renderer.toneMappingExposure;
renderer.outputColorSpace = THREE.SRGBColorSpace;

const scene = new THREE.Scene();
const camera = new THREE.PerspectiveCamera(50, window.innerWidth / window.innerHeight, 0.5, 200000);
const sky = createSky();
scene.add(sky);

const meta = await fetch("./data/scene.json").then((r) => r.json());
const terrain = await new Terrain().load(meta).catch((e) => {
  loadingMsg.textContent = "加载失败：" + e.message;
  throw e;
});
scene.add(terrain.mesh);
const shadows = new SunShadows(renderer, terrain, atmos);
const post = createPost(renderer, scene, camera);
const forest = new Forest();
scene.add(forest.group);
// the lodge where photos 1-5 were taken: centre of the cosmos beds
const lodge = meta.viewpoints.slice(0, 5).reduce((a, v) => ({ x: a.x + v.x / 5, z: a.z + v.z / 5 }), { x: 0, z: 0 });
const grass = new Grass();
scene.add(grass.group);
const flowers = new Flowers(lodge);
scene.add(flowers.mesh);
const streams = await Streams.create(terrain);
scene.add(streams.mesh);
const trails = await Trails.create(terrain);
scene.add(trails.mesh);
const plants = await Vegetation.create(terrain);
scene.add(plants.group);
const butterflies = new Butterflies(plants, terrain);
scene.add(butterflies.mesh);
{
  const t = await new THREE.TextureLoader().loadAsync("./assets/sward_top.png");
  t.wrapS = t.wrapT = THREE.RepeatWrapping; t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = 8;
  worldUniforms.uSward.value = t;
}
const shrubs = await Shrubs.create();
scene.add(shrubs.mesh);
// the meadow plants 9-45 m out: pictures of the modelled plants, standing where they stand
const midPlants = new MidPlants(plants, renderer);
scene.add(midPlants.mesh);
// grass seed heads from the second texture batch: fescue panicle B3, stipa awns B4, timothy B5
grass.setAtlas(plants.atlas, { ...plants.rects, panicle: plants.rects.panicle_v2, stipa: plants.rects.stipa_v2, foxtail: plants.rects.timothy });
// near-range flora render modes (press H to cycle and compare):
//   base = procedural plants, m1 = AI-painted sprites (method 1), m2 = Blender-modelled (method 2)
await plants.addHifi("cosmos", "./assets/cosmos_hifi.glb", "./assets/cosmos_petal_hifi.png", 6);
await plants.addPainted("cosmos", cosmosPainted, 0, 6);
await plants.addPainted("cosmos", cosmosBillboard, 6, 17);
// m3 = hybrid: the modelled plant (method 2) with each petal textured by the matching petal of
// the AI-painted flower heads (method 1), plus translucent glow
await plants.addHifi("cosmos", "./assets/cosmos_hybrid.glb", null, 6, { mode: "m3", headAtlas: true, density: 0.8 });
const MODES = ["base", "m1", "m2", "m3"], MODE_NAMES = { base: "程序化植物", m1: "方法1 · AI 手绘贴图", m2: "方法2 · Blender 建模", m3: "结合版 · 立体花瓣 + 手绘花头" };
// (the modelled / painted grass clumps of the method comparison are gone: identical tufts in
// rows read as a rice paddy; the blade sward of grass.js covers the near range)
const setMode = (m) => { plants.setMode(m); grass.hifiR.value = 0; floraMode = m; };
let floraMode = "m3";
setMode("m3");
window.addEventListener("keydown", (e) => { if (e.code === "KeyH" && e.target.tagName !== "INPUT") setMode(MODES[(MODES.indexOf(floraMode) + 1) % MODES.length]); });
// [ / ] flower abundance: one factor for the modelled plants, the flower rings and the far
// meadow colour together, so near and far stay in step
window.addEventListener("keydown", (e) => {
  if (e.target.tagName === "INPUT" || (e.code !== "BracketLeft" && e.code !== "BracketRight")) return;
  const f = worldUniforms.uFlora;
  f.value = Math.min(3, Math.max(0.25, +(f.value * (e.code === "BracketRight" ? 1.25 : 0.8)).toFixed(3)));
  plants.last.set(1e9, 1e9);   // re-place the near plants
});

// local architecture, placed from the photos + OpenStreetMap (tools/place_objects.py)
const objects = await fetch("./data/objects.json").then((r) => r.json());
worldUniforms.uPropMask.value = buildPropMask(objects, lodge, 2048);
worldUniforms.uMaskOrigin.value.set(lodge.x - 1024, lodge.z - 1024);
worldUniforms.uMaskSize.value = 2048;
const landcoverAt = terrain.landcoverSampler();
const maskCanvas = worldUniforms.uPropMask.value.image.getContext("2d").getImageData(0, 0, 2048, 2048).data;
const maskAt = (x, z) => {
  const i = Math.floor(x - lodge.x + 1024), j = Math.floor(z - lodge.z + 1024);
  return i < 0 || j < 0 || i >= 2048 || j >= 2048 ? 0 : maskCanvas[(j * 2048 + i) * 4] / 255;
};
loadingMsg.textContent = "正在加载模型…";
const slice = await buildSlice({ scene, terrain, objects, landcoverAt, maskAt, centre: new THREE.Vector3(lodge.x, 0, lodge.z), viewpoints: meta.viewpoints, maskTexture: worldUniforms.uPropMask.value });
// no plants in the houses, on their porches and steps, in yurts and sheds (the prop mask, and the
// buildings as modelled)
plants.excludeAt = (x, z) => (maskAt(x, z) > 0.1 || slice.collision.occupied(x, z) ? 1 : 0);
butterflies.blockedAt = (x, z) => slice.collision.occupied(x, z);
slice.floor.streams = streams;   // stones along and in the brooks
const objShadows = new ObjectShadows(renderer, { size0: 70, size1: 460, res: 2048 });
// the two children round 岚川 (kids.js): the walker and the schoolboy; T walks with one, Tab the other
const kidOpts = { scene, camera, dom: canvas, terrain, collision: slice.collision };
// where the cosmos grows round 岚川 (tools/veg_map.py: round the guest block, and the beds before the
// public building): spots for a child to crouch and smell one
const flowerSpots = [];
for (const g of objects.guesthouses || []) {
  if (Math.hypot(g.x + 1990, g.z - 3430) > 80 || !g.pad) continue;
  const c = Math.cos(g.rot), s = Math.sin(g.rot), W = (lx, lz) => ({ x: g.x + lx * c + lz * s, z: g.z - lx * s + lz * c });
  const [cx, cz, hx, hz] = g.pad;
  if (g.cosmos)
    for (const off of [1.4, 2.6]) for (let t = -hx; t <= hx; t += 1.6) for (const sd of [-1, 1]) flowerSpots.push(W(cx + t, cz + sd * (hz + off)));
  for (const [bx, bz, bhx, bhz] of g.cosmos_beds || [])
    for (let u = -bhx + 0.8; u <= bhx; u += 1.6) for (let v = -bhz + 0.8; v <= bhz; v += 1.6) flowerSpots.push(W(bx + u, bz + v));
}
const kids = new Kids([new Character({ ...kidOpts, profile: "walker" }), new Character({ ...kidOpts, profile: "schoolboy" })], {
  home: { x: -1990, z: 3430 }, radius: 26, terrain, collision: slice.collision, trail: worldUniforms.uTrail.value, flowers: flowerSpots,
  starts: [{ x: -1981, z: 3425, facing: 2.6 }, { x: -1999, z: 3431, facing: 0.6 }],   // (between the two houses)
});
for (const k of kids.list) k.doors = slice.doors;
console.info("ledges to sit on round 岚川:", kids.findLedges().length);
const shrubProbe = shrubs.probe(terrain);   // the shrubs round the walker, read back from the GPU placement
slice.collision.addProvider(shrubProbe.query);
slice.livestock.walkers = slice.herd.walkers = kids.list;   // sheep, cattle and horses step out of the way

// --- time of day ---
const state = { date: beijingTime("2026-07-25 21:20:00") }; // golden hour, as in photos 2-3
const timeInput = document.getElementById("time");
const timeLabel = document.getElementById("time-label");
const sunDir = new THREE.Vector3();

function setTime(date) {
  state.date = date;
  const bj = new Date(date.getTime() + 8 * 3600e3); // shift so UTC fields read as Beijing time
  const minutes = bj.getUTCHours() * 60 + bj.getUTCMinutes();
  timeInput.value = minutes;
  const s = sunPosition(meta.lat, meta.lon, date);
  sunDirection(s.azimuth, s.elevation, sunDir);
  updateAtmosphere(sunDir);
  // the exposure of a day lit from high up: less than the evening's (as an eye or a camera
  // would take it), the glow round bright things less too
  const day = daylight(sunDir);
  renderer.toneMappingExposure = worldUniforms.uToneExposure.value = 0.9 - 0.25 * day;
  post.bloom.strength = 0.32 - 0.18 * day;
  shadows.update(sunDir);
  assetUniforms.uNight.value = THREE.MathUtils.smoothstep(-s.elevation, -3, 3); // lights on after sunset
  const pad = (n) => String(n).padStart(2, "0");
  timeLabel.textContent = `${bj.getUTCMonth() + 1}月${bj.getUTCDate()}日 ${pad(bj.getUTCHours())}:${pad(bj.getUTCMinutes())}（北京时间） · 太阳高度 ${s.elevation.toFixed(1)}°`;
}
timeInput.addEventListener("input", () => {
  const bj = new Date(state.date.getTime() + 8 * 3600e3);
  const m = +timeInput.value;
  bj.setUTCHours(Math.floor(m / 60), m % 60, 0);
  setTime(new Date(bj.getTime() - 8 * 3600e3));
});
setTime(state.date);

// --- camera & controls ---
const controls = new FlyControls(camera, canvas, terrain);
// T: walk (third person) / fly
function toggleWalk() {
  if (kids.controlled) {
    kids.release();
    camera.near = 0.5; camera.updateProjectionMatrix();
    const d = new THREE.Vector3(); camera.getWorldDirection(d);
    controls.setPose(camera.position.clone(), Math.atan2(d.x, -d.z) * 180 / Math.PI, Math.asin(d.y) * 180 / Math.PI);
  } else {
    if (viewpoints.active) viewpoints.exit();
    kids.take();
    camera.near = 0.05; camera.updateProjectionMatrix();   // close to the face without clipping it (reversed float depth keeps the far range)
  }
  updateBar();
}
window.addEventListener("keydown", (e) => {
  if (e.target.tagName === "INPUT") return;
  if (e.code === "Tab" && kids.controlled) { e.preventDefault(); kids.switch(); updateBar(); return; }   // the other child
  if (e.code === "KeyT") toggleWalk();
  else if (kids.controlled) setTimeout(updateBar, 50);   // (sitting down, running chosen: the buttons show it)
});

// walking: buttons for what the keys do (walk or run, walking on by itself, jumping, the gestures,
// the camera back behind, the other child, flying again); their keys shown on them
const walkBar = document.getElementById("walk-bar");
const walkMore = document.getElementById("walk-more");
const walkStart = document.getElementById("walk-start");
const helpLine = document.querySelector("#hud-bottom .help");
const vpStrip = document.getElementById("vp-strip");
const FLY_HELP = helpLine.textContent;
const WALK_HELP = "左键拖 转镜头 · 右键拖 转身 · 两键齐按 往前走 · W/S 前进/后退 · A/D 转身（按住右键时平移）· / 走跑切换 · 滚轮 远近";
function updateBar() {
  const k = kids.controlled;
  walkBar.hidden = !k; walkStart.hidden = !!k; vpStrip.hidden = !!k;
  helpLine.textContent = k ? WALK_HELP : FLY_HELP;
  if (!k) return;
  for (const b of walkBar.querySelectorAll("button")) {
    let on = false;
    if (b.dataset.run !== undefined) on = (b.dataset.run === "1") === PLAY.run;
    else if (b.dataset.do === "auto") on = k.auto;
    else if (b.dataset.do === "skip") on = k.skip;
    else if (b.dataset.do === "more") on = !walkMore.hidden;
    else if (b.dataset.mode) {
      on = k.mode === b.dataset.mode;
      if (b.dataset.on) {   // (sitting: the button gets up)
        b.dataset.off = b.dataset.off || b.firstChild.textContent;
        b.firstChild.textContent = on ? b.dataset.on + " " : b.dataset.off;
      }
    }
    b.classList.toggle("on", on);
  }
}
walkBar.addEventListener("mousedown", (e) => e.preventDefault());   // (the keyboard stays with the scene: Space jumps, not "clicks")
walkStart.addEventListener("mousedown", (e) => e.preventDefault());
walkStart.addEventListener("click", toggleWalk);
walkBar.addEventListener("click", (e) => {
  const b = e.target.closest("button"), k = kids.controlled;
  if (!b || !k) return;
  const act = b.dataset.do;
  if (b.dataset.run !== undefined) PLAY.run = b.dataset.run === "1";
  else if (b.dataset.key) k.command(b.dataset.key);
  else if (act === "auto") k.toggleAuto();
  else if (act === "jump") { k.wake(); k.pulse("Space"); }
  else if (act === "skip") k.skip = !k.skip;
  else if (act === "more") walkMore.hidden = !walkMore.hidden;
  else if (act === "behind") k.behind();
  else if (act === "switch") kids.switch();
  else if (act === "fly") toggleWalk();
  updateBar();
  setTimeout(updateBar, 400);   // (a posture takes a moment to settle)
});
const viewpoints = new Viewpoints({ meta, camera, controls, terrain, onTime: setTime, container: document.body });

// start above the photo site, looking north toward Kurdai Canyon
{
  const v = meta.viewpoints[0];
  const g = terrain.heightAt(v.x, v.z + 1500);
  controls.setPose(new THREE.Vector3(v.x, g + 350, v.z + 1500), 5, -8);
}

// --- HUD readout ---
const readout = document.getElementById("readout");
const dirs = ["北", "东北", "东", "东南", "南", "西南", "西", "西北"];
// Wind (glsl.js windQ): the wind of the moment U goes through spells of random length, not a cycle:
// still air (0-0.6 m/s, ~1/4 of the time), light airs (0.8-2 m/s, most often), a breeze (2.4-4 m/s), now
// and then a fresher spell (4.5-6.5 m/s, rarer and shorter); each change takes 4-15 s; within a spell the
// wind wanders a little (value noise in time, never repeating). The direction veers a little. uWindOff
// integrates U: the gust patches drift at the wind's speed, the canopy puffs at 1.3x. uWindStr = U / 4 m/s.
const U_REF = 4;
const SPELLS = [   // [share, U from, U to (m/s), lasting from, to (s)]
  [0.25, 0.0, 0.6, 30, 120], [0.37, 0.8, 2.0, 30, 150], [0.27, 2.4, 4.0, 20, 90], [0.11, 4.5, 6.5, 10, 40],
];
const wind = { hist: [], u: 1.4, target: 1.4, next: 40, a0: Math.atan2(-0.6, 0.8), a: Math.atan2(-0.6, 0.8), aTarget: Math.atan2(-0.6, 0.8), seed: (Date.now() % 100000) + 7, ph: 0 };
window.__wind = wind;
function windRand() { wind.seed = (wind.seed * 16807) % 2147483647; return wind.seed / 2147483647; }
function noise1(x) { const i = Math.floor(x), f = x - i, h = (n) => { const v = Math.sin(n * 127.1 + 311.7) * 43758.5453; return v - Math.floor(v); }; return h(i) + (h(i + 1) - h(i)) * f * f * (3 - 2 * f); }
function updateWind(dt, t) {
  if (t >= wind.next) {
    let r = windRand(), k = 0;
    while (k < SPELLS.length - 1 && r > SPELLS[k][0]) r -= SPELLS[k++][0];
    const [, u0, u1, d0, d1] = SPELLS[k];
    wind.target = u0 + (u1 - u0) * windRand();
    wind.rise = 4 + 11 * windRand();
    wind.aTarget = wind.a0 + (windRand() - 0.5) * 0.7;
    wind.next = t + d0 + (d1 - d0) * windRand();
  }
  wind.u += (wind.target - wind.u) * Math.min(1, dt / (wind.rise || 4));
  wind.a += (wind.aTarget - wind.a) * Math.min(1, dt / 10);
  wind.ph += dt;
  const wander = (noise1(wind.ph * 0.13) - 0.5) * 0.3 + (noise1(wind.ph * 0.41 + 17) - 0.5) * 0.15;
  const U = Math.max(0, wind.u * (1 + wander));
  const d = worldUniforms.uWindDir.value.set(Math.cos(wind.a), Math.sin(wind.a));
  worldUniforms.uWindStr.value = U / U_REF;
  worldUniforms.uWindOff.value.addScaledVector(d, U * dt);
  // keep a third of a second of history for the plants' spring-back (glsl.js windBendPush)
  wind.hist.push([t, worldUniforms.uWindOff.value.x, worldUniforms.uWindOff.value.y, U / U_REF]);
  while (wind.hist.length > 2 && wind.hist[1][0] <= t - 0.33) wind.hist.shift();
  const h = wind.hist[0];
  worldUniforms.uTimePrev.value = h[0];
  worldUniforms.uWindOffPrev.value.set(h[1], h[2]);
  worldUniforms.uWindStrPrev.value = h[3];
}

function updateReadout(fps, nodes) {
  const p = camera.position;
  const ground = terrain.heightAt(p.x, p.z);
  const yaw = ((controls.yaw % 360) + 360) % 360;
  readout.textContent =
    `海拔 ${p.y.toFixed(0)} m（离地 ${(p.y - ground).toFixed(0)} m）\n` +
    `朝向 ${yaw.toFixed(0)}° ${dirs[Math.round(yaw / 45) % 8]} · 速度 ${controls.speed.toFixed(0)} m/s\n` +
    `${fps.toFixed(0)} fps · 地形块 ${nodes}\n近景植物：${MODE_NAMES[floraMode]}（H 切换）\n花量 ×${worldUniforms.uFlora.value.toFixed(2)}（[ ] 调节，远近同步）\n${kids.controlled ? "步行中（动作见下方按钮）" : "T 下地步行（第三人称）"}`;
  updateBar();
}

function resize() {
  renderer.setSize(window.innerWidth, window.innerHeight, false);
  post.setSize(window.innerWidth, window.innerHeight);
  camera.aspect = window.innerWidth / window.innerHeight;
  camera.updateProjectionMatrix();
  viewpoints.layout();
}
window.addEventListener("resize", resize);

// --- loop ---
const timer = new THREE.Timer();
let fpsAcc = 0, fpsN = 0, fps = 60, hudT = 0;
// one full frame update; also used by dev snapshots so they never capture stale state
function renderFrame(dt) {
  worldUniforms.uTime.value += dt;
  updateWind(dt, worldUniforms.uTime.value);
  atmos.uCloudTime.value += dt;
  slice.update(camera, worldUniforms.uTime.value, Math.max(dt, 1 / 60));
  const walking = kids.controlled;
  if (walking) shrubProbe.update(renderer, walking.pos.x, walking.pos.z);
  kids.update(dt, camera);               // (both children live on; the controlled one leads the camera)
  if (!walking) controls.update(dt);
  sky.position.copy(camera.position);
  worldUniforms.uViewer.value.copy(camera.position);
  assetUniforms.uCamIndoor.value = kids.controlled ? kids.controlled.indoor || 0 : 0;
  const nodes = terrain.update(camera);
  camera.userData.aboveGround = controls.heightAboveGround();
  forest.update(camera);
  grass.update(camera);
  flowers.update(camera);
  shrubs.update(camera);
  plants.update(camera);
  plants.sway(dt, worldUniforms);
  midPlants.update(camera);
  butterflies.update(camera, dt, worldUniforms.uTime.value);
  trails.update(camera);
  if (worldUniforms.uFarRef.value > 0.5) grass.group.visible = flowers.mesh.visible = plants.group.visible = midPlants.mesh.visible = shrubs.mesh.visible = butterflies.mesh.visible = false;   // calibration: far shading only
  objShadows.update(camera, sunDir, scene, [slice.root, forest.group, ...kids.list.map((k) => k.figure)]);   // (the children too: their depth-only material)
  post.updateSun(sunDir, camera);
  post.render();
  return nodes;
}

function frame(t) {
  timer.update(t);
  const dt = Math.min(timer.getDelta(), 0.1);

  const nodes = renderFrame(dt);
  fpsAcc += dt; fpsN++;
  if ((hudT += dt) > 0.25) {
    fps = fpsN / fpsAcc; fpsAcc = 0; fpsN = 0; hudT = 0;
    updateReadout(fps, nodes);
  }
  requestAnimationFrame(frame);
}
requestAnimationFrame(frame);

const loading = document.getElementById("loading");
loading.style.opacity = 0;
setTimeout(() => loading.remove(), 700);

// debug handle for automated checks
if (import.meta.env.DEV) {
  window.__scene = { THREE, renderer, scene, camera, terrain, controls, viewpoints, setTime, shadows, post, atmos, worldUniforms, forest, grass, flowers, shrubs, plants, midPlants, butterflies, streams, trails, kids, setMode, slice, objects, objShadows, renderFrame,
    get character() { return kids.controlled || kids.list[kids.sel]; } };
  import("./devtools.js").then((m) => {
    m.installDevtools({ renderFrame, renderer, viewpoints });
    m.installHeroShots({ THREE, terrain, controls, viewpoints, objects, setTime, slice, renderFrame, worldUniforms });
  });
}
