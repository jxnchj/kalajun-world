"""Independent actual pre/post AO .blend reload and channel-limited invariance."""
import sys,json,hashlib,ast,argparse,time,math,traceback
from pathlib import Path
import bpy
H=Path(__file__).resolve().parent;R=H.parents[1];sys.path.insert(0,str(H));sys.dont_write_bytecode=True
from post_ao_inputs import bind,sha
from ao_readback_contract import check_rgba
sys.path.insert(0,str(R/'backups/cloud75-textile-gi-staging'))
from material_fingerprint import fingerprint_scene_materials,digest as mdigest
p=argparse.ArgumentParser();p.add_argument('--ao',type=Path,required=True);p.add_argument('--receipt',type=Path,required=True);p.add_argument('--report',type=Path,required=True);args=p.parse_args(sys.argv[sys.argv.index('--')+1:]);pre,post,binding=bind(args.ao,args.receipt)
runtime=json.loads((H/'runtime-provenance.json').read_text());assert sha(bpy.app.binary_path)==runtime['binarySHA256']
base_audit=json.loads((pre['blend'].parent/'audit.json').read_text());generator=H/'stage_volume75_v4.py';assert sha(generator)==base_audit['correctedStateIdentity']['dependencies']['backups/cloud75-textile-volume-staging/stage_volume75_v4.py']
tree=ast.parse(generator.read_text());main=next(n for n in tree.body if isinstance(n,ast.FunctionDef)and n.name=='main');ns={};exec(compile(ast.Module(body=[n for n in main.body if isinstance(n,ast.FunctionDef)and n.name in ('array','snapshot')],type_ignores=[]),str(generator),'exec'),ns);snapshot=ns['snapshot']
changed={'pastoral_house_chest_folded'+str(i)for i in range(4)}|{'pastoral_house_chest_topcover'}
def scene_meta():
 result={}
 for o in bpy.context.scene.objects:
  assert not o.modifiers and (o.type!='MESH'or o.data.shape_keys is None)
  row={'type':o.type,'matrixWorld':[list(r)for r in o.matrix_world],'matrixLocal':[list(r)for r in o.matrix_local],'parent':o.parent.name if o.parent else None,'hideRender':o.hide_render,'hideViewport':o.hide_viewport}
  if o.type=='EMPTY':row.update(displayType=o.empty_display_type,displaySize=o.empty_display_size)
  result[o.name]=row
 return result

def colors(obj):
 a=obj.data.color_attributes.get('Color');assert a is not None
 return {'domain':a.domain,'dataType':a.data_type,'values':[list(v.color)for v in a.data],'activeColorIndex':obj.data.color_attributes.active_color_index,'renderColorIndex':obj.data.color_attributes.render_color_index}
def normals(obj):return {'vertices':[list(v.normal)for v in obj.data.vertices],'corners':[list(n.vector)for n in obj.data.corner_normals]}
started=time.monotonic();report={'status':'INCOMPLETE','binding':binding,'scriptSHA256':sha(__file__),'inputBinderSHA256':sha(H/'post_ao_inputs.py'),'materialHelperSHA256':sha(R/'backups/cloud75-textile-gi-staging/material_fingerprint.py'),'snapshotGeneratorSHA256':sha(generator),'colorContractSHA256':sha(H/'ao_readback_contract.py'),'runtimeBinarySHA256':runtime['binarySHA256'],'rows':[]}
try:
 bpy.ops.wm.open_mainfile(filepath=str(pre['blend']));bpy.context.view_layer.update();before_meta=scene_meta();assert len(before_meta)==269 and sum(v['type']=='EMPTY'for v in before_meta.values())==2
 old={};frozen={};oldcolors={};oldnormals={}
 for o in bpy.context.scene.objects:
  if o.type!='MESH':continue
  snap=snapshot(o)
  if o.name in changed:old[o.name]=snap;oldcolors[o.name]=colors(o);oldnormals[o.name]=normals(o)
  else:frozen[o.name]=hashlib.sha256(json.dumps(snap,sort_keys=True).encode()).hexdigest()
 assert len(frozen)==262 and len(old)==5
 material_before=fingerprint_scene_materials(bpy.context.scene,R);assert material_before['sha256']==mdigest(material_before['details'])
 bpy.ops.wm.open_mainfile(filepath=str(post['blend']));bpy.context.view_layer.update();assert scene_meta()==before_meta,'Scene object/type/transform/empty invariance failed'
 newfrozen={}
 for o in bpy.context.scene.objects:
  if o.type!='MESH':continue
  snap=snapshot(o)
  if o.name not in changed:newfrozen[o.name]=hashlib.sha256(json.dumps(snap,sort_keys=True).encode()).hexdigest();continue
  for key in snap:
   if key!='attributes':assert snap[key]==old[o.name][key],(o.name,key)
  assert set(snap['attributes'])==set(old[o.name]['attributes'])
  for key,value in old[o.name]['attributes'].items():
   if key!='Color':assert snap['attributes'][key]==value,(o.name,'non-AO attribute',key)
  assert normals(o)==oldnormals[o.name],(o.name,'normals changed')
  c=colors(o);prior=oldcolors[o.name];assert {k:v for k,v in c.items()if k!='values'}=={k:v for k,v in prior.items()if k!='values'}
  result=check_rgba(prior['values'],c['values']);report['rows'].append({'name':o.name,**result,'XYZTopologyUVNormalsNonAOAttributesExact':True})
 assert newfrozen==frozen,'Frozen262 mesh attributes changed'
 material_after=fingerprint_scene_materials(bpy.context.scene,R);assert material_after['sha256']==mdigest(material_after['details']);assert mdigest(material_after['details'])==mdigest(material_before['details'])
 report.update(status='PASS_POST_AO_SAVED_BLEND_CHANNEL_LIMITED_INVARIANCE',objects=269,frozenMeshes=262,emptyTransforms=2,unchangedTextileMeshes=4,materialFingerprintSHA256=material_after['sha256'],geometryRemeasured=False,scope='Actual saved pre/post files reopened; only five Color R/G AO allowed and A1, B exact. Previous geometry proof may transfer by proven invariance; AO/GI/world visual acceptance does not transfer.')
except Exception:
 report['status']='FAILED';report['error']=traceback.format_exc();raise
finally:
 report['wallSeconds']=time.monotonic()-started;report['boundInputsUnchanged']=all(sha(v['path'])==v['sha256']for field in ('preAO','postAO')for v in binding[field].values());args.report.parent.mkdir(parents=True,exist_ok=True);args.report.write_text(json.dumps(report,indent=2)+'\n');assert report['boundInputsUnchanged']
print(json.dumps({k:v for k,v in report.items()if k!='binding'}))
