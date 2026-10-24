import {LODGE_CHAIRS_SOURCE,LODGE_CHAIRS_DOOR,LODGE_CHAIRS_KEY,LODGE_CHAIRS_ASSET} from './lodge-chairs-definition.js';
import delivery from './lodge-chairs-package.json' with {type:'json'};
import {LODGE_WHOLE_GRID} from './lodge-whole-definition.js';
import {validateLodgeDoorGI} from './lodge-door-gi.js';
import {lodgeSHA} from './lodge-door-codec.js';
import {loadLodgeDoorPackage} from './lodge-door-package.js';
import {ROOM_BOUNCE_DATA} from './room-bounce-registry.js';
import {ROOM_SECOND_BOUNCE_DATA} from './room-second-bounce-registry.js';
import {ROOM_TRANSPORT_DATA} from './room-transport-registry.js';
import {ROOM_APERTURE_DATA} from './room-aperture-registry.js';
import {ROOM_CONTACT_DATA} from './room-contact-registry.js';
const loaders=[()=>import('./lodge-chairs-data/0.js'),()=>import('./lodge-chairs-data/1.js'),()=>import('./lodge-chairs-data/2.js')];
export function validateLodgeChairsBase(state){
 const base=state?.local?.sky;
 if(base?.sourceGLB!==LODGE_CHAIRS_SOURCE.sourceGLB||base.sourceSHA256!==LODGE_CHAIRS_SOURCE.sourceSHA256||base.sourceBlend!==LODGE_CHAIRS_SOURCE.sourceBlend||base.blendSHA256!==LODGE_CHAIRS_SOURCE.blendSHA256)throw Error('Chairs lodge source differs');
 for(const [name,value]of Object.entries({size:LODGE_WHOLE_GRID.size,bounds:LODGE_WHOLE_GRID.bounds,openings:LODGE_CHAIRS_ASSET.openings}))if(JSON.stringify(base[name])!==JSON.stringify(value))throw Error('Chairs lodge receiver differs: '+name);
 for(const name of ['sourceSHA256','blendSHA256'])if(state.contact?.[name]!==base[name])throw Error('Chairs lodge contact source differs');
 if(state.contact.spacing!==.025||state.contact.samples!==64)throw Error('Chairs lodge contact resolution differs');
 validateLodgeDoorGI(state,0,state.local,state.cross,LODGE_CHAIRS_KEY,LODGE_CHAIRS_DOOR);return state;
}
export async function loadLodgeChairsBase({fetchImpl=(...args)=>globalThis.fetch(...args),binding=delivery.base,fallback=loaders[0],stats={}}={}){
 try{
  const response=await fetchImpl('./'+binding.url+'?v='+binding.sha256);if(!response.ok)throw Error('Chairs lodge base HTTP '+response.status);
  const input=new Uint8Array(await response.arrayBuffer()),gzip=input[0]===31&&input[1]===139;
  if(input.length!==(gzip?binding.gzipBytes:binding.rawBytes)||await lodgeSHA(input)!==(gzip?binding.sha256:binding.rawSHA256))throw Error('Chairs lodge base transport checksum mismatch');
  const raw=gzip?new Uint8Array(await new Response(new Blob([input]).stream().pipeThrough(new DecompressionStream('gzip'))).arrayBuffer()):input;
  if(raw.length!==binding.rawBytes||await lodgeSHA(raw)!==binding.rawSHA256)throw Error('Chairs lodge base raw checksum mismatch');
  const parseStart=performance.now(),state=validateLodgeChairsBase(JSON.parse(new TextDecoder().decode(raw)));Object.assign(stats,{status:'gzip-base',parseAndValidateMs:performance.now()-parseStart,responseBytes:input.length,compressedBytes:binding.gzipBytes,rawBytes:binding.rawBytes});return state;
 }catch(e){Object.assign(stats,{status:'fallback',reason:String(e?.message??e)});return validateLodgeChairsBase((await fallback()).default);}
}
let pending;
const baseStats={};
export function prepareLodgeChairsBase(){return pending??=loadLodgeChairsBase({stats:baseStats}).catch(error=>{pending=null;throw error;});}
export async function prepareLodgeChairsRoom(){
 const state=await prepareLodgeChairsBase(),b=state.local,key=LODGE_CHAIRS_KEY;
 ROOM_BOUNCE_DATA[key]=b.sky;ROOM_SECOND_BOUNCE_DATA[key]=b.secondSky;ROOM_TRANSPORT_DATA[key]=b.solar;ROOM_APERTURE_DATA[key]=b.apertures;ROOM_CONTACT_DATA[key]=state.contact;return b;
}
export async function loadLodgeChairsStates(stats={}){
 const base=await prepareLodgeChairsBase(),local=base.local,cross=base.cross;stats.base=baseStats;
 const modules=await loadLodgeDoorPackage({local,cross},{binding:delivery.delta,fallbackLoaders:loaders,stats});
 return {local,cross,modules};
}
