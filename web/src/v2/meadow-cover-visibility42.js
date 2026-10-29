import * as T from 'three';
// Private fixed-source review owner. No root generation or approximate terrain occlusion.
export function createCoverTiles42(roots,geometry,matrices,keyOf){
 if(matrices.length!==roots.length*16)throw Error('Source matrix count changed');
 geometry.computeBoundingBox();const w=geometry.attributes.aPlantWind;
 let sway=0;for(let i=0;i<w.count;i++)sway=Math.max(sway,.43*w.getX(i)**2+.11*w.getY(i));
 const map=new Map(),matrix=new T.Matrix4();
 roots.forEach((r,i)=>{const key=keyOf(r);let tile=map.get(key);if(!tile){tile={key,indices:[],bounds:new T.Box3(),rootBounds:new T.Box3()};map.set(key,tile);}matrix.fromArray(matrices,i*16);const p=new T.Vector3().setFromMatrixPosition(matrix),s=new T.Vector3().setFromMatrixScale(matrix),box=geometry.boundingBox.clone().applyMatrix4(matrix);const horizontal=sway*Math.max(Math.abs(s.x),Math.abs(s.z))+.015;box.min.x-=horizontal;box.min.z-=horizontal;box.max.x+=horizontal;box.max.z+=horizontal;box.min.y-=.55*sway*sway*Math.abs(s.y)+.015;box.max.y+=.015;tile.bounds.union(box);tile.rootBounds.expandByPoint(p);tile.indices.push(i);});
 return[...map.values()];
}
export function selectCoverTiles42(tiles,camera,enabled=true){
 camera.updateMatrixWorld();const frustum=new T.Frustum().setFromProjectionMatrix(new T.Matrix4().multiplyMatrices(camera.projectionMatrix,camera.matrixWorldInverse),camera.coordinateSystem,camera.reversedDepth);
 const active=[],bounds=new T.Box3();let near=0,outside=0;
 for(const tile of tiles){if(enabled){let farthest=0;for(const x of[tile.rootBounds.min.x,tile.rootBounds.max.x])for(const z of[tile.rootBounds.min.z,tile.rootBounds.max.z])farthest=Math.max(farthest,Math.hypot(x-camera.position.x,z-camera.position.z));if(farthest<=296){near++;continue;}if(!frustum.intersectsBox(tile.bounds)){outside++;continue;}}active.push(tile);bounds.union(tile.bounds);}
 return{active,bounds,near,outside,roots:active.reduce((n,t)=>n+t.indices.length,0),signature:active.map(t=>t.key).join('|')};
}
export function copyCoverSelection42(selected,canonical,target){
 let slot=0;for(const tile of selected)for(const i of tile.indices){target.matrices.set(canonical.matrices.subarray(i*16,i*16+16),slot*16);for(let f=0;f<canonical.fields.length;f++)target.fields[f].set(canonical.fields[f].subarray(i*4,i*4+4),slot*4);slot++;}return slot;
}
