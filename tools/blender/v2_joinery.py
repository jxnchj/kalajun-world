"""Refine existing furniture and add supported entrance timberwork, preserving layout.
Design interpretation; no surveyed household attribution. Run from exact v29 backup.
"""
import json,math
from pathlib import Path
import bpy
import numpy as np
from mathutils import Vector
from v2_tea_service import digest,count,bounds
from v2_interior_surfaces import contact_ao
ROOT=Path(__file__).resolve().parents[2]
VERSION='pastoral-joinery-30'
parts=[]
def box(name,lo,hi,bevel=.004,grain=0):
 lo,hi=Vector(lo),Vector(hi)
 bpy.ops.mesh.primitive_cube_add(size=1,location=(lo+hi)/2);o=bpy.context.object;o.name='joinery_part_'+name;o.dimensions=hi-lo
 bpy.ops.object.transform_apply(location=False,rotation=False,scale=True)
 if bevel:
  m=o.modifiers.new('softened worked timber edges','BEVEL');m.width=min(bevel,min(hi-lo)*.16);m.segments=2;bpy.ops.object.modifier_apply(modifier=m.name)
 uv=o.data.uv_layers.active or o.data.uv_layers.new(name='UVMap')
 # Wood grain follows the structural member, at a common physical scale.
 for f in o.data.polygons:
  axis=max(range(3),key=lambda k:abs(f.normal[k]));across=next((k for k in range(3)if k!=grain and k!=axis),(grain+1)%3)
  for li in f.loop_indices:
   v=o.data.vertices[o.data.loops[li].vertex_index].co+o.location;uv.data[li].uv=(v[grain]*.8,v[across]*2.5)
 parts.append(o);return o

def brace(x):
 # Continuous curved knee in the y/z plane: wall-bearing back and overhang head.
 profile=[(-2.57,1.86),(-2.67,1.86),(-2.73,1.94),(-2.82,2.00),(-2.94,2.04),(-3.02,2.06),(-3.02,2.13),(-2.57,2.13)]
 verts=[(x+dx,y,z)for dx in(-.055,.055)for y,z in profile];n=len(profile)
 faces=[tuple(reversed(range(n))),tuple(range(n,2*n))]+[(i,(i+1)%n,(i+1)%n+n,i+n)for i in range(n)]
 mesh=bpy.data.meshes.new('curved timber knee');mesh.from_pydata(verts,[],faces);mesh.update();o=bpy.data.objects.new('joinery_part_knee',mesh);bpy.context.scene.collection.objects.link(o);parts.append(o)
 uv=mesh.uv_layers.new(name='UVMap')
 for f in mesh.polygons:
  for li in f.loop_indices:
   v=mesh.vertices[mesh.loops[li].vertex_index].co;uv.data[li].uv=(v.z*.8,v.y*2.5)

def bed(lo,hi):
 x0,y0,z0=lo;x1,y1,z1=hi;w=x1-x0;d=y1-y0;leg=.115
 for x in[x0,x1-leg]:
  for y in[y0,y1-leg]:box('stout foot',(x,y,z0),(x+leg,y+leg,z1-.025),.007,2)
 # Genuine space below rails; this is a bed frame, not a monolithic block.
 railbottom=z0+.16;railtop=z1-.045
 for y in[y0,y1-.055]:
  box('long apron',(x0+.05,y,railbottom),(x1-.05,y+.055,railtop),.005,0)
  box('apron lower bead',(x0+.11,y,railbottom+.015),(x1-.11,y+.055,railbottom+.03),.003,0)
 for x in[x0,x1-.055]:box('side apron',(x,y0+.06,railbottom),(x+.055,y1-.06,railtop),.005,1)
 n=math.ceil(d/.15);gap=.009
 for j in range(n):
  ya=y0+j*d/n;box('mattress supporting slat',(x0+.01,ya+gap/2,z1-.045),(x1-.01,ya+d/n-gap/2,z1),.003,0)
 # Mortise shoulder blocks transfer load from slats into the posts.
 for x in[x0+.08,x1-.16]:
  for y in[y0+.06,y1-.14]:box('tenon shoulder',(x,y,railtop-.08),(x+.08,y+.08,z1-.04),.003,2)

def chest(lo,hi):
 x0,y0,z0=lo;x1,y1,z1=hi;st=.065
 for x in[x0,x1-st]:
  for y in[y0,y1-st]:box('corner stile',(x,y,z0),(x+st,y+st,z1),.005,2)
 for y in[y0,y1-.035]:
  for z in[z0+.075,z1-.065]:box('frame rail',(x0+st,y,z),(x1-st,y+.035,z+.065),.004,0)
  n=3 if x1-x0>1 else 2
  for i in range(n):
   a=x0+st+i*(x1-x0-2*st)/n;b=x0+st+(i+1)*(x1-x0-2*st)/n
   yy=y+.012 if y==y0 else y-.012
   box('recessed panel',(a+.002,yy,z0+.138),(b-.002,yy+.023,z1-.067),.003,2)
 for x in[x0+.012,x1-.035]:
  box('side panel',(x,y0+st,z0+.075),(x+.023,y1-st,z1-.02),.003,1)
 box('floor panel',(x0+.025,y0+.025,z0+.06),(x1-.025,y1-.025,z0+.095),.003,0)
 # Hidden rear top rail closes the box beneath the separate lid.
 box('upper rim',(x0+.02,y0+.02,z1-.025),(x1-.02,y1-.02,z1),.003,0)

def lid(lo,hi):
 x0,y0,z0=lo;x1,y1,z1=hi;rim=.04
 for x in[x0,x1-rim]:box('breadboard end',(x,y0,z0),(x+rim,y1,z1),.004,1)
 for j in range(3):
  a=y0+j*(y1-y0)/3;b=y0+(j+1)*(y1-y0)/3
  box('lid plank',(x0+rim,a+.0008,z0),(x1-rim,b-.0008,z1),.003,0)

def merge_into(o,mat):
 old=o.data;oldmatrix=o.matrix_world.copy();before=count(o);inv=oldmatrix.inverted();verts=[];faces=[];uvs=[]
 for p in parts:
  base=len(verts);verts += [tuple(inv@(p.matrix_world@v.co))for v in p.data.vertices]
  uv=p.data.uv_layers.active
  for f in p.data.polygons:
   faces.append(tuple(base+i for i in f.vertices));uvs.append([tuple(uv.data[li].uv)for li in f.loop_indices])
 mesh=bpy.data.meshes.new(o.name+'-joinery30');mesh.from_pydata(verts,[],faces);mesh.update();mesh.materials.append(mat);uv=mesh.uv_layers.new(name='UVMap')
 for f,coords in zip(mesh.polygons,uvs):
  for li,p in zip(f.loop_indices,coords):uv.data[li].uv=p
 o.data=mesh
 for p in parts:bpy.data.objects.remove(p,do_unlink=True)
 parts.clear();o['joineryVersion']=VERSION;o['joineryOriginalTriangles']=before
 mesh.calc_loop_triangles();assert min(t.area for t in mesh.loop_triangles)>1e-12
 assert o.matrix_world==oldmatrix
 if old.users==0:bpy.data.meshes.remove(old)
 return {'name':o.name,'trianglesBefore':before,'trianglesAfter':count(o),'material':mat.name,'transformUnchanged':True}

def run(asset):
 path=ROOT/'assets/src/v2/pastoral'/f'{asset}-lived.blend';bpy.ops.wm.open_mainfile(filepath=str(path));bpy.context.view_layer.update()
 names=['pastoral_house_sleep_platform','pastoral_house_chest_body','pastoral_house_chest_lid']if asset=='house_a'else['pastoral_yurt_bedframe','pastoral_yurt_honour_chest_body','pastoral_yurt_honour_chest_lid']
 allmesh=[o for o in bpy.context.scene.objects if o.type=='MESH'];protected={o.name:digest(o)for o in allmesh if o.name not in names};before=sum(count(o)for o in allmesh);results=[];targets=[]
 assert not bpy.context.scene.get('joineryVersion'),'Restore v29 before reauthoring'
 for name in names:
  o=bpy.data.objects[name];lo,hi=bounds(o)
  if name.endswith('lid'):lid(lo,hi)
  elif name.endswith('body'):chest(lo,hi)
  else:bed(lo,hi)
  bpy.context.view_layer.update();results.append(merge_into(o,o.data.materials[0]));targets.append(o)
  nlo,nhi=bounds(o);assert np.max(np.abs(nlo-lo))<1e-6 and np.max(np.abs(nhi-hi))<1e-6,(name,lo,hi,nlo,nhi)
 if asset=='house_a':
  # The existing house has steps, not a full veranda. Add a wall-supported
  # timber entrance cap beneath its original eave; no new floor obstruction.
  for x in[-.02,2.02]:brace(x)
  box('entrance cross beam',(-.12,-3.045,2.06),(2.12,-2.985,2.14),.007,0)
  mesh=bpy.data.meshes.new('entrance support');o=bpy.data.objects.new('pastoral_house_entry_joinery',mesh);bpy.context.scene.collection.objects.link(o)
  o['detailRole']='body';o['sourcePrototype']='house_a';o['designIntent']='wall-supported timber door hood, 2.06m passage clearance; lower knees outside door sweep; design interpretation'
  bpy.context.view_layer.update();results.append(merge_into(o,bpy.data.materials['v2_pastoral_wood']));targets.append(o)
 contact_ao(targets)
 for name,h in protected.items():assert digest(bpy.data.objects[name])==h,name
 bpy.context.scene['joineryVersion']=VERSION;bpy.ops.wm.save_as_mainfile(filepath=str(path))
 after=[o for o in bpy.context.scene.objects if o.type=='MESH']
 report={'version':VERSION,'asset':asset,'source':str(path.relative_to(ROOT)),'objects':results,'meshCountBefore':len(allmesh),'meshCountAfter':len(after),'trianglesBefore':before,'trianglesAfter':sum(count(o)for o in after),'protectedMeshesUnchanged':len(protected),'protectedDigest':protected,'newTextures':0,'existingFurnitureEnvelopePreserved':True,'minimumEntranceClearance':2.06 if asset=='house_a'else None,'limitations':['Designed timber craft, not a surveyed historic household.','House under-eave woodwork is a small partly concealed first entrance component, not a full veranda.']}
 (ROOT/'assets/src/v2/pastoral'/f'{asset}-joinery-30.json').write_text(json.dumps(report,indent=2));print(json.dumps({k:v for k,v in report.items()if k!='protectedDigest'}),flush=True)
for a in['house_a','yurt']:run(a)
