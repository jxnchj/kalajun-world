import base from './vite.v2.config.js';
import {resolve} from 'node:path';
export default {...base,build:{...base.build,outDir:'dist-moments41',copyPublicDir:false,rollupOptions:{input:resolve(import.meta.dirname,'shadow-moments-world41.html')}}};
