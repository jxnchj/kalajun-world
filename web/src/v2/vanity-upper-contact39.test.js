import test from 'node:test';import assert from 'node:assert/strict';import {readFileSync} from 'node:fs';import {createHash} from 'node:crypto';
import data from './generated/vanity-upper-contact39.json' with {type:'json'};
import {VanityUpperContact39,sampleVanityUpperContact39,validateVanityUpperContact39,vanityUpperContact39Enabled,VANITY_UPPER_CONTACT_GLSL} from './vanity-upper-contact39.js';
import {RoomContactField,ROOM_CONTACT_GLSL,sampleRoomContact} from './room-contact.js';
const hash=p=>createHash('sha256').update(readFileSync(new URL(p,import.meta.url))).digest('hex');
test('high counter correction is source bound and genuine residual, not blanket darkening',()=>{
 validateVanityUpperContact39();assert.equal(data.sourceSHA256,hash('../../public/assets/v2/gh_lanchuan_rooms_vanity38.glb'));assert.equal(data.blendSHA256,hash('../../../assets/src/v2/settlements/guest-vanity-v38/lanchuan-vanity.blend'));
 for(const f of Object.values(data.fields)){const raw=Uint8Array.from(atob(f.data),c=>c.charCodeAt(0));let corrected=0,valid=0;for(let i=0;i<raw.length;i+=2){if(raw[i+1]){valid++;if(raw[i]<242)corrected++;}else assert.equal(raw[i],255);}assert.ok(valid>5000);assert.ok(corrected>90&&corrected<150);assert.equal(sampleRoomContact(f,raw,[(f.bounds[0][0]+f.bounds[1][0])/2,0,(f.bounds[0][1]+f.bounds[1][1])/2]),1,'floor untouched');}
 assert.throws(()=>validateVanityUpperContact39({...data,sourceSHA256:'wrong'}),/source mismatch/);
});
test('default has no extra sampler; candidate switches three independent fields and releases ownership',()=>{
 assert.equal(vanityUpperContact39Enabled(),true);const prior=globalThis.location;try{globalThis.location={search:'?vanityUpperContact39=0'};assert.equal(vanityUpperContact39Enabled(),false);}finally{if(prior===undefined)delete globalThis.location;else globalThis.location=prior;}assert.equal((ROOM_CONTACT_GLSL.match(/uniform sampler2D/g)||[]).length,1);assert.match(VANITY_UPPER_CONTACT_GLSL,/localNormal.y<.999/);assert.match(VANITY_UPPER_CONTACT_GLSL,/smoothstep\(.001,.004/);
 const off=new VanityUpperContact39({enabled:false,source:data});off.set(Object.keys(data.fields)[0]);assert.equal(off.stats.active,false);off.dispose();
 const c=new VanityUpperContact39({source:data});for(const k of Object.keys(data.fields)){c.set(k);assert.equal(c.stats.key,k);assert.equal(c.stats.active,true);}assert.equal(c.uniforms.uVanityUpperMap,undefined);assert.equal(c.cache,undefined);c.set('house_a');assert.equal(c.stats.active,false);c.dispose();assert.equal(c.stats.atlasTextureBytes,0);
});
test('actual RoomContact lifecycle keeps original ground data intact and disables upper layer on leave',()=>{
 const key=Object.keys(data.fields)[0],floor={size:[1,1],bounds:[[0,0],[1,1]],heightRange:[-.1,.25],encoding:'raw8',data:btoa(String.fromCharCode(255,73))},r=new RoomContactField({data:{[key]:floor},upperContactOptions:{enabled:true,source:data}});
 const before=JSON.stringify(floor);r.set({asset:{bounceField:key},pose:{x:0,y:0,z:0,rot:0,scale:{x:1,y:1,z:1}}});assert.equal(r.stats.upperContact.active,true);assert.equal(JSON.stringify(floor),before);assert.equal(r.stats.upperContact.atlasTextureBytes,122*57*2);assert.equal(r.stats.upperContact.atlasExtraBytes,122*57*2-2);r.clear();assert.equal(r.stats.upperContact.active,false);r.dispose();
});

test('real lowest residual stays on its original flat countertop, not floor, faucet or sloped bowl',()=>{
 for(const f of Object.values(data.fields)){const a=Uint8Array.from(atob(f.data),c=>c.charCodeAt(0));let best=0;for(let i=0;i<a.length;i+=2)if(a[i+1]&&a[i]<a[best])best=i;const index=best/2,x=index%f.size[0],z=Math.floor(index/f.size[0]);const p=[f.bounds[0][0]+x/(f.size[0]-1)*(f.bounds[1][0]-f.bounds[0][0]),.94,f.bounds[0][1]+z/(f.size[1]-1)*(f.bounds[1][1]-f.bounds[0][1])];assert.ok(Math.abs(sampleVanityUpperContact39(f,p)-a[best]/255)<1e-6);assert.ok(sampleVanityUpperContact39(f,p)<.55);assert.equal(sampleVanityUpperContact39(f,[p[0],0,p[2]]),1);assert.equal(sampleVanityUpperContact39(f,[p[0],.958,p[2]]),1);assert.equal(sampleVanityUpperContact39(f,p,[0,.95,.3]),1);}
});
test('lossless shared atlas preserves every floor and upper RG texel',async()=>{
 const {packVanityContactAtlas39}=await import('./vanity-upper-contact39.js');
 for(const f of Object.values(data.fields)){const floor={size:[307,191]},raw=Uint8Array.from({length:307*191*2},(_,i)=>(i*73)%256),high=Uint8Array.from(atob(f.data),c=>c.charCodeAt(0)),a=packVanityContactAtlas39(floor,raw,f);
 for(let y=0;y<191;y++)assert.deepEqual(a.data.slice(y*a.width*2,(y*a.width+307)*2),raw.slice(y*307*2,(y+1)*307*2));
 for(let y=0;y<57;y++)assert.deepEqual(a.data.slice((y*a.width+307)*2,(y*a.width+428)*2),high.slice(y*121*2,(y+1)*121*2));
 assert.equal(a.floorUV[0]*a.width,307);assert.equal(a.upperUV[0]*a.width,307);}
 assert.doesNotMatch(VANITY_UPPER_CONTACT_GLSL,/uniform sampler/);assert.match(VANITY_UPPER_CONTACT_GLSL,/texture2D\(uRoomContactMap,/);
});
test('candidate shader adds no sampler to pastoral wood or any other already-full material',async()=>{
 const {execFileSync}=await import('node:child_process');const result=execFileSync(process.execPath,['--input-type=module','-e',`globalThis.location={search:'?vanityUpperContact39=1'};const THREE=await import('three');const {RoomIndirectLight}=await import('./src/v2/room-lighting.js');const {ROOM_CONTACT_GLSL}=await import('./src/v2/room-contact.js');const light=new RoomIndirectLight();for(const name of ['v2/v2_pastoral_wood','v2_ceramic']){const m=new THREE.MeshStandardMaterial();m.name=name;light.register([m]);const shader={uniforms:{},vertexShader:THREE.ShaderLib.standard.vertexShader,fragmentShader:THREE.ShaderLib.standard.fragmentShader};m.onBeforeCompile(shader);if(shader.fragmentShader.includes('uniform sampler2D uVanityUpperMap'))throw Error('extra sampler '+name);if((ROOM_CONTACT_GLSL.match(/uniform sampler2D/g)||[]).length!==1)throw Error('contact budget');}light.dispose();console.log('shared sampler');`],{cwd:new URL('../../',import.meta.url),encoding:'utf8'});assert.match(result,/shared sampler/);
});
