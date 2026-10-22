import test from "node:test";
import assert from "node:assert/strict";
import {createHash} from "node:crypto";
import {execFileSync} from "node:child_process";
import {meadowFieldPixels,sampleMeadowLegacy,sampleMeadowField,MEADOW_FIELD_MEAN,MEADOW_SURFACE,MEADOW_FIELD_GLSL} from "./meadow-surface.js";

function metrics(pixels){
  const n=MEADOW_SURFACE.size,count=n*n,sum=[0,0,0,0],squared=[0,0,0,0],four=[0,0,0,0],energy=[0,0,0,0];
  const at=(x,y,c)=>pixels[(((y+n)%n)*n+(x+n)%n)*4+c]/255;
  for(let y=0;y<n;y++)for(let x=0;x<n;x++)for(let c=0;c<4;c++){
    const v=at(x,y,c);sum[c]+=v;squared[c]+=v*v;
    const dx=at(x+1,y,c)-at(x-1,y,c),dy=at(x,y+1,c)-at(x,y-1,c),e=dx*dx+dy*dy;
    // E*cos(4*angle), without trigonometry: isolates four-corner grid bias,
    // rather than confusing a diagonal light direction with square patterns.
    if(e>0)four[c]+=(dx**4-6*dx*dx*dy*dy+dy**4)/e;energy[c]+=e;
  }
  return {mean:sum.map(v=>v/count),sd:sum.map((v,c)=>Math.sqrt(squared[c]/count-(v/count)**2)),
    axisBias:four.map((v,c)=>v/energy[c])};
}
test("v14 source is retained byte-for-byte and each reload variant caches one full-resolution field",()=>{
  const a=meadowFieldPixels("v14"),b=meadowFieldPixels("v15");
  assert.equal(createHash("sha256").update(a).digest("hex"),"270da9fae10b71045c8f0f30f5160af416f136e014d678b07652670eb4bcf68c");
  assert.equal(a.byteLength,512*512*4);assert.equal(b.byteLength,a.byteLength);assert.notDeepEqual(a,b);
  assert.strictEqual(meadowFieldPixels("v15"),b);assert.strictEqual(meadowFieldPixels("v14"),a);
  assert.throws(()=>meadowFieldPixels("unknown"),/Unknown/);
  assert.equal(MEADOW_SURFACE.metres,128);assert.equal(MEADOW_SURFACE.canopyMetres,128/53);
});
test("radial source removes four-axis plateaus without flattening its distribution",t=>{
  const old=metrics(meadowFieldPixels("v14")),now=metrics(meadowFieldPixels("v15"));
  for(let c=0;c<4;c++){
    assert.ok(Math.abs(now.mean[c]-MEADOW_FIELD_MEAN[c])<1e-12);
    assert.ok(Math.abs(now.sd[c]/old.sd[c]-1)<.012,"retain original visible amplitude");
    assert.ok(Math.abs(now.axisBias[c])<.15,"no strong axis-aligned block signature");
    assert.ok(Math.abs(now.axisBias[c])<Math.abs(old.axisBias[c])*.35);
  }
  t.diagnostic(JSON.stringify({old,new:now,gpuSamplesAdded:0,textureBytes:meadowFieldPixels("v15").byteLength}));
});
test("half-metre grass-crown variation remains and repeated borders are continuous in both variants",t=>{
  const delta={v14:0,v15:0};let count=0;
  for(let z=-128;z<128;z+=4)for(let x=-128;x<128;x+=4){
    for(const pattern of["v14","v15"])delta[pattern]+=Math.abs(sampleMeadowField(x+.13,z+.37,pattern)[1]-sampleMeadowField(x+.63,z+.37,pattern)[1]);
    count++;
  }
  assert.ok(delta.v15>delta.v14*.85&&delta.v15<delta.v14*1.3,"retain fine world-space canopy variation");
  for(const pattern of["v14","v15"])for(const x of[-256,-128,0,128,256])for(const z of[-78.35,.37,26.42]){
    const a=sampleMeadowLegacy(x-.0001,z,pattern),b=sampleMeadowLegacy(x+.0001,z,pattern);
    for(let c=0;c<4;c++)assert.ok(Math.abs(a[c]-b[c])<.001);
    assert.deepEqual(sampleMeadowLegacy(x,z,pattern),sampleMeadowLegacy(x+128,z,pattern));
  }
  assert.match(MEADOW_FIELD_GLSL,/textureGrad\(meadowSurfaceField/);
  t.diagnostic(JSON.stringify({halfMetreMAD:{v14:delta.v14/count,v15:delta.v15/count}}));
});
test("source A/B reload cannot change grass roots, flower choices or source geometry; cached material colours match their chosen source",()=>{
  const script=String.raw`
    import {createHash} from "node:crypto";
    globalThis.location={search:"?meadowPattern="+process.argv[1]};
    const {WorldEcology}=await import("./ecology.js"),m=await import("./meadow-surface.js");
    const world={entities:[],objects:{},landcoverAt:(x,z)=>({r:.05,g:.02,b:0,a:0}),surface:{heightAt:(x,z)=>100+Math.sin(x*.01),normalAt:()=>({x:0,y:1,z:0})}};
    const eco=new WorldEcology(world);eco.habitat=(x,z,channel)=>channel===0?.4:.3;
    const roots=[],flowers=[];for(let z=-32;z<32;z++)for(let x=-32;x<32;x++){
      const root=eco.grassAt(x,z);if(root)roots.push(root);
      const flower=eco.flowerChoice(x*.8,z*.8,((x+32)*17+(z+32)*31)%100/100);if(flower)flowers.push([x,z,flower]);
    }
    for(const root of roots.slice(0,64)){
      const actual=eco.grassRootField.sample(root),expected=new Float32Array(m.sampleMeadowField(Math.fround(root.x),Math.fround(root.z)));
      if(actual.some((v,i)=>v!==expected[i]))throw Error("stale root colour");
    }
    const hash=v=>createHash("sha256").update(JSON.stringify(v)).digest("hex");
    const geometry=eco.grassGeometries.map(g=>[hash(Array.from(g.attributes.position.array)),hash(Array.from(g.index.array))]);
    console.log(JSON.stringify({pattern:m.MEADOW_PATTERN,material:eco.grassMaterials[0].userData.meadowPattern,rootCount:roots.length,flowerCount:flowers.length,
      roots:hash(roots),flowers:hash(flowers),geometry,field:hash(Array.from(eco.grassRootField.sample(roots[0])))}));eco.dispose();
  `;
  const run=pattern=>JSON.parse(execFileSync(process.execPath,["--input-type=module","-e",script,pattern],{cwd:new URL(".",import.meta.url),encoding:"utf8"}));
  const a=run("v14"),b=run("v15"),c=run("v19"),d=run("v21"),e=run("v23"),f=run("v24");
  assert.equal(a.pattern,"v14");assert.equal(b.pattern,"v15");assert.equal(a.material,a.pattern);assert.equal(b.material,b.pattern);
  assert.ok(a.rootCount>1000);assert.ok(a.flowerCount>0);
  for(const key of["rootCount","flowerCount","roots","flowers","geometry"])assert.deepEqual(a[key],b[key],key+" must not be thinned or relocated by material work");
  assert.notEqual(a.field,b.field);
  assert.equal(c.pattern,"v19");assert.equal(c.material,c.pattern);
  for(const key of["rootCount","flowerCount","roots","flowers","geometry"])assert.deepEqual(b[key],c[key],key+" must remain unchanged in the hierarchical source");
  assert.notEqual(b.field,c.field);
  assert.equal(d.pattern,"v21");assert.equal(d.material,d.pattern);
  for(const key of["rootCount","flowerCount","roots","flowers","geometry"])assert.deepEqual(c[key],d[key],key+" must remain unchanged for connected meadow masses");
  assert.notEqual(c.field,d.field);
  assert.equal(f.pattern,"v24");assert.equal(f.material,f.pattern);
  for(const key of["rootCount","flowerCount","roots","flowers","geometry"])assert.deepEqual(e[key],f[key],key+" must remain unchanged for maturity reorganization");
  assert.notEqual(e.field,f.field);
});


test("hierarchical moisture/maturity adds meadow-sized structure with byte-identical fine canopy and blend fields",t=>{
 const old=meadowFieldPixels("v15"),pixels=meadowFieldPixels("v19"),before=metrics(old),after=metrics(pixels);
 for(let i=0;i<pixels.length;i+=4){assert.equal(pixels[i+1],old[i+1]);assert.equal(pixels[i+3],old[i+3]);}
 for(let c=0;c<4;c++){
  assert.ok(Math.abs(after.mean[c]-before.mean[c])<1e-12,"no global colour bias");
  assert.ok(after.sd[c]>.98*before.sd[c]&&after.sd[c]<1.02*before.sd[c],"retain source variation");
 }
 function blockSD(pixels,metres){
  const width=metres*4,values=[];
  for(let z=0;z<512;z+=width)for(let x=0;x<512;x+=width){let sum=0;for(let j=z;j<z+width;j++)for(let i=x;i<x+width;i++)sum+=pixels[(j*512+i)*4]/255;values.push(sum/(width*width));}
  const mean=values.reduce((a,b)=>a+b)/values.length;
  return Math.sqrt(values.reduce((a,b)=>a+(b-mean)**2,0)/values.length);
 }
 const scales=[8,16,32,64],a=scales.map(s=>blockSD(old,s)),b=scales.map(s=>blockSD(pixels,s));
 assert.ok(b[2]>a[2]*1.2&&b[3]>a[3]*1.4,"not merely rotating the same size of spots");
 assert.ok(b[0]>.95*a[0]&&b[1]>.95*a[1],"local patch variance is retained alongside broad structure");
 assert.ok(Math.abs(after.axisBias[0])<.15,"coarse layer must not reintroduce cardinal grid bias");
 assert.strictEqual(meadowFieldPixels("v19"),pixels);assert.equal(pixels.byteLength,old.byteLength);
 t.diagnostic(JSON.stringify({scalesMetres:scales,oldBlockSD:a,newBlockSD:b,sourceSD:after.sd,canopyAndBlendBytesUnchanged:true,gpuSamplesAdded:0,textureBytes:pixels.byteLength}));
});

test("new broad patches do not reintroduce source or world-cell repeats",t=>{
 const lags=[64,96,128,192,256],energy=lags.map(()=>0);let count=0;
 for(let z=-512;z<512;z+=13)for(let x=-512;x<512;x+=13){
  const a=sampleMeadowField(x+.37,z+.21,"v19")[0];
  for(let k=0;k<lags.length;k++)for(const [dx,dz] of [[lags[k],0],[0,lags[k]]]){
   const b=sampleMeadowField(x+.37+dx,z+.21+dz,"v19")[0];energy[k]+=(b-a)**2;
  }
  count+=2;
 }
 const mean=energy.reduce((a,b)=>a+b)/energy.length;
 for(const e of energy)assert.ok(e>mean*.85,"source/world-cell periods must not create a correlation trough");
 t.diagnostic(JSON.stringify({lagsMetres:lags,meanSquaredDifference:energy.map(e=>e/count)}));
});


test("connected meadow masses keep all fine canopy/blend bytes and source contrast while widening coherent colour regions",t=>{
 const old=meadowFieldPixels("v19"),now=meadowFieldPixels("v21"),a=metrics(old),b=metrics(now);
 for(let i=0;i<now.length;i+=4){assert.equal(now[i+1],old[i+1]);assert.equal(now[i+3],old[i+3]);}
 for(let c=0;c<4;c++){
  assert.ok(Math.abs(a.mean[c]-b.mean[c])<1e-12,"unchanged full-texture mean");
  assert.ok(b.sd[c]/a.sd[c]>.98&&b.sd[c]/a.sd[c]<1.02,"unchanged colour contrast budget");
 }
 const neighbourEnergy=p=>{let total=0;for(let z=0;z<512;z+=8)for(let x=0;x<512;x+=8){const a=p[(z*512+x)*4]/255;total+=(a-p[(z*512+(x+64)%512)*4]/255)**2;}return total/4096;};
 const before=neighbourEnergy(old),after=neighbourEnergy(now);
 assert.ok(after<before*.85,"same full contrast is carried by larger connected masses instead of equally weighted small spots");
 assert.ok(Math.abs(b.axisBias[0])<.15,"large masses do not add axis aligned plateaus");
 for(const x of[-128,0,128])for(const z of[-64.7,16.1,73.8]){
  const l=sampleMeadowLegacy(x-.0001,z,"v21"),r=sampleMeadowLegacy(x+.0001,z,"v21");
  l.forEach((v,k)=>assert.ok(Math.abs(v-r[k])<.001));
 }
 assert.equal(now.byteLength,old.byteLength);t.diagnostic(JSON.stringify({old16mDifference:before,new16mDifference:after,sd:b.sd,canopyBlendBytesIdentical:true}));
});
