import{build,mergeConfig}from'../web/node_modules/vite/dist/node/index.js';
import config from'../web/vite.v2.config.js';
import{fileURLToPath}from'node:url';
import{readdir,mkdir,symlink,lstat}from'node:fs/promises';
import{join}from'node:path';
const root=fileURLToPath(new URL('../web/',import.meta.url)),out=join(root,'dist-shore-asset42');
await build(mergeConfig(config,{root,configFile:false,publicDir:false,build:{outDir:out,emptyOutDir:true,copyPublicDir:false,rollupOptions:{input:root+'shore-asset42.html'}}}));
// Same public-tree overlay as the CPU review build. Preserve generated chunks
// while sharing every public root, including world-v2 and future data folders.
async function linkMissing(from,to){await mkdir(to,{recursive:true});for(const entry of await readdir(from,{withFileTypes:true})){const a=join(from,entry.name),b=join(to,entry.name);try{await lstat(b);if(entry.isDirectory())await linkMissing(a,b);}catch(error){if(error.code!=='ENOENT')throw error;await symlink(a,b);}}}
await linkMissing(join(root,'public'),out);
