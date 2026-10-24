import {FrontSide} from 'three';
import {BOARDWALK_CABIN} from './boardwalk-endpoints.js';
export const CABIN_WINDOW_SOURCE_SHA='949072066eaa4afc88f4689be2e2f394a8c4e444c1045bc87e7c6b1d6df096c4';
export const cabinWindowGlassEnabled=(search=globalThis.location?.search??'')=>new URLSearchParams(search).get('cabinWindowGlass')!=='0';
export const cabinWindowTarget=entity=>entity.assetId===BOARDWALK_CABIN.assetId&&entity.id===BOARDWALK_CABIN.entityId;
export function verifyCabinWindowSource(scene){
 const node=scene.getObjectByName('cabin_small_glass');
 if(!node?.isMesh||Array.isArray(node.material)||node.material.name!=='glass')throw Error('Cabin thin-glass candidate: authored glass node missing');
 const g=node.geometry,p=g.attributes.position,idx=g.index;
 if((idx?.count??p.count)!==216)throw Error('Cabin thin-glass candidate: six original window boxes changed');
 const boxes=[...[-2.3,2.3].map(x=>[[x-.625,.85,3.08],[x+.625,2.05,3.12]]),...[-1.6,1.6].map(x=>[[x-.625,.85,-3.12],[x+.625,2.05,-3.08]]),...[-4.2,4.2].map(x=>[[x-.02,.85,-.55],[x+.02,2.05,.55]])],counts=boxes.map(()=>0);
 for(let i=0;i<216;i+=3){const matches=boxes.map(([lo,hi])=>[0,1,2].every(j=>{const k=idx?idx.getX(i+j):i+j;return [p.getX(k),p.getY(k),p.getZ(k)].every((v,a)=>v>=lo[a]-.00001&&v<=hi[a]+.00001);}));const at=matches.indexOf(true);if(at<0||matches.filter(Boolean).length!==1)throw Error('Cabin thin-glass candidate: pane coordinates changed');counts[at]++;}
 if(counts.some(n=>n!==12))throw Error('Cabin thin-glass candidate: original pane completeness changed');
 return {windows:6,triangles:72,sourceSHA256:CABIN_WINDOW_SOURCE_SHA};
}
export const isCabinWindowPart=part=>part.names.length===1&&part.names[0]==='cabin_small_glass'&&part.triangles===72;
export function createCabinWindowGlass(source){
 // Derive only the audited instance's original glass. Opaque frames/shutters and
 // the eight other cabin instances retain their existing material references.
 const m=source.clone();m.name='v2/cabin-route0-thin-glass';m.transparent=true;m.opacity=.04;m.depthWrite=false;m.side=FrontSide;
 m.color.setRGB(.96,.98,1);m.roughness=.08;m.metalness=0;m.userData={...source.userData,cabinWindowThinGlass:true};
 const previous=source.onBeforeCompile,key=source.customProgramCacheKey();
 m.onBeforeCompile=(shader,renderer)=>{previous.call(m,shader,renderer);shader.fragmentShader=shader.fragmentShader.replace('#include <opaque_fragment>','diffuseColor.a = 0.04 + 0.96 * pow(1.0 - saturate(abs(dot(normal, geometryViewDir))), 5.0);\n#include <opaque_fragment>');};
 m.customProgramCacheKey=()=>key+'-cabin-route0-thin-glass-v1';m.needsUpdate=true;return m;
}
