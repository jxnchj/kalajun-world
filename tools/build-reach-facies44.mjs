import {build} from '../web/node_modules/vite/dist/node/index.js';import {fileURLToPath} from 'node:url';
const root=fileURLToPath(new URL('../web/',import.meta.url));
await build({root,configFile:false,publicDir:false,build:{outDir:'dist-v2/reach-facies44',emptyOutDir:false,copyPublicDir:false,lib:{entry:root+'src/v2/reach-facies44.js',formats:['es'],fileName:()=> 'facies44.js'},rollupOptions:{output:{inlineDynamicImports:true}}}});
