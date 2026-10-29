import test from 'node:test';import assert from 'node:assert/strict';
import {installMiddleBatchedReview42} from './middle-batched-review42.js';
function fixture(){const e={nearParts:[{}],nearGroup:{},nearTreeBatches:new Map(),stats:{},treeBatchRevision:9},d={ecology:e,renderer:{extensions:{has:()=>true}},treePhotoPrepass:{enabled:false}};return {e,d};}
class Candidate {constructor(p,g,{onChange}){this.stats={enabled:true};this.enabled={};Object.defineProperty(this.enabled,'value',{set:v=>{this.stats.enabled=Boolean(v);onChange();}});}sync(b,r){this.synced=[b,r];}dispose(){this.disposes=(this.disposes??0)+1;}}
test('review attaches existing sync owner, begins OFF and exactly restores absent or own descriptors',()=>{
 for(const own of[false,true]){const {e,d}=fixture();if(own){e.middleBatched=null;e.stats.middleTreeBatched={old:true};}const descriptors=[Object.getOwnPropertyDescriptor(e,'middleBatched'),Object.getOwnPropertyDescriptor(e.stats,'middleTreeBatched')];
 const owner=installMiddleBatchedReview42(d,{Candidate});assert.strictEqual(e.middleBatched,owner.candidate);assert.strictEqual(e.stats.middleTreeBatched,owner.stats);assert.equal(owner.stats.enabled,false);assert.strictEqual(owner.candidate.synced[0],e.nearTreeBatches);owner.setEnabled(true);assert.equal(owner.stats.enabled,true);owner.dispose();owner.dispose();assert.equal(owner.candidate.disposes,1);assert.deepEqual(Object.getOwnPropertyDescriptor(e,'middleBatched'),descriptors[0]);assert.deepEqual(Object.getOwnPropertyDescriptor(e.stats,'middleTreeBatched'),descriptors[1]);assert.throws(()=>owner.setEnabled(true),/disposed/);}
});
test('review refuses existing owner, missing extension and incompatible experiments before mutation',()=>{
 for(const mutate of[e=>e.middleBatched={},e=>e.treeViewCull={value:1},e=>e.treeFrustumCull={value:1},e=>e.treeWindCoefficientsStatic=true]){const {e,d}=fixture();mutate(e);assert.throws(()=>installMiddleBatchedReview42(d,{Candidate}));assert.equal(Object.hasOwn(e.stats,'middleTreeBatched'),false);}
 const {d}=fixture();d.renderer.extensions.has=()=>false;assert.throws(()=>installMiddleBatchedReview42(d,{Candidate}),/multi_draw/);
});
test('failed original sync releases candidate and restores owner fields',()=>{
 const {e,d}=fixture();let failed;class Broken extends Candidate{constructor(...a){super(...a);failed=this;}sync(){throw Error('source mismatch');}}
 assert.throws(()=>installMiddleBatchedReview42(d,{Candidate:Broken}),/source mismatch/);assert.equal(failed.disposes,1);assert.equal(Object.hasOwn(e,'middleBatched'),false);assert.equal(Object.hasOwn(e.stats,'middleTreeBatched'),false);
});
