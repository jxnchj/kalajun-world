import {meadowRootBinding} from '../web/meadow-root-binding.js';
import {forestRootBinding} from '../web/forest-root-binding.js';
import {reachCoverPreparedPlugin42} from '../web/reach-cover-prepared-binding42.js';
import {structurePreparedPlugin} from '../web/structure-prepared-binding.js';
import {build} from '../web/node_modules/vite/dist/node/index.js';
import {fileURLToPath} from 'node:url';
const root=fileURLToPath(new URL('../web/',import.meta.url));
await build({root,configFile:false,publicDir:false,plugins:[meadowRootBinding(),forestRootBinding(),reachCoverPreparedPlugin42(),structurePreparedPlugin()],build:{outDir:'dist-v2/meadow-layout42',emptyOutDir:false,copyPublicDir:false,lib:{entry:root+'src/v2/meadow-layout-patch42.js',formats:['es'],fileName:()=> 'meadow-layout42.js'},rollupOptions:{output:{inlineDynamicImports:true}}}});
console.log('Independent library /dist-v2/meadow-layout42/meadow-layout42.js; main dist untouched');
