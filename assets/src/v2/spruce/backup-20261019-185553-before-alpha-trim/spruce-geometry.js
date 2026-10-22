import * as THREE from "three";
import spec from "./spruce-spec.json" with {type:"json"};
export const SPRUCE_SPEC=spec;
// Same crown envelope consumed by the editable Blender source and all runtime LODs.
export function spruceRadius(form,y){
  const t=THREE.MathUtils.clamp((y-form.base)/(spec.height-form.base),0,1);
  return form.rmax*Math.pow(1-t,form.pw)*(.88+.12*Math.sin(t*7.3+form.seed))+.12;
}
export function createFarSpruceGeometry(){
  const p=[],c=[],mask=[],ix=[],color=new THREE.Color("#405b45");
  // Four irregular primary branch masses, each with a narrow inset above its outer lip.
  // Reuse the same 104 triangles: detail is spent on silhouette instead of smooth cone bands.
  const rings=8,sides=6,levels=[0,.085,.247,.341,.512,.607,.789,.873,1],radii=[1,.64,1,.61,1,.66,.97,.62,.02];
  for(let j=0;j<=rings;j++)for(let k=0;k<=sides;k++){
    const sector=k%sides,a=k/sides*Math.PI*2;
    const irregular=j===0||j===rings?0:Math.sin(sector*2.4+j*1.7)*.012+Math.sin(sector*1.1-j*.8)*.008;
    const t=levels[j]+irregular,ruffle=1+.09*Math.sin(sector*2.4+j*1.7);
    const radius=radii[j]*ruffle;
    p.push(Math.cos(a)*radius,t*spec.height,Math.sin(a)*radius);mask.push(1);
    const tint=color.clone().multiplyScalar(.85+.12*t+.06*Math.sin(sector+j));c.push(tint.r,tint.g,tint.b);
  }
  for(let j=0;j<rings;j++)for(let k=0;k<sides;k++){const a=j*(sides+1)+k,b=a+sides+1;ix.push(a,b,a+1,a+1,b,b+1);}
  const base=p.length/3,bark=new THREE.Color("#625a48");
  for(let j=0;j<2;j++)for(let k=0;k<=4;k++){const a=k/4*Math.PI*2;p.push(Math.cos(a)*.23,j*4,Math.sin(a)*.23);mask.push(0);c.push(bark.r,bark.g,bark.b);}
  for(let k=0;k<4;k++){const a=base+k;ix.push(a,a+5,a+1,a+1,a+5,a+6);}
  const g=new THREE.BufferGeometry();g.setAttribute("position",new THREE.Float32BufferAttribute(p,3));g.setAttribute("color",new THREE.Float32BufferAttribute(c,3));
  g.setAttribute("aCrownMask",new THREE.Float32BufferAttribute(mask,1));g.setIndex(ix);g.computeVertexNormals();
  // Smooth the duplicate UV-free seam without smoothing away the inter-layer slope.
  const normals=g.attributes.normal,v=new THREE.Vector3();
  for(let j=0;j<=rings;j++){const first=j*(sides+1),last=first+sides;v.fromBufferAttribute(normals,first).add(new THREE.Vector3().fromBufferAttribute(normals,last)).normalize();normals.setXYZ(first,v.x,v.y,v.z);normals.setXYZ(last,v.x,v.y,v.z);}
  // Bounds include the largest shaped crown; shader movement never invalidates visibility/shadow culling.
  g.boundingBox=new THREE.Box3(new THREE.Vector3(-4.7,-.2,-4.7),new THREE.Vector3(4.7,18.3,4.7));g.boundingSphere=g.boundingBox.getBoundingSphere(new THREE.Sphere());return g;
}
export function installFarSpruceShape(material){
  const previous=material.onBeforeCompile,key=material.customProgramCacheKey();
  material.onBeforeCompile=(shader,renderer)=>{
    previous.call(material,shader,renderer);
    shader.vertexShader=`attribute vec4 aSpruceForm;attribute vec2 aSpruceAsym;attribute float aCrownMask;\n`+shader.vertexShader;
    shader.vertexShader=shader.vertexShader.replace("vec2 ecoOffset=ecoBend(position.y,ecoWeights,ecoRoot());",`float farT=clamp(position.y/18.,0.,1.);
float shapedHeight=mix(position.y,aSpruceForm.y+(18.-aSpruceForm.y)*farT,aCrownMask);
ecoWeights.x=clamp(shapedHeight/18.,0.,1.);
vec2 ecoOffset=ecoBend(shapedHeight,ecoWeights,ecoRoot());`);
    shader.vertexShader=shader.vertexShader.replace("#include <begin_vertex>",`#include <begin_vertex>
if(aCrownMask>.5){
 float t=clamp(position.y/18.,0.,1.);
 float r=aSpruceForm.x*pow(1.-t,aSpruceForm.z)*(.88+.12*sin(t*7.3+aSpruceAsym.y))+.12;
 transformed.y=aSpruceForm.y+(18.-aSpruceForm.y)*t;
 transformed.xz*=r*(1.+aSpruceAsym.x*normalize(position.xz+vec2(.00001)).x);
 transformed.x+=aSpruceForm.w*transformed.y;
}`);
    shader.vertexShader=shader.vertexShader.replace("#include <beginnormal_vertex>",`#include <beginnormal_vertex>
if(aCrownMask>.5){
 vec2 radial=normalize(position.xz+vec2(.00001));
 float t=clamp(position.y/18.,0.,1.);
 float asym=1.+aSpruceAsym.x*radial.x;
 float tip=max(.001,1.-t),phase=t*7.3+aSpruceAsym.y;
 float profile=.88+.12*sin(phase);
 float envelope=aSpruceForm.x*pow(1.-t,aSpruceForm.z)*profile+.12;
 float r=envelope*asym;
 float derivative=aSpruceForm.x*( -aSpruceForm.z*pow(tip,aSpruceForm.z-1.)*profile
   +pow(1.-t,aSpruceForm.z)*.876*cos(phase) )*asym/18.;
 float heightScale=(18.-aSpruceForm.y)/18.;
 // Inverse-transpose of the envelope: retain the folded normal, including the
 // asymmetric crown and trunk lean. Clamp only the singular derivative at the tip.
 vec3 sourceNormal=objectNormal;
 float radialLength=max(.0001,length(position.xz));
 vec2 radialGradient=envelope*aSpruceAsym.x*vec2(radial.y*radial.y,-radial.x*radial.y)/radialLength;
 vec2 normalXZ=sourceNormal.xz/r-radialGradient*dot(position.xz,sourceNormal.xz)/(r*r);
 float normalY=(sourceNormal.y-derivative*dot(position.xz,normalXZ))/heightScale-aSpruceForm.w*normalXZ.x;
 objectNormal=normalize(vec3(normalXZ.x,normalY,normalXZ.y));
}`);
    shader.vertexShader=shader.vertexShader.replace("ecoOffset*2./max(.15,position.y)","ecoOffset*2./max(.15,shapedHeight)");
  };material.customProgramCacheKey=()=>key+"-shared-spruce-layered-envelope-v2";return material;
}
export function setFarSpruceAttributes(geometry,records){
  geometry.setAttribute("aSpruceForm",new THREE.InstancedBufferAttribute(new Float32Array(records.flatMap(r=>{const f=spec.variants[r.variant];return[f.rmax,f.base,f.pw,f.lean];})),4));
  geometry.setAttribute("aSpruceAsym",new THREE.InstancedBufferAttribute(new Float32Array(records.flatMap(r=>{const f=spec.variants[r.variant];return[f.side,f.seed];})),2));
  return geometry;
}
export function installCrownOcclusion(material){
  const prior=material.onBeforeCompile,key=material.customProgramCacheKey();
  material.onBeforeCompile=(shader,renderer)=>{
    prior.call(material,shader,renderer);
    shader.vertexShader="attribute float aCrownOcclusion;varying float vCrownOcclusion;\n"+shader.vertexShader;
    shader.vertexShader=shader.vertexShader.replace("#include <begin_vertex>","#include <begin_vertex>\nvCrownOcclusion=aCrownOcclusion;");
    shader.fragmentShader="varying float vCrownOcclusion;\n"+shader.fragmentShader;
    shader.fragmentShader=shader.fragmentShader.replace("#include <aomap_fragment>","#include <aomap_fragment>\nreflectedLight.indirectDiffuse*=clamp(vCrownOcclusion,.35,1.);");
  };material.customProgramCacheKey=()=>key+"-crown-indirect-occlusion-v1";return material;
}
