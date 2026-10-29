import {build} from '../web/node_modules/vite/dist/node/index.js';
import config from '../web/vite.v2.config.js';
import {shadowCPUReviewPlugin42} from './shadow-cpu-review42-transform.mjs';
import {fileURLToPath} from 'node:url';
import {readdir,mkdir,symlink,lstat,readFile} from 'node:fs/promises';
import {join} from 'node:path';
const root=fileURLToPath(new URL('../web/',import.meta.url)),out=join(root,'dist-shadow-cpu-review42');
const panel=await readFile(new URL('./shadow-cpu-review42-panel.js',import.meta.url),'utf8');
const panelPlugin={name:'shadow-review-panel42',transformIndexHtml(){return [{tag:'script',children:panel,injectTo:'body'}];}};
await build({...config,root,configFile:false,plugins:[...config.plugins,shadowCPUReviewPlugin42(),panelPlugin],publicDir:false,build:{...config.build,outDir:out,emptyOutDir:true,copyPublicDir:false}});
// Reuse exact public assets/data; do not copy or modify source assets.
async function linkMissing(from,to){await mkdir(to,{recursive:true});for(const entry of await readdir(from,{withFileTypes:true})){const a=join(from,entry.name),b=join(to,entry.name);try{await lstat(b);if(entry.isDirectory())await linkMissing(a,b);}catch(error){if(error.code!=='ENOENT')throw error;await symlink(a,b);}}}
await linkMissing(join(root,'public'),out);
console.log('Review only /dist-shadow-cpu-review42/v2.html ; globalThis.shadowCPUReview42.start("detail",8), snapshot(), stop(), calibration(). Default off.');
