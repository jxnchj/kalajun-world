import {build} from '../web/node_modules/vite/dist/node/index.js';
import {fileURLToPath} from 'node:url';
const root=fileURLToPath(new URL('../web/',import.meta.url));
await build({root,configFile:false,publicDir:false,build:{outDir:'dist-v2/photo-audit42',emptyOutDir:false,copyPublicDir:false,lib:{entry:root+'src/v2/photo-cluster-entry42.js',formats:['es'],fileName:()=> 'photo-audit42.js'},rollupOptions:{output:{inlineDynamicImports:true}}}});
console.log('Read-only audit: /dist-v2/photo-audit42/photo-audit42.js; main dist unchanged.');
