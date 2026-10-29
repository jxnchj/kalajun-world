"""Small, editable root-mat side-section candidate; never writes public/runtime.
Build: tools/.bpy/bin/python tools/blender/v2_root_mat_section.py --preview
Export manual curve edits: tools/.bpy/bin/python tools/blender/v2_root_mat_section.py --export-existing --preview
Blender X=along bank, Y=toward water, Z=up; units are metres. Root shapes are an
interpreted fibrous bank community, not a scanned/surveyed species specimen.
"""
import argparse, json, math, random, hashlib
from pathlib import Path
import bpy
from mathutils import Vector
ROOT=Path(__file__).resolve().parents[2]
OUT=ROOT/'assets/src/v2/shore/root-mat-section-candidate'
SOURCE=OUT/'root-mat-section.blend'
GLB=OUT/'exports/root-mat-section.glb'
args=argparse.ArgumentParser(description=__doc__)
args.add_argument('--export-existing',action='store_true')
args.add_argument('--preview',action='store_true')
args=args.parse_args()
OUT.mkdir(parents=True,exist_ok=True);GLB.parent.mkdir(parents=True,exist_ok=True)
if SOURCE.exists() and not args.export_existing:
    raise RuntimeError('Editable source exists; use --export-existing after edits. Never overwrite a hand-edited source.')

def material(name,color,roughness):
    m=bpy.data.materials.new(name);m.use_nodes=True
    p=m.node_tree.nodes.get('Principled BSDF');p.inputs['Base Color'].default_value=(*color,1)
    p.inputs['Roughness'].default_value=roughness;p.inputs['Metallic'].default_value=0
    return m

def collection(name):
    c=bpy.data.collections.new(name);bpy.context.scene.collection.children.link(c);return c

def face_y(x,z):
    # Preview-only representative 26 cm run / 22 cm fall; actual bank fitting is
    # deliberately not fabricated here. The terrain remains the real authority.
    return -z*1.18+.003*math.sin(x*16)+.0015*math.sin(z*47+x*11)

def make_curve(name,points,radii,mat,role):
    c=bpy.data.curves.new(name,'CURVE');c.dimensions='3D';c.resolution_u=3
    c.bevel_mode='OBJECT';c.bevel_object=bevel;c.use_fill_caps=True
    s=c.splines.new('BEZIER');s.bezier_points.add(len(points)-1)
    for p,co,r in zip(s.bezier_points,points,radii):
        p.co=co;p.radius=r;p.handle_left_type='AUTO';p.handle_right_type='AUTO'
    o=bpy.data.objects.new(name,c);roots.objects.link(o);c.materials.append(mat)
    o['rootRole']=role;o['baseDiameterMeters']=2*radii[0];o['tipDiameterMeters']=2*radii[-1]
    o['contactContract']='Centreline alternates inside/at representative soil face; refit to actual bank before use.'
    return o

if args.export_existing:
    bpy.ops.wm.open_mainfile(filepath=str(SOURCE))
else:
    bpy.ops.wm.read_factory_settings(use_empty=True)
    sc=bpy.context.scene;sc.unit_settings.system='METRIC';sc.unit_settings.scale_length=1
    roots=collection('ROOTS editable paths');preview=collection('PREVIEW ONLY soil and centimetre scale');profiles=collection('PROFILE shared six-sided root cross-section')
    profile=bpy.data.curves.new('unit hexagonal bevel','CURVE');profile.dimensions='2D'
    poly=profile.splines.new('POLY');poly.points.add(5)
    for i,p in enumerate(poly.points):p.co=(math.cos(i*math.tau/6),math.sin(i*math.tau/6),0,1)
    poly.use_cyclic_u=True;bevel=bpy.data.objects.new('root cross-section - do not export',profile);profiles.objects.link(bevel);bevel.hide_render=True;bevel.hide_set(True)
    old=material('root aged ochre brown',(.105,.061,.031),.91)
    young=material('root fine warm brown',(.155,.094,.050),.88)
    soil=material('PREVIEW soil context only',(.062,.042,.027),.98)
    top=material('PREVIEW organic top only',(.043,.040,.022),.98)
    rnd=random.Random(55150)
    # Separated small fibrous crowns, not an even row or a continuous rope.
    for ci,(cx,count) in enumerate([(-.225,4),(-.082,12),(-.012,8),(.198,11)]):
        cz=-rnd.uniform(.010,.027);cy=face_y(cx,cz)-.006
        neck_radius=rnd.uniform(.0018,.0026)
        neck=[(cx,cy-.004,cz+.010),(cx+.002,cy,cz),(cx-.003,cy+.003,cz-.014)]
        make_curve(f'crown_{ci:02d}',neck,[neck_radius*.72,neck_radius,neck_radius*.48],old,'crown')
        for ri in range(count):
            length=rnd.uniform(.075,.205);drift=rnd.uniform(-.055,.055)
            radius=rnd.uniform(.00065,.00120);phase=rnd.uniform(0,math.tau)
            emergeA=rnd.uniform(.18,.43);emergeB=rnd.uniform(.59,.85)
            pts=[];radii=[]
            for k in range(6):
                t=k/5;z=cz-length*t
                x=cx+drift*t+.012*math.sin(t*8.3+phase)*t+.004*math.sin(t*13.7-phase)*t
                # Only short loops emerge from the cut soil face. Both root
                # origin and its fine distal tip return into the substrate.
                exposure=-.006+.011*math.exp(-((t-emergeA)/.14)**2)+.008*math.exp(-((t-emergeB)/.13)**2)
                y=face_y(x,z)+exposure
                pts.append((x,y,z));radii.append(radius*((1-t)**1.05*.91+.09))
            make_curve(f'root_{ci:02d}_{ri:02d}',pts,radii,old if ri%3 else young,'primary')
            for bi in range(1+(ri%3==0)):
                k=2+bi;start=Vector(pts[k]);dx=rnd.uniform(-.030,.030);down=rnd.uniform(.027,.065)
                child=[];rr=[]
                for step in range(4):
                    t=step/3;x=start.x+dx*t+.003*math.sin(t*3.2)*(-1 if ri%2 else 1);z=start.z-down*t
                    y=start.y if step==0 else face_y(x,z)-.003+.005*math.sin(math.pi*t)
                    child.append((x,y,z));rr.append(radii[k]*(.48*(1-t)+.055))
                make_curve(f'branch_{ci:02d}_{ri:02d}_{bi}',child,rr,young,'fine')
    # A few near-surface lateral roots bridge crowns; local clusters retain
    # exposed soil gaps rather than a dense wall of opaque fine geometry.
    for i in range(18):
        x=rnd.uniform(-.25,.21);z=-rnd.uniform(.015,.050);length=rnd.uniform(.025,.075)
        pts=[]
        for k in range(5):
            t=k/4;xx=x+length*t;zz=z-.014*t+.003*math.sin(t*4+i)
            yy=face_y(xx,zz)-.003+.006*math.sin(math.pi*t)
            pts.append((xx,yy,zz))
        r=rnd.uniform(.00032,.00065)
        make_curve(f'mat_lateral_{i:02d}',pts,[r,r*.9,r*.62,r*.31,r*.12],young,'surface-fibre')
    # Preview soil wedge: front is the same representative face_y used above.
    # This context mesh never enters the exported GLB.
    nx,nz=28,16;verts=[];faces=[]
    for k in range(nz+1):
        z=-.25*k/nz
        for i in range(nx+1):
            x=-.32+.64*i/nx;verts.append((x,face_y(x,z),z))
    for k in range(nz):
        for i in range(nx):
            a=k*(nx+1)+i;faces.append((a,a+nx+1,a+nx+2,a+1))
    base=len(verts);verts.extend([(-.32,-.16,0),(.32,-.16,0),(-.32,-.16,-.25),(.32,-.16,-.25)])
    faces.extend([(base,base+1,nx,0),(base,0,nz*(nx+1),base+2),(nx,base+1,base+3,(nz+1)*(nx+1)-1),(base+2,nz*(nx+1),(nz+1)*(nx+1)-1,base+3)])
    mesh=bpy.data.meshes.new('preview cut soil');mesh.from_pydata(verts,[],faces);mesh.materials.append(soil);mesh.materials.append(top)
    mesh.polygons[-4].material_index=1
    soilob=bpy.data.objects.new('PREVIEW soil face - excluded from GLB',mesh);preview.objects.link(soilob)
    sc['status']='OFF independent root geometry candidate; not fitted or adopted in production'
    sc['basis']='Designed fibrous roots for bank50 middle-root-lobe; no scan or species identification claim'
    sc['localAxes']='Blender X=along stream; Y=toward water; Z=up; origin=local soil top at patch centre'
    sc['targetArea']='offset1.5 +/-0.275m, right bank 0.06..0.32m outside actual water edge; retain existing 521 plant roots'
    sc['previewFace']='Y=-1.18*Z + millimetre perturbation; preview-only substrate, refit before runtime placement'
    sc['sourceScript']='tools/blender/v2_root_mat_section.py'
    bpy.ops.wm.save_as_mainfile(filepath=str(SOURCE))

root_objects=sorted((o for o in bpy.context.scene.objects if o.get('rootRole')),key=lambda o:o.name)
if not root_objects:raise RuntimeError('No editable root objects in source')
# Save curves as source; export evaluated duplicate meshes in two material batches.
clones=[]
bpy.ops.object.select_all(action='DESELECT')
for o in root_objects:
    c=o.copy();c.data=o.data.copy();bpy.context.scene.collection.objects.link(c);c.select_set(True);clones.append(c)
bpy.context.view_layer.objects.active=clones[0];bpy.ops.object.convert(target='MESH')
clones=list(bpy.context.selected_objects)
for o in clones:
    for f in o.data.polygons:f.use_smooth=True
batches=[]
groups={}
for o in clones:groups.setdefault(o.active_material.name,[]).append(o)
for mat,group in sorted(groups.items()):
    bpy.ops.object.select_all(action='DESELECT')
    for o in group:o.select_set(True)
    bpy.context.view_layer.objects.active=group[0];bpy.ops.object.join();batches.append(group[0]);group[0].name=mat.replace(' ','_')
    group[0]['detailRole']='root-mat-fragment';group[0]['originalRootPaths']=len(group)
bpy.ops.object.select_all(action='DESELECT')
for o in batches:o.select_set(True)
bpy.context.view_layer.objects.active=batches[0]
for o in batches:o.data.calc_loop_triangles()
vertices=[o.matrix_world@v.co for o in batches for v in o.data.vertices]
lo=[min(v[i] for v in vertices)for i in range(3)];hi=[max(v[i]for v in vertices)for i in range(3)]
triangles=sum(len(o.data.loop_triangles)for o in batches)
bpy.ops.export_scene.gltf(filepath=str(GLB),export_format='GLB',use_selection=True,export_apply=False,export_animations=False,export_yup=True,export_extras=True,export_cameras=False,export_lights=False)
for o in batches:bpy.data.objects.remove(o,do_unlink=True)
roles={}
for o in root_objects:roles[o['rootRole']]=roles.get(o['rootRole'],0)+1
control=[]
for o in root_objects:
    if o.type=='CURVE':
        for s in o.data.splines:
            for p in s.bezier_points:control.append((p.co.y-face_y(p.co.x,p.co.z),p.radius))
report={'status':'independent OFF candidate, not runtime fitted/adopted','blend':str(SOURCE.relative_to(ROOT)),'glb':str(GLB.relative_to(ROOT)),
 'sourceSHA256':hashlib.sha256(SOURCE.read_bytes()).hexdigest(),'glbBytes':GLB.stat().st_size,'triangles':triangles,'vertices':len(vertices),'materialBatches':len(batches),'rootPaths':len(root_objects),'roles':roles,
 'boundsBlenderMeters':{'min':lo,'max':hi,'size':[b-a for a,b in zip(lo,hi)]},'axes':'Blender X along-bank, Y toward-water, Z up; glTF (x,y,z)=(Blender x,z,-y)',
 'origin':'local soil top at patch centre','diameterMeters':{'minTip':min(o['tipDiameterMeters']for o in root_objects),'maxBase':max(o['baseDiameterMeters']for o in root_objects)},
 'previewFaceContact':{'controlPoints':len(control),'buriedControlPoints':sum(d<0 for d,r in control),'maximumCentrelineProtrusionMeters':max(d for d,r in control)},
 'material':'2 opaque, nonmetallic Principled PBR materials; roughness .88/.91; no images, no AO encoded as RGB, no alpha cards',
 'usage':'Candidate only. Place sparingly within bank50 middle-root-lobe; deform/fix actual mesh to heightAt and real side slope, with starts and tips buried. Do not tile entire bank. Preview soil and scale are not exported.',
 'target':{'feature':'middle-root-lobe','offset':1.5,'halfPatchLength':.275,'outsideWaterEdge':[.06,.32],'existingPlantRoots':521,'alongXZ':[-.0135559060371,-.9999081144843],'towardWaterXZ':[-.9999081144843,.0135559060371]},
 'limitations':['Root morphology is hand-designed from general fibrous growth, not a species or site scan.','Representative soil face is not the exact runtime bank. No placement/contact/visibility adoption claim.','No micro root hairs: fine terminal roots below about a tenth millimetre are not intended for sustained distant rendering.']}
(OUT/'asset.json').write_text(json.dumps(report,indent=2)+'\n')
if args.preview:
    scene=bpy.context.scene;scene.render.engine='CYCLES';scene.cycles.device='CPU';scene.cycles.samples=48;scene.cycles.use_denoising=True
    scene.render.threads_mode='FIXED';scene.render.threads=6
    scene.render.resolution_x=1280;scene.render.resolution_y=850;scene.render.resolution_percentage=100
    scene.render.image_settings.file_format='PNG';scene.view_settings.view_transform='AgX'
    world=bpy.data.worlds.new('neutral inspection world');world.use_nodes=True;world.node_tree.nodes['Background'].inputs[0].default_value=(.42,.45,.48,1);world.node_tree.nodes['Background'].inputs[1].default_value=.6;scene.world=world
    bpy.ops.object.light_add(type='AREA',location=(-.6,.5,.9));key=bpy.context.object;key.data.energy=45;key.data.shape='DISK';key.data.size=.85
    bpy.ops.object.camera_add(location=(.57,.88,.24));cam=bpy.context.object;target=Vector((0,.12,-.11));cam.rotation_euler=(target-cam.location).to_track_quat('-Z','Y').to_euler();cam.data.type='ORTHO';cam.data.ortho_scale=.86;scene.camera=cam
    rulerMat=material('PREVIEW scale warm grey',(.22,.22,.20),.85)
    bpy.ops.mesh.primitive_cube_add(size=1,location=(-.20,.37,-.285));bar=bpy.context.object;bar.name='PREVIEW ten centimetres';bar.dimensions=(.1,.004,.004);bar.data.materials.append(rulerMat)
    for x in [-.25,-.20,-.15]:
        bpy.ops.mesh.primitive_cube_add(size=1,location=(x,.37,-.279));o=bpy.context.object;o.dimensions=(.002,.004,.016);o.data.materials.append(rulerMat)
    bpy.ops.object.text_add(location=(-.20,.37,-.320));txt=bpy.context.object;txt.data.body='10 cm';txt.data.align_x='CENTER';txt.data.size=.018;txt.rotation_euler=(cam.location-txt.location).to_track_quat('Z','Y').to_euler();txt.data.materials.append(rulerMat)
    scene.render.filepath=str(OUT/'preview-soil-context.png');bpy.ops.render.render(write_still=True)
    for o in bpy.data.collections['PREVIEW ONLY soil and centimetre scale'].objects:o.hide_render=True
    cam.location=(.12,.9,.04);target=Vector((0,.12,-.11));cam.rotation_euler=(target-cam.location).to_track_quat('-Z','Y').to_euler();cam.data.ortho_scale=.72
    scene.render.film_transparent=True;scene.render.filepath=str(OUT/'preview-root-structure.png');bpy.ops.render.render(write_still=True)
print(json.dumps(report))
