// Narrow provenance for the existing twig clones which only replace uniforms.
// This does not infer compatibility from equal hook text or arbitrary cache keys.
const uniformClones=new WeakMap(),coverage=new WeakMap();
export function certifyUniformOnlyClone52(copy,source){
 if(copy===source||copy.customProgramCacheKey()!==source.customProgramCacheKey())throw Error('Uniform-only clone must retain original program key');
 uniformClones.set(copy,{source,hook:copy.onBeforeCompile,key:copy.customProgramCacheKey,version:copy.version,sourceHook:source.onBeforeCompile,sourceKey:source.customProgramCacheKey,sourceVersion:source.version});return copy;
}
function origin(copy){const c=uniformClones.get(copy);if(!c)return copy;
 if(copy.onBeforeCompile!==c.hook||copy.customProgramCacheKey!==c.key||copy.version!==c.version||c.source.onBeforeCompile!==c.sourceHook||c.source.customProgramCacheKey!==c.sourceKey||c.source.version!==c.sourceVersion||copy.customProgramCacheKey()!==c.source.customProgramCacheKey())return null;
 return c.source;
}
export function markCoverageProgramFamily52(material,source){
 coverage.set(material,{source,hook:material.onBeforeCompile,key:material.customProgramCacheKey,version:material.version,sourceHook:source.onBeforeCompile,sourceKey:source.customProgramCacheKey,sourceVersion:source.version});return material;
}
export function coverageProgramFamily52(material){const c=coverage.get(material);if(!c)return null;
 if(material.onBeforeCompile!==c.hook||material.customProgramCacheKey!==c.key||material.version!==c.version||c.source.onBeforeCompile!==c.sourceHook||c.source.customProgramCacheKey!==c.sourceKey||c.source.version!==c.sourceVersion)return null;
 return origin(c.source);
}

export function uniformOnlyProgramOrigin52(material){return uniformClones.has(material)?origin(material):null;}
