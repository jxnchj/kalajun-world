import {SETTLEMENT_ASSETS} from './settlement-assets.js';
import {decodeGzipBytes} from './world-data.js';
export const pastureLife41Enabled=()=>new URLSearchParams(globalThis.location?.search||'').get('pastureLife41')!=='0';
// Small flat test worlds and regions without the pastoral anchor have no station.
export const pastureLife41Available=world=>pastureLife41Enabled()&&Array.isArray(world?.entities)&&world.entities.some(e=>e.id===SETTLEMENT_ASSETS.yurt.representativeId)&&!!world.objects&&typeof world.landcoverAt==='function'&&typeof world.surface?.heightAt==='function'&&typeof world.surface?.normalAt==='function';
// Independent, interpreted pastoral work station; original flock stays intact.
export function pastureLife41Site(world,layout){
 const x=layout.x-13,z=layout.z+3,y=world.surface.heightAt(x,z)+.012;
 return {x,y,z,yaw:0};
}
export function pastureLife41Colliders(world,layout){
 const p=pastureLife41Site(world,layout);
 return [{id:'pasture-life41-trough',x:p.x,y:p.y+.31,z:p.z,hx:1.29,hy:.24,hz:.34,yaw:0},{id:'pasture-life41-rack',x:p.x-1.73,y:p.y+.36,z:p.z+.95,hx:.41,hy:.38,hz:.31,yaw:0}];
}
export async function loadPastureLife41(world,layout,loader,{fetchImpl=globalThis.fetch}={}){
 const url=world.assetBase+'v2/pasture-life41.glb.gz',r=await fetchImpl(url);
 if(!r.ok)throw new Error('Pasture service asset request failed: '+r.status);
 const transport=new Uint8Array(await r.arrayBuffer()),bytes=await decodeGzipBytes(transport),gltf=await loader.parseAsync(bytes.buffer.slice(bytes.byteOffset,bytes.byteOffset+bytes.byteLength),world.assetBase+'v2/');
 const root=gltf.scene,p=pastureLife41Site(world,layout);root.name='pasture-service41';root.position.set(p.x,p.y,p.z);
 let triangles=0,meshes=0;const materials=new Set();root.traverse(o=>{if(!o.isMesh)return;o.castShadow=o.receiveShadow=true;meshes++;triangles+=(o.geometry.index?.count??o.geometry.attributes.position.count)/3;for(const m of Array.isArray(o.material)?o.material:[o.material])materials.add(m);});
 const stats={ready:true,triangles,meshes,transportBytes:transport.byteLength,decodedBytes:bytes.byteLength,site:p,colliders:pastureLife41Colliders(world,layout),quality:'Blender source; browser contact and walking accepted; static contained water'};
 return {root,stats,materials:[...materials]};
}
