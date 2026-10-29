import {readFileSync} from 'node:fs';
import {createHash} from 'node:crypto';
import {fileURLToPath} from 'node:url';
const root=new URL('./',import.meta.url),hash=b=>createHash('sha256').update(b).digest('hex');
// Ecology holds the source root algorithm and leaf geometry; follow only the
// actual meadow/world dependencies, not unrelated tree GPU implementations.
const seeds=['pasture-plant-contact41','forest-reach-community39','boardwalk-plant-contact39','forest-root-source','world-data','meadow-surface','grass-root-field','shore-contact','threshold-plants','brook-shoulder-grass','brook-wetgrass','valley-bank-roots','habitat-data','habitat-loading','meadow-root-codec'];
export function meadowRootSourcePaths(){
 const found=new Set(['src/v2/ecology.js']);
 const visit=path=>{if(found.has(path))return;found.add(path);if(!path.endsWith('.js'))return;
  const source=readFileSync(new URL(path,root),'utf8');for(const match of source.matchAll(/(?:from\s*|import\s*)["'](\.[^"']+)["']/g)){
   const url=new URL(match[1],new URL(path,root)),relative=fileURLToPath(url).slice(fileURLToPath(root).length);visit(relative);
  }
 };
 for(const seed of seeds)visit('src/v2/'+seed+'.js');return [...found].sort();
}
export function meadowRootCodeBinding(){const sources=meadowRootSourcePaths().map(path=>({path,sha256:hash(readFileSync(new URL(path,root)))}));return {signature:hash(JSON.stringify(sources)),sources};}
export function meadowRootBinding(){const virtual='virtual:meadow-root-binding',id='\0'+virtual;return {name:'meadow-exact-source-binding',
 buildStart(){for(const p of meadowRootSourcePaths())this.addWatchFile(fileURLToPath(new URL(p,root)));},resolveId(source){if(source===virtual)return id;},load(source){if(source===id)return 'export default '+JSON.stringify(meadowRootCodeBinding())+';';},
 handleHotUpdate(ctx){if(meadowRootSourcePaths().some(p=>fileURLToPath(new URL(p,root))===ctx.file)){const m=ctx.server.moduleGraph.getModuleById(id);if(m){ctx.server.moduleGraph.invalidateModule(m);return [...ctx.modules,m];}}}
};}
