"""Author the existing tea service in editable pastoral scenes, without layout regeneration.
Run tools/.bpy/bin/python tools/blender/v2_tea_service.py --asset all; then export-existing.
Preserves object identity, transforms, material slots, source exterior and v27 soft goods.
Fine geometry remains in the existing near-interior detail role; no texture or lamp added.
"""
import argparse,hashlib,json,math
from pathlib import Path
import bpy
import numpy as np
from mathutils import Vector
from v2_interior_surfaces import contact_ao
ROOT=Path(__file__).resolve().parents[2]
VERSION='pastoral-tea-service-28'

def count(o):return sum(len(p.vertices)-2 for p in o.data.polygons)
def digest(o):
 h=hashlib.sha256()
 for v in o.data.vertices:h.update(np.array(v.co[:],dtype='<f4').tobytes())
 for p in o.data.polygons:h.update(np.array(p.vertices[:],dtype='<u4').tobytes())
 h.update(np.array(o.matrix_world,dtype='<f4').tobytes())
 h.update('|'.join(m.name for m in o.data.materials).encode())
 return h.hexdigest()

def lathe(origin,profile,n=40):
 verts=[];uvs=[];rings=[];faces=[]
 for k,(r,z) in enumerate(profile):
  row=[]
  for i in range(1 if r==0 else n):
   a=math.tau*i/n;row.append(len(verts));verts.append((origin[0]+r*math.cos(a),origin[1]+r*math.sin(a),origin[2]+z));uvs.append((i/n,k/(len(profile)-1)))
  rings.append(row)
 for a,b in zip(rings,rings[1:]):
  for i in range(n):
   j=(i+1)%n
   if len(a)==1:faces.append((a[0],b[j],b[i]))
   elif len(b)==1:faces.append((a[i],a[j],b[0]))
   else:faces.append((a[i],a[j],b[j],b[i]))
 return verts,faces,uvs

def tube(origin,centres,radii,n=12,inner=False,close_ends=False,tangents=None):
 # Parallel section frame for a planar swept spout/handle. A real lumen is
 # formed by the reverse inner skin; no dark disc simulates the spout opening.
 verts=[];uvs=[];faces=[];normals=[]
 sections=[(1,range(len(centres)))]
 if inner:sections.append((.70,range(len(centres)-1,-1,-1)))
 for factor,order in sections:
  for i in order:
   p=Vector(centres[i]);t=Vector(tangents[i]) if tangents is not None else Vector(centres[min(i+1,len(centres)-1)])-Vector(centres[max(i-1,0)]);t.normalize()
   b=Vector((0,1,0));a=b.cross(t).normalized()
   for j in range(n):
    ang=math.tau*j/n;v=Vector(origin)+p+(a*math.cos(ang)+b*math.sin(ang))*radii[i]*factor
    verts.append(tuple(v));uvs.append((j/n,i/(len(centres)-1)));normals.append(tuple(a*math.cos(ang)+b*math.sin(ang)))
 rows=len(verts)//n
 for i in range(rows if inner else rows-1):
  ni=(i+1)%rows
  for j in range(n):faces.append((i*n+j,i*n+(j+1)%n,ni*n+(j+1)%n,ni*n+j))
 if close_ends:
  faces.append(tuple(reversed(range(n))));faces.append(tuple((rows-1)*n+j for j in range(n)))
 return (verts,faces,uvs,normals) if tangents is not None else (verts,faces,uvs)

def replace(o,mesh,kind):
 old=o.data;before=o.get('teaServiceOriginalTriangles',count(o));slots=list(old.materials);matrix=o.matrix_world.copy()
 verts,faces,uvs=mesh[:3];inv=matrix.inverted();coords=[tuple(inv@Vector(v)) for v in verts]
 m=bpy.data.meshes.new(o.name+'-tea28');m.from_pydata(coords,[],faces);m.update()
 for mat in slots:m.materials.append(mat)
 uv=m.uv_layers.new(name='UVMap')
 for p in m.polygons:
  p.use_smooth=True
  values=[uvs[m.loops[k].vertex_index] for k in p.loop_indices]
  seam=max(v[0] for v in values)-min(v[0] for v in values)>.5
  for k in p.loop_indices:
   u,v=uvs[m.loops[k].vertex_index];uv.data[k].uv=(u+1 if seam and u<.5 else u,v)
 if len(mesh)==4:m.normals_split_custom_set_from_vertices([tuple((inv.to_3x3()@Vector(n)).normalized())for n in mesh[3]])
 o.data=m;o['teaServiceVersion']=VERSION;o['teaServiceKind']=kind;o['teaServiceOriginalTriangles']=before
 o['designDetail']='authored household tea service; design interpretation, not a surveyed historical object'
 # Mesh winding is preserved by the parametric construction; all triangles must
 # have nonzero area and finite coordinates, including spindle centre fans.
 m.calc_loop_triangles()
 assert all(t.area>1e-12 for t in m.loop_triangles),(o.name,min(t.area for t in m.loop_triangles))
 assert all(math.isfinite(x) for v in m.vertices for x in v.co)
 assert o.matrix_world==matrix
 result={'name':o.name,'kind':kind,'trianglesBefore':before,'trianglesAfter':count(o),'verticesAfter':len(m.vertices),'transformUnchanged':True,'materialSlotsUnchanged':True}
 if old.users==0:bpy.data.meshes.remove(old)
 return result

def bounds(o):
 p=np.array([o.matrix_world@v.co for v in o.data.vertices]);return p.min(0),p.max(0)

def run(asset):
 path=ROOT/'assets/src/v2/pastoral'/f'{asset}-lived.blend';bpy.ops.wm.open_mainfile(filepath=str(path));bpy.context.view_layer.update()
 allmeshes=[o for o in bpy.context.scene.objects if o.type=='MESH']
 targets=[o for o in allmeshes if o.name.startswith('pastoral_') and ('_bowl' in o.name or '_low_table_tray' in o.name or '_low_table_tea' in o.name or '_stove_kettle' in o.name)]
 protected={o.name:digest(o) for o in allmeshes if o not in targets}
 changed=[];results=[]
 bases={o.name:bounds(o)[0]+(bounds(o)[1]-bounds(o)[0])*np.array([.5,.5,0]) for o in targets if o.name.endswith(('_tea','_kettle'))}
 for o in targets:
  if o.get('teaServiceVersion')==VERSION and not args.force:continue
  lo,hi=bounds(o);origin=(lo+hi)*.5;origin[2]=lo[2]
  if '_bowl' in o.name:
   r=(hi[0]-lo[0])/2;h=hi[2]-lo[2]
   # Continuous ceramic wall, rolled lip and recessed foot; same external envelope.
   profile=[(0,.075),(.34,.075),(.36,0),(.44,0),(.47,.07),(.49,.14),(.63,.24),(.78,.45),(.91,.70),(.985,.91),(1,.96),(.987,1),(.952,1),(.932,.94),(.86,.70),(.72,.46),(.55,.30),(.32,.24),(0,.24)]
   mesh=lathe(origin,[(r*a,h*b)for a,b in profile],32);kind='footed hollow ceramic bowl'
  elif '_low_table_tray' in o.name:
   r=(hi[0]-lo[0])/2;h=hi[2]-lo[2]
   # Original placement and envelope; spun edge gives a readable rolled
   # rim rather than the previous flat cylinder, without moving the tea service.
   profile=[(0,0),(.90,0),(.97,.07),(1,.30),(1,.75),(.99,1),(.975,1),(.956,.80),(.945,.66),(.91,.65),(0,.65)]
   mesh=lathe(origin,[(r*a,h*b)for a,b in profile],64);kind='rolled rim brass tray'
  else:
   base=next((p for n,p in bases.items() if o.name==n or o.name.startswith(n+'_')),None);assert base is not None,o.name
   if o.name in bases:
    profile=[(0,0),(.034,0),(.072,.003),(.105,.012),(.123,.027),(.135,.053),(.140,.085),(.139,.118),(.130,.151),(.115,.183),(.098,.213),(.087,.230),(.081,.234),(.080,.239),(.084,.241),(.083,.245),(.071,.249),(.042,.253),(0,.255)]
    mesh=lathe(base,profile,40);kind='rounded kettle body with seated lid seam'
   elif '_lid' in o.name:
    # Existing wooden lid knob envelope and material retained, now with turned shoulders.
    r=(hi[1]-lo[1])/2;h=hi[2]-lo[2]
    mesh=lathe(origin,[(r*a,h*b)for a,b in [(0,0),(.60,0),(.68,.12),(.78,.20),(.97,.40),(1,.60),(.92,.83),(.65,1),(0,1)]],24);kind='turned wooden lid knob'
   elif '_spout' in o.name:
    control=np.array([[.095,0,.10],[.162,0,.124],[.150,0,.197],[.220,0,.230]])
    ts=np.linspace(0,1,13);centres=[(1-t)**3*control[0]+3*(1-t)**2*t*control[1]+3*(1-t)*t*t*control[2]+t**3*control[3] for t in ts]
    radii=[.031*(1-t)+.021*t+.0015*math.exp(-((t-.96)/.055)**2) for t in ts]
    mesh=tube(base,centres,radii,16,inner=True);kind='curved hollow kettle spout'
   else:
    index=int(o.name.rsplit('.',1)[1]) if '.' in o.name else 0
    theta=np.linspace(index/9*math.pi,(index+1)/9*math.pi,5)
    centres=[(-.14*math.cos(a),0,.19+.13*math.sin(a))for a in theta]
    mesh=tube(base,centres,[.014]*len(centres),12,close_ends=False,tangents=[(.14*math.sin(a),0,.13*math.cos(a))for a in theta]);kind='continuous curved iron handle segment'
  results.append(replace(o,mesh,kind));changed.append(o)
 if changed:
  contact_ao(changed)
  for o in changed:
   c=o.data.color_attributes.get('Color');assert c and len(c.data)==len(o.data.vertices)
  for name,d in protected.items():assert digest(bpy.data.objects[name])==d,name
  assert sum(o.get('softGoodsVersion')=='pastoral-soft-goods-27' for o in allmeshes)==7
  bpy.context.scene['teaServiceVersion']=VERSION
  bpy.context.scene['teaServiceScope']='existing kettles, bowls and tea trays; original object count, placement, materials and fine-detail range'
  bpy.ops.wm.save_as_mainfile(filepath=str(path))
 report={'asset':asset,'version':VERSION,'objects':results,'changedMeshes':len(changed),'protectedMeshesUnchanged':len(protected),'protectedDigest':protected,'meshCountBefore':len(allmeshes),'meshCountAfter':sum(o.type=='MESH' for o in bpy.context.scene.objects),'trianglesAfter':sum(count(o)for o in allmeshes),'source':str(path.relative_to(ROOT)),'originalMaterialsRetained':True,'newTextures':0}
 report['trianglesBefore']=report['trianglesAfter']-sum(r['trianglesAfter']-r['trianglesBefore'] for r in results)
 out=ROOT/'assets/src/v2/pastoral'/f'{asset}-tea-service-28.json'
 if results or not out.exists():out.write_text(json.dumps(report,indent=2))
 print(json.dumps({k:v for k,v in report.items()if k not in ('objects','protectedDigest')}),flush=True)

if __name__=='__main__':
 parser=argparse.ArgumentParser(description=__doc__);parser.add_argument('--asset',choices=['all','house_a','yurt'],default='all');parser.add_argument('--force',action='store_true',help='Reauthor the same family, retaining recorded original geometry cost');args=parser.parse_args()
 for asset in ['house_a','yurt'] if args.asset=='all' else [args.asset]:run(asset)
