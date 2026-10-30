"""Fail-closed scene material/image content evidence; no mutation, no bpy import.
Coverage: material writable RNA settings, shader graph writable RNA properties,
socket defaults, links, nested groups and their interface, and used image data.
Not a universal Blender RNA serializer. Unknown non-null pointers, animation,
unsupported images or inaccessible bytes block the gate rather than pass.
"""
import array, hashlib, json, math
from pathlib import Path
MAX_IMAGE_BYTES=256*1024*1024
class CoverageError(ValueError):pass

def canonical(value):
 return json.dumps(value,sort_keys=True,separators=(',',':'),allow_nan=False).encode()
def digest(value):return hashlib.sha256(canonical(value)).hexdigest()
def scalar(value):
 if value is None or isinstance(value,(str,bool,int)):return value
 if isinstance(value,float):
  if not math.isfinite(value):raise CoverageError('Nonfinite material value')
  return value
 if isinstance(value,set):return sorted(value)
 try:return [scalar(x) for x in value]
 except (TypeError,ValueError) as e:raise CoverageError(f'Unsupported scalar {type(value).__name__}') from e

def _rna(obj,skip=(),depth=0):
 if depth>20:raise CoverageError('RNA recursion exceeds bound')
 result={}
 for prop in obj.bl_rna.properties:
  key=prop.identifier
  if key=='rna_type' or key in skip:continue
  if key=='original':
   if getattr(obj,key)!=obj:raise CoverageError('Evaluated datablock requires separate evidence')
   continue
  value=getattr(obj,key)
  if prop.type in {'BOOLEAN','INT','FLOAT','STRING','ENUM'}:
   if not prop.is_readonly:result[key]=scalar(value)
  elif prop.type=='POINTER':
   if value is None:result[key]=None
   elif key in {'color_ramp','mapping','texture_mapping','color_mapping','lineart','cycles'}:
    result[key]=_rna(value,depth=depth+1)
   else:raise CoverageError(f'Unsupported pointer {obj.bl_rna.identifier}.{key}: {type(value).__name__}')
  elif prop.type=='COLLECTION':
   if key in {'elements','curves','points'}:result[key]=[_rna(v,depth=depth+1) for v in value]
   elif len(value):raise CoverageError(f'Unsupported collection {obj.bl_rna.identifier}.{key}')
 return result

def _custom(obj):
 # ID properties may contain shader control values; fail on unknown nested types.
 def convert(v):
  if hasattr(v,'items'):return {str(k):convert(x) for k,x in v.items()}
  return scalar(v)
 return {str(k):convert(v) for k,v in obj.items()} if hasattr(obj,'items') else {}

def image_record(image,repo_root):
 root=Path(repo_root).resolve()
 if image.source not in {'FILE','GENERATED'}:raise CoverageError(f'Unsupported image source {image.name}: {image.source}')
 if image.source=='FILE' and getattr(image,'is_dirty',False):raise CoverageError(f'Unsaved image pixel edits: {image.name}')
 if getattr(image,'animation_data',None):raise CoverageError(f'Animated image: {image.name}')
 record={'name':image.name,'source':image.source,'size':list(image.size),'channels':image.channels,
 'colorspace':image.colorspace_settings.name,'isData':image.colorspace_settings.is_data,
 'alphaMode':image.alpha_mode,'useAlpha':getattr(image,'use_alpha',None),
 'generatedType':getattr(image,'generated_type',None),'generatedColor':scalar(getattr(image,'generated_color',None)),
 'useGeneratedFloat':getattr(image,'use_generated_float',None),'custom':_custom(image)}
 packed=list(getattr(image,'packed_files',[]))
 if packed:
  record['payloads']=[{'kind':'packed','size':p.packed_file.size,'sha256':hashlib.sha256(p.packed_file.data).hexdigest()} for p in packed]
 elif getattr(image,'packed_file',None):
  record['payloads']=[{'kind':'packed','size':image.packed_file.size,'sha256':hashlib.sha256(image.packed_file.data).hexdigest()}]
 elif image.source=='FILE':
  import bpy
  path=Path(bpy.path.abspath(image.filepath,library=image.library)).resolve()
  if not path.is_relative_to(root) or not path.is_file():raise CoverageError(f'Image file missing/outside repository: {image.name}: {path}')
  h=hashlib.sha256()
  with path.open('rb') as f:
   for block in iter(lambda:f.read(1024*1024),b''):h.update(block)
  record['payloads']=[{'kind':'file','path':str(path.relative_to(root)),'size':path.stat().st_size,'sha256':h.hexdigest()}]
 else:
  count=len(image.pixels)
  if count==0 or count*4>MAX_IMAGE_BYTES:raise CoverageError(f'Generated image empty/over cap: {image.name}')
  values=array.array('f',[0])*count;image.pixels.foreach_get(values)
  if not all(math.isfinite(v) for v in values):raise CoverageError(f'Nonfinite image: {image.name}')
  record['payloads']=[{'kind':'generated-pixels-f32-native','count':count,'sha256':hashlib.sha256(values.tobytes()).hexdigest()}]
 return record

def tree_record(tree,repo_root,ancestors=()):
 identity=tree.as_pointer()
 if identity in ancestors:raise CoverageError('Recursive shader group')
 if getattr(tree,'animation_data',None):raise CoverageError(f'Animated shader tree: {tree.name}')
 nodes=[]
 for node in sorted(tree.nodes,key=lambda n:n.name):
  # UI-only placement is irrelevant. Semantic pointers below are handled explicitly.
  rec={'name':node.name,'type':node.bl_idname,'properties':_rna(node,{'panel_states','inputs','outputs','internal_links','parent','image','node_tree','id_data','image_user','dimensions','location','width','height','select','show_options','show_preview','show_texture','label','color','use_custom_color'}),'custom':_custom(node)}
  for side in ['inputs','outputs']:
   rec[side]=[{'identifier':s.identifier,'name':s.name,'type':s.bl_idname,'enabled':s.enabled,'default':scalar(s.default_value) if hasattr(s,'default_value') else None} for s in getattr(node,side)]
  if getattr(node,'image',None):rec['image']=image_record(node.image,repo_root)
  if hasattr(node,'image_user'):rec['imageUser']=_rna(node.image_user,{'id_data'})
  if getattr(node,'node_tree',None):rec['group']=tree_record(node.node_tree,repo_root,ancestors+(identity,))
  rec['internalLinks']=[(x.from_socket.identifier,x.to_socket.identifier) for x in node.internal_links]
  nodes.append(rec)
 links=sorted((x.from_node.name,x.from_socket.identifier,x.to_node.name,x.to_socket.identifier,getattr(x,'is_muted',False)) for x in tree.links)
 interface=[]
 for item in getattr(getattr(tree,'interface',None),'items_tree',[]):
  if item.item_type=='SOCKET':interface.append({'name':item.name,'identifier':item.identifier,'inOut':item.in_out,'socketType':item.socket_type,'default':scalar(item.default_value) if hasattr(item,'default_value') else None})
 return {'name':tree.name,'nodes':nodes,'links':links,'interface':interface,'custom':_custom(tree)}

def fingerprint_scene_materials(scene,repo_root):
 assignments={};materials={}
 for obj in sorted(scene.objects,key=lambda o:o.name):
  assignments[obj.name]=[(slot.link,slot.material.name if slot.material else None) for slot in obj.material_slots]
  for slot in obj.material_slots:
   mat=slot.material
   if mat is None or mat.name in materials:continue
   if getattr(mat,'animation_data',None):raise CoverageError(f'Animated material: {mat.name}')
   record={'name':mat.name,'settings':_rna(mat,{'node_tree','id_data','preview','library','override_library','asset_data','animation_data','grease_pencil','texture_paint_images','texture_paint_slots'}),'custom':_custom(mat)}
   if getattr(mat,'grease_pencil',None):raise CoverageError(f'Unsupported grease pencil material: {mat.name}')
   if mat.use_nodes:
    if mat.node_tree is None:raise CoverageError('Missing material node tree')
    record['tree']=tree_record(mat.node_tree,repo_root)
   materials[mat.name]=record
 details={'schemaVersion':1,'coverage':'writable material/node RNA + sockets/links/groups + used image bytes; fail closed on unsupported pointers/animation','assignments':assignments,'materials':materials}
 return {'sha256':digest(details),'details':details}
