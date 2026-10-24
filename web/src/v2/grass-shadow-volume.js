import * as T from 'three';
import {attachEcologyWind} from './ecology.js';
// Each source triangle owns a closed prism: no silhouette approximation.
export const PRISM_INDICES=[0,1,2,5,4,3,0,3,4,0,4,1,1,4,5,1,5,2,2,5,3,2,3,0];
export function grassVolumeGeometry(source){
 const out=new T.BufferGeometry(),p=source.getAttribute('position'),w=source.getAttribute('aPlantWind'),index=source.index;
 const indices=[];
 const attrs={position:[],normal:[],aPlantWind:[],aVolumeCorner:[],aCornerA:[],aCornerB:[],aCornerC:[],aWeightA:[],aWeightB:[],aWeightC:[]};
 for(let i=0;i<index.count;i+=3){const ids=[index.getX(i),index.getX(i+1),index.getX(i+2)];const base=attrs.aVolumeCorner.length;indices.push(...PRISM_INDICES.map(j=>base+j));for(let j=0;j<6;j++){attrs.position.push(0,0,0);attrs.normal.push(0,1,0);attrs.aPlantWind.push(0,0,0);attrs.aVolumeCorner.push(j);for(let c=0;c<3;c++){const k=ids[c],name='ABC'[c];attrs['aCorner'+name].push(p.getX(k),p.getY(k),p.getZ(k));attrs['aWeight'+name].push(w.getX(k),w.getY(k),w.getZ(k));}}}
 for(const [name,array]of Object.entries(attrs))out.setAttribute(name,new T.Float32BufferAttribute(array,name==='aVolumeCorner'?1:3));out.setIndex(indices);return out;
}
export function grassVolumeMaterial(uniforms,sun,{side=T.FrontSide,length=24}={}){
 const m=attachEcologyWind(new T.MeshBasicMaterial({colorWrite:false,depthWrite:false,depthTest:true,side,stencilWrite:true,stencilFunc:T.AlwaysStencilFunc,stencilZFail:side===T.FrontSide?T.DecrementWrapStencilOp:T.IncrementWrapStencilOp,stencilZPass:T.KeepStencilOp,stencilFail:T.KeepStencilOp}),uniforms,2,true),old=m.onBeforeCompile;
 m.onBeforeCompile=(s,r)=>{old(s,r);s.uniforms.uVolumeSun=sun;s.uniforms.uVolumeLength={value:length};s.vertexShader=s.vertexShader.replace('void main() {',`attribute float aVolumeCorner;
attribute vec3 aCornerA,aCornerB,aCornerC,aWeightA,aWeightB,aWeightC;
uniform vec3 uVolumeSun;uniform float uVolumeLength;
vec3 volumeWind(vec3 p,vec3 w){vec2 b=ecoBend(p.y,w,ecoRoot());p.xz+=b;p.y-=dot(b,b)*.55;if(w.z>1.&&ecoHash(floor(ecoRoot().xz*.71)+13.)>.14)p=vec3(0.);return (modelMatrix*instanceMatrix*vec4(p,1.)).xyz;}
void main() {`);s.vertexShader=s.vertexShader.replace('#include <project_vertex>',`vec3 va=volumeWind(aCornerA,aWeightA),vb=volumeWind(aCornerB,aWeightB),vc=volumeWind(aCornerC,aWeightC);
if(dot(cross(vb-va,vc-va),uVolumeSun)<0.){vec3 swap=vb;vb=vc;vc=swap;}
float corner=mod(aVolumeCorner,3.);vec3 point=corner<.5?va:(corner<1.5?vb:vc);
point+=uVolumeSun*(aVolumeCorner>2.5?-uVolumeLength:-.0002);
vec4 mvPosition=viewMatrix*vec4(point,1.);gl_Position=projectionMatrix*mvPosition;`);};m.customProgramCacheKey=()=>`grass-closed-prism-v38-${side}`;return m;
}
