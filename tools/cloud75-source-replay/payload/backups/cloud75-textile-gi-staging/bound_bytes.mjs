// Read once, hash the EXACT bytes consumed, and check all bindings again at finish.
import assert from 'node:assert/strict';
import {readFile,realpath} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import path from 'node:path';
export const sha256=bytes=>createHash('sha256').update(bytes).digest('hex');
export class BoundBytes {
 constructor(){this.files=new Map();}
 async read(filename,expected){
  const requested=path.resolve(filename),resolved=await realpath(requested),bytes=await readFile(resolved),actual=sha256(bytes);
  const previous=this.files.get(requested);
  if(expected!==undefined)assert.equal(actual,expected,'Consumed bytes differ from expected hash: '+requested);
  if(previous){assert.equal(resolved,previous.resolved,'Input target changed: '+requested);assert.equal(actual,previous.sha256,'Input changed: '+requested);}
  this.files.set(requested,{resolved,sha256:actual});return bytes;
 }
 async assertUnchanged(){for(const [filename,binding]of this.files)await this.read(filename,binding.sha256);}
}
