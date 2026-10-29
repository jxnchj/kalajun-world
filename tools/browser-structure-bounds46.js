// Read-only, one-shot count AFTER timing samples. No geometry, render hook,
// visibility, shader, LOD, culling or hold changes. Existing live view matrices.
async function countStructureBounds46({name='structure-bounds46-forest'}={}){
 const d=window.kalajunV2?.debug;if(!d)throw Error('Ready debug world required');
 const camera=d.camera,structure=d.structures,reflection=d.water.reflection;
 const mainPV=camera.projectionMatrix.clone().multiply(camera.matrixWorldInverse);
 const mainFrustum=structure._frustum.clone().setFromProjectionMatrix(mainPV,camera.coordinateSystem,camera.reversedDepth);
 // LocalWaterReflection publishes T * mirrorProjection * mirrorView. Undo
 // only the texture XY mapping; use the exact existing oblique projection.
 const inverseTexture=camera.projectionMatrix.clone().set(2,0,0,-1,0,2,0,-1,0,0,1,0,0,0,0,1);
 const uniforms=reflection.uniforms,patch=reflection.patch;
 const reflectionValid=!!uniforms.uRiverReflectionValid.value&&!!patch;
 const reflectionPV=reflectionValid?inverseTexture.multiply(uniforms.uRiverReflectionMatrix.value):null;
 const mirrorFrustum=reflectionPV?structure._frustum.clone().setFromProjectionMatrix(reflectionPV,camera.coordinateSystem,camera.reversedDepth):null;
 const result={name,url:location.href,frame:d.renderer.info.render.frame,scope:'Current settled forest structures only; sphere-pass/AABB-fail is a culling opportunity count, not measured FPS benefit',pose:{position:camera.position.toArray(),yaw:d.controls.yaw,pitch:d.controls.pitch},reflection:{valid:reflectionValid,patch:patch?.id??null,sameCapturedPosition:reflection.capturePosition.equals(camera.position),sameCapturedProjection:reflection.captureProjection.equals(camera.projectionMatrix)},counts:{},rows:[],skipped:[]};
 const visible=o=>{for(let p=o;p;p=p.parent)if(!p.visible)return false;return true;};
 const meshes=new Map();for(const batch of structure._batches)for(const mesh of [batch.mesh,batch.lodMesh])if(mesh)meshes.set(mesh,'structures');
 for(const batch of structure.householdLiving?.batches||[])meshes.set(batch.mesh,'householdLiving');
 for(const [mesh,owner]of meshes){
  if(!visible(mesh)||mesh.count===0||!mesh.layers.test(camera.layers)||!mesh.material.visible)continue;
  if(!mesh.boundingBox||!mesh.boundingSphere||Array.isArray(mesh.material)||mesh.geometry.groups.length){result.skipped.push({name:mesh.name,reason:'Unsupported missing bounds/material array/groups'});continue;}
  const sphere=mesh.boundingSphere.clone().applyMatrix4(mesh.matrixWorld),box=mesh.boundingBox.clone().applyMatrix4(mesh.matrixWorld);
  const triangles=(mesh.geometry.index?.count??mesh.geometry.attributes.position.count)*mesh.count/3;
  for(const [view,frustum]of [['main',mainFrustum],['reflection',mirrorFrustum]]){
   if(!frustum)continue;
   // Match LocalWaterReflection's existing resident-scene range guard.
   if(view==='reflection'&&sphere.center.distanceTo(patch.center)-sphere.radius>220)continue;
   const key=view+'/'+owner+'/'+(mesh.userData.detailRole||'unknown');
   const counts=result.counts[key]??={tested:0,sphereAccepted:0,boxAccepted:0,sphereOnly:0,sphereOnlyTriangles:0,boxOnly:0};counts.tested++;
   const sphereAccepted=!mesh.frustumCulled||frustum.intersectsSphere(sphere),boxAccepted=!mesh.frustumCulled||frustum.intersectsBox(box);
   if(sphereAccepted)counts.sphereAccepted++;if(boxAccepted)counts.boxAccepted++;
   if(!sphereAccepted&&boxAccepted)counts.boxOnly++;
   if(sphereAccepted&&!boxAccepted){counts.sphereOnly++;counts.sphereOnlyTriangles+=triangles;result.rows.push({view,owner,name:mesh.name,assetId:mesh.userData.assetId??null,role:mesh.userData.detailRole??null,count:mesh.count,triangles,entityIds:mesh.userData.activeEntityIds??mesh.userData.entityIds??[],sphere:{center:sphere.center.toArray(),radius:sphere.radius},box:[box.min.toArray(),box.max.toArray()]});}
  }
 }
 const response=await fetch('/__review38/evidence',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({name,snapshot:result})});
 if(!response.ok)throw Error('Bounds evidence HTTP '+response.status+': '+await response.text());
 return{saved:true,name,counts:result.counts,skipped:result.skipped,reflection:result.reflection,opportunityRows:result.rows.length};
}
