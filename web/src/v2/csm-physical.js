import { ShaderChunk } from "three";
import { CSMShader } from "three/addons/csm/CSMShader.js";

// Capture the current renderer's material initialization before CSM replaces
// the shared chunk. r186 CSM still carries an older prefix without the DFG LUT
// and multi-scattering energy compensation. Keep its cascade loops unchanged.
const marker = "IncidentLight directLight;";
const physicalPrefix = ShaderChunk.lights_fragment_begin.split(marker)[0];
const cascadeLoops = CSMShader.lights_fragment_begin.slice(CSMShader.lights_fragment_begin.indexOf(marker));
export const csmPhysicalLighting = physicalPrefix + cascadeLoops;

const spotStart = csmPhysicalLighting.indexOf("#if ( NUM_SPOT_LIGHTS > 0 )");
const spotEnd = csmPhysicalLighting.indexOf("#pragma unroll_loop_end", spotStart);
const directCall = "RE_Direct( directLight, geometryPosition, geometryNormal, geometryViewDir, geometryClearcoatNormal, material, reflectedLight );";
const portalSpotLoop = csmPhysicalLighting.slice(spotStart, spotEnd).replace(directCall, `{
      // Finite portal spots approximate diffuse daylight entering the occupied
      // room. Their point-like specular lobes are not reflections of the sky.
      // Keep each temporary in its own scope after Three unrolls this loop.
      vec3 roomPortalSpecular = reflectedLight.directSpecular;
      #ifdef USE_CLEARCOAT
        vec3 roomPortalClearcoat = clearcoatSpecularDirect;
      #endif
      #ifdef USE_SHEEN
        vec3 roomPortalSheen = sheenSpecularDirect;
      #endif
      ${directCall}
      if (uRoomBounceActive > .5) {
        reflectedLight.directSpecular = roomPortalSpecular;
        #ifdef USE_CLEARCOAT
          clearcoatSpecularDirect = roomPortalClearcoat;
        #endif
        #ifdef USE_SHEEN
          sheenSpecularDirect = roomPortalSheen;
        #endif
      }
    }`);
const portalPhysicalLighting = csmPhysicalLighting.slice(0, spotStart) + portalSpotLoop + csmPhysicalLighting.slice(spotEnd);

export function installCSMPhysicalLighting(shader) {
  // The room runtime marks only the shared portal pool active. Its value is 0
  // for Lanchuan's real fixtures, whose standard specular response is retained.
  const lighting = shader.uniforms?.uRoomBounceActive ? portalPhysicalLighting : csmPhysicalLighting;
  shader.fragmentShader = shader.fragmentShader.replace("#include <lights_fragment_begin>", lighting);
}
