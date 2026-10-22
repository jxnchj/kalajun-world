import test from "node:test";
import assert from "node:assert/strict";
import { ShaderChunk, ShaderLib } from "three";
import { CSMShader } from "three/addons/csm/CSMShader.js";
import { csmPhysicalLighting, installCSMPhysicalLighting } from "./csm-physical.js";

test("CSM preserves current PBR initialization before direct and indirect lighting", () => {
  const marker = "IncidentLight directLight;";
  assert.equal(csmPhysicalLighting.split(marker)[0], ShaderChunk.lights_fragment_begin.split(marker)[0]);
  assert.equal(csmPhysicalLighting.slice(csmPhysicalLighting.indexOf(marker)), CSMShader.lights_fragment_begin.slice(CSMShader.lights_fragment_begin.indexOf(marker)));
  assert.ok(csmPhysicalLighting.indexOf("material.dfg = texture2D") < csmPhysicalLighting.indexOf(marker));
  assert.ok(csmPhysicalLighting.includes("material.multiScatteringCompensation ="));
  const original = ShaderChunk.lights_fragment_begin;
  const shader = {fragmentShader: ShaderLib.physical.fragmentShader};
  installCSMPhysicalLighting(shader);
  assert.ok(!shader.fragmentShader.includes("#include <lights_fragment_begin>"));
  assert.ok(shader.fragmentShader.includes("#include <lights_fragment_maps>"));
  assert.equal(ShaderChunk.lights_fragment_begin, original);
});

test("room portal correction changes only spot specular and leaves other PBR lighting byte-for-byte intact", () => {
  const plain = { uniforms: {}, fragmentShader: "#include <lights_fragment_begin>" };
  installCSMPhysicalLighting(plain);
  assert.equal(plain.fragmentShader, csmPhysicalLighting);
  const room = { uniforms: { uRoomBounceActive: { value: 1 } }, fragmentShader: "#include <lights_fragment_begin>" };
  installCSMPhysicalLighting(room);
  const start = csmPhysicalLighting.indexOf("#if ( NUM_SPOT_LIGHTS > 0 )");
  const end = csmPhysicalLighting.indexOf("#pragma unroll_loop_end", start);
  const patchedEnd = room.fragmentShader.indexOf("#pragma unroll_loop_end", start);
  assert.equal(room.fragmentShader.slice(0, start), csmPhysicalLighting.slice(0, start));
  assert.equal(room.fragmentShader.slice(patchedEnd), csmPhysicalLighting.slice(end));
  assert.equal((room.fragmentShader.match(/vec3 roomPortalSpecular =/g) || []).length, 1);
  assert.match(room.fragmentShader, /if \(uRoomBounceActive > \.5\)/);
  assert.match(room.fragmentShader, /#ifdef USE_CLEARCOAT\s+vec3 roomPortalClearcoat/);
  assert.match(room.fragmentShader, /#ifdef USE_SHEEN\s+vec3 roomPortalSheen/);
  assert.doesNotMatch(room.fragmentShader, /indirectSpecular = roomPortal|directDiffuse = roomPortal/);
  assert.ok(room.fragmentShader.includes("material.multiScatteringCompensation ="));
});

function portalBlock() {
  const shader = { uniforms: { uRoomBounceActive: { value: 1 } }, fragmentShader: "#include <lights_fragment_begin>" };
  installCSMPhysicalLighting(shader);
  const start = shader.fragmentShader.indexOf("{\n      // Finite portal spots");
  let level = 0;
  for (let i = start; i < shader.fragmentShader.length; i++) {
    if (shader.fragmentShader[i] === "{") level++;
    if (shader.fragmentShader[i] === "}" && --level === 0) return shader.fragmentShader.slice(start, i + 1);
  }
  throw new Error("portal block scope missing");
}

test("portal active removes only the spot increment; real fixtures and existing sun/IBL remain", () => {
  // Evaluate the emitted save/call/restore operations with scalar channels.
  // The real RE_Direct implementation and its diffuse BRDF remain untouched.
  const code = portalBlock().replace(/#(?:ifdef USE_CLEARCOAT|ifdef USE_SHEEN|endif)/g, "")
    .replace(/vec3 /g, "let ")
    .replace(/RE_Direct\([^;]+;/, "RE_Direct(reflectedLight);");
  const run = new Function("uRoomBounceActive", `
    const reflectedLight={directDiffuse:2,directSpecular:10,indirectDiffuse:8,indirectSpecular:9};
    let clearcoatSpecularDirect=20,sheenSpecularDirect=30;
    function RE_Direct(light){light.directDiffuse+=3;light.directSpecular+=7;clearcoatSpecularDirect+=11;sheenSpecularDirect+=13;}
    ${code}
    return {...reflectedLight,clearcoatSpecularDirect,sheenSpecularDirect};
  `);
  assert.deepEqual(run(1), { directDiffuse:5,directSpecular:10,indirectDiffuse:8,indirectSpecular:9,clearcoatSpecularDirect:20,sheenSpecularDirect:30 });
  assert.deepEqual(run(0), { directDiffuse:5,directSpecular:17,indirectDiffuse:8,indirectSpecular:9,clearcoatSpecularDirect:31,sheenSpecularDirect:43 });
});

test("installed Three unrolling keeps the three portal temporaries in independent scopes", async () => {
  const { readFileSync } = await import("node:fs");
  const source = readFileSync(new URL("../../node_modules/three/src/renderers/webgl/WebGLProgram.js", import.meta.url), "utf8");
  const code = source.slice(source.indexOf("const unrollLoopPattern"), source.indexOf("function generatePrecision"));
  const unroll = new Function(code + ";return unrollLoops;")();
  const shader = { uniforms: { uRoomBounceActive: { value: 1 } }, fragmentShader: "#include <lights_fragment_begin>" };
  installCSMPhysicalLighting(shader);
  const start = shader.fragmentShader.indexOf("#if ( NUM_SPOT_LIGHTS > 0 )");
  const end = shader.fragmentShader.indexOf("#pragma unroll_loop_end", start) + "#pragma unroll_loop_end".length;
  const expanded = unroll(shader.fragmentShader.slice(start, end).replace(/NUM_SPOT_LIGHTS/g, "3"));
  assert.doesNotMatch(expanded, /#pragma unroll_loop|for \( int i/);
  assert.equal((expanded.match(/vec3 roomPortalSpecular =/g) || []).length, 3);
  // A declaration must be inside a fresh block, not the shared unrolled scope.
  const scopes = []; let next = 0; const stack = [0];
  for (const token of expanded.matchAll(/[{}]|vec3 roomPortalSpecular/g)) {
    if (token[0] === "{") stack.push(++next);
    else if (token[0] === "}") stack.pop();
    else scopes.push(stack.at(-1));
  }
  assert.equal(new Set(scopes).size, 3); assert.ok(scopes.every(n => n > 0));
});
