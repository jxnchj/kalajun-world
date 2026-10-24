import livingData from './generated/guest-living-upper-contact39.json' with {type:'json'};
import {GUEST_LIVING_SOURCE,guestLivingEnabled} from './guest-living-definition.js';
import * as THREE from 'three';
import data from './generated/vanity-upper-contact39.json' with {type:'json'};
import {GUEST_VANITY_SOURCE} from './guest-vanity-definition.js';
export const vanityUpperContact39Enabled=()=>new URLSearchParams(globalThis.location?.search||'').get('vanityUpperContact39')!=='0';
export function validateVanityUpperContact39(input=data){
 const living=input.sourceSHA256===GUEST_LIVING_SOURCE.sourceSHA256,source=living?GUEST_LIVING_SOURCE:{...GUEST_VANITY_SOURCE,blendSHA256:'0418790225b7113dec526e3ae176325dd589323a57f6e194789ae5a7ca794f2e'};
 if(input.sourceSHA256!==source.sourceSHA256||input.blendSHA256!==source.blendSHA256)throw Error('Vanity upper contact source mismatch');
 for(let i=1;i<=3;i++){const f=input.fields['lanchuan-freedom-'+i+(living?'-living39':'-vanity38')];if(!f||f.encoding!=='raw8'||f.size[0]!==121||f.size[1]!==57||atob(f.data).length!==f.size[0]*f.size[1]*2||JSON.stringify(f.heightRange)!=='[0.93,0.95]')throw Error('Vanity upper contact grid mismatch');}
 return input;
}
export const VANITY_UPPER_CONTACT_GLSL=/*glsl*/`
uniform vec4 uVanityUpperAtlasUV;
uniform float uVanityUpperActive;
uniform vec4 uVanityUpperBounds;
uniform vec2 uVanityUpperSize;
float vanityUpperTap(vec2 cell,vec3 local){
 vec2 s=texture2D(uRoomContactMap,uVanityUpperAtlasUV.xy+(cell+.5)/uVanityUpperSize*uVanityUpperAtlasUV.zw).rg;
 if(s.g<.001)return 1.0;
 float receiver=mix(.93,.95,s.g);
 return mix(1.0,s.r,1.0-smoothstep(.001,.004,abs(local.y-receiver)));
}
float vanityUpperCorrection(vec3 position,vec3 normal){
 if(uVanityUpperActive<.5)return 1.0;
 vec3 local=(uRoomContactWorldToLocal*vec4(position,1.0)).xyz;
 vec3 localNormal=normalize(uRoomContactNormalToLocal*normal);
 if(localNormal.y<.999||abs(local.y-.94)>.004)return 1.0;
 vec2 p=(local.xz-uVanityUpperBounds.xy)/(uVanityUpperBounds.zw-uVanityUpperBounds.xy);
 if(any(lessThan(p,vec2(0.0)))||any(greaterThan(p,vec2(1.0))))return 1.0;
 vec2 grid=p*(uVanityUpperSize-1.0),base=floor(grid),b=fract(grid),next=min(base+1.0,uVanityUpperSize-1.0);
 return mix(mix(vanityUpperTap(base,local),vanityUpperTap(vec2(next.x,base.y),local),b.x),mix(vanityUpperTap(vec2(base.x,next.y),local),vanityUpperTap(next,local),b.x),b.y);
}
`;
export class VanityUpperContact39{
 constructor({enabled=vanityUpperContact39Enabled(),source=guestLivingEnabled()?livingData:data}={}){
  this.enabled=enabled;this.source=source;
  this.uniforms={uVanityUpperAtlasUV:{value:new THREE.Vector4(0,0,1,1)},uVanityUpperActive:{value:0},uVanityUpperBounds:{value:new THREE.Vector4()},uVanityUpperSize:{value:new THREE.Vector2(1,1)}};
  this.stats={enabled,active:false,key:null,atlasTextureBytes:0,atlasExtraBytes:0,model:'actual source vertex AO residual; shared floor RG atlas, no separate texture'};
 }
 set(key){
  this.clear();if(!this.enabled||!this.source.fields[key])return;validateVanityUpperContact39(this.source);const f=this.source.fields[key];
  this.uniforms.uVanityUpperActive.value=1;this.uniforms.uVanityUpperBounds.value.set(...f.bounds[0],...f.bounds[1]);this.uniforms.uVanityUpperSize.value.fromArray(f.size);Object.assign(this.stats,{active:true,key});
 }
 clear(){this.uniforms.uVanityUpperActive.value=0;this.stats.active=false;this.stats.key=null;}
 dispose(){this.clear();this.stats.atlasTextureBytes=0;this.stats.atlasExtraBytes=0;}
}
// CPU oracle of the candidate's height-gated four taps, for exact receiver tests.
export function sampleVanityUpperContact39(field,point,normal=[0,1,0]){
 if(normal[1]<.999||Math.abs(point[1]-.94)>.004)return 1;
 const p=[point[0],point[2]].map((v,i)=>(v-field.bounds[0][i])/(field.bounds[1][i]-field.bounds[0][i]));if(p.some(v=>v<0||v>1))return 1;
 const raw=Uint8Array.from(atob(field.data),c=>c.charCodeAt(0)),q=p.map((v,i)=>v*(field.size[i]-1));let out=0;
 for(let z=0;z<2;z++)for(let x=0;x<2;x++){const side=[x,z],cell=q.map((v,i)=>Math.min(field.size[i]-1,Math.floor(v)+side[i])),at=(cell[1]*field.size[0]+cell[0])*2,weight=q.reduce((w,v,i)=>w*(side[i]?v-Math.floor(v):1-v+Math.floor(v)),1);const support=raw[at+1]?1-THREE.MathUtils.smoothstep(Math.abs(point[1]-THREE.MathUtils.lerp(.93,.95,raw[at+1]/255)),.001,.004):0;out+=THREE.MathUtils.lerp(1,raw[at]/255,support)*weight;}return out;
}

// Lossless side-by-side RG atlas; original floor texel centres are unchanged.
export function packVanityContactAtlas39(floor,bytes,upper){
 const [fw,fh]=floor.size,[uw,uh]=upper.size,width=fw+uw,height=Math.max(fh,uh),out=new Uint8Array(width*height*2);for(let i=0;i<out.length;i+=2)out[i]=255;
 for(let y=0;y<fh;y++)out.set(bytes.subarray(y*fw*2,(y+1)*fw*2),y*width*2);
 const high=Uint8Array.from(atob(upper.data),c=>c.charCodeAt(0));for(let y=0;y<uh;y++)out.set(high.subarray(y*uw*2,(y+1)*uw*2),(y*width+fw)*2);
 return{data:out,width,height,floorUV:[fw/width,fh/height],upperUV:[fw/width,0,uw/width,uh/height]};
}
