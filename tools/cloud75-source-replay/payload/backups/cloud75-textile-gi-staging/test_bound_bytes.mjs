import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,writeFile,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import path from 'node:path';
import {BoundBytes,sha256} from './bound_bytes.mjs';
async function fixture(t){const dir=await mkdtemp(path.join(tmpdir(),'gi-bound-'));t.after(()=>rm(dir,{recursive:true,force:true}));return path.join(dir,'candidate.js');}
test('actual bytes consumed match run.outputs before parsing',async t=>{const p=await fixture(t),bytes=Buffer.from('export default {"new":true};');await writeFile(p,bytes);const b=new BoundBytes();assert.deepEqual(await b.read(p,sha256(bytes)),bytes);await b.assertUnchanged();});
test('mutation between external validation and JS consumption rejects',async t=>{const p=await fixture(t),old=Buffer.from('verified module'),expected=sha256(old);await writeFile(p,old);assert.equal(sha256(await new BoundBytes().read(p)),expected);/* external validator completed */await writeFile(p,'replaced module');await assert.rejects(new BoundBytes().read(p,expected),/Consumed bytes differ/);});
test('mutation after decode but before final stable check rejects',async t=>{const p=await fixture(t);await writeFile(p,'verified');const b=new BoundBytes();await b.read(p,sha256('verified'));await writeFile(p,'later mutation');await assert.rejects(b.assertUnchanged(),/Consumed bytes differ/);});
test('mutated run receipt rejects even with newly relabelled expected hash',async t=>{const p=await fixture(t);await writeFile(p,'old receipt');const b=new BoundBytes();await b.read(p);await writeFile(p,'new receipt');await assert.rejects(b.read(p,sha256('new receipt')),/Input changed/);});
