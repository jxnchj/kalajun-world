"""Six CPU Cycles diagnostics, NOT world/runtime/material acceptance frames."""
import sys,json,hashlib,time,argparse
from pathlib import Path
sys.dont_write_bytecode=True
import bpy
from mathutils import Vector
S=Path(__file__).resolve().parent;R=S.parents[1]
p=argparse.ArgumentParser();p.add_argument('--candidate',type=Path,required=True);args=p.parse_args(sys.argv[sys.argv.index('--')+1:]);C=args.candidate.resolve();assert C.parent==S
H=C/'previews-final';assert not H.exists(),'Do not overwrite diagnostic evidence';H.mkdir()
state=json.loads((C/'corrected-state.json').read_text());audit=json.loads((C/'audit.json').read_text());source=C/'textile-volume75.blend'
assert hashlib.sha256(source.read_bytes()).hexdigest()==audit['outputSHA256']['textile-volume75.blend']
assert json.loads((C/'saved-blend-readback.json').read_text())['status']=='SAVED_BLEND_RELOAD_CHECKS_PASSED_NOT_GI_OR_WORLD_ACCEPTANCE'
assert not json.loads((C/'triangle-surface-certification.json').read_text())['blockerKeys']
sources={'candidateV4Corrected':source}
sha=lambda p:hashlib.sha256(p.read_bytes()).hexdigest();hashes={str(p):sha(p)for p in sources.values()}
views={'whole-stack':{'location':[2.6,-.2,1.95],'target':[.95,1.98,.79],'ortho':1.4},'side-low':{'location':[3.3,1.98,.91],'target':[.95,1.98,.86],'ortho':1.15},'front':{'location':[.95,-.7,1.05],'target':[.95,1.98,.84],'ortho':1.2}}
lights=[{'location':[.1,.2,3.6],'energy':220.,'size':2.5},{'location':[2.9,2.8,2.6],'energy':100.,'size':2.0}]
rows=[];started=time.monotonic()
for label,path in sources.items():
 bpy.ops.wm.open_mainfile(filepath=str(path));scene=bpy.context.scene
 selected=[]
 for obj in scene.objects:
  obj.hide_render=not(obj.type=='MESH'and (obj.name.startswith('pastoral_house_chest_') or obj.name=='pastoral_house_lining_back_window_reveal.001'))
  if not obj.hide_render:selected.append(obj.name)
 scene.render.engine='CYCLES';scene.cycles.device='CPU';scene.cycles.samples=16;scene.cycles.use_denoising=False;scene.cycles.max_bounces=4;scene.cycles.seed=0;scene.cycles.use_animated_seed=False
 scene.render.resolution_x=640;scene.render.resolution_y=480;scene.render.resolution_percentage=100;scene.render.image_settings.file_format='PNG';scene.render.film_transparent=False
 scene.view_settings.view_transform='AgX';scene.view_settings.exposure=0.;scene.view_settings.gamma=1.
 world=bpy.data.worlds.new('offline75-diagnostic-world');world.use_nodes=True;world.node_tree.nodes['Background'].inputs['Color'].default_value=(.18,.18,.18,1);world.node_tree.nodes['Background'].inputs['Strength'].default_value=.3;scene.world=world
 for i,spec in enumerate(lights):
  data=bpy.data.lights.new('offline75-area'+str(i),'AREA');data.energy=spec['energy'];data.shape='DISK';data.size=spec['size'];obj=bpy.data.objects.new(data.name,data);scene.collection.objects.link(obj);obj.location=spec['location'];obj.rotation_euler=(Vector((.95,1.98,.8))-obj.location).to_track_quat('-Z','Y').to_euler()
 camera=bpy.data.cameras.new('offline75-camera');camera.type='ORTHO';obj=bpy.data.objects.new(camera.name,camera);scene.collection.objects.link(obj);scene.camera=obj
 for name,spec in views.items():
  obj.location=spec['location'];obj.rotation_euler=(Vector(spec['target'])-obj.location).to_track_quat('-Z','Y').to_euler();camera.ortho_scale=spec['ortho'];scene.render.filepath=str(H/(label+'-'+name+'.png'));bpy.context.view_layer.update();t=time.monotonic();bpy.ops.render.render(write_still=True)
  p=Path(scene.render.filepath);rows.append({'source':label,'view':name,'path':str(p),'sha256':sha(p),'seconds':time.monotonic()-t,'visibleOriginalObjects':selected});print(json.dumps(rows[-1]),flush=True)
assert all(sha(Path(p))==h for p,h in hashes.items())
report={'candidateStatus':'FINAL CORRECTED OFFLINE DIAGNOSTIC, AO/GI/WORLD PENDING, OFF','scope':'Offline shape-only diagnostic, not browser/world/GI/material acceptance. Same explicit historical three cameras, lights, 640x480, 16 samples; seed fixed0. Original71 historical reference metadata at previews-v3-visual/metadata.json. No source saved after diagnostics.','inputs':hashes,'geometrySHA256':sha(C/'geometry.glb'),'savedBlendReadbackSHA256':sha(C/'saved-blend-readback.json'),'stateSHA256':sha(C/'corrected-state.json'),'views':views,'lights':lights,'renderer':'Cycles CPU','resolution':[640,480],'samples':16,'seed':0,'animatedSeed':False,'denoise':False,'maxBounces':4,'rows':rows,'elapsedSeconds':time.monotonic()-started,'protectedSourcesUnchanged':True}
(H/'metadata.json').write_text(json.dumps(report,indent=2)+'\n')
