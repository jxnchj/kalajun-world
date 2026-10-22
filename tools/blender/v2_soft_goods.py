"""Refine the existing pastoral stacked blankets and seat cushions in place.

Run: tools/.bpy/bin/python tools/blender/v2_soft_goods.py --asset all
Follow with v2_pastoral.py --asset all --export-existing for GLB publication.
The existing object names, transforms, material slots, vertex AO contract and
EXACT object-space bounds remain authoritative. This is authored soft geometry,
not cloth simulation or a claim to reconstruct a measured historic interior.
Back up .blend and published GLBs before running. Re-running is idempotent.
"""
import argparse, hashlib, json, math
from pathlib import Path
import bpy
import numpy as np
from mathutils import Vector
from v2_interior_surfaces import contact_ao

ROOT=Path(__file__).resolve().parents[2]
VERSION='pastoral-soft-goods-27'

def smooth(a,b,x):
    t=max(0,min(1,(x-a)/(b-a)));return t*t*(3-2*t)

def soften(o):
    if o.get('softGoodsVersion')==VERSION:return None
    old=o.data
    p=np.array([v.co[:] for v in old.vertices]);lo=p.min(axis=0);hi=p.max(axis=0)
    centre=(lo+hi)/2;size=hi-lo
    matrix=o.matrix_world.copy();slots=[m.name for m in old.materials]
    blanket='_folded' in o.name
    seed=int(hashlib.sha256(o.name.encode()).hexdigest()[:8],16)
    phase=(seed%1000)/1000*math.tau
    verts=[];faces=[];uvs=[]
    nx,ny=(28,18) if blanket else (24,24)

    def point(s,t,side,layer):
        # Stitched perimeter is pinched; broad loft is independent of the tiny
        # weave normals. Corners are soft, not a beveled rectangular block.
        roundness=.035 if blanket else .085
        x=s*(1-roundness*abs(t)**8)
        y=t*(1-roundness*abs(s)**8)
        puff=max(0,(1-s*s)*(1-t*t))**(.48 if blanket else .62)
        rim=max(abs(s),abs(t))
        if blanket:
            # Two compressed folded leaves; a narrow unjoined lip at the front
            # gives a readable fold, while the back roll joins their contours.
            z=layer*.50+side*(.46+.03*puff)
            crease=.047*math.sin(11*s+2*t+phase)*math.exp(-((t+.90)/.19)**2)
            crease+=.027*math.sin(15*t-2*s+phase)*math.exp(-((abs(s)-.91)/.15)**2)
            z+=crease*(.4+.6*puff)
            y+=layer*.018*(1-t*t)
        else:
            # Lower panel is compressed against the floor; the top has one
            # shallow off-centre seat depression and restrained corner gathers.
            if side>0:
                z=.075+.92*puff
                z-=.15*math.exp(-((s-.10)**2+(t+.08)**2)/.27)*puff
            else:z=-.075-.92*puff
            edge_folds=.07*math.sin(15*s+3*t+phase)*math.exp(-((abs(t)-.84)/.19)**2)
            edge_folds+=.055*math.sin(16*t-2*s-phase)*math.exp(-((abs(s)-.83)/.19)**2)
            z+=edge_folds*(.3+.7*puff)
        return np.array([x,y,z])

    def add_shell(layer):
        start=len(verts)
        for side in (1,-1):
            for j in range(ny+1):
                t=2*j/ny-1
                for i in range(nx+1):
                    s=2*i/nx-1
                    verts.append(point(s,t,side,layer));uvs.append((i/nx,j/ny))
        n=(nx+1)*(ny+1)
        for j in range(ny):
            for i in range(nx):
                a=start+j*(nx+1)+i;q=(a,a+1,a+nx+2,a+nx+1)
                faces.append(q);faces.append(tuple(k+n for k in reversed(q)))
        boundary=list(range(nx+1))+[j*(nx+1)+nx for j in range(1,ny+1)]+[ny*(nx+1)+i for i in range(nx-1,-1,-1)]+[j*(nx+1) for j in range(ny-1,0,-1)]
        for k,a in enumerate(boundary):
            b=boundary[(k+1)%len(boundary)]
            faces.append((start+a,start+n+a,start+n+b,start+b))
        # Sewn welt: actual 1.5–2 mm rounded piping in the SAME mesh/material.
        # No extra object, draw call, alpha cutout or texture download.
        ring=len(verts);sides=4
        for a in boundary:
            j,i=divmod(a,nx+1);s,t=2*i/nx-1,2*j/ny-1
            pos=(point(s,t,1,layer)+point(s,t,-1,layer))/2
            outward=np.array([s,t,0.]);outward/=np.linalg.norm(outward)
            for k in range(sides):
                theta=math.tau*k/sides
                v=pos+outward*(.0035/size[:2].mean())*math.cos(theta)
                v[2]+=(.0030/size[2])*math.sin(theta)
                verts.append(v);uvs.append((i/nx,j/ny))
        for i in range(len(boundary)):
            for j in range(sides):
                a=ring+i*sides+j;b=ring+((i+1)%len(boundary))*sides+j
                faces.append((a,b,ring+((i+1)%len(boundary))*sides+(j+1)%sides,ring+i*sides+(j+1)%sides))

    for layer in (-1,1) if blanket else (0,):add_shell(layer)
    # The original floor contact, chest placement, room transport grid and
    # collision envelopes do not move. Even piping stays within that envelope.
    coords=np.array(verts);nlo=coords.min(axis=0);nhi=coords.max(axis=0)
    coords=lo+(coords-nlo)/(nhi-nlo)*size
    mesh=bpy.data.meshes.new(old.name+'-soft27');mesh.from_pydata(coords.tolist(),[],faces);mesh.update()
    for m in old.materials:mesh.materials.append(m)
    uv=mesh.uv_layers.new(name='UVMap')
    for poly in mesh.polygons:
        poly.use_smooth=True
        for li in poly.loop_indices:uv.data[li].uv=uvs[mesh.loops[li].vertex_index]
    o.data=mesh;o['softGoodsVersion']=VERSION
    o['designDetail']='folded compressed blanket leaves with sewn welts' if blanket else 'compressed seated cushion with pinched seam and corner gathers'
    after=np.array([v.co[:] for v in mesh.vertices])
    assert np.max(abs(after.min(axis=0)-lo))<1e-6
    assert np.max(abs(after.max(axis=0)-hi))<1e-6
    assert o.matrix_world==matrix
    assert [m.name for m in mesh.materials]==slots
    result={'name':o.name,'kind':'folded blanket' if blanket else 'seat cushion','bounds':[lo.tolist(),hi.tolist()],
      'verticesBefore':len(old.vertices),'verticesAfter':len(mesh.vertices),
      'trianglesBefore':sum(len(f.vertices)-2 for f in old.polygons),'trianglesAfter':sum(len(f.vertices)-2 for f in mesh.polygons),
      'transformUnchanged':True,'boundsUnchanged':True,'materialsUnchanged':True}
    if old.users==0:bpy.data.meshes.remove(old)
    return result

def run(asset):
    path=ROOT/'assets/src/v2/pastoral'/f'{asset}-lived.blend'
    bpy.ops.wm.open_mainfile(filepath=str(path))
    candidates=[o for o in bpy.context.scene.objects if o.type=='MESH' and o.name.startswith('pastoral_') and
                ('_chest_folded' in o.name or '_floor_cushion' in o.name or '_seat_cushion' in o.name)]
    assert len(candidates)==7,(asset,[o.name for o in candidates])
    protected={o.name:(tuple(tuple(row) for row in o.matrix_world),len(o.data.vertices),len(o.data.polygons))
               for o in bpy.context.scene.objects if o.type=='MESH' and o not in candidates}
    results=[];changed=[]
    for o in candidates:
        r=soften(o)
        if r:results.append(r);changed.append(o)
    if changed:contact_ao(changed)
    for o in changed:
        color=o.data.color_attributes.get('Color');assert color and len(color.data)==len(o.data.vertices)
        assert all(all(math.isfinite(x) for x in v.co) for v in o.data.vertices)
    for name,value in protected.items():
        o=bpy.data.objects[name]
        assert (tuple(tuple(row) for row in o.matrix_world),len(o.data.vertices),len(o.data.polygons))==value
    bpy.context.scene['softGoodsVersion']=VERSION
    bpy.context.scene['softGoodsScope']='existing 4 stacked textiles and 3 floor cushions; original placement and exact bounds; new contact AO/sky'
    if changed:bpy.ops.wm.save_as_mainfile(filepath=str(path))
    result={'asset':asset,'version':VERSION,'objects':results,'changedMeshes':len(changed),
      'protectedMeshesUnchanged':len(protected),'contactAORebaked':len(changed),'source':str(path.relative_to(ROOT))}
    out=ROOT/'assets/src/v2/pastoral'/f'{asset}-soft-goods-27.json'
    if results or not out.exists():out.write_text(json.dumps(result,indent=2))
    print(json.dumps(result),flush=True)

if __name__=='__main__':
    parser=argparse.ArgumentParser(description=__doc__);parser.add_argument('--asset',choices=['all','house_a','yurt'],default='all')
    args=parser.parse_args()
    for asset in ['house_a','yurt'] if args.asset=='all' else [args.asset]:run(asset)
