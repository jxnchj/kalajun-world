"""Read-only proof that the two source pairs differ only outside rendering/GI inputs.

Rebinding an inherited hash without comparing the original geometry/materials is
not allowed. This report is a local selective-merge artifact, not a new bake.
"""
import bpy, hashlib, json, array
from pathlib import Path
ROOT=Path(__file__).resolve().parents[2]
CANDIDATE=ROOT.parent/'kalajun-round33-34-review-20261023/candidate'
OUT=ROOT/'tools/reports/entry-source-rebinding-v35.json'
def sha(p):return hashlib.sha256(p.read_bytes()).hexdigest()
def arr(seq,key,size,code='f'):
 a=array.array(code,[0])*(len(seq)*size);seq.foreach_get(key,a);return hashlib.sha256(a.tobytes()).hexdigest()
def value(v):
 if isinstance(v,(str,int,float,bool))or v is None:return v
 try:return list(v)
 except TypeError:return repr(type(v))
def fingerprint(path):
 bpy.ops.wm.open_mainfile(filepath=str(path),load_ui=False,use_scripts=False)
 meshes={}
 for m in bpy.data.meshes:
  attrs={}
  for a in m.attributes:
   d=a.data
   field=next((k for k in ['vector','color','value']if len(d)and hasattr(d[0],k)),None)
   if field:
    first=getattr(d[0],field);n=len(first)if hasattr(first,'__len__')else 1
    attrs[a.name]=[a.domain,a.data_type,arr(d,field,n,'i'if isinstance(first,(int,bool))else'f')]
  meshes[m.name]={'vertices':arr(m.vertices,'co',3),'loops':arr(m.loops,'vertex_index',1,'i'),'polygons':{k:arr(m.polygons,k,1,'i')for k in ['loop_start','loop_total','material_index','use_smooth']},'attributes':attrs,'materials':[x.name if x else None for x in m.materials]}
 materials={}
 for m in bpy.data.materials:
  nodes=[]
  if m.use_nodes:
   for n in m.node_tree.nodes:
    nodes.append({'name':n.name,'type':n.type,'inputs':[(i.name,value(i.default_value))for i in n.inputs if hasattr(i,'default_value')],'image':getattr(getattr(n,'image',None),'name',None)})
  materials[m.name]={'nodes':nodes,'links':[(l.from_node.name,l.from_socket.name,l.to_node.name,l.to_socket.name)for l in m.node_tree.links]if m.use_nodes else [],'diffuse':list(m.diffuse_color)}
 objects={o.name:{'type':o.type,'data':getattr(o.data,'name',None),'matrix':[list(x)for x in o.matrix_world],'hide_render':o.hide_render,'materials':[m.name if m else None for m in o.data.materials]if o.type=='MESH'else []}for o in bpy.context.scene.objects}
 images={im.name:{'size':list(im.size),'colorspace':im.colorspace_settings.name,'packed':[hashlib.sha256(x.data).hexdigest()for x in [im.packed_file]if x]}for im in bpy.data.images}
 used_materials={name for m in meshes.values()for name in m['materials']if name}
 unused_materials=sorted(set(materials)-used_materials)
 materials={name:materials[name]for name in used_materials}
 used_images={node['image']for m in materials.values()for node in m['nodes']if node['image']}
 unused_images=sorted(set(images)-used_images)
 images={name:images[name]for name in used_images}
 data={'meshes':meshes,'materials':materials,'objects':objects,'images':images}
 global LAST_DATA
 LAST_DATA=data
 return {k:hashlib.sha256(json.dumps(v,sort_keys=True,separators=(',',':')).encode()).hexdigest()for k,v in data.items()}, {'meshes':len(meshes),'materials':len(materials),'objects':len(objects),'images':len(images),'unusedMaterials':unused_materials,'unusedImages':unused_images}
rows=[]
for rel in ['assets/src/v2/pastoral/house_a-lived.blend','assets/src/v2/pastoral/household-living-32.blend']:
 before=sha(ROOT/rel);canonical,counts=fingerprint(ROOT/rel);a=LAST_DATA;handoff,_=fingerprint(CANDIDATE/rel);b=LAST_DATA
 if canonical!=handoff:
  for kind in a:
   for name in set(a[kind])|set(b[kind]):
    if a[kind].get(name)!=b[kind].get(name):print('DIFFERENCE',kind,name,json.dumps(a[kind].get(name)),json.dumps(b[kind].get(name)))
 assert canonical==handoff,(rel,canonical,handoff)
 assert before==sha(ROOT/rel),'Canonical source was mutated'
 rows.append({'path':rel,'canonicalSHA256':before,'handoffSHA256':sha(CANDIDATE/rel),'semanticSHA256':canonical,'counts':counts,'renderGIInputsEqual':True})
OUT.write_text(json.dumps({'version':'entry-source-rebinding-v35','pairs':rows,'scope':'Read-only exact geometry, UV/AO, material node inputs and packed images, object transforms; excludes filepaths, UI, text metadata and unreferenced orphan materials/images removed by Blender on save; each excluded orphan name is listed. This comparison is not itself a GI rebake.'},indent=2)+'\n')
print(json.dumps({'verified':True,'pairs':rows}))
