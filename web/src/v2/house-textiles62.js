import * as T from 'three';
export const HOUSE_TEXTILES62_NAMES=Object.freeze(['pastoral_house_felt_mattress','pastoral_house_bed_quilt','pastoral_house_bed_foot',...Array.from({length:4},(_,i)=>'pastoral_house_chest_folded'+i),'pastoral_house_chest_topcover','pastoral_house_bench_felt']);
export const houseTextiles62Enabled=(search=globalThis.location?.search??'')=>new URLSearchParams(search).get('houseTextiles62')==='1';
const hash=async a=>Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',new Uint8Array(a.array.buffer,a.array.byteOffset,a.array.byteLength))),x=>x.toString(16).padStart(2,'0')).join('');
const names={POSITION:'position',NORMAL:'normal',TEXCOORD_0:'uv',COLOR_0:'color',TANGENT:'tangent'};
// Atomic geometry-only replacement BEFORE timber48/furniture58 sentinel fields
// and assembly. Scope is deliberately the entire shared house_a asset family.
// The original motif/PBR material and every source object transform stay owned
// by the existing asset owner. No new samplers, textures, lamps or layout.
export async function prepareHouseTextiles62(assetId,scene,{enabled=false,loadManifest,loadAsset}={}){
 if(!enabled||assetId!=='house_a')return null;
 if(typeof loadAsset!=='function')throw Error('Textiles62 requires existing GLTF asset loader');
 const manifest=await(loadManifest??(async()=>{const r=await fetch('./assets/v2/house-textiles62/manifest.json');if(!r.ok)throw Error('Textiles62 manifest HTTP '+r.status);return r.json();}))();
 if(manifest.version!==62||manifest.nodes?.length!==9||new Set(manifest.nodes.map(n=>n.name)).size!==9||manifest.nodes.some(n=>!HOUSE_TEXTILES62_NAMES.includes(n.name)))throw Error('Textiles62 exact nine-node identity mismatch');
 const originals=[];
 for(const r of manifest.nodes){const n=scene.getObjectByName(T.PropertyBinding.sanitizeNodeName(r.name));if(!n?.isMesh||Array.isArray(n.material)||n.isSkinnedMesh||Object.keys(n.geometry.morphAttributes).length)throw Error('Textiles62 unsupported original '+r.name);
 for(const[k,h]of Object.entries(r.binding)){const a=k==='index'?n.geometry.index:n.geometry.attributes[names[k]];if(!a||await hash(a)!==h)throw Error('Textiles62 original differs '+r.name+'/'+k);}originals.push({node:n,original:n.geometry,record:r});}
 let asset,pending=[];const resources=new Set(),materials=new Set();
 try{
 asset=await loadAsset('./assets/v2/house-textiles62/geometry.glb');asset.scene.updateMatrixWorld(true);scene.updateMatrixWorld(true);
 asset.scene.traverse(n=>{if(n.isMesh){resources.add(n.geometry);for(const m of Array.isArray(n.material)?n.material:[n.material]){materials.add(m);}}});
 for(const m of materials)if(Object.values(m).some(v=>v?.isTexture))throw Error('Textiles62 geometry package must not load textures');
 const meshes=[];asset.scene.traverse(n=>{if(n.isMesh)meshes.push(n);});if(meshes.length!==9)throw Error('Textiles62 geometry count mismatch');
 for(const o of originals){const n=asset.scene.getObjectByName(T.PropertyBinding.sanitizeNodeName(o.record.name));if(!n?.isMesh)throw Error('Textiles62 missing candidate '+o.record.name);const g=n.geometry.clone();resources.add(g);
 for(const a of ['position','normal','uv','color'])if(!g.attributes[a]||!g.attributes[a].array.every(Number.isFinite))throw Error('Textiles62 missing/invalid '+a);if(!g.index||g.index.count%3||!g.index.array.every(i=>i<g.attributes.position.count))throw Error('Textiles62 requires complete triangles');for(const a of ['normal','uv','color'])if(g.attributes[a].count!==g.attributes.position.count)throw Error('Textiles62 attribute count mismatch');
 g.applyMatrix4(o.node.matrixWorld.clone().invert().multiply(n.matrixWorld));g.computeBoundingBox();g.computeBoundingSphere();pending.push({...o,geometry:g});}
 // No mutation until every binding, geometry and transform is validated.
 for(const p of pending){p.node.geometry=p.geometry;resources.delete(p.geometry);}
 for(const g of resources)g.dispose();for(const m of materials)m.dispose();
 let restored=false;return{stats:{enabled:true,scope:'house_a asset family',nodes:9,triangles:pending.reduce((n,p)=>n+p.geometry.index.count/3,0),texturesAdded:0,materialsBorrowed:true,originalGLBChanged:false},retiredGeometries:pending.map(p=>p.original),geometries:pending.map(p=>p.geometry),restore(){if(restored)return;for(const p of pending)if(p.node.geometry!==p.geometry)throw Error('Textiles62 restore owner mismatch');restored=true;for(const p of pending){p.node.geometry=p.original;p.geometry.dispose();}}};
 }catch(e){for(const g of resources)g.dispose();for(const m of materials)m.dispose();throw e;}
}
