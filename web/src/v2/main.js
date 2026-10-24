import {Seating39} from './seating39.js';
import {installSeatingUI39} from './seating-ui39.js';
import {TerrainRowWorkerClient,terrainRowWorkerPolicy} from './terrain-row-worker-client.js';
import {startTerrainIdlePrefetch} from './terrain-idle-prefetch.js';
import {assertLodgeCollisionCamera,compileLodgeStreamMaterials,lodgeInteriorStreamEnabled} from './lodge-interior-stream.js';
import { GPUPassProfile } from "./gpu-pass-profile.js";
import { ShadowStaticProfile39 } from "./shadow-static-profile39.js";
import {installMeadowDistanceCanopy} from './meadow-distance-canopy.js';
import {visualDelta} from './visual-time.js';
import {installSceneMatrixCache} from "./scene-matrix-cache.js";
import {installShadowIndexRenderer} from "./tree-shadow-index.js";
import {createWorldContext} from "./world-context.js";
import {prepareEcologyQueues} from "./ecology-preparation.js";
import "./style.css";
import * as THREE from "three";
import { loadWorldData } from "./world-data.js";
import { WorldTerrain } from "./terrain.js";
import {createTerrainSurfaceContact} from "./terrain-surface-contact.js";
import { WorldStructures } from "./structures.js";
import { WorldEnvironment } from "./environment.js";
import { WorldControls } from "./controls.js";
import { WorldEcology } from "./ecology.js";
import { prepareLocalCanopyLookup } from "./spruce-canopy-local.js";
import { WorldPaths } from "./paths.js";
import { householdYardViewpoints } from "./household-yards.js";
import { WorldWater } from "./water.js";
import { WorldCollision, walkingViewpoints } from "./collision.js";
import { WorldDoors } from "./doors.js";
import { WorldPasture } from "./pasture.js";
import { WorldShadowDepth } from "./room-shadow.js";
import { WorldFrame } from "./world-frame.js";
import { TreePhotoPrepass } from "./tree-photo-prepass.js";
import { withPreparedWorldMatrices } from "./prepared-world-matrices.js";
import { compileVisibleWorld } from "./compile-visible-world.js";
import { compileShadowWorld } from "./compile-shadow-world.js";
import { selectWaterReflectionPatch, createWaterReflectionCamera } from "./water-reflection.js";
import { OpaqueDepthOrder } from "./opaque-depth-order.js";
import { SettlementRuntime } from "./settlements.js";
import { worldViewpoints, initialViewpoint } from "./viewpoints.js";
const $=s=>document.querySelector(s);
const errors=[];
const bootStarted=performance.now(),loadTimings={phases:{},totalMs:null,moduleStartedMs:bootStarted,navigationToFirstFrameSubmittedMs:null};
const measureLoad=async(name,work)=>{
  const start=performance.now(),phase={startMs:start-bootStarted,elapsedMs:null,status:"running"};
  loadTimings.phases[name]=phase;
  try{const value=await work();phase.status="complete";return value;}
  catch(error){phase.status="failed";throw error;}
  finally{phase.elapsedMs=performance.now()-start;}
};
// Read during the loading overlay as well as after the first complete frame.
window.kalajunLoading={getSnapshot:()=>structuredClone(loadTimings)};
function fail(error){const message=error?.stack||error?.message||String(error);errors.push(message);$("#error").hidden=false;$("#error").textContent="新版加载或运行遇到问题：\n"+message;$("#loading").hidden=true;console.error(error);}
window.addEventListener("error",e=>{if(e.error)fail(e.error);});
window.addEventListener("unhandledrejection",e=>fail(e.reason));
const progress=value=>{$("#load-message").textContent=typeof value==="string"?value:value?.stage==="structures"?"读取聚落资产 "+value.loaded+" / "+value.total:value?.message||"准备地形与布局资料…";};
try {
  const {canvas,context,reversedDepth,stats:contextStats}=createWorldContext($("#world"));
  loadTimings.context=contextStats;
  const renderer=new THREE.WebGLRenderer({canvas,context,antialias:true,reversedDepthBuffer:reversedDepth,logarithmicDepthBuffer:!reversedDepth,powerPreference:"high-performance"});
  renderer.debug.onShaderError=(gl,program,vertex,fragment)=>{
    window.kalajunShaderError={program:gl.getProgramInfoLog(program),vertex:gl.getShaderSource(vertex),fragment:gl.getShaderSource(fragment)};
    throw new Error("World shader compilation failed:\n"+[gl.getProgramInfoLog(program),gl.getShaderInfoLog(vertex),gl.getShaderInfoLog(fragment)].filter(Boolean).join("\n"));
  };
  renderer.setPixelRatio(Math.min(devicePixelRatio,1.5));renderer.setSize(innerWidth,innerHeight,false);
  renderer.outputColorSpace=THREE.SRGBColorSpace;renderer.toneMapping=THREE.ACESFilmicToneMapping;
  renderer.shadowMap.enabled=true;renderer.shadowMap.type=THREE.PCFShadowMap;
  const shadowIndexRenderer=new URLSearchParams(location.search).get("shadowVertexReuse")==="1"?installShadowIndexRenderer(renderer):null;
  const worldFrame=reversedDepth?new WorldFrame(renderer):null;
  worldFrame?.setSize(canvas.width,canvas.height);
  const scene=new THREE.Scene(),shadowDepth=new WorldShadowDepth(scene,{sharedTraversal:new URLSearchParams(location.search).get('shadowDepthTraversal39')==='1'}),camera=new THREE.PerspectiveCamera(52,innerWidth/innerHeight,.25,150000);
  const sceneMatrixCacheMode=new URLSearchParams(location.search).get("sceneMatrixCache");
  const sceneMatrixCache=sceneMatrixCacheMode==="parents"?installSceneMatrixCache(scene,{scope:"parents"}):sceneMatrixCacheMode==="1"?installSceneMatrixCache(scene):null;
  camera._reversedDepth=reversedDepth;camera.updateProjectionMatrix();
  const opaqueDepthOrder=new OpaqueDepthOrder(renderer,camera);
  const renderWorld=(scene,renderCamera)=>opaqueDepthOrder.run(renderCamera,()=>{
    water.prepareRefraction(renderer,renderCamera,worldFrame?.target);
    return treePhotoPrepass.run(renderCamera,()=>worldFrame?worldFrame.render(scene,renderCamera):renderer.render(scene,renderCamera));
  });
  const canopyLookup=prepareLocalCanopyLookup();
  const {requested:terrainWorkerRequested,compatible:terrainWorkerCompatible}=terrainRowWorkerPolicy(location.search);
  let terrainWorkerInputs;
  const world=await measureLoad("worldData",()=>loadWorldData({onProgress:progress,onSourceInputs:terrainWorkerRequested&&terrainWorkerCompatible?inputs=>{terrainWorkerInputs=inputs;}:undefined}));
  const settlements=new SettlementRuntime(world),pasture=new WorldPasture(world),doors=new WorldDoors();settlements.setDoorOpenness(id=>doors.openness(id),id=>doors.angles(id));scene.add(settlements.group);
  const controls=new WorldControls(camera,canvas,world);
  controls.floorAt=(x,z)=>settlements.floorHeightAt(x,z);
  let prepareDestination,cancelEarlyPreparation,cancelLodgeRetry,selectedView="valley",viewGeneration=0;
  const places=worldViewpoints({water:world.hydrology?.viewpoints||[],rooms:settlements.viewpoints,life:[...walkingViewpoints(world),...householdYardViewpoints(world),pasture.viewpoint]});
  function go(place,index=-1){
    viewGeneration++;cancelLodgeRetry?.();
    cancelEarlyPreparation?.();
    controls.setPose(place.x,place.z,place.above??1.8,place.yaw,place.pitch,place.y);
    selectedView=place.id||"free";$("#place-name").textContent=place.name;
    document.querySelectorAll("#places button").forEach((b,i)=>b.setAttribute("aria-pressed",String(index===i)));
    if(place.id){const url=new URL(location.href);url.searchParams.set("view",place.id);url.searchParams.delete("place");history.replaceState(null,"",url);}
    prepareDestination?.().catch(fail);
  }
  let category="";
  places.forEach((p,i)=>{
    if(p.category!==category){category=p.category;const label=document.createElement("span");label.className="place-group";label.textContent=category;$("#places").appendChild(label);}
    const b=document.createElement("button");b.textContent=p.name;b.addEventListener("click",()=>go(p,i));$("#places").appendChild(b);
  });
  const params=new URLSearchParams(location.search),preparedMatrices=params.get("preparedMatrices")!=="0",initialPlace=initialViewpoint(params,places);go(places[initialPlace],initialPlace);
  const structures=new WorldStructures(world,{doors,lodgeInteriorStream:lodgeInteriorStreamEnabled()}),ecology=new WorldEcology(world),water=new WorldWater(world);
  const treePhotoPrepass=new TreePhotoPrepass(scene,ecology,camera,{enabled:params.get("treePhotoPrepass")==="1",getShaderRegistry:()=>environment.csm.shaders});
  const startAssets=()=>Promise.all([measureLoad("structures",()=>structures.load({onProgress:progress})),measureLoad("ecologyAssets",()=>ecology.load({canopyLookup,textureRenderer:params.get("earlyTreeTextures")==="1"?renderer:null})),measureLoad("waterAssets",()=>water.load()),measureLoad("pastureAssets",()=>pasture.load())]);
  // Asset requests need world data, not the synchronous coarse terrain build.
  // Start their I/O before that work; retain the original promise/error for the
  // awaited join, while observing early rejection during terrain construction.
  let assetsReady=params.get("assetOverlap")==="1"?startAssets():null;
  assetsReady?.catch(()=>{});
  const terrain=await measureLoad("terrainCoarse",()=>new WorldTerrain(world));scene.add(terrain.group);terrain.update(camera,0);
  installMeadowDistanceCanopy(terrain.material,{enabled:params.get('meadowDistanceCanopy')==='1'});
  ecology.setTerrainSurfaceContact(createTerrainSurfaceContact(terrain));
  // World geometry depends on the selected camera and the loaded world data,
  // not the plant/room GLBs. Overlap its normal scheduler with asset I/O.
  // prepareScene still revalidates the CURRENT destination and its full budget.
  const earlyTerrain=measureLoad("terrainPrefetch",()=>terrain.prepareView(camera,{maxMs:6000,waitFor:"near",nearRadius:160}));
  if(terrainWorkerInputs){
    const client=new TerrainRowWorkerClient(terrainWorkerInputs);terrainWorkerInputs=null;
    terrain.rowWorker=client;terrain.stats.rowWorker=client.stats;
  }else if(terrainWorkerRequested)terrain.stats.rowWorker={ready:false,error:'Incompatible terrain variant; original builder retained'};
  cancelEarlyPreparation=()=>terrain.cancelPreparation();
  const environment=new WorldEnvironment(renderer,scene,camera,world.meta);
  environment.shadowCasters.depthPreparation=shadowDepth;
  environment.register(terrain.materials||[terrain.material]);
  progress("读取选定聚落与植物资产…");
  assetsReady??=startAssets();
  const assetJoin=Promise.all([measureLoad("terrainSurfaces",()=>terrain.loadSurfaces()),assetsReady]);
  const earlyGeneration=viewGeneration;
  const farTerrainIdle=startTerrainIdlePrefetch({terrain,camera,near:earlyTerrain,assets:assetJoin,
    enabled:params.get("farTerrainIdle38")==="1",isCurrent:()=>viewGeneration===earlyGeneration});
  cancelEarlyPreparation=()=>{farTerrainIdle.stop("destination");terrain.cancelPreparation();};
  try{await Promise.all([assetJoin,earlyTerrain]);}
  finally{await farTerrainIdle.stop("assets-settled");}
  if(farTerrainIdle.stats.error)throw farTerrainIdle.stats.error;
  loadTimings.farTerrainIdle=farTerrainIdle.stats;
  await measureLoad("householdLiving",()=>structures.loadHouseholdLiving());
  const collision=new WorldCollision(world,{structures,doors});controls.setCollision(collision);const seating=new Seating39(world,controls,collision),seatingUI=installSeatingUI39(seating);doors.motionGuard=(leaf,next)=>collision.allowDoorMotion(leaf,next);
  settlements.registerMaterials(structures.materials);
  const paths=new WorldPaths(world);
  await measureLoad("pathSurfaces",()=>paths.loadSurfaces());
  scene.add(structures.group,ecology.group,paths.group,water.group,pasture.group,doors.group);environment.register([...structures.materials,...ecology.materials,...paths.materials,...water.materials,...pasture.materials]);
  $("#photo-save").addEventListener("click",()=>{
    renderWorld(scene,camera);
    const link=$("#photo-save");link.href=canvas.toDataURL("image/png");
    link.download="kalajun-"+selectedView+"-"+new Date().toISOString().replace(/[:.]/g,"-")+".png";
  });
  const time=$("#time");
  function setTime(n){const url=new URL(location.href);url.searchParams.set("time",String(n));history.replaceState(null,"",url);time.value=n;$("#time-label").textContent=environment.setTime(n).text;structures.setNight?.(Math.max(0,-environment.sun.y));}
  time.addEventListener("input",()=>setTime(Number(time.value)));
  document.querySelectorAll("[data-time]").forEach(b=>b.addEventListener("click",()=>setTime(Number(b.dataset.time))));
  const timeParam=Number(params.get("time")??870);setTime(Number.isFinite(timeParam)?Math.max(540,Math.min(1305,Math.round(timeParam))):870);environment.update(.3);
  $("#credits").textContent=(world.meta.credits||[]).join(" · ");
  const map=$("#map"),ctx=map.getContext("2d"),mapBase=document.createElement("canvas");mapBase.width=mapBase.height=256;
  const span=world.meta.core.size;let mapReady=false;
  // The folded map is not part of the first world frame. Retain its exact
  // sampling/colours and create it only when the user opens it.
  function prepareMap(){
  if(mapReady)return;
  const mapStarted=performance.now(),mctx=mapBase.getContext("2d"),pixels=mctx.createImageData(256,256);
  for(let j=0;j<256;j++)for(let i=0;i<256;i++){
    const x=(i/256-.5)*span,z=(j/256-.5)*span,lc=world.landcoverAt(x,z),h=world.surface.geographicHeightAt(x,z),normal=world.surface.normalAt(x,z,80);
    const shade=.55+.45*Math.max(0,normal.y*.75-normal.x*.4-normal.z*.3);
    const c=new THREE.Color(0x829269).lerp(new THREE.Color(0x315447),lc.r).lerp(new THREE.Color(0xa8a398),Math.max(lc.g,smooth(2950,4200,h))).lerp(new THREE.Color(0xe0e6df),lc.b);
    pixels.data[(j*256+i)*4]=c.r*255*shade;pixels.data[(j*256+i)*4+1]=c.g*255*shade;pixels.data[(j*256+i)*4+2]=c.b*255*shade;pixels.data[(j*256+i)*4+3]=255;
  }
  mctx.putImageData(pixels,0,0);
  mctx.strokeStyle="#6098a5";mctx.lineWidth=.65;mctx.beginPath();
  for(const segment of world.hydrology?.segments||[]){
    mctx.moveTo((segment.a.x/span+.5)*256,(segment.a.z/span+.5)*256);
    mctx.lineTo((segment.b.x/span+.5)*256,(segment.b.z/span+.5)*256);
  }
  mctx.stroke();
  loadTimings.phases.map={startMs:mapStarted-bootStarted,elapsedMs:performance.now()-mapStarted,status:"complete"};
  mapReady=true;
  }
  const point=(x,z)=>[(x/span+.5)*480,(z/span+.5)*480];
  function drawMap(){
    if($("#map-wrap").hidden)return;
    prepareMap();
    ctx.drawImage(mapBase,0,0,480,480);
    ctx.strokeStyle="#ead9ac80";ctx.lineWidth=1;
    for(const road of world.objects.tracks||[]){ctx.beginPath();road.pts.forEach(([x,z],i)=>{const p=point(x,z);i?ctx.lineTo(...p):ctx.moveTo(...p);});ctx.stroke();}
    ctx.fillStyle="#f5e5bd";for(const e of world.entities){const [x,z]=point(e.x,e.z);ctx.fillRect(x-1,z-1,2,2);}
    for(const [name,list] of Object.entries(Object.groupBy(world.objects.guesthouses||[],e=>e.site))){
      const x=list.reduce((n,e)=>n+e.x,0)/list.length,z=list.reduce((n,e)=>n+e.z,0)/list.length,[px,py]=point(x,z);ctx.fillStyle="#ffe6a3";ctx.beginPath();ctx.arc(px,py,3,0,Math.PI*2);ctx.fill();ctx.font="11px system-ui";ctx.fillText(name,px+7,py-5);
    }
    const [x,y]=point(camera.position.x,camera.position.z);ctx.save();ctx.translate(x,y);ctx.rotate(controls.yaw*Math.PI/180);ctx.beginPath();ctx.moveTo(0,-9);ctx.lineTo(6,7);ctx.lineTo(0,3);ctx.lineTo(-6,7);ctx.closePath();ctx.fillStyle="#fff";ctx.fill();ctx.restore();
  }
  $("#map-toggle").addEventListener("click",()=>{const open=$("#map-wrap").hidden;$("#map-wrap").hidden=!open;$("#map-toggle").setAttribute("aria-expanded",String(open));drawMap();});
  map.addEventListener("click",e=>{const r=map.getBoundingClientRect();go({name:"自由探索",x:((e.clientX-r.left)/r.width-.5)*span,z:((e.clientY-r.top)/r.height-.5)*span,above:180,yaw:345,pitch:-20});});
  controls.onMove=()=>{selectedView="free";$("#place-name").textContent="沿着山野，自由探索";document.querySelectorAll("#places button[aria-pressed=true]").forEach(b=>b.setAttribute("aria-pressed","false"));};
  const resize=()=>{renderer.setSize(innerWidth,innerHeight,false);worldFrame?.setSize(canvas.width,canvas.height);camera.aspect=innerWidth/innerHeight;camera.updateProjectionMatrix();environment.csm.updateFrustums();};
  addEventListener("resize",resize);
  resize(); // Loading may have outlasted a window resize before this listener existed.
  progress("准备第一眼的光与山色…");
  let preparing=false,lastPreparation=null,renderReviewHold=false;
  let windOrigin="";
  const syncShadowState=()=>{
    const origin=ecology.windField.origin.toArray().join(",");
    environment.forceShadowUpdate=origin!==windOrigin;windOrigin=origin;
    // Shadows must serve both the visible world and the next eligible reflection.
    if(!environment.shadowReceivers.enabled){environment.shadowReceiverCameras=[];return;}
    const patch=selectWaterReflectionPatch(water.hydrology,camera,water.reflection.patch);
    const mirror=patch?createWaterReflectionCamera(camera,patch.plane):null;
    environment.shadowReceiverCameras=mirror?[mirror]:[];
  };
  const yieldToInput=()=>new Promise(resolve=>setTimeout(resolve,0));
  const awaitLodgeInterior=async(generation)=>{
    while(generation===viewGeneration&&structures.lodgeStream.needs(camera.position,camera)){
      progress("正在准备公共楼内装…");
      try{await structures.lodgeStream.ensure();return;}
      catch(error){
        if(generation!==viewGeneration)return;
        // Keep the last complete image and movement suspended. A real retry
        // button retries the failed package/preparation rather than missing assets.
        $("#loading").hidden=false;$("#loading").classList.remove("done");
        progress("公共楼内装暂时无法载入，请重试。");
        console.error("Lodge interior preparation failed",error);
        const button=document.createElement('button');button.textContent='重试公共楼加载';$("#load-message").appendChild(button);
        await new Promise(resolve=>{let done=false;const finish=()=>{if(done)return;done=true;button.remove();cancelLodgeRetry=null;resolve();};button.addEventListener('click',finish,{once:true});cancelLodgeRetry=finish;});
      }
    }
  };
  const prepareScene=async(maxMs=6000,generation=viewGeneration)=>{
    await awaitLodgeInterior(generation);if(generation!==viewGeneration)return null;
    const terrainStart=performance.now();
    const prepared=await terrain.prepareView(camera,{maxMs,waitFor:"near",nearRadius:160,onProgress:p=>{if(generation===viewGeneration)progress("准备脚下的草坡与地基 · "+p.visibleTiles+" 个地形分块");}});
    const terrainPrepareMs=performance.now()-terrainStart,ecologyStart=performance.now();
    const ecologyPreparation=await prepareEcologyQueues({ecology,water,camera,isCurrent:()=>generation===viewGeneration,yieldToInput,
      staticPreparation:params.get("ecologyPreparation")!=="frame"});
    if(!ecologyPreparation)return null;
    const ecologyQueuesMs=performance.now()-ecologyStart;
    const {iterations:ecologyIterations}=ecologyPreparation;
    if(generation!==viewGeneration)return null;
    structures.update(camera,0);pasture.update(camera,0);doors.update(camera,0);
    const roomSun={elevation:environment.elevation,sun:environment.sun,color:environment.csm.lights[0].color,intensity:environment.csm.lights[0].intensity,visibility:1};
    settlements.update(camera,0,roomSun);
    const roomIndirectStart=performance.now();
    await settlements.indirect.field.prepare();
    const roomIndirectPrepareMs=performance.now()-roomIndirectStart;
    if(generation!==viewGeneration)return null;
    settlements.update(camera,0,roomSun);
    syncShadowState();environment.update(.016);return {...prepared,terrainPrepareMs,ecologyQueuesMs,roomIndirectPrepareMs,ecologyPrepareMs:performance.now()-ecologyStart,ecologyIterations,ecologyPreparation};
  };
  let lastShaderPreparation=null;
  const compileDestination=()=>{
    if(params.get("refractionPreparation")!=="0")water.prepareRefraction(renderer,camera,worldFrame?.target);
    scene.updateMatrixWorld(true);camera.updateMatrixWorld(true);
    const patch=selectWaterReflectionPatch(water.hydrology,camera,water.reflection.patch);
    const mirror=patch?createWaterReflectionCamera(camera,patch.plane):null;
    const options={additionalCameras:mirror?[mirror]:[],additionalObjectFilter:object=>{
      const materials=Array.isArray(object.material)?object.material:[object.material];
      return !materials.some(m=>water.reflection.waterMaterials.has(m)||m?.userData?.waterReflectionSurface);
    }};
    const started=performance.now(),pending=[];
    try {
      pending.push(treePhotoPrepass.run(camera,()=>worldFrame?worldFrame.compileAsync(scene,camera,options):compileVisibleWorld(renderer,scene,camera,options),{compile:true}));
      const fullPreparation=params.get("shaderPreparation")!=="color-only";
      if(fullPreparation){
        const previous=renderer.getRenderTarget(),face=renderer.getActiveCubeFace(),level=renderer.getActiveMipmapLevel();
        try{
          if(worldFrame)renderer.setRenderTarget(worldFrame.target);
          pending.push(compileShadowWorld(renderer,scene,camera,{shadowDepth,lights:environment.csm.lights}));
        }finally{renderer.setRenderTarget(previous,face,level);}
      }else pending.push(Promise.resolve(null));
      pending.push(fullPreparation&&worldFrame?worldFrame.compileOutputAsync():Promise.resolve(null));
      return Promise.all(pending).then(([input,depth,output])=>{
        lastShaderPreparation={...input.userData.compileReadiness,...input.userData.compileSelection,
          elapsedMs:performance.now()-started,mode:fullPreparation?"color-shadow-output":"color-only",
          color:{...input.userData.compileReadiness},depth:depth?.userData??null,output:output?.userData?.compileReadiness??null};
        return input;
      });
    } catch(error) {for(const work of pending)Promise.resolve(work).catch(()=>{});throw error;}
  };
  structures.lodgeStream.finalize=async(stage)=>{
    structures.installLodgeInterior(stage);
    settlements.registerMaterials(structures.materials);environment.register(structures.materials);
    const field=settlements.indirect.field;
    await field.prepareLodge();await field.lodgeDoor.prepare(field.lodgeKey);
    // Compile with all newly installed material hooks and full scene lights.
    structures.update(camera,0);syncShadowState();environment.forceShadowUpdate=true;environment.update(0);water.reflection.lastCapture=-Infinity;await compileLodgeStreamMaterials(renderer,scene,camera,structures,worldFrame?.target);await compileDestination();
    collision.invalidateStructure(structures.lodgeStream.entity.id);
  };
  collision.prepareAt=async position=>{
    assertLodgeCollisionCamera(structures.lodgeStream,position,camera.position);
    if(structures.lodgeStream.needs(position)){await prepareDestination();structures.lodgeStream.assertCollision(structures.lodgeStream.entity);}
  };
  collision.requestPreparation=()=>{if(!preparing)prepareDestination?.().catch(fail);};
  if(params.get("profile")==="1")window.kalajunLoading.getShaderSnapshot=()=>({
    elapsedMs:performance.now()-bootStarted,
    programs:renderer.info.programs.map(p=>({id:p.id,ready:p.isReady(),name:p.name,cacheKey:p.cacheKey}))
  });
  // A destination can change during asset I/O, preparation or async compilation.
  // Complete both steps for the same revision before exposing its first frame.
  let initialPreparation;
  for(;;){
    const generation=viewGeneration;
    initialPreparation=await measureLoad("initialScene",()=>prepareScene(6000,generation));
    if(generation!==viewGeneration)continue;
    structures.update(camera,0);
    await measureLoad("initialShaders",compileDestination);
    if(generation===viewGeneration)break;
  }
  cancelEarlyPreparation=null;
  const cpuSamples={},gpuSamples=[];
  const gpuPassProfileEnabled=params.get("gpuPassProfile")==="1";
  const gpuContext=renderer.getContext(),gpuExtension=params.get("profile")==="1"&&!gpuPassProfileEnabled?gpuContext.getExtension("EXT_disjoint_timer_query_webgl2"):null;
  const gpuQueries=[];
  const collectGPU=()=>{
    while(gpuQueries.length&&gpuContext.getQueryParameter(gpuQueries[0],gpuContext.QUERY_RESULT_AVAILABLE)){
      const query=gpuQueries.shift();
      if(!gpuContext.getParameter(gpuExtension.GPU_DISJOINT_EXT)){
        gpuSamples.push(gpuContext.getQueryParameter(query,gpuContext.QUERY_RESULT)/1e6);if(gpuSamples.length>60)gpuSamples.shift();
      }
      gpuContext.deleteQuery(query);
    }
  };
  if(params.get("profile")==="1"){
    for(const [name,object,method] of [["terrain",terrain,"update"],["structures",structures,"update"],["ecology",ecology,"update"],["water",water,"update"],["pasture",pasture,"update"],["settlements",settlements,"update"],["environment",environment,"update"],["render",renderer,"render"]]){
      const original=object[method];cpuSamples[name]=[];
      object[method]=function(...args){
        const start=performance.now();
        try{return original.apply(this,args);}finally{
          const a=cpuSamples[name];a.push(performance.now()-start);if(a.length>120)a.shift();
        }
      };
    }
  }
  const gpuPassProfile=gpuPassProfileEnabled?new GPUPassProfile(renderer,{scene,camera,enabled:true}):null;
  const shadowStaticProfile39=new ShadowStaticProfile39(renderer,gpuPassProfile,{enabled:params.get("shadowStaticProfile39")==="1"&&Boolean(gpuPassProfile)});
  if(shadowStaticProfile39.enabled)gpuPassProfile.maxPending=192;
  let last=performance.now(),counter=0,uiClock=0,frames=[],running=true;
  const startup=performance.now();
  prepareDestination=async()=>{
    const generation=viewGeneration;preparing=true;$("#loading").hidden=false;$("#loading").classList.remove("done");
    terrain.cancelPreparation();
    const start=performance.now();
    const prepared=await prepareScene(4000,generation);
    if(generation!==viewGeneration)return;
    await compileDestination();
    if(generation!==viewGeneration)return;
    lastPreparation={...prepared,totalMs:performance.now()-start,generation,view:selectedView};
    preparing=false;frames=[];last=performance.now();$("#loading").classList.add("done");
    setTimeout(()=>{if(generation===viewGeneration)$("#loading").hidden=true;},900);
  };
  document.addEventListener("visibilitychange",()=>{frames=[];last=performance.now();});
  function frame(now){
    if(!running)return;
    // A hidden world has no visible pixels to update. Keep all resident detail
    // and resume the same scene; do not compete with another visible world tab.
    if(document.visibilityState!=="visible"||renderReviewHold){last=now;requestAnimationFrame(frame);return;}
    const realDt=visualDelta((now-last)/1000),dt=Math.min(realDt,.05);last=now;
    try{
      // Destination preparation owns streaming while the overlay is visible;
      // duplicate work and GPU passes must not delay input or the next destination.
      if(!preparing){
        let gpuQuery=null,gpuFrameFailed=true;
        try {
        if(structures.lodgeStream.needs(camera.position,camera)){prepareDestination().catch(fail);requestAnimationFrame(frame);return;}
        controls.update(realDt);
        if(structures.lodgeStream.needs(camera.position,camera)){prepareDestination().catch(fail);requestAnimationFrame(frame);return;}
        terrain.update(camera,dt);structures.update(camera,dt);ecology.update(camera,realDt);water.update(camera,realDt);pasture.update(camera,dt);doors.update(camera,dt);settlements.update(camera,dt,{elevation:environment.elevation,sun:environment.sun,color:environment.csm.lights[0].color,intensity:environment.csm.lights[0].intensity,visibility:1});syncShadowState();
        shadowDepth.runPreparedMain(()=>environment.update(realDt),()=>{
        // Measure only render submission, after CPU world/streaming updates.
        gpuPassProfile?.beginFrame();
        if(gpuExtension){collectGPU();if(gpuQueries.length<8){gpuQuery=gpuContext.createQuery();gpuContext.beginQuery(gpuExtension.TIME_ELAPSED_EXT,gpuQuery);}}
        // The caster tracker just propagated every world transform. Reuse that
        // exact state for this main draw only; reflection keeps its own updates.
        withPreparedWorldMatrices(scene,()=>renderWorld(scene,camera),preparedMatrices);
        });
        water.renderReflection(renderer,scene,camera,{now:performance.now()/1000,lightingRevision:environment.minutes});
        gpuFrameFailed=false;
        } finally {gpuPassProfile?.endFrame({failed:gpuFrameFailed});if(gpuQuery){gpuContext.endQuery(gpuExtension.TIME_ELAPSED_EXT);gpuQueries.push(gpuQuery);}}
      }
      if(counter++>30&&realDt>0&&!preparing&&document.visibilityState==="visible")frames.push(realDt*1000);
      if(frames.length>300)frames.shift();
      uiClock+=realDt;
      if(uiClock>.5){
        uiClock=0;seatingUI.update();const h=camera.position.y-world.surface.heightAt(camera.position.x,camera.position.z);
        $("#readout").textContent="海拔 "+Math.round(camera.position.y)+" m · 离地 "+Math.round(h)+" m";
        if($("#diagnostics").open){
          const sorted=[...frames].sort((a,b)=>a-b),median=sorted[Math.floor(sorted.length*.5)]||0,p95=sorted[Math.floor(sorted.length*.95)]||0;
          // Keep the existing profiling snapshot inspectable through the diagnostics
          // panel when raw DevTools transport is unavailable. No work in normal use.
          if(params.get("profile")==="1"&&window.kalajunV2)$("#stats").dataset.snapshot=JSON.stringify(window.kalajunV2.getSnapshot());
          $("#stats").textContent="帧间隔 中位 "+median.toFixed(1)+" ms / P95 "+p95.toFixed(1)+" ms\n"+(gpuExtension?"GPU 最近60帧均值 "+(gpuSamples.reduce((n,x)=>n+x,0)/Math.max(1,gpuSamples.length)).toFixed(2)+" ms\n":"")+renderer.info.render.calls+" 次绘制 · "+(renderer.info.render.triangles/1e6).toFixed(2)+" M 三角形\n地形 "+terrain.stats.visibleTiles+" 个分块 · "+terrain.stats.queuedTiles+" 个待细化"+"\n建筑 "+structures.stats.entities+" 个实体 · "+structures.stats.visibleBatches+" 个可见批次"+"\n植被 "+ecology.stats.treeChunks+" 个林地分块 · "+ecology.stats.grassTufts+" 簇草 · "+ecology.stats.flowerPlants+" 株花与种穗"+"\n水岸 "+water.stats.waterChunks+" 个近景分块 · "+water.stats.shoreStones+" 块近岸石"+"\n河网 "+(water.stats.enabledLength/1000).toFixed(1)+" km 已接入 · "+(water.stats.unresolvedLength/1000).toFixed(1)+" km 资料冲突待核实";
        }
        drawMap();
      }
      requestAnimationFrame(frame);
    }catch(e){running=false;fail(e);}
  }
  const firstFrameGeneration=viewGeneration;
  const preparedPrograms=new Set(renderer.info.programs);
  await measureLoad("firstFrame",()=>renderWorld(scene,camera));
  loadTimings.firstFrameNewPrograms=renderer.info.programs.filter(p=>!preparedPrograms.has(p)).map(p=>({id:p.id,name:p.name}));loadTimings.totalMs=performance.now()-bootStarted;loadTimings.navigationToFirstFrameSubmittedMs=performance.now();$("#loading").classList.add("done");setTimeout(()=>{if(viewGeneration===firstFrameGeneration)$("#loading").hidden=true;},900);requestAnimationFrame(frame);
  // Read-only diagnostics used by the local acceptance page and manual inspection.
  // Persist derived geometry only after the complete first scene has had a
  // paint opportunity. It never adds network payload or delays first-frame readiness.
  requestAnimationFrame(()=>requestAnimationFrame(()=>{
    ecology.persistCanopyCache?.().catch(error=>console.warn("[spruce-canopy] background cache write:",error));
  }));
  window.kalajunV2={getSnapshot:()=>({version:"route-continuity-38-candidate",loadTimings:structuredClone(loadTimings),assetTransfers:params.get("profile")==="1"?performance.getEntriesByType("resource").filter(r=>r.name.startsWith(location.origin)&&/\/(assets|data)\//.test(r.name)).map(r=>({path:new URL(r.name).pathname,transferBytes:r.transferSize,encodedBytes:r.encodedBodySize,decodedBytes:r.decodedBodySize,durationMs:r.duration})):undefined,depthMode:reversedDepth?"reversed-float32":"logarithmic",frameTarget:worldFrame?.stats??null,treePhotoPrepass:{...treePhotoPrepass.stats},ready:running,visibility:document.visibilityState,viewport:{width:canvas.width,height:canvas.height,pixelRatio:renderer.getPixelRatio()},uptimeMs:performance.now()-startup,position:camera.position.toArray(),view:selectedView,yaw:controls.yaw,pitch:controls.pitch,time:environment.minutes,initialPreparation,lastPreparation,lastShaderPreparation,preparing,gpuPasses:gpuPassProfile?.snapshot()??null,gpu:{scope:"render-world-and-reflection",available:Boolean(gpuExtension),samples:gpuSamples.length,meanMs:gpuSamples.reduce((n,x)=>n+x,0)/Math.max(1,gpuSamples.length),maxMs:Math.max(0,...gpuSamples)},cpu:Object.fromEntries(Object.entries(cpuSamples).map(([name,a])=>[name,{samples:a.length,meanMs:a.reduce((n,x)=>n+x,0)/Math.max(1,a.length),maxMs:Math.max(0,...a)}])),sceneMatrixCache:sceneMatrixCache?{...sceneMatrixCache.stats}:null,cloudCache:{...environment.cloudCache.stats},shadows:environment.shadowScheduler.stats,nearShadowDetail:environment.nearShadowDetail,shadowReceivers:environment.shadowReceivers.stats,shadowCasters:{...environment.shadowCasters.stats,counts:environment.shadowCasters.result.counts},sunElevation:environment.elevation,lighting:{profile:environment.lightingProfile,sunIntensity:environment.csm.lights[0].intensity,exposure:renderer.toneMappingExposure,bounce:environment.bounce.intensity,environment:scene.environmentIntensity,cloudCoverage:environment.clouds.uCloudCoverage.value,cloudDensity:environment.clouds.uCloudDensity.value},frames:[...frames],render:{...renderer.info.render},terrain:{...terrain.stats},structures:{...structures.stats},ecology:{...ecology.stats},paths:{...paths.stats},water:{...water.stats},pasture:{...pasture.stats},doors:{...doors.stats},collision:{...collision.stats},movement:controls.mode,seating:{...seating.stats},controlTiming:{...controls.stats},errors:[...errors],entities:world.entities.length,roomLight:{...settlements.indirect.field.solar.stats},roomSkyBounce:{...settlements.indirect.field.stats},roomContact:{...settlements.indirect.contact.stats},rooms:settlements.viewpoints.length}),world};
  if(import.meta.env.DEV||params.get("profile")==="1"||params.get("debug")==="1") window.kalajunV2.debug={setReviewHold:value=>{const previous=renderReviewHold;renderReviewHold=Boolean(value);return previous;},gpuPassProfile,shadowStaticProfile39,renderer,worldFrame,treePhotoPrepass,sceneMatrixCache,renderFrozenWorld:()=>renderWorld(scene,camera),scene,camera,environment,terrain,structures,ecology,controls,seating,settlements,water,pasture,doors,collision,paths,places};
  addEventListener("pagehide",()=>{running=false;shadowStaticProfile39.dispose();gpuPassProfile?.dispose();treePhotoPrepass.dispose();sceneMatrixCache?.dispose();gpuQueries.forEach(q=>gpuContext.deleteQuery(q));seatingUI.dispose();controls.dispose();terrain.dispose();collision.dispose();doors.dispose();structures.dispose();ecology.dispose();paths.dispose();water.dispose();pasture.dispose();settlements.dispose();shadowDepth.dispose();environment.dispose();worldFrame?.dispose();shadowIndexRenderer?.dispose();renderer.dispose();},{once:true});
}catch(e){fail(e);}
function smooth(a,b,x){const t=Math.min(1,Math.max(0,(x-a)/(b-a)));return t*t*(3-2*t);}
