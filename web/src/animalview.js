import * as THREE from "three";
import { OrbitControls } from "three/addons/controls/OrbitControls.js";
import { atmos, ATMOS_GLSL, createSky, updateAtmosphere } from "./atmosphere.js";
import { sunPosition, sunDirection } from "./sun.js";
import { createPost } from "./post.js";
import { OBJ_SHADOW_GLSL, shadowUniforms, ObjectShadows } from "./shadows.js";
import { TOON_GLSL, NOISE_GLSL } from "./glsl.js";
import { worldUniforms } from "./world.js";
import { AnimalKind, COATS } from "./animals.js";

// Dev page (animals.html): the sheep of tools/blender/animal.py with its clips, in the scene's light --
// a row of the coats playing one clip (cross-faded when another is picked), or a flock.
const canvas = document.getElementById("view");
const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, reversedDepthBuffer: true });
renderer.setPixelRatio(Math.min(devicePixelRatio, 1.5));
renderer.setSize(innerWidth, innerHeight, false);
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 0.9;
const scene = new THREE.Scene();
const camera = new THREE.PerspectiveCamera(35, innerWidth / innerHeight, 0.05, 50000);
const sky = createSky();
scene.add(sky);
atmos.uFogBase.value = 0;
atmos.uMistBase.value = -3000;
worldUniforms.uExag.value = 0;
const groundU = { ...atmos, ...shadowUniforms, uTravel: { value: 0 } };
const ground = new THREE.Mesh(new THREE.PlaneGeometry(400, 400).rotateX(-Math.PI / 2), new THREE.ShaderMaterial({
  uniforms: groundU,
  vertexShader: `varying vec3 vW; void main(){ vec4 w = modelMatrix * vec4(position,1.0); vW = w.xyz; gl_Position = projectionMatrix * viewMatrix * w; }`,
  fragmentShader: `uniform float uTravel; varying vec3 vW; ${ATMOS_GLSL} ${NOISE_GLSL} ${OBJ_SHADOW_GLSL} ${TOON_GLSL}
    void main(){
      vec2 q = vW.xz + vec2(0.0, uTravel);
      vec3 a = mix(vec3(0.09,0.2,0.05), vec3(0.16,0.28,0.07), fbm(q*0.5,3));
      a *= 0.85 + 0.3 * vnoise(q * 9.0);                       // speckle, to see the feet against
      float grid = 1.0 - smoothstep(0.0, 0.02, abs(fract(q.y) - 0.5) - 0.48);
      a = mix(a, a * 1.5, grid * 0.5);
      gl_FragColor = vec4(toonLight(a, vec3(0,1,0), objectShadow(vW, vec3(0,1,0)), 0.0), 1.0);
      gl_FragColor.rgb = applyAtmosphere(gl_FragColor.rgb, cameraPosition, vW);
      #include <tonemapping_fragment>
      #include <colorspace_fragment>
    }`,
}));
scene.add(ground);
const post = createPost(renderer, scene, camera);
const shadows = new ObjectShadows(renderer);
const controls = new OrbitControls(camera, canvas);

const status = document.getElementById("status");
const SP = new URLSearchParams(location.search).get("sp") || "sheep";
const spSel = document.getElementById("species");
spSel.value = SP;
spSel.onchange = () => { location.search = "?sp=" + spSel.value; };
const L_ = { sheep: 1, lamb: 0.75, cattle: 2.1, horse: 2.3, foal: 1.8, dog: 1, marmot: 0.55, eagle: 2 }[SP] || 1;     // body length against the sheep's: spacing and camera
const home = () => { camera.position.set(11.5 * L_, 1.9 * L_, 2.5 * L_); controls.target.set(0, 0.45 * L_, 0); };
home();
const sheep = await AnimalKind.load(`./assets/${SP}.glb`, SP, { terrain: false, lod: [[0, 0, 0, 0], [0, 0, 0, 0], [0, 0, 0, 0]] });
scene.add(sheep.group);
const LABEL = { idle: "站着", walk: "走", walk_graze: "边走边吃", trot: "小跑", run: "奔跑", graze: "吃草", look: "抬头张望",
  lie_down: "卧下", lie: "卧着反刍", get_up: "起身", stand: "直立放哨", stand_up: "站起来", stand_down: "趴下",
  glide: "滑翔", flap: "扇翅", flap_fast: "快扇" };
const coats = COATS[SP];
for (const b of document.querySelectorAll("[data-lod]")) b.textContent += ` ${sheep.lods[+b.dataset.lod].tris}面`;
document.getElementById("legend").textContent = "从左到右：" + coats.map((c) => c.name).join("、") + "；大小各差 ±10%";

// ---- state
const row = coats.map((c, i) => ({ x: 0, y: SP === "eagle" ? 1.2 : 0, z: -(i - (coats.length - 1) / 2) * 1.5 * L_, yaw: 0, size: [1, 0.92, 1.08, 0.96, 1.1, 0.9][i], coat: i }));
let cur = "graze", prev = null, tCur = 0, tPrev = 0, blend = 1, rate = 1, lod = 0, flock = null, queue = [];
const clipsEl = document.getElementById("clips");
for (const name of Object.keys(sheep.clips)) {
  const b = document.createElement("button");
  b.textContent = LABEL[name] || name;
  b.dataset.clip = name;
  b.onclick = () => { queue = []; play(name); };
  clipsEl.appendChild(b);
}
function play(name) {
  if (name === cur && blend >= 1) { tCur = 0; return; }
  prev = cur; tPrev = tCur; cur = name; tCur = 0; blend = 0;
  for (const b of clipsEl.children) b.classList.toggle("on", b.dataset.clip === cur);
}
play(sheep.clips.graze ? "graze" : Object.keys(sheep.clips)[0]); blend = 1;
document.getElementById("seq").onclick = () => { queue = ["lie", "get_up", "graze"]; play("lie_down"); };
const rateEl = document.getElementById("rate");
rateEl.oninput = () => { rate = +rateEl.value; document.getElementById("rate-v").textContent = rate.toFixed(2) + "×"; };
for (const b of document.querySelectorAll("[data-lod]")) b.onclick = () => {
  lod = +b.dataset.lod;
  for (const c of document.querySelectorAll("[data-lod]")) c.classList.toggle("on", c === b);
};
const tread = document.getElementById("tread");
document.getElementById("flock").onclick = (e) => {
  flock = flock ? null : makeFlock();
  e.target.classList.toggle("on", !!flock);
  if (flock) { camera.position.set(22 * L_, 6 * L_, 18 * L_); controls.target.set(0, 0.4, 0); }
  else home();
};
function makeFlock() {
  const out = [];
  let s = 7;
  const rnd = () => ((s = (s * 16807) % 2147483647) / 2147483647);
  const pick = ["graze", "graze", "graze", "graze", "walk_graze", "walk_graze", "look", "idle", "lie", "lie"];
  for (let i = 0; i < 80; i++) {
    const a = rnd() * 6.283, r = Math.sqrt(rnd()) * 14 * L_;
    out.push({ x: Math.cos(a) * r, y: 0, z: Math.sin(a) * r, yaw: rnd() * 6.283, size: 0.88 + rnd() * 0.26,
      coat: [0, 0, 0, 1, 1, 2, 3, 4, 5][Math.floor(rnd() * 9)], a: pick[Math.floor(rnd() * pick.length)], t: rnd() * 10 });
  }
  return out;
}

const sunDir = new THREE.Vector3();
const setTime = (m) => {
  const d = new Date(Date.UTC(2026, 6, 25, 0, 0) + (m - 480) * 60000);
  const sp = sunPosition(42.95, 82.19, d);
  sunDirection(sp.azimuth, sp.elevation, sunDir);
  updateAtmosphere(sunDir);
};
const te = document.getElementById("time");
te.oninput = () => setTime(+te.value);
setTime(+te.value);

const timer = new THREE.Timer();
const lists = [[], [], []];
function renderFrame(t) {
  timer.update(t);
  const dt = Math.min(timer.getDelta(), 0.1) * rate;
  worldUniforms.uTime.value += dt;
  for (const l of lists) l.length = 0;
  if (flock) {
    for (const s of flock) {
      s.t += dt;
      const sp = sheep.clips[s.a].speed;
      if (sp) {   // the walkers move on (at their clip's speed for their size), round the pasture
        s.x += Math.sin(s.yaw) * sp * s.size * dt; s.z += Math.cos(s.yaw) * sp * s.size * dt;
        if (Math.hypot(s.x, s.z) > 15 * L_ && s.x * Math.sin(s.yaw) + s.z * Math.cos(s.yaw) > 0) s.yaw += Math.PI;
      }
      const d = camera.position.distanceTo(new THREE.Vector3(s.x, 0.4, s.z));
      const li = d < 25 * L_ ? 0 : d < 70 * L_ ? 1 : 2;
      lists[li].push({ ...s, clip: s.a, ct: s.t });
    }
  } else {
    tCur += dt; tPrev += dt;
    blend = Math.min(1, blend + dt / 0.35);
    const c = sheep.clips[cur];
    if (!c.loop && tCur >= sheep.duration(cur) && queue.length) play(queue.shift());
    // a gait on the treadmill: the ground slides back at the clip's speed, each sheep's clip runs at
    // the rate its size needs to keep its feet on it
    const moving = tread.checked && c.speed;
    if (moving) groundU.uTravel.value += c.speed * dt;
    for (const s of row) {
      const k = moving ? 1 / s.size : 1;
      const e = { clip: cur, ct: tCur * k, prev, pt: tPrev, bl: blend };
      lists[lod].push({ ...s, ...e });
    }
  }
  lists.forEach((l, i) => sheep.draw(i, l));
  sheep.eye.value.copy(camera.position);
  controls.update();
  sky.position.copy(camera.position);
  shadows.update(camera, sunDir, scene, [sheep.group]);
  post.render();
  const tris = lists.reduce((a, l, i) => a + l.length * sheep.lods[i].tris, 0);
  status.textContent = `${LABEL[cur] || cur}${flock ? "（一群）" : ""} · ${Math.round(tris / 1000)}k 三角面`;
}
renderer.setAnimationLoop(renderFrame);
addEventListener("resize", () => {
  renderer.setSize(innerWidth, innerHeight, false);
  camera.aspect = innerWidth / innerHeight;
  camera.updateProjectionMatrix();
  post.setSize?.(innerWidth, innerHeight);
});
if (import.meta.env.DEV) window.__av = { sheep, camera, controls, play, renderFrame: () => renderFrame(performance.now()) };
