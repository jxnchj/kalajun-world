import {isGuestVanityRoomKey} from './guest-vanity-gi.js';
import {LEGACY_ROOM_KEYS} from './legacy-room-loader.js';
import {isHouseholdRoomKey} from './household-room-fields.js';
import * as THREE from "three";
import {RoomBounceField,ROOM_FIELD_GLSL} from "./room-bounce-field.js";
import {RoomContactField,ROOM_CONTACT_GLSL} from "./room-contact.js";
import {ROOM_FINITE_APERTURE_GLSL} from "./room-finite-aperture.js";

// One finite aperture sample. Clear pane quadrants avoid authored crossbars.
export function openingLightSample(opening, pose) {
  const p=[...opening.center],n=opening.normal;
  const crown=opening.kind==="roof-crown",window=opening.kind==="window";
  if(window){p[0]+=opening.width*.24;p[1]+=opening.height*.20;}
  for(let k=0;k<3;k++)p[k]+=n[k]*(crown?.16:.22);
  const target=opening.center.map((v,k)=>v-n[k]*3);target[1]=Math.max(.4,target[1]-.35);
  const area=crown?Math.PI*opening.radius**2*pose.scale.x*pose.scale.z*.42:opening.width*opening.height*pose.scale.x*pose.scale.y;
  return{position:p,target,angle:THREE.MathUtils.degToRad(crown?60:window?64:58),intensity:area*(crown?8:window?12:10)};
}

// Same dimensions as tools/blender/{cabin,yurt}.py. This light volume never
// changes the actual roof mesh or extends above its outer surface.
export function roomRoofProfile(asset) {
  if(asset.sourceAsset==="house_a"){
    const pitch=Math.tan(24*Math.PI/180);return[2.44+2.5*pitch,pitch,0,0];
  }
  if(asset.sourceAsset==="yurt")return[3.25,1.62,3.424,.62];
  return[asset.height??2.70,0,0,0];
}
export function roomCeilingHeight(asset,x,z) {
  const r=roomRoofProfile(asset);
  if(r[2]>0){const t=THREE.MathUtils.clamp((r[2]-Math.hypot(x,z))/(r[2]-r[3]),0,1);
    return r[1]+(r[0]-r[1])*(t+.18*Math.sin(Math.PI*t))-.012;}
  return r[0]-Math.abs(z)*r[1];
}

export const ROOM_BOUNCE_GLSL = `
${ROOM_FIELD_GLSL}
${ROOM_CONTACT_GLSL}
${ROOM_FINITE_APERTURE_GLSL}
uniform float uRoomBounceActive;
uniform float uRoomAmbientActive;
uniform vec4 uRoomExcludedBounds;
uniform float uRoomExcludeActive;
uniform float uRoomBounceDay;
uniform float uRoomFieldDayScale;
uniform mat4 uRoomWorldToLocal;
uniform vec4 uRoomBounds;
uniform vec2 uRoomHeight;
uniform vec4 uRoomRoof;
uniform float uRoomRadius;
uniform vec4 uRoomOpenings[3];
uniform vec3 uRoomOpeningLocal[3];
uniform vec3 uRoomInward[3];
uniform vec4 uRoomOpeningU[3];
uniform vec4 uRoomOpeningV[3];
varying vec3 vRoomWorldPosition;
float roomVolumeMask(vec3 local) {
  float edge=min(min(local.x-uRoomBounds.x,uRoomBounds.y-local.x),
                 min(local.z-uRoomBounds.z,uRoomBounds.w-local.z));
  float top=uRoomRoof.x-abs(local.z)*uRoomRoof.y;
  if(uRoomRoof.z>0.0){
    float r=length(local.xz);edge=min(edge,uRoomRadius-r);
    float t=clamp((uRoomRoof.z-r)/(uRoomRoof.z-uRoomRoof.w),0.0,1.0);
    // Convex felt cap lies between the authored inner and outer surfaces.
    top=uRoomRoof.y+(uRoomRoof.x-uRoomRoof.y)*(t+.18*sin(3.14159265*t))-.012;
  }
  float mask=smoothstep(0.0,.10,edge)*
    smoothstep(uRoomHeight.x-.08,uRoomHeight.x+.01,local.y)*
    (1.0-smoothstep(top-.025,top,local.y));
  float excluded=min(min(local.x-uRoomExcludedBounds.x,uRoomExcludedBounds.y-local.x),
                     min(local.z-uRoomExcludedBounds.z,uRoomExcludedBounds.w-local.z));
  mask*=1.0-uRoomExcludeActive*smoothstep(-.04,.04,excluded);
  return mask;
}
float roomPartitionVisibility(vec2 from,vec2 to) {
  if(uRoomExcludeActive<.5)return 1.0;
  // Masking only the destination would allow paths crossing the bathroom.
  vec2 d=to-from;
  vec2 inv=mix(vec2(-1.0),vec2(1.0),step(vec2(0.0),d))/max(abs(d),vec2(.00001));
  vec2 a=(uRoomExcludedBounds.xz-vec2(.015)-from)*inv;
  vec2 b=(uRoomExcludedBounds.yw+vec2(.015)-from)*inv;
  vec2 lo=min(a,b),hi=max(a,b);
  float nearT=max(lo.x,lo.y),farT=min(hi.x,hi.y);
  return(nearT<farT&&farT>.0001&&nearT<.9999)?0.0:1.0;
}
void roomIndirectLight(vec3 worldNormal,vec3 worldReflection,float roughness,
                       out vec3 roomIrradiance,out vec3 roomRadiance) {
  roomIrradiance=vec3(0.0);roomRadiance=vec3(0.0);
  if(uRoomAmbientActive<.5)return;
  vec3 local=(uRoomWorldToLocal*vec4(vRoomWorldPosition,1.0)).xyz;
  float mask=roomVolumeMask(local);if(mask<=0.0)return;
  vec3 fieldIrradiance,fieldRadiance,apertureVisibility,extraApertureVisibility;
  roomDiffuseField(local,worldNormal,worldReflection,roughness,fieldIrradiance,fieldRadiance,apertureVisibility,extraApertureVisibility);
  float energy=0.0,diffuseEnergy=0.0,windowReturn=0.0;
  for(int i=0;i<3;i++){
    float area=uRoomOpenings[i].w;if(area<=0.0)continue;
    vec3 d=uRoomOpenings[i].xyz-vRoomWorldPosition;
    float distanceSquared=max(dot(d,d),.0001);
    vec3 toOpening=d*inversesqrt(distanceSquared);
    float behind=smoothstep(.0,.25,-dot(d,uRoomInward[i]));
    float visible=behind*roomPartitionVisibility(local.xz,uRoomOpeningLocal[i].xz);
    if(uRoomApertureEdges>.5&&visible<=0.0)continue;
    float e=visible*area/(area+distanceSquared+.25);energy+=e;
    // Direct diffuse sky keeps its real aperture direction. The previous
    // .55 omnidirectional pedestal is replaced by geometry-derived room return.
    float facing=max(0.0,dot(worldNormal,toOpening));
    // Opaque furniture/frames/partitions occlude direct diffuse sky. This does
    // not attenuate the separately traced bounce field or specular aperture.
    float diffuseAperture=e*(uRoomFieldActive>.5?facing:.55+.45*facing);
    if(uRoomFiniteAperture>.5){
      bool crown=abs(uRoomInward[i].y)>.9;
      float apertureArea=(crown?3.14159265:4.0)*uRoomOpeningU[i].w*uRoomOpeningV[i].w;
      float transmission=area/max(apertureArea,.0001);
      diffuseAperture=visible*transmission*roomFiniteSkyIrradiance(d,worldNormal,uRoomOpeningU[i],uRoomOpeningV[i],crown);
    }
    diffuseEnergy+=diffuseAperture*apertureVisibility[i];
    // Finite aperture reflected with roughness-dependent blur. This is an
    // analytic room environment, not a cubemap capture or an extra point lamp.
    float denominator=dot(worldReflection,uRoomInward[i]);
    if(denominator<-.001){
      float t=dot(d,uRoomInward[i])/denominator;
      vec3 hit=worldReflection*t-d;
      vec2 halfSize=vec2(uRoomOpeningU[i].w,uRoomOpeningV[i].w);
      vec2 uv=vec2(dot(hit,uRoomOpeningU[i].xyz),dot(hit,uRoomOpeningV[i].xyz));
      float edge=max(abs(uv.x)-halfSize.x,abs(uv.y)-halfSize.y);
      if(abs(uRoomInward[i].y)>.9)edge=(length(uv/max(halfSize,vec2(.001)))-1.0)*min(halfSize.x,halfSize.y);
      float blur=.035+max(t,0.0)*roughness*roughness*.32;
      float aperture=(1.0-smoothstep(-blur,blur,edge))*step(0.0,t);
      float spread=halfSize.x*halfSize.y/((halfSize.x+blur)*(halfSize.y+blur));
      float transmission=area/max(4.0*halfSize.x*halfSize.y,.001);
      windowReturn+=visible*aperture*spread*transmission;
    }
  }
  vec3 sky=vec3(.82,.87,.90),wall=vec3(.75,.65,.50),floor=vec3(.55,.42,.28);
  if(uRoomFieldActive>.5){
    // Sky is daylight-scaled; the composed field also carries source-unit sun
    // and one existing-fixture reflection. CPU synthesis removes its field
    // scale, preserving direct CSM sun and shadowed lamps as separate terms.
    roomIrradiance=sky*min(diffuseEnergy,uRoomFiniteAperture>.5?3.14159265:1.4)*2.0*uRoomBounceDay+fieldIrradiance*2.4*uRoomFieldDayScale;
    roomRadiance=fieldRadiance*2.4*uRoomFieldDayScale+sky*min(windowReturn,1.0)*.55*uRoomBounceDay;
  }else{
    float downFacing=clamp(.5-.5*worldNormal.y,0.0,1.0);
    vec3 bounceColor=mix(sky,wall,.24+.32*downFacing);
    roomIrradiance=bounceColor*min(diffuseEnergy,uRoomFiniteAperture>.5?3.14159265:1.4)*2.0*uRoomBounceDay;
    vec3 reflectionColor=mix(wall,floor,clamp(-worldReflection.y,0.0,1.0));
    roomRadiance=(reflectionColor*min(energy,1.4)*.16+sky*min(windowReturn,1.0)*.55)*uRoomBounceDay;
  }
  roomIrradiance*=mask;roomRadiance*=mask;
}
`;

// One occupied room, one small static volume, no extra lamps or passes. Exterior IBL retains
// sky-visibility attenuation; room-sourced light receives contact AO only.
export class RoomIndirectLight {
  constructor({openingCapacity=3,finiteAperture=new URLSearchParams(globalThis.location?.search??"").get("roomFiniteAperture"),apertureEdges=new URLSearchParams(globalThis.location?.search??"").get("roomApertureEdges")}={}){
    this.openingCapacity=Math.max(3,Math.min(16,Math.trunc(openingCapacity)));
    this.field=new RoomBounceField();this.contact=new RoomContactField();this.contactSelection=null;this.contactLoad=null;
    this.uniforms={...this.field.uniforms,...this.contact.uniforms,
      uRoomFiniteAperture:{value:finiteAperture===0||finiteAperture==="0"?0:1},
      uRoomApertureEdges:{value:apertureEdges===0||apertureEdges==="0"?0:1},
      uRoomBounceActive:{value:0},uRoomAmbientActive:{value:0},
      uRoomExcludedBounds:{value:new THREE.Vector4()},uRoomExcludeActive:{value:0},
      uRoomBounceDay:{value:0},uRoomWorldToLocal:{value:new THREE.Matrix4()},
      uRoomBounds:{value:new THREE.Vector4()},uRoomHeight:{value:new THREE.Vector2()},
      uRoomRoof:{value:new THREE.Vector4()},uRoomRadius:{value:0},
      uRoomOpenings:{value:Array.from({length:this.openingCapacity},()=>new THREE.Vector4())},
      uRoomOpeningLocal:{value:Array.from({length:this.openingCapacity},()=>new THREE.Vector3())},
      uRoomInward:{value:Array.from({length:this.openingCapacity},()=>new THREE.Vector3())},
      uRoomOpeningU:{value:Array.from({length:this.openingCapacity},()=>new THREE.Vector4())},
      uRoomOpeningV:{value:Array.from({length:this.openingCapacity},()=>new THREE.Vector4())},
    };
    this.materials=new WeakSet();this.key=null;this.matrix=new THREE.Matrix4();
    this.field.stats.finiteAperture={enabled:this.uniforms.uRoomFiniteAperture.value>0,model:"hemisphere-clipped finite rectangle sky integral; 8-sided roof crown; existing baked visibility",extraTextureSamples:0,extraGeometry:0,edgeIntegral:this.uniforms.uRoomApertureEdges.value>0};
  }
  register(materials){
    for(const material of materials){
      if(this.materials.has(material)||!material.isMeshStandardMaterial)continue;
      this.materials.add(material);
      const previous=material.onBeforeCompile,key=material.customProgramCacheKey();
      material.onBeforeCompile=(shader,renderer)=>{
        previous.call(material,shader,renderer);Object.assign(shader.uniforms,this.uniforms);
        const hasAssetAO=shader.fragmentShader.includes("varying vec2 vAssetOcclusion;");
        shader.vertexShader="varying vec3 vRoomWorldPosition;\n"+shader.vertexShader;
        shader.vertexShader=shader.vertexShader.replace("#include <project_vertex>",`#include <project_vertex>
vec4 roomWorldVertex=vec4(transformed,1.0);
#ifdef USE_INSTANCING
roomWorldVertex=instanceMatrix*roomWorldVertex;
#endif
vRoomWorldPosition=(modelMatrix*roomWorldVertex).xyz;`);
        const roomGLSL=this.openingCapacity===3?ROOM_BOUNCE_GLSL:ROOM_BOUNCE_GLSL
          .replace(/(uRoom(?:Openings|OpeningLocal|Inward|OpeningU|OpeningV))\[3\]/g,'$1['+this.openingCapacity+']')
          .replace('i<3;i++','i<'+this.openingCapacity+';i++')
          .replace('apertureVisibility[i]','(i<3?apertureVisibility[min(i,2)]:extraApertureVisibility[clamp(i-3,0,2)])');
        shader.fragmentShader=roomGLSL+shader.fragmentShader;
        // Contact stays separate from daylight: night-time IBL needs the same
        // static furniture occlusion. Never multiply direct sun or real lamps.
        shader.fragmentShader=shader.fragmentShader.replace("#include <aomap_fragment>",`
float roomContactAO=roomContactCorrection(vRoomWorldPosition,inverseTransformDirection(uRoomContactHeightFilter<.5?geometryNormal:nonPerturbedNormal,viewMatrix));
#include <aomap_fragment>
`);
        if(hasAssetAO){
          shader.fragmentShader=shader.fragmentShader.replace("float assetAO=clamp(vAssetOcclusion.x,0.0,1.0);",
            "float assetAO=clamp(vAssetOcclusion.x,0.0,1.0)*roomContactAO;");
        }else{
          shader.fragmentShader=shader.fragmentShader.replace("#include <aomap_fragment>",`#include <aomap_fragment>
reflectedLight.indirectDiffuse*=roomContactAO;
reflectedLight.indirectSpecular*=computeSpecularOcclusion(saturate(dot(geometryNormal,geometryViewDir)),roomContactAO,material.roughness);
#ifdef USE_CLEARCOAT
// Match Three's separate clearcoat AO path; leave direct sun and later room GI intact.
clearcoatSpecularIndirect*=roomContactAO;
#endif
`);
        }
        const totalDiffuse="vec3 totalDiffuse = reflectedLight.directDiffuse + reflectedLight.indirectDiffuse;";
        if(!shader.fragmentShader.includes(totalDiffuse))throw new Error("Room light needs the standard physical-light accumulation boundary");
        // This source is accumulated after external sky modulation. Three's
        // current indirect BRDF handles both diffuse and metallic energy once.
        shader.fragmentShader=shader.fragmentShader.replace(totalDiffuse,`
if(uRoomAmbientActive>.5){
  vec3 roomIrradiance,roomRadiance;
  roomIndirectLight(inverseTransformDirection(geometryNormal,viewMatrix),
    inverseTransformDirection(reflect(-geometryViewDir,geometryNormal),viewMatrix),
    material.roughness,roomIrradiance,roomRadiance);
  float roomAO=${hasAssetAO?"clamp(vAssetOcclusion.x,0.0,1.0)":"1.0"};
  #ifdef USE_AOMAP
    roomAO*=ambientOcclusion;
  #endif
  roomAO*=roomContactAO;
  roomIrradiance*=roomAO;
  roomRadiance*=computeSpecularOcclusion(saturate(dot(geometryNormal,geometryViewDir)),roomAO,material.roughness);
  RE_IndirectSpecular(roomRadiance,roomIrradiance,roomRadiance,
    geometryPosition,geometryNormal,geometryViewDir,geometryClearcoatNormal,material,reflectedLight);
}
${totalDiffuse}`);
      };
      material.customProgramCacheKey=()=>key+"-bounded-room-light-v11-clearcoat-finite-aperture-"+this.openingCapacity;material.needsUpdate=true;
    }
  }
  prepareContact(item){
    this.contactSelection=item;
    const key=item?.asset.bounceField??item?.asset.sourceAsset;
    if(!item||!key||this.contact.data[key])return;
    if(this.contactLoad?.key===key){this.field.contactPending=this.contactLoad.promise;return;}
    const request=isGuestVanityRoomKey(key)?this.field.prepareGuestVanity(key):isHouseholdRoomKey(key)?this.field.prepareHousehold(key):LEGACY_ROOM_KEYS.includes(key)?this.field.prepareLegacyRoom(key):key===this.field.lodgeKey&&this.field.lodgeEnabled?this.field.prepareLodge():null;
    if(!request)return;
    this.field.contactError=null;
    const promise=request.then(()=>{if(!this.field.disposed&&this.contactSelection===item)this.contact.set(item);}).catch(error=>{if(!this.field.disposed&&this.contactSelection===item)this.field.contactError=error;throw error;}).finally(()=>{if(this.field.contactPending===promise)this.field.contactPending=null;if(this.contactLoad?.promise===promise)this.contactLoad=null;});
    promise.catch(()=>{});this.contactLoad={key,promise};this.field.contactPending=promise;
  }
  clear({keepContact=false}={}){if(!keepContact){this.contactSelection=null;this.field.contactPending=null;this.field.contactError=null;}this.uniforms.uRoomBounceActive.value=0;this.uniforms.uRoomAmbientActive.value=0;this.field.clear();if(!keepContact)this.contact.clear();this.key=null;}
  setRoom(item,daylight,sunLighting=null,fixtureLights=[],doorOpenness=1){
    this.prepareContact(item);this.contact.set(item);
    this.field.stats.finiteAperture.enabled=this.uniforms.uRoomFiniteAperture.value>0;
    this.field.stats.finiteAperture.edgeIntegral=this.uniforms.uRoomApertureEdges.value>0;
    this.field.setDoorOpenness(doorOpenness);
    const u=this.uniforms;u.uRoomBounceDay.value=Math.max(0,Math.min(1,daylight));
    const fixtureContext=item?.asset.portalSpots===false?{lights:fixtureLights,worldToLocal:u.uRoomWorldToLocal.value,scale:item.pose.scale}:null;
    const fixtureLit=this.field.uniforms.uRoomFixtureBounce.value>0&&fixtureContext?.lights.some(l=>l.visible&&l.intensity>0);
    if(!item||(daylight<=.001&&!fixtureLit)){this.clear({keepContact:Boolean(item)});return;}
    u.uRoomAmbientActive.value=1;
    u.uRoomBounceActive.value=item.asset.portalSpots===false?0:1;
    if(this.key===item.id){
      for(let i=0;i<this.openingCapacity;i++)if(item.asset.openings[i]?.kind==="door")u.uRoomOpenings.value[i].w=this.openingAreas[i]*this.field.doorAreaFraction;
      this.field.setLighting(sunLighting,daylight,fixtureContext);return;}this.key=item.id;
    const {pose,asset}=item,f=asset.floor;
    const q=new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0,1,0),pose.rot);
    this.matrix.compose(new THREE.Vector3(pose.x,pose.y,pose.z),q,new THREE.Vector3(pose.scale.x,pose.scale.y,pose.scale.z));
    this.field.set(asset,q);
    u.uRoomWorldToLocal.value.copy(this.matrix).invert();this.field.setLighting(sunLighting,daylight,fixtureContext);
    const r=f.shape==="circle"?f.radius:0;u.uRoomRadius.value=r;
    u.uRoomBounds.value.set(r?-r:f.x0-.08,r?r:f.x1+.08,r?-r:f.z0-.08,r?r:f.z1+.08);
    u.uRoomHeight.value.set(f.y,asset.height??2.70);u.uRoomRoof.value.fromArray(roomRoofProfile(asset));
    u.uRoomExcludeActive.value=asset.excludedBounds?1:0;
    if(asset.excludedBounds)u.uRoomExcludedBounds.value.fromArray(asset.excludedBounds);
    this.openingAreas=[];
    for(let i=0;i<this.openingCapacity;i++){
      const opening=asset.openings[i],out=u.uRoomOpenings.value[i],inward=u.uRoomInward.value[i];
      if(!opening){
        out.set(0,0,0,0);inward.set(0,0,0);u.uRoomOpeningLocal.value[i].set(0,0,0);
        u.uRoomOpeningU.value[i].set(1,0,0,0);u.uRoomOpeningV.value[i].set(0,1,0,0);continue;
      }
      const local=u.uRoomOpeningLocal.value[i].fromArray(opening.center),p=local.clone().applyMatrix4(this.matrix);
      const n=new THREE.Vector3(...opening.normal),crown=opening.kind==="roof-crown";
      const axisU=crown?new THREE.Vector3(1,0,0):new THREE.Vector3(0,1,0).cross(n).normalize();
      const axisV=new THREE.Vector3().crossVectors(n,axisU).normalize();
      const scale=new THREE.Vector3(pose.scale.x,pose.scale.y,pose.scale.z);
      axisU.multiply(scale);axisV.multiply(scale);
      const halfU=(crown?opening.radius:opening.width*.5)*axisU.length();
      const halfV=(crown?opening.radius:opening.height*.5)*axisV.length();
      axisU.normalize().applyQuaternion(q);axisV.normalize().applyQuaternion(q);
      u.uRoomOpeningU.value[i].set(axisU.x,axisU.y,axisU.z,halfU);
      u.uRoomOpeningV.value[i].set(axisV.x,axisV.y,axisV.z,halfV);
      const area=crown?Math.PI*halfU*halfV*.42:4*halfU*halfV;
      this.openingAreas[i]=area*(opening.skyWeight??1);
      out.set(p.x,p.y,p.z,this.openingAreas[i]*(opening.kind==="door"?this.field.doorAreaFraction:1));inward.copy(n).negate().applyQuaternion(q);
    }
  }
  dispose(){this.clear();this.field.dispose();this.contact.dispose();this.materials=new WeakSet();}
}
