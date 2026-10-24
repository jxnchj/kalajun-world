import manifest from '../../public/assets/v2/glb-transport-manifest.json' with {type:'json'};
import delivery from './lodge-whole-package.json' with {type:'json'};
import {LODGE_WHOLE_KEY,LODGE_WHOLE_ASSET,LODGE_WHOLE_GRID} from './lodge-whole-definition.js';
import {validateLodgeDoorGI} from './lodge-door-gi.js';
import {lodgeSHA} from './lodge-door-codec.js';
import {loadLodgeDoorPackage} from './lodge-door-package.js';
import {ROOM_BOUNCE_DATA} from './room-bounce-registry.js';
import {ROOM_SECOND_BOUNCE_DATA} from './room-second-bounce-registry.js';
import {ROOM_TRANSPORT_DATA} from './room-transport-registry.js';
import {ROOM_APERTURE_DATA} from './room-aperture-registry.js';
import {ROOM_CONTACT_DATA} from './room-contact-registry.js';
const loaders=[()=>import('./lodge-whole-data/0.js'),()=>import('./lodge-whole-data/1.js'),()=>import('./lodge-whole-data/2.js')];
export function validateLodgeWholeBase(state){
 const base=state?.local?.sky;
 if(base?.sourceGLB!=='assets/gh_lanchuan_lodge.glb'||base.sourceSHA256!==manifest.assets[base.sourceGLB]?.sha256)throw Error('Whole lodge source differs');
 for(const [name,value]of Object.entries({size:LODGE_WHOLE_GRID.size,bounds:LODGE_WHOLE_GRID.bounds,openings:LODGE_WHOLE_ASSET.openings}))if(JSON.stringify(base[name])!==JSON.stringify(value))throw Error('Whole lodge receiver differs: '+name);
 for(const name of ['sourceSHA256','blendSHA256'])if(state.contact?.[name]!==base[name])throw Error('Whole lodge contact source differs');
 if(state.contact.spacing!==.025||state.contact.samples!==64)throw Error('Whole lodge contact resolution differs');
 validateLodgeDoorGI(state,0,state.local,state.cross,LODGE_WHOLE_KEY);return state;
}
export async function loadLodgeWholeBase({fetchImpl=(...args)=>globalThis.fetch(...args),binding=delivery.base,fallback=loaders[0],stats={}}={}){
 try{
  const response=await fetchImpl('./'+binding.url+'?v='+binding.sha256);if(!response.ok)throw Error('Whole lodge base HTTP '+response.status);
  const input=new Uint8Array(await response.arrayBuffer()),gzip=input[0]===31&&input[1]===139;
  if(input.length!==(gzip?binding.gzipBytes:binding.rawBytes)||await lodgeSHA(input)!==(gzip?binding.sha256:binding.rawSHA256))throw Error('Whole lodge base transport checksum mismatch');
  const raw=gzip?new Uint8Array(await new Response(new Blob([input]).stream().pipeThrough(new DecompressionStream('gzip'))).arrayBuffer()):input;
  if(raw.length!==binding.rawBytes||await lodgeSHA(raw)!==binding.rawSHA256)throw Error('Whole lodge base raw checksum mismatch');
  const parseStart=performance.now(),state=validateLodgeWholeBase(JSON.parse(new TextDecoder().decode(raw)));Object.assign(stats,{status:'gzip-base',parseAndValidateMs:performance.now()-parseStart,responseBytes:input.length,compressedBytes:binding.gzipBytes,rawBytes:binding.rawBytes});return state;
 }catch(e){Object.assign(stats,{status:'fallback',reason:String(e?.message??e)});return validateLodgeWholeBase((await fallback()).default);}
}
let pending;
const baseStats={};
export function prepareLodgeWholeBase(){return pending??=loadLodgeWholeBase({stats:baseStats});}
export async function prepareLodgeWholeRoom(){
 const state=await prepareLodgeWholeBase(),b=state.local,key=LODGE_WHOLE_KEY;
 ROOM_BOUNCE_DATA[key]=b.sky;ROOM_SECOND_BOUNCE_DATA[key]=b.secondSky;ROOM_TRANSPORT_DATA[key]=b.solar;ROOM_APERTURE_DATA[key]=b.apertures;ROOM_CONTACT_DATA[key]=state.contact;return b;
}
export async function loadLodgeWholeStates(stats={}){
 const base=await prepareLodgeWholeBase(),local=base.local,cross=base.cross;stats.base=baseStats;
 const modules=await loadLodgeDoorPackage({local,cross},{binding:delivery.delta,fallbackLoaders:loaders,stats});
 return {local,cross,modules};
}
