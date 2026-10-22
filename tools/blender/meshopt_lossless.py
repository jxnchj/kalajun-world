"""Lossless GLB buffer-view compression using Blender's bundled meshoptimizer.
No vertex reorder, quantization, normal/UV filter, or triangle rotation is used.
Run: tools/.bpy/bin/python tools/blender/meshopt_lossless.py input.glb output.glb
The original per-view SHA256 values form a decoded-byte verification manifest.
"""
import argparse,ctypes,hashlib,json,struct
from pathlib import Path
ROOT=Path(__file__).resolve().parents[2]
EXT='EXT_meshopt_compression'

def pack_glb(document,binary):
 j=json.dumps(document,separators=(',',':'),ensure_ascii=False).encode();j+=b' '*((-len(j))%4)
 binary+=b'\0'*((-len(binary))%4)
 return struct.pack('<III',0x46546c67,2,28+len(j)+len(binary))+struct.pack('<II',len(j),0x4e4f534a)+j+struct.pack('<II',len(binary),0x004e4942)+binary

def compress_glb(source,destination,report_path=None):
 data=Path(source).read_bytes();assert struct.unpack_from('<III',data)==(0x46546c67,2,len(data))
 jslen=struct.unpack_from('<I',data,12)[0];doc=json.loads(data[20:20+jslen]);binary=data[28+jslen:]
 if EXT in doc.get('extensionsRequired',[]):raise ValueError('Input already compressed; use the editable/uncompressed source')
 assert len(doc['buffers'])==1
 native=next((ROOT/'tools/.bpy/lib').glob('python*/site-packages/bpy/*/scripts/addons_core/io_scene_gltf2/libbf_intern_meshopt_bridge.dylib'))
 dependency=next((ROOT/'tools/.bpy/lib').glob('python*/site-packages/bpy/lib/libmeshoptimizer.dylib'))
 ctypes.CDLL(str(dependency),mode=ctypes.RTLD_GLOBAL)
 lib=ctypes.CDLL(str(native));lib.encodeVertexVersion(0);lib.encodeIndexVersion(1)
 for name in ['encodeVertexBufferBound','encodeIndexSequenceBound']:
  fn=getattr(lib,name);fn.argtypes=[ctypes.c_size_t,ctypes.c_size_t];fn.restype=ctypes.c_size_t
 for name in ['encodeVertexBuffer','encodeIndexSequence']:
  fn=getattr(lib,name);fn.argtypes=[ctypes.c_void_p,ctypes.c_size_t,ctypes.c_void_p,ctypes.c_size_t]+([ctypes.c_size_t] if name=='encodeVertexBuffer' else []);fn.restype=ctypes.c_size_t
 accessors={}
 for a in doc['accessors']:
  assert not a.get('sparse');accessors.setdefault(a['bufferView'],[]).append(a)
 indices={doc['accessors'][p['indices']]['bufferView'] for m in doc['meshes'] for p in m['primitives'] if 'indices' in p}
 chunks=bytearray();virtual=0;views=[];items=[]
 def append(raw):
  chunks.extend(b'\0'*((-len(chunks))%4));off=len(chunks);chunks.extend(raw);return off
 for i,v in enumerate(doc['bufferViews']):
  assert v.get('buffer',0)==0
  raw=binary[v.get('byteOffset',0):v.get('byteOffset',0)+v['byteLength']]
  record=dict(view=i,decodedBytes=len(raw),sha256=hashlib.sha256(raw).hexdigest())
  if i not in accessors:
   v['byteOffset']=append(raw);items.append(record);continue
  aa=accessors[i]
  if i in indices:
   assert len(aa)==1 and aa[0].get('byteOffset',0)==0
   a=aa[0];stride={5123:2,5125:4}[a['componentType']];count=a['count'];assert len(raw)==count*stride
   sequence=(ctypes.c_uint32*count)(*struct.unpack('<'+('H' if stride==2 else 'I')*count,raw))
   bound=lib.encodeIndexSequenceBound(count,max(sequence,default=0)+1);encoded=(ctypes.c_ubyte*bound)()
   length=lib.encodeIndexSequence(encoded,bound,sequence,count);mode='INDICES'
  else:
   if 'byteStride' in v:stride=v['byteStride']
   else:
    assert len(aa)==1 and aa[0].get('byteOffset',0)==0
    a=aa[0];stride={5126:4,5125:4,5123:2,5121:1}[a['componentType']]*{'SCALAR':1,'VEC2':2,'VEC3':3,'VEC4':4,'MAT4':16}[a['type']]
   assert stride%4==0 and len(raw)%stride==0
   count=len(raw)//stride;bound=lib.encodeVertexBufferBound(count,stride);encoded=(ctypes.c_ubyte*bound)();src=ctypes.create_string_buffer(raw)
   length=lib.encodeVertexBuffer(encoded,bound,src,count,stride);mode='ATTRIBUTES'
  assert length>0
  compressed=bytes(encoded[:length]);off=append(compressed);virtual=(virtual+3)//4*4
  v['buffer']=1;v['byteOffset']=virtual;virtual+=len(raw)
  v.setdefault('extensions',{})[EXT]=dict(buffer=0,byteOffset=off,byteLength=length,byteStride=stride,count=count,mode=mode,filter='NONE')
  record.update(compressedBytes=length,mode=mode,filter='NONE');items.append(record);views.append(i)
 doc['buffers']=[dict(byteLength=len(chunks)),dict(byteLength=virtual,extensions={EXT:dict(fallback=True)})]
 for key in ['extensionsUsed','extensionsRequired']:
  if EXT not in doc.setdefault(key,[]):doc[key].append(EXT)
 out=pack_glb(doc,bytes(chunks));destination=Path(destination);pending=destination.with_suffix('.meshopt-pending.glb');pending.write_bytes(out);pending.replace(destination)
 report=dict(revision='meshopt-lossless-v1',sourceBytes=len(data),compressedBytes=len(out),savedBytes=len(data)-len(out),quantized=False,reordered=False,sourceSha256=hashlib.sha256(data).hexdigest(),compressedSha256=hashlib.sha256(out).hexdigest(),views=items)
 if report_path:Path(report_path).write_text(json.dumps(report,indent=2))
 return report

if __name__=='__main__':
 p=argparse.ArgumentParser();p.add_argument('source');p.add_argument('destination');p.add_argument('--report');a=p.parse_args()
 r=compress_glb(a.source,a.destination,a.report);print(json.dumps({k:v for k,v in r.items() if k!='views'}))
