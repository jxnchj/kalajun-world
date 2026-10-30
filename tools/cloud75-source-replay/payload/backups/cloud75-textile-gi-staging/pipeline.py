"""Preparation-only staging driver. Run with Blender -b --python ... -- ARGS.
Never imports a historical script as __main__; never writes production paths.
"""
import argparse, hashlib, json, os, sys, time, traceback
from pathlib import Path
HERE=Path(__file__).resolve().parent
# Blender --python does not guarantee the script directory on sys.path.
if str(HERE) not in sys.path:sys.path.insert(0,str(HERE))
ROOT=HERE.parents[1]
SOURCE_BLEND=ROOT/'assets/src/v2/pastoral/textiles62/house-a-textiles62.blend'
SOURCE_BLEND_SHA='c1a1e09f4fca922a94544c10f3f48a41ceb29ca50be4bac945bfeefb72113397'
KEYS=['house_a',*[f'house_a-living-{i}' for i in range(3)],'house_a-entry-tea-34']
CHANGED=[f'pastoral_house_chest_folded{i}' for i in range(4)]+['pastoral_house_chest_topcover']
sha=lambda p:hashlib.sha256(Path(p).read_bytes()).hexdigest()
def require(ok, message):
 if not ok: raise ValueError(message)
def read_module(p):return json.loads(p.read_text().split('export default ',1)[1].rsplit(';',1)[0])
def receipt_check(path,stage):
 r=json.loads(path.read_text());require(r['stage']==stage and r['approvedForStaging'] is True,'Explicit stage release required')
 require(r.get('schemaVersion')==1 and r.get('approvedBy')=='root','Root schema-1 release required')
 require(r['candidateVersion']>=4,'Rejected v2 is never eligible')
 require(r['gates']['geometry3D'] is True and r['gates']['sameConditionGeometryVisual'] is True,'Geometry and visual release required')
 if stage=='gi':require(r['gates']['aoReadback'] is True,'AO readback must pass before GI')
 for item in r['evidence']:
  p=Path(item['path']).resolve();require(sha(p)==item['sha256'],f'Evidence changed: {p}')
 roles=['geometry3D','sameConditionGeometryVisual']+(['aoReadback'] if stage=='gi' else [])
 require({e.get('role') for e in r['evidence']}==set(roles) and len(r['evidence'])==len(roles),'Require distinct typed geometry/visual/AO evidence')
 for item in r['evidence']:
  e=json.loads(Path(item['path']).read_text())
  require(e.get('status')=='PASS' and e.get('approvedBy')=='root' and e.get('role')==item['role'],'Evidence must be root-reviewed PASS for its role')
  require(e.get('inputs')==r['inputs'],'Evidence must bind exact current candidate trio; no old payload relabel')
 require(sha(SOURCE_BLEND)==SOURCE_BLEND_SHA,'Original source Blend changed')
 paths={k:Path(v['path']).resolve() for k,v in r['inputs'].items()}
 for k,p in paths.items():
  require(p.is_relative_to(ROOT/'backups'),'Candidate inputs must be staging files')
  require('candidate-v2' not in p.parts,'Rejected v2 input forbidden')
  require(sha(p)==r['inputs'][k]['sha256'],f'Input hash mismatch: {k}')
 require(set(paths)=={'blend','geometry','manifest'},'Require complete candidate trio')
 m=json.loads(paths['manifest'].read_text());original=json.loads((ROOT/'web/public/assets/v2/house-textiles62/manifest.json').read_text())
 require(m['geometrySHA256']==sha(paths['geometry']),'Geometry binding mismatch')
 require(m['sourceSHA256']==sha(ROOT/'web/public/assets/v2/house_a_lived.glb'),'Original source binding mismatch')
 require(m['nodes']==original['nodes'],'Nine original node names/order/attribute source bindings must match')
 return r,paths,m

def scene_guard(source,candidate,textiles):
 """Pure structural/frozen fingerprint gate, also exercised without Blender."""
 require(len(source)==269 and sum(v['type']=='MESH' for v in source.values())==267 and sum(v['type']=='EMPTY' for v in source.values())==2,'Original scene must be 269 objects / 267 meshes / 2 empties')
 require(set(source)==set(candidate),'Candidate object names differ from original')
 require(len(textiles)==9 and len(set(textiles))==9 and set(CHANGED)<=set(textiles),'Nine textiles including five changed nodes required')
 for name,original in source.items():
  current=candidate[name]
  require(current['type']==original['type'],f'Object type changed: {name}')
  if name not in CHANGED:require(current==original,f'Frozen object changed: {name}')
 for name in textiles:require(source[name]['type']=='MESH','Textile must be mesh')
 frozen=[n for n in source if source[n]['type']=='MESH' and n not in CHANGED]
 require(len(frozen)==262 and len(set(frozen)&set(textiles))==4,'Require 262 frozen meshes including four unchanged textiles')
 return {'objects':269,'meshes':267,'empties':2,'frozenMeshes':262,'unchangedOtherMeshes':258,'unchangedTextileMeshes':4}

def scene_fingerprints(scene):
 result={}
 for o in scene.objects:
  require(not o.modifiers and (o.type!='MESH' or not o.data.shape_keys),f'Unexpected modifier/shape key: {o.name}')
  result[o.name]={'type':o.type,'matrix':[list(row) for row in o.matrix_world],
    'parent':o.parent.name if o.parent else None,'hideRender':o.hide_render,
    'fingerprint':snapshot(o) if o.type=='MESH' else None}
 return result

def snapshot(obj,colors=True):
 m=obj.data;m.calc_loop_triangles()
 value={'matrix':[list(x) for x in obj.matrix_world],'v':[list(v.co) for v in m.vertices],
 'poly':[(list(p.vertices),p.material_index,p.use_smooth) for p in m.polygons],
 'uv':[[list(v.uv) for v in layer.data] for layer in m.uv_layers],
 'materials':[x.name if x else None for x in m.materials]}
 if colors:value['colors']=[(a.name,a.domain,a.data_type,[list(v.color) for v in a.data]) for a in m.color_attributes]
 return hashlib.sha256(json.dumps(value,sort_keys=True).encode()).hexdigest()

def ao(paths,m,out):
 import bpy
 from v2_interior_surfaces import contact_ao
 from material_fingerprint import fingerprint_scene_materials
 bpy.ops.wm.open_mainfile(filepath=str(SOURCE_BLEND))
 source=scene_fingerprints(bpy.context.scene)
 source_materials=fingerprint_scene_materials(bpy.context.scene,ROOT)
 bpy.ops.wm.open_mainfile(filepath=str(paths['blend']));bpy.context.preferences.filepaths.save_version=0
 counts=scene_guard(source,scene_fingerprints(bpy.context.scene),[n['name'] for n in m['nodes']])
 require(fingerprint_scene_materials(bpy.context.scene,ROOT)==source_materials,'Candidate material/image content differs from source')
 objects={o.name:o for o in bpy.context.scene.objects if o.type=='MESH'}
 before={n:snapshot(o) for n,o in objects.items()};shape={n:snapshot(objects[n],False) for n in CHANGED}
 for n in CHANGED:require(objects[n].data.color_attributes.get('Color') is not None,'Preserved sky channel requires original Color')
 sky={n:[v.color[2] for v in objects[n].data.color_attributes['Color'].data] for n in CHANGED}
 contact_ao([objects[n] for n in CHANGED]) # unmodified 32 rays, seed17, 1m radius, .008 origin offset
 for n,o in objects.items():
  require(snapshot(o,False)==shape[n] if n in CHANGED else snapshot(o)==before[n],f'Geometry/frozen object changed: {n}')
 scene_guard(source,scene_fingerprints(bpy.context.scene),[n['name'] for n in m['nodes']])
 require(fingerprint_scene_materials(bpy.context.scene,ROOT)==source_materials,'AO changed material/image content')
 (out/'material-image-fingerprints.json').write_text(json.dumps(source_materials,indent=2)+'\n')
 for n in CHANGED:require([v.color[2] for v in objects[n].data.color_attributes['Color'].data]==sky[n],f'Sky changed: {n}')
 bpy.ops.wm.save_as_mainfile(filepath=str(out/'textile-volume75.blend'))
 bpy.ops.object.select_all(action='DESELECT')
 for n in m['nodes']:objects[n['name']].select_set(True)
 bpy.ops.export_scene.gltf(filepath=str(out/'geometry.glb'),export_format='GLB',use_selection=True,export_materials='NONE',export_yup=True,export_texcoords=True,export_normals=True,export_vertex_color='ACTIVE',export_active_vertex_color_when_no_material=True)
 m['geometrySHA256']=sha(out/'geometry.glb');(out/'manifest.json').write_text(json.dumps(m,separators=(',',':')))
 return {'changedAO':CHANGED,**counts,'sourceBlendSHA256':SOURCE_BLEND_SHA,'skyPreserved':True,'readbackPending':True}

def gi(paths,m,out,key):
 # Import has read-only initialization against existing production manifest.
 # Original main is NEVER invoked. All integrators and quality constants unchanged.
 import v2_house_textiles_gi73 as recipe
 recipe.CLOTH=paths['geometry'];recipe.MANIFEST=paths['manifest'];recipe.manifest=m
 recipe.DERIVED={'kind':'house-textiles62','sourceSHA256':m['sourceSHA256'],'geometrySHA256':sha(paths['geometry']),'manifestSHA256':sha(paths['manifest']),'nodes':[n['name'] for n in m['nodes']]}
 recipe.OUT=out
 result=[]
 for family in KEYS if key=='all' else [key]:
  states={}
  for degree in [102,0,30,60,90]:
   external=recipe.assemble(family);states[degree]=recipe.state(family,degree,external)
   if degree in [30,60,90]:recipe.write(family+'-'+str(degree),states[degree])
  states[102]['closed']=states[0];recipe.write(family,states[102])
  result.append({'key':family,'degrees':[102,0,30,60,90],'modules':4})
 return {'families':result,'derivedGeometry':recipe.DERIVED,'validationPending':True}

def main():
 p=argparse.ArgumentParser();p.add_argument('--stage',choices=['ao','gi'],required=True);p.add_argument('--receipt',type=Path,required=True);p.add_argument('--out',type=Path,required=True);p.add_argument('--key',choices=['all',*KEYS],default='house_a')
 args=p.parse_args(sys.argv[sys.argv.index('--')+1:] if '--' in sys.argv else sys.argv[1:])
 r,paths,m=receipt_check(args.receipt.resolve(),args.stage)
 out=args.out.resolve();require(out.is_relative_to(HERE) and out!=HERE,'Output must be a fresh child of GI staging')
 require(not out.exists(),'Refuse overwrite/resume/mixed output');require(not any(out==x or out in x.parents for x in paths.values()),'Output overlaps input')
 # Hash every tracked file before/after, plus external staged evidence/inputs.
 import subprocess
 tracked=subprocess.check_output(['git','ls-files','-z'],cwd=ROOT).decode().split('\0')
 protected={str(ROOT/x):sha(ROOT/x) for x in tracked if x and (ROOT/x).is_file()}
 protected.update({str(Path(e['path']).resolve()):e['sha256'] for e in r['evidence']});protected.update({str(x):sha(x) for x in paths.values()});protected[str(args.receipt.resolve())]=sha(args.receipt)
 protected.update({str(x):sha(x) for x in HERE.glob('*.py')})
 lock=out.with_name(out.name+'.lock');fd=os.open(lock,os.O_CREAT|os.O_EXCL|os.O_WRONLY);os.write(fd,str(os.getpid()).encode());os.close(fd)
 report={'status':'RUNNING','stage':args.stage,'receiptSHA256':sha(args.receipt),'startedUnix':time.time()}
 sys.path.insert(0,str(ROOT/'tools/blender'));sys.dont_write_bytecode=True
 try:
  out.mkdir();(out/'protected-inputs.json').write_text(json.dumps(protected,indent=2)+'\n')
  report['result']=ao(paths,m,out) if args.stage=='ao' else gi(paths,m,out,args.key)
  require(all(sha(Path(k))==v for k,v in protected.items()),'Protected file modified')
  report['outputs']={x.name:sha(x) for x in out.iterdir() if x.is_file()}
  report['status']='BAKED_NOT_VALIDATED'
 except BaseException:
  report['status']='REJECTED';report['traceback']=traceback.format_exc();raise
 finally:
  report['protectedUnchanged']=all(Path(k).is_file() and sha(Path(k))==v for k,v in protected.items());report['seconds']=time.time()-report['startedUnix']
  if out.is_dir():(out/'run.json').write_text(json.dumps(report,indent=2)+'\n')
  lock.unlink()
 # Failure outputs intentionally retained with REJECTED; verifier rejects them.
if __name__=='__main__':main()
