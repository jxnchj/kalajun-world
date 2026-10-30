"""Independent saved .blend reload; no render/save/production mutation."""
import bpy,sys,ast,json,hashlib,argparse,time
from pathlib import Path
H=Path(__file__).resolve().parent;R=H.parents[1];sys.dont_write_bytecode=True
p=argparse.ArgumentParser();p.add_argument('--candidate',type=Path,required=True);a=p.parse_args(sys.argv[sys.argv.index('--')+1:]);C=a.candidate.resolve();assert C.parent==H
sha=lambda p:hashlib.sha256(Path(p).read_bytes()).hexdigest();audit=json.loads((C/'audit.json').read_text());source=R/'assets/src/v2/pastoral/textiles62/house-a-textiles62.blend';candidate=C/'textile-volume75.blend';assert sha(candidate)==audit['outputSHA256'][candidate.name]
assert sha(source)==audit['protectedInputs'][str(source.relative_to(R))]
assert sha(bpy.app.binary_path)==audit['correctedStateIdentity']['runtimeBinarySHA256']
script=H/'stage_volume75_v4.py';assert sha(script)==audit['correctedStateIdentity']['dependencies']['backups/cloud75-textile-volume-staging/stage_volume75_v4.py']
# Reuse the exact audited snapshot functions without running the generator.
tree=ast.parse(script.read_text());main=next(n for n in tree.body if isinstance(n,ast.FunctionDef)and n.name=='main');nodes=[n for n in main.body if isinstance(n,ast.FunctionDef)and n.name in ('array','snapshot')];assert len(nodes)==2
namespace={};exec(compile(ast.Module(body=nodes,type_ignores=[]),str(script),'exec'),namespace);snapshot=namespace['snapshot']
assert sha(R/'backups/cloud75-textile-gi-staging/material_fingerprint.py')==audit['materialFingerprintHelperSHA256']
sys.path.insert(0,str(R/'backups/cloud75-textile-gi-staging'));from material_fingerprint import fingerprint_scene_materials,digest as material_digest
def verify_material_roundtrip(actual,expected):
 assert actual['sha256']==material_digest(actual['details']),'Actual fingerprint inconsistent'
 assert expected['sha256']==material_digest(expected['details']),'Expected fingerprint inconsistent'
 assert material_digest(actual['details'])==material_digest(expected['details']),'Full canonical material/image content differs'
 return True
changed=set(audit['rawVertexReadback']);assert len(changed)==5
inputs={str(source):sha(source),str(candidate):sha(candidate),str(C/'geometry.glb'):sha(C/'geometry.glb')};start=time.monotonic();report={'status':'INCOMPLETE','inputs':inputs,'generatorSnapshotSHA256':sha(script),'auditSHA256':sha(C/'audit.json'),'runtimeBinarySHA256':sha(bpy.app.binary_path),'changed':[]}
def empties():return {o.name:{'matrixWorld':[list(r)for r in o.matrix_world],'parent':o.parent.name if o.parent else None,'displayType':o.empty_display_type,'displaySize':o.empty_display_size}for o in bpy.context.scene.objects if o.type=='EMPTY'}
try:
 bpy.ops.wm.open_mainfile(filepath=str(source));bpy.context.view_layer.update();old={n:snapshot(bpy.data.objects[n])for n in changed};empty_before=empties();assert len(empty_before)==2
 bpy.ops.wm.open_mainfile(filepath=str(candidate));bpy.context.view_layer.update();assert {o.name:o.type for o in bpy.context.scene.objects}==audit['sceneObjectTypes'];assert empties()==empty_before
 frozen={}
 for obj in bpy.context.scene.objects:
  if obj.type!='MESH':continue
  snap=snapshot(obj)
  if obj.name not in changed:frozen[obj.name]=hashlib.sha256(json.dumps(snap,sort_keys=True).encode()).hexdigest();continue
  for key in ('matrix','edges','polygons','loopTriangles','smooth','materialIndex','loopVertex','uv','materials'):assert snap[key]==old[obj.name][key],(obj.name,key)
  assert set(snap['attributes'])==set(old[obj.name]['attributes'])
  for key,value in old[obj.name]['attributes'].items():
   if key!='position':assert snap['attributes'][key]==value,(obj.name,'attribute',key)
  points=[list(obj.matrix_world@v.co)for v in obj.data.vertices];assert points==audit['rawVertexReadback'][obj.name]['after'],(obj.name,'saved world XYZ differs')
  report['changed'].append({'name':obj.name,'rawVertices':len(points),'triangles':len(snap['loopTriangles']),'exactXYZAndProtectedTopologyAttributes':True})
 assert frozen==audit['frozenMeshFingerprints']and len(frozen)==262
 material=fingerprint_scene_materials(bpy.context.scene,R);report['materialFingerprintActual']=material;report['materialFingerprintExpectedSHA256']=audit['materialFingerprintBefore']['sha256'];verify_material_roundtrip(material,audit['materialFingerprintBefore'])
 report.update(status='SAVED_BLEND_RELOAD_CHECKS_PASSED_NOT_GI_OR_WORLD_ACCEPTANCE',frozenMeshCount=262,frozenMeshFingerprintsSHA256=hashlib.sha256(json.dumps(frozen,sort_keys=True).encode()).hexdigest(),emptyTransformsUnchanged=True,materialFingerprintSHA256=material['sha256'])
finally:
 report['wallSeconds']=time.monotonic()-start;report['inputsUnchanged']=all(sha(p)==h for p,h in inputs.items());(C/'saved-blend-readback.json').write_text(json.dumps(report,indent=2)+'\n');assert report['inputsUnchanged']
print(json.dumps(report))
