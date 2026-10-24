"""Offline joinery candidate; reuse licensed oak maps and calibrated linear factors."""
from pathlib import Path
import bpy,math,json,hashlib,struct,time
from mathutils import Vector
R=Path(__file__).resolve().parents[2];D=R/'assets/src/v2/settlements/lodge-tables-v38';D.mkdir(parents=True,exist_ok=True);start=time.monotonic()
bpy.ops.wm.read_factory_settings(use_empty=True)
S=json.loads((R/'web/src/v2/generated/lodge-wood-surfaces-38.json').read_text());parts=[]
def material(name,end=False):
 m=bpy.data.materials.new(name);m.use_nodes=True;n=m.node_tree;bs=n.nodes['Principled BSDF'];bs.inputs['Roughness'].default_value=.55;bs.inputs['Coat Weight'].default_value=.12;bs.inputs['Coat Roughness'].default_value=.3
 im=bpy.data.images.load(str(R/'web/public/assets/v2/lodge-wood'/S['maps']['end'if end else'color']['file']),check_existing=True);im.pack();t=n.nodes.new('ShaderNodeTexImage');t.image=im;mul=n.nodes.new('ShaderNodeMixRGB');mul.blend_type='MULTIPLY';mul.inputs[0].default_value=1;mul.inputs[2].default_value=(*(S['endFactor']if end else S['factor']),1);n.links.new(t.outputs['Color'],mul.inputs[1]);n.links.new(mul.outputs[0],bs.inputs['Base Color'])
 if not end:
  for key in ['normal','roughness']:
   im=bpy.data.images.load(str(R/'web/public/assets/v2/lodge-wood'/S['maps'][key]['file']),check_existing=True);im.colorspace_settings.name='Non-Color';im.pack();t=n.nodes.new('ShaderNodeTexImage');t.image=im
   if key=='normal':nm=n.nodes.new('ShaderNodeNormalMap');nm.inputs['Strength'].default_value=.18;n.links.new(t.outputs['Color'],nm.inputs['Color']);n.links.new(nm.outputs['Normal'],bs.inputs['Normal'])
   else:mul=n.nodes.new('ShaderNodeMath');mul.operation='MULTIPLY_ADD';mul.inputs[1].default_value=.20;mul.inputs[2].default_value=.42;n.links.new(t.outputs['Color'],mul.inputs[0]);n.links.new(mul.outputs[0],bs.inputs['Roughness'])
 return m
wood=material('tablecraft38 calibrated oak');end=material('tablecraft38 real endgrain',True)
def finish(o,name,grain=0,bevel=.003):
 o.name='tablecraft38_'+name;o.data.materials.append(wood);o.data.materials.append(end);bpy.context.view_layer.objects.active=o
 if bevel:
  mod=o.modifiers.new('Actual millimetre edge radius','BEVEL');mod.width=bevel;mod.segments=3;bpy.ops.object.modifier_apply(modifier=mod.name)
 for p in o.data.polygons:p.use_smooth=True
 mod=o.modifiers.new('Flat board faces and soft edges','WEIGHTED_NORMAL');mod.keep_sharp=True;bpy.ops.object.modifier_apply(modifier=mod.name)
 uv=o.data.uv_layers.new(name='Metres oak grain');seed=int(hashlib.sha256(name.encode()).hexdigest()[:8],16);off=((seed%997)/997,(seed//997%991)/991)
 for p in o.data.polygons:
  axis=max(range(3),key=lambda k:abs(p.normal[k]));isend=axis==grain;axes=[k for k in range(3)if k!=axis];cross=next((k for k in axes if k!=grain),axes[0]);p.material_index=1 if isend else 0
  for li in p.loop_indices:
   v=o.data.vertices[o.data.loops[li].vertex_index].co;uv.data[li].uv=(v[axes[0]]/.35+off[0],v[axes[1]]/.35+off[1])if isend else(v[cross]/S['metres']+off[0],v[grain]/S['metres']+off[1])
 parts.append(o);return o

def box(name,c,size,grain=0,bevel=.003):
 bpy.ops.mesh.primitive_cube_add(size=1,location=c);o=bpy.context.object;o.dimensions=size;bpy.ops.object.transform_apply(location=False,rotation=False,scale=True);return finish(o,name,grain,bevel)
def tapered(name,cx,cy,z0,z1,lower,upper):
 vs=[(cx+dx*w/2,cy+dy*w/2,z)for z,w in[(z0,lower),(z1,upper)]for dx,dy in[(-1,-1),(1,-1),(1,1),(-1,1)]];me=bpy.data.meshes.new(name);me.from_pydata(vs,[],[(0,3,2,1),(4,5,6,7),(0,1,5,4),(1,2,6,5),(2,3,7,6),(3,0,4,7)]);me.update();o=bpy.data.objects.new(name,me);bpy.context.collection.objects.link(o);return finish(o,name,2,.0025)
for k,(x,y)in enumerate([(-10.4,-1.4),(-6.4,-1.4),(-10.4,1.7),(-6.4,1.7)],1):
 box(f'table{k}_solid_top',(x,y,.74),(1.9,.9,.05),0,.0045)
 for dx in[-.8,.8]:
  for dy in[-.36,.36]:tapered(f'table{k}_leg_{dx}_{dy}',x+dx,y+dy,.02,.72,.043,.060)
 for dy in[-.36,.36]:box(f'table{k}_long_tenoned_apron_{dy}',(x,y+dy,.680),(1.54,.022,.070),0,.002)
 for dx in[-.8,.8]:box(f'table{k}_cross_tenoned_apron_{dx}',(x+dx,y,.680),(.022,.66,.070),1,.002)
 # Actual shallow joinery pegs, fully within leg/front envelope.
 for dx in[-.8,.8]:
  for dy in[-.36,.36]:
   bpy.ops.mesh.primitive_cylinder_add(vertices=12,radius=.004,depth=.001,location=(x+dx,y+dy-.0298,.687),rotation=(math.pi/2,0,0));finish(bpy.context.object,f'table{k}_joint_peg_{dx}_{dy}',2,.0003)
# Original front desk footprint x[-.9,1.5], y[-.8,-.2], top1.145.
box('reception_counter_top',(.3,-.52,1.12),(2.5,.68,.05),0,.005)
box('reception_recessed_plinth',(.3,-.49,.055),(2.33,.55,.11),0,.003)
for x in[-.8775,1.4775]:box('reception_solid_side_'+str(x),(x,-.5,.58),(.045,.60,1.04),2,.003)
for x in[-.83,-.075,.675,1.43]:box('reception_front_stile_'+str(x),(x,-.782,.59),(.065,.036,.85),2,.002)
for z in[.1225,1.0575]:box('reception_front_rail_'+str(z),(.3,-.782,z),(2.27,.036,.085),0,.002)
for x in[-.4525,.3,1.0525]:box('reception_inset_panel_'+str(x),(x,-.767,.59),(.687,.022,.85),2,.002)
box('reception_back_panel',(.3,-.209,.59),(2.31,.018,1.02),2,.002)
box('reception_under_top',(.3,-.5,1.085),(2.32,.56,.03),0,.002)
# Original irregular 14-sided cap occupied this same rectangle; keep its extrema.
x0,x1=4.849819183349609,5.7371110916137695;y0,y1=-.04290264844894409,.8300877809524536;cx,cy=(x0+x1)/2,(y0+y1)/2;rx,ry=(x1-x0)/2,(y1-y0)/2
bpy.ops.mesh.primitive_cylinder_add(vertices=64,radius=1,depth=.05,location=(cx,cy,.43100003));o=bpy.context.object;o.scale=(rx,ry,1);bpy.ops.object.transform_apply(location=False,rotation=False,scale=True);finish(o,'tea_top_smooth_round',0,.004)
# Thin continuous oak edge band: circumferential grain avoids arbitrary normal-axis seams.
uv=o.data.uv_layers.active
for poly in o.data.polygons:
 if abs(poly.normal.z)<.8:
  poly.material_index=0
  angles=[math.atan2(o.data.vertices[o.data.loops[li].vertex_index].co.y/ry,o.data.vertices[o.data.loops[li].vertex_index].co.x/rx) for li in poly.loop_indices]
  if max(angles)-min(angles)>math.pi:angles=[a+2*math.pi if a<0 else a for a in angles]
  for li,a in zip(poly.loop_indices,angles):
   v=o.data.vertices[o.data.loops[li].vertex_index].co
   uv.data[li].uv=(v.z/S['metres']+.23,a*((rx+ry)/2)/S['metres']+.41)
# New structural support addresses original floating tabletop; foot bottom at rug top .026.
for k,a in enumerate([math.pi/2,math.pi/2+2*math.pi/3,math.pi/2+4*math.pi/3]):
 bottom=Vector((cx+.24*math.cos(a),cy+.24*math.sin(a),.026));top=Vector((cx+.15*math.cos(a),cy+.15*math.sin(a),.407));axis=top-bottom
 bpy.ops.mesh.primitive_cone_add(vertices=16,radius1=.022,radius2=.029,depth=axis.length,location=(top+bottom)/2);o=bpy.context.object;o.rotation_euler=axis.to_track_quat('Z','Y').to_euler();bpy.ops.object.transform_apply(location=True,rotation=True,scale=True)
 for v in o.data.vertices:v.co.z=.026 if v.co.z<.2 else .407
 finish(o,'tea_support_'+str(k),2,.002)
box('tea_under_top_bearer',(cx,cy,.390),(.36,.30,.034),0,.004)
bpy.ops.wm.save_as_mainfile(filepath=str(D/'joinery-editable.blend'),compress=True)
bpy.ops.export_scene.gltf(filepath=str(D/'joinery.glb'),export_format='GLB',export_yup=True,export_apply=False,export_extras=True)
p=D/'joinery.glb';raw=p.read_bytes();n=struct.unpack_from('<I',raw,12)[0];d=json.loads(raw[20:20+n]);b=raw[28+n:]
for m in d['materials']:
 if m['name']==wood.name:m['pbrMetallicRoughness']['baseColorFactor']=[*S['factor'],1]
 if m['name']==end.name:m['pbrMetallicRoughness']['baseColorFactor']=[*S['endFactor'],1]
j=json.dumps(d,separators=(',',':')).encode();j+=b' '*((-len(j))%4);p.write_bytes(struct.pack('<III',0x46546c67,2,28+len(j)+len(b))+struct.pack('<II',len(j),0x4e4f534a)+j+struct.pack('<II',len(b),0x004e4942)+b)
tri=0
for o in parts:o.data.calc_loop_triangles();tri+=len(o.data.loop_triangles)
(D/'joinery-metadata.json').write_text(json.dumps({'triangles':tri,'objects':len(parts),'sourceTextures':S['source'],'metres':S['metres'],'diffuseTarget':S['giTargetLinear'],'seconds':time.monotonic()-start,'newFootSupport':'3 supports bottom .026 at actual original rug surface; original floating disk now grounded','limits':'offline candidate only; full source GI/contact and collision require reevaluation after approval'},indent=2))
print('JOINERY',tri,len(parts),flush=True)
