import {Group,Frustum,Matrix4} from 'three';
import {compilePreparedWorld} from './shader-readiness.js';

function visibleMaterials(object){
 const source=object.userData.treeViewSource||object,geometry=source.geometry;
 if(source.isInstancedMesh&&source.count<=0)return [];
 if(geometry?.instanceCount===0)return [];
 const start=Math.max(0,geometry?.drawRange?.start??0);
 const end=Math.min(geometry?.index?.count??geometry?.attributes?.position?.count??Infinity,
  (geometry?.drawRange?.start??0)+(geometry?.drawRange?.count??Infinity));
 // Three calls setProgram before testing zero draw count; render-hook markers
 // therefore need their real program prepared despite drawing no vertices.
 if(end<=start&&!object.userData.compileRenderHook)return [];
 if(!Array.isArray(object.material))return object.material?.visible?[object.material]:[];
 const materials=new Set();
 for(const group of geometry?.groups||[]){const m=object.material[group.materialIndex];
  if(m?.visible&&Math.min(end,group.start+group.count)>Math.max(start,group.start))materials.add(m);
 }
 return [...materials];
}

// Compile only potentially drawn colour materials. This does not change scene
// membership, visibility, instance counts, or actual rendering. The caller has
// already updated world/camera matrices while preparing the destination.
// Additional cameras retain materials used by a current reflection capture.
export function compileVisibleWorld(renderer,scene,camera,{additionalCameras=[],additionalObjectFilter=()=>true}={}){
 const cameras=[camera,...additionalCameras],views=cameras.map(view=>{
  const frustum=new Frustum().setFromProjectionMatrix(new Matrix4().multiplyMatrices(view.projectionMatrix,view.matrixWorldInverse),view.coordinateSystem,view.reversedDepth);
  // Round-off guard only; normal geometry/wind bounds remain authoritative.
  for(const plane of frustum.planes)plane.constant+=.01;
  return{camera:view,frustum};
 });
 const selected=[],input=new Group();input.name='world-precompile-selection';
 scene.traverseVisible(object=>{
  if(!(object.isMesh||object.isLine||object.isPoints||object.isSprite))return;
  const materials=visibleMaterials(object);if(!materials.length)return;
  // Reflection-only exclusions must never suppress a main-camera material.
  if(!views.some((view,index)=>(index===0||additionalObjectFilter(object))&&object.layers.test(view.camera.layers)&&(!object.frustumCulled||object.intersectsFrustum(view.frustum))))return;
  if(Array.isArray(object.material)){
   // Keep geometry/instancing/skinning identity through inheritance. Only this
   // temporary compile view narrows the material array; never alter the mesh.
   const proxy=Object.create(object);proxy.material=materials;selected.push(proxy);
  }else selected.push(object);
 });
 // The source objects keep their original parents and matrices. Three's
 // compile() only traverses this input and takes lights/environment from its
 // explicit targetScene argument, so no temporary scene attachment is needed.
 input.traverse=input.traverseVisible=callback=>{callback(input);for(const object of selected)callback(object);};
 input.userData.compileSelection={objects:selected.length,cameras:views.length};
 return compilePreparedWorld(renderer,input,camera,scene);
}
