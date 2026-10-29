import {build} from '../../../web/node_modules/vite/dist/node/index.js';
import {fileURLToPath} from 'node:url';
import {cp} from 'node:fs/promises';
const root=fileURLToPath(new URL('../../../web/',import.meta.url));
await build({root,configFile:false,publicDir:false,
 build:{outDir:fileURLToPath(new URL('../../../web/dist-v2/reach-facies66/',import.meta.url)),
 emptyOutDir:false,copyPublicDir:false,minify:false,
 lib:{entry:fileURLToPath(new URL('../../../web/src/v2/reach-bed-facies66.js',import.meta.url)),
 formats:['es'],fileName:()=> 'reach-facies66.js'}}});

// Copy only this candidate's one scan set, never the world's public directory.
await cp(new URL('../../../web/public/assets/v2/reach-bed-facies66/',import.meta.url),new URL('../../../web/dist-v2/reach-facies66/assets/',import.meta.url),{recursive:true});
