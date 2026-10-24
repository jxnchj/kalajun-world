import fs from 'node:fs';
const tables={'room-bounce-data':'ROOM_BOUNCE_DATA','room-second-bounce-data':'ROOM_SECOND_BOUNCE_DATA','room-transport-data':'ROOM_TRANSPORT_DATA','room-contact-data':'ROOM_CONTACT_DATA','room-aperture-data':'ROOM_APERTURE_DATA'},dir='web/src/v2/';
const all={};for(const [file,key]of Object.entries(tables))all[key]=(await import('../'+dir+file+'.js'))[key];
const keys=['house_a','yurt','lanchuan-freedom-1','lanchuan-freedom-2','lanchuan-freedom-3'];fs.mkdirSync(dir+'legacy-room-data',{recursive:true});
for(const key of keys)fs.writeFileSync(dir+'legacy-room-data/'+key+'.js','// Exact existing baked data; split by room, no resampling.\nexport default '+JSON.stringify(Object.fromEntries(Object.entries(all).map(([table,data])=>[table,data[key]])))+';\n');
for(const [file,key]of Object.entries(tables))fs.writeFileSync(dir+file.replace('-data','-registry')+'.js',`// Stable mutable registry; default eager mode preserves synchronous consumers.\nimport {legacyRoomRegistry,prepareLegacyRoomsAtStartup} from './legacy-room-loader.js';\nexport const ${key}=legacyRoomRegistry.${key};\nawait prepareLegacyRoomsAtStartup();\n`);
console.log(JSON.stringify({rooms:keys,bytes:keys.reduce((n,k)=>n+fs.statSync(dir+'legacy-room-data/'+k+'.js').size,0)}));
