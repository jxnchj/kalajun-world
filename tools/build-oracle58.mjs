import {build} from '../web/node_modules/vite/dist/node/index.js';
import {fileURLToPath} from 'node:url';
const root=fileURLToPath(new URL('../web/',import.meta.url)),entry=fileURLToPath(new URL('./candidates/oracle58/entry.js',import.meta.url));
await build({root,configFile:false,publicDir:false,build:{outDir:'dist-v2/oracle58',emptyOutDir:false,copyPublicDir:false,lib:{entry,formats:['es'],fileName:()=> 'oracle58.js'},rollupOptions:{output:{inlineDynamicImports:true}}}});
