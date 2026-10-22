import * as THREE from "three";

// Clear mountain air: altitude-dependent Rayleigh and aerosol extinction.
// This is a single-scattering approximation, deliberately weaker than a fog wall.
export const AERIAL_DEFAULTS = Object.freeze({
  referenceAltitude: 2000, rayleighHeight: 8000, aerosolHeight: 1400,
  rayleigh: [0.000006, 0.000011, 0.000020], aerosol: 0.0000065,
});
export function averageAirDensity(fromY, toY, scaleHeight, referenceAltitude = 2000) {
  const a = Math.max(-500, Math.min(18000, fromY));
  const b = Math.max(-500, Math.min(18000, toY));
  if (Math.abs(b - a) < 1) return Math.exp((referenceAltitude - (a + b) * 0.5) / scaleHeight);
  return scaleHeight * (Math.exp((referenceAltitude - a) / scaleHeight) - Math.exp((referenceAltitude - b) / scaleHeight)) / (b - a);
}
export function aerialTransmittance(from, to) {
  const p = AERIAL_DEFAULTS, distance = Math.hypot(to.x - from.x, to.y - from.y, to.z - from.z);
  const molecular = averageAirDensity(from.y, to.y, p.rayleighHeight, p.referenceAltitude);
  const aerosol = averageAirDensity(from.y, to.y, p.aerosolHeight, p.referenceAltitude);
  return p.rayleigh.map((beta) => Math.exp(-distance * (beta * molecular + p.aerosol * aerosol)));
}
export function createAerialUniforms(sunDirection) {
  const p = AERIAL_DEFAULTS;
  return {
    uAerialSun: { value: sunDirection },
    uAerialRayleigh: { value: new THREE.Vector3(...p.rayleigh) },
    uAerialAerosol: { value: p.aerosol },
    uAerialHeights: { value: new THREE.Vector3(p.referenceAltitude, p.rayleighHeight, p.aerosolHeight) },
    uAerialHorizon: { value: new THREE.Color("#b0c1d1") },
    uAerialZenith: { value: new THREE.Color("#739ac5") },
    uAerialSunColor: { value: new THREE.Color("#fff1d7") },
    uAerialDaylight: { value: 1 },
  };
}
export const aerialGLSL = /* glsl */`
uniform vec3 uAerialSun;
uniform vec3 uAerialRayleigh;
uniform float uAerialAerosol;
uniform vec3 uAerialHeights;
uniform vec3 uAerialHorizon;
uniform vec3 uAerialZenith;
uniform vec3 uAerialSunColor;
uniform float uAerialDaylight;

float aerialAverageDensity(float fromY, float toY, float scaleHeight) {
  float a = clamp(fromY, -500.0, 18000.0), b = clamp(toY, -500.0, 18000.0);
  if (abs(b - a) < 1.0) return exp((uAerialHeights.x - (a + b) * 0.5) / scaleHeight);
  return scaleHeight * (exp((uAerialHeights.x - a) / scaleHeight)
    - exp((uAerialHeights.x - b) / scaleHeight)) / (b - a);
}
vec3 applyAerialPerspective(vec3 radiance, vec3 worldPosition) {
  vec3 ray = worldPosition - cameraPosition;
  float distanceToSurface = length(ray);
  vec3 direction = ray / max(distanceToSurface, 0.001);
  float molecular = aerialAverageDensity(cameraPosition.y, worldPosition.y, uAerialHeights.y);
  float aerosol = aerialAverageDensity(cameraPosition.y, worldPosition.y, uAerialHeights.z);
  vec3 transmission = exp(-distanceToSurface * (uAerialRayleigh * molecular + vec3(uAerialAerosol * aerosol)));
  float horizon = 1.0 - smoothstep(0.05, 0.65, abs(direction.y));
  float cosine = clamp(dot(direction, uAerialSun), -1.0, 1.0);
  float forward = 0.5775 / pow(max(0.1225, 1.4225 - 1.3 * cosine), 1.5);
  vec3 airLight = mix(uAerialZenith, uAerialHorizon, horizon) * (0.88 + 0.12 * cosine * cosine);
  airLight += uAerialSunColor * (0.027 * forward * uAerialDaylight * horizon);
  return radiance * transmission + airLight * (1.0 - transmission);
}
`;

export function installAerialPerspective(shader, uniforms) {
  Object.assign(shader.uniforms, uniforms);
  // Reuse the world position supplied by installCloudShadows. It already
  // includes the original material's vertex deformation and instance transform.
  shader.fragmentShader = aerialGLSL + shader.fragmentShader;
  shader.fragmentShader = shader.fragmentShader
    .replace("#include <opaque_fragment>", `#include <opaque_fragment>
gl_FragColor.rgb = applyAerialPerspective(gl_FragColor.rgb, vCloudWorld);`)
    .replace("#include <fog_fragment>", "// Aerial scattering is applied in linear HDR before tone mapping.");
}
