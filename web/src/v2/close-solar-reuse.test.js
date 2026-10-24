import test from 'node:test';import assert from 'node:assert/strict';
import {closeSolarShaderHelper,closeSolarHelper,solarDepthCellIndex,SOLAR_DISK}from './close-solar-shadow.js';
// Exercise all real fixed disk/receiver quadrants with moving sub-texel phases,
// different physical penumbra radii, slopes and shadow-map boundaries. Cache keys
// use the UNCLAMPED integer coordinate, exactly like the shader.
const quad=[[-.25,-.25],[.25,-.25],[-.25,.25],[.25,.25]];
function integrate(p,dx,dy,radius,size,gradient,reversed,cached){
 let fetches=0;const raw=c=>{fetches++;const x=Math.max(0,Math.min(size-1,c[0])),y=Math.max(0,Math.min(size-1,c[1]));return .5+.025*Math.sin(x*.7+y*.3);},base=p.slice(0,2).map(v=>Math.floor(v*size)),depths=[];
 for(let y=-1;y<=1;y++)for(let x=-1;x<=1;x++)depths.push(raw([base[0]+x,base[1]+y]));
 const sample=c=>{const key=solarDepthCellIndex(c,base);return cached&&key>=0?depths[key]:raw(c);};let visibility=0;
 for(let i=0;i<12;i++){const [a,b]=quad[i%4],q=p.map((v,k)=>v+dx[k]*a+dy[k]*b),uv=q.slice(0,2).map((v,k)=>v+SOLAR_DISK[i][k]*radius/size),grid=uv.map(v=>v*size-.5),cell=grid.map(Math.floor),f=grid.map((v,k)=>v-cell[k]);let sum=0;
  for(let y=0;y<2;y++)for(let x=0;x<2;x++){const c=[cell[0]+x,cell[1]+y],center=c.map(v=>(v+.5)/size),z=q[2]+(center[0]-q[0])*gradient[0]+(center[1]-q[1])*gradient[1]+(reversed?1:-1)*.0000005,depth=sample(c),w=(x?f[0]:1-f[0])*(y?f[1]:1-f[1]);sum+=w*Number(reversed?z>=depth:z<=depth);}visibility+=sum;
 }
 return {visibility:visibility/12,fetches};
}
test('reuse keeps exact 12-sample solar disk, per-texel comparison and full receiver footprint',()=>{const s=closeSolarShaderHelper(true);assert.equal(closeSolarShaderHelper(false),closeSolarHelper);assert.match(s,/float depths\[9\]/);assert.match(s,/depths\[\(y\+1\)\*3\+x\+1\]=depth/);assert.equal((s.match(/visibility\+=worldSolarCompare/g)||[]).length,12);assert.equal((s.match(/\*uvRadius,gradient,bias,size,cell,depths\);/g)||[]).length,12);assert.match(s,/worldSolarLit\(z,worldSolarCached\(c,isize,base,depths\)\)/);assert.match(s,/return worldSolarRaw\(cell,size\);/);});
test('all taps remain exactly equivalent for animated phases, small/large penumbrae, receiver slopes and depth directions',()=>{let cases=0,saved=0,min=57,max=0;const size=64;for(const reversed of [false,true])for(const center of [0,.01,.25,.5,.99,1])for(const phase of [0,.17,.5,.83])for(const radius of [0,.13,1.3,8,30])for(const gradient of [[0,0],[.3,-.2]]){const p=[center+phase/size,.5+phase/size,.5],dx=[.6/size,.2/size,(.6*gradient[0]+.2*gradient[1])/size],dy=[-.1/size,.8/size,(-.1*gradient[0]+.8*gradient[1])/size];const a=integrate(p,dx,dy,radius,size,gradient,reversed,false),b=integrate(p,dx,dy,radius,size,gradient,reversed,true);assert.equal(b.visibility,a.visibility);assert.equal(a.fetches,57);assert.ok(b.fetches>=9&&b.fetches<=57);saved+=a.fetches-b.fetches;min=Math.min(min,b.fetches);max=Math.max(max,b.fetches);cases++;}assert.ok(saved>0);assert.equal(min,9);assert.equal(max,57);console.log(JSON.stringify({cases,exact:true,minFetches:min,maxFetches:max,syntheticAverageSaved:saved/cases}));});
