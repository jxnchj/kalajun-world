import {LODGE_TABLES_SOURCE,LODGE_TABLES_DOOR,LODGE_TABLES_KEY,LODGE_TABLES_ASSET} from './lodge-tables-definition.js';
import delivery from './lodge-tables-package.json' with {type:'json'};
import {LODGE_WHOLE_GRID} from './lodge-whole-definition.js';
import {validateLodgeDoorGI} from './lodge-door-gi.js';
import {lodgeSHA} from './lodge-door-codec.js';
import {loadLodgeDoorPackage} from './lodge-door-package.js';
import {ROOM_BOUNCE_DATA} from './room-bounce-registry.js';
import {ROOM_SECOND_BOUNCE_DATA} from './room-second-bounce-registry.js';
import {ROOM_TRANSPORT_DATA} from './room-transport-registry.js';
import {ROOM_APERTURE_DATA} from './room-aperture-registry.js';
import {ROOM_CONTACT_DATA} from './room-contact-registry.js';
const loaders=[()=>import('./lodge-tables-data/0.js'),()=>import('./lodge-tables-data/1.js'),()=>import('./lodge-tables-data/2.js')];
export function validateLodgeTablesBase(state){
 const base=state?.local?.sky;
 if(base?.sourceGLB!==LODGE_TABLES_SOURCE.sourceGLB||base.sourceSHA256!==LODGE_TABLES_SOURCE.sourceSHA256||base.sourceBlend!==LODGE_TABLES_SOURCE.sourceBlend||base.blendSHA256!==LODGE_TABLES_SOURCE.blendSHA256)throw Error('Tables lodge source differs');
 for(const [name,value]of Object.entries({size:LODGE_WHOLE_GRID.size,bounds:LODGE_WHOLE_GRID.bounds,openings:LODGE_TABLES_ASSET.openings}))if(JSON.stringify(base[name])!==JSON.stringify(value))throw Error('Tables lodge receiver differs: '+name);
 for(const name of ['sourceSHA256','blendSHA256'])if(state.contact?.[name]!==base[name])throw Error('Tables lodge contact source differs');
 if(state.contact.spacing!==.025||state.contact.samples!==64)throw Error('Tables lodge contact resolution differs');
 validateLodgeDoorGI(state,0,state.local,state.cross,LODGE_TABLES_KEY,LODGE_TABLES_DOOR);return state;
}
export async function loadLodgeTablesBase({fetchImpl=(...args)=>globalThis.fetch(...args),binding=delivery.base,fallback=loaders[0],stats={}}={}){
 try{
  const response=await fetchImpl('./'+binding.url+'?v='+binding.sha256);if(!response.ok)throw Error('Tables lodge base HTTP '+response.status);
  const input=new Uint8Array(await response.arrayBuffer()),gzip=input[0]===31&&input[1]===139;
  if(input.length!==(gzip?binding.gzipBytes:binding.rawBytes)||await lodgeSHA(input)!==(gzip?binding.sha256:binding.rawSHA256))throw Error('Tables lodge base transport checksum mismatch');
  const raw=gzip?new Uint8Array(await new Response(new Blob([input]).stream().pipeThrough(new DecompressionStream('gzip'))).arrayBuffer()):input;
  if(raw.length!==binding.rawBytes||await lodgeSHA(raw)!==binding.rawSHA256)throw Error('Tables lodge base raw checksum mismatch');
  const parseStart=performance.now(),state=validateLodgeTablesBase(JSON.parse(new TextDecoder().decode(raw)));Object.assign(stats,{status:'gzip-base',parseAndValidateMs:performance.now()-parseStart,responseBytes:input.length,compressedBytes:binding.gzipBytes,rawBytes:binding.rawBytes});return state;
 }catch(e){Object.assign(stats,{status:'fallback',reason:String(e?.message??e)});return validateLodgeTablesBase((await fallback()).default);}
}
let pending;
const baseStats={};
export function prepareLodgeTablesBase(){return pending??=loadLodgeTablesBase({stats:baseStats}).catch(error=>{pending=null;throw error;});}
export async function prepareLodgeTablesRoom(){
 const state=await prepareLodgeTablesBase(),b=state.local,key=LODGE_TABLES_KEY;
 ROOM_BOUNCE_DATA[key]=b.sky;ROOM_SECOND_BOUNCE_DATA[key]=b.secondSky;ROOM_TRANSPORT_DATA[key]=b.solar;ROOM_APERTURE_DATA[key]=b.apertures;ROOM_CONTACT_DATA[key]=state.contact;return b;
}
export async function loadLodgeTablesStates(stats={}){
 const base=await prepareLodgeTablesBase(),local=base.local,cross=base.cross;stats.base=baseStats;
 const modules=await loadLodgeDoorPackage({local,cross},{binding:delivery.delta,fallbackLoaders:loaders,stats});
 return {local,cross,modules};
}
