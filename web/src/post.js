import * as THREE from "three";
import { EffectComposer } from "three/addons/postprocessing/EffectComposer.js";
import { RenderPass } from "three/addons/postprocessing/RenderPass.js";
import { UnrealBloomPass } from "three/addons/postprocessing/UnrealBloomPass.js";
import { OutputPass } from "three/addons/postprocessing/OutputPass.js";
import { ShaderPass } from "three/addons/postprocessing/ShaderPass.js";

// Display-space grade: saturation, warm highlights / cool shadows, soft vignette.
const GradeShader = {
  uniforms: {
    tDiffuse: { value: null },
    uSaturation: { value: 1.18 },
    uWarm: { value: new THREE.Color(1.04, 1.0, 0.92) },
    uCool: { value: new THREE.Color(0.9, 0.94, 1.1) },
    uVignette: { value: 0.3 },
  },
  vertexShader: /* glsl */ `
    varying vec2 vUv;
    void main() { vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }`,
  fragmentShader: /* glsl */ `
    uniform sampler2D tDiffuse;
    uniform float uSaturation, uVignette;
    uniform vec3 uWarm, uCool;
    varying vec2 vUv;
    void main() {
      vec3 c = texture2D(tDiffuse, vUv).rgb;
      float l = dot(c, vec3(0.299, 0.587, 0.114));
      c = mix(vec3(l), c, uSaturation);
      c *= mix(uCool, uWarm, smoothstep(0.1, 0.75, l));
      c = mix(c, c * c * (3.0 - 2.0 * c), 0.25);   // gentle S-curve
      vec2 d = vUv - 0.5;
      c *= 1.0 - uVignette * smoothstep(0.25, 0.85, dot(d, d) * 2.2);
      gl_FragColor = vec4(clamp(c, 0.0, 1.0), 1.0);
    }`,
};

// Screen-space light shafts: radial blur of the bright sky around the sun.
const GodRayShader = {
  uniforms: {
    tDiffuse: { value: null },
    uSun: { value: new THREE.Vector2(0.5, 0.5) },
    uStrength: { value: 0.0 },
    uColor: { value: new THREE.Color(1.0, 0.7, 0.4) },
  },
  vertexShader: /* glsl */ `varying vec2 vUv; void main(){ vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }`,
  fragmentShader: /* glsl */ `
    uniform sampler2D tDiffuse;
    uniform vec2 uSun;
    uniform float uStrength;
    uniform vec3 uColor;
    varying vec2 vUv;
    void main() {
      vec4 base = texture2D(tDiffuse, vUv);
      if (uStrength <= 0.0) { gl_FragColor = base; return; }
      vec2 delta = (uSun - vUv) / 56.0;
      vec2 uv = vUv;
      float illum = 0.0, decay = 1.0;
      float jitter = fract(sin(dot(vUv, vec2(12.9898, 78.233))) * 43758.5453);
      uv += delta * jitter;
      for (int i = 0; i < 56; i++) {
        uv += delta;
        vec3 c = texture2D(tDiffuse, uv).rgb;
        float l = max(dot(c, vec3(0.3, 0.5, 0.2)) - 1.0, 0.0);   // only the brightest sky
        illum += l * decay;
        decay *= 0.965;
      }
      float fall = 1.0 - smoothstep(0.0, 0.9, distance(vUv, uSun));
      gl_FragColor = vec4(base.rgb + uColor * illum * uStrength * fall / 56.0 * 2.5, base.a);
    }`,
};

export function createPost(renderer, scene, camera) {
  const size = renderer.getDrawingBufferSize(new THREE.Vector2());
  const rt = new THREE.WebGLRenderTarget(size.x, size.y, {
    type: THREE.HalfFloatType,
    samples: 4,
    depthTexture: new THREE.DepthTexture(size.x, size.y, THREE.FloatType),
  });
  const composer = new EffectComposer(renderer, rt);
  composer.addPass(new RenderPass(scene, camera));
  const rays = new ShaderPass(GodRayShader);
  composer.addPass(rays);
  const bloom = new UnrealBloomPass(new THREE.Vector2(size.x, size.y), 0.32, 0.7, 1.0);
  composer.addPass(bloom);
  composer.addPass(new OutputPass());
  const grade = new ShaderPass(GradeShader);
  composer.addPass(grade);
  const sunNDC = new THREE.Vector3();
  return {
    composer,
    bloom,
    grade,
    rays,
    // sunDir: unit vector toward the sun; low sun -> strong shafts
    updateSun(sunDir, cam) {
      sunNDC.copy(cam.position).addScaledVector(sunDir, 10000).project(cam);
      const onScreen = sunNDC.z < 1 && Math.abs(sunNDC.x) < 1.6 && Math.abs(sunNDC.y) < 1.6;
      rays.uniforms.uSun.value.set(sunNDC.x * 0.5 + 0.5, sunNDC.y * 0.5 + 0.5);
      const low = THREE.MathUtils.smoothstep(sunDir.y, 0.35, 0.02) * THREE.MathUtils.smoothstep(sunDir.y, -0.03, 0.02);
      rays.uniforms.uStrength.value = onScreen ? low : 0;
    },
    setSize(w, h) {
      composer.setPixelRatio(renderer.getPixelRatio());
      composer.setSize(w, h);
    },
    render() {
      composer.render();
    },
  };
}
