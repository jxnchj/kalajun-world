import * as THREE from "three";
import { GLTFLoader } from "three/addons/loaders/GLTFLoader.js";
import { atmos, ATMOS_GLSL } from "./atmosphere.js";
import { NOISE_GLSL, HEIGHT_GLSL, LANDCOVER_GLSL, SHADOW_GLSL, TOON_GLSL, MEADOW_GLSL } from "./glsl.js";
import { worldUniforms } from "./world.js";
import { OBJ_SHADOW_GLSL, shadowUniforms, markCaster } from "./shadows.js";

// Stylised material for GLB assets built in Blender (tools/blender/*.py). Uses the embedded
// base-colour texture, baked vertex AO (COLOR_0), toon lighting, terrain + object shadows,
// and night emission for glass / lamps. Works for plain, instanced and skinned meshes.

export const assetUniforms = { uNight: { value: 0 }, uCamIndoor: { value: 0 } };   // (uCamIndoor: main.js, the walker's camera in a room)

const VERT = /* glsl */ `
#include <common>
#include <skinning_pars_vertex>
#include <logdepthbuf_pars_vertex>
attribute vec4 color;
uniform float uCurvature;
uniform float uSway;       // trees: how much the wind moves them (0: rigid; setSway)
uniform float uKind;
uniform vec3 uViewer;      // the viewer (world.js; = cameraPosition except in the shadow pass)
${NOISE_GLSL}
${MEADOW_GLSL}
varying vec2 vUv;
varying vec3 vNormal;
varying vec3 vWorld;
varying float vAO;
varying float vSky;
varying float vH;
varying vec3 vCrownN;
varying float vLodD;
void main() {
  vUv = uv;
  #ifdef HAS_AO
    vAO = color.r;
    vSky = color.b;   // (houses: how much open sky the vertex sees, tools/blender/lib.py; else = AO)
  #else
    vAO = 1.0;
    vSky = 1.0;
  #endif
  #include <beginnormal_vertex>
  #include <skinbase_vertex>
  #include <skinnormal_vertex>
  #include <begin_vertex>
  #include <skinning_vertex>
  vec4 wp = vec4(transformed, 1.0);
  vec3 wn = objectNormal;
  #ifdef USE_INSTANCING
    wp = instanceMatrix * wp;
    wn = mat3(instanceMatrix) * wn;
  #endif
  // soft "volume" normal for foliage: radial from the local vertical axis
  vec3 cn = vec3(transformed.x, (transformed.y - 9.0) * 0.3 + 1.2, transformed.z);
  #ifdef USE_INSTANCING
    cn = mat3(instanceMatrix) * cn;
  #endif
  vCrownN = normalize(mat3(modelMatrix) * cn);
  wp = modelMatrix * wp;
  #ifdef USE_INSTANCING
  if (uSway > 0.0) {
    // trees in the wind (glsl.js windQ): the whole tree leans a little with the gusts and swings
    // slowly (~0.3 Hz), the more the higher up; the branch tips stir in the eddies, the more the
    // farther out from the stem (shadows move with them: the shadow pass shares this code)
    vec3 o = (modelMatrix * instanceMatrix[3]).xyz;
    float H = 18.0 * length(instanceMatrix[1].xyz);
    float yh = clamp((wp.y - o.y) / H, 0.0, 1.2);
    vec2 wd = windDirAt(o.xz);
    float wb = windBend(o.xz);
    float seed = fract(o.x * 0.1317 + o.z * 0.2171);
    vec2 sw = wd * uSway * (0.02 * wb + 0.008 * tnoise(uTime * 0.32 + seed * 20.0, seed) * (0.06 + wb)) * yh * yh * H;
    float r = length(transformed.xz) * length(instanceMatrix[0].xyz);
    float tip = uSway * 0.035 * r * (0.04 + 1.5 * wb) * (uKind == 5.0 ? 1.0 : 0.3);
    sw += (wd * tnoise(uTime * 1.4 + seed * 7.0 + yh * 3.0, seed + 1.0) + vec2(-wd.y, wd.x) * 0.6 * tnoise(uTime * 1.1 + yh * 2.5 + seed * 3.0, seed + 2.0)) * tip;
    wp.xz += sw;
  }
  #endif
  vNormal = normalize(mat3(modelMatrix) * wn);
  vWorld = wp.xyz;
  // distance of the instance (its origin) from the viewer, for uLod (the viewer, not the camera:
  // the shadow pass renders from the sun, and must keep the same trees)
  #ifdef USE_INSTANCING
    vLodD = length((modelMatrix * instanceMatrix[3]).xz - uViewer.xz);
  #else
    vLodD = length((modelMatrix[3]).xz - uViewer.xz);
  #endif
  vH = transformed.y;
  #ifndef SHADOW_PASS
    vec2 dh = wp.xz - cameraPosition.xz;
    wp.y -= dot(dh, dh) * uCurvature;
  #endif
  gl_Position = projectionMatrix * viewMatrix * wp;
  #include <logdepthbuf_vertex>
}
`;

const FRAG = /* glsl */ `
#include <common>
#include <logdepthbuf_pars_fragment>
uniform sampler2D map;
uniform float uHasMap;
uniform vec3 uColor;
uniform float uKind;       // 0 opaque, 1 glass, 2 lamp, 3 alpha card, 4 turf/sod
uniform float uNight;
uniform float uAlphaTest;
uniform float uAO;
uniform float uTime;
uniform vec4 uLod;         // levels of detail: drawn from x..y m on and up to z..w m (0: always)
uniform float uIndoor;     // 1: a house -- inside, only what the windows and the door let in (vSky)
uniform float uCamIndoor;  // the camera is in a room (main.js)
uniform float uDim;        // overall light on it (the walker indoors: character.js)
varying float vLodD;
varying float vSky;
varying vec2 vUv;
varying vec3 vNormal;
varying vec3 vWorld;
varying float vAO;
varying float vH;
varying vec3 vCrownN;
${ATMOS_GLSL}
${NOISE_GLSL}
${HEIGHT_GLSL}
${LANDCOVER_GLSL}
${SHADOW_GLSL}
${OBJ_SHADOW_GLSL}
${TOON_GLSL}

void main() {
  #include <logdepthbuf_fragment>
  // handed over pixel by pixel to the next level of detail (the same thing, drawn the other way):
  // a level fading in keeps the pixels one fading out over the same distances leaves
  if (uLod.y > 0.0 || uLod.w > 0.0) {
    float dz = fract(52.9829189 * fract(dot(gl_FragCoord.xy, vec2(0.06711056, 0.00583715))));
    float fin = uLod.y > 0.0 ? smoothstep(uLod.x, uLod.y, vLodD) : 1.0;
    float fout = uLod.w > 0.0 ? 1.0 - smoothstep(uLod.z, uLod.w, vLodD) : 1.0;
    if (dz < 1.0 - fin || dz >= fout) discard;
  }
  vec4 tex = uHasMap > 0.5 ? texture2D(map, vUv, uKind == 7.0 ? 3.5 : 0.0) : vec4(1.0);
  #ifdef SHADOW_PASS
    if (tex.a < uAlphaTest) discard;
    gl_FragColor = vec4(shadowPassDepth(vWorld));
    return;
  #endif
  if (tex.a < uAlphaTest) discard;
  // foliage right at the camera (the walker's camera among spruce branches): thinned out with a
  // screen dither so the view stays open, gone within half a metre
  if (uKind == 5.0 || uKind == 6.0 || uKind == 3.0) {
    float keep = smoothstep(0.5, 1.9, distance(vWorld, cameraPosition));
    if (keep < 1.0 && fract(52.9829189 * fract(dot(gl_FragCoord.xy, vec2(0.06711056, 0.00583715)))) > keep) discard;
  }
  vec3 albedo = tex.rgb * uColor;
  if (uKind == 7.0) {  // photoscanned rock -> painted boulder: soft grey-beige with moss on top
    float l = dot(tex.rgb, vec3(0.3, 0.55, 0.15));
    albedo = mix(vec3(0.2, 0.19, 0.17), vec3(0.52, 0.49, 0.43), smoothstep(0.05, 0.55, l));
    float moss = smoothstep(0.45, 0.8, normalize(vNormal).y + 0.3 * vnoise(vWorld.xz * 1.2 + vWorld.y * 0.5));
    albedo = mix(albedo, vec3(0.2, 0.28, 0.08) * (0.85 + 0.3 * vnoise(vWorld.xz * 2.0)), moss * 0.8);
  }
  if (uKind == 9.0 || uKind == 10.0 || uKind == 16.0) {
    // old wood out in the weather: the warm brown fades toward silver grey, every log and board
    // a little different, darker and greener near the ground (splash, algae), moss on the roofs
    float lum = dot(albedo, vec3(0.3, 0.55, 0.15));
    float course = floor(vWorld.y / 0.27 + 0.3 * vnoise(vWorld.xz * 0.4));
    float per = hash12(vec2(course, floor(dot(vWorld.xz, vec2(0.7, 0.7)) / 3.0)));
    vec3 silver = vec3(lum) * vec3(1.02, 0.97, 0.9);
    albedo = mix(albedo, silver, uKind == 16.0 ? 0.82 + 0.12 * per : 0.35 + 0.25 * per) * mix(0.82, 1.08, per) * vec3(1.0, 0.97, 0.93);
    float hgt = vWorld.y - terrainHeight(vWorld.xz);
    float low = 1.0 - smoothstep(0.1, 0.9, hgt + 0.3 * vnoise(vWorld.xz * 2.0));
    albedo *= mix(vec3(1.0), vec3(0.7, 0.72, 0.62), low * 0.8);
    if (uKind == 10.0) {  // shingles: weathered, patches of moss and lichen
      // (lit by their own slope now -- a roof turned to a low sun no longer glows orange: the
      // boards greyer and a little darker, as old shingles are)
      albedo = mix(albedo, vec3(dot(albedo, vec3(0.3, 0.55, 0.15))), 0.3) * 0.76;
      // a few soft patches, more toward the eaves where the water runs off slowly
      float eave = 1.0 - smoothstep(2.4, 4.5, hgt);
      float mossR = smoothstep(0.66, 0.86, vnoise(vWorld.xz * 0.7 + vWorld.y * 0.5) * 0.75 + vnoise(vWorld.xz * 3.0) * 0.25 + eave * 0.12);
      albedo = mix(albedo * 0.88, vec3(0.17, 0.2, 0.09) * (0.8 + 0.4 * vnoise(vWorld.xz * 9.0)), mossR * 0.4);
    }
  }
  if (uKind == 11.0) {
    // yurt felt: off-white, never paper white; earthy at the foot, smoke-browned round the crown
    // (the roof facing a high sun takes it full on: never quite white there either)
    albedo *= vec3(0.76, 0.73, 0.67) * mix(0.92, 1.04, vnoise(vWorld.xz * 1.3 + vWorld.y * 2.0));
    float hgt = vWorld.y - terrainHeight(vWorld.xz);
    albedo = mix(albedo, albedo * vec3(0.66, 0.6, 0.5), (1.0 - smoothstep(0.05, 0.7, hgt + 0.25 * vnoise(vWorld.xz * 3.0))) * 0.7);
    albedo = mix(albedo, albedo * vec3(0.55, 0.5, 0.45), smoothstep(2.4, 3.2, hgt) * 0.55);   // (a yurt is ~3.3 m high)
  }
  if (uKind == 12.0) {  // old standing stone: lichen spots, moss on the top and at the foot
    float hgt = vWorld.y - terrainHeight(vWorld.xz);
    float moss = smoothstep(0.55, 0.9, normalize(vNormal).y + 0.3 * vnoise(vWorld.xz * 7.0 + vWorld.y * 5.0)) + (1.0 - smoothstep(0.0, 0.3, hgt)) * 0.7;
    albedo *= 0.9 + 0.15 * vnoise(vWorld.xz * 9.0 + vWorld.y * 11.0);
    albedo = mix(albedo, vec3(0.45, 0.47, 0.4), smoothstep(0.8, 0.86, vnoise(vWorld.xz * 23.0 + vWorld.y * 19.0)) * 0.35);   // small lichen spots
    albedo = mix(albedo, vec3(0.13, 0.2, 0.06) * (0.8 + 0.4 * vnoise(vWorld.xz * 8.0)), clamp(moss, 0.0, 1.0) * 0.8);
  }
  if (uKind == 8.0) {  // dead wood on the forest floor: weathered bark, moss on the upper side
    float moss = smoothstep(0.5, 0.85, normalize(vNormal).y * 0.75 + 0.55 * vnoise(vWorld.xz * 1.3 + vWorld.y * 0.8));   // in patches
    albedo = mix(albedo, vec3(0.13, 0.2, 0.05) * (0.7 + 0.6 * vnoise(vWorld.xz * 6.0 + vWorld.y * 3.0)), moss * 0.75);
  }
  vec3 n = normalize(vNormal);
  if (!gl_FrontFacing) n = -n;
  if (uKind == 3.0) n = normalize(vec3(0.0, 1.0, 0.0) + n * 0.25);  // cards shade like the ground
  // foliage shades as a volume (fronds, cores); everything else by its own surface
  if (uKind == 5.0 || uKind == 6.0) n = normalize(vCrownN + n * 0.15);
  float ground = terrainHeight(vWorld.xz);
  float vis = groundSunVis(vWorld.xz, max(vWorld.y - ground, 0.0), smoothstep(0.3, 0.7, landcover(vWorld.xz).r), length(vWorld.xz - cameraPosition.xz))
            * objectShadow(vWorld + n * (uKind == 14.0 || uKind == 15.0 || uKind == 17.0 ? 0.09 : 0.0), n);   // (the walker: its own shadow's soft taps reach 6 cm round -- no rings over the face)
  float ao = mix(1.0, vAO, uAO);
  vec3 col = toonLight(albedo, n, vis, uKind == 3.0 ? 0.25 : 0.06) * mix(0.55, 1.0, ao);
  // inside a house the light is what comes in at the windows and the door: bright by them, dim in
  // the corners (the sky each vertex sees, baked); a little warmer (the logs and felt bounce it)
  if (uIndoor > 0.5) col *= mix(vec3(0.21, 0.195, 0.175), vec3(1.0), smoothstep(0.0, 0.3, vSky));
  if (uKind == 14.0 || uKind == 15.0) {
    // the walker: its texture is already painted with light and shade, so the scene's light only
    // tints it -- softer, and never blown out (white shoes and skin would bloom at golden hour)
    col = toonLight(albedo * 0.8, n, vis, 0.45) * mix(0.7, 1.0, ao);
    col = col / (1.0 + max(max(col.r, col.g), col.b) * 0.35);
    if (uKind == 15.0) {   // the eyes: wet, a small sharp glint of the sun and a sheen of the sky
      vec3 vv = normalize(cameraPosition - vWorld);
      vec3 nn = normalize(vNormal);
      col += uSunColor * pow(max(dot(reflect(-uSunDir, nn), vv), 0.0), 120.0) * 0.8 * vis;
      col += uSkyAmbient * 0.15 * pow(1.0 - max(dot(nn, vv), 0.0), 2.0);
    }
  }
  if (uKind == 17.0) col = albedo * (0.3 + 0.25 * vis) * vec3(1.0, 0.92, 0.88);   // the inside of a child's mouth: in its own shade, no sky in it
  // warm bounce from sunlit ground onto downward faces
  col += albedo * uSunColor * 0.08 * clamp(-n.y, 0.0, 1.0) * ao;
  // rim light against the sun
  vec3 v = normalize(cameraPosition - vWorld);
  float rim = pow(1.0 - max(dot(n, v), 0.0), 4.0) * pow(max(dot(-v, uSunDir), 0.0), 1.5);
  col += uSunColor * albedo * rim * (uKind == 11.0 ? 0.25 : uKind == 14.0 ? 0.22 : 0.9) * vis;   // (thick felt, the walker's clothes and skin: little sheen)
  if (uKind == 11.0) {   // white felt full in a high sun: its brightest eased off, the bands and ropes still read
    float m = max(col.r, max(col.g, col.b));
    if (m > 0.9) col *= (0.9 + (m - 0.9) * 0.3) / m;   // (below the bloom's threshold: no halo round a yurt at noon)
  }
  if (uKind == 1.0) {          // window glass: sky reflection by day, warm interior at night
    vec3 r = reflect(-v, n);
    col = mix(vec3(0.03, 0.035, 0.05), skyBase(normalize(vec3(r.x, abs(r.y), r.z))) * 0.35, 0.6);
    col += vec3(1.0, 0.58, 0.24) * (1.4 + 0.6 * vnoise(vWorld.xz * 3.0)) * uNight;
    // seen from inside (its inner face sees no sky): the daylight outside, bright and hazy
    if (uIndoor > 0.5 && vSky < 0.2 && uCamIndoor > 0.5) {
      vec3 out_ = skyBase(normalize(vec3(-v.x, max(-v.y, 0.02), -v.z)));
      col = mix(out_ * 1.15, vec3(1.0, 0.97, 0.9), 0.35) * (1.0 - 0.85 * uNight);
    }
  } else if (uKind == 5.0) {   // needles glow when backlit
    col += uSunColor * albedo * pow(max(dot(-v, uSunDir), 0.0), 3.0) * 0.9 * vis * ao;
  } else if (uKind == 13.0) {  // the carved glyph: a faint teal glow, breathing slowly, stronger after dusk
    float pulse = 0.8 + 0.2 * sin(uTime * 1.2);
    col = mix(col * 0.5, vec3(0.25, 0.85, 0.95) * (0.5 + 2.2 * uNight) * pulse, 0.85);
  } else if (uKind == 2.0) {   // lamp: already glowing softly at golden hour, full at night
    float lampOn = max(uNight, 0.45 * smoothstep(0.2, 0.05, uSunDir.y));
    col = mix(albedo * 0.35, vec3(1.0, 0.6, 0.25) * 5.0, lampOn);
  }
  col *= uDim;
  col = applyAtmosphere(col, cameraPosition, vWorld);
  gl_FragColor = vec4(col, 1.0);
  #include <tonemapping_fragment>
  #include <colorspace_fragment>
}
`;

const KIND = { glass: 1, lamp: 2, grasscard: 3, leaf: 3, sod: 4, frond: 5, core: 6, rock: 7, deadbark: 8,
  log: 9, logend: 9, plank: 9, shutter: 9, shingle: 10, felt: 11, slate: 12, glyph: 13,
  loggrey: 16, logpale: 16, plankpale: 16,   // the guesthouses' old wood, silvered through (tools/blender/guesthouses.py)
  turfblade: 3, turfdry: 3, seedstalk: 3,     // their turf roofs' grass, blade by blade (two-sided, shaded like the meadow)
  Designer_Logic_PBR: 14, Designer_Logic_PBR_eye: 15,
  Designer_Logic_PBR_lid: 14, Designer_Logic_PBR_mouth: 17, Designer_Logic_PBR_lidskin: 14, Designer_Logic_PBR_hand: 14 };   // (the children's lids' lash line, the inside of the mouth: tools/blender/face_rig.py)   // the walker (assets/character.glb): its texture is already shaded
const TINT = {
  tekemet: [0.78, 0.7, 0.56],   // felt on the sleeping platform: an old greyish cream, not paper white
  loggrey: [1.0, 1.0, 1.0],     // the converted shed's old logs: silver grey
  logpale: [1.25, 1.2, 1.1],    // 青空冀翼's: pale, bleached
  plankpale: [1.0, 0.98, 0.95],
  logfresh: [0.95, 0.82, 0.66], // 岚川's new varnished logs: honey brown, not orange
  boardbrown: [0.78, 0.62, 0.5],
  deckdark: [0.55, 0.45, 0.38],
  pine: [1.0, 0.9, 0.72],
  floorfelt: [0.8, 0.66, 0.5],  // the yurt's floor felt: warm and worn, not a grey slab
  rug: [0.84, 0.76, 0.66],      // the felt rugs' white ground an old cream, the black a worn brown-black
  rug_in: [0.84, 0.76, 0.66],
  // per-material colour grading so photo/painted textures sit in the BotW palette
  log: [0.9, 0.84, 0.78],
  logend: [0.52, 0.48, 0.43],     // cut ends grey and dark with age, not fresh yellow
  plank: [0.9, 0.85, 0.8],
  shutter: [0.72, 0.9, 0.95],
  sod: [0.88, 0.92, 0.72],
  shingle: [0.88, 0.84, 0.8],
  grasscard: [0.78, 0.86, 0.6],
  stone: [0.78, 0.76, 0.72],
  iron: [1, 1, 1],
  frond: [0.95, 1.05, 0.92],
  core: [1, 1, 1],
  bark: [0.8, 0.72, 0.65],
  deadbark: [0.78, 0.74, 0.7],   // weathered, greyer than living bark
  logend: [0.85, 0.8, 0.72],
  earth: [1, 1, 1],
  straw: [0.95, 0.9, 0.8],
};

export function makeAssetMaterial(src, { skinned = false, shadowPass = false } = {}) {
  const name = (src.name || "").replace(/\.\d+$/, "");
  const kind = KIND[name] ?? 0;
  const map = src.map || null;
  if (map) {
    map.colorSpace = THREE.SRGBColorSpace;
    map.anisotropy = 8;
  }
  const base = src.color ? src.color.clone() : new THREE.Color(1, 1, 1);
  const tint = TINT[name];
  if (tint) base.multiply(new THREE.Color(...tint));
  const m = new THREE.ShaderMaterial({
    uniforms: {
      ...atmos,
      ...worldUniforms,
      ...shadowUniforms,
      ...assetUniforms,
      map: { value: map },
      uHasMap: { value: map ? 1 : 0 },
      uColor: { value: base },
      uKind: { value: kind },
      uAlphaTest: { value: kind === 3 || kind === 5 ? 0.45 : 0.0 },
      uAO: { value: 1.0 },
      uLod: { value: new THREE.Vector4(0, 0, 0, 0) },   // (not Vector4(): its w defaults to 1 -- gone beyond 1 m)
      uIndoor: { value: 0 },
      uDim: { value: 1 },
      uSway: { value: 0 },
    },
    defines: { ...(src.vertexColors || src.userData?.hasAO ? { HAS_AO: 1 } : {}), ...(shadowPass ? { SHADOW_PASS: 1 } : {}) },
    vertexShader: VERT,
    fragmentShader: FRAG,
    side: kind === 3 || kind === 5 || kind === 17 ? THREE.DoubleSide : THREE.FrontSide,   // (17: a child's mouth inside, stretched as the jaw drops: its back faces fill in)
    alphaToCoverage: kind === 3 || kind === 5,
  });
  m.name = name;
  return m;
}

const loader = new GLTFLoader();
const cache = new Map();

// Load a GLB and convert its materials. Returns the glTF result (scene + animations).
export async function loadAsset(url) {
  if (!cache.has(url)) cache.set(url, loader.loadAsync(url));
  const gltf = await cache.get(url);
  return gltf;
}

// Level-of-detail distances for every stylised material under root (and its shadow variant):
// drawn from inA..inB m on (0: from the camera) and up to outA..outB m (0: without end)
export function setLod(root, inA, inB, outA, outB) {
  root.traverse((o) => {
    if (!o.isMesh) return;
    for (const m of [o.material, o.userData.shadowMaterial]) if (m?.uniforms?.uLod) m.uniforms.uLod.value.set(inA, inB, outA, outB);
  });
}

// houses under root: their insides lit only by what the windows and the doors let in (uIndoor)
export function setIndoor(root) {
  root.traverse((o) => {
    if (o.isMesh && o.material?.uniforms?.uIndoor) o.material.uniforms.uIndoor.value = 1;
  });
}

// Let the wind move the instanced trees under root (assets VERT uSway; 1 = a spruce)
export function setSway(root, v = 1) {
  root.traverse((o) => {
    if (!o.isMesh) return;
    for (const m of [o.material, o.userData.shadowMaterial]) if (m?.uniforms?.uSway) m.uniforms.uSway.value = v;
  });
}

// Replace every mesh material in `root` with the stylised asset material (+ shadow variant).
export function stylise(root, { castShadow = true } = {}) {
  root.traverse((o) => {
    if (!o.isMesh) return;
    const src = o.material;
    const hasAO = !!o.geometry.attributes.color;
    src.userData.hasAO = hasAO;
    o.material = makeAssetMaterial(src, { skinned: o.isSkinnedMesh });
    if (castShadow) o.userData.shadowMaterial = makeAssetMaterial(src, { skinned: o.isSkinnedMesh, shadowPass: true });
    o.userData.castShadow = castShadow;
    o.frustumCulled = !o.isSkinnedMesh;
  });
  if (castShadow) markCaster(root);
  return root;
}
