import {BufferGeometry,BufferAttribute} from 'three';
// Only the 156-triangle woody suffix. Every original attribute byte forms the
// vertex identity, including UV seams and signed zero. No positions, normals,
// wind, topology order or texture data are recomputed or quantized.
export function createIndexedTwigTemplate(source){
 if(source.index)throw new Error('Twig source must be the original unindexed brush template');
 const start=1440*3,count=156*3,attributes=Object.entries(source.attributes);
 if(!source.attributes.aBrushCode||source.attributes.position.count<start+count)throw new Error('Complete source twig suffix missing');
 for(const [,a]of attributes)if(a.isInterleavedBufferAttribute||a.isInstancedBufferAttribute||a.count!==source.attributes.position.count)throw new Error('Unexpected twig template attribute layout');
 const unique=new Map(),vertices=[],indices=new Uint16Array(count);
 for(let corner=0;corner<count;corner++){
  const i=start+corner;
  if(source.attributes.aBrushCode.getX(i)!==1)throw new Error('Needle found inside woody suffix');
  const key=attributes.map(([,a])=>{const size=a.itemSize*a.array.BYTES_PER_ELEMENT;return new Uint8Array(a.array.buffer,a.array.byteOffset+i*size,size).join(',');}).join('|');
  let vertex=unique.get(key);if(vertex===undefined){vertex=vertices.length;unique.set(key,vertex);vertices.push(i);}indices[corner]=vertex;
 }
 const geometry=new BufferGeometry();
 for(const [name,a]of attributes){const array=new a.array.constructor(vertices.length*a.itemSize);vertices.forEach((i,j)=>array.set(a.array.subarray(i*a.itemSize,(i+1)*a.itemSize),j*a.itemSize));const copy=new BufferAttribute(array,a.itemSize,a.normalized);copy.name=a.name;copy.gpuType=a.gpuType;geometry.setAttribute(name,copy);}
 geometry.setIndex(new BufferAttribute(indices,1));geometry.setDrawRange(0,count);
 geometry.userData.twigIndexed={sourceCorners:count,uniqueVertices:vertices.length,triangles:count/3,sourceStart:start};return geometry;
}
