import {GuestDoorGI41} from './guest-door-gi41.js';
import {lodgeTablesEnabled,LODGE_TABLES_KEY,LODGE_TABLES_DOOR} from './lodge-tables-definition.js';
import {lodgeChairsEnabled,LODGE_CHAIRS_KEY,LODGE_CHAIRS_DOOR} from './lodge-chairs-definition.js';
import {isGuestVanityRoomKey,prepareGuestVanityRoom} from './guest-vanity-gi.js';
import {legacyRooms,LEGACY_ROOM_KEYS} from './legacy-room-loader.js';
import {lodgeFurnitureEnabled,LODGE_FURNITURE_KEY,LODGE_FURNITURE_DOOR} from './lodge-furniture-definition.js';
import {LODGE_WHOLE_KEY,lodgeWholeEnabled} from './lodge-whole-definition.js';
import {LodgeDoorGI} from './lodge-door-gi.js';
import {LodgeCrossRoom} from './lodge-cross-room.js';
import {LODGE_ROOM_KEY,prepareLodgeRoom} from './lodge-room-field.js';
import {RoomExteriorTerrain} from './room-exterior-terrain.js';
import {RoomDoorAngles} from './room-door-angles.js';
import {isHouseholdRoomKey,prepareHouseholdRoom} from './household-room-fields.js';
import * as THREE from "three";
import {RoomDoorTransport,doorApertureFraction} from "./room-door-transport.js";
import {ROOM_BOUNCE_DATA} from "./room-bounce-registry.js";
import {ROOM_SECOND_BOUNCE_DATA} from "./room-second-bounce-registry.js";
import {RoomSolarTransport} from "./room-solar-transport.js";
import {RoomFixtureTransport} from "./room-fixture-transport.js";
import {ROOM_APERTURE_DATA} from "./room-aperture-registry.js";
import {ROOM_SECOND_FIXTURE_LOADERS} from "./room-second-fixture-data.js";

// One active volume; inactive room fields are tiny cached CPU/GPU assets. Data
// is linear irradiance SH (constant, x, y, z), not albedo or a sun lightmap.
export const ROOM_FIELD_GLSL = `
uniform highp sampler3D uRoomBounceField;
uniform float uRoomFieldActive;
uniform float uRoomFieldSlabs;
uniform float uRoomApertureVisibility;
uniform vec3 uRoomFieldMin;
uniform vec3 uRoomFieldMax;
uniform vec3 uRoomFieldSize;
uniform mat3 uRoomFieldNormalToLocal;
void roomDiffuseField(vec3 local,vec3 worldNormal,vec3 worldReflection,float roughness,
                      out vec3 irradiance,out vec3 radiance,out vec3 apertureVisibility,out vec3 extraApertureVisibility){
  irradiance=vec3(0.0);radiance=vec3(0.0);apertureVisibility=vec3(1.0);extraApertureVisibility=vec3(1.0);
  if(uRoomFieldActive<.5)return;
  vec3 p=clamp((local-uRoomFieldMin)/max(uRoomFieldMax-uRoomFieldMin,vec3(.001)),0.0,1.0);
  // Each coefficient is its own z slab. Map probe centres explicitly, keeping
  // hardware trilinear filtering away from adjacent coefficient slabs.
  vec3 uv=(p*(uRoomFieldSize-1.0)+.5)/uRoomFieldSize;
  vec4 c0=texture(uRoomBounceField,vec3(uv.xy,uv.z/uRoomFieldSlabs));
  vec4 sx=texture(uRoomBounceField,vec3(uv.xy,(uv.z+1.0)/uRoomFieldSlabs));
  vec3 cx=sx.rgb;
  vec4 sy=texture(uRoomBounceField,vec3(uv.xy,(uv.z+2.0)/uRoomFieldSlabs));
  vec3 cy=sy.rgb;
  vec4 sz=texture(uRoomBounceField,vec3(uv.xy,(uv.z+3.0)/uRoomFieldSlabs));
  vec3 cz=sz.rgb;
  if(uRoomFieldSlabs>4.5)extraApertureVisibility=mix(vec3(1.0),clamp(texture(uRoomBounceField,vec3(uv.xy,(uv.z+4.0)/uRoomFieldSlabs)).rgb,0.0,1.0),uRoomApertureVisibility);
  vec3 n=normalize(uRoomFieldNormalToLocal*worldNormal);
  // Invalid probes (roof/excluded room/solid furniture) carry zero weight.
  // Contact AO and existing shadows retain the small-scale occlusion.
  float weight=max(c0.a,.001);
  // Directional-slab alpha is otherwise unused by SH. Its three channels hold
  // opaque aperture visibility, traced independently even at excluded SH probes.
  // Interpolate visibility directly: dividing by SH validity creates dark rings
  // and unbounded gradients at furniture/roof-invalid probe boundaries.
  apertureVisibility=mix(vec3(1.0),clamp(vec3(sx.a,sy.a,sz.a),0.0,1.0),uRoomApertureVisibility);
  irradiance=max(vec3(0.0),(c0.rgb+cx*n.x+cy*n.y+cz*n.z)/weight);
  vec3 r=normalize(uRoomFieldNormalToLocal*worldReflection);
  // Undo the cosine convolution for this low-frequency environment; roughness
  // attenuates its first directional band. Window reflections remain separate.
  radiance=max(vec3(0.0),(c0.rgb+1.5*(1.0-.65*roughness*roughness)*
    (cx*r.x+cy*r.y+cz*r.z))/(3.14159265*weight));
}
`;

export function decodeRoomField(field){
  const raw=atob(field.data),data=new Uint16Array(raw.length/2);
  for(let i=0;i<data.length;i++)data[i]=raw.charCodeAt(i*2)|(raw.charCodeAt(i*2+1)<<8);
  const [x,y,z]=field.size;
  if(data.length!==x*y*z*4*4)throw new Error("Invalid baked room field dimensions");
  return data;
}

export class RoomBounceField{
  constructor({skyBounces=new URLSearchParams(globalThis.location?.search??"").get("roomSkyBounces"),
    sunBounces=new URLSearchParams(globalThis.location?.search??"").get("roomSunBounces"),
    fixtureBounce=new URLSearchParams(globalThis.location?.search??"").get("roomFixtureBounce"),
    fixtureBounces=new URLSearchParams(globalThis.location?.search??"").get("roomFixtureBounces"),
    apertureVisibility=new URLSearchParams(globalThis.location?.search??"").get("roomApertureVisibility"),
    lodgeRoomGI=new URLSearchParams(globalThis.location?.search??"").get("lodgeRoomGI")}={}){
    this.lodgeTables=lodgeTablesEnabled();this.lodgeChairs=lodgeChairsEnabled();this.lodgeFurniture=lodgeFurnitureEnabled();this.lodgeWhole=this.lodgeTables||this.lodgeChairs||this.lodgeFurniture||lodgeWholeEnabled();this.lodgeKey=this.lodgeTables?LODGE_TABLES_KEY:this.lodgeChairs?LODGE_CHAIRS_KEY:this.lodgeFurniture?LODGE_FURNITURE_KEY:this.lodgeWhole?LODGE_WHOLE_KEY:LODGE_ROOM_KEY;this.lodgeDoor=new LodgeDoorGI(this.lodgeWhole?{enabled:true,key:this.lodgeKey,closedFallback:true,trackAngles:new URLSearchParams(globalThis.location?.search??'').get('lodgeDoorGI')!=='0',...(this.lodgeTables?{door:LODGE_TABLES_DOOR}:this.lodgeChairs?{door:LODGE_CHAIRS_DOOR}:this.lodgeFurniture?{door:LODGE_FURNITURE_DOOR}:{}),load:stats=>this.lodgeTables?import('./lodge-tables-field.js').then(m=>m.loadLodgeTablesStates(stats)):this.lodgeChairs?import('./lodge-chairs-field.js').then(m=>m.loadLodgeChairsStates(stats)):this.lodgeFurniture?import('./lodge-furniture-field.js').then(m=>m.loadLodgeFurnitureStates(stats)):import('./lodge-whole-field.js').then(m=>m.loadLodgeWholeStates(stats))}:{});this.lodgeCross=new LodgeCrossRoom();this.lodgeEnabled=lodgeRoomGI!==false&&lodgeRoomGI!==0&&lodgeRoomGI!=="0";this.lodgeReady=false;this.lodgePending=null;this.lodgeError=null;this.composeBuffers=new Map();
    this.guestVanityBundles=new Map();this.guestVanityPending=new Map();this.guestVanityErrors=new Map();this.guestVanitySelection=null;
    this.legacyRoomPending=new Map();this.legacyRoomErrors=new Map();this.legacyRoomSelection=null;this.householdBundles=new Map();this.householdPending=new Map();this.householdErrors=new Map();this.disposed=false;
    this.cache=new Map();this.baseData=new Map();this.solar=new RoomSolarTransport();this.fixtures=new RoomFixtureTransport();this.secondFixtures=new RoomFixtureTransport({loaders:ROOM_SECOND_FIXTURE_LOADERS,bounceOrder:2});this.key=null;this.fixtureSignature=null;this.dayData=new Map();
    this.exterior=new RoomExteriorTerrain();this.angleDoors=new RoomDoorAngles();this.guestDoor=new GuestDoorGI41();this.doors=new RoomDoorTransport();this.doorFraction=1;this.apertureData=new Map();this.secondData=new Map();this.skyData=new Map();this.skyWeights=new Map();
    this.stats={guestVanity:{loadedRooms:0,keys:[],model:"source-bound two sky/solar/fixture orders; bathroom included; static low-frequency GI"},legacyRooms:legacyRooms.stats,lodgeDoor:this.lodgeDoor.stats,lodgeCross:this.lodgeCross.stats,lodge:{enabled:this.lodgeEnabled,tables:this.lodgeTables,chairs:this.lodgeChairs,furniture:this.lodgeFurniture,key:this.lodgeKey,sourceSHA256:this.lodgeDoor.door.sourceSHA256,ready:false,pending:false,model:this.lodgeTables?"source-bound detailed tables/reception/tea table; independently rebaked complete three-pose sky/solar transport and contact":this.lodgeChairs?"whole connected lodge with 24 detailed woven chairs, retained sofas/laundry; independently rebaked three door poses and contact; static low-frequency transport":this.lodgeFurniture?"whole connected lodge with source-bound detailed sofas and laundry; freshly baked sky orders 0/1/2 and solar 1/2 at three real door poses; finite static transport":this.lodgeWhole?"whole connected lodge; original furniture and seventeen real exterior sources; sky orders 0/1/2 and solar 1/2 at three door poses; finite static transport":"six dining exterior apertures; static source furniture; two diffuse sky/solar orders; east hall contribution composed separately"},household:{key:null,pending:false,bundleReady:false,closedReady:false,ready:false,loadedStyles:0},exteriorTerrain:this.exterior.stats,doorAngles:this.angleDoors.stats,guestDoors41:this.guestDoor.stats,doors:this.doors.stats,aperture:{active:false,field:null,cacheBytes:0,extraTextureBytes:0,extraSamples:0,model:"static opaque aperture visibility at existing probe resolution; diffuse sky only"},active:false,skyBounceOrder:1,merges:0,lastMergeMs:0,secondBounceBytes:0,compositeBytes:0,
      fixtures:this.fixtures.stats,secondFixtures:this.secondFixtures.stats,model:"up to two static sky/solar/fixture bounces; not complete GI"};
    this.empty=new THREE.Data3DTexture(new Uint16Array(16),1,1,4);
    this.configure(this.empty);
    this.uniforms={
      uRoomApertureVisibility:{value:apertureVisibility===0||apertureVisibility==="0"?0:1},
      uRoomFixtureSecondBounce:{value:fixtureBounces===1||fixtureBounces==="1"?0:1},
      uRoomBounceField:{value:this.empty},uRoomFieldSlabs:{value:4},uRoomFieldActive:{value:0},uRoomFieldDayScale:{value:1},uRoomFixtureBounce:{value:fixtureBounce===0||fixtureBounce==="0"?0:1},uRoomSunTransport:{value:1},uRoomSunSecondBounce:{value:sunBounces===1||sunBounces==="1"?0:1},uRoomSkySecondBounce:{value:skyBounces===1||skyBounces==="1"?0:1},
      uRoomFieldMin:{value:new THREE.Vector3()},uRoomFieldMax:{value:new THREE.Vector3()},
      uRoomFieldSize:{value:new THREE.Vector3(1,1,1)},uRoomFieldNormalToLocal:{value:new THREE.Matrix3()},
    };
  }
  configure(texture){
    // RGBA16F is filterable in WebGL2; unlike FloatType this does not depend on
    // OES_texture_float_linear, and no float render target is involved.
    texture.format=THREE.RGBAFormat;texture.type=THREE.HalfFloatType;
    texture.minFilter=texture.magFilter=THREE.LinearFilter;
    texture.wrapS=texture.wrapT=texture.wrapR=THREE.ClampToEdgeWrapping;
    texture.generateMipmaps=false;texture.unpackAlignment=1;
    texture.colorSpace=THREE.NoColorSpace;texture.needsUpdate=true;
    return texture;
  }
  prepareHousehold(key){
    if(this.householdPending.has(key))return this.householdPending.get(key);
    const pending=prepareHouseholdRoom(key).then(bundle=>{
      if(this.disposed)return;
      this.householdBundles.set(key,bundle);this.solar.secondData[key]=bundle.secondSolar;
      this.doors.loaders={...this.doors.loaders,[key]:()=>Promise.resolve(bundle.closed)};
      this.stats.household.loadedStyles=this.householdBundles.size;
      if(this.key===key)this.set(this.householdAsset,this.householdRotation);
    }).catch(error=>{if(!this.disposed)this.householdErrors.set(key,error);throw error;});
    pending.catch(()=>{});this.householdPending.set(key,pending);return pending;
  }
  prepareLodge(){
    if(this.lodgePending)return this.lodgePending;
    this.lodgeError=null;this.stats.lodge.pending=true;
    this.lodgePending=(this.lodgeTables?import('./lodge-tables-field.js').then(m=>m.prepareLodgeTablesRoom()):this.lodgeChairs?import('./lodge-chairs-field.js').then(m=>m.prepareLodgeChairsRoom()):this.lodgeFurniture?import('./lodge-furniture-field.js').then(m=>m.prepareLodgeFurnitureRoom()):this.lodgeWhole?import('./lodge-whole-field.js').then(m=>m.prepareLodgeWholeRoom()):prepareLodgeRoom()).then(bundle=>{
      if(this.disposed)return;
      this.solar.secondData[this.lodgeKey]=bundle.secondSolar;this.lodgeReady=true;
      Object.assign(this.stats.lodge,{ready:true,pending:false});
      if(this.key===this.lodgeKey)this.set(this.lodgeAsset,this.lodgeRotation);
      return this.lodgeCross.prepare(this.lodgeKey);
    }).catch(error=>{this.lodgeError=error;this.lodgePending=null;this.stats.lodge.pending=false;throw error;});
    this.lodgePending.catch(()=>{});return this.lodgePending;
  }
  prepareGuestVanity(key){
    if(this.guestVanityPending.has(key))return this.guestVanityPending.get(key);
    const pending=prepareGuestVanityRoom(key).then(bundle=>{
      if(this.disposed)return;
      this.guestVanityBundles.set(key,bundle);this.solar.secondData[key]=bundle.secondSolar;
      Object.assign(this.stats.guestVanity,{loadedRooms:this.guestVanityBundles.size,keys:[...this.guestVanityBundles.keys()],sourceSHA256:bundle.sky.sourceSHA256});
      this.fixtures.loaders={...this.fixtures.loaders,[key]:()=>Promise.resolve(bundle.fixtures)};
      this.secondFixtures.loaders={...this.secondFixtures.loaders,[key]:()=>Promise.resolve(bundle.secondFixtures)};
      if(this.key===key&&this.guestVanitySelection?.key===key)this.set(this.guestVanitySelection.asset,this.guestVanitySelection.rotation);
      return bundle;
    }).catch(error=>{if(!this.disposed)this.guestVanityErrors.set(key,error);throw error;});
    pending.catch(()=>{});this.guestVanityPending.set(key,pending);return pending;
  }
  prepareLegacyRoom(key){
    if(this.legacyRoomPending.has(key))return this.legacyRoomPending.get(key);
    this.legacyRoomErrors.delete(key);
    const pending=legacyRooms.prepare(key).then(()=>{
      if(!this.disposed&&this.key===key&&this.legacyRoomSelection?.key===key)this.set(this.legacyRoomSelection.asset,this.legacyRoomSelection.rotation);
    }).catch(error=>{if(!this.disposed)this.legacyRoomErrors.set(key,error);throw error;}).finally(()=>this.legacyRoomPending.delete(key));
    this.legacyRoomPending.set(key,pending);return pending;
  }
  set(asset,rotation){
    const key=asset.bounceField??asset.sourceAsset,u=this.uniforms;
    if(isGuestVanityRoomKey(key)&&!this.guestVanityBundles.has(key)){
      this.guestVanitySelection={key,asset,rotation:rotation.clone()};this.key=key;this.solar.clear();u.uRoomFieldActive.value=0;u.uRoomBounceField.value=this.empty;
      if(!this.guestVanityErrors.has(key))this.prepareGuestVanity(key).catch(()=>{});return;
    }
    if(LEGACY_ROOM_KEYS.includes(key)&&!legacyRooms.ready.has(key)){
      this.legacyRoomSelection={key,asset,rotation:rotation.clone()};this.key=key;this.solar.clear();u.uRoomFieldActive.value=0;u.uRoomBounceField.value=this.empty;
      if(!this.legacyRoomErrors.has(key))this.prepareLegacyRoom(key).catch(()=>{});return;
    }
    if(key!==this.lodgeKey)this.lodgeDoor.clearActive();
    if(key===this.lodgeKey&&this.lodgeEnabled&&!this.lodgeReady){
      this.lodgeAsset=asset;this.lodgeRotation=rotation.clone();this.key=key;
      u.uRoomFieldActive.value=0;u.uRoomBounceField.value=this.empty;this.prepareLodge();return;
    }
    if(isHouseholdRoomKey(key)){
      this.householdAsset=asset;this.householdRotation=rotation.clone();
      const ready=this.householdBundles.has(key),closedReady=this.doors.fields.has(key);Object.assign(this.stats.household,{key,bundleReady:ready,pending:!ready||!closedReady,closedReady,ready:ready&&closedReady});
      if(!ready){this.key=key;this.solar.clear();u.uRoomFieldActive.value=0;u.uRoomBounceField.value=this.empty;this.prepareHousehold(key);return;}
    }else Object.assign(this.stats.household,{key:null,pending:false,bundleReady:false,closedReady:false,ready:false});
    const field=key===this.lodgeKey&&!this.lodgeEnabled?null:ROOM_BOUNCE_DATA[key];
    if(!field){this.key=null;this.solar.clear();this.stats.aperture.active=false;this.stats.aperture.field=null;u.uRoomFieldActive.value=0;u.uRoomBounceField.value=this.empty;return;}
    this.key=key;
    let texture=this.cache.get(key);
    if(!texture){
      const [x,y,z]=field.size,base=decodeRoomField(field);this.baseData.set(key,base);
      const slabs=key===this.lodgeKey?5:4,data=new Uint16Array(x*y*z*slabs*4);data.set(base);
      texture=this.configure(new THREE.Data3DTexture(data,x,y,z*slabs));
      if(slabs===5)this.composeBuffers.set(key,base.slice());
      texture.name="room-indirect-field-"+key;this.cache.set(key,texture);
    }
    u.uRoomBounceField.value=texture;u.uRoomFieldActive.value=1;u.uRoomFieldSlabs.value=key===this.lodgeKey?5:4;
    u.uRoomFieldMin.value.fromArray(field.bounds[0]);u.uRoomFieldMax.value.fromArray(field.bounds[1]);u.uRoomFieldSize.value.fromArray(field.size);
    // Rotation is exact. The static local transfer field follows the authored
    // room when instances are scaled; it does not claim a new physical bake for
    // every nonuniform scale.
    u.uRoomFieldNormalToLocal.value.setFromMatrix4(new THREE.Matrix4().makeRotationFromQuaternion(rotation)).transpose();
  }
  skyBase(){
    const base=this.baseData.get(this.key),field=ROOM_SECOND_BOUNCE_DATA[this.key];
    const weight=field?THREE.MathUtils.clamp(this.uniforms.uRoomSkySecondBounce.value,0,1):0;
    this.stats.active=weight>0;this.stats.skyBounceOrder=weight>0?2:1;
    if(!weight)return base;
    if(this.skyWeights.get(this.key)===weight)return this.skyData.get(this.key);
    const start=performance.now();let second=this.secondData.get(this.key);
    if(!second){
      const original=ROOM_BOUNCE_DATA[this.key];
      if(field.sourceSHA256!==original.sourceSHA256||field.blendSHA256!==original.blendSHA256||
         JSON.stringify(field.size)!==JSON.stringify(original.size)||JSON.stringify(field.bounds)!==JSON.stringify(original.bounds))
        throw new Error("Room second-bounce source/grid does not match the first bounce");
      second=decodeRoomField(field);this.secondData.set(this.key,second);
    }
    let output=this.skyData.get(this.key);
    if(!output){output=new Uint16Array(base.length);this.skyData.set(this.key,output);}
    for(let i=0;i<base.length;i++){
      if(i%4===3){
        if(second[i]!==base[i])throw new Error("Room second-bounce validity differs from the first bounce");
        output[i]=base[i];
      }else output[i]=THREE.DataUtils.toHalfFloat(THREE.DataUtils.fromHalfFloat(base[i])+weight*THREE.DataUtils.fromHalfFloat(second[i]));
    }
    this.skyWeights.set(this.key,weight);
    // A/B can change the contents of this same buffer without changing the sun.
    // Invalidate the solar synthesis signature so the existing texture uploads.
    this.solar.clear();
    Object.assign(this.stats,{merges:this.stats.merges+1,lastMergeMs:performance.now()-start,
      secondBounceBytes:[...this.secondData.values()].reduce((n,v)=>n+v.byteLength,0),
      compositeBytes:[...this.skyData.values()].reduce((n,v)=>n+v.byteLength,0)});
    return output;
  }
  setDoorAngles(value){this.guestDoor.setState(value);this.angleDoors.setState(value);this.lodgeDoor.setState(value);}
  get doorAreaFraction(){return this.guestDoor.supports(this.key)?1:this.angleDoors.ready&&this.angleDoors.supports(this.key)?1:this.doorFraction;}
  setDoorOpenness(value){this.doorFraction=doorApertureFraction(value);this.doors.stats.openness=value;}
  packApertures(output){
    const enabled=this.uniforms.uRoomApertureVisibility.value>0,source=ROOM_APERTURE_DATA[this.key];
    Object.assign(this.stats.aperture,{active:enabled&&Boolean(source),field:this.key});
    if(!source||(!enabled&&this.key!==this.lodgeKey))return;
    let data=this.apertureData.get(this.key);
    if(!data){
      const base=ROOM_BOUNCE_DATA[this.key];
      for(const prop of ["sourceSHA256","blendSHA256","size","bounds","openings","validProbes"])
        if(JSON.stringify(source[prop])!==JSON.stringify(base[prop]))throw new Error("Room aperture source/grid differs: "+prop);
      data=Uint8Array.from(atob(source.data),c=>c.charCodeAt(0));
      if(source.encoding!=="u8-opening-slabs"||data.length!==output.length/16*(this.key===this.lodgeKey?6:3))throw new Error("Invalid room aperture dimensions");
      this.apertureData.set(this.key,data);
      this.stats.aperture.cacheBytes=[...this.apertureData.values()].reduce((n,v)=>n+v.byteLength,0);
    }
    const count=output.length/16;
    // Run AFTER all transport synthesis: those passes still see original alpha
    // validity. Never use aperture occlusion to remove an indirect reflection.
    const closed=this.doors.fields.get(this.key)?.apertures;
    for(let opening=0;opening<3;opening++)for(let i=0;i<count;i++){
      const offset=opening*count+i,value=this.guestDoor.aperture(this.key,data,offset)??this.lodgeDoor.aperture(offset)??this.angleDoors.aperture(this.doors,this.key,data,offset)??(closed?THREE.MathUtils.lerp(closed[offset],data[offset],this.doorFraction):data[offset]);
      output[(opening+1)*count*4+i*4+3]=THREE.DataUtils.toHalfFloat((this.exterior.aperture(this.key,offset,this.doorFraction)??value)/255);
    }
  }
  prepare(){
    if(this.guestVanityErrors.has(this.key))return Promise.reject(this.guestVanityErrors.get(this.key));
    if(isGuestVanityRoomKey(this.key)&&!this.guestVanityBundles.has(this.key)){const key=this.key;return this.prepareGuestVanity(key).then(()=>!this.disposed&&this.key===key?this.prepare():undefined);}
    if(this.contactError)return Promise.reject(this.contactError);
    if(this.contactPending)return this.contactPending.then(()=>this.prepare());
    if(LEGACY_ROOM_KEYS.includes(this.key)&&!legacyRooms.ready.has(this.key)){const key=this.key;return this.prepareLegacyRoom(key).then(()=>!this.disposed&&this.key===key?this.prepare():undefined);}
    if(this.key===this.lodgeKey&&this.lodgeEnabled&&!this.lodgeReady)return this.prepareLodge().then(()=>this.prepare());
    if(!this.key||this.disposed)return Promise.resolve();
    const key=this.key;
    if(isHouseholdRoomKey(key)&&!this.householdBundles.has(key))return this.prepareHousehold(key).then(()=>this.key===key&&!this.disposed?this.prepare():undefined);
    const pending=Promise.all([
      this.guestDoor.prepare(this.key),this.doors.prepare(this.key),this.angleDoors.prepare(this.key),this.exterior.prepare(this.key),this.lodgeCross.prepare(this.key),this.lodgeDoor.prepare(this.key),
      this.uniforms.uRoomSunSecondBounce.value>0?this.solar.prepare(this.key):null,
      this.uniforms.uRoomFixtureBounce.value>0?this.fixtures.prepare(this.key):null,
      this.uniforms.uRoomFixtureBounce.value>0&&this.uniforms.uRoomFixtureSecondBounce.value>0?this.secondFixtures.prepare(this.key):null,
    ]);
    const complete=pending.then(()=>{if(this.key===key&&isHouseholdRoomKey(key)&&!this.disposed)Object.assign(this.stats.household,{ready:true,pending:false,closedReady:this.doors.fields.has(key)});});
    complete.catch(()=>{});return complete;
  }
  daylightBase(base,ratio){
    if(ratio===1)return base;
    let entry=this.dayData.get(this.key);
    if(entry?.base===base&&entry.ratio===ratio&&entry.merges===this.stats.merges)return entry.data;
    const data=entry?.data??new Uint16Array(base.length);
    for(let i=0;i<base.length;i++)data[i]=i%4===3?base[i]:THREE.DataUtils.toHalfFloat(THREE.DataUtils.fromHalfFloat(base[i])*ratio);
    this.dayData.set(this.key,{base,ratio,merges:this.stats.merges,data});return data;
  }
  setLighting(lighting,daylight,fixtureContext=null){
    if(this.guestVanityErrors.has(this.key))throw this.guestVanityErrors.get(this.key);
    if(this.legacyRoomErrors.has(this.key))throw this.legacyRoomErrors.get(this.key);
    if(this.lodgeDoor.error&&this.key===this.lodgeKey)throw this.lodgeDoor.error;
    if(this.lodgeDoor.enabled&&this.key===this.lodgeKey&&!this.lodgeDoor.ready)this.lodgeDoor.prepare(this.key).catch(()=>{});
    if(this.lodgeCross.error&&this.key===this.lodgeKey)throw this.lodgeCross.error;
    if(this.lodgeError&&this.key===this.lodgeKey)throw this.lodgeError;
    if(this.householdErrors.has(this.key))throw this.householdErrors.get(this.key);
    const texture=this.cache.get(this.key);if(!texture)return;
    this.guestDoor.key=this.key;
    if(this.guestDoor.supports(this.key)&&!this.guestDoor.rooms.get(this.key))this.guestDoor.prepare(this.key).catch(()=>{});
    const output=this.composeBuffers.get(this.key)??texture.image.data;
    if(this.angleDoors.error)throw this.angleDoors.error;
    if(this.exterior.target&&!this.exterior.ready)this.exterior.prepare(this.key).catch(()=>{});
    if(this.exterior.error)throw this.exterior.error;
    if((this.doors.loaders[this.key]&&!this.doors.fields.has(this.key))||(this.uniforms.uRoomSunSecondBounce.value>0&&!this.solar.secondData[this.key])||
       (this.uniforms.uRoomFixtureBounce.value>0&&this.fixtures.hasSource(this.key)&&!this.fixtures.data.has(this.key))||
       (this.uniforms.uRoomFixtureBounce.value>0&&this.uniforms.uRoomFixtureSecondBounce.value>0&&this.secondFixtures.hasSource(this.key)&&!this.secondFixtures.data.has(this.key)))this.prepare();
    const state=this.fixtures.state(this.key,fixtureContext,this.uniforms.uRoomFixtureBounce.value);
    const secondState=this.secondFixtures.state(this.key,fixtureContext,this.uniforms.uRoomFixtureBounce.value*this.uniforms.uRoomFixtureSecondBounce.value);
    const keepFixtures=this.uniforms.uRoomFixtureBounce.value>0&&this.fixtures.hasSource(this.key)&&fixtureContext?.lights.some(l=>l.visible&&l.intensity>0);
    // At night, only lamp transport remains. Scaling the old sky base by this
    // ratio prevents the field's finite numerical scale from creating skylight.
    const fieldScale=keepFixtures?Math.max(daylight,.08):daylight;
    this.uniforms.uRoomFieldDayScale.value=fieldScale;
    const base=this.daylightBase(this.skyBase(),fieldScale>0?daylight/fieldScale:1),signature=this.guestDoor.signature+"|"+state.signature+"|second:"+secondState.signature+"|"+fieldScale+"|"+daylight+"|lodgeDoor:"+this.lodgeDoor.enabled+","+this.lodgeDoor.ready+","+this.lodgeDoor.angle+"|cross:"+this.lodgeCross.enabled+","+this.lodgeCross.ready+","+(this.lodgeCross.lighting?.visibility??1)+"|aperture:"+this.uniforms.uRoomApertureVisibility.value+"|door:"+this.doorFraction+"|doorReady:"+this.doors.fields.has(this.key)+"|angle:"+this.angleDoors.angle+"|angleReady:"+this.angleDoors.ready+"|exterior:"+this.exterior.target+"|exteriorReady:"+this.exterior.ready+"|exteriorSource:"+(lighting?.intensity??0)+","+(lighting?.exteriorVisibility??lighting?.visibility??1)+","+this.exterior.ground.solarEnabled+","+this.exterior.groundBounce.enabled;
    if(signature!==this.fixtureSignature){this.solar.clear();this.fixtureSignature=signature;}
    if(this.solar.compose(this.key,base,output,this.uniforms.uRoomFieldNormalToLocal.value,lighting,fieldScale,this.uniforms.uRoomSunTransport.value,this.uniforms.uRoomSunSecondBounce.value)){
      // Replace only the daylight transport before fixture orders are added;
      // a ready articulated state includes both local and cross-room sources.
      const articulated=this.lodgeDoor.compose(this.key,output,this.uniforms.uRoomFieldNormalToLocal.value,lighting,this.lodgeCross.lighting,daylight,fieldScale,this.uniforms.uRoomSkySecondBounce.value,this.uniforms.uRoomSunTransport.value,this.uniforms.uRoomSunSecondBounce.value,this.lodgeCross.enabled);
      this.fixtures.add(this.key,output,state,fieldScale);
      // A separate transfer order excludes direct and first-reflection paths.
      // Compose into the same texture: no extra GPU sampler or rendering pass.
      this.secondFixtures.add(this.key,output,secondState,fieldScale);
      // A ready lodge state already includes the real door in every transport
      // order. Legacy house/yurt endpoints have no lodge field: applying them
      // afterward would zero this valid RGB buffer for a partly closed door.
      // Only bypass after successful composition; loading/error gates remain.
      const guestArticulated=this.guestDoor.compose(this.key,output,this.uniforms.uRoomFieldNormalToLocal.value,lighting,daylight,fieldScale,this.uniforms.uRoomSkySecondBounce.value,this.uniforms.uRoomSunTransport.value,this.uniforms.uRoomSunSecondBounce.value,fixtureContext,this.uniforms.uRoomFixtureBounce.value,this.uniforms.uRoomFixtureSecondBounce.value);
      if(articulated||guestArticulated){
        Object.assign(this.doors.stats,{active:false,pending:false,bypassedBy:guestArticulated?"guest-articulated":"lodge-articulated",apertureFraction:this.doorFraction});
        this.angleDoors.stats.active=false;
      }else if(!this.angleDoors.compose(this.doors,this.key,output,this.uniforms.uRoomFieldNormalToLocal.value,lighting,daylight,fieldScale,this.uniforms.uRoomSkySecondBounce.value,this.uniforms.uRoomSunTransport.value,this.uniforms.uRoomSunSecondBounce.value))this.doors.compose(this.key,output,this.uniforms.uRoomFieldNormalToLocal.value,lighting,daylight,fieldScale,this.uniforms.uRoomSkySecondBounce.value,this.uniforms.uRoomSunTransport.value,this.uniforms.uRoomSunSecondBounce.value,this.doorFraction);
      this.exterior.apply(this.key,output,this.doors,daylight,fieldScale,this.uniforms.uRoomSkySecondBounce.value,this.doorFraction,{lighting,normalToLocal:this.uniforms.uRoomFieldNormalToLocal.value,solarEnabled:this.uniforms.uRoomSunTransport.value,secondWeight:this.uniforms.uRoomSunSecondBounce.value});
      if(!articulated)this.lodgeCross.apply(this.key,output,this.uniforms.uRoomFieldNormalToLocal.value,lighting,daylight,fieldScale,this.uniforms.uRoomSkySecondBounce.value,this.uniforms.uRoomSunTransport.value,this.uniforms.uRoomSunSecondBounce.value);
      this.packApertures(output);
      if(this.key===this.lodgeKey){
        const count=output.length/16,visibility=this.apertureData.get(this.key);
        if(!visibility||visibility.length!==count*6)throw new Error('Dining six apertures must all be present');
        texture.image.data.set(output);
        for(let i=0;i<count;i++)for(let c=0;c<3;c++)texture.image.data[output.length+i*4+c]=THREE.DataUtils.toHalfFloat((this.lodgeDoor.aperture((c+3)*count+i)??visibility[(c+3)*count+i])/255);
      }
      texture.needsUpdate=true;
    }
  }
  clear(){this.guestDoor.clearActive();this.angleDoors.clearActive();this.lodgeDoor.clearActive();Object.assign(this.stats.household,{key:null,pending:false,bundleReady:false,closedReady:false,ready:false});this.uniforms.uRoomFieldActive.value=0;this.solar.clear();this.fixtures.clear();this.secondFixtures.clear();this.fixtureSignature=null;this.key=null;this.stats.active=false;this.stats.aperture.active=false;this.stats.aperture.field=null;this.doors.clear();}
  dispose(){
    this.disposed=true;this.guestVanitySelection=null;this.guestVanityBundles.clear();this.guestVanityPending.clear();this.guestVanityErrors.clear();this.legacyRoomSelection=null;this.legacyRoomPending.clear();this.legacyRoomErrors.clear();this.clear();this.householdPending.clear();this.householdErrors.clear();this.householdBundles.clear();for(const texture of this.cache.values())texture.dispose();
    this.composeBuffers.clear();this.cache.clear();this.baseData.clear();this.secondData.clear();this.skyData.clear();this.skyWeights.clear();
    this.stats.secondBounceBytes=0;this.stats.compositeBytes=0;
    this.dayData.clear();this.guestDoor.dispose();this.lodgeDoor.dispose();this.lodgeCross.dispose();this.exterior.dispose();this.angleDoors.dispose();this.doors.dispose();this.apertureData.clear();this.stats.aperture.cacheBytes=0;this.fixtures.dispose();this.secondFixtures.dispose();this.solar.dispose();this.empty.dispose();this.uniforms.uRoomBounceField.value=this.empty;
  }
}
