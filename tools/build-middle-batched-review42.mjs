import {build} from '../web/node_modules/vite/dist/node/index.js';
import {fileURLToPath} from 'node:url';
const root=fileURLToPath(new URL('../web/',import.meta.url));
await build({root,configFile:false,publicDir:false,build:{outDir:'dist-v2/middle-review42',emptyOutDir:false,copyPublicDir:false,lib:{entry:root+'src/v2/middle-batched-review42.js',formats:['es'],fileName:()=> 'middle-review42.js'},rollupOptions:{output:{inlineDynamicImports:true}}}});
console.log('Independent library /dist-v2/middle-review42/middle-review42.js; main dist untouched');
