import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {RafCPUProfile42} from './raf-cpu-profile42.js';
test('per RAF aggregates every real render call rather than averaging main and output',()=>{
 let clock=0;const p=new RafCPUProfile42({now:()=>clock,limit:2});
 function render(ms){clock+=ms;p.recordRender(ms,p.scope??'world-main');}
 const output={render(){render(2);return 17;}},reflection={render(){clock+=3;render(7);}};
 p.wrap(output,'render','output');p.wrap(reflection,'render','reflection');
 p.begin();clock+=10;render(20);assert.equal(output.render(),17);reflection.render();p.end();
 let s=p.snapshot();assert.equal(s.meanSyncMs,42);assert.equal(s.meanRendererMs,29);assert.equal(s.meanRendererCalls,3);assert.deepEqual(s.renderTypes.output,{meanMs:2,meanCalls:1});assert.deepEqual(s.rows[0].boundaries.reflection,{ms:10,calls:1});
 p.begin();render(4);p.end();s=p.snapshot();assert.equal(s.meanRendererCalls,2);assert.equal(s.meanRendererMs,16.5);assert.equal(s.renderTypes.reflection.meanCalls,.5);
 p.begin();clock++;p.end();assert.equal(p.snapshot().samples,2);p.dispose();
});
test('nested scopes and throws preserve methods, this, results and exact inherited descriptors on disposal',()=>{
 let clock=0;const p=new RafCPUProfile42({now:()=>++clock}),prototype={run(){assert.equal(this.value,5);throw Error('draw failure');}},o=Object.assign(Object.create(prototype),{value:5}),original=o.run;
 p.wrap(o,'run','grass-shadow');assert.throws(()=>o.run(),/draw failure/);assert.equal(p.active,null);
 p.begin();assert.throws(()=>o.run(),/draw failure/);assert.equal(p.scope,null);p.end();assert.equal(p.snapshot().rows[0].boundaries['grass-shadow'].calls,1);
 p.dispose();assert.equal(Object.hasOwn(o,'run'),false);assert.strictEqual(o.run,original);
});
test('main installs diagnostics only for profile, retains old per-call samples and brackets real RAF in finally',()=>{
 const main=readFileSync(new URL('./main.js',import.meta.url),'utf8');
 assert.match(main,/params\.get\("profile"\)===\"1\"\?new RafCPUProfile42\(\):null/);
 assert.match(main,/if\(rafCPU42\)\{[\s\S]*?wrap\(worldFrame\?\.output,"render","output"\)/);
 assert.match(main,/scope:"per-call",samples:a.length/);assert.match(main,/finally\{rafCPU42\?\.end\(\);\}/);
 assert.ok(main.indexOf('renderReviewHold){last=now;requestAnimationFrame(frame);return;}')<main.indexOf('rafCPU42?.begin();'));
 assert.match(main,/rafCPU42:rafCPU42\?\.snapshot\(\)\?\?null/);
});
