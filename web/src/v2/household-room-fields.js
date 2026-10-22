import manifest from '../../public/assets/v2/glb-transport-manifest.json' with {type:'json'};
import {ROOM_BOUNCE_DATA} from './room-bounce-data.js';
import {ROOM_SECOND_BOUNCE_DATA} from './room-second-bounce-data.js';
import {ROOM_TRANSPORT_DATA} from './room-transport-data.js';
import {ROOM_CONTACT_DATA} from './room-contact-data.js';
import {ROOM_APERTURE_DATA} from './room-aperture-data.js';

export const householdRoomKey=style=>'house_a-living-'+style;
export const isHouseholdRoomKey=key=>/^house_a-living-[012]$/.test(key||'');
const loaders={
 'house_a-living-0':()=>import('./household-room-data/house_a-living-0.js').then(m=>m.default),
 'house_a-living-1':()=>import('./household-room-data/house_a-living-1.js').then(m=>m.default),
 'house_a-living-2':()=>import('./household-room-data/house_a-living-2.js').then(m=>m.default),
};
const pending=new Map();
// Existing room maps remain authoritative. Only the occupied household variant
// is imported; outdoor/forest startup does not fetch all three transfer sets.
export function validateHouseholdRoomBundle(source,key=source?.key){
 const bundle={...source};
 const bases={sky:ROOM_BOUNCE_DATA,secondSky:ROOM_SECOND_BOUNCE_DATA,solar:ROOM_TRANSPORT_DATA,contact:ROOM_CONTACT_DATA,apertures:ROOM_APERTURE_DATA};
 for(const [name,data] of Object.entries(bases))if(bundle[name]?.reusePayload){
  if(bundle[name].reusePayload!=="house_a")throw new Error("Invalid household payload reference");
  const base=data.house_a,payload=name==="solar"?"directions":"data";bundle[name]={...bundle[name],[payload]:base[payload]};
 }
 if(!isHouseholdRoomKey(key)||bundle?.key!==key||householdRoomKey(bundle.householdStyle)!==key)throw new Error('Invalid household room identity');
 const base=ROOM_BOUNCE_DATA.house_a,external=bundle.externalSources;
 if(external?.length!==1||external[0].sourceGLB!=='assets/v2/household_living.glb'||external[0].sourceSHA256!==manifest.assets[external[0].sourceGLB]?.sha256)throw new Error('Household room outdoor geometry source differs');
 for(const f of [bundle.sky,bundle.secondSky,bundle.solar,bundle.secondSolar,bundle.apertures,...['sky','secondSky','solar','secondSolar','apertures'].map(k=>bundle.closed?.[k])]){
  if(!f)throw new Error('Incomplete household room field');
  for(const p of ['sourceSHA256','blendSHA256','bounds','size','openings','validProbes'])if(JSON.stringify(f[p])!==JSON.stringify(base[p]))throw new Error('Household indoor grid/source differs: '+p);
  if(f.householdStyle!==bundle.householdStyle||JSON.stringify(f.externalSources)!==JSON.stringify(external))throw new Error('Household field external sources differ');
 }
 const contact=bundle.contact;
 if(!contact||contact.sourceSHA256!==base.sourceSHA256||contact.blendSHA256!==base.blendSHA256||contact.householdStyle!==bundle.householdStyle||JSON.stringify(contact.externalSources)!==JSON.stringify(external))throw new Error('Household contact source differs');
 return bundle;
}
export function prepareHouseholdRoom(key){
 if(!loaders[key])return Promise.reject(new Error('Unknown household room '+key));
 if(!pending.has(key))pending.set(key,loaders[key]().then(source=>{
  const bundle=validateHouseholdRoomBundle(source,key);
  ROOM_BOUNCE_DATA[key]=bundle.sky;ROOM_SECOND_BOUNCE_DATA[key]=bundle.secondSky;ROOM_TRANSPORT_DATA[key]=bundle.solar;ROOM_APERTURE_DATA[key]=bundle.apertures;ROOM_CONTACT_DATA[key]=bundle.contact;
  return bundle;
 }));
 return pending.get(key);
}
