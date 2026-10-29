import test from 'node:test';import assert from 'node:assert/strict';import {voxelizeMeadow42} from './meadow-volume42.js';
const input=()=>({center:[100,20,200],roots:[{x:100,y:20,z:200,s:1,rot:0}],geometry:{middle:{attributes:{position:{array:[0,0,0,1,0,0,0,1,0],itemSize:3},aPlantWind:{array:[0,0,0,0,0,0,0,0,0],itemSize:3}},index:[0,1,2]}}});
test('true-height voxel area conserves original triangle and directional normal; input untouched',()=>{const d=input(),before=JSON.stringify(d),v=voxelizeMeadow42(d,[true]);let area=0,x=0,y=0,z=0;for(let i=0;i<v.raw.length;i+=4){x+=v.raw[i];y+=v.raw[i+1];z+=v.raw[i+2];area+=v.raw[i+3];}assert.ok(Math.abs(area*v.cell**3-.5)<1e-6);assert.equal(x,0);assert.equal(y,0);assert.equal(z,area);assert.ok(v.max[1]>=1);assert.equal(JSON.stringify(d),before);});
test('source-selected stalk collapse removes only its degenerate triangles',()=>{const d=input();d.geometry.middle.attributes.aPlantWind.array=[0,0,2,0,0,2,0,0,2];assert.equal(voxelizeMeadow42(d,[false]).stats.triangles,0);assert.equal(voxelizeMeadow42(d,[true]).stats.triangles,1);});
test('diagonal leaf dot cancellation is retained before directional area accumulation',()=>{
 const d=input();d.geometry.middle.attributes.position.array=[0,0,0,1,1,0,0,0,1];
 const v=voxelizeMeadow42(d,[true],{directions:[[1,1,0],[1,-1,0]]});
 const integrate=a=>a.reduce((sum,x)=>sum+x,0)*v.cell**3;
 assert.ok(integrate(v.directional[0])<1e-7,'edge-on diagonal leaf must have zero projected area');
 assert.ok(Math.abs(integrate(v.directional[1])-Math.SQRT1_2)<1e-6,'face-on direction preserves full triangle area');
 let upper=0;for(let i=0;i<v.raw.length;i+=4)upper+=(v.raw[i]+v.raw[i+1])*Math.SQRT1_2;
 assert.ok(upper*v.cell**3>.7,'old absolute-component upper bound is nonzero for the same edge-on direction');
});
test('opposite winding leaves do not cancel each other in directional density',()=>{
 const d=input();d.geometry.middle.index=[0,1,2,2,1,0];const v=voxelizeMeadow42(d,[true],{directions:[[0,0,1]]});
 const area=v.directional[0].reduce((sum,x)=>sum+x,0)*v.cell**3;assert.ok(Math.abs(area-1)<1e-6);
});
test('pigment and source-normal moments use the same directional area and face the capture viewer',()=>{
 const d=input();d.geometry.middle.attributes.color={itemSize:3,array:[1,.5,.5,1,.5,.5,1,.5,.5]};d.geometry.middle.attributes.normal={itemSize:3,array:[0,0,1,0,0,1,0,0,1]};d.roots[0].field=[0,0,0,0];
 const v=voxelizeMeadow42(d,[true],{directions:[[0,0,1],[0,0,-1]]});
 for(let j=0;j<2;j++){let w=0,c=0,n=0;for(let i=0;i<v.pigments[j].length;i+=4){w+=v.pigments[j][i+3];c+=v.pigments[j][i];n+=v.normalMoments[j][i+2];}assert.ok(Math.abs(c-w)<1e-5,'authored fully dry red component remains unchanged');assert.ok(Math.abs(n-(j===0?-w:w))<1e-5,'back face source normal flips for the actual center view');}
});
