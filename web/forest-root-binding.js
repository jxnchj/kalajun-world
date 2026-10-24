import {readFileSync}from 'node:fs';
import {createHash}from 'node:crypto';
import {fileURLToPath}from 'node:url';
export const FOREST_ROOT_SOURCE_PATHS=[
 'src/v2/forest-root-source.js','src/v2/forest-root-layout.js','src/v2/forest-root-inputs.js','src/v2/forest-root-codec.js',
 'src/v2/plant-exclusion-index.js','src/v2/world-data.js','src/v2/terrain-height-interpolation.js',
 'src/v2/hydrology.js','src/v2/forest-bank-shoulder.js','src/v2/forest-bank-curvature-v38.js','src/v2/meadow-surface.js','src/v2/meadow-scattered-canopy.js','src/v2/meadow-relief.js','src/v2/river-incision.js','src/v2/river-meander.js','src/v2/river-section.js','src/v2/river-bed-profile.js','src/v2/settlement-assets.js'
];
const root=new URL('./',import.meta.url),hash=b=>createHash('sha256').update(b).digest('hex');
export function forestRootCodeBinding(){
 const sources=FOREST_ROOT_SOURCE_PATHS.map(path=>({path,sha256:hash(readFileSync(new URL(path,root)))}));
 return {signature:hash(JSON.stringify(sources)),sources};
}
export function forestRootBinding(){
 const virtual='virtual:forest-root-binding',id='\0'+virtual;
 return {name:'forest-root-exact-source-binding',
  buildStart(){for(const p of FOREST_ROOT_SOURCE_PATHS)this.addWatchFile(fileURLToPath(new URL(p,root)));},
  resolveId(source){if(source===virtual)return id;},
  load(source){if(source===id)return 'export default '+JSON.stringify(forestRootCodeBinding())+';';},
  handleHotUpdate(ctx){if(FOREST_ROOT_SOURCE_PATHS.some(p=>fileURLToPath(new URL(p,root))===ctx.file)){
   const m=ctx.server.moduleGraph.getModuleById(id);if(m){ctx.server.moduleGraph.invalidateModule(m);return [...ctx.modules,m];}
  }}
 };
}
