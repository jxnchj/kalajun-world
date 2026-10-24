// Only audited opaque/masked spruce Standard materials. Physical clearcoat may
// receive sun even when the base normal faces away, so it is never eligible.
export function csmBacklitSkipEligible(material){
 return !!material?.isMeshStandardMaterial&&!material.isMeshPhysicalMaterial&&material.defines?.ECO_ROOT_WIND!==undefined;
}
export function installCSMBacklitSkip(shader,uniform){
 if(!uniform||shader.uniforms.uCSMBacklitSkip)return false;
 const start=shader.fragmentShader.indexOf('#if defined( USE_SHADOWMAP ) && defined( CSM_FADE )');
 const end=shader.fragmentShader.indexOf('#elif defined (USE_SHADOWMAP)',start);
 if(start<0||end<0)throw Error('Backlit skip requires the original CSM fade loop');
 const part=shader.fragmentShader.slice(start,end),old='directLight.visible && receiveShadow';
 if(part.split(old).length!==2)throw Error('Expected one CSM fade receiver predicate');
 // Use the FINAL normal (including photo/rounded needle perturbation), in the
 // same view space as RE_Direct. Zero irradiance makes the shadow factor moot.
 const replacement=old+' && ( uCSMBacklitSkip < 0.5 || dot( geometryNormal, directLight.direction ) > 0.0 )';
 shader.fragmentShader='uniform float uCSMBacklitSkip;\n'+shader.fragmentShader.slice(0,start)+part.replace(old,replacement)+shader.fragmentShader.slice(end);
 shader.uniforms.uCSMBacklitSkip=uniform;return true;
}
