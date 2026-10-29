import manifest from '../../public/assets/v2/house-textiles62/manifest.json' with {type:'json'};
// Same explicit option as geometry; original data remain the OFF path.
export const textileGI73Enabled=(search=globalThis.location?.search??'')=>new URLSearchParams(search).get('houseTextiles62')==='1';
const loaders={
 'house_a':()=>import('./house-textiles-gi73-data/house_a.js').then(m=>m.default),
 'house_a-30':()=>import('./house-textiles-gi73-data/house_a-30.js').then(m=>m.default),
 'house_a-60':()=>import('./house-textiles-gi73-data/house_a-60.js').then(m=>m.default),
 'house_a-90':()=>import('./house-textiles-gi73-data/house_a-90.js').then(m=>m.default),
 'house_a-living-0':()=>import('./house-textiles-gi73-data/house_a-living-0.js').then(m=>m.default),
 'house_a-living-0-30':()=>import('./house-textiles-gi73-data/house_a-living-0-30.js').then(m=>m.default),
 'house_a-living-0-60':()=>import('./house-textiles-gi73-data/house_a-living-0-60.js').then(m=>m.default),
 'house_a-living-0-90':()=>import('./house-textiles-gi73-data/house_a-living-0-90.js').then(m=>m.default),
 'house_a-living-1':()=>import('./house-textiles-gi73-data/house_a-living-1.js').then(m=>m.default),
 'house_a-living-1-30':()=>import('./house-textiles-gi73-data/house_a-living-1-30.js').then(m=>m.default),
 'house_a-living-1-60':()=>import('./house-textiles-gi73-data/house_a-living-1-60.js').then(m=>m.default),
 'house_a-living-1-90':()=>import('./house-textiles-gi73-data/house_a-living-1-90.js').then(m=>m.default),
 'house_a-living-2':()=>import('./house-textiles-gi73-data/house_a-living-2.js').then(m=>m.default),
 'house_a-living-2-30':()=>import('./house-textiles-gi73-data/house_a-living-2-30.js').then(m=>m.default),
 'house_a-living-2-60':()=>import('./house-textiles-gi73-data/house_a-living-2-60.js').then(m=>m.default),
 'house_a-living-2-90':()=>import('./house-textiles-gi73-data/house_a-living-2-90.js').then(m=>m.default),
 'house_a-entry-tea-34':()=>import('./house-textiles-gi73-data/house_a-entry-tea-34.js').then(m=>m.default),
 'house_a-entry-tea-34-30':()=>import('./house-textiles-gi73-data/house_a-entry-tea-34-30.js').then(m=>m.default),
 'house_a-entry-tea-34-60':()=>import('./house-textiles-gi73-data/house_a-entry-tea-34-60.js').then(m=>m.default),
 'house_a-entry-tea-34-90':()=>import('./house-textiles-gi73-data/house_a-entry-tea-34-90.js').then(m=>m.default),
};
export function validateTextileGI73(bundle){
 const expected=manifest.geometrySHA256,names=manifest.nodes.map(n=>n.name);
 function check(f){const d=f?.derivedGeometry;if(d?.kind!=='house-textiles62'||d.geometrySHA256!==expected||d.sourceSHA256!==manifest.sourceSHA256||JSON.stringify(d.nodes)!==JSON.stringify(names))throw Error('Textile GI derived geometry differs');}
 check(bundle);for(const k of ['sky','secondSky','solar','secondSolar','apertures'])check(bundle[k]);if(bundle.contact)check(bundle.contact);if(bundle.closed)validateTextileGI73(bundle.closed);return bundle;
}
export async function selectTextileGI73(key,fallback,{part=null,degree=null,enabled=textileGI73Enabled(),loaders:source=loaders}={}){
 if(!enabled||!key.startsWith('house_a'))return fallback();
 const name=key+(degree==null?'':'-'+degree),load=source[name];if(!load)throw Error('Missing textile GI '+name);
 const bundle=validateTextileGI73(await load());
 if(part==='legacy')return{ROOM_BOUNCE_DATA:bundle.sky,ROOM_SECOND_BOUNCE_DATA:bundle.secondSky,ROOM_TRANSPORT_DATA:bundle.solar,ROOM_CONTACT_DATA:bundle.contact,ROOM_APERTURE_DATA:bundle.apertures};
 if(part){if(!bundle[part])throw Error('Incomplete textile GI '+part);return bundle[part];}return bundle;
}
