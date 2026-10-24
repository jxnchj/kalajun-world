// Only the final cascade's already-zero shadow weight. Keep RE_Direct and
// its full sunlight: the outer CSM last-cascade branch extends to infinity.
export const CSM_ZERO_FADE_PREDICATE='( uCSMZeroFadeSkip < 0.5 || !( UNROLLED_LOOP_INDEX == CSM_CASCADES - 1 && linearDepth > cascadeCenter && ratio <= 0.0 ) )';
export function installCSMZeroFadeSkip(shader,uniform){
 if(!uniform||shader.uniforms.uCSMZeroFadeSkip)return false;
 const begin=shader.fragmentShader.indexOf('#if defined( USE_SHADOWMAP ) && defined( CSM_FADE )');
 const end=shader.fragmentShader.indexOf('#elif defined (USE_SHADOWMAP)',begin);
 if(begin<0||end<0)throw Error('Zero fade skip requires original CSM fade loop');
 const before=shader.fragmentShader.slice(0,begin),fade=shader.fragmentShader.slice(begin,end),after=shader.fragmentShader.slice(end);
 const old='( directLight.visible && receiveShadow ) ?';
 if(fade.split(old).length!==2)throw Error('Expected one CSM fade shadow sampling predicate');
 const replacement='( directLight.visible && receiveShadow && '+CSM_ZERO_FADE_PREDICATE+' ) ?';
 shader.fragmentShader='uniform float uCSMZeroFadeSkip;\n'+before+fade.replace(old,replacement)+after;
 shader.uniforms.uCSMZeroFadeSkip=uniform;return true;
}
