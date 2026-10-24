import manifest from '../../public/assets/v2/glb-transport-manifest.json' with {type:'json'};
import {LODGE_DINING_ASSET} from './lodge-opening.js';
import {ROOM_BOUNCE_DATA} from './room-bounce-registry.js';
import {ROOM_SECOND_BOUNCE_DATA} from './room-second-bounce-registry.js';
import {ROOM_TRANSPORT_DATA} from './room-transport-registry.js';
import {ROOM_APERTURE_DATA} from './room-aperture-registry.js';
import {ROOM_CONTACT_DATA} from './room-contact-registry.js';
export const LODGE_ROOM_KEY=LODGE_DINING_ASSET.sourceAsset;
export function validateLodgeRoom(source){
 if(source?.key!==LODGE_ROOM_KEY)throw new Error('Invalid dining room identity');
 const base=source.sky;
 if(base?.sourceGLB!=='assets/gh_lanchuan_lodge.glb'||base.sourceSHA256!==manifest.assets[base.sourceGLB]?.sha256)throw new Error('Dining original geometry source differs');
 if(JSON.stringify(base.openings)!==JSON.stringify(LODGE_DINING_ASSET.openings))throw new Error('Dining aperture identity differs');
 for(const name of ['secondSky','solar','secondSolar','apertures'])for(const p of ['sourceSHA256','blendSHA256','size','bounds','openings','validProbes'])if(JSON.stringify(source[name]?.[p])!==JSON.stringify(base[p]))throw new Error('Dining field source/grid differs: '+name+'/'+p);
 if(source.solar.directions.length!==81||source.secondSolar.directions.length!==81||source.secondSolar.bounceOrder!==2)throw new Error('Incomplete dining solar directions');
 if(source.apertures.encoding!=='u8-opening-slabs'||atob(source.apertures.data).length!==base.size.reduce((a,b)=>a*b,1)*6)throw new Error('Incomplete dining six-aperture visibility');
 for(const p of ['sourceSHA256','blendSHA256'])if(source.contact?.[p]!==base[p])throw new Error('Dining contact source differs');
 return source;
}
let pending;
export function prepareLodgeRoom(){
 return pending??=import('./lodge-room-data.js').then(m=>{
  const b=validateLodgeRoom(m.default),key=LODGE_ROOM_KEY;
  ROOM_BOUNCE_DATA[key]=b.sky;ROOM_SECOND_BOUNCE_DATA[key]=b.secondSky;ROOM_TRANSPORT_DATA[key]=b.solar;ROOM_APERTURE_DATA[key]=b.apertures;ROOM_CONTACT_DATA[key]=b.contact;return b;
 });
}
