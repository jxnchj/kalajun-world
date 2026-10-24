"""Read-only validation of editable stones, closed surfaces and canonical maps."""
import bpy,json,collections,math,hashlib
from pathlib import Path
from mathutils import Vector
root=Path(__file__).resolve().parents[2]
meta=json.loads((root/'assets/src/v2/pastoral/household-entry-tea-34.metadata.json').read_text())
def material_signature(m):
 return {'nodes':[(n.name,n.type,[(i.name,list(i.default_value)if hasattr(i.default_value,'__len__')else i.default_value)for i in n.inputs if hasattr(i,'default_value')],getattr(getattr(n,'image',None),'name',None))for n in m.node_tree.nodes],'links':[(l.from_node.name,l.from_socket.name,l.to_node.name,l.to_socket.name)for l in m.node_tree.links],'images':[(n.image.name,hashlib.sha256(n.image.packed_file.data).hexdigest())for n in m.node_tree.nodes if n.type=='TEX_IMAGE']}
bpy.ops.wm.open_mainfile(filepath=str(root/'assets/src/v2/pastoral/house_a-lived.blend'))
canonical=material_signature(bpy.data.materials['stone'])
bpy.ops.wm.open_mainfile(filepath=str(root/meta['sourceBlend']))
assert material_signature(bpy.data.materials['stone'])==canonical,'Exact original canonical stone material, image and scalar PBR inputs'

stones=[o for o in bpy.context.scene.objects if o.get('entryVersion')==meta['version']]
assert len(stones)==len(meta['stones'])>20
assert sum(o['stoneKind']=='tread'for o in stones)==8
report=[]
for o in stones:
 me=o.data;assert me.uv_layers.active and me.color_attributes.get('Color')
 assert o.get('sourceMaterial')=='stone'and len(me.materials)==1
 assert me.materials[0]==bpy.data.materials['stone'],'No substituted or stripped editable source material'
 center=sum((v.co for v in me.vertices),Vector())/len(me.vertices);edges=collections.Counter();signed=0
 for f in me.polygons:
  assert f.normal.dot(f.center-center)>0,'Outward face '+o.name+str(f.index)
  pts=[tuple(round(v,7)for v in me.vertices[i].co)for i in f.vertices]
  for a,b in zip(pts,pts[1:]+pts[:1]):edges[tuple(sorted((a,b)))]+=1
 assert all(n==2 for n in edges.values()),'Geometrically closed surface '+o.name
 me.calc_loop_triangles()
 for f in me.loop_triangles:
  a,b,c=[me.vertices[i].co for i in f.vertices];signed+=a.dot(b.cross(c))/6
 assert signed>0,'Positive outward volume '+o.name
 course=meta['courses'][o['course']];bbox=[o.matrix_world@Vector(v)for v in o.bound_box]
 assert min(p.x for p in bbox)>=course['x0']-1e-6 and max(p.x for p in bbox)<=course['x1']+1e-6
 assert min(-p.y for p in bbox)>=course['z0']-1e-6 and max(-p.y for p in bbox)<=course['z1']+1e-6
 assert max(p.z for p in bbox)<=course['top']+1e-6 and min(p.z for p in bbox)>=course['bottom']-1e-6
 if o['stoneKind']=='tread':assert abs(max(p.z for p in bbox)-course['top'])<1e-6
 report.append({'name':o.name,'triangles':len(me.loop_triangles),'volume':signed})
assert sum(o.name.startswith('preview_')for o in bpy.context.scene.objects)>10,'Retained house, tea and actual terrain authoring context'
(root/'tools/reports/household-entry-source-validation-v34.json').write_text(json.dumps({'version':meta['version'],'geometryRevision':meta.get('geometryRevision','initial-10mm'),'sourceSHA256':meta['sourceSHA256'],'blendSHA256':meta['blendSHA256'],'stones':report,'closedOutward':True,'canonicalMaterialByteMatched':True,'canonicalImageCount':len(canonical['images']),'separateEditableObjects':True},indent=2)+'\n')
print('Validated',len(stones),'closed editable stones and retained full PBR source')
