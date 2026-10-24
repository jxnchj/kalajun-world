from pathlib import Path
import bpy,json,struct,hashlib
ROOT=Path(__file__).resolve().parents[2];D=ROOT/'assets/src/v2/settlements/lodge-furniture-v38';r=json.loads((D/'metadata.json').read_text())
bpy.ops.wm.open_mainfile(filepath=str(D/'lodge-furniture.blend'))
assert len([o for o in bpy.context.scene.objects if o.type in ('MESH','CURVE')])==92
assert sum(o.type=='CURVE'for o in bpy.context.scene.objects)==6
assert all(o.modifiers.get('Editable soft edge radius')for o in bpy.context.scene.objects if 'cushion'in o.name and o.type=='MESH')
assert bpy.data.images['lodge cloth weave normal 8cm'].packed_file is not None
raw=(D/'lodge-furniture.glb').read_bytes();length=struct.unpack_from('<I',raw,12)[0];doc=json.loads(raw[20:20+length]);meshes=doc['meshes'];nodes=[n for n in doc['nodes']if 'mesh'in n];tris=sum(sum(doc['accessors'][p['indices']]['count']//3 for p in meshes[n['mesh']]['primitives'])for n in nodes)
assert tris==r['totalTriangles'],(tris,r['totalTriangles'])
assert len(nodes)==16 and len(meshes)==8,(len(nodes),len(meshes))
assert len(doc['textures'])==1
# Real GLB reopen, not merely source counts.
bpy.ops.wm.read_factory_settings(use_empty=True);bpy.ops.import_scene.gltf(filepath=str(D/'lodge-furniture.glb'))
assert len([o for o in bpy.context.scene.objects if o.type=='MESH'])==16
for g in r['groups']:
 objects=[o for o in bpy.context.scene.objects if g['name'] in o.name and o.type=='MESH'];assert objects,g['name']
 # Clone names include first washer template; use semantic prefix to disambiguate.
 objects=[o for o in objects if o.name.startswith('export '+g['name']) or o.name.startswith(g['name'])]
 lo=[float('inf')]*3;hi=[-float('inf')]*3
 for o in objects:
  for v in o.data.vertices:
   p=o.matrix_world@v.co
   for i in range(3):lo[i]=min(lo[i],p[i]);hi[i]=max(hi[i],p[i])
 for i in range(3):assert abs(lo[i]-g['actualBounds'][0][i])<1e-5 and abs(hi[i]-g['actualBounds'][1][i])<1e-5,(g['name'],lo,hi)
assert hashlib.sha256((ROOT/'web/public/assets/gh_lanchuan_lodge.glb').read_bytes()).hexdigest()==r['sourceSHA256']
r['verified']={'independentBlendReopen':True,'editableObjects':92,'seamCurves':6,'packedNormal':True,'independentGLBReopen':True,'nodes':len(nodes),'uniqueGLTFMeshes':len(meshes),'renderTriangles':tris,'originalEnvelopeRetained':True,'originalAssetUnchanged':True}
(D/'metadata.json').write_text(json.dumps(r,indent=2)+'\n');print(json.dumps(r['verified']))
