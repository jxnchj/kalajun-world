import {VanityUpperContact39,VANITY_UPPER_CONTACT_GLSL,vanityUpperContact39Enabled,packVanityContactAtlas39} from './vanity-upper-contact39.js';
import * as THREE from "three";
import {ROOM_CONTACT_DATA} from "./room-contact-registry.js";

export function decodeRoomContact(field){
  const source=Uint8Array.from(atob(field.data),c=>c.charCodeAt(0)),count=field.size[0]*field.size[1]*2;
  if(field.encoding==="raw8"){if(source.length!==count)throw new Error("Invalid room contact dimensions");return source;}
  if(field.encoding!=="run8"||source.length%2)throw new Error("Invalid room contact encoding");
  const out=new Uint8Array(count);let at=0;
  for(let i=0;i<source.length;i+=2){const n=source[i];if(!n||at+n>count)throw new Error("Invalid room contact run");out.fill(source[i+1],at,at+n);at+=n;}
  if(at!==count)throw new Error("Truncated room contact field");return out;
}

export const ROOM_CONTACT_GLSL=/* glsl */`
uniform sampler2D uRoomContactMap;
uniform vec2 uRoomContactAtlasUV;
uniform float uRoomContactActive,uRoomContactDetail,uRoomContactHeightFilter;
uniform mat4 uRoomContactWorldToLocal;
uniform mat3 uRoomContactNormalToLocal;
uniform vec4 uRoomContactBounds;
uniform vec2 uRoomContactSize,uRoomContactHeight;
float roomContactTexel(vec2 index,vec3 local,vec3 localNormal){
  vec2 uv=(index+.5)/uRoomContactSize;
  vec2 contactSample=texture2D(uRoomContactMap,uv*uRoomContactAtlasUV).rg;
  float receiver=mix(uRoomContactHeight.x,uRoomContactHeight.y,contactSample.g);
  vec2 sampleXZ=mix(uRoomContactBounds.xy,uRoomContactBounds.zw,index/max(uRoomContactSize-1.0,vec2(1.0)));
  // Compare each stored height with the receiver's tangent plane. A sloping
  // threshold/stone stays continuous, but another floor height cannot bleed in.
  float planeY=local.y-dot(sampleXZ-local.xz,localNormal.xz)/max(localNormal.y,.001);
  float support=1.0-smoothstep(.008,.032,abs(planeY-receiver));
  return mix(1.0,contactSample.r,support);
}
float ${vanityUpperContact39Enabled()?'roomFloorContactCorrection':'roomContactCorrection'}(vec3 worldPosition,vec3 worldNormal){
  if(uRoomContactActive<.5||uRoomContactDetail<=0.0||worldNormal.y<=.65)return 1.0;
  vec3 local=(uRoomContactWorldToLocal*vec4(worldPosition,1.0)).xyz;
  if(local.y<uRoomContactHeight.x-.032||local.y>uRoomContactHeight.y+.032)return 1.0;
  vec2 p=(local.xz-uRoomContactBounds.xy)/(uRoomContactBounds.zw-uRoomContactBounds.xy);
  if(any(lessThan(p,vec2(0.0)))||any(greaterThan(p,vec2(1.0))))return 1.0;
  if(uRoomContactHeightFilter<.5){
    // v16 comparison only; the default retains separate receiver heights.
    vec2 uv=(p*(uRoomContactSize-1.0)+.5)/uRoomContactSize;
    vec2 contactSample=texture2D(uRoomContactMap,uv*uRoomContactAtlasUV).rg;
    float receiver=mix(uRoomContactHeight.x,uRoomContactHeight.y,contactSample.g);
    float support=(1.0-smoothstep(.008,.032,abs(local.y-receiver)))*smoothstep(.65,.95,worldNormal.y);
    return mix(1.0,contactSample.r,support*clamp(uRoomContactDetail,0.0,1.0));
  }
  // Filter visibility AFTER each tap's receiver-height test. Interpolating G
  // first invents a ramp between floor, rug and sill, causing dark seams/halos.
  vec2 grid=p*(uRoomContactSize-1.0),base=floor(grid),blend=fract(grid);
  vec2 next=min(base+1.0,uRoomContactSize-1.0);
  vec3 localNormal=normalize(uRoomContactNormalToLocal*worldNormal);
  float a=roomContactTexel(base,local,localNormal);
  float b=roomContactTexel(vec2(next.x,base.y),local,localNormal);
  float c=roomContactTexel(vec2(base.x,next.y),local,localNormal);
  float d=roomContactTexel(next,local,localNormal);
  float visibility=mix(mix(a,b,blend.x),mix(c,d,blend.x),blend.y);
  float support=smoothstep(.65,.95,worldNormal.y)*clamp(uRoomContactDetail,0.0,1.0);
  return mix(1.0,visibility,support);
}
`+(vanityUpperContact39Enabled()?VANITY_UPPER_CONTACT_GLSL+/*glsl*/`
float roomContactCorrection(vec3 p,vec3 n){return roomFloorContactCorrection(p,n)*vanityUpperCorrection(p,n);}
`:" ");

// CPU reference for height-aware RG8 visibility filtering and receiver slopes.
export function sampleRoomContact(field,data,local,up=1,enabled=1,localNormal=[0,1,0]){
  const[x,y,z]=local,p=[x,z].map((v,i)=>(v-field.bounds[0][i])/(field.bounds[1][i]-field.bounds[0][i]));
  if(enabled<=0||up<=.65||p.some(v=>v<0||v>1))return 1;
  const q=p.map((v,i)=>v*(field.size[i]-1));let visibility=0;
  for(let j=0;j<2;j++)for(let i=0;i<2;i++){
    const sides=[i,j],index=q.map((v,k)=>Math.min(field.size[k]-1,Math.floor(v)+sides[k]));
    const weight=q.reduce((a,v,k)=>a*(sides[k]?v-Math.floor(v):1-v+Math.floor(v)),1),offset=(index[1]*field.size[0]+index[0])*2;
    const sampleXZ=index.map((v,k)=>THREE.MathUtils.lerp(field.bounds[0][k],field.bounds[1][k],v/Math.max(1,field.size[k]-1)));
    const planeY=y-((sampleXZ[0]-x)*localNormal[0]+(sampleXZ[1]-z)*localNormal[2])/Math.max(localNormal[1],.001);
    const receiver=THREE.MathUtils.lerp(...field.heightRange,data[offset+1]/255);
    const support=1-THREE.MathUtils.smoothstep(Math.abs(planeY-receiver),.008,.032);
    visibility+=THREE.MathUtils.lerp(1,data[offset]/255,support)*weight;
  }
  return THREE.MathUtils.lerp(1,visibility,THREE.MathUtils.smoothstep(up,.65,.95)*THREE.MathUtils.clamp(enabled,0,1));
}

export class RoomContactField{
  constructor({data=ROOM_CONTACT_DATA,upperContactOptions}={}){
    this.upperContact=new VanityUpperContact39(upperContactOptions);this.data=data;this.cache=new Map();this.key=null;this.instance=null;
    this.empty=this._texture(new Uint8Array([255,0]),1,1);
    this.uniforms={...this.upperContact.uniforms,uRoomContactAtlasUV:{value:new THREE.Vector2(1,1)},uRoomContactMap:{value:this.empty},uRoomContactActive:{value:0},uRoomContactDetail:{value:1},uRoomContactHeightFilter:{value:1},
      uRoomContactWorldToLocal:{value:new THREE.Matrix4()},uRoomContactNormalToLocal:{value:new THREE.Matrix3()},uRoomContactBounds:{value:new THREE.Vector4()},
      uRoomContactSize:{value:new THREE.Vector2(1,1)},uRoomContactHeight:{value:new THREE.Vector2(-.1,.25)}};
    this.stats={upperContact:this.upperContact.stats,active:false,field:null,textureBytes:0,textures:0,model:"missing short-range floor contact visibility; no direct light baked"};
    Object.defineProperties(this.stats,{
      filter:{enumerable:true,get:()=>this.uniforms.uRoomContactHeightFilter.value<.5?"height-mixed-v16":"receiver-plane-bilinear"},
      samplesPerEligibleFragment:{enumerable:true,get:()=>this.uniforms.uRoomContactHeightFilter.value<.5?1:4},
    });
  }
  _texture(data,width,height){
    const texture=new THREE.DataTexture(data,width,height,THREE.RGFormat,THREE.UnsignedByteType);
    texture.colorSpace=THREE.NoColorSpace;texture.minFilter=texture.magFilter=THREE.LinearFilter;
    texture.wrapS=texture.wrapT=THREE.ClampToEdgeWrapping;texture.generateMipmaps=false;texture.unpackAlignment=1;texture.needsUpdate=true;return texture;
  }
  set(item){
    const key=item?.asset.bounceField??item?.asset.sourceAsset,field=this.data[key];
    if(!item||!field){this.clear();return;}
    const u=this.uniforms;
    if(this.instance===item&&this.key===key)return;
    let texture=this.cache.get(key);
    this.upperContact.set(key);
    if(!texture){const raw=decodeRoomContact(field),high=this.upperContact.stats.active?this.upperContact.source.fields[key]:null,atlas=high?packVanityContactAtlas39(field,raw,high):null;
      texture=atlas?this._texture(atlas.data,atlas.width,atlas.height):this._texture(raw,...field.size);texture.userData.contactAtlas=atlas?{floorUV:atlas.floorUV,upperUV:atlas.upperUV,originalBytes:raw.byteLength}:null;texture.name="room-contact-"+key;this.cache.set(key,texture);}
    Object.assign(this.upperContact.stats,{atlasTextureBytes:[...this.cache.values()].filter(t=>t.userData.contactAtlas).reduce((n,t)=>n+t.image.data.byteLength,0),atlasExtraBytes:[...this.cache.values()].filter(t=>t.userData.contactAtlas).reduce((n,t)=>n+t.image.data.byteLength-t.userData.contactAtlas.originalBytes,0)});
    const atlas=texture.userData.contactAtlas;u.uRoomContactAtlasUV.value.fromArray(atlas?.floorUV??[1,1]);u.uVanityUpperAtlasUV.value.fromArray(atlas?.upperUV??[0,0,1,1]);
    const p=item.pose,q=new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0,1,0),p.rot);
    // Local contacts follow the instance exactly. Nonuniform scale warps this
    // static local visibility; it is not a new metric bake.
    u.uRoomContactWorldToLocal.value.compose(new THREE.Vector3(p.x,p.y,p.z),q,new THREE.Vector3(p.scale.x,p.scale.y,p.scale.z));
    u.uRoomContactNormalToLocal.value.setFromMatrix4(u.uRoomContactWorldToLocal.value).transpose();
    u.uRoomContactWorldToLocal.value.invert();
    u.uRoomContactBounds.value.set(...field.bounds[0],...field.bounds[1]);u.uRoomContactSize.value.fromArray(field.size);u.uRoomContactHeight.value.fromArray(field.heightRange);
    u.uRoomContactMap.value=texture;u.uRoomContactActive.value=1;this.instance=item;this.key=key;
    Object.assign(this.stats,{active:true,field:key,textureBytes:[...this.cache.values()].reduce((n,t)=>n+t.image.data.byteLength,0),textures:this.cache.size});
  }
  clear(){this.upperContact.clear();this.instance=null;this.key=null;this.uniforms.uRoomContactActive.value=0;this.uniforms.uRoomContactMap.value=this.empty;this.stats.active=false;this.stats.field=null;}
  dispose(){this.clear();this.upperContact.dispose();for(const texture of this.cache.values())texture.dispose();this.cache.clear();this.empty.dispose();this.stats.textureBytes=0;this.stats.textures=0;}
}
