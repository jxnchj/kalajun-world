import test from 'node:test';import assert from 'node:assert/strict';import fs from 'node:fs';import {createHash} from 'node:crypto';import {forestRootCodeBinding,forestRootBinding,FOREST_ROOT_SOURCE_PATHS} from '../../forest-root-binding.js';
test('local profile arithmetic is hashed and watched as a real forest root dependency',()=>{
 const path='src/v2/reach-bank-profile48.js',b=forestRootCodeBinding();assert.equal(FOREST_ROOT_SOURCE_PATHS.filter(p=>p===path).length,1);
 const expected=createHash('sha256').update(fs.readFileSync(new URL('./reach-bank-profile48.js',import.meta.url))).digest('hex');assert.equal(b.sources.find(s=>s.path===path)?.sha256,expected);
 assert.equal(b.signature,createHash('sha256').update(JSON.stringify(b.sources)).digest('hex'));
 const watched=[],plugin=forestRootBinding();plugin.buildStart.call({addWatchFile:p=>watched.push(p)});assert.ok(watched.some(p=>p.endsWith('/'+path)));assert.ok(plugin.load(plugin.resolveId('virtual:forest-root-binding')).includes(expected));
 const exporter=fs.readFileSync(new URL('../../../tools/export-room-exterior-terrain-v38.mjs',import.meta.url),'utf8');assert.ok(exporter.includes("'web/src/v2/reach-bank-profile48.js'"));
});
