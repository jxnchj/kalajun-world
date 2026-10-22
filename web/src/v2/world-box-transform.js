// Fixed world/tile translations are common; avoid transforming eight corners.
// Read the actual matrix on EVERY call. Rotation, scale, shear and projective
// transforms always use Three's original implementation, with no cached state.
export const worldBoxTransformControl={enabled:new URLSearchParams(globalThis.location?.search||"").get("boxTransform")!=="legacy"};
export function transformWorldBox(target,source,matrix,enabled=worldBoxTransformControl.enabled){
 const e=matrix.elements,a=source.min,b=source.max;
 if(enabled&&e[0]===1&&e[5]===1&&e[10]===1&&e[15]===1
   &&e[1]===0&&e[2]===0&&e[3]===0&&e[4]===0&&e[6]===0&&e[7]===0&&e[8]===0&&e[9]===0&&e[11]===0
   &&!source.isEmpty()&&Number.isFinite(a.x+a.y+a.z+b.x+b.y+b.z+e[12]+e[13]+e[14])){
  // Keep Vector3.applyMatrix4's order (including +0 normalization) so finite
  // translated bounds match its eight-corner min/max result exactly.
  const ax=a.x+e[12],ay=a.y+e[13],az=a.z+e[14],bx=b.x+e[12],by=b.y+e[13],bz=b.z+e[14];
  // Zero products of negative corner components can preserve -0. Let Three
  // handle these rare boundary cases rather than normalizing their signs.
  if(ax!==0&&ay!==0&&az!==0&&bx!==0&&by!==0&&bz!==0){target.min.set(ax,ay,az);target.max.set(bx,by,bz);return target;}
 }
 return target.copy(source).applyMatrix4(matrix);
}
