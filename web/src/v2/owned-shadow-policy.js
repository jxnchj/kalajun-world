import { FrontSide, BackSide, DoubleSide } from 'three';

// Explicit per-object policy, not a guess from mutable depth.side and not a
// replay of render callbacks. Callers own their depth and a pure validator.
// No registration means the ordinary installed-Three mapping is unchanged.
const policies=new WeakMap();
function assertPolicy(object,material,depth,policy){
 if(object.material!==policy.material||material!==policy.material||object.customDepthMaterial!==policy.depth||depth!==policy.depth||object.geometry!==policy.geometry)throw new Error('Owned shadow-side policy received foreign material, depth or geometry');
 policy.assertValid();
}
export function registerOwnedShadowSide(object,{material,depth,geometry,side,assertValid}){
 if(!object?.isObject3D||!material?.isMaterial||!depth?.isMeshDepthMaterial||!geometry?.isBufferGeometry||![FrontSide,BackSide,DoubleSide].includes(side)||typeof assertValid!=='function')throw new Error('Owned shadow-side policy requires explicit valid ownership');
 if(policies.has(object))throw new Error('Object already has an owned shadow-side policy');
 const policy=Object.freeze({material,depth,geometry,side,assertValid});assertPolicy(object,material,depth,policy);policies.set(object,policy);
 return ()=>{if(policies.get(object)===policy)policies.delete(object);};
}
export function ownedShadowSide(object,material,depth){
 const policy=policies.get(object);if(!policy)return undefined;
 assertPolicy(object,material,depth,policy);return policy.side;
}
