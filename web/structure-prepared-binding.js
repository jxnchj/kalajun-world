import {readFileSync}from 'node:fs';
import {createHash}from 'node:crypto';
import {fileURLToPath}from 'node:url';
const root=new URL('./',import.meta.url),sha=b=>createHash('sha256').update(b).digest('hex');
export const STRUCTURE_PREPARED_SOURCES=['src/v2/guest-living-definition.js','src/v2/guest-living-loader.js','src/v2/generated/guest-living-source-39.json','src/v2/lodge-tables-definition.js','src/v2/lodge-tables-loader.js','src/v2/generated/lodge-tables-source-38.json','src/v2/generated/lodge-tables-wood-38.json','src/v2/generated/lodge-tables-stream-38.json',"src/v2/lodge-interior-stream.js","src/v2/generated/lodge-interior-stream-38.json",'src/v2/structures.js','src/v2/lodge-interior-wood.js','src/v2/generated/lodge-interior-wood-38.json','src/v2/lodge-chairs-definition.js','src/v2/lodge-chairs-loader.js','src/v2/generated/lodge-chairs-source-38.json','src/v2/generated/lodge-chairs-collision-38.json','src/v2/guest-vanity-definition.js','src/v2/guest-vanity-loader.js','src/v2/generated/guest-vanity-source-38.json','src/v2/generated/guest-vanity-collision-38.json','src/v2/cabin-window-glass.js','src/v2/cabin-timber.js','src/v2/lodge-wood.js','src/v2/lodge-furniture-definition.js','src/v2/lodge-furniture-loader.js','src/v2/stone-occlusion.js','src/v2/stone-occlusion-data.js','src/v2/lodge-door.js','src/v2/lodge-opening.js','src/v2/doors.js','src/v2/boardwalk-endpoints.js','src/v2/boardwalk-timber.js','src/v2/threshold-stones.js','src/v2/settlement-assets.js','src/v2/asset-occlusion.js','src/v2/timber-continuity.js','src/v2/timber-continuity-data.js','node_modules/three/examples/jsm/loaders/GLTFLoader.js','node_modules/three/examples/jsm/utils/BufferGeometryUtils.js','node_modules/three/examples/jsm/libs/meshopt_simplifier.module.js'];
export function structurePreparedBinding(){
 const sources=STRUCTURE_PREPARED_SOURCES.map(path=>({path,sha256:sha(readFileSync(new URL(path,root)))}));
 return {signature:sha(JSON.stringify(sources)),sources,assets:{house_a:{path:'assets/v2/house_a_lived.glb',sha256:sha(readFileSync(new URL('public/assets/v2/house_a_lived.glb',root)))}}};
}
export function structurePreparedPlugin(){
 const virtual='virtual:structure-prepared-binding',id='\0'+virtual;
 return {name:'structure-prepared-source-binding',
  buildStart(){for(const p of [...STRUCTURE_PREPARED_SOURCES,'public/assets/v2/house_a_lived.glb'])this.addWatchFile(fileURLToPath(new URL(p,root)));},
  resolveId(s){if(s===virtual)return id;},load(s){if(s===id)return 'export default '+JSON.stringify(structurePreparedBinding())+';';},
  handleHotUpdate(ctx){if([...STRUCTURE_PREPARED_SOURCES,'public/assets/v2/house_a_lived.glb'].some(p=>fileURLToPath(new URL(p,root))===ctx.file)){const m=ctx.server.moduleGraph.getModuleById(id);if(m){ctx.server.moduleGraph.invalidateModule(m);return [...ctx.modules,m];}}}
 };
}
