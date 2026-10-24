import source from './generated/guest-vanity-source-38.json' with {type:'json'};
export const GUEST_VANITY_SOURCE=Object.freeze(source);
export const guestVanityEnabled=(search=globalThis.location?.search||'')=>new URLSearchParams(search).get('guestVanity38')!=='0';
export const isGuestVanityMesh=name=>/^freedom[123]_craft38_/.test(name);
