import {selectTextileGI73} from './house-textiles-gi73.js';
import {legacyRooms} from './legacy-room-loader.js';
import manifest from '../../public/assets/v2/glb-transport-manifest.json' with {type:'json'};
import {ROOM_BOUNCE_DATA} from './room-bounce-registry.js';
import {ROOM_SECOND_BOUNCE_DATA} from './room-second-bounce-registry.js';
import {ROOM_TRANSPORT_DATA} from './room-transport-registry.js';
import {ROOM_CONTACT_DATA} from './room-contact-registry.js';
import {ROOM_APERTURE_DATA} from './room-aperture-registry.js';
import {HOUSEHOLD_ENTRY_ASSET,householdEntryMode} from './household-entry-steps.js';
import {householdYardsEnabled} from './household-yards.js';

export const householdRoomKey=(style,entityId)=>style===0&&entityId===HOUSEHOLD_ENTRY_ASSET.entityId&&householdYardsEnabled()&&householdEntryMode()==='editable'?HOUSEHOLD_ENTRY_ASSET.roomKey:'house_a-living-'+style;
export const isHouseholdRoomKey=key=>/^house_a-living-[012]$/.test(key||'')||key===HOUSEHOLD_ENTRY_ASSET.roomKey;
const loaders={
 'house_a-entry-tea-34':()=>selectTextileGI73('house_a-entry-tea-34',()=>import('./household-room-data/house_a-entry-tea-34.js').then(m=>m.default)),
 'house_a-living-0':()=>selectTextileGI73('house_a-living-0',()=>import('./household-room-data/house_a-living-0.js').then(m=>m.default)),
 'house_a-living-1':()=>selectTextileGI73('house_a-living-1',()=>import('./household-room-data/house_a-living-1.js').then(m=>m.default)),
 'house_a-living-2':()=>selectTextileGI73('house_a-living-2',()=>import('./household-room-data/house_a-living-2.js').then(m=>m.default)),
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
 const entityVariant=key===HOUSEHOLD_ENTRY_ASSET.roomKey;
 if(!isHouseholdRoomKey(key)||bundle?.key!==key||(entityVariant?(bundle.entityId!==HOUSEHOLD_ENTRY_ASSET.entityId||bundle.householdStyle!==0):(householdRoomKey(bundle.householdStyle)!==key||bundle.entityId!=null)))throw new Error('Invalid household room identity');
 const base=ROOM_BOUNCE_DATA.house_a,external=bundle.externalSources;
 const expectedExternal=['assets/v2/household_living.glb',...(entityVariant?['assets/'+HOUSEHOLD_ENTRY_ASSET.url]:[])];
 if(external?.length!==expectedExternal.length||expectedExternal.some((url,i)=>external[i].sourceGLB!==url||external[i].sourceSHA256!==manifest.assets[url]?.sha256))throw new Error('Household room outdoor geometry source differs');
 for(const f of [bundle.sky,bundle.secondSky,bundle.solar,bundle.secondSolar,bundle.apertures,...['sky','secondSky','solar','secondSolar','apertures'].map(k=>bundle.closed?.[k])]){
  if(!f)throw new Error('Incomplete household room field');
  for(const p of ['derivedGeometry','sourceSHA256','blendSHA256','bounds','size','openings','validProbes'])if(JSON.stringify(f[p])!==JSON.stringify(base[p]))throw new Error('Household indoor grid/source differs: '+p);
  if(f.householdStyle!==bundle.householdStyle||JSON.stringify(f.externalSources)!==JSON.stringify(external))throw new Error('Household field external sources differ');
 }
 const contact=bundle.contact;
 if(!contact||JSON.stringify(contact.derivedGeometry)!==JSON.stringify(base.derivedGeometry)||contact.sourceSHA256!==base.sourceSHA256||contact.blendSHA256!==base.blendSHA256||contact.householdStyle!==bundle.householdStyle||JSON.stringify(contact.externalSources)!==JSON.stringify(external))throw new Error('Household contact source differs');
 return bundle;
}
export function prepareHouseholdRoom(key){
 if(!loaders[key])return Promise.reject(new Error('Unknown household room '+key));
 if(!pending.has(key))pending.set(key,Promise.all([loaders[key](),legacyRooms.prepare('house_a')]).then(([source])=>{
  const bundle=validateHouseholdRoomBundle(source,key);
  ROOM_BOUNCE_DATA[key]=bundle.sky;ROOM_SECOND_BOUNCE_DATA[key]=bundle.secondSky;ROOM_TRANSPORT_DATA[key]=bundle.solar;ROOM_APERTURE_DATA[key]=bundle.apertures;ROOM_CONTACT_DATA[key]=bundle.contact;
  return bundle;
 }));
 return pending.get(key);
}
