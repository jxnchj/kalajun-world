import test from 'node:test';import assert from 'node:assert/strict';import * as T from 'three';
import {meadowGeometry} from './ecology.js';import {createGrassFieldGeometry,disposeGrassFieldGeometry} from './grass-root-field.js';import {MeadowMiddleVisibility41} from './meadow-middle-visibility41.js';
test('middle-only union compaction preserves full original fields, restores same-page and refuses shadow-casting roots',()=>{
 const roots=Array.from({length:31},(_,i)=>({x:(i-15)*3,y:0,z:0,s:1,rot:i*.1})),g=meadowGeometry(false),matrix=p=>new T.Matrix4().makeRotationY(p.rot).setPosition(p.x,p.y,p.z);
 const mesh=new T.InstancedMesh(createGrassFieldGeometry(g,roots.length),new T.MeshBasicMaterial(),roots.length);roots.forEach((r,i)=>mesh.setMatrixAt(i,matrix(r)));
 const attrs=[mesh.instanceMatrix,...['aMeadowRootField','aMeadowLandform','aMeadowCommunity'].map(n=>mesh.geometry.attributes[n])];for(let k=1;k<attrs.length;k++)for(let i=0;i<attrs[k].array.length;i++)attrs[k].array[i]=1000*k+i;
 const original=attrs.map(a=>a.array.slice()),near={count:999,castShadow:true},tile={regular:roots,meshes:[near,mesh]},eco={grassTiles:new Map([['0',tile]]),matrix},controller=new MeadowMiddleVisibility41(eco,{enabled:true});
 const camera=x=>{const c=new T.PerspectiveCamera(35,1,.1,100);c.position.set(x,2,10);c.lookAt(x,0,0);c.updateMatrixWorld();return c;};
 controller.update([camera(-15)]);const mainCount=mesh.count;assert.ok(mainCount>0&&mainCount<roots.length);assert.equal(near.count,999);
 const record=controller.records.get(mesh);for(let k=0;k<attrs.length;k++)for(let j=0;j<mesh.count;j++)assert.deepEqual(attrs[k].array.slice(j*attrs[k].itemSize,(j+1)*attrs[k].itemSize),original[k].slice(record.selection[j]*attrs[k].itemSize,(record.selection[j]+1)*attrs[k].itemSize));
 const uploads=controller.stats.uploads;controller.update([camera(-15)]);assert.equal(controller.stats.uploads,uploads);
 controller.update([camera(-15),camera(15)]);assert.ok(mesh.count>mainCount);assert.ok(mesh.count<roots.length);
 controller.setEnabled(false);assert.equal(mesh.count,roots.length);attrs.forEach((a,k)=>assert.deepEqual(a.array,original[k]));
 controller.setEnabled(true);controller.update([camera(-15)]);mesh.castShadow=true;controller.update([camera(-15)]);assert.equal(mesh.count,roots.length);attrs.forEach((a,k)=>assert.deepEqual(a.array,original[k]));
 controller.dispose();disposeGrassFieldGeometry(mesh.geometry);mesh.dispose();mesh.material.dispose();g.dispose();
});
