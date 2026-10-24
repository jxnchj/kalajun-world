import source from './generated/guest-living-source-39.json' with {type:'json'};
export const GUEST_LIVING_SOURCE=Object.freeze(source);
export function guestLivingEnabled(search=globalThis.location?.search||''){const p=new URLSearchParams(search),explicit=p.get('guestLiving39'),on=explicit!=='0'&&p.get('guestVanity38')!=='0';if(explicit==='1'&&p.get('guestVanity38')==='0')throw Error('guestLiving39 requires the accepted vanity source');return on;}
