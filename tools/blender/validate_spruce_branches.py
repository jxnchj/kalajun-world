"""Read back independent v12 editable sources against their exact runtime-derived arrays."""
from pathlib import Path
import bpy,json,sys,numpy as np
root=Path(__file__).resolve().parents[2]
target=root/'assets/src/v2/spruce/gpu-v12'
names=sys.argv[1:] or ['column','edge','old','pencil','young']
report={'revision':'spruce-branches-v12-source-readback','forms':{}}
for name in names:
    meta=json.loads((target/(name+'.arrays.json')).read_text())
    raw=np.memmap(target/(name+'.arrays.bin'),dtype=np.float32,mode='r')
    file=target/('schrenk-spruce-branches-'+name+'.blend')
    bpy.ops.wm.open_mainfile(filepath=str(file))
    record={'blendBytes':file.stat().st_size,'binaryBytes':meta['binaryBytes'],'retainedBrushes':meta['oldBrushes'],'newShortSprays':meta['newBrushes'],'parts':{},'materials':set()}
    for part,attrs in meta['parts'].items():
        obj=bpy.data.objects[name+'_'+part];mesh=obj.data
        arrays={k:np.asarray(raw[v['offset']//4:v['offset']//4+v['length']]) for k,v in attrs.items()}
        count=len(arrays['position'])//3
        assert len(mesh.vertices)==count and len(mesh.loops)==count and len(mesh.polygons)*3==count
        sample=np.unique(np.linspace(0,count-1,1024,dtype=np.int64))
        expected=arrays['position'].reshape(-1,3)[sample][:,[0,2,1]].copy();expected[:,1]*=-1
        actual=np.array([mesh.vertices[int(i)].co[:] for i in sample]);position=float(np.max(np.abs(actual-expected)))
        wind=float(np.max(np.abs(np.array([mesh.attributes['_PLANT_WIND'].data[int(i)].vector[:] for i in sample])-arrays['_plant_wind'].reshape(-1,3)[sample])))
        ao=float(np.max(np.abs(np.array([mesh.attributes['_CROWN_OCCLUSION'].data[int(i)].value for i in sample])-arrays['_crown_occlusion'][sample])))
        uv=arrays['uv'].reshape(-1,2)[sample].copy();uv[:,1]=1-uv[:,1]
        uv_error=float(np.max(np.abs(np.array([mesh.uv_layers.active.data[int(i)].uv[:] for i in sample])-uv)))
        expected_n=arrays['normal'].reshape(-1,3)[sample][:,[0,2,1]].copy();expected_n[:,1]*=-1
        actual_n=np.array([mesh.corner_normals[int(i)].vector[:] for i in sample])
        cosine=np.sum(actual_n*expected_n,axis=1)/(np.linalg.norm(actual_n,axis=1)*np.linalg.norm(expected_n,axis=1))
        angles=np.arccos(np.clip(cosine,-1,1))*180/np.pi;angle=float(np.max(angles));native_error=0.0
        if angle>.15:
            # Isolate the worst triangle and repeat Blender's native custom-normal
            # encoding in memory. No source is saved or changed by this diagnostic.
            worst=int(np.argmax(angles));vertex=int(sample[worst]);first=vertex//3*3
            tri=arrays['position'].reshape(-1,3)[first:first+3][:,[0,2,1]].copy();tri[:,1]*=-1
            normals=arrays['normal'].reshape(-1,3)[first:first+3][:,[0,2,1]].copy();normals[:,1]*=-1
            probe=bpy.data.meshes.new('normal-encoding-probe');probe.from_pydata(tri.tolist(),[],[(0,1,2)]);probe.polygons[0].use_smooth=True;probe.update();probe.normals_split_custom_set(normals)
            decoded=np.array(probe.corner_normals[vertex-first].vector[:]);native_error=float(np.max(np.abs(decoded-actual_n[worst])));bpy.data.meshes.remove(probe)
            print(json.dumps({'normalEncodingDiagnostic':name+':'+part,'maxAngleDegrees':angle,'p99AngleDegrees':float(np.percentile(angles,99)),'isolatedNativeRoundTripDifference':native_error}),flush=True)
        assert position<1e-5 and wind<1e-6 and ao<1e-6 and uv_error<1e-6 and (angle<.15 or native_error<1e-6),(name,part,position,wind,ao,uv_error,angle,native_error)
        record['parts'][part]={'vertices':count,'triangles':count//3,'sampledVertices':len(sample),'maxPositionError':position,'maxWindError':wind,'maxAOError':ao,'maxUVError':uv_error,'maxNormalDegrees':angle,'p99NormalDegrees':float(np.percentile(angles,99)),'nativeNormalEncodingRoundTripDifference':native_error}
        record['materials'].update(m.name for m in mesh.materials)
    bark=bpy.data.objects[name+'_bark'].data;bark.calc_loop_triangles();record['barkTriangles']=len(bark.loop_triangles);record['materials'].update(m.name for m in bark.materials);record['materials']=sorted(record['materials'])
    record['totalTriangles']=record['barkTriangles']+sum(p['triangles'] for p in record['parts'].values())
    report['forms'][name]=record
    print(json.dumps({name:record}),flush=True)
(target/'source-readback-validation.json').write_text(json.dumps(report,ensure_ascii=False,indent=2)+'\n')
