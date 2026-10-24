import test from 'node:test';
import assert from 'node:assert/strict';
import {riverBedDepth,RIVER_BED_GLSL,bendDeposits} from './river-bed-profile.js';
import {riverSectionAt,riverCrossPoint} from './river-section.js';
import {createWaterGeometry,createWaterMaterial} from './water.js';
const near=(a,b)=>assert.ok(Math.abs(a-b)<1e-11,`${a} != ${b}`);
test('circular bends put the depositional bank toward their actual circle centre, including mirrored flow',()=>{
 for(const turnSign of [-1,1]){
  const R=40,theta=.3;
  const a={x:R*Math.sin(-theta),z:turnSign*R*(1-Math.cos(-theta)),flowX:Math.cos(-theta),flowZ:turnSign*Math.sin(-theta)};
  const b={flowX:Math.cos(theta),flowZ:turnSign*Math.sin(theta)};
  const turn=Math.atan2(a.flowX*b.flowZ-a.flowZ*b.flowX,a.flowX*b.flowX+a.flowZ*b.flowZ),d=bendDeposits(turn);
  const section={x:0,z:0,fx:1,fz:0,left:4,right:4};
  const inside=riverCrossPoint(section,d.left>d.right?-1:1),outside=riverCrossPoint(section,d.left>d.right?1:-1);
  assert.ok(Math.hypot(inside.x,inside.z-turnSign*R)<Math.hypot(outside.x,outside.z-turnSign*R));
  assert.equal(Math.max(d.left,d.right),1);assert.equal(Math.min(d.left,d.right),0);
 }
 assert.deepEqual(bendDeposits(0),{left:0,right:0});
});
test('optical GLSL and CPU bed evaluate identically throughout old and asymmetric profiles',()=>{
 // Restricted scalar GLSL interpreter for this authored function. It evaluates
 // the actual emitted shader arithmetic, not a second copied expected formula.
 const body=RIVER_BED_GLSL.slice(RIVER_BED_GLSL.indexOf('{')+1,RIVER_BED_GLSL.lastIndexOf('}')).replace(/float /g,'let ');
 const smooth=(a,b,x)=>{const t=Math.max(0,Math.min(1,(x-a)/(b-a)));return t*t*(3-2*t);};
 const gpu=new Function('depth','weight','across','bar','sectionWeight','deposit','clamp','abs','max','mix','smoothstep',body);
 for(const depth of [.12,.76,2])for(const weight of [0,.4,1])for(const bed of [0,.5,1])for(const deposit of [0,.3,1])for(let i=-100;i<=100;i++){
  const u=i/100,args=[depth,weight,u,.73,bed,deposit];
  const q=gpu(...args,(x,a,b)=>Math.max(a,Math.min(b,x)),Math.abs,Math.max,(a,b,t)=>a+(b-a)*t,smooth);near(q,riverBedDepth(...args));assert.ok(q>=0&&q<=depth+.025+1e-12);
 }
});
test('eroding toe eliminates broad shallow shelf; point bar remains confined to the inside side',()=>{
 const d=.76,half=4.3;let oldShallow=0,cutShallow=0,barShallow=0;
 for(let i=1;i<=10000;i++){const u=i/10000;
  if(riverBedDepth(d,1,u,.8)<.04)oldShallow+=half/10000;
  if(riverBedDepth(d,1,u,.8,1,0)<.04)cutShallow+=half/10000;
  if(riverBedDepth(d,1,u,.8,1,1)<.04)barShallow+=half/10000;
 }
 assert.ok(oldShallow>cutShallow*8);assert.ok(cutShallow<.065);assert.ok(barShallow>oldShallow);
 for(const deposit of [0,.3,1]){let previous=Infinity;for(let i=0;i<=1000;i++){const y=riverBedDepth(d,1,i/1000,.8,1,deposit);assert.ok(y<=previous+1e-12);previous=y;}near(previous,0);}
});
test('near and overview water transmit the same physical section fields into their shader',()=>{
 const a={x:0,z:0,level:10,width:9,depth:.76,distance:0,flowX:1,flowZ:0,bankShape:{weight:1,left:4,right:3,bedWeight:1,bedDepositLeft:0,bedDepositRight:1}},b={...a,x:5,distance:5};
 const s={a,b,length:5,slope:0};
 for(const detail of [false,true]){const g=createWaterGeometry([s],{detail});for(let i=0;i<g.attributes.position.count;i++)assert.deepEqual([0,1,2].map(k=>g.attributes.aRiverBedShape.getComponent(i,k)),[1,0,1]);g.dispose();}
 for(const overview of [false,true]){const m=createWaterMaterial({}, {overview}),shader={uniforms:{},vertexShader:'#include <common>\n#include <begin_vertex>',fragmentShader:'#include <common>\n#include <color_fragment>'};m.onBeforeCompile(shader);assert.ok(shader.fragmentShader.includes(RIVER_BED_GLSL));assert.ok(shader.vertexShader.includes('vRiverBedShape=aRiverBedShape'));m.dispose();}
});

test('actual asymmetric sections preserve monotone shoulders and finite erosion toes',async t=>{
 const {actualForestWorld}=await import('../../../tools/benchmark_forest_exclusion_v38.mjs');
 const {riverBankRise,riverSectionDepth}=await import('./river-section.js');
 const saved=globalThis.location;let world;try{globalThis.location={search:'?valleyLandform=1&valleyMeanders=1&valleySection=1'};world=actualForestWorld(undefined,'rgba');}finally{globalThis.location=saved;}
 let sides=0,minShallow=Infinity,maxShallow=0,cutSides=0,barSides=0;
 for(const s of world.hydrology.segments){if(!s.a.bankShape?.bedWeight&&!s.b.bankShape?.bedWeight)continue;
  const q=riverSectionAt(s,.5);for(const side of [-1,1]){let prev=0;for(let i=0;i<=200;i++){const rise=riverBankRise(q,side,i/200);assert.ok(rise>=prev-1e-12,'bank must not fold into a swale');prev=rise;}assert.equal(prev,1);
   if(q.bedWeight<.99)continue;
   let shallow=0;const half=side<0?q.left:q.right,deposit=side<0?q.bedDepositLeft:q.bedDepositRight;
   for(let i=1;i<=1000;i++)if(riverSectionDepth(q,side*i/1000)<.04)shallow+=half/1000;
   minShallow=Math.min(minShallow,shallow);maxShallow=Math.max(maxShallow,shallow);sides++;
   if(deposit===0){cutSides++;assert.ok(shallow<.075);}if(deposit>.8){barSides++;assert.ok(shallow>half*.025,'local point bar must remain wider than the erosion toe');}
  }
 }
 assert.ok(cutSides>10&&barSides>0);t.diagnostic(JSON.stringify({sides,cutSides,barSides,minShallow,maxShallow}));
});
