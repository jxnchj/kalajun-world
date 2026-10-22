import * as THREE from "three";
import { OrbitControls } from "three/addons/controls/OrbitControls.js";
import { atmos, ATMOS_GLSL, createSky, updateAtmosphere } from "./atmosphere.js";
import { sunPosition, sunDirection } from "./sun.js";
import { createPost } from "./post.js";
import { Vegetation } from "./vegetation.js";
import { OBJ_SHADOW_GLSL, shadowUniforms } from "./shadows.js";
import { TOON_GLSL, NOISE_GLSL } from "./glsl.js";
import { worldUniforms } from "./world.js";

// Dev page: every meadow species planted on flat ground, for inspecting plant structure.
const canvas = document.getElementById("view");
const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, reversedDepthBuffer: true });
renderer.setPixelRatio(Math.min(devicePixelRatio, 1.5));
renderer.setSize(innerWidth, innerHeight, false);
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 0.9;
const scene = new THREE.Scene();
const camera = new THREE.PerspectiveCamera(35, innerWidth / innerHeight, 0.02, 50000);
const sky = createSky();
scene.add(sky);
atmos.uFogBase.value = 0;
atmos.uMistBase.value = -3000;
worldUniforms.uExag.value = 0;
const ground = new THREE.Mesh(new THREE.PlaneGeometry(200, 200).rotateX(-Math.PI / 2), new THREE.ShaderMaterial({
  uniforms: { ...atmos, ...shadowUniforms },
  vertexShader: `varying vec3 vW; void main(){ vec4 w = modelMatrix * vec4(position,1.0); vW = w.xyz; gl_Position = projectionMatrix * viewMatrix * w; }`,
  fragmentShader: `varying vec3 vW; ${ATMOS_GLSL} ${NOISE_GLSL} ${OBJ_SHADOW_GLSL} ${TOON_GLSL}
    void main(){ vec3 a = mix(vec3(0.09,0.2,0.05), vec3(0.16,0.28,0.07), fbm(vW.xz*0.5,3)); gl_FragColor = vec4(toonLight(a, vec3(0,1,0), 1.0, 0.0), 1.0);
    #include <tonemapping_fragment>
    #include <colorspace_fragment>
    }`,
}));
scene.add(ground);
const post = createPost(renderer, scene, camera);
const flat = { heightAt: () => 0 };
const veg = await Vegetation.create(flat);
await veg.addHifi("cosmos", "./assets/cosmos_hifi.glb", "./assets/cosmos_petal_hifi.png");
await veg.addHifi("grassclump", "./assets/grass_hifi.glb", "./assets/cosmos_petal_hifi.png");
await veg.addHifi("cosmos", "./assets/cosmos_hybrid.glb", null, 6, { mode: "m3", headAtlas: true });
for (const sp of veg.species) for (const list of Object.values(sp.alts || {})) for (const rec of list) rec.mesh.visible = true;
scene.add(veg.group);

const names = veg.species.map((s) => s.name).filter((n) => n !== "grassclump");
names.splice(1, 0, "cosmos_hifi", "cosmos_hybrid");
const list = [];
names.forEach((n, i) => {
  for (let k = 0; k < 5; k++) list.push([n, i * 1.4 - (names.length * 1.4) / 2 + (k % 2) * 0.35, (k - 2) * 0.45, null, k * 1.3]);
});
// grass comparison patch at z = -6: modelled clumps (method 2)
for (let i = 0; i < 12; i++)
  for (let j = 0; j < 12; j++) {
    const h = Math.sin(i * 12.9898 + j * 78.233) * 43758.5453;
    const r = h - Math.floor(h);
    list.push(["grassclump_hifi", -1.8 + i * 0.3 + r * 0.2, -7.8 + j * 0.3 + (1 - r) * 0.2, 0.8 + r * 0.4, r * 6.28]);
  }
veg.plant(list);
const controls = new OrbitControls(camera, canvas);
camera.position.set(0, 1.6, 6);
controls.target.set(0, 0.4, 0);
const sel = document.getElementById("sp");
sel.add(new Option("全部", "all"));
names.forEach((n) => sel.add(new Option(n, n)));
const focus = (n) => {
  if (n === "all") { camera.position.set(0, 2.2, 9); controls.target.set(0, 0.4, 0); return; }
  const i = names.indexOf(n), x = i * 1.4 - (names.length * 1.4) / 2;
  const h = (veg.species.find((q) => n.startsWith(q.name)) || veg.species[0]).height[1];
  controls.target.set(x + 0.15, h * 0.65, 0);
  camera.position.set(x + 0.15 + h * 0.9, h * 1.0 + 0.15, h * 1.6 + 0.4);
};
sel.onchange = () => focus(sel.value);
const sunDir = new THREE.Vector3();
const setTime = (m) => { const d = new Date(Date.UTC(2026, 6, 25, 0, 0) + (m - 480) * 60000); const s = sunPosition(42.95, 82.19, d); sunDirection(s.azimuth, s.elevation, sunDir); updateAtmosphere(sunDir); };
const te = document.getElementById("time");
te.oninput = () => setTime(+te.value);
setTime(+te.value);
const timer = new THREE.Timer();
function renderFrame(t) {
  timer.update(t);
  worldUniforms.uTime.value += timer.getDelta();
  controls.update();
  sky.position.copy(camera.position);
  post.render();
}
renderer.setAnimationLoop(renderFrame);
if (import.meta.env.DEV) {
  window.__vv = { focus, camera, controls, veg, setTime, THREE };
  import("./devtools.js").then((m) => m.installDevtools({ renderFrame: () => renderFrame(performance.now()), renderer, viewpoints: { active: null } }));
}
