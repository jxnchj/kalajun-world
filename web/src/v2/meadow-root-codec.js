import {rootBytesSHA} from './forest-root-codec.js';
export const MEADOW_ROOT_VERSION='meadow-final-roots-fields-v38';
const negativeZero='~meadow-negative-zero';
export const sourceCells=(tx,tz,size=24,cell=.8)=>{
 const cells=[];for(let iz=Math.floor(tz*size/cell);iz<Math.ceil((tz+1)*size/cell);iz++)for(let ix=Math.floor(tx*size/cell);ix<Math.ceil((tx+1)*size/cell);ix++)cells.push([ix,iz]);return cells;
};
export function encodeMeadowRoots(tiles){
 const fields=[],directory=[];
 for(const tile of tiles){
  const cells=sourceCells(tile.tx,tile.tz);if(tile.slots.length!==cells.length)throw new Error('Meadow source slot count mismatch');
  const slots=tile.slots.map(entry=>{
   if(entry===null||entry===true)return entry;
   if(entry.fields.length!==12)throw new Error('Meadow field count mismatch');
   const offset=fields.length;fields.push(...entry.fields);return [entry.root,offset];
  });directory.push({tx:tile.tx,tz:tile.tz,slots});
 }
 const json=new TextEncoder().encode(JSON.stringify(directory,(_k,v)=>Object.is(v,-0)?negativeZero:v));
 const offset=Math.ceil((16+json.length)/4)*4,bytes=new Uint8Array(offset+fields.length*4),v=new DataView(bytes.buffer);
 bytes.set(new TextEncoder().encode('MR38'));v.setUint32(4,json.length,true);v.setUint32(8,fields.length,true);v.setUint32(12,directory.length,true);bytes.set(json,16);
 fields.forEach((value,i)=>v.setFloat32(offset+i*4,value,true));return bytes;
}
export async function decodeMeadowRoots(bytes,manifest){
 if(manifest.version!==MEADOW_ROOT_VERSION||bytes.length!==manifest.rawBytes||await rootBytesSHA(bytes)!==manifest.rawSHA256)throw new Error('Meadow cache checksum/version mismatch');
 const v=new DataView(bytes.buffer,bytes.byteOffset,bytes.byteLength);
 if(bytes.length<16||String.fromCharCode(...bytes.subarray(0,4))!=='MR38')throw new Error('Meadow cache header mismatch');
 const n=v.getUint32(4,true),count=v.getUint32(8,true),offset=Math.ceil((16+n)/4)*4;
 if(offset+count*4!==bytes.length)throw new Error('Meadow cache boundaries mismatch');
 const directory=JSON.parse(new TextDecoder().decode(bytes.subarray(16,16+n)),(_k,value)=>value===negativeZero?-0:value),tiles=new Map();let cursor=0,roots=0,procedural=0;
 if(directory.length!==v.getUint32(12,true)||directory.length!==manifest.tiles)throw new Error('Meadow cache tile count mismatch');
 for(const tile of directory){
  if(!Number.isInteger(tile.tx)||!Number.isInteger(tile.tz)||tiles.has(tile.tx+','+tile.tz))throw new Error('Meadow cache tile identity mismatch');
  const cells=sourceCells(tile.tx,tile.tz);if(tile.slots.length!==cells.length)throw new Error('Meadow cache source count mismatch');
  tile.slots=tile.slots.map((entry,index)=>{
   if(entry===null)return null;if(entry===true){procedural++;return true;}
   const [root,at]=entry;if(at!==cursor||root.id!=='grass:'+cells[index].join(':'))throw new Error('Meadow root identity/order mismatch');
   for(const key of ['x','y','z','s','sy','rot'])if(!Number.isFinite(root[key]))throw new Error('Meadow root value mismatch');
   if(root.s<=0||root.sy<=0||root.brookAsset)throw new Error('Meadow root representation mismatch');
   const fields=new Float32Array(12);for(let i=0;i<12;i++){const value=v.getFloat32(offset+(at+i)*4,true);if(!Number.isFinite(value))throw new Error('Meadow field value mismatch');fields[i]=value;}
   roots++;cursor+=12;return {root,fields};
  });tiles.set(tile.tx+','+tile.tz,tile);
 }
 if(cursor!==count||roots!==manifest.roots||procedural!==manifest.procedural)throw new Error('Meadow final record count mismatch');return tiles;
}
