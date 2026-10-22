import {isHouseholdRoomKey,prepareHouseholdRoom} from './household-room-fields.js';
import * as THREE from "three";
import {RoomDoorTransport,doorApertureFraction} from "./room-door-transport.js";
import {ROOM_BOUNCE_DATA} from "./room-bounce-data.js";
import {ROOM_SECOND_BOUNCE_DATA} from "./room-second-bounce-data.js";
import {RoomSolarTransport} from "./room-solar-transport.js";
import {RoomFixtureTransport} from "./room-fixture-transport.js";
import {ROOM_APERTURE_DATA} from "./room-aperture-data.js";
import {ROOM_SECOND_FIXTURE_LOADERS} from "./room-second-fixture-data.js";

// One active volume; inactive room fields are tiny cached CPU/GPU assets. Data
// is linear irradiance SH (constant, x, y, z), not albedo or a sun lightmap.
export const ROOM_FIELD_GLSL = `
uniform highp sampler3D uRoomBounceField;
uniform float uRoomFieldActive;
uniform float uRoomApertureVisibility;
uniform vec3 uRoomFieldMin;
uniform vec3 uRoomFieldMax;
uniform vec3 uRoomFieldSize;
uniform mat3 uRoomFieldNormalToLocal;
void roomDiffuseField(vec3 local,vec3 worldNormal,vec3 worldReflection,float roughness,
                      out vec3 irradiance,out vec3 radiance,out vec3 apertureVisibility){
  irradiance=vec3(0.0);radiance=vec3(0.0);apertureVisibility=vec3(1.0);
  if(uRoomFieldActive<.5)return;
  vec3 p=clamp((local-uRoomFieldMin)/max(uRoomFieldMax-uRoomFieldMin,vec3(.001)),0.0,1.0);
  // Each coefficient is its own z slab. Map probe centres explicitly, keeping
  // hardware trilinear filtering away from adjacent coefficient slabs.
  vec3 uv=(p*(uRoomFieldSize-1.0)+.5)/uRoomFieldSize;
  vec4 c0=texture(uRoomBounceField,vec3(uv.xy,uv.z*.25));
  vec4 sx=texture(uRoomBounceField,vec3(uv.xy,(uv.z+1.0)*.25));
  vec3 cx=sx.rgb;
  vec4 sy=texture(uRoomBounceField,vec3(uv.xy,(uv.z+2.0)*.25));
  vec3 cy=sy.rgb;
  vec4 sz=texture(uRoomBounceField,vec3(uv.xy,(uv.z+3.0)*.25));
  vec3 cz=sz.rgb;
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
    apertureVisibility=new URLSearchParams(globalThis.location?.search??"").get("roomApertureVisibility")}={}){
    this.householdBundles=new Map();this.householdPending=new Map();this.householdErrors=new Map();this.disposed=false;
    this.cache=new Map();this.baseData=new Map();this.solar=new RoomSolarTransport();this.fixtures=new RoomFixtureTransport();this.secondFixtures=new RoomFixtureTransport({loaders:ROOM_SECOND_FIXTURE_LOADERS,bounceOrder:2});this.key=null;this.fixtureSignature=null;this.dayData=new Map();
    this.doors=new RoomDoorTransport();this.doorFraction=1;this.apertureData=new Map();this.secondData=new Map();this.skyData=new Map();this.skyWeights=new Map();
    this.stats={household:{key:null,pending:false,bundleReady:false,closedReady:false,ready:false,loadedStyles:0},doors:this.doors.stats,aperture:{active:false,field:null,cacheBytes:0,extraTextureBytes:0,extraSamples:0,model:"static opaque aperture visibility at existing probe resolution; diffuse sky only"},active:false,skyBounceOrder:1,merges:0,lastMergeMs:0,secondBounceBytes:0,compositeBytes:0,
      fixtures:this.fixtures.stats,secondFixtures:this.secondFixtures.stats,model:"up to two static sky/solar/fixture bounces; not complete GI"};
    this.empty=new THREE.Data3DTexture(new Uint16Array(16),1,1,4);
    this.configure(this.empty);
    this.uniforms={
      uRoomApertureVisibility:{value:apertureVisibility===0||apertureVisibility==="0"?0:1},
      uRoomFixtureSecondBounce:{value:fixtureBounces===1||fixtureBounces==="1"?0:1},
      uRoomBounceField:{value:this.empty},uRoomFieldActive:{value:0},uRoomFieldDayScale:{value:1},uRoomFixtureBounce:{value:fixtureBounce===0||fixtureBounce==="0"?0:1},uRoomSunTransport:{value:1},uRoomSunSecondBounce:{value:sunBounces===1||sunBounces==="1"?0:1},uRoomSkySecondBounce:{value:skyBounces===1||skyBounces==="1"?0:1},
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
  set(asset,rotation){
    const key=asset.bounceField??asset.sourceAsset,u=this.uniforms;
    if(isHouseholdRoomKey(key)){
      this.householdAsset=asset;this.householdRotation=rotation.clone();
      const ready=this.householdBundles.has(key),closedReady=this.doors.fields.has(key);Object.assign(this.stats.household,{key,bundleReady:ready,pending:!ready||!closedReady,closedReady,ready:ready&&closedReady});
      if(!ready){this.key=key;this.solar.clear();u.uRoomFieldActive.value=0;u.uRoomBounceField.value=this.empty;this.prepareHousehold(key);return;}
    }else Object.assign(this.stats.household,{key:null,pending:false,bundleReady:false,closedReady:false,ready:false});
    const field=ROOM_BOUNCE_DATA[key];
    if(!field){this.key=null;this.solar.clear();this.stats.aperture.active=false;this.stats.aperture.field=null;u.uRoomFieldActive.value=0;u.uRoomBounceField.value=this.empty;return;}
    this.key=key;
    let texture=this.cache.get(key);
    if(!texture){
      const [x,y,z]=field.size,base=decodeRoomField(field);this.baseData.set(key,base);
      texture=this.configure(new THREE.Data3DTexture(base.slice(),x,y,z*4));
      texture.name="room-indirect-field-"+key;this.cache.set(key,texture);
    }
    u.uRoomBounceField.value=texture;u.uRoomFieldActive.value=1;
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
  setDoorOpenness(value){this.doorFraction=doorApertureFraction(value);this.doors.stats.openness=value;}
  packApertures(output){
    const enabled=this.uniforms.uRoomApertureVisibility.value>0,source=ROOM_APERTURE_DATA[this.key];
    Object.assign(this.stats.aperture,{active:enabled&&Boolean(source),field:this.key});
    if(!enabled||!source)return;
    let data=this.apertureData.get(this.key);
    if(!data){
      const base=ROOM_BOUNCE_DATA[this.key];
      for(const prop of ["sourceSHA256","blendSHA256","size","bounds","openings","validProbes"])
        if(JSON.stringify(source[prop])!==JSON.stringify(base[prop]))throw new Error("Room aperture source/grid differs: "+prop);
      data=Uint8Array.from(atob(source.data),c=>c.charCodeAt(0));
      if(source.encoding!=="u8-opening-slabs"||data.length!==output.length/16*3)throw new Error("Invalid room aperture dimensions");
      this.apertureData.set(this.key,data);
      this.stats.aperture.cacheBytes=[...this.apertureData.values()].reduce((n,v)=>n+v.byteLength,0);
    }
    const count=output.length/16;
    // Run AFTER all transport synthesis: those passes still see original alpha
    // validity. Never use aperture occlusion to remove an indirect reflection.
    const closed=this.doors.fields.get(this.key)?.apertures;
    for(let opening=0;opening<3;opening++)for(let i=0;i<count;i++){
      const offset=opening*count+i,value=closed?THREE.MathUtils.lerp(closed[offset],data[offset],this.doorFraction):data[offset];
      output[(opening+1)*count*4+i*4+3]=THREE.DataUtils.toHalfFloat(value/255);
    }
  }
  prepare(){
    if(!this.key||this.disposed)return Promise.resolve();
    const key=this.key;
    if(isHouseholdRoomKey(key)&&!this.householdBundles.has(key))return this.prepareHousehold(key).then(()=>this.key===key&&!this.disposed?this.prepare():undefined);
    const pending=Promise.all([
      this.doors.prepare(this.key),
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
    if(this.householdErrors.has(this.key))throw this.householdErrors.get(this.key);
    const texture=this.cache.get(this.key);if(!texture)return;
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
    const base=this.daylightBase(this.skyBase(),fieldScale>0?daylight/fieldScale:1),signature=state.signature+"|second:"+secondState.signature+"|"+fieldScale+"|"+daylight+"|aperture:"+this.uniforms.uRoomApertureVisibility.value+"|door:"+this.doorFraction+"|doorReady:"+this.doors.fields.has(this.key);
    if(signature!==this.fixtureSignature){this.solar.clear();this.fixtureSignature=signature;}
    if(this.solar.compose(this.key,base,texture.image.data,this.uniforms.uRoomFieldNormalToLocal.value,lighting,fieldScale,this.uniforms.uRoomSunTransport.value,this.uniforms.uRoomSunSecondBounce.value)){
      this.fixtures.add(this.key,texture.image.data,state,fieldScale);
      // A separate transfer order excludes direct and first-reflection paths.
      // Compose into the same texture: no extra GPU sampler or rendering pass.
      this.secondFixtures.add(this.key,texture.image.data,secondState,fieldScale);
      this.doors.compose(this.key,texture.image.data,this.uniforms.uRoomFieldNormalToLocal.value,lighting,daylight,fieldScale,this.uniforms.uRoomSkySecondBounce.value,this.uniforms.uRoomSunTransport.value,this.uniforms.uRoomSunSecondBounce.value,this.doorFraction);
      this.packApertures(texture.image.data);texture.needsUpdate=true;
    }
  }
  clear(){Object.assign(this.stats.household,{key:null,pending:false,bundleReady:false,closedReady:false,ready:false});this.uniforms.uRoomFieldActive.value=0;this.solar.clear();this.fixtures.clear();this.secondFixtures.clear();this.fixtureSignature=null;this.key=null;this.stats.active=false;this.stats.aperture.active=false;this.stats.aperture.field=null;this.doors.clear();}
  dispose(){
    this.disposed=true;this.clear();this.householdPending.clear();this.householdErrors.clear();this.householdBundles.clear();for(const texture of this.cache.values())texture.dispose();
    this.cache.clear();this.baseData.clear();this.secondData.clear();this.skyData.clear();this.skyWeights.clear();
    this.stats.secondBounceBytes=0;this.stats.compositeBytes=0;
    this.dayData.clear();this.doors.dispose();this.apertureData.clear();this.stats.aperture.cacheBytes=0;this.fixtures.dispose();this.secondFixtures.dispose();this.solar.dispose();this.empty.dispose();this.uniforms.uRoomBounceField.value=this.empty;
  }
}
