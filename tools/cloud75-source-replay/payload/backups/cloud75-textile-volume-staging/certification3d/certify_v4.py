"""Read-only baseline/v2 BVH broadphase + explicit triangle narrowphase.
All evidence remains under this directory. No saved scene/source changes.
"""
import sys,json,hashlib,time,itertools,argparse
from pathlib import Path
sys.dont_write_bytecode=True
H=Path(__file__).resolve().parent;S=H.parent;R=S.parents[1]
sys.path.insert(0,str(H))
from triangle_intersection import triangle_intersection
import bpy
from mathutils import Vector
from mathutils.bvhtree import BVHTree
EPS=1e-7
TARGETS=['pastoral_house_chest_folded'+str(i)for i in range(4)]+['pastoral_house_chest_topcover']
parser=argparse.ArgumentParser();parser.add_argument('--candidate',type=Path,required=True);args=parser.parse_args(sys.argv[sys.argv.index('--')+1:]if'--'in sys.argv else []);C=args.candidate.resolve();assert C.parent==S and C.is_dir();assert not(C/'triangle-surface-certification.json').exists()
SOURCES={'baseline':R/'assets/src/v2/pastoral/textiles62/house-a-textiles62.blend','candidate':C/'textile-volume75.blend'}
sha=lambda p:hashlib.sha256(p.read_bytes()).hexdigest()
HASHES={str(p):sha(p)for p in SOURCES.values()}
def overlap(a,b):return all(a[0][k]<=b[1][k]+EPS and b[0][k]<=a[1][k]+EPS for k in range(3))
def bbox(p):return [[min(v[k]for v in p)for k in range(3)],[max(v[k]for v in p)for k in range(3)]]
def load(path):
 bpy.ops.wm.open_mainfile(filepath=str(path));bpy.context.view_layer.update()
 assert len(bpy.context.scene.objects)==269 and sum(o.type=='MESH'for o in bpy.context.scene.objects)==267
 assert all(not any(m.show_viewport or m.show_render for m in o.modifiers) and (o.type!='MESH' or o.data.shape_keys is None)for o in bpy.context.scene.objects), 'Raw vs evaluated geometry scope unresolved'
 out={};targetboxes=[bbox([tuple(bpy.data.objects[n].matrix_world@v.co)for v in bpy.data.objects[n].data.vertices])for n in TARGETS]
 for o in bpy.context.scene.objects:
  if o.type!='MESH':continue
  p=[tuple(o.matrix_world@v.co)for v in o.data.vertices];box=bbox(p)
  if o.name not in TARGETS and not any(overlap(box,b)for b in targetboxes):continue
  o.data.calc_loop_triangles();faces=[tuple(t.vertices)for t in o.data.loop_triangles]
  out[o.name]={'points':p,'faces':faces,'bounds':box,'bvh':BVHTree.FromPolygons([Vector(v)for v in p],faces,all_triangles=True,epsilon=EPS)}
 return out

def part(name,tri):
 if name in TARGETS[:4]:
  for start,leaf in ((0,'lower'),(1470,'upper')):
   if all(start<=i<start+1102 for i in tri):return leaf,'shell',start,551
   if all(start+1102<=i<start+1470 for i in tri):return leaf,'welt',start,551
 elif name==TARGETS[4]:
  if all(i<1302 for i in tri):return 'cover','shell',0,651
  if all(i>=1302 for i in tri):return 'cover','welt',0,651
 return 'other','other',0,0

def designed_seam(name,ta,tb):
 a=part(name,ta);b=part(name,tb)
 if a[0]!=b[0]or {a[1],b[1]}!={'shell','welt'}:return False
 shell,welt=(ta,tb)if a[1]=='shell'else(tb,ta);_,_,start,n=a
 nx,ny,sides=(28,18,4)if n==551 else(30,20,6)
 ids={i-start for i in shell}
 if not any(i<n for i in ids)or not any(i>=n for i in ids):return False
 boundary=list(range(nx+1))+[j*(nx+1)+nx for j in range(1,ny+1)]+[ny*(nx+1)+i for i in range(nx-1,-1,-1)]+[j*(nx+1)for j in range(ny-1,0,-1)]
 rings={(i-start-2*n)//sides for i in welt};owners={boundary[(j+d)%len(boundary)]for j in rings for d in (-1,0,1)}
 return {i%n for i in ids}<=owners

def point_segment_distance(p,a,b):
 p=Vector(p);a=Vector(a);v=Vector(b)-a
 t=max(0.,min(1.,(p-a).dot(v)/v.length_squared))if v.length_squared else 0.
 return (p-a-v*t).length

def topological_touch(mesh,ta,tb,result):
 shared=set(ta)&set(tb)
 if not shared or result['kind']=='coplanar_overlap':return False
 points=result.get('points')or result.get('segment')or []
 if not points:return False
 xyz=[mesh['points'][i]for i in shared]
 if len(shared)==1:return all((Vector(p)-Vector(xyz[0])).length<=EPS*4 for p in points)
 if len(shared)==2:return all(point_segment_distance(p,*xyz)<=EPS*4 for p in points)
 return False

def run(label,meshes):
 rows={};stats={'broadphasePairs':0,'narrowphasePairs':0,'topologicalTouches':0,'separated':0,'touch':0,'uncertain':0};tested=[]
 names=sorted(meshes)
 for ia,a in enumerate(names):
  for b in names[ia:]:
   if a not in TARGETS and b not in TARGETS:continue
   if not overlap(meshes[a]['bounds'],meshes[b]['bounds']):continue
   aa,bb=meshes[a],meshes[b];pairs=aa['bvh'].overlap(bb['bvh']);pairs=sorted(set((i,j)for i,j in pairs if a!=b or i<j))
   assert len(pairs)<=500000,('broadphase cap',label,a,b,len(pairs))
   stats['broadphasePairs']+=len(pairs);tested.append({'a':a,'b':b,'broadPairs':len(pairs)})
   print(json.dumps({'phase':label,'pair':[a,b],'broadPairs':len(pairs)}),flush=True)
   for i,j in pairs:
    ta,tb=aa['faces'][i],bb['faces'][j];pa=[aa['points'][k]for k in ta];pb=[bb['points'][k]for k in tb]
    result=triangle_intersection(pa,pb,eps=EPS);stats['narrowphasePairs']+=1;kind=result['kind']
    if kind=='separated':stats['separated']+=1;continue
    if a==b and topological_touch(aa,ta,tb,result):stats['topologicalTouches']+=1;continue
    if kind=='touch':stats['touch']+=1
    if kind.startswith('uncertain'):stats['uncertain']+=1
    seam=a==b and designed_seam(a,ta,tb)
    key=f'{a}:{i}|{b}:{j}'
    rows[key]={'objects':[a,b],'triangles':[i,j],'vertexIDs':[ta,tb],'parts':[part(a,ta)[:2],part(b,tb)[:2]],'designedOwnSidewallSeam':seam,'narrowphase':result}
 return rows,stats,tested

started=time.monotonic();output={'epsilonMeters':EPS,'sources':HASHES,'sourceGeometryHash':sha(R/'web/public/assets/v2/house-textiles62/geometry.glb'),'candidateGeometryHash':sha(C/'geometry.glb'),'status':'started'}
try:
 baseline=load(SOURCES['baseline']);old,oldstats,oldpairs=run('baseline',baseline);del baseline
 candidate=load(SOURCES['candidate']);new,newstats,newpairs=run('candidate',candidate)
 newkeys=set(new)-set(old);removed=set(old)-set(new);retained=set(old)&set(new)
 blockers={k:v for k,v in new.items()if v['narrowphase']['kind'].startswith('uncertain')or not v['designedOwnSidewallSeam']}
 output.update(status='REJECTED'if blockers else'full 3D sampled-mesh triangle checks passed within stated epsilon; not visual/GI acceptance',baselineStats=oldstats,candidateStats=newstats,baselinePairs=oldpairs,candidatePairs=newpairs,baselineIntersections=old,candidateIntersections=new,newPairKeys=sorted(newkeys),removedPairKeys=sorted(removed),retainedPairKeys=sorted(retained),blockerKeys=sorted(blockers),policy='Only intersection confined to shared source topology is removed as topological contact. Own-leaf welt to corresponding/neighboring sidewall seam explicitly labeled. All candidate non-seam true intersections and uncertainties block, including retained baseline ones. Any non-seam touch is a blocker; only verified designed own-sidewall seams are exempt, and uncertain seams still block.',coverage='All 5 target meshes self pairs, each other and every scene mesh with overlapping AABB; BVH broadphase only, triangle narrowphase on every candidate. Full tessellated source meshes, no decimation.')
except Exception as e:
 import traceback
 output.update(status='INCOMPLETE',error=repr(e),traceback=traceback.format_exc());raise
finally:
 output['wallSeconds']=time.monotonic()-started;output['protectedSourcesUnchanged']=all(sha(Path(p))==h for p,h in HASHES.items());(C/'triangle-surface-certification.json').write_text(json.dumps(output,indent=2)+'\n')
 assert output['protectedSourcesUnchanged']
print(json.dumps({k:output[k]for k in ['status','wallSeconds','baselineStats','candidateStats','blockerKeys']}),flush=True)

if output['blockerKeys']:raise SystemExit(19)
