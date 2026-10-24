import {FrontSide} from 'three';

// Coordinates from guesthouses.py::lanchuan_lodge, after Blender Z-up -> glTF Y-up.
// This only registers the actual western dining volume. Lounge/service rooms are
// not assigned a fabricated dining-room GI field.
export const LODGE_DINING_ASSET=Object.freeze({
 sourceAsset:'gh_lanchuan_lodge-dining',name:'岚川公共楼 · 餐厅',portalSpots:false,height:3.0,
 floor:{shape:'rect',x0:-12.5,x1:-3.70,z0:-3.30,z1:3.30,y:.035},
 lightingStage:'finite-real-openings; multiple-bounce field pending',
 openings:[
  ...[-10.8,-8.2,-5.6].map(x=>({kind:'window',center:[x,1.265,3.5],width:2.2,height:2.37,normal:[0,0,1],skyWeight:.90})),
  {kind:'window',center:[-10.2,1.50,-3.5],width:.8,height:.7,normal:[0,0,-1],skyWeight:.90},
  // The rear entrance is an authored open gap, not an articulated leaf.
  {kind:'opening',center:[-4.6,1.05,-3.5],width:1,height:2.1,normal:[0,0,-1]},
  {kind:'window',center:[-12.7,1.475,0],width:1,height:1.15,normal:[-1,0,0],skyWeight:.90},
 ]
});
export function prepareLodgeGlass(assetId,scene){
 if(assetId!=='gh_lanchuan_lodge')return 0;
 const materials=new Set();scene.traverse(node=>{if(node.isMesh)for(const m of Array.isArray(node.material)?node.material:[node.material])if(m.name==='glass')materials.add(m);});
 for(const m of materials){
  // Runtime derivative only. Original editing GLB, attributes and collision stay intact.
  m.transparent=true;m.opacity=.08;m.depthWrite=false;m.side=FrontSide;
  m.color.setRGB(.83,.91,.94);m.roughness=.08;m.metalness=0;
  m.userData={...m.userData,lodgeThinGlass:true};m.needsUpdate=true;
 }
 return materials.size;
}
export function installLodgeThinGlass(material){
 if(!material.userData.lodgeThinGlass)return;
 const previous=material.onBeforeCompile,key=material.customProgramCacheKey();
 material.onBeforeCompile=(shader,renderer)=>{
  previous.call(material,shader,renderer);
  // Thin clear glass approximation: retain view through the original pane and
  // increase reflected surface contribution at grazing angles; no blur/refraction pass.
  shader.fragmentShader=shader.fragmentShader.replace('#include <opaque_fragment>',
   'diffuseColor.a = 0.04 + 0.96 * pow(1.0 - saturate(abs(dot(normal, geometryViewDir))), 5.0);\n#include <opaque_fragment>');
 };
 material.customProgramCacheKey=()=>key+'-lodge-thin-glass-v1';material.needsUpdate=true;
}
