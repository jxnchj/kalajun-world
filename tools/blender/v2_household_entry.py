"""Editable, entity-specific split-stone entry, retaining the verified stair contract.

First author: node tools/export_household_entry_recipe.mjs
              blender -b --python tools/blender/v2_household_entry.py
Re-export artist edits: blender -b --python tools/blender/v2_household_entry.py -- --export
Reauthoring requires explicit --rebuild and never modifies the original house.
The source preserves separate stones, the complete canonical stone material and site context.
"""
import bpy, json, math, random, hashlib, sys
from pathlib import Path
from mathutils import Vector
sys.path.insert(0,str(Path(__file__).resolve().parent))
from v2_interior_surfaces import contact_ao
ROOT=Path(__file__).resolve().parents[2]
VERSION='household-entry-tea-34'
GEOMETRY_REVISION='front-bevel-17p111mm'
RECIPE=ROOT/f'assets/src/v2/pastoral/{VERSION}.recipe.json'
SOURCE=ROOT/f'assets/src/v2/pastoral/{VERSION}.blend'
META=ROOT/f'assets/src/v2/pastoral/{VERSION}.metadata.json'
OUT=ROOT/'web/public/assets/v2/household_entry_tea.glb'
HOUSE=ROOT/'assets/src/v2/pastoral/house_a-lived.blend'
LIVING=ROOT/'assets/src/v2/pastoral/household-living-32.blend'
sha=lambda p:hashlib.sha256(p.read_bytes()).hexdigest()
args=sys.argv[sys.argv.index('--')+1:]if'--'in sys.argv else[]
recipe=json.loads(RECIPE.read_text());scale=recipe['pose']['scale'];sx,sy,sz=scale['x'],scale['y'],scale['z']
protected={str(p.relative_to(ROOT)):sha(p)for p in [HOUSE,LIVING]}

def stone(name,x0,x1,z0,z1,bottom,top,seed,kind,course):
 rng=random.Random(seed);positions=[];faces=[];uvs=[]
 # Chipped corners and slightly broken edges, never beyond the verified envelope.
 ring=[(.045,0),(.43,.004),(.93,0),(1,.07),(.997,.48),(1,.94),(.93,1),(.54,.996),(.065,1),(0,.92),(.003,.48),(0,.075)]
 outer=[(x0+u*(x1-x0),z0+v*(z1-z0))for u,v in ring]
 cx,cz=(x0+x1)/2,(z0+z1)/2
 def inset(points,amount,z_amount=None):return [(x+(cx-x)*amount/(max(.05,(x1-x0)/2)),z+(cz-z)*(amount if z_amount is None else z_amount)/(max(.05,(z1-z0)/2)))for x,z in points]
 edge=.010/min(sx,sz) if kind=='tread' else .014/min(sx,sz)
 # Match the retained 18/22 bevel slope using a 14mm-high, 17.111mm-deep
 # front/back bevel; x joints, bottom ring, outer shoulder and level tops stay.
 if kind=='tread':rings=[(bottom,inset(outer,edge*.5)),(top-.014/sy,outer),(top,inset(outer,edge,(.014*.022/.018)/sz))]
 else:
  middle=[(max(x0,min(x1,x+rng.uniform(-.006,.006)/sx)),max(z0,min(z1,z+rng.uniform(-.006,.006)/sz)))for x,z in outer]
  rings=[(bottom,inset(outer,edge*.7)),(bottom+(top-bottom)*.4,middle),(top-.015/sy,inset(outer,edge*.25)),(top,inset(outer,edge))]
 def face(points):
  start=len(positions);a,b,c=map(Vector,points[:3]);normal=(b-a).cross(c-a);axis=max(range(3),key=lambda k:abs(normal[k]))
  for x,y,z in points:
   positions.append((x,-z,y));p=(x*sx,y*sy,z*sz)
   uvs.append((p[0]*2,p[2]*2)if axis==1 else (p[2]*2,p[1]*2)if axis==0 else (p[0]*2,p[1]*2))
  faces.append(tuple(range(start,len(positions))))
 face([(x,rings[0][0],z)for x,z in rings[0][1]])
 face([(x,top,z)for x,z in rings[-1][1]][::-1])
 for (ya,pa),(yb,pb)in zip(rings,rings[1:]):
  for i in range(len(outer)):
   j=(i+1)%len(outer);a,b,c,d=pa[i],pa[j],pb[j],pb[i]
   face([(a[0],ya,a[1]),(b[0],ya,b[1]),(c[0],yb,c[1]),(d[0],yb,d[1])][::-1])
 mesh=bpy.data.meshes.new(name);mesh.from_pydata(positions,[],faces);mesh.update();o=bpy.data.objects.new(name,mesh);bpy.context.collection.objects.link(o);mesh.materials.append(bpy.data.materials['stone']);uv=mesh.uv_layers.new(name='UVMap')
 for f in mesh.polygons:
  for li in f.loop_indices:uv.data[li].uv=uvs[mesh.loops[li].vertex_index]
 o['entryVersion']=VERSION;o['entityId']=recipe['entityId'];o['sourceMaterial']='stone';o['detailRole']='body';o['course']=course;o['stoneKind']=kind;o['authoringNote']='Editable individual stone; retain level tread and exterior footprint when adjusting';return o

def author():
 bpy.ops.wm.open_mainfile(filepath=str(HOUSE));context=list(bpy.context.scene.objects)
 with bpy.data.libraries.load(str(LIVING),link=False)as(src,dst):dst.objects=[n for n in src.objects if n.startswith('household_0_')]
 for o in dst.objects:bpy.context.scene.collection.objects.link(o)
 context+=dst.objects
 ground=recipe['ground'];verts=[(x,-z,y)for x,y,z in ground['positions']];faces=[];cols=ground['columns']
 for j in range(ground['rows']-1):
  for i in range(cols-1):a=j*cols+i;faces.append((a,a+cols,a+1));faces.append((a+1,a+cols,a+cols+1))
 me=bpy.data.meshes.new('site final terrain reference');me.from_pydata(verts,[],faces);me.update();ground_obj=bpy.data.objects.new('site_terrain_for_contact',me);bpy.context.scene.collection.objects.link(ground_obj);me.materials.append(bpy.data.materials['stone']);context.append(ground_obj)
 stones=[]
 for i,c in enumerate(recipe['courses']):
  # Joint locations alternate away from the central x=1 walking line. Flat
  # treads keep the original heights; joints are only 4mm before edge bevels.
  split=.76 if i%2==0 else 1.31;gap=.004/sx;cuts=[c['x0'],split,c['x1']];slab_bottom=c['top']-.105/sy
  for k,(a,b)in enumerate(zip(cuts,cuts[1:])):
   stones.append(stone(f'entry_course_{i}_tread_{k}',a+(gap/2 if k else 0),b-(gap/2 if k<1 else 0),c['z0'],c['z1'],slab_bottom,c['top'],i*41+k,'tread',i))
  rows=max(1,math.ceil((slab_bottom-c['bottom'])/(.145/sy)));h=(slab_bottom-c['bottom'])/rows
  for row in range(rows):
   n=3 if (i+row)%2==0 else 2;offset=.10 if n==3 else -.09;cuts=[c['x0']]+[c['x0']+(c['x1']-c['x0'])*k/n+offset for k in range(1,n)]+[c['x1']]
   for k,(a,b)in enumerate(zip(cuts,cuts[1:])):
    stones.append(stone(f'entry_course_{i}_bedding_{row}_{k}',a+(gap/2 if k else 0),b-(gap/2 if k<n-1 else 0),c['z0'],c['z1'],c['bottom']+h*row,slab_bottom if row==rows-1 else c['bottom']+h*(row+1),1000+i*97+row*11+k,'bedding',i))
 # AO/sky are actual ray-tested data against the unchanged house, tea group,
 # new masonry and the actual final ground. No dark pigment or solar shadows.
 contact_ao(stones)
 for o in context:o.name='preview_'+o.name;o.hide_set(True)
 # Keep the context renderable for an explicit preview, but non-exported.
 bpy.context.scene['entryGeometryRevision']=GEOMETRY_REVISION;bpy.context.scene['entryVersion']=VERSION;bpy.context.scene['entryEntityId']=recipe['entityId'];bpy.context.scene['entryRecipeSHA256']=sha(RECIPE)
 bpy.context.scene['entryAuthoring']='Individual closed stones with stable level treads; script regeneration is explicit, --export preserves manual edits.'
 bpy.context.scene['entryLighting']='32-direction 1m contact AO and sky visibility against original house, tea furniture, new stones and site ground; no albedo lighting bake.'
 bpy.ops.object.select_all(action='DESELECT')
 for o in stones:o.select_set(True)
 bpy.context.view_layer.objects.active=stones[0]
 bpy.ops.wm.save_as_mainfile(filepath=str(SOURCE),compress=False)
 return stones

if '--export'in args:
 if not SOURCE.exists():raise RuntimeError('Editable source does not exist; author it first')
 bpy.ops.wm.open_mainfile(filepath=str(SOURCE));stones=[o for o in bpy.context.scene.objects if o.type=='MESH'and o.get('entryVersion')==VERSION]
 # Recompute derived vertex data after artist edits without reauthoring geometry.
 contexts=[(o,o.name)for o in bpy.context.scene.objects if o.name.startswith('preview_')and not o.name.startswith('preview_preview_')]
 for o,name in contexts:o.name='contact_'+name[8:]
 for o in stones:
  for attr in list(o.data.color_attributes):o.data.color_attributes.remove(attr)
 contact_ao(stones)
 for o,name in contexts:o.name=name
 bpy.ops.wm.save_as_mainfile(filepath=str(SOURCE),compress=False)
else:
 if SOURCE.exists()and'--rebuild'not in args:raise RuntimeError('Refusing to overwrite editable source; use --export for edits or explicit --rebuild to regenerate')
 stones=author()
assert stones and all(o.get('entityId')==recipe['entityId']for o in stones)
geometry_revision=bpy.context.scene.get('entryGeometryRevision','initial-10mm')
triangles=0
for o in stones:o.data.calc_loop_triangles();triangles+=len(o.data.loop_triangles)
ao_values=[tuple(c.color)for o in stones for c in o.data.color_attributes['Color'].data]
ao_stats={'vertices':len(ao_values),'minAO':min(c[0]for c in ao_values),'maxAO':max(c[0]for c in ao_values),'minSky':min(c[2]for c in ao_values),'maxSky':max(c[2]for c in ao_values)}
source_stones=[{'name':o.name,'kind':o['stoneKind'],'course':o['course'],'triangles':len(o.data.loop_triangles)}for o in stones]
# Export one complete mesh; the source keeps all individual editable objects.
for o in bpy.context.scene.objects:o.hide_set(False);o.select_set(False)
for o in stones:o.select_set(True)
bpy.context.view_layer.objects.active=stones[0];bpy.ops.object.join();merged=bpy.context.object;merged.name='entry_tea_complete_stonework';merged['geometryRevision']=geometry_revision;merged['entryVersion']=VERSION;merged['entityId']=recipe['entityId'];merged['sourceMaterial']='stone';merged['detailRole']='body';merged['recipeSHA256']=sha(RECIPE);merged['courseContract']=[c[k]for c in recipe['courses']for k in ['x0','x1','z0','z1','top','bottom']];merged['instanceScale']=[sx,sy,sz]
for m in bpy.data.materials:
 if m.use_nodes:
  for n in list(m.node_tree.nodes):
   if n.type=='TEX_IMAGE':m.node_tree.nodes.remove(n)
bpy.ops.export_scene.gltf(filepath=str(OUT),export_format='GLB',use_selection=True,export_apply=True,export_extras=True,export_vertex_color='ACTIVE',export_all_vertex_colors=False,export_animations=False,export_lights=False,export_cameras=False)
assert all(sha(ROOT/p)==h for p,h in protected.items()),'Original house/living source was modified'
meta={'blenderVersion':bpy.app.version_string,'blenderBuildHash':bpy.app.build_hash.decode(),'version':VERSION,'geometryRevision':geometry_revision,'entityId':recipe['entityId'],'householdStyle':0,'sourceBlend':str(SOURCE.relative_to(ROOT)),'blendSHA256':sha(SOURCE),'sourceGLB':str(OUT.relative_to(ROOT/'web/public')),'sourceSHA256':sha(OUT),'recipe':str(RECIPE.relative_to(ROOT)),'recipeSHA256':sha(RECIPE),'triangles':triangles,'bakedOcclusion':ao_stats,'stones':source_stones,'courses':recipe['courses'],'newTextures':0,'canonicalMaterial':'stone','unchangedOriginalSources':protected,'scope':'One designed tea-house approach only; original house, all other households and global color/light untouched.','limits':['Static local AO/sky are not complete dynamic GI.','Matching entity-specific indoor transport must be rebuilt after edits.','Browser multi-angle and walking acceptance remains required.']}
META.write_text(json.dumps(meta,indent=2)+'\n');print(json.dumps(meta),flush=True)
