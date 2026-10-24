import {LODGE_FURNITURE_SOURCE,LODGE_FURNITURE_DOOR,LODGE_FURNITURE_KEY,LODGE_FURNITURE_ASSET} from './lodge-furniture-definition.js';
import delivery from './lodge-furniture-package.json' with {type:'json'};
import {LODGE_WHOLE_GRID} from './lodge-whole-definition.js';
import {validateLodgeDoorGI} from './lodge-door-gi.js';
import {lodgeSHA} from './lodge-door-codec.js';
import {loadLodgeDoorPackage} from './lodge-door-package.js';
import {ROOM_BOUNCE_DATA} from './room-bounce-registry.js';
import {ROOM_SECOND_BOUNCE_DATA} from './room-second-bounce-registry.js';
import {ROOM_TRANSPORT_DATA} from './room-transport-registry.js';
import {ROOM_APERTURE_DATA} from './room-aperture-registry.js';
import {ROOM_CONTACT_DATA} from './room-contact-registry.js';
const loaders=[()=>import('./lodge-furniture-data/0.js'),()=>import('./lodge-furniture-data/1.js'),()=>import('./lodge-furniture-data/2.js')];
export function validateLodgeFurnitureBase(state){
 const base=state?.local?.sky;
 if(base?.sourceGLB!==LODGE_FURNITURE_SOURCE.sourceGLB||base.sourceSHA256!==LODGE_FURNITURE_SOURCE.sourceSHA256||base.sourceBlend!==LODGE_FURNITURE_SOURCE.sourceBlend||base.blendSHA256!==LODGE_FURNITURE_SOURCE.blendSHA256)throw Error('Furniture lodge source differs');
 for(const [name,value]of Object.entries({size:LODGE_WHOLE_GRID.size,bounds:LODGE_WHOLE_GRID.bounds,openings:LODGE_FURNITURE_ASSET.openings}))if(JSON.stringify(base[name])!==JSON.stringify(value))throw Error('Furniture lodge receiver differs: '+name);
 for(const name of ['sourceSHA256','blendSHA256'])if(state.contact?.[name]!==base[name])throw Error('Furniture lodge contact source differs');
 if(state.contact.spacing!==.025||state.contact.samples!==64)throw Error('Furniture lodge contact resolution differs');
 validateLodgeDoorGI(state,0,state.local,state.cross,LODGE_FURNITURE_KEY,LODGE_FURNITURE_DOOR);return state;
}
export async function loadLodgeFurnitureBase({fetchImpl=(...args)=>globalThis.fetch(...args),binding=delivery.base,fallback=loaders[0],stats={}}={}){
 try{
  const response=await fetchImpl('./'+binding.url+'?v='+binding.sha256);if(!response.ok)throw Error('Furniture lodge base HTTP '+response.status);
  const input=new Uint8Array(await response.arrayBuffer()),gzip=input[0]===31&&input[1]===139;
  if(input.length!==(gzip?binding.gzipBytes:binding.rawBytes)||await lodgeSHA(input)!==(gzip?binding.sha256:binding.rawSHA256))throw Error('Furniture lodge base transport checksum mismatch');
  const raw=gzip?new Uint8Array(await new Response(new Blob([input]).stream().pipeThrough(new DecompressionStream('gzip'))).arrayBuffer()):input;
  if(raw.length!==binding.rawBytes||await lodgeSHA(raw)!==binding.rawSHA256)throw Error('Furniture lodge base raw checksum mismatch');
  const parseStart=performance.now(),state=validateLodgeFurnitureBase(JSON.parse(new TextDecoder().decode(raw)));Object.assign(stats,{status:'gzip-base',parseAndValidateMs:performance.now()-parseStart,responseBytes:input.length,compressedBytes:binding.gzipBytes,rawBytes:binding.rawBytes});return state;
 }catch(e){Object.assign(stats,{status:'fallback',reason:String(e?.message??e)});return validateLodgeFurnitureBase((await fallback()).default);}
}
let pending;
const baseStats={};
export function prepareLodgeFurnitureBase(){return pending??=loadLodgeFurnitureBase({stats:baseStats});}
export async function prepareLodgeFurnitureRoom(){
 const state=await prepareLodgeFurnitureBase(),b=state.local,key=LODGE_FURNITURE_KEY;
 ROOM_BOUNCE_DATA[key]=b.sky;ROOM_SECOND_BOUNCE_DATA[key]=b.secondSky;ROOM_TRANSPORT_DATA[key]=b.solar;ROOM_APERTURE_DATA[key]=b.apertures;ROOM_CONTACT_DATA[key]=state.contact;return b;
}
export async function loadLodgeFurnitureStates(stats={}){
 const base=await prepareLodgeFurnitureBase(),local=base.local,cross=base.cross;stats.base=baseStats;
 const modules=await loadLodgeDoorPackage({local,cross},{binding:delivery.delta,fallbackLoaders:loaders,stats});
 return {local,cross,modules};
}
