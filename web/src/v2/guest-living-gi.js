import {GUEST_LIVING_SOURCE,guestLivingEnabled} from './guest-living-definition.js';
import {ROOM_BOUNCE_DATA} from './room-bounce-registry.js';
import {ROOM_SECOND_BOUNCE_DATA} from './room-second-bounce-registry.js';
import {ROOM_TRANSPORT_DATA} from './room-transport-registry.js';
import {ROOM_APERTURE_DATA} from './room-aperture-registry.js';
import {ROOM_CONTACT_DATA} from './room-contact-registry.js';
export const GUEST_LIVING_GI_SOURCE=Object.freeze({...GUEST_LIVING_SOURCE,sourceBlend:'assets/src/v2/settlements/guest-living39/lanchuan-living39.blend',blendSHA256:'a1d99484eb8c35864e4517f912d51baa1f90197de3becf78a69aea3a3577920b'});
export const isGuestLivingRoomKey=key=>/^lanchuan-freedom-[123]-living39$/.test(key??'');
export const guestLivingRoomKey=(key,enabled=guestLivingEnabled())=>enabled&&/^lanchuan-freedom-[123]$/.test(key)?key+'-living39':key;
const loaders={
 'lanchuan-freedom-1-living39':()=>import('./guest-living-gi-data/1.js').then(m=>m.default),
 'lanchuan-freedom-2-living39':()=>import('./guest-living-gi-data/2.js').then(m=>m.default),
 'lanchuan-freedom-3-living39':()=>import('./guest-living-gi-data/3.js').then(m=>m.default),
};
export function validateGuestLivingGI(key,bundle){
 if(!isGuestLivingRoomKey(key)||bundle?.key!==key)throw Error('Guest living room key mismatch');
 const base=bundle.sky;
 for(const name of ['sky','secondSky','solar','secondSolar','fixtures','secondFixtures','contact','apertures']){
  const field=bundle[name];if(!field)throw Error('Incomplete guest living GI: '+name);
  for(const prop of ['sourceGLB','sourceSHA256','sourceBlend','blendSHA256'])if(field[prop]!==GUEST_LIVING_GI_SOURCE[prop])throw Error('Guest living source mismatch: '+name+'/'+prop);
  if(name!=='contact')for(const prop of ['bounds','size','validProbes','openings'])if(JSON.stringify(field[prop])!==JSON.stringify(base[prop]))throw Error('Guest living grid mismatch: '+name+'/'+prop);
 }
 if(JSON.stringify(base.size)!=='[9,5,9]'||base.samples!==96||bundle.secondSky.surfaceSamples!==32||bundle.secondSolar.surfaceSamples!==32||bundle.definition.excludedBounds)throw Error('Guest living receiver/sample contract differs');
 for(const name of ['solar','secondSolar'])if(bundle[name].directions.length!==81||bundle[name].azimuths!==16)throw Error('Guest living solar directions incomplete');
 for(const [name,order]of [['fixtures',1],['secondFixtures',2]])if(bundle[name].bounceOrder!==order||bundle[name].fixtures.length!==3||bundle[name].directions.length!==3)throw Error('Guest living fixture order incomplete');
 if(bundle.contact.spacing!==.025||bundle.contact.samples!==64||bundle.apertures.apertureSamples!==36)throw Error('Guest living contact/aperture contract differs');
 return bundle;
}
const pending=new Map();
export function prepareGuestLivingRoom(key){
 if(!loaders[key])return Promise.reject(Error('Unknown guest living room '+key));
 if(pending.has(key))return pending.get(key);
 const promise=loaders[key]().then(b=>{
  validateGuestLivingGI(key,b);
  // Publish only a fully source-checked candidate. Old room keys never change.
  ROOM_BOUNCE_DATA[key]=b.sky;ROOM_SECOND_BOUNCE_DATA[key]=b.secondSky;ROOM_TRANSPORT_DATA[key]=b.solar;ROOM_APERTURE_DATA[key]=b.apertures;ROOM_CONTACT_DATA[key]=b.contact;return b;
 }).catch(error=>{pending.delete(key);throw error;});pending.set(key,promise);return promise;
}
