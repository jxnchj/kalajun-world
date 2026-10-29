import {build} from '../web/node_modules/vite/dist/node/index.js';
import {fileURLToPath} from 'node:url';import{writeFileSync}from'node:fs';
import {meadowRootBinding} from '../web/meadow-root-binding.js';import {forestRootBinding} from '../web/forest-root-binding.js';import {reachCoverPreparedPlugin42} from '../web/reach-cover-prepared-binding42.js';import {structurePreparedPlugin} from '../web/structure-prepared-binding.js';
const root=fileURLToPath(new URL('../web/',import.meta.url));
await build({root,configFile:false,publicDir:false,plugins:[meadowRootBinding(),forestRootBinding(),reachCoverPreparedPlugin42(),structurePreparedPlugin()],build:{outDir:'dist-v2/meadow-volume-world42',emptyOutDir:false,copyPublicDir:false,lib:{entry:root+'src/v2/meadow-volume-world42.js',formats:['es'],fileName:()=> 'volume-world42.js'},rollupOptions:{output:{inlineDynamicImports:true}}}});
const {readFileSync}=await import('node:fs');writeFileSync(root+'dist-v2/meadow-volume-world42/index.html',readFileSync(root+'meadow-volume-world42.html'));

writeFileSync(root+'dist-v2/meadow-volume-world42/bridge42.js',"import{installMeadowVolumeWorld42}from'./volume-world42.js';window.installMeadowVolumeWorld42=installMeadowVolumeWorld42;");
