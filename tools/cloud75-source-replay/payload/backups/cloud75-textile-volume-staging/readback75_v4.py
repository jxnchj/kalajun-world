"""Offline GLB readback audit. No writes except staging audit JSON. Not run yet."""
import json,struct,hashlib,sys,argparse
sys.dont_write_bytecode=True
from pathlib import Path
import numpy as np
HERE=Path(__file__).resolve().parent;ROOT=HERE.parents[1]
CHANGED={'pastoral_house_chest_folded'+str(i)for i in range(4)}|{'pastoral_house_chest_topcover'}
def read(path):
 raw=path.read_bytes();assert raw[:4]==b'glTF';n=struct.unpack_from('<I',raw,12)[0];j=json.loads(raw[20:20+n]);blob=raw[28+n:]
 def accessor(i):
  a=j['accessors'][i];v=j['bufferViews'][a['bufferView']];count=a['count'];width={'SCALAR':1,'VEC2':2,'VEC3':3,'VEC4':4}[a['type']];dtype={5126:'<f4',5125:'<u4',5123:'<u2',5121:'u1'}[a['componentType']];item=np.dtype(dtype).itemsize
  start=v.get('byteOffset',0)+a.get('byteOffset',0);stride=v.get('byteStride',item*width)
  return np.ndarray((count,width),dtype,buffer=blob,offset=start,strides=(stride,item)).copy()
 def local(node):
  if 'matrix' in node:return np.array(node['matrix'],float).reshape(4,4).T
  x,y,z,w=node.get('rotation',[0,0,0,1]);rot=np.array([[1-2*(y*y+z*z),2*(x*y-z*w),2*(x*z+y*w)],[2*(x*y+z*w),1-2*(x*x+z*z),2*(y*z-x*w)],[2*(x*z-y*w),2*(y*z+x*w),1-2*(x*x+y*y)]])
  m=np.eye(4);m[:3,:3]=rot@np.diag(node.get('scale',[1,1,1]));m[:3,3]=node.get('translation',[0,0,0]);return m
 parents={child:i for i,node in enumerate(j['nodes'])for child in node.get('children',[])}
 def world(i):return world(parents[i])@local(j['nodes'][i]) if i in parents else local(j['nodes'][i])
 meshes={}
 for ni,node in enumerate(j['nodes']):
  if 'mesh'not in node:continue
  p=j['meshes'][node['mesh']]['primitives'];assert len(p)==1
  meshes[node['name']]={'node':{k:v for k,v in node.items()if k not in ('mesh','extras','name')},'index':accessor(p[0]['indices']),'attributes':{k:accessor(v)for k,v in p[0]['attributes'].items()},'worldMatrix':world(ni)}
 return j,meshes

def main():
 parser=argparse.ArgumentParser();parser.add_argument('--candidate',type=Path,required=True);args=parser.parse_args(sys.argv[sys.argv.index('--')+1:]if'--'in sys.argv else sys.argv[1:]);OUT=args.candidate.resolve();assert OUT.parent==HERE and OUT.is_dir()
 audit=json.loads((OUT/'audit.json').read_text());assert audit['candidateVersion']==4;assert audit['status']=='PARTIAL geometry checks only; full 3D certification and runtime validation pending'
 assert audit['protectedInputsUnchanged'];assert isinstance(audit['aoRecomputed'],bool)
 manifest=json.loads((OUT/'manifest.json').read_text());digest=lambda p:hashlib.sha256(p.read_bytes()).hexdigest()
 assert manifest['geometrySHA256']==digest(OUT/'geometry.glb')
 assert manifest['sourceSHA256']==digest(ROOT/'web/public/assets/v2/house_a_lived.glb')
 for name,value in audit['outputSHA256'].items():assert digest(OUT/name)==value,('output provenance',name)
 for name,value in audit['protectedInputs'].items():assert digest(ROOT/name)==value,('source provenance',name)
 rows={r['name']:r for r in audit['rows']};assert set(rows)==CHANGED
 oldj,old=read(ROOT/'web/public/assets/v2/house-textiles62/geometry.glb');j,new=read(OUT/'geometry.glb')
 assert len(new)==9 and set(new)==set(old);assert not j.get('images')and not j.get('textures')
 result={'status':'readback checks passed ONLY; geometry certification remains partial','rows':[],'limit':'Requires identical exporter vertex ordering; ordering drift is rejected for investigation, not treated as geometry change.'}
 for name,a in old.items():
  b=new[name];assert a['node']==b['node'],(name,'node transform');assert np.array_equal(a['index'],b['index']),(name,'index')
  assert set(a['attributes'])==set(b['attributes']),(name,'attribute layout')
  for key,arr in a['attributes'].items():
   other=b['attributes'][key];assert arr.shape==other.shape,(name,key,'density')
   if name not in CHANGED or key not in (('POSITION','NORMAL','COLOR_0')if audit['aoRecomputed'] else ('POSITION','NORMAL')):assert np.array_equal(arr,other),(name,key,'changed protected bytes')
  p=b['attributes']['POSITION'];assert np.isfinite(p).all();t=p[b['index'].ravel().reshape(-1,3)];area=np.linalg.norm(np.cross(t[:,1]-t[:,0],t[:,2]-t[:,0]),axis=1)/2;assert (area>1e-12).all()
  # glTF Y-up => footprint X/Z.
  if name!='pastoral_house_chest_topcover':assert np.allclose(p[:,[0,2]],a['attributes']['POSITION'][:,[0,2]],rtol=0,atol=2e-6),(name,'footprint')
  if name in CHANGED:
   row=rows[name];shift=row['rigidSettlementZ'];assert abs(shift)<=.010+1e-10
   before=np.array(row['beforeBounds']);after=np.array(row['afterBounds'])
   if name!='pastoral_house_chest_topcover':assert np.allclose(after[:,[0,1]],before[:,[0,1]],rtol=0,atol=2e-6)
   assert abs(shift)<=.00025+1e-12,(name,'joint settlement cap')
   dz=p[:,1]-a['attributes']['POSITION'][:,1]
   shape_dz=dz-shift
   assert shape_dz.min()>=-.016-2e-6 and shape_dz.max()<=2e-6,(name,'shape compression budget')
   assert np.allclose([dz.min(),dz.max()],row['zDisplacementRange'],atol=2e-6,rtol=0)
   if name=='pastoral_house_chest_topcover':
    assert row['ownRigidSettlementZ']==0
    assert abs(row['inheritedSupportTranslationZ']-shift)<=1e-12
   def gltf_bounds(bounds):return np.array([[bounds[0,0],bounds[0,2],-bounds[1,1]],[bounds[1,0],bounds[1,2],-bounds[0,1]]])
   def world_bounds(mesh):
    v=mesh['attributes']['POSITION'];q=np.c_[v,np.ones(len(v))]@mesh['worldMatrix'].T
    return np.array([q[:,:3].min(axis=0),q[:,:3].max(axis=0)])
   assert np.allclose(world_bounds(a),gltf_bounds(before),rtol=0,atol=2e-6),(name,'baseline bounds provenance')
   assert np.allclose(world_bounds(b),gltf_bounds(after),rtol=0,atol=2e-6),(name,'export bounds provenance')
   raw=audit['rawVertexReadback'][name];expected={}
   for source,target in zip(raw['before'],raw['after']):
    key=tuple(np.round([source[0],source[2],-source[1]],5));value=np.array([target[0],target[2],-target[1]])
    if key in expected:assert np.allclose(expected[key],value,rtol=0,atol=2e-6),('ambiguous raw exporter mapping',name,key)
    expected[key]=value
   prior=np.c_[a['attributes']['POSITION'],np.ones(len(p))]@a['worldMatrix'].T;current=np.c_[p,np.ones(len(p))]@b['worldMatrix'].T;mapped=set()
   for i,oldpoint in enumerate(prior):
    key=tuple(np.round(oldpoint[:3],5));assert key in expected,('missing raw source mapping',name,key)
    assert np.allclose(current[i,:3],expected[key],rtol=0,atol=2e-6),('export differs from exact audited XYZ',name,i);mapped.add(key)
   assert mapped==set(expected),('unexported raw vertices',name)
  result['rows'].append({'name':name,'vertices':len(p),'triangles':len(t),'minArea':float(area.min())})
 (OUT/'readback.json').write_text(json.dumps(result,indent=2)+'\n')
 print(json.dumps(result))
if __name__=='__main__':main()
