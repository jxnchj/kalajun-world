export const FOREST_ROOT_BUNDLE_VERSION='forest-root-f64-v38';
export async function rootBytesSHA(bytes){
 const hash=await globalThis.crypto.subtle.digest('SHA-256',bytes);
 return Array.from(new Uint8Array(hash),v=>v.toString(16).padStart(2,'0')).join('');
}
export function encodeForestRootTile(tx,tz,records){
 if(records.length!==1024)throw new Error('Forest tile must retain every source slot');
 const count=records.filter(Boolean).length,bytes=new Uint8Array(144+count*48),v=new DataView(bytes.buffer);
 v.setInt32(0,tx,true);v.setInt32(4,tz,true);v.setUint32(8,count,true);v.setUint32(12,bytes.length,true);
 let offset=144;
 records.forEach((root,slot)=>{if(!root)return;
  const ix=tx*32+slot%32,iz=tz*32+Math.floor(slot/32);
  if(root.id!=='spruce:'+ix+':'+iz||Object.keys(root).join(',')!=='id,x,y,z,s,rot,variant')throw new Error('Root schema/identity changed');
  bytes[16+(slot>>3)]|=1<<(slot&7);
  for(const key of ['x','y','z','s','rot','variant']){if(!Number.isFinite(root[key]))throw new Error('Nonfinite root');v.setFloat64(offset,root[key],true);offset+=8;}
 });return bytes;
}
export async function decodeForestRootBundle(bytes,manifest){
 if(manifest.version!==FOREST_ROOT_BUNDLE_VERSION||bytes.byteLength!==manifest.rawBytes||await rootBytesSHA(bytes)!==manifest.rawSHA256)throw new Error('Forest root bundle bytes/version mismatch');
 const v=new DataView(bytes.buffer,bytes.byteOffset,bytes.byteLength);
 if(String.fromCharCode(...bytes.subarray(0,4))!=='FR38'||v.getUint32(4,true)!==1||v.getUint32(8,true)!==manifest.tiles.length||v.getUint32(12,true)!==manifest.trees)throw new Error('Forest root bundle header mismatch');
 let end=16,total=0;const tiles=new Map();
 for(const entry of manifest.tiles){
  if(entry.offset!==end||entry.bytes<144||entry.offset+entry.bytes>bytes.length)throw new Error('Forest root tile boundaries mismatch');
  const part=bytes.subarray(entry.offset,entry.offset+entry.bytes);
  if(await rootBytesSHA(part)!==entry.sha256)throw new Error('Forest root tile checksum mismatch');
  const view=new DataView(part.buffer,part.byteOffset,part.byteLength),tx=view.getInt32(0,true),tz=view.getInt32(4,true),count=view.getUint32(8,true);
  if(tx!==entry.tx||tz!==entry.tz||count!==entry.trees||view.getUint32(12,true)!==part.length||part.length!==144+count*48||tiles.has(tx+','+tz))throw new Error('Forest root tile identity/count mismatch');
  const ranks=new Int16Array(1024);ranks.fill(-1);let rank=0;
  for(let slot=0;slot<1024;slot++)if(part[16+(slot>>3)]&(1<<(slot&7))){
   ranks[slot]=rank;
   const offset=144+rank*48;
   for(let k=0;k<6;k++)if(!Number.isFinite(view.getFloat64(offset+k*8,true)))throw new Error('Forest root nonfinite record');
   const scale=view.getFloat64(offset+24,true),variant=view.getFloat64(offset+40,true);
   if(scale<=0||variant<0||variant>4||!Number.isInteger(variant))throw new Error('Forest root appearance mismatch');
   rank++;
  }
  if(rank!==count)throw new Error('Forest root occupancy/count mismatch');
  tiles.set(tx+','+tz,{tx,tz,view,ranks,records:new Array(1024)});total+=count;end+=entry.bytes;
 }
 if(end!==bytes.length||total!==manifest.trees)throw new Error('Forest root bundle tree count mismatch');
 return tiles;
}
export function forestRootFromTile(tile,ix,iz){
 const slot=(iz-tile.tz*32)*32+ix-tile.tx*32;if(slot<0||slot>=1024)throw new Error('Forest root slot outside tile');
 if(tile.records[slot]!==undefined)return tile.records[slot];
 const rank=tile.ranks[slot];if(rank<0)return tile.records[slot]=null;
 const o=144+rank*48,v=tile.view;
 return tile.records[slot]={id:'spruce:'+ix+':'+iz,x:v.getFloat64(o,true),y:v.getFloat64(o+8,true),z:v.getFloat64(o+16,true),s:v.getFloat64(o+24,true),rot:v.getFloat64(o+32,true),variant:v.getFloat64(o+40,true)};
}
