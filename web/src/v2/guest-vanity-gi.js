import {guestLivingEnabled} from './guest-living-definition.js';
import {isGuestLivingRoomKey,guestLivingRoomKey,prepareGuestLivingRoom} from './guest-living-gi.js';
import {GUEST_VANITY_SOURCE,guestVanityEnabled} from './guest-vanity-definition.js';
import {ROOM_BOUNCE_DATA} from './room-bounce-registry.js';
import {ROOM_SECOND_BOUNCE_DATA} from './room-second-bounce-registry.js';
import {ROOM_TRANSPORT_DATA} from './room-transport-registry.js';
import {ROOM_APERTURE_DATA} from './room-aperture-registry.js';
import {ROOM_CONTACT_DATA} from './room-contact-registry.js';
export const GUEST_VANITY_GI_SOURCE=Object.freeze({...GUEST_VANITY_SOURCE,sourceBlend:'assets/src/v2/settlements/guest-vanity-v38/lanchuan-vanity.blend',blendSHA256:'0418790225b7113dec526e3ae176325dd589323a57f6e194789ae5a7ca794f2e'});
export const isGuestVanityRoomKey=key=>(/^lanchuan-freedom-[123]-vanity38$/.test(key??'')||isGuestLivingRoomKey(key));
export const guestVanityRoomKey=(key,enabled=guestVanityEnabled())=>guestLivingEnabled()?guestLivingRoomKey(key):enabled&&/^lanchuan-freedom-[123]$/.test(key)?key+'-vanity38':key;
const loaders={
 'lanchuan-freedom-1-vanity38':()=>import('./guest-vanity-gi-data/1.js').then(m=>m.default),
 'lanchuan-freedom-2-vanity38':()=>import('./guest-vanity-gi-data/2.js').then(m=>m.default),
 'lanchuan-freedom-3-vanity38':()=>import('./guest-vanity-gi-data/3.js').then(m=>m.default),
};
export function validateGuestVanityGI(key,bundle){
 if(!isGuestVanityRoomKey(key)||bundle?.key!==key)throw Error('Guest vanity room key mismatch');
 const base=bundle.sky;
 for(const name of ['sky','secondSky','solar','secondSolar','fixtures','secondFixtures','contact','apertures']){
  const field=bundle[name];if(!field)throw Error('Incomplete guest vanity GI: '+name);
  for(const prop of ['sourceGLB','sourceSHA256','sourceBlend','blendSHA256'])if(field[prop]!==GUEST_VANITY_GI_SOURCE[prop])throw Error('Guest vanity source mismatch: '+name+'/'+prop);
  if(name!=='contact')for(const prop of ['bounds','size','validProbes','openings'])if(JSON.stringify(field[prop])!==JSON.stringify(base[prop]))throw Error('Guest vanity grid mismatch: '+name+'/'+prop);
 }
 if(JSON.stringify(base.size)!=='[9,5,9]'||base.samples!==96||bundle.secondSky.surfaceSamples!==32||bundle.secondSolar.surfaceSamples!==32||bundle.definition.excludedBounds)throw Error('Guest vanity receiver/sample contract differs');
 for(const name of ['solar','secondSolar'])if(bundle[name].directions.length!==81||bundle[name].azimuths!==16)throw Error('Guest vanity solar directions incomplete');
 for(const [name,order]of [['fixtures',1],['secondFixtures',2]])if(bundle[name].bounceOrder!==order||bundle[name].fixtures.length!==3||bundle[name].directions.length!==3)throw Error('Guest vanity fixture order incomplete');
 if(bundle.contact.spacing!==.025||bundle.contact.samples!==64||bundle.apertures.apertureSamples!==36)throw Error('Guest vanity contact/aperture contract differs');
 return bundle;
}
const pending=new Map();
export function prepareGuestVanityRoom(key){
 if(isGuestLivingRoomKey(key))return prepareGuestLivingRoom(key);
 if(!loaders[key])return Promise.reject(Error('Unknown guest vanity room '+key));
 if(pending.has(key))return pending.get(key);
 const promise=loaders[key]().then(b=>{
  validateGuestVanityGI(key,b);
  // Publish only a fully source-checked candidate. Old room keys never change.
  ROOM_BOUNCE_DATA[key]=b.sky;ROOM_SECOND_BOUNCE_DATA[key]=b.secondSky;ROOM_TRANSPORT_DATA[key]=b.solar;ROOM_APERTURE_DATA[key]=b.apertures;ROOM_CONTACT_DATA[key]=b.contact;return b;
 }).catch(error=>{pending.delete(key);throw error;});pending.set(key,promise);return promise;
}
