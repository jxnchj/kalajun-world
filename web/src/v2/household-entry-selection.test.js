import test from 'node:test';
import assert from 'node:assert/strict';
import {HouseholdEntrySteps,HOUSEHOLD_ENTRY_ASSET,householdEntryMode} from './household-entry-steps.js';
import {householdRoomKey} from './household-room-fields.js';

function restoreLocation(t){
 const previous=globalThis.location;
 t.after(()=>{if(previous===undefined)delete globalThis.location;else globalThis.location=previous;});
}
test('normal entry selection uses corrected editable source with explicit v33 rollback',t=>{
 restoreLocation(t);
 delete globalThis.location;
 assert.equal(householdEntryMode(),'editable','No browser/global location still follows normal path');
 for(const [search,expected] of [['','editable'],['?unrelated=1','editable'],['?householdEntry=editable','editable'],['?householdEntry=unknown','editable'],['?householdEntry=v33','v33']]){
  globalThis.location={search};
  assert.equal(householdEntryMode(),expected,search);
  const entry=new HouseholdEntrySteps({entities:[]});
  try{assert.equal(entry.mode,expected);assert.equal(entry.stats.version,expected==='editable'?HOUSEHOLD_ENTRY_ASSET.version:'household-entry-33');}
  finally{entry.dispose();}
 }
});
test('normal geometry and GI selections are paired only for the authored tea entity',t=>{
 restoreLocation(t);
 for(const search of ['', '?householdEntry=editable', '?householdEntry=unknown']){
  globalThis.location={search};
  assert.equal(householdEntryMode(),'editable');
  assert.equal(householdRoomKey(0,HOUSEHOLD_ENTRY_ASSET.entityId),HOUSEHOLD_ENTRY_ASSET.roomKey);
  assert.equal(householdRoomKey(0,'another-tea-house'),'house_a-living-0');
  assert.equal(householdRoomKey(0),'house_a-living-0');
  for(const style of [1,2])assert.equal(householdRoomKey(style,HOUSEHOLD_ENTRY_ASSET.entityId),'house_a-living-'+style);
 }
});
test('explicit entry rollback and complete yard rollback retain original shared room field',t=>{
 restoreLocation(t);
 for(const search of ['?householdEntry=v33','?householdYards=v32','?householdYards=v32&householdEntry=editable']){
  globalThis.location={search};
  assert.equal(householdRoomKey(0,HOUSEHOLD_ENTRY_ASSET.entityId),'house_a-living-0',search);
 }
 globalThis.location={search:'?householdEntry=v33'};
 assert.equal(householdEntryMode(),'v33');
});
