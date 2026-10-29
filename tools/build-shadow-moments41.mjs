import {build} from '../web/node_modules/vite/dist/node/index.js';
import config from '../web/vite.moments41.config.js';
import {readdir,mkdir,symlink,lstat,cp} from 'node:fs/promises';
import {fileURLToPath} from 'node:url';import {join,relative} from 'node:path';
const root=fileURLToPath(new URL('../web/',import.meta.url)),out=join(root,'dist-moments41');
await build({...config,root,configFile:false});
async function link(source,target){try{await lstat(target);return;}catch(e){if(e.code!=='ENOENT')throw e;}await symlink(relative(join(target,'..'),source),target);}
for(const name of await readdir(join(root,'public'))){const source=join(root,'public',name);if(name==='assets'){await mkdir(join(out,'assets'),{recursive:true});for(const child of await readdir(source))await link(join(source,child),join(out,'assets',child));}else await link(source,join(out,name));}
console.log('Independent moments build ready; public files linked read-only; main dist-v2 untouched.');

// Keep the existing preview allow-list and server untouched. Only this new
// subdirectory is written; all symlink targets stay inside dist-v2's boundary.
const preview=join(root,'dist-v2','moments41');
await mkdir(join(preview,'assets'),{recursive:true});
for(const name of await readdir(out)){
 const source=join(out,name),info=await lstat(source);
 if(name==='assets'){for(const child of await readdir(source)){const file=join(source,child);if((await lstat(file)).isSymbolicLink())await link(join(root,'dist-v2','assets',child),join(preview,'assets',child));else await cp(file,join(preview,'assets',child),{recursive:true});}}
 else if(info.isSymbolicLink())await link(join(root,'dist-v2',name),join(preview,name));
 else await cp(source,join(preview,name),{recursive:true});
}
console.log('Static preview: /dist-v2/moments41/shadow-moments-world41.html');
