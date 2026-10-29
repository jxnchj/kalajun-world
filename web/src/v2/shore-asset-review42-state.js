import * as T from 'three';
import source from './generated/shore-rock05-bytes42.json' with {type:'json'};
// User-approved single representative stone. Review overrides never affect other IDs.
export const SHORE_ASSET_TARGET42='river-41711e76-99c57ca2:862:1';
let state,adopted;
export function shoreAssetEnabled42(search=globalThis.location?.search??''){return new URLSearchParams(search).get('shoreAsset42')!=='0';}
export function decodeShoreAssetGeometry42(){const geometry=new T.BufferGeometry(),types={5126:Float32Array,5123:Uint16Array,5125:Uint32Array};for(const[name,a]of Object.entries(source.attributes)){const text=atob(a.data),bytes=new Uint8Array(text.length);for(let i=0;i<text.length;i++)bytes[i]=text.charCodeAt(i);const array=new types[a.type](bytes.buffer);if(array.length!==a.count*a.itemSize)throw Error('Shore source byte count changed');const attribute=new T.BufferAttribute(array,a.itemSize);if(name==='index')geometry.setIndex(attribute);else geometry.setAttribute(name,attribute);}geometry.computeBoundingBox();geometry.computeBoundingSphere();return geometry;}
export function setShoreAssetReview42(value){if(value!==undefined&&value!==null&&(!value.geometry?.isBufferGeometry||(value.material!==null&&!value.material?.isMaterial)))throw Error('Complete shore asset required');state=value;}
export function getShoreAssetReview42(){if(state!==undefined)return state;if(!shoreAssetEnabled42())return null;if(!adopted)adopted={geometry:decodeShoreAssetGeometry42(),material:null,originalGeometry:null,adopted:true};return adopted;}
export function applyShoreAssetReview42(records){const selected=getShoreAssetReview42();if(!selected)return records;return records.map(r=>r.id===SHORE_ASSET_TARGET42?{...r,shoreAsset42:selected}:r);}

export function releaseShoreAssetMaterial42(material){if(adopted?.material===material)adopted.material=null;}
