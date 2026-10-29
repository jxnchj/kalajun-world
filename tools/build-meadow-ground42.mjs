import {build} from '../web/node_modules/vite/dist/node/index.js';
import {fileURLToPath} from 'node:url';
const root=fileURLToPath(new URL('../web/',import.meta.url));
// Same installed Three version as main. This installer consumes the existing
// terrain material; it creates no renderer, geometry, texture or second world.
await build({root,configFile:false,publicDir:false,build:{outDir:'dist-v2/meadow-ground42',emptyOutDir:false,copyPublicDir:false,lib:{entry:root+'src/v2/meadow-ground-structure42.js',formats:['es'],fileName:()=> 'meadow-ground42.js'},rollupOptions:{output:{inlineDynamicImports:true}}}});
console.log('Independent OFF library: /dist-v2/meadow-ground42/meadow-ground42.js; main dist remains untouched');
