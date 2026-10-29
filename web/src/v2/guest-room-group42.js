import {RoomTerrainSun} from './room-terrain-sun.js';
import * as THREE from 'three';
import {GUEST_DOORS41} from './guest-doors41.js';

// A bounded building group: original finite-pose transport and contacts, with
// one receiver selected per fragment. No new bake, reduced grid or extra GI tap.
export const guestRoomGroup42Enabled=(search=globalThis.location?.search||'')=>new URLSearchParams(search).get('guestRoomGroup42')!=='0';
export function packRoomTextures42(textures,{volume=false}={}){
  const images=textures.map(t=>t.image),width=volume?Math.max(...images.map(i=>i.width)):images.reduce((n,i)=>n+i.width,0),height=Math.max(...images.map(i=>i.height)),depth=volume?images.reduce((n,i)=>n+i.depth,0):1;
  const channels=volume?4:2,Data=volume?Uint16Array:Uint8Array,data=new Data(width*height*depth*channels),transforms=[];
  let offset=0;
  for(const image of images){const d=volume?image.depth:1;
    for(let z=0;z<d;z++)for(let y=0;y<image.height;y++){
      const src=(z*image.height+y)*image.width*channels,dst=volume?((z+offset)*height+y)*width*channels:(y*width+offset)*channels;
      data.set(image.data.subarray(src,src+image.width*channels),dst);
    }
    transforms.push(volume?{scale:[image.width/width,image.height/height,d/depth],offset:[0,0,offset/depth]}:{scale:[image.width/width,image.height/height],offset:[offset/width,0]});
    offset+=volume?d:image.width;
  }
  return{data,width,height,depth,transforms};
}

export function groupRoomGLSL42(source){
  const declarations=[],assignments=[];
  const rewritten=source.replace(/uniform\s+(?:(?:highp|mediump|lowp)\s+)?(float|int|vec[234]|mat[234])\s+([^;]+);/g,(_,type,list)=>list.split(',').map(raw=>{
    const match=raw.trim().match(/^(\w+)(?:\[(\d+)\])?$/);if(!match)throw Error('Unsupported room uniform '+raw);
    const [,name,countText]=match,count=Number(countText||1);declarations.push({name,type,count});
    const uniform=`uniform ${type} ${name}Rooms42[${count*3}];`;
    assignments.push(countText?`for(int j=0;j<${count};j++)${name}[j]=${name}Rooms42[slot*${count}+j];`:`${name}=${name}Rooms42[slot];`);
    return `${uniform}\n${type} ${name}${countText?'['+count+']':''};`;
  }).join('\n'));
  const prefix=`uniform float uGuestGroup42;\nuniform sampler2D uGuestContactAtlas42;\nuniform highp sampler3D uGuestFieldAtlas42;\nuniform vec3 uGuestFieldScale42[3],uGuestFieldOffset42[3];\nuniform vec2 uGuestContactScale42[3],uGuestContactOffset42[3];\nint guestRoomSlot42=0;\n`;
  // Both paths retain the same two sampler bindings; room selection changes
  // only atlas coordinates, never dynamically indexed sampler arrays.
  const sampled=rewritten.replace(/texture\(uRoomBounceField,/g,'guestFieldSample42(').replace(/texture2D\(uRoomContactMap,/g,'guestContactSample42(');
  const sampleFunctions=`vec4 guestFieldSample42(vec3 uv){return texture(uRoomBounceField,uGuestGroup42>.5?uGuestFieldOffset42[guestRoomSlot42]+uv*uGuestFieldScale42[guestRoomSlot42]:uv);}\nvec4 guestContactSample42(vec2 uv){return texture2D(uRoomContactMap,uGuestGroup42>.5?uGuestContactOffset42[guestRoomSlot42]+uv*uGuestContactScale42[guestRoomSlot42]:uv);}\n`;
  // Function prototypes precede existing functions; sampler definitions remain
  // in their original declarations and both samplers retain their old names.
  const select=`void selectGuestRoom42(vec3 worldPosition){int slot=0;bool found=uGuestGroup42<.5;if(uGuestGroup42>.5){for(int i=0;i<3;i++){vec3 p=(uRoomWorldToLocalRooms42[i]*vec4(worldPosition,1.0)).xyz;vec4 b=uRoomBoundsRooms42[i];if(p.x>=b.x&&p.x<=b.y&&p.z>=b.z&&p.z<=b.w){slot=i;found=true;}}}guestRoomSlot42=slot;${assignments.join('\n')}if(!found){uRoomAmbientActive=0.0;uRoomContactActive=0.0;uVanityUpperActive=0.0;}}`;
  return{source:prefix.replace('uniform sampler2D uGuestContactAtlas42;\n','').replace('uniform highp sampler3D uGuestFieldAtlas42;\n','')+'vec4 guestFieldSample42(vec3 uv);\nvec4 guestContactSample42(vec2 uv);\n'+sampled+'\n'+sampleFunctions+'\n'+select,declarations};
}

export class GuestRoomGroup42 {
  constructor(base,{enabled=guestRoomGroup42Enabled(),createRoom}={}){
    this.base=base;this.enabled=enabled;this.createRoom=createRoom;this.rooms=[];this.materials=new Set();this.descriptors=[];this.signature={};this.atlases={};
    this.uniforms={uGuestGroup42:{value:0},uGuestFieldScale42:{value:Array.from({length:3},()=>new THREE.Vector3(1,1,1))},uGuestFieldOffset42:{value:Array.from({length:3},()=>new THREE.Vector3())},uGuestContactScale42:{value:Array.from({length:3},()=>new THREE.Vector2(1,1))},uGuestContactOffset42:{value:Array.from({length:3},()=>new THREE.Vector2())}};
    this.stats={enabled,active:false,rooms:[],textureBytes:0,model:'three source-bound finite-door fields; lossless shared SH/contact atlases; one room receiver per fragment'};
  }
  retains(camera,items){
    if(!this.enabled||!items?.length)return false;const p=items[0].pose,dx=camera.x-p.x,dz=camera.z-p.z,c=Math.cos(p.rot),sn=Math.sin(p.rot),x=(c*dx-sn*dz)/p.scale.x,z=(sn*dx+c*dz)/p.scale.z;
    return Math.hypot(Math.max(-1.75-x,0,x-14.75),Math.max(-3.85-z,0,z-3.25))<=18&&Math.abs(camera.y-p.y)<=8;
  }
  matches(room){return this.enabled&&room?.pose?.entityId===GUEST_DOORS41.entityId&&room?.asset?.portalSpots===false;}
  register(materials,source){
    if(!this.enabled)return;
    const generated=groupRoomGLSL42(source);this.descriptors=generated.declarations;
    for(const {name,count}of this.descriptors){if(!this.base.uniforms[name])throw Error('Missing room uniform '+name);this.uniforms[name+'Rooms42']??={value:Array.from({length:3*count},(_,i)=>count>1?this.base.uniforms[name].value[i%count]:this.base.uniforms[name].value)};}
    for(const material of materials){if(!material.isMeshStandardMaterial||this.materials.has(material))continue;this.materials.add(material);const retire=()=>{this.materials.delete(material);material.removeEventListener('dispose',retire);};material.addEventListener('dispose',retire);const prior=material.onBeforeCompile,key=material.customProgramCacheKey();
      material.onBeforeCompile=(shader,renderer)=>{prior.call(material,shader,renderer);if(!this.stats.active)return;Object.assign(shader.uniforms,this.uniforms);
        const owner=this;for(const [name,kind]of [['uRoomBounceField','field'],['uRoomContactMap','contact']])shader.uniforms[name]={get value(){return owner.stats.active?owner.atlases[kind]??owner.base.uniforms[name].value:owner.base.uniforms[name].value;}};
        // The RoomIndirectLight hook prepends this exact source (six openings
        // included). Fail explicitly rather than silently losing light owners.
        if(!shader.fragmentShader.includes(source))throw Error('Guest group room shader boundary changed');
        shader.fragmentShader=shader.fragmentShader.replace(source,generated.source).replace('void main() {','void main() {\nselectGuestRoom42(vRoomWorldPosition);');
      };material.customProgramCacheKey=()=>key+'-guest-group42-'+(this.stats.active?'active':'inactive');material.needsUpdate=true;
    }
    this.syncUniforms();
  }
  setActive(value){if(this.stats.active===value)return;this.stats.active=value;for(const material of this.materials)material.needsUpdate=true;}
  update(items,{daylight,sunLighting,lights,doorOpenness,doorAngles,terrainSun}={}){
    if(!items?.length){this.release();this.syncUniforms();return;}
    if(items.length!==3||items.some(r=>!this.matches(r)))throw Error('Guest group must own the canonical three rooms');
    if(!this.rooms.length)this.rooms=items.map(item=>({item,light:this.createRoom(),terrainSun:new RoomTerrainSun(terrainSun.heightAt,{enabled:terrainSun.enabled,maxDistance:terrainSun.maxDistance})}));
    this.rooms.forEach(({item,light,terrainSun:roomTerrainSun},index)=>{
      light.field.exterior.setRoom(item);light.field.setDoorAngles(doorAngles?.(item.id));
      light.field.stats.terrainSun=roomTerrainSun.stats;
      light.setRoom(item,daylight,roomTerrainSun.apply(item,sunLighting),lights.slice(index*3,index*3+3),doorOpenness?.(item.id)??1);
    });
    this.uniforms.uGuestGroup42.value=1;this.setActive(true);this.stats.rooms=this.rooms.map(({item,light})=>({id:item.id,key:light.field.key,door:light.field.guestDoor.stats,terrainSun:light.field.stats.terrainSun}));this.syncUniforms();
  }
  async prepare(){await Promise.all(this.rooms.map(async({item,light})=>{
    // An explicitly dark room still prepares its authored transport. Switching
    // that room on later must not introduce a new lazy-load tail.
    if(!light.field.key)light.field.set(item.asset,new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0,1,0),item.pose.rot));
    await light.field.prepare();
  }));}
  syncUniforms(){
    if(!this.enabled)return;const active=this.rooms.length===3,sources=active?this.rooms.map(r=>r.light.uniforms):[this.base.uniforms,this.base.uniforms,this.base.uniforms];
    for(const {name,count}of this.descriptors){const target=this.uniforms[name+'Rooms42'].value;for(let i=0;i<3;i++)for(let j=0;j<count;j++)target[i*count+j]=count>1?sources[i][name].value[j]:sources[i][name].value;}
    if(!active)return;
    for(const [kind,name,volume]of [['field','uRoomBounceField',true],['contact','uRoomContactMap',false]]){
      const textures=sources.map(u=>u[name].value),signature=textures.map(t=>t.uuid+':'+t.version).join('|');if(this.signature[kind]!==signature){
        const packed=packRoomTextures42(textures,{volume});let texture=this.atlases[kind];
        if(!texture||texture.image.width!==packed.width||texture.image.height!==packed.height||(volume&&texture.image.depth!==packed.depth)){
          texture?.dispose();texture=volume?new THREE.Data3DTexture(packed.data,packed.width,packed.height,packed.depth):new THREE.DataTexture(packed.data,packed.width,packed.height,THREE.RGFormat,THREE.UnsignedByteType);
          texture.format=volume?THREE.RGBAFormat:THREE.RGFormat;texture.type=volume?THREE.HalfFloatType:THREE.UnsignedByteType;texture.minFilter=texture.magFilter=THREE.LinearFilter;texture.generateMipmaps=false;texture.unpackAlignment=1;this.atlases[kind]=texture;
        }else texture.image.data.set(packed.data);
        texture.needsUpdate=true;this.signature[kind]=signature;
        packed.transforms.forEach((t,i)=>{this.uniforms[volume?'uGuestFieldScale42':'uGuestContactScale42'].value[i].fromArray(t.scale);this.uniforms[volume?'uGuestFieldOffset42':'uGuestContactOffset42'].value[i].fromArray(t.offset);});
      }
    }
    // Material sampler bindings are distinct from the CPU single-room uniforms.
    this.stats.textureBytes=Object.values(this.atlases).reduce((n,t)=>n+t.image.data.byteLength,0);
  }
  release(){if(!this.rooms.length)return;for(const {light}of this.rooms)light.dispose();this.rooms=[];for(const t of Object.values(this.atlases))t.dispose();this.atlases={};this.signature={};this.uniforms.uGuestGroup42.value=0;this.setActive(false);this.stats.rooms=[];this.stats.textureBytes=0;}
  dispose(){this.release();this.materials.clear();}
}
