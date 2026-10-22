import * as THREE from "three";
import { OrbitControls } from "three/addons/controls/OrbitControls.js";
import * as SkeletonUtils from "three/addons/utils/SkeletonUtils.js";
import { atmos, ATMOS_GLSL, createSky, updateAtmosphere } from "./atmosphere.js";
import { sunPosition, sunDirection } from "./sun.js";
import { createPost } from "./post.js";
import { loadAsset, stylise, assetUniforms } from "./assets.js";
import { ObjectShadows, OBJ_SHADOW_GLSL, shadowUniforms } from "./shadows.js";
import { TOON_GLSL, NOISE_GLSL } from "./glsl.js";
import { worldUniforms } from "./world.js";

// Dev page: inspect one Blender-built GLB under the scene's golden-hour lighting.
const ASSETS = ["cabin_small", "lodge", "yurt", "yurt_deck", "gh_lanchuan", "gh_lanchuan_lodge", "gh_fj_shed", "gh_fj_lodge", "gh_fj_hut", "gh_qk_long", "gh_qk_cabin", "gh_tl_main", "gh_tl_wing", "spruce_hi", "spruce_mid", "swing", "rocks", "cosmos", "horse", "grass_hifi", "cosmos_hifi", "character", "schoolboy"];

const canvas = document.getElementById("view");
const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, reversedDepthBuffer: true });
renderer.setPixelRatio(Math.min(devicePixelRatio, 1.5));
renderer.setSize(innerWidth, innerHeight, false);
renderer.toneMapping = THREE.NeutralToneMapping;
const scene = new THREE.Scene();
const camera = new THREE.PerspectiveCamera(40, innerWidth / innerHeight, 0.1, 50000);
const sky = createSky();
scene.add(sky);
// the viewer sits at altitude 0: move the (real-altitude) fog and valley mist out of the way
atmos.uFogBase.value = 0;
atmos.uMistBase.value = -3000;

// flat meadow ground that receives object shadows
const ground = new THREE.Mesh(
  new THREE.PlaneGeometry(400, 400).rotateX(-Math.PI / 2),
  new THREE.ShaderMaterial({
    uniforms: { ...atmos, ...shadowUniforms, ...worldUniforms },
    vertexShader: /* glsl */ `varying vec3 vW; void main(){ vec4 w = modelMatrix * vec4(position,1.0); vW = w.xyz; gl_Position = projectionMatrix * viewMatrix * w; }`,
    fragmentShader: /* glsl */ `
      varying vec3 vW;
      ${ATMOS_GLSL}
      ${NOISE_GLSL}
      ${OBJ_SHADOW_GLSL}
      ${TOON_GLSL}
      void main(){
        vec3 n = vec3(0.0,1.0,0.0);
        vec3 a = mix(vec3(0.1,0.24,0.05), vec3(0.2,0.33,0.07), fbm(vW.xz*0.08, 3));
        vec3 c = toonLight(a, n, objectShadow(vW, n), 0.0);
        gl_FragColor = vec4(applyAtmosphere(c, cameraPosition, vW), 1.0);
        #include <tonemapping_fragment>
        #include <colorspace_fragment>
      }`,
  })
);
scene.add(ground);

const post = createPost(renderer, scene, camera);
const shadows = new ObjectShadows(renderer, { size0: 60, size1: 200 });
const controls = new OrbitControls(camera, canvas);
controls.enableDamping = true;
const sunDir = new THREE.Vector3();

function setTime(minutes) {
  const d = new Date(Date.UTC(2026, 6, 25, 0, 0) + (minutes - 480) * 60000);
  const s = sunPosition(42.95, 82.19, d);
  sunDirection(s.azimuth, s.elevation, sunDir);
  updateAtmosphere(sunDir);
  assetUniforms.uNight.value = THREE.MathUtils.smoothstep(-s.elevation, -3, 3);
}
const timeEl = document.getElementById("time");
timeEl.oninput = () => setTime(+timeEl.value);
setTime(+timeEl.value);

let current = null;
let mixer = null;
const clock = new THREE.Timer();
const sel = document.getElementById("asset");
for (const a of ASSETS) sel.add(new Option(a, a));
const want = new URLSearchParams(location.search).get("a") || "cabin_small";
sel.value = want;
sel.onchange = () => show(sel.value);

async function show(name) {
  if (current) scene.remove(current);
  const gltf = await loadAsset(`./assets/${name}.glb`);
  current = stylise(name.startsWith("horse") ? SkeletonUtils.clone(gltf.scene) : gltf.scene.clone(true));
  scene.add(current);
  if (gltf.animations.length) {
    mixer = new THREE.AnimationMixer(current);
    const clip = gltf.animations.find((a) => a.name === "Eating") || gltf.animations[0];
    mixer.clipAction(clip).play();
  }
  const box = new THREE.Box3().setFromObject(current);
  const size = box.getSize(new THREE.Vector3());
  const c = box.getCenter(new THREE.Vector3());
  controls.target.copy(c);
  const r = size.length() * 0.75;
  camera.position.set(c.x - r * 0.9, c.y + r * 0.35, c.z + r * 0.9);
  let tris = 0;
  current.traverse((o) => o.isMesh && (tris += (o.geometry.index ? o.geometry.index.count : o.geometry.attributes.position.count) / 3));
  document.getElementById("info").textContent = `${size.x.toFixed(1)}×${size.y.toFixed(1)}×${size.z.toFixed(1)} m · ${Math.round(tris)} tris`;
}
await show(want);

function renderFrame(t) {
  clock.update(t);
  if (mixer) mixer.update(clock.getDelta());
  controls.update();
  sky.position.copy(camera.position);
  if (current) shadows.update(camera, sunDir, scene, [current]);
  post.render();
}
renderer.setAnimationLoop(renderFrame);
addEventListener("resize", () => {
  renderer.setSize(innerWidth, innerHeight, false);
  post.setSize(innerWidth, innerHeight);
  camera.aspect = innerWidth / innerHeight;
  camera.updateProjectionMatrix();
});

if (import.meta.env.DEV) {
  window.__v = { THREE, camera, controls, show, setTime, scene, renderer };
  import("./devtools.js").then((m) => m.installDevtools({ renderFrame, renderer, viewpoints: { active: null } }));
}
