"""24 original dining chairs: same layout/envelope, editable wood/rattan craft candidate."""
from pathlib import Path
import bpy, math, json, hashlib, time, struct
import numpy as np
from mathutils import Vector
ROOT=Path(__file__).resolve().parents[2];D=ROOT/'assets/src/v2/settlements/lodge-chairs-v38';D.mkdir(exist_ok=True,parents=True)
SOURCE=ROOT/'assets/src/v2/settlements/lodge-furniture-v38/lodge-complete.blend';start=time.monotonic()
bpy.ops.wm.open_mainfile(filepath=str(SOURCE));wood=bpy.data.materials.get('plank');rattan=bpy.data.materials.get('rattan');assert wood and rattan
wood=wood.copy();wood.name='chair38 retained plank';rattan=rattan.copy();rattan.name='chair38 original rattan factor'
for m in [wood,rattan]:
 nt=m.node_tree
 for n in list(nt.nodes):
  if n.type=='VERTEX_COLOR':
   for link in list(nt.links):
    if link.from_node==n:link.to_socket.default_value=(1,1,1,1);nt.links.remove(link)
   nt.nodes.remove(n)
# Reuse the already licensed/calibrated oak source, not the coarse old plank.
S=json.loads((ROOT/'web/src/v2/generated/lodge-wood-surfaces-38.json').read_text())
def oak_material(label,end=False):
 m=bpy.data.materials.new(label);m.use_nodes=True;nt=m.node_tree;bs=nt.nodes['Principled BSDF'];bs.inputs['Roughness'].default_value=.57
 image=bpy.data.images.load(str(ROOT/'web/public/assets/v2/lodge-wood'/S['maps']['end' if end else 'color']['file']),check_existing=True);image.pack();tex=nt.nodes.new('ShaderNodeTexImage');tex.image=image
 mix=nt.nodes.new('ShaderNodeMixRGB');mix.blend_type='MULTIPLY';mix.inputs[0].default_value=1;mix.inputs[2].default_value=(*(S['endFactor'] if end else S['factor']),1);nt.links.new(tex.outputs['Color'],mix.inputs[1]);nt.links.new(mix.outputs[0],bs.inputs['Base Color'])
 if not end:
  image=bpy.data.images.load(str(ROOT/'web/public/assets/v2/lodge-wood'/S['maps']['normal']['file']),check_existing=True);image.colorspace_settings.name='Non-Color';image.pack();tex=nt.nodes.new('ShaderNodeTexImage');tex.image=image;nm=nt.nodes.new('ShaderNodeNormalMap');nm.inputs['Strength'].default_value=.18;nt.links.new(tex.outputs['Color'],nm.inputs['Color']);nt.links.new(nm.outputs['Normal'],bs.inputs['Normal'])
 return m
wood=oak_material('chair38 calibrated oak');endwood=oak_material('chair38 real endgrain',True)
# Plain interlaced 5mm cane strips, actual height derivatives in metres.
# Earlier normals differentiated arbitrary pixel heights then attenuated .30,
# making their slopes near-flat. This uses 0.20mm relief across a 40mm tile.
n=512;y,x=np.mgrid[:n,:n]/n;u=x*8;v=y*8;fu=u%1;fv=v%1
warp=np.sqrt(np.maximum(0,1-((fu-.5)/.48)**2));weft=np.sqrt(np.maximum(0,1-((fv-.5)/.48)**2))
warp_h=.00020*warp+.00011*np.cos(math.pi*v)*((-1.)**np.floor(u));weft_h=.00020*weft-.00011*np.cos(math.pi*u)*((-1.)**np.floor(v))
warp_h=np.where(warp>0,warp_h,-.0002);weft_h=np.where(weft>0,weft_h,-.0002);h=np.maximum(warp_h,weft_h)
step=.04/n;dx=(np.roll(h,-1,axis=1)-np.roll(h,1,axis=1))/(2*step);dy=(np.roll(h,-1,axis=0)-np.roll(h,1,axis=0))/(2*step)
normal=np.stack([-dx,-dy,np.ones_like(h)],axis=-1);normal/=np.linalg.norm(normal,axis=-1,keepdims=True)
top=warp_h>=weft_h;fibres=np.where(top,np.sin(u*math.pi*34+.24*np.sin(v*3)),np.sin(v*math.pi*34+.24*np.sin(u*3)))
strand=np.where(top,np.sin(np.floor(u)*2.399),np.sin(np.floor(v)*2.173+.7));factor=1+.045*strand+.025*fibres-.06*((warp==0)&(weft==0));factor/=factor.mean()
linear=np.stack([factor*c for c in [.48,.34,.19]],axis=-1);srgb=np.where(linear<=.0031308,12.92*linear,1.055*np.power(linear,1/2.4)-.055)
def make_image(label,pixels,noncolor):
 im=bpy.data.images.new('chair cane '+label+' 40mm',n,n);im.colorspace_settings.name='Non-Color' if noncolor else 'sRGB';im.pixels.foreach_set(np.concatenate([pixels,np.ones((n,n,1))],axis=-1).astype(np.float32).ravel());im.filepath_raw=str(D/('rattan-'+label+'.png'));im.file_format='PNG';im.save();im.pack();return im
nt=rattan.node_tree;bs=nt.nodes['Principled BSDF'];tex=nt.nodes.new('ShaderNodeTexImage');tex.image=make_image('color',srgb,False);nt.links.new(tex.outputs['Color'],bs.inputs['Base Color'])
tex=nt.nodes.new('ShaderNodeTexImage');tex.image=make_image('normal',normal*.5+.5,True);nm=nt.nodes.new('ShaderNodeNormalMap');nm.inputs['Strength'].default_value=1;nt.links.new(tex.outputs['Color'],nm.inputs['Color']);nt.links.new(nm.outputs['Normal'],bs.inputs['Normal'])
bs.inputs['Roughness'].default_value=.73
for o in list(bpy.data.objects):bpy.data.objects.remove(o,do_unlink=True)
parts=[]
def finish(o,name,material,bevel=0):
 o.name='chaircraft38_'+name;o.data.materials.clear();o.data.materials.append(material)
 if material==wood:o.data.materials.append(endwood)
 if bevel:
  m=o.modifiers.new('Small actual joinery edge','BEVEL');m.width=bevel;m.segments=2;bpy.context.view_layer.objects.active=o;bpy.ops.object.modifier_apply(modifier=m.name)
 for p in o.data.polygons:p.use_smooth=True
 m=o.modifiers.new('Weighted frame normals','WEIGHTED_NORMAL');m.keep_sharp=True;bpy.context.view_layer.objects.active=o;bpy.ops.object.modifier_apply(modifier=m.name)
 uv=o.data.uv_layers.new(name='Chair physical grain') if not o.data.uv_layers else o.data.uv_layers[0]
 lo=[min(v.co[k] for v in o.data.vertices)for k in range(3)];hi=[max(v.co[k] for v in o.data.vertices)for k in range(3)];long=max(range(3),key=lambda k:hi[k]-lo[k]);seed=int(hashlib.sha256(name.encode()).hexdigest()[:8],16);offset=((seed%997)/997,((seed//997)%991)/991)
 for p in o.data.polygons:
  normal_axis=max(range(3),key=lambda a:abs(p.normal[a]));axes=[i for i in range(3)if i!=normal_axis]
  end=material==wood and normal_axis==long
  if end:p.material_index=1
  cross=next((i for i in axes if i!=long),axes[0])
  for li in p.loop_indices:
   v=o.data.vertices[o.data.loops[li].vertex_index].co
   if material==rattan:uv.data[li].uv=(v[axes[0]]*25,v[axes[1]]*25)
   elif end:uv.data[li].uv=(v[axes[0]]/.35+offset[0],v[axes[1]]/.35+offset[1])
   else:uv.data[li].uv=(v[cross]/S['metres']+offset[0],v[long]/S['metres']+offset[1])

 parts.append(o);return o

def box(name,loc,size,material,bevel=.003):
 bpy.ops.mesh.primitive_cube_add(size=1,location=loc);o=bpy.context.object;o.dimensions=size;bpy.ops.object.transform_apply(location=False,rotation=False,scale=True);return finish(o,name,material,bevel)
for x in [-.181,.181]:
 for y in [-.181,.181]:
  # Feet narrow from 37 to 27mm; a tiny splay remains within original seat bounds.
  vs=[]
  for z,w,cx,cy in [(0,.027,x*1.035,y*1.035),(.428,.037,x,y)]:
   vs.extend([(cx+dx*w/2,cy+dy*w/2,z)for dx,dy in [(-1,-1),(1,-1),(1,1),(-1,1)]])
  fs=[(0,3,2,1),(4,5,6,7),(0,1,5,4),(1,2,6,5),(2,3,7,6),(3,0,4,7)]
  me=bpy.data.meshes.new('tapered leg');me.from_pydata(vs,[],fs);me.update();o=bpy.data.objects.new('leg',me);bpy.context.collection.objects.link(o);finish(o,f'leg_{x}_{y}',wood,.002)
for y in [-.18,.18]:box('mortised_apron_'+str(y),(0,y,.377),(.36,.026,.065),wood,.002)
for x in [-.18,.18]:box('side_apron_'+str(x),(x,0,.377),(.026,.36,.065),wood,.002)
# Original seat height .44, and outer width/depth .44 remain unchanged.
for y in [-.198,.198]:box('seat_crossrail_'+str(y),(0,y,.438),(.44,.044,.044),wood,.004)
for x in [-.198,.198]:box('seat_siderail_'+str(x),(x,0,.438),(.044,.352,.044),wood,.004)
box('woven_seat',(0,0,.441),(.355,.355,.036),rattan,.005)
# Back posts terminate under the crown, lean with the same curved panel.
for x in [-.190,.190]:box('back_stile_'+str(x),(x,.192,.708),(.032,.034,.474),wood,.003)
# Gentle cylindrical back shell; all vertices remain in the original y=.18..22 range.
vs=[];segments=12
for z in [.49,.926]:
 for side in [0,1]:
  for i in range(segments+1):
   x=-.176+i*.352/segments;y=.188+.014*(1-(x/.176)**2)+side*.014;vs.append((x,y,z))
n=segments+1;fs=[]
for i in range(segments):
 fs.extend([(i,i+1,2*n+i+1,2*n+i),(n+i,3*n+i,3*n+i+1,n+i+1),(i,n+i,n+i+1,i+1),(2*n+i,2*n+i+1,3*n+i+1,3*n+i)])
fs.extend([(0,2*n,3*n,n),(n-1,2*n-1,4*n-1,3*n-1)])
me=bpy.data.meshes.new('bent rattan back');me.from_pydata(vs,[],fs);me.update();o=bpy.data.objects.new('back',me);bpy.context.collection.objects.link(o);finish(o,'curved_woven_back',rattan,.002)
box('crown_rail',(0,.196,.945),(.416,.038,.05),wood,.006)
# Visible end-grain dowel plugs are actual shallow inset geometry, not painted black seams.
for x in [-.18,.18]:
 bpy.ops.mesh.primitive_cylinder_add(vertices=10,radius=.004,depth=.0015,location=(x,-.194,.384),rotation=(math.pi/2,0,0));finish(bpy.context.object,'apron_dowel_'+str(x),wood,0)
base=list(parts);placements=[]
for tx,ty in [(-10.4,-1.4),(-6.4,-1.4),(-10.4,1.7),(-6.4,1.7)]:
 for sx in [-.6,0,.6]:
  placements.extend([(tx+sx,ty-.75,math.pi),(tx+sx,ty+.75,0)])
for i,(x,y,a) in enumerate(placements):
 parent=bpy.data.objects.new('dining_chair38_'+str(i+1),None);bpy.context.collection.objects.link(parent);parent.location=(x,y,0);parent.rotation_euler.z=a
 for o in base:
  c=o.copy();c.data=o.data;c.name=f'chair38_{i+1}_'+o.name;c.parent=parent;bpy.context.collection.objects.link(c)
for o in base:bpy.data.objects.remove(o,do_unlink=True)
bpy.ops.wm.save_as_mainfile(filepath=str(D/'chairs-editable.blend'),compress=True)
bpy.ops.export_scene.gltf(filepath=str(D/'chairs.glb'),export_format='GLB',export_yup=True,export_apply=False,export_extras=True)
# Blender exporter drops the multiply-node factor for this image graph.
# Bind the already-calibrated factors explicitly in glTF PBR, preserving pixels.
file=D/'chairs.glb';raw=file.read_bytes();length=struct.unpack_from('<I',raw,12)[0];doc=json.loads(raw[20:20+length]);binary=raw[28+length:]
for m in doc['materials']:
 if m['name']==wood.name:m['pbrMetallicRoughness']['baseColorFactor']=[*S['factor'],1]
 if m['name']==endwood.name:m['pbrMetallicRoughness']['baseColorFactor']=[*S['endFactor'],1]
js=json.dumps(doc,separators=(',',':')).encode();js+=b' '*((-len(js))%4);file.write_bytes(struct.pack('<III',0x46546c67,2,28+len(js)+len(binary))+struct.pack('<II',len(js),0x4e4f534a)+js+struct.pack('<II',len(binary),0x004e4942)+binary)
tri=0
for o in bpy.context.scene.objects:
 if o.type=='MESH':o.data.calc_loop_triangles();tri+=len(o.data.loop_triangles)
(D/'chair-metadata.json').write_text(json.dumps({'chairs':24,'triangles':tri,'trianglesPerChair':tri//24,'placements':placements,'sourceBlend':str(SOURCE.relative_to(ROOT)),'sourceBlendSHA':hashlib.sha256(SOURCE.read_bytes()).hexdigest(),'materials':['calibrated oak and endgrain','original rattan colour factor'],'newTextures':2,'reusedTextureSource':S['source'],'license':S['licenseId'],'envelope':[.44,.44,.97],'seconds':time.monotonic()-start,'limits':'Offline geometric candidate. Original rattan colour factor and plank texture retained; one new normal-only 5mm rattan weave. Complete GI rebake required after approval.'},indent=2))
print('CHAIRS',tri,flush=True)
