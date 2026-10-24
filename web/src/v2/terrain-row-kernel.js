// CPU-only adapter around the authoritative terrain row builder. No second
// height/color formula, WebGL resources, scheduling or rendering policy.
import * as THREE from 'three';
import {WorldTerrain} from './terrain.js';
import {TerrainSampleCache} from './terrain-sample-cache.js';
import {getMeadowLandform} from './meadow-surface.js';

export function createTerrainRowKernel(world) {
  const kernel=Object.create(WorldTerrain.prototype);
  Object.assign(kernel,{world,tileCache:{take:()=>null},sampleCache:new TerrainSampleCache((x,z)=>world.surface.heightAt(x,z),{entries:65536,coordinateScale:25.6,attributeComponents:22}),_color:new THREE.Color(),landform:getMeadowLandform(world),_landformValue:new THREE.Vector2(),_landformResponse:[1,1,1,0],_communityResponse:[0,0,0,0]});
  return {
    build(input) {
      if(![input.x,input.z,input.size,input.depth].every(Number.isFinite)||input.size<=0)throw new TypeError('Invalid terrain row request');
      const parent=input.parent?{...input.parent,mesh:{geometry:{attributes:Object.fromEntries(Object.entries(input.parent.attributes).map(([name,a])=>[name,{array:a,getX:i=>a[i]}]))}}}:null;
      const node={x:input.x,z:input.z,size:input.size,depth:input.depth,parent};
      const job=kernel._job(node);
      while(job.row<=32)kernel._buildRow(job);
      // Node belongs to the main scheduler. Do not clone its cyclic scene graph.
      const {node:ignored,...payload}=job;
      return payload;
    },
    stats:kernel.sampleCache.stats,
    dispose(){kernel.sampleCache.dispose();}
  };
}
export function terrainRowInput(node) {
  const p=node.parent;
  return {x:node.x,z:node.z,size:node.size,depth:node.depth,parent:p?{x:p.x,z:p.z,heights:p.heights,centers:p.centers,attributes:Object.fromEntries(['normal','color','terrainCover','terrainHydrology','terrainShoreDistance','terrainLandform','terrainCommunity'].map(name=>[name,p.mesh.geometry.attributes[name].array]))}:null};
}
export function terrainRowBuffers(payload){return [...new Set(Object.values(payload).filter(ArrayBuffer.isView).map(a=>a.buffer))];}
