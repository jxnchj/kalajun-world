import test from 'node:test';import assert from 'node:assert/strict';
import {localShadowWindow72Enabled as enabled,localShadowWindow72ParameterValid as valid} from './local-shadow-policy72.js';
import {terrainRowWorkerPolicy as worker} from './terrain-row-worker-client.js';
test('default local shadow and explicit one agree; zero restores native; malformed never enables',()=>{
 for(const q of ['', '?localShadowWindow42=1','?localShadowWindow42=1&localShadowWindow42=1']){assert.equal(enabled(q),true);assert.equal(valid(q),true);assert.equal(worker(q).enabled,true);}
 for(const q of ['?localShadowWindow42=0','?localShadowWindow42=0&localShadowWindow42=0']){assert.equal(enabled(q),false);assert.equal(valid(q),true);assert.equal(worker(q).enabled,true);}
 for(const v of ['', 'true','2','01','1&localShadowWindow42=0','0&localShadowWindow42=1','1&localShadowWindow42=invalid']){const q='?localShadowWindow42='+v;assert.equal(enabled(q),false);assert.equal(valid(q),false);assert.equal(worker(q).compatible,false);}
 assert.equal(worker('?localShadowWindow42=1&unknownTerrain=1').enabled,false);
});
