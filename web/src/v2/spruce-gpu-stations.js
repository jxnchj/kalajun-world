import {certifyUniformOnlyClone52} from './shadow-program-family52.js';
import {NeedleShape40} from './needle-shape40.js';
import {createIndexedTwigTemplate} from './spruce-twig-indexed.js';
import {BRANCH_DETAIL,BRANCH_LOD_GLSL,branchFragment,branchReadyUniform,createBranchReadiness} from './spruce-branch-detail.js';
import * as THREE from 'three';
import {createGpuPacketBuilder,estimateGpuPacketBytes} from './spruce-gpu-loading.js';
import {SpruceBranchCache} from './spruce-branch-cache.js';
import {GpuGeometryOwners,createGpuBrushTables} from './spruce-gpu-brush.js';
// Bound the geometry actually reconstructed by the station/twig shaders, once
// per immutable packet. The interval over all needle angles includes both the
// tip and the 1.15 mm half-width; shared branch variations retain their lengths.
// Six doubles per brush stay CPU-only. No GPU attribute or draw layout changes.
export function stationBrushBounds(packet){
 const out=new Float64Array(packet.brushes*6),f=packet.frames,stride=packet.frameStride||16;
 for(let brush=0;brush<packet.brushes;brush++){
  const lo=[Infinity,Infinity,Infinity],hi=[-Infinity,-Infinity,-Infinity];let minWeight=Infinity,maxWeight=-Infinity,maxBranch=0;
  const key=packet.variationKeys?.[brush]??-1,variation=key<0?packet.variations:packet.sharedVariations,variationStart=(key<0?brush:key)*2880;
  for(let station=0;station<288;station++){
   const o=(brush*288+station)*stride,t=[f[o+4],f[o+5],f[o+6]],l=[f[o+8],f[o+9],f[o+10]];
   const u=stride===16?[f[o+12],f[o+13],f[o+14]]:[l[1]*t[2]-l[2]*t[1],l[2]*t[0]-l[0]*t[2],l[0]*t[1]-l[1]*t[0]];
   if(stride===13){const length=Math.hypot(...u);for(let k=0;k<3;k++)u[k]/=length;}
   let length=0;for(let i=0;i<5;i++)length=Math.max(length,variation[variationStart+station*10+i*2+1]);
   for(let k=0;k<3;k++){const radius=Math.max(.00115,length*(Math.hypot(u[k],l[k])+.36*Math.abs(t[k])));lo[k]=Math.min(lo[k],f[o+k]-radius);hi[k]=Math.max(hi[k],f[o+k]+radius);}
   minWeight=Math.min(minWeight,f[o+7]);maxWeight=Math.max(maxWeight,f[o+7]);maxBranch=Math.max(maxBranch,Math.abs(f[o+11]));
  }
  for(let vertex=0;vertex<117;vertex++){
   const o=(brush*117+vertex)*12;for(let k=0;k<3;k++){lo[k]=Math.min(lo[k],packet.wood[o+k]);hi[k]=Math.max(hi[k],packet.wood[o+k]);}
   minWeight=Math.min(minWeight,packet.wood[o+7]);maxWeight=Math.max(maxWeight,packet.wood[o+7]);maxBranch=Math.max(maxBranch,Math.abs(packet.wood[o+8]));
  }
  // ecoBend: r,g in [0,1], eddy in [-.5,.5], unit direction, sin in [-1,1].
  // current + returning = 1.32*(1-alpha)*r + (1.32*alpha-.32)*g.
  // Evaluate the coefficient extrema without assuming clamped asset weights.
  const a=minWeight*.48,b=maxWeight*.48,h=Math.min(Math.max(hi[1],0),20);
  const gust=Math.max(1,Math.abs(1.32*(1-a)),Math.abs(1.32*a-.32),Math.abs(1.32*(1-b)),Math.abs(1.32*b-.32));
  const flex=Math.max(Math.abs(1-a),Math.abs(1-b));
  const wind=(gust*h*h*.0014+maxBranch*(.027+.12*flex))*1.00001;
  for(let k=0;k<3;k++){const margin=(k===1?0:wind)+.0001;out[brush*6+k]=lo[k]-margin;out[brush*6+k+3]=hi[k]+margin;}
 }
 return out;
}
export function stationRunBounds(geometry,start,count,target=new THREE.Box3()){
 const bounds=geometry.userData.brushBounds;
 if(!bounds||start<0||count<1||(start+count)*6>bounds.length)throw new RangeError('GPU spruce run exceeds its packet bounds');
 target.makeEmpty();for(let i=start;i<start+count;i++){
  const o=i*6;target.min.x=Math.min(target.min.x,bounds[o]);target.min.y=Math.min(target.min.y,bounds[o+1]);target.min.z=Math.min(target.min.z,bounds[o+2]);
  target.max.x=Math.max(target.max.x,bounds[o+3]);target.max.y=Math.max(target.max.y,bounds[o+4]);target.max.z=Math.max(target.max.z,bounds[o+5]);
 }return target;
}
function brushFrustumHook(control,preparation){
 const worldBox=new THREE.Box3();return function(frustum){
  if(this.count===0)return false;
  // Preserve the original colour/depth preparation path. An off-camera brush
  // may still cast a visible shadow; tighter bounds must not delay its fade.
  if(!control.spatialBounds||(preparation&&preparation.flags!==15))return THREE.Mesh.prototype.intersectsFrustum.call(this,frustum);
  return frustum.intersectsBox(worldBox.copy(this.boundingBox).applyMatrix4(this.matrixWorld));
 };
}
// A five-needle station is instanced across all brushes of one form, then the
// SAME immutable VBOs are shared by every tree root of that form. No per-needle
// vertex texture fetch is needed. Near roots remain individual bounded draws.
export function createStationGeometry(packet){
 const g=new THREE.BufferGeometry(),frames=new THREE.InstancedInterleavedBuffer(packet.frames,packet.frameStride||16,1),variation=new Float32Array((packet.sharedVariations?0:packet.brushes)*288*12);
 for(let brush=0;brush<(packet.sharedVariations?0:packet.brushes);brush++)for(let station=0;station<288;station++){
  const i=brush*288+station,o=i*12;variation.set(packet.variations.subarray(i*10,i*10+10),o);
  variation[o+10]=station<264?(station%22+Math.floor(station/44))%4:(station-264)%4;
 }
 const v=new THREE.InstancedInterleavedBuffer(variation,12,1);
 for(let i=0;i<4;i++)g.setAttribute('aNeedleFrame'+i,new THREE.InterleavedBufferAttribute(frames,i===3&&packet.frameStride===13?1:4,i*4));
 if(!packet.sharedVariations)for(let i=0;i<3;i++)g.setAttribute('aNeedleVariation'+i,new THREE.InterleavedBufferAttribute(v,4,i*4));
 g.setAttribute('position',new THREE.Float32BufferAttribute(new Float32Array(45),3));g.setAttribute('normal',new THREE.Float32BufferAttribute(new Float32Array(45),3));g.setAttribute('uv',new THREE.Float32BufferAttribute(new Float32Array(30),2));
 g.setAttribute('aPlantWind',new THREE.Float32BufferAttribute(new Float32Array(45),3));g.setAttribute('aCrownOcclusion',new THREE.Float32BufferAttribute(new Float32Array(15),1));
 if(packet.branchLod){
  // All 288 stations of a brush read one shared centre; do not repeat it per station.
  g.setAttribute('aSprayLod',new THREE.InterleavedBufferAttribute(new THREE.InstancedInterleavedBuffer(packet.branchLod,4,288),4,0));
  g.userData.drawGroups=packet.drawGroups.map(group=>({...group,lod:group.lod||packet.branchLod.subarray(group.start*4,(group.start+group.count)*4),boundsBox:group.bounds?new THREE.Box3(new THREE.Vector3(...group.bounds.min),new THREE.Vector3(...group.bounds.max)):null}));
 }
 const boundsStarted=performance.now();g.userData.brushBounds=stationBrushBounds(packet);g.userData.boundsBuildMs=performance.now()-boundsStarted;g.userData.stationCount=packet.brushes*288;g.userData.parameterBytes=packet.frames.byteLength+variation.byteLength+(g.attributes.aSprayLod?.data.array.byteLength||0);return g;
}
export const STATION_GLSL=`
attribute vec4 aNeedleFrame0,aNeedleFrame1,aNeedleFrame2,aNeedleFrame3;
attribute vec4 aNeedleVariation0,aNeedleVariation1,aNeedleVariation2;
void readNeedleStation(out vec3 p,out vec3 normal,out vec3 wind,out float ao,out vec2 uv){
 int needle=gl_VertexID/3,corner=gl_VertexID%3;vec2 al;
 if(needle==0)al=aNeedleVariation0.xy;else if(needle==1)al=aNeedleVariation0.zw;else if(needle==2)al=aNeedleVariation1.xy;else if(needle==3)al=aNeedleVariation1.zw;else al=aNeedleVariation2.xy;
 vec3 delta=(aNeedleFrame3.xyz*cos(al.x)+aNeedleFrame2.xyz*sin(al.x))*al.y+aNeedleFrame1.xyz*(al.y*.36);
 vec3 side=normalize(cross(delta,aNeedleFrame1.xyz));p=aNeedleFrame0.xyz+(corner==2?delta:side*(corner==0?-.00115:.00115));
 normal=normalize(cross(side,delta));wind=vec3(aNeedleFrame1.w,aNeedleFrame2.w,aNeedleFrame3.w);ao=aNeedleFrame0.w;
 int colour=(int(aNeedleVariation2.z+.5)+needle)%4;vec2 centre=colour==0?vec2(557.5,376.5):colour==1?vec2(381.5,607.5):colour==2?vec2(563.5,679.5):vec2(563.5,442.5);
 uv=(centre+(corner==0?vec2(-.3,.3):corner==1?vec2(.3,.3):vec2(0.,-.3)))/vec2(2048.,1024.);
}
`;
export function installGpuNeedleStations(material,{branches=!!material.userData.spruceBranchDetails}={}){
 material.userData.solidNeedleStations=true;
 const previous=material.onBeforeCompile,key=material.customProgramCacheKey();
 material.onBeforeCompile=(shader,renderer)=>{
  previous.call(material,shader,renderer);let v=shader.vertexShader;
  if(!v.includes('// ECO_LOD_EARLY_END'))throw new Error('GPU station requires shared tree LOD/wind hook first');
  v=v.replace('// ECO_LOD_EARLY_END','// ECO_LOD_EARLY_END\nvec3 brushPosition,brushNormal,brushWind;float brushAO;vec2 uv;readNeedleStation(brushPosition,brushNormal,brushWind,brushAO,uv);');
  v=v.replace('attribute vec3 aPlantWind;','').replace('attribute float aCrownOcclusion;','');
  v=v.replaceAll('position.y','brushPosition.y').replace('ecoWeights=aPlantWind','ecoWeights=brushWind').replace('vCrownOcclusion=aCrownOcclusion','vCrownOcclusion=brushAO');
  v=v.replace('#include <begin_vertex>','vec3 transformed=brushPosition;').replace('#include <beginnormal_vertex>','vec3 objectNormal=brushNormal;\n#ifdef USE_TANGENT\nvec3 objectTangent=vec3(tangent.xyz);\n#endif');
  let code=STATION_GLSL;
  if(material.normalMap&&!material.isMeshDepthMaterial){code='varying vec2 vNeedleSection;\n'+code.replace(' int needle=',' vNeedleSection=gl_VertexID%3==0?vec2(-1.,1.):gl_VertexID%3==1?vec2(1.,1.):vec2(0.);\n int needle=');}
  if(branches){shader.uniforms.uBranchReady=branchReadyUniform;v=v.replace('uniform vec3 uWorldViewer;','');
   shader.uniforms.uBranchVariation={value:material.userData.spruceBranchVariation||null};shader.uniforms.uBranchOriginalBrushes={value:material.userData.spruceBranchOriginalBrushes||0};
   code='uniform sampler2D uBranchVariation; uniform int uBranchOriginalBrushes;\n'+code.replaceAll('aNeedleFrame3.xyz','normalize(cross(aNeedleFrame2.xyz,aNeedleFrame1.xyz))').replaceAll('aNeedleFrame3.w','aNeedleFrame3.x');
   code=code.replace('attribute vec4 aNeedleVariation0,aNeedleVariation1,aNeedleVariation2;','');
   code=code.replace(/ if\(needle==0\)al=.*?;\n/,` int station=gl_InstanceID%288;int variationBrush=aSprayLod.w>.5?uBranchOriginalBrushes+int(mod(aSprayLod.w-1.,16.)+.5):gl_InstanceID/288;int j=variationBrush*1440+station*5+needle;vec4 pair=texelFetch(uBranchVariation,ivec2((j/2)%1024,(j/2)/1024),0);al=j%2==0?pair.xy:pair.zw;\n`);
   code=code.replace('int colour=(int(aNeedleVariation2.z+.5)+needle)%4;',`int colourBase=station<264?(station%22+station/44)%4:(station-264)%4;int colour=(colourBase+needle)%4;`);
   code='attribute vec4 aSprayLod;\n'+BRANCH_LOD_GLSL+code;
   v=v.replace('// ECO_LOD_EARLY_END',`// ECO_LOD_EARLY_END
vSpruceBranchFade=spruceBranchFade(aSprayLod);
if(vSpruceBranchFade<=0.){gl_Position=vec4(2.,2.,2.,1.);return;}`);branchFragment(shader);
  }
  shader.vertexShader=code+v;
 };material.customProgramCacheKey=()=>key+'-gpu-shared-needle-stations-v12-'+branches;return material;
}
function container(source){const g=new THREE.BufferGeometry();for(const [key,a]of Object.entries(source.attributes))g.setAttribute(key,a);g.setIndex(source.index);g.drawRange={...source.drawRange};return g;}
function release(mesh){for(const key of Object.keys(mesh.geometry.attributes))if(!key.startsWith('aTreeRoot'))mesh.geometry.deleteAttribute(key);mesh.geometry.dispose();mesh.dispose();}
// Match the shader's unchanged branch-centre distance. Only zero-fade
// instances are omitted; contiguous views keep the original shared VBO layout.
// A 2 mm guard covers Float32 world-coordinate rounding at this world's scale.
export function branchDrawRuns(group,matrix,viewer){
 if(!group.extra||!viewer)return{runs:[{start:0,count:group.count}],priority:0};
 const lod=group.lod,e=matrix.elements,limit=(BRANCH_DETAIL.far+.002)**2,runs=[];let start=-1,min=Infinity;
 for(let i=0;i<group.count;i++){
  const j=i*4,x=lod[j],y=lod[j+1],z=lod[j+2];
  const dx=e[0]*x+e[4]*y+e[8]*z+e[12]-viewer.x,dy=e[1]*x+e[5]*y+e[9]*z+e[13]-viewer.y,dz=e[2]*x+e[6]*y+e[10]*z+e[14]-viewer.z,d=dx*dx+dy*dy+dz*dz;
  min=Math.min(min,d);if(d<=limit){if(start<0)start=i;}else if(start>=0){runs.push({start,count:i-start});start=-1;}
 }
 if(start>=0)runs.push({start,count:group.count-start});return{runs,priority:Math.sqrt(min)};
}
// Tiny zero-fade gaps are cheaper than two additional material submissions.
// Their vertices exit before needle geometry, wind and normal construction.
export function coalesceBranchRuns(runs,maxGap=6){
 const result=[];for(const run of runs){const previous=result.at(-1);if(previous&&run.start-previous.start-previous.count<=maxGap)previous.count=run.start+run.count-previous.start;else result.push({...run});}return result;
}
export class SpruceGpuStationBrushes{
 constructor(forms,twigTemplate,{branchImmediateDispatch=new URLSearchParams(globalThis.location?.search||'').get('needleBranchDispatch40')!=='0',needleShape=new URLSearchParams(globalThis.location?.search||'').get('needleShape40')==='1',indexedTwig=new URLSearchParams(globalThis.location?.search||'').get('twigIndexed')==='1',branchQueue=new URLSearchParams(globalThis.location?.search||'').get('needleBranchQueue')==='1'?1:2,spatialBounds=new URLSearchParams(globalThis.location?.search||'').get('needleBounds')!=='v15',joinGaps=new URLSearchParams(globalThis.location?.search||'').get('needleBranchGaps')==='0'?0:6}={}){this.spatialBounds=spatialBounds;this.joinGaps=joinGaps;for(const f of forms){f.material.userData.spruceBranchVariation=f.tables.branchVariations;f.depth.userData.spruceBranchVariation=f.tables.branchVariations;f.material.userData.spruceBranchOriginalBrushes=f.depth.userData.spruceBranchOriginalBrushes=f.tables.originalBrushes;}this.forms=forms;this.indexedTwig=indexedTwig;this.template=indexedTwig?createIndexedTwigTemplate(twigTemplate):twigTemplate;if(indexedTwig)twigTemplate.dispose();this.group=new THREE.Group();this.group.name='shared-station-needles';this.batches=new Map();this.owners=new GpuGeometryOwners();this.stats={twigIndexed:indexedTwig,twigTemplateVertices:indexedTwig?this.template.attributes.position.count:468,twigCornerIndices:indexedTwig?this.template.index.count:0,boundsMode:spatialBounds?'packet-run-aabb':'v15-parent-sphere',boundsBytes:forms.reduce((n,f)=>n+f.stationGeometry.userData.brushBounds.byteLength,0),boundsBuildMs:forms.reduce((n,f)=>n+f.stationGeometry.userData.boundsBuildMs,0),representation:'GPU shared five-needle station + shared 156-triangle twig geometry; v11 needles use 0 vertex texture fetches; v12 uses 1 shared variation fetch and 5 station attributes',batches:0,roots:0,brushInstances:0,triangles:0,tableBytes:forms.reduce((n,f)=>n+f.stationGeometry.userData.parameterBytes+f.tables.bytes,0),templateBytes:(this.template.index?.array.byteLength||0)+Object.values(this.template.attributes).reduce((n,a)=>n+a.array.byteLength,0)+forms.reduce((n,f)=>n+Object.values(f.stationGeometry.attributes).filter(a=>!a.isInterleavedBufferAttribute).reduce((sum,a)=>sum+a.array.byteLength,0),0)};
  this.needleShape=new NeedleShape40({enabled:needleShape});for(const f of new Set(forms))this.needleShape.register(f);this.stats.needleShape=this.needleShape.stats;
  this.lazyBranches=forms.some(f=>f.stationGeometry.userData.drawGroups?.some(g=>g.lazy));
  this.branchField=forms.some(f=>f.stationGeometry.hasAttribute('aSprayLod'))?createBranchReadiness(!this.lazyBranches):null;
  this.viewer=new THREE.Vector3();
  if(this.lazyBranches){this.branchQueue=branchQueue===2?2:1;this.branchBuilder=createGpuPacketBuilder({maxInFlight:this.branchQueue});this.branchCache=new SpruceBranchCache({immediateDispatch:branchImmediateDispatch,concurrency:this.branchQueue,estimateBytes:d=>estimateGpuPacketBytes(d.records),
   build:async(d,key)=>{let p;const builder=this.branchBuilder;try{p=await builder.build(d.records);}catch(error){if(!this.branchCache.closed&&this.branchBuilder===builder){builder.dispose();this.branchBuilder=createGpuPacketBuilder({maxInFlight:this.branchQueue});}throw error;}const packetTiming=builder.getTiming(p),prepareStarted=performance.now();p.branchLod=d.lod;p.drawGroups=[{start:0,count:p.brushes,extra:true}];const stationGeometry=createStationGeometry(p),tables=createGpuBrushTables(p,true,{includeVariations:false}),base=this.forms[d.variant];
    const copy=original=>{const material=original.clone();material.onBeforeCompile=(shader,r)=>{original.onBeforeCompile(shader,r);Object.assign(shader.uniforms,{uBrushWood:{value:tables.wood},uBrushCount:{value:tables.count},uBranchLod:{value:tables.branchLod}});};material.customProgramCacheKey=()=>original.customProgramCacheKey();return certifyUniformOnlyClone52(material,original);};
    const form={...base,stationGeometry,tables,twigMaterial:copy(base.twigMaterial),twigDepth:copy(base.twigDepth)};
    if(this.needleShape.installed){for(const key of ['material','depth']){const original=base[key],m=original.clone();m.onBeforeCompile=(shader,r)=>original.onBeforeCompile(shader,r);m.customProgramCacheKey=()=>original.customProgramCacheKey();m.userData.spruceBranchVariation=original.userData.spruceBranchVariation;m.userData.spruceBranchOriginalBrushes=original.userData.spruceBranchOriginalBrushes;form[key]=m;}this.needleShape.register(form);}
    return{form,preparationTiming:packetTiming?{...packetTiming,mainPrepareMs:performance.now()-prepareStarted}:null,bytes:stationGeometry.userData.parameterBytes+tables.bytes+(this.needleShape.records.get(form)?.bytes||0),readyIndex:d.readyIndex,flags:0,fadeAt:null,firstColourAt:null};
   },disposeValue:(value,key)=>{this.owners.disposeKey('lazy-'+key);this.needleShape.unregister(value.form);if(this.needleShape.installed){value.form.material.dispose();value.form.depth.dispose();}value.form.stationGeometry.dispose();value.form.tables.dispose();value.form.twigMaterial.dispose();value.form.twigDepth.dispose();this.branchField.set(value.readyIndex,0);}
  });}
 }
 sync(rootBatches,viewer){
  this.branchCache?.begin();if(viewer)this.viewer.copy(viewer);const wanted=new Set();let roots=0,brushes=0,detailBrushes=0,contributingDetails=0,potentialDetailBrushes=0;
  const matrix=this._matrix??=new THREE.Matrix4(),box=this._box??=new THREE.Box3();
  for(const [key,b]of rootBatches){if(b.mode!==12||!b.mesh.material.userData.gpuBrushSource)continue;const form=this.forms[b.variant],source=b.mesh;
   if(!source.boundingBox||!source.boundingSphere)throw new Error('GPU spruce requires complete root crown bounds');
   const groups=form.stationGeometry.userData.drawGroups||[{start:0,count:form.tables.count,extra:false}],hasDetails=!!form.stationGeometry.userData.drawGroups;
   for(let slot=0;slot<source.count;slot++){
    const root=b.activeRecords[slot];roots++;matrix.fromArray(source.instanceMatrix.array,slot*16);
    for(let groupIndex=0;groupIndex<groups.length;groupIndex++){
     const group=groups[groupIndex];let activeForm=form,cacheEntry=null,cacheKey=null;if(group.extra){potentialDetailBrushes+=group.count;box.copy(group.boundsBox).applyMatrix4(matrix).expandByScalar(1.25);if(viewer&&box.distanceToPoint(viewer)>BRANCH_DETAIL.far)continue;}
     const selected=branchDrawRuns(group,matrix,viewer);if(!selected.runs.length)continue;
     if(group.lazy){cacheKey=b.variant+':'+group.readyIndex;cacheEntry=this.branchCache.request(cacheKey,{...group,variant:b.variant},selected.priority);if(!cacheEntry)continue;activeForm=cacheEntry.value.form;}
     if(group.extra)contributingDetails+=selected.runs.reduce((n,r)=>n+r.count,0);
     for(const run of coalesceBranchRuns(selected.runs,this.joinGaps)){const drawGroup={...group,start:(group.lazy?0:group.start)+run.start};
     const id=key+':'+root.id+(groupIndex?':branch:'+groupIndex:'')+(run.start||run.count!==group.count?':run:'+run.start+':'+run.count:'');wanted.add(id);let item=this.batches.get(id);
     if(!item){
      const meshes=[];for(const kind of ['needle','twig']){
       const g=container(kind==='needle'?activeForm.stationGeometry:this.template),count=run.count*(kind==='needle'?288:1);
       if(kind==='needle'&&drawGroup.start)for(const [name,a]of Object.entries(g.attributes))if(a.isInterleavedBufferAttribute&&!name.startsWith('aNeedleVariation'))g.setAttribute(name,new THREE.InterleavedBufferAttribute(a.data,a.itemSize,a.offset+drawGroup.start*288/a.data.meshPerAttribute*a.data.stride,a.normalized));
       if(kind==='needle'&&this.needleShape.installed)g.setAttribute('aTreeRootNeedleStart',new THREE.InstancedBufferAttribute(new Float32Array([drawGroup.start]),1,false,count));
       if(kind==='twig')g.setDrawRange(this.indexedTwig?0:1440*3,156*3);
       const wind=new THREE.InstancedInterleavedBuffer(new Float32Array(5),5,count);wind.setUsage(THREE.DynamicDrawUsage);g.userData.ecologyWindAttributes=['aTreeRootWind','aTreeRootEddy'];g.setAttribute('aTreeRootWind',new THREE.InterleavedBufferAttribute(wind,4,0));g.setAttribute('aTreeRootEddy',new THREE.InterleavedBufferAttribute(wind,1,4));
       // This immutable offset must not share the dynamic wind buffer: its version
       // is a real geometry change to the sun-shadow scheduler.
       if(hasDetails&&kind==='twig')g.setAttribute('aTreeRootBrushStart',new THREE.InstancedBufferAttribute(new Float32Array([drawGroup.start]),1,false,count));
       const mesh=new THREE.InstancedMesh(g,kind==='needle'?activeForm.material:activeForm.twigMaterial,1);mesh.instanceMatrix.meshPerAttribute=count;mesh.count=count;mesh.castShadow=mesh.receiveShadow=true;mesh.customDepthMaterial=kind==='needle'?activeForm.depth:activeForm.twigDepth;mesh.boundingBox=new THREE.Box3();mesh.boundingSphere=new THREE.Sphere();mesh.raycast=()=>{};this.owners.register(mesh,kind==='needle'?(group.lazy?'lazy-'+cacheKey:'stations-'+b.variant+(group.extra?'-branch':'-retained')):'twig-template');if(cacheEntry){const render=mesh.onBeforeRender,shadow=mesh.onBeforeShadow,value=cacheEntry.value;mesh.onBeforeRender=(...args)=>{render(...args);if(args[2]?.position?.distanceToSquared(this.viewer)<.0001){value.firstColourAt??=performance.now();value.flags|=kind==='needle'?1:2;}};mesh.onBeforeShadow=(...args)=>{shadow(...args);value.flags|=kind==='needle'?4:8;};}
       mesh.intersectsFrustum=brushFrustumHook(this,cacheEntry?.value);mesh.name='gpu-'+kind+'-'+id;this.group.add(mesh);meshes.push(mesh);
      }item={meshes,localBounds:stationRunBounds(activeForm.stationGeometry,drawGroup.start,run.count),worldBounds:new THREE.Box3(),matrixVersion:-1,windVersion:-1,slot:-1};this.batches.set(id,item);
     }
     const rootWind=source.geometry.attributes.aTreeRootWind.data;
     // Use the same Float32 matrix the GPU receives; bound all wind phases, not
     // just the current phase. 3 mm covers shader arithmetic at world scale.
     if(item.matrixVersion!==source.instanceMatrix.version||item.slot!==slot)item.worldBounds.copy(item.localBounds).applyMatrix4(matrix).expandByScalar(.003);
     for(const mesh of item.meshes){
      mesh.visible=source.visible;
      if(item.matrixVersion!==source.instanceMatrix.version||item.slot!==slot){mesh.instanceMatrix.array.set(source.instanceMatrix.array.subarray(slot*16,slot*16+16));mesh.instanceMatrix.needsUpdate=true;}
      if(item.windVersion!==rootWind.version||item.slot!==slot){const w=mesh.geometry.attributes.aTreeRootWind.data;w.array.set(rootWind.array.subarray(slot*5,slot*5+5));w.needsUpdate=true;}
      if(this.spatialBounds&&(!cacheEntry||cacheEntry.value.flags===15)){if(!mesh.boundingBox.equals(item.worldBounds)){mesh.boundingBox.copy(item.worldBounds);item.worldBounds.getBoundingSphere(mesh.boundingSphere);}}
      else if(group.extra){if(!mesh.boundingBox.equals(box)){mesh.boundingBox.copy(box);box.getBoundingSphere(mesh.boundingSphere);}}
      else if(!mesh.boundingBox.equals(source.boundingBox)||!mesh.boundingSphere.equals(source.boundingSphere)){mesh.boundingBox.copy(source.boundingBox);mesh.boundingSphere.copy(source.boundingSphere);}
     }
     item.matrixVersion=source.instanceMatrix.version;item.windVersion=rootWind.version;item.slot=slot;brushes+=run.count;if(group.extra)detailBrushes+=run.count;
     }
    }
   }
  }
  for(const [key,item]of this.batches)if(!wanted.has(key)){for(const mesh of item.meshes){this.group.remove(mesh);this.owners.release(mesh);}this.batches.delete(key);}
  if(this.branchCache){const now=performance.now();for(const e of this.branchCache.entries.values())if(e.state==='ready'&&e.value.flags===15){if(e.value.fadeAt===null){e.value.fadeAt=now;const wait=now-e.value.firstColourAt;this.branchCache.stats.firstDrawPreparationMs??=wait;this.branchCache.stats.maxDrawPreparationMs=Math.max(this.branchCache.stats.maxDrawPreparationMs||0,wait);}this.branchField.set(e.value.readyIndex,Math.min(1,(now-e.value.fadeAt)/400));}this.branchCache.end();const signature=[...this.branchCache.wanted].sort().join('|');if(signature!==this.branchVisitSignature){this.branchVisitSignature=signature;this.branchVisitAt=now;delete this.branchCache.stats.allVisibleWaitMs;delete this.branchCache.stats.allBuiltWaitMs;}const active=[...this.branchCache.wanted].map(k=>this.branchCache.entries.get(k));const prepared=active.filter(e=>e?.state==='ready'&&e.value.flags===15&&e.value.fadeAt!==null&&now-e.value.fadeAt>=400).length;Object.assign(this.branchCache.stats,{requiredGroups:active.length,preparedGroups:prepared,overBudgetBytes:Math.max(0,this.branchCache.stats.residentBytes-this.branchCache.maxBytes)});if(active.length&&active.every(e=>e?.state==='ready'))this.branchCache.stats.allBuiltWaitMs??=now-this.branchVisitAt;if(active.length&&prepared===active.length)this.branchCache.stats.allVisibleWaitMs??=now-this.branchVisitAt;this.stats.branchCache={...this.branchCache.stats};this.stats.residentParameterBytes=this.stats.tableBytes+this.branchCache.stats.residentBytes;}
  Object.assign(this.stats,{boundsMode:this.spatialBounds?'packet-run-aabb':'v15-parent-sphere',batches:this.batches.size*2,roots,brushInstances:brushes,detailBrushInstances:detailBrushes,contributingDetailBrushInstances:contributingDetails,zeroFadeGapBrushInstances:detailBrushes-contributingDetails,joinedGapMaximumBrushes:this.joinGaps,potentialDetailBrushInstances:potentialDetailBrushes,triangles:brushes*1596,twigPotentialVertexExecutions:brushes*(this.indexedTwig?this.template.attributes.position.count:468),twigCornerSubmissions:brushes*468});return this.stats;
 }
 prepareNeedleShapes(renderer,options){return this.needleShape.prepare(renderer,options);}
 setNeedleShapeEnabled(value){return this.needleShape.setEnabled(value);}
 retryBranches(){this.branchCache?.retry();}
 dispose(){for(const item of this.batches.values())for(const mesh of item.meshes){this.group.remove(mesh);this.owners.release(mesh);}this.batches.clear();this.branchCache?.dispose();this.branchBuilder?.dispose();this.needleShape.dispose();this.owners.dispose();this.branchField?.dispose();this.template.dispose();for(const f of this.forms){f.stationGeometry.dispose();f.tables.dispose();f.depth.dispose();f.twigDepth.dispose();}this.group.clear();}
}
