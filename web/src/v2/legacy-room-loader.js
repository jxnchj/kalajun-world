export const legacyRoomLazyEnabled=(search=globalThis.location?.search||'')=>new URLSearchParams(search).get('legacyRoomLazy')==='1';
export const LEGACY_ROOM_KEYS=Object.freeze(['house_a','yurt','lanchuan-freedom-1','lanchuan-freedom-2','lanchuan-freedom-3']);
export const LEGACY_ROOM_TABLES=Object.freeze(['ROOM_BOUNCE_DATA','ROOM_SECOND_BOUNCE_DATA','ROOM_TRANSPORT_DATA','ROOM_CONTACT_DATA','ROOM_APERTURE_DATA']);
const loaders={
 house_a:()=>import('./legacy-room-data/house_a.js').then(m=>m.default),
 yurt:()=>import('./legacy-room-data/yurt.js').then(m=>m.default),
 'lanchuan-freedom-1':()=>import('./legacy-room-data/lanchuan-freedom-1.js').then(m=>m.default),
 'lanchuan-freedom-2':()=>import('./legacy-room-data/lanchuan-freedom-2.js').then(m=>m.default),
 'lanchuan-freedom-3':()=>import('./legacy-room-data/lanchuan-freedom-3.js').then(m=>m.default),
};
export function createLegacyRoomLoader({loaders:source=loaders,registry=Object.fromEntries(LEGACY_ROOM_TABLES.map(k=>[k,{}]))}={}){
 const pending=new Map(),ready=new Set(),stats={requests:0,loadedRooms:0,failures:0,loads:[]};
 function prepare(key){
  if(!source[key]||ready.has(key))return Promise.resolve();if(pending.has(key))return pending.get(key);
  const timing={key,startMs:performance.now(),endMs:null,status:'pending'};stats.requests++;stats.loads.push(timing);
  const p=Promise.resolve().then(source[key]).then(bundle=>{
   // Validate all five before publishing any: never expose a partial room.
   for(const name of LEGACY_ROOM_TABLES)if(!bundle?.[name]?.sourceSHA256||!bundle[name].size)throw Error('Incomplete legacy room bundle '+key+'/'+name);
   const base=bundle.ROOM_BOUNCE_DATA;for(const name of LEGACY_ROOM_TABLES)if(bundle[name].sourceSHA256!==base.sourceSHA256)throw Error('Legacy room source differs '+key+'/'+name);
   for(const name of LEGACY_ROOM_TABLES)registry[name][key]=bundle[name];ready.add(key);stats.loadedRooms=ready.size;timing.status='complete';
  }).catch(error=>{stats.failures++;timing.status='failed';timing.error=error.message;throw error;}).finally(()=>{timing.endMs=performance.now();pending.delete(key);});
  pending.set(key,p);return p;
 }
 return {registry,prepare,ready,stats};
}
export const legacyRooms=createLegacyRoomLoader();
export const legacyRoomRegistry=legacyRooms.registry;
let eager;
export const prepareLegacyRoomsAtStartup=()=>legacyRoomLazyEnabled()?Promise.resolve():(eager??=Promise.all(LEGACY_ROOM_KEYS.map(key=>legacyRooms.prepare(key))).catch(error=>{eager=null;throw error;}));
