"""Editable counterpart of accepted runtime timber48 finished-board response.
No render, no runtime export, no coordinate regeneration. Writes a new Blend.
Blender lighting/colour management differs from world GI: not pixel equivalence.
"""
import bpy,json,hashlib
from pathlib import Path
import numpy as np
R=Path(__file__).resolve().parents[2]
OUT=R/'assets/src/v2/pastoral/timber48'
SOURCE=OUT/'house-a-group-timber48.blend'
DEST=OUT/'house-a-group-timber48-finished.blend'
protected=[SOURCE,OUT/'house-a-timber48-coordinates.json',OUT/'runtime-fields48.json',R/'web/public/assets/v2/house-timber48/fields.json',R/'web/public/assets/v2/house_a_lived.glb']
sha=lambda p:hashlib.sha256(p.read_bytes()).hexdigest()
protected_hashes={str(p.relative_to(R)):sha(p)for p in protected}
bpy.ops.wm.open_mainfile(filepath=str(SOURCE));bpy.context.view_layer.update()
def fingerprint():
 rows={}
 for o in bpy.context.scene.objects:
  if o.type!='MESH':continue
  m=o.data;rows[o.name]={'vertices':[list(v.co)for v in m.vertices],'faces':[list(p.vertices)for p in m.polygons],'matrix':[list(r)for r in o.matrix_world],'uv':{u.name:[list(v.uv)for v in u.data]for u in m.uv_layers},'color':{a.name:[list(v.color)for v in a.data]for a in m.color_attributes},'normal':[list(v.vector)for v in m.corner_normals]}
 return hashlib.sha256(json.dumps(rows,sort_keys=True).encode()).hexdigest()
def mean(image):
 a=np.empty(len(image.pixels),dtype=np.float32);image.pixels.foreach_get(a)
 return np.maximum(a.reshape(-1,4)[:,:3].astype(np.float64).mean(axis=0),.0001)
def original_mean(material):
 bs=next((n for n in material.node_tree.nodes if n.type=='BSDF_PRINCIPLED'),None)if material.use_nodes else None
 if bs and bs.inputs['Base Color'].is_linked:
  node=bs.inputs['Base Color'].links[0].from_node
  if node.type!='TEX_IMAGE'or not node.image:raise RuntimeError('Unsupported original source colour '+material.name)
  return mean(node.image)
 return np.array(bs.inputs['Base Color'].default_value[:3]if bs else material.diffuse_color[:3])
before=fingerprint();copies={};changed=[];untouched={o.name:[m.name if m else None for m in o.data.materials]for o in bpy.context.scene.objects if o.type=='MESH'and not any(k in o.name for k in('lining','door0','shutter'))}
for o in bpy.context.scene.objects:
 if o.type!='MESH'or not any(k in o.name for k in('lining','door0','shutter')):continue
 for slot in o.material_slots:
  old=slot.material
  if not old or not old.name.startswith('timber48/'):continue
  if old.name.endswith('/end'):
   if old.name not in copies:
    m=old.copy();m.name=old.name+'/finished';bs=next(n for n in m.node_tree.nodes if n.type=='BSDF_PRINCIPLED');bs.inputs['Roughness'].default_value=.6;m['finished48Scope']='Interior end grain: original colour, roughness .6, no fibre normal';copies[old.name]=m
   slot.material=copies[old.name];changed.append({'object':o.name,'material':slot.material.name});continue
  if not old.name.endswith('/long'):continue
  if old.name not in copies:
   m=old.copy();m.name=old.name+'/finished';nodes=m.node_tree.nodes;links=m.node_tree.links;bs=next(n for n in nodes if n.type=='BSDF_PRINCIPLED');source=bpy.data.materials[old['sourceMaterial']]
   color=next(n for n in nodes if n.type=='TEX_IMAGE'and n.image and 'rough_wood_diff' in n.image.name)
   target=original_mean(source);scan_mean=mean(color.image)
   relative=nodes.new('ShaderNodeVectorMath');relative.operation='DIVIDE';relative.label='Complete linear fibre / original scan mean';relative.inputs[1].default_value=scan_mean;links.new(color.outputs['Color'],relative.inputs[0])
   blend=nodes.new('ShaderNodeMixRGB');blend.blend_type='MIX';blend.label='Finished protected board: 24% fibre response';blend.inputs[0].default_value=.24;blend.inputs[1].default_value=(1,1,1,1);links.new(relative.outputs['Vector'],blend.inputs[2])
   result=nodes.new('ShaderNodeMixRGB');result.blend_type='MULTIPLY';result.inputs[0].default_value=1;result.inputs[2].default_value=(*target,1);links.new(blend.outputs[0],result.inputs[1]);links.new(result.outputs[0],bs.inputs['Base Color'])
   rough=next(n for n in nodes if n.type=='TEX_IMAGE'and n.image and 'rough_wood_rough' in n.image.name);green=nodes.new('ShaderNodeSeparateColor');green.mode='RGB';links.new(rough.outputs['Color'],green.inputs[0]);mapping=nodes.new('ShaderNodeMapRange');mapping.inputs['From Min'].default_value=0;mapping.inputs['From Max'].default_value=1;mapping.inputs['To Min'].default_value=.44;mapping.inputs['To Max'].default_value=.66;links.new(green.outputs['Green'],mapping.inputs[0]);links.new(mapping.outputs[0],bs.inputs['Roughness'])
   for n in nodes:
    if n.type=='NORMAL_MAP':n.inputs['Strength'].default_value=.07
   m['finished48Formula']='original linear colour mean * mix(1, full fibre / scan linear mean, .24)'
   m['finished48Normal']=.07;m['finished48Roughness']=[.44,.66];m['finished48OriginalLinearMean']=list(map(float,target));m['finished48ScanLinearMean']=list(map(float,scan_mean));copies[old.name]=m
  slot.material=copies[old.name];changed.append({'object':o.name,'material':slot.material.name})
assert changed and fingerprint()==before
for name,slots in untouched.items():assert [m.name if m else None for m in bpy.data.objects[name].data.materials]==slots,'Exterior materials changed'
bpy.context.preferences.filepaths.save_version=0
bpy.context.scene['timber48FinishedScope']='Editable interior long-grain counterpart; no geometry, source UV, AO, runtime fields or world GI changes'
bpy.context.scene['timber48FinishedLimits']='Blender Normal Map node, independent lighting and colour management are not runtime pixel equivalence. Runtime browser evidence remains authoritative.'
bpy.ops.wm.save_as_mainfile(filepath=str(DEST),check_existing=False)
bpy.ops.wm.open_mainfile(filepath=str(DEST));assert fingerprint()==before
assert all(sha(R/p)==h for p,h in protected_hashes.items()),'Protected source modified'
report={'output':str(DEST.relative_to(R)),'sha256':sha(DEST),'protected':protected_hashes,'geometryAllUVColorAONormalsSHA256':before,'changedSlots':changed,'materials':len(copies),'rendered':False,'runtimeExported':False,'limits':'Same documented material response; independent Blender lighting, colour management and normal evaluation are not pixel-identical to runtime GI.'}
(OUT/'house-a-timber48-finished-source.json').write_text(json.dumps(report,indent=2))
print(json.dumps({'output':report['output'],'materials':len(copies),'slots':len(changed),'preserved':True}),flush=True)
