// Read-only diagnostic. Redirect stdout to retain a report; does not alter runtime.
import * as THREE from '../web/node_modules/three/build/three.module.js';
import {CSM} from '../web/node_modules/three/examples/jsm/csm/CSM.js';
import {createNearShadowDetail,configureNearShadowDetail} from '../web/src/v2/near-shadow-detail.js';
import {meadowGeometry,basalGrassGeometry} from '../web/src/v2/ecology.js';
import assert from 'node:assert/strict';
const camera=new THREE.PerspectiveCamera(52,1280/800,.25,150000);
const detail=createNearShadowDetail({maxTextures:16,maxTextureSize:8192});
const csm=new CSM({camera,parent:new THREE.Scene(),cascades:detail.cascades,maxFar:500,mode:'custom',customSplitsCallback:detail.customSplitsCallback,shadowMapSize:detail.shadowMapSize});
csm.fade=true;csm.updateFrustums();const restore=configureNearShadowDetail(csm,detail);
const shadow=csm.lights[0].shadow,pitch=(shadow.camera.right-shadow.camera.left)/shadow.mapSize.x;
const results=[];
try {
 for(const [name,g,bladeCount,rows] of [['meadow',meadowGeometry(),24,6],['basal',basalGrassGeometry(),40,4]]){
  const position=g.attributes.position,widths=[];
  for(let blade=0;blade<bladeCount;blade++)for(let row=0;row<rows;row++){
   const i=(blade*rows+row)*2;
   assert.ok(i+1<position.count);
   const width=new THREE.Vector3().fromBufferAttribute(position,i).distanceTo(new THREE.Vector3().fromBufferAttribute(position,i+1));
   if(width>1e-8)widths.push(width*1.3/pitch);
  }
  widths.sort((a,b)=>a-b);
  // Maximum root xz scale is 1.3; sampled blade cross-sections have no y
  // component for basal grass and only a small y component for meadow grass.
  // sy may reach s*1.13, so use that higher scale on ALL axes for the strict
  // orientation-independent upper bound below.
  const conservative=widths.map(v=>v*1.13);
  results.push({name,blades:bladeCount,nonzeroCrossSections:widths.length,
   upperBoundScale:1.3*1.13,widthUpperBoundTexels:{maximum:Math.max(...conservative),median:conservative[Math.floor(conservative.length/2)],belowOne:conservative.filter(v=>v<1).length,belowHalf:conservative.filter(v=>v<.5).length},
   note:'3D width divided by shadow pixel pitch is an upper bound on projected width. Tips at zero width excluded; not a pixel-area or temporal flicker metric.'});
  g.dispose();
 }
 console.log(JSON.stringify({version:37,kind:'offline geometry diagnostic; not browser acceptance',conditions:{fov:52,viewport:[1280,800],near:.25,far:150000,csmFade:true,nearCascadeEnd:detail.splits[0],shadowMapSize:shadow.mapSize.x,shadowCoverageMeters:shadow.camera.right-shadow.camera.left,shadowPixelMeters:pitch},results,
  findings:['Many actual blade cross-sections remain narrower than one shadow texel even at the largest possible root scale and most favorable projection. Wind can toggle these binary depth samples; PCF filters their coverage but cannot reconstruct the missing silhouette.','Color and depth share ecoBend and uniform objects; the existing absolute-time wind interpolation fix is already present. This diagnostic does not exclude all other causes.'],
  status:'Unresolved. No density, geometry, shadow resolution, bias, filter radius, wind strength or defaults changed.',
  next:'Prototype a separately fitted close-range vegetation shadow with unchanged existing cascades, resolving the occupied-room 16-sampler constraint first. Validate fixed-time moving silhouettes and GPU cost before adoption.'},null,2));
} finally {restore();csm.dispose();}
