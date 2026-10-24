// Explicit dev-only import. No production/main import or background work.
import * as THREE from 'three';
import {WorldStructures} from './structures.js';
import {WorldDoors} from './doors.js';
export async function prepareLodgeStreamComparison(debug){
 const {structures,world=structures.world,scene,renderer,camera,environment,settlements,water}=debug;
 if(!structures.lodgeStream.enabled||!structures.lodgeStream.ready)throw Error('Comparison requires fully ready streamed lodge');
 if(!debug.setReviewHold)throw Error('Comparison requires explicit animation hold');
 const hold=debug.setReviewHold(true),doors=new WorldDoors({document:null,eventTarget:null});
 const full=new WorldStructures({...world,entities:world.entities.filter(e=>e.assetId==='gh_lanchuan_lodge')},{lodgeInteriorStream:false,lodgeChairs:true,lodgeInteriorWood:structures.lodgeInteriorWood,doors,preparedAssets:false});
 try{
  await full.load();environment.register(full.materials);settlements.registerMaterials(full.materials);scene.add(full.group);full.group.visible=false;
  const batches=structures._batches.filter(b=>b.mesh.userData.assetId==='gh_lanchuan_lodge'),meshes=batches.flatMap(b=>[b.mesh,b.lodMesh]).filter(Boolean);
  const original=new Map(meshes.map(m=>[m,m.visible]));let disposed=false;
  function choose(mode){
   if(disposed)throw Error('Comparison disposed');full.update(camera,0);structures.update(camera,0);
   for(const m of meshes)m.visible=mode==='stream'&&original.get(m);
   full.group.visible=mode==='full';scene.updateMatrixWorld(true);
   environment.forceShadowUpdate=true;environment.update(0);
   // Existing articulated doors are shared by both variants. The comparison's
   // loader captures/removes identical door nodes, but never adds another door.
   renderer.shadowMap.needsUpdate=true;for(const light of environment.csm.lights)light.shadow.needsUpdate=true;
  }
  async function capture(mode){
   choose(mode);if(debug.worldFrame)await debug.worldFrame.compileAsync(scene,camera);else await renderer.compileAsync(scene,camera);
   debug.renderFrozenWorld();water.reflection.lastCapture=-Infinity;water.renderReflection(renderer,scene,camera,{now:0,lightingRevision:environment.minutes});debug.renderFrozenWorld();
   const gl=renderer.getContext(),width=renderer.domElement.width,height=renderer.domElement.height,pixels=new Uint8Array(width*height*4);gl.readPixels(0,0,width,height,gl.RGBA,gl.UNSIGNED_BYTE,pixels);
   return {mode,width,height,pixels,png:renderer.domElement.toDataURL('image/png'),state:{time:environment.minutes,elapsed:environment.elapsed,camera:camera.matrixWorld.toArray(),wind:structures.world?.wind??null}};
  }
  function compare(a,b){let max=0,total=0,above1=0;for(let i=0;i<a.pixels.length;i++)if(i%4!==3){const d=Math.abs(a.pixels[i]-b.pixels[i]);max=Math.max(max,d);total+=d;above1+=d>1;}return {max,mean:total/(a.width*a.height*3),channelsAbove1:above1};}
  return {async capturePair(){const baseline=await capture('full'),candidate=await capture('stream'),control=await capture('full');return {baseline,candidate,control,difference:compare(baseline,candidate),controlDifference:compare(baseline,control)};},dispose(){if(disposed)return;choose('stream');water.reflection.lastCapture=-Infinity;full.group.removeFromParent();full.dispose();doors.dispose();disposed=true;debug.setReviewHold(hold);}};
 }catch(error){full.group.removeFromParent();full.dispose();doors.dispose();debug.setReviewHold(hold);throw error;}
}
