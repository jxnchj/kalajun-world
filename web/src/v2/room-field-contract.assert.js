// Test-only contract: distinguish unconditional field taps from the guarded
// dining-only aperture slab, and check the actual legacy room uniform/layout.
import assert from 'node:assert/strict';
import {Quaternion} from 'three';
import {RoomBounceField,ROOM_FIELD_GLSL} from './room-bounce-field.js';
export function assertRoomFieldSamplingContract(glsl=ROOM_FIELD_GLSL){
 const guarded=glsl.match(/^\s*if\(uRoomFieldSlabs>4\.5\)extraApertureVisibility=[^\n]+;/gm)??[];
 assert.equal(guarded.length,1,'exactly one dining-only fifth-slab branch');
 assert.equal((guarded[0].match(/texture\(uRoomBounceField/g)??[]).length,1,'fifth-slab branch performs exactly one tap');
 assert.match(guarded[0],/\(uv\.z\+4\.0\)\/uRoomFieldSlabs/,'extra aperture data comes from fifth slab');
 const legacy=glsl.replace(guarded[0],'');
 assert.equal((legacy.match(/texture\(uRoomBounceField/g)??[]).length,4,'legacy rooms retain exactly four unconditional SH taps');
 assert.equal((glsl.match(/uniform highp sampler3D uRoomBounceField;/g)??[]).length,1);
 assert.equal((glsl.match(/sampler3D/g)??[]).length,1,'fifth slab reuses original sampler');
 assert.match(glsl,/extraApertureVisibility=vec3\(1\.0\)/,'unselected extra channels are initialized without a texture read');
 const field=new RoomBounceField(),rotation=new Quaternion();
 try{
  for(const key of ['house_a','yurt','lanchuan-freedom-1','lanchuan-freedom-2','lanchuan-freedom-3']){
   field.set({sourceAsset:key},rotation);const u=field.uniforms,texture=u.uRoomBounceField.value;
   assert.equal(u.uRoomFieldActive.value,1,key+' has its actual field');
   assert.equal(u.uRoomFieldSlabs.value,4,key+' cannot enter the fifth-tap branch');
   assert.equal(u.uRoomFieldSlabs.value>4.5,false);
   assert.equal(texture.image.depth,u.uRoomFieldSize.value.z*4,key+' retains four physical slabs');
  }
 }finally{field.dispose();}
}
