import { InstancedBufferAttribute } from "three";

export const TREE_CULL_WIND = Object.freeze([1.25, .4, 1.25]);
const bounds = new WeakMap(), installed = new WeakMap();

// An interval bound for the existing ecoBend tree branch. Wind textures are
// RGBA8 and root fields preserve [0,1]; sin is [-1,1], eddy is [-.5,.5].
export function treeWindDisplacementBound(weights) {
  let lo = Infinity, hi = -Infinity, branch = 0;
  if (!weights?.count) return Infinity;
  for (let i = 0; i < weights.count; i++) {
    lo = Math.min(lo, weights.getX(i)); hi = Math.max(hi, weights.getX(i));
    branch = Math.max(branch, Math.abs(weights.getY(i)));
  }
  const a = lo * .48, b = hi * .48;
  const gust = Math.max(1, Math.abs(1.32 * (1-a)), Math.abs(1.32*a-.32), Math.abs(1.32 * (1-b)), Math.abs(1.32*b-.32));
  return (gust * 20 * 20 * .0014 + branch * (.027 + .12 * Math.max(Math.abs(1-a), Math.abs(1-b)))) * 1.0001;
}

export function treeCullSphere(geometry) {
  const source = geometry.userData.treeWindSource || geometry;
  if (bounds.has(source)) return bounds.get(source);
  const wind = treeWindDisplacementBound(source.attributes.aPlantWind);
  if (!Number.isFinite(wind) || wind > 1.25 || Object.keys(source.morphAttributes).length) { bounds.set(source, null); return null; }
  if (!source.boundingSphere) source.computeBoundingSphere();
  const sphere = source.boundingSphere;
  if (!sphere || !Number.isFinite(sphere.radius) || sphere.radius < 0) { bounds.set(source, null); return null; }
  const values = new Float32Array(4); sphere.center.toArray(values);
  const rounding = Math.hypot(values[0]-sphere.center.x, values[1]-sphere.center.y, values[2]-sphere.center.z);
  // The complete LOCAL wind box is enclosed before any instance/world scale.
  // Inflation also rounds radius outward when stored as float32.
  const radius = sphere.radius + Math.hypot(...TREE_CULL_WIND) + rounding + .002;
  values[3] = radius * (1 + 2**-22); bounds.set(source, values); return values;
}

const DECLARATIONS = /* glsl */`
attribute vec4 aTreeFrustumSphere;
uniform float uTreeFrustumCull;
bool treeOutsidePlane(vec4 plane, vec4 sphere) {
  float normalLength=length(plane.xyz);
  return normalLength>1e-12 && dot(plane,vec4(sphere.xyz,1.)) < -sphere.w*normalLength;
}
bool treeOutsideCurrentView() {
  if(aTreeFrustumSphere.w<0.)return false;
  // These are Three's ACTUAL draw matrices: main, oblique reflection or the
  // current shadow camera. No shared-material per-camera uniform upload.
  mat4 clip=projectionMatrix*modelViewMatrix*instanceMatrix;
  vec4 x=vec4(clip[0].x,clip[1].x,clip[2].x,clip[3].x);
  vec4 y=vec4(clip[0].y,clip[1].y,clip[2].y,clip[3].y);
  vec4 z=vec4(clip[0].z,clip[1].z,clip[2].z,clip[3].z);
  vec4 w=vec4(clip[0].w,clip[1].w,clip[2].w,clip[3].w);
  vec4 sphere=aTreeFrustumSphere;
  // Conservative guard for float32 matrix reassociation at geographic roots.
  sphere.w+=.03+max(max(abs(instanceMatrix[3].x),abs(instanceMatrix[3].y)),abs(instanceMatrix[3].z))*.000002;
  if(treeOutsidePlane(w+x,sphere)||treeOutsidePlane(w-x,sphere)||treeOutsidePlane(w+y,sphere)||treeOutsidePlane(w-y,sphere))return true;
#ifdef USE_REVERSED_DEPTH_BUFFER
  if(treeOutsidePlane(z,sphere))return true;
#else
  if(treeOutsidePlane(w+z,sphere))return true;
#endif
  return treeOutsidePlane(w-z,sphere);
}
`;
const EARLY = /* glsl */`
// TREE_FRUSTUM_EARLY_BEGIN
#ifdef USE_INSTANCING
if(uTreeFrustumCull>.5 && treeOutsideCurrentView()) { gl_Position=vec4(2.,2.,2.,1.);return; }
#endif
// TREE_FRUSTUM_EARLY_END
`;

export function installTreeFrustumMaterial(material, control) {
  if (installed.has(material)) {
    if (installed.get(material) !== control) throw new Error("Tree frustum material cannot use conflicting controls.");
    return;
  }
  const previous = material.onBeforeCompile, key = material.customProgramCacheKey();
  material.onBeforeCompile = (shader, renderer) => {
    previous.call(material, shader, renderer);
    if (!shader.vertexShader.includes("// ECO_LOD_EARLY_END")) throw new Error("Tree frustum culling requires the ecology early-LOD hook.");
    shader.uniforms.uTreeFrustumCull = control;
    shader.vertexShader = DECLARATIONS + shader.vertexShader.replace("// ECO_LOD_EARLY_END", EARLY + "\n// ECO_LOD_EARLY_END");
  };
  material.customProgramCacheKey = () => key + "-tree-frustum-local-sphere-v1";
  material.userData.treeFrustumCull = control; installed.set(material, control);
}

export function installTreeFrustumCull(mesh, control) {
  if (!mesh.isInstancedMesh || !control?.value || mesh.geometry.hasAttribute("aTreeFrustumSphere")) return false;
  const supported = treeCullSphere(mesh.geometry);
  const sphere = supported || new Float32Array([0,0,0,-1]);
  // One 16-byte constant per batch. It does not allocate an entry per root or
  // per vertex, and the divisor covers every instance in the unchanged buffer.
  mesh.geometry.setAttribute("aTreeFrustumSphere", new InstancedBufferAttribute(sphere.slice(), 4, false, mesh.instanceMatrix.count));
  installTreeFrustumMaterial(mesh.material, control); installTreeFrustumMaterial(mesh.customDepthMaterial, control);
  return !!supported;
}
