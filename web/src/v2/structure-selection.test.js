import test from 'node:test';
import assert from 'node:assert/strict';
import {createStructureSelection,commitStructureSelection} from './structure-selection.js';
test('retained instance selection handles empty, shrink, grow and reordered selections without stale tails',()=>{
 const b=createStructureSelection(6,true),memory=b.indices.buffer;
 for(const [indices,expected] of [[[0,1,2,3,4,5],null],[[0,1,2,3,4,5],null],[[1,4],'1,4'],[[4,1],'4,1'],[[],''],[[],null],[[0,2,5],'0,2,5'],[[0,2,5],null]]){
  b.indices.set(indices);b.count=indices.length;assert.equal(commitStructureSelection(b),expected);assert.equal(b.indices.buffer,memory);
 }
});
