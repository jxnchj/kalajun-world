import {Float32BufferAttribute} from 'three';
export function stoneOcclusionEnabled(search=globalThis.location?.search||''){return new URLSearchParams(search).get('stoneOcclusion')!=='0';}
async function digest(a){return Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',new Uint8Array(a.array.buffer,a.array.byteOffset,a.array.byteLength))),v=>v.toString(16).padStart(2,'0')).join('');}
export async function validateStoneOcclusion(g,data){
 if(g.attributes.position.count!==data.vertexCount)throw Error('Stone occlusion vertex count mismatch');
 for(const[a,hash]of [[g.attributes.position,data.positionSHA256],[g.attributes.normal,data.normalSHA256],[g.attributes.uv,data.uvSHA256],[g.index,data.indexSHA256]])if(!a||a.isInterleavedBufferAttribute||await digest(a)!==hash)throw Error('Stone occlusion original source/placement mismatch');
 const bytes=Uint8Array.from(atob(data.occlusion),c=>c.charCodeAt(0));if(bytes.length!==data.vertexCount*8)throw Error('Stone occlusion payload length mismatch');const occlusion=new Float32Array(bytes.buffer);if(!occlusion.every(v=>Number.isFinite(v)&&v>=0&&v<=1))throw Error('Invalid stone occlusion');return occlusion;
}
export async function prepareStoneOcclusion(assetId,scene,{enabled=stoneOcclusionEnabled(),load=()=>import('./stone-occlusion-data.js')}={}){
 if(!enabled||assetId!=='house_a')return null;const{default:data}=await load(),node=scene.getObjectByName(data.nodeName);if(!node?.isMesh||node.material.name!=='stone')throw Error('Original foundation stone mesh missing');
 return {node,occlusion:await validateStoneOcclusion(node.geometry,data),version:data.version,stones:data.components.length};
}
export function applyStoneOcclusion(g,node,candidate){if(!candidate||node!==candidate.node)return false;g.setAttribute('assetOcclusion',new Float32BufferAttribute(candidate.occlusion.slice(),2));return true;}
