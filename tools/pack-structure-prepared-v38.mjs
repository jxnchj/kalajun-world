import assert from 'node:assert/strict';
const clone=x=>structuredClone(x);
const COMPONENTS=new Map([[Int8Array,5120],[Uint8Array,5121],[Int16Array,5122],[Uint16Array,5123],[Uint32Array,5125],[Float32Array,5126]]);
const SEMANTICS={position:'POSITION',normal:'NORMAL',uv:'TEXCOORD_0',uv1:'TEXCOORD_1',uv2:'TEXCOORD_2',tangent:'TANGENT',assetOcclusion:'_ASSET_OCCLUSION'};
export function parseGLB(bytes){
 const b=Buffer.from(bytes.buffer,bytes.byteOffset,bytes.byteLength);assert.equal(b.readUInt32LE(0),0x46546c67);assert.equal(b.readUInt32LE(4),2);assert.equal(b.readUInt32LE(8),b.length);
 const n=b.readUInt32LE(12);assert.equal(b.readUInt32LE(16),0x4e4f534a);
 const json=JSON.parse(b.toString('utf8',20,20+n)),start=20+n;
 assert.equal(b.readUInt32LE(start+4),0x004e4942);return {json,bin:b.subarray(start+8,start+8+b.readUInt32LE(start))};
}
export function packPreparedStructure(original,templates,materialIndices,metadata){
 const {json:source,bin}=parseGLB(original),doc={asset:{...clone(source.asset),generator:'Kalajun exact offline structure preparation v38'},scene:0,scenes:[{name:'Scene',nodes:[],extras:{...clone(source.scenes[source.scene??0].extras??{}),preparedStructure:metadata}}],nodes:[],meshes:[],accessors:[],bufferViews:[],buffers:[{byteLength:0}],materials:clone(source.materials),textures:clone(source.textures),samplers:clone(source.samplers??[]),images:clone(source.images??[])};
 for(const key of ['extensionsUsed','extensionsRequired','extensions'])if(source[key])doc[key]=clone(source[key]);
 const chunks=[];let length=0;
 function view(bytes,extra={}){
  const padding=(4-length%4)%4;if(padding){chunks.push(Buffer.alloc(padding));length+=padding;}
  const id=doc.bufferViews.length;doc.bufferViews.push({...extra,buffer:0,byteOffset:length,byteLength:bytes.byteLength});
  chunks.push(Buffer.from(bytes.buffer,bytes.byteOffset,bytes.byteLength));length+=bytes.byteLength;return id;
 }
 const copiedViews=new Map(),copiedAccessors=new Map();
 function sourceView(id){if(copiedViews.has(id))return copiedViews.get(id);const v=source.bufferViews[id];assert.equal(v.buffer??0,0);const {buffer,byteOffset,byteLength,...extra}=v;const next=view(bin.subarray(byteOffset??0,(byteOffset??0)+byteLength),clone(extra));copiedViews.set(id,next);return next;}
 function sourceAccessor(id){
  if(copiedAccessors.has(id))return copiedAccessors.get(id);
  const a=clone(source.accessors[id]);assert.ok(!a.sparse,'Sparse source accessor needs a dedicated exact path');a.bufferView=sourceView(a.bufferView);
  const next=doc.accessors.length;doc.accessors.push(a);copiedAccessors.set(id,next);return next;
 }
 for(const im of doc.images){assert.ok(im.bufferView!==undefined&&!im.uri,'Only original embedded image transport is supported');im.bufferView=sourceView(im.bufferView);}
 const parents=new Map();source.nodes.forEach((n,i)=>(n.children||[]).forEach(c=>parents.set(c,i)));
 const keep=new Set(),visit=i=>{if(keep.has(i))return;keep.add(i);for(const c of source.nodes[i].children||[])visit(c);};
 source.nodes.forEach((n,i)=>{if(new RegExp('^'+metadata.assetId+'_door\\d+(_out)?$').test(n.name||'')){visit(i);for(let p=parents.get(i);p!==undefined;p=parents.get(p))keep.add(p);}});
 assert.ok(keep.size,'Prepared articulated asset must retain its complete door hierarchy');
 const nodeMap=new Map(),meshMap=new Map();
 function sourceMesh(id){
  if(meshMap.has(id))return meshMap.get(id);
  const mesh=clone(source.meshes[id]);
  for(const p of mesh.primitives){
   assert.ok(!p.targets&&!p.extensions,'Unexpected compressed or animated door primitive');
   p.attributes=Object.fromEntries(Object.entries(p.attributes).map(([k,a])=>[k,sourceAccessor(a)]));
   if(p.indices!==undefined)p.indices=sourceAccessor(p.indices);
  }
  const next=doc.meshes.length;doc.meshes.push(mesh);meshMap.set(id,next);return next;
 }
 for(const id of keep){
  const node=clone(source.nodes[id]);assert.ok(node.skin===undefined);
  if(node.mesh!==undefined)node.mesh=sourceMesh(node.mesh);delete node.children;
  nodeMap.set(id,doc.nodes.length);doc.nodes.push(node);
 }
 for(const id of keep){const children=(source.nodes[id].children||[]).filter(c=>keep.has(c)).map(c=>nodeMap.get(c));if(children.length)doc.nodes[nodeMap.get(id)].children=children;if(!keep.has(parents.get(id)))doc.scenes[0].nodes.push(nodeMap.get(id));}
 function attribute(a,semantic){
  let array=a.array;
  if(a.isInterleavedBufferAttribute){array=new a.data.array.constructor(a.count*a.itemSize);for(let i=0;i<a.count;i++)for(let k=0;k<a.itemSize;k++)array[i*a.itemSize+k]=a.data.array[i*a.data.stride+a.offset+k];}
  const componentType=COMPONENTS.get(array.constructor);assert.ok(componentType,'Unsupported exact attribute type');
  const accessor={bufferView:view(new Uint8Array(array.buffer,array.byteOffset,array.byteLength)),byteOffset:0,componentType,count:a.count,type:['','SCALAR','VEC2','VEC3','VEC4'][a.itemSize]};assert.ok(accessor.type);
  if(a.normalized)accessor.normalized=true;
  if(semantic==='POSITION'){const min=[Infinity,Infinity,Infinity],max=[-Infinity,-Infinity,-Infinity];for(let i=0;i<a.count;i++)for(let k=0;k<3;k++){const v=array[i*3+k];assert.ok(Number.isFinite(v));min[k]=Math.min(min[k],v);max[k]=Math.max(max[k],v);}accessor.min=min;accessor.max=max;}
  const index=doc.accessors.length;doc.accessors.push(accessor);return index;
 }
 function geometry(g,name,material){
  assert.equal(g.groups.length,0,'Prepared geometry must already have exact material sections');
  const attrs={};for(const [key,a]of Object.entries(g.attributes)){assert.ok(SEMANTICS[key],'Unmapped prepared attribute '+key);attrs[SEMANTICS[key]]=attribute(a,SEMANTICS[key]);}
  const primitive={attributes:attrs,material,mode:4};if(g.index)primitive.indices=attribute(g.index,'INDEX');
  const mesh=doc.meshes.length;doc.meshes.push({name,primitives:[primitive]});const node=doc.nodes.length;doc.nodes.push({name,mesh});doc.scenes[0].nodes.push(node);return name;
 }
 const bounds=g=>({box:[g.boundingBox.min.toArray(),g.boundingBox.max.toArray()],sphere:[g.boundingSphere.center.toArray(),g.boundingSphere.radius]});
 metadata.templates=templates.map((t,i)=>{
  const material=materialIndices.get(t.material);assert.ok(Number.isInteger(material)&&source.materials[material]);
  const near=geometry(t.geometry,'prepared_'+metadata.assetId+'_'+i+'_near',material);
  const low=t.low?{node:geometry(t.low.geometry,'prepared_'+metadata.assetId+'_'+i+'_far',material),triangles:t.low.triangles,error:t.low.error,bounds:bounds(t.low.geometry)}:null;
  return {near,low,role:t.role,names:t.names,triangles:t.triangles,bounds:bounds(t.geometry),sourceMaterialNames:t.material.userData.sourceMaterialNames};
 });
 doc.buffers[0].byteLength=length;
 const jsonRaw=Buffer.from(JSON.stringify(doc)),jsonPadding=(4-jsonRaw.length%4)%4,jsonBytes=Buffer.concat([jsonRaw,Buffer.alloc(jsonPadding,32)]);
 const raw=Buffer.concat(chunks),binPadding=(4-raw.length%4)%4,binary=Buffer.concat([raw,Buffer.alloc(binPadding)]);
 const header=Buffer.alloc(20);header.writeUInt32LE(0x46546c67);header.writeUInt32LE(2,4);header.writeUInt32LE(28+jsonBytes.length+binary.length,8);header.writeUInt32LE(jsonBytes.length,12);header.writeUInt32LE(0x4e4f534a,16);
 const bh=Buffer.alloc(8);bh.writeUInt32LE(binary.length);bh.writeUInt32LE(0x004e4942,4);
 return Buffer.concat([header,jsonBytes,bh,binary]);
}
