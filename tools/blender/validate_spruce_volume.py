"""Read back v13 derived Blender geometry against exact runtime snapshots."""
from pathlib import Path
import json,hashlib,math
import bpy,numpy as np
ROOT=Path(__file__).resolve().parents[2];D=ROOT/"assets/src/v2/spruce/gpu-v13";report={"revision":"v13-source-readback","lods":{}}
for lod in ["hi","mid","near"]:
 metadata=json.loads((D/f"canopy-{lod}.arrays.json").read_text());raw=np.memmap(D/f"canopy-{lod}.arrays.bin",dtype=np.float32,mode="r");blend=D/f"schrenk-spruce-canopy-{lod}.blend";bpy.ops.wm.open_mainfile(filepath=str(blend));result={"blendBytes":blend.stat().st_size,"parts":{}}
 for name,record in metadata["parts"].items():
  if name=="far_shared":continue
  me=bpy.data.objects[name].data;data={k:np.asarray(raw[v["offset"]//4:v["offset"]//4+v["length"]]) for k,v in record["attributes"].items()};p=np.empty(len(me.vertices)*3,dtype=np.float32);me.vertices.foreach_get("co",p);p=p.reshape(-1,3);p=np.stack((p[:,0],p[:,2],-p[:,1]),axis=1).reshape(-1);error=float(np.max(np.abs(p-data["position"])));assert error==0
  uv=np.empty(len(me.loops)*2,dtype=np.float32);me.uv_layers.active.data.foreach_get("uv",uv);uv=uv.reshape(-1,2);uv[:,1]=1-uv[:,1];uvError=float(np.max(np.abs(uv.reshape(-1)-data["uv"])));assert uvError<6e-8
  for attribute,size,property in [("_PLANT_WIND",3,"vector"),("_CROWN_OCCLUSION",1,"value")]:
   a=np.empty(len(me.vertices)*size,dtype=np.float32);me.attributes[attribute].data.foreach_get(property,a);assert np.array_equal(a,data[attribute.lower()])
  normals=np.empty(len(me.corner_normals)*3,dtype=np.float32);me.corner_normals.foreach_get("vector",normals);normals=normals.reshape(-1,3);normals=np.stack((normals[:,0],normals[:,2],-normals[:,1]),axis=1);expected=data["normal"].reshape(-1,3);dot=np.sum(normals*expected,axis=1)/(np.linalg.norm(normals,axis=1)*np.linalg.norm(expected,axis=1));angles=np.arccos(np.clip(dot,-1,1))*180/math.pi
  result["parts"][name]={"vertices":len(me.vertices),"triangles":len(me.polygons),"positionError":error,"uvError":uvError,"normalP99Degrees":float(np.quantile(angles,.99)),"normalMaximumDegrees":float(np.max(angles))}
 result["materials"]=len({m.name for o in bpy.context.scene.objects if o.type=="MESH" for m in o.data.materials});report["lods"][lod]=result
(D/"source-readback-validation.json").write_text(json.dumps(report,indent=2));print(json.dumps(report))
