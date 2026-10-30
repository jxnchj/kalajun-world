"""Explicit triangle narrowphase, in meters; standard Python only.

BVH pairs must be passed here, not counted as geometric intersections directly.
`eps` is a distance tolerance, default 1e-7m; angular epsilon is 1e-10.
Coplanarity within eps is tolerance contact, not proof of penetration: output
includes plane-distance maximum. `proper_crossing` means the shared segment's
midpoint is in the strict interior of BOTH triangles. Edge/vertex-only contact
is `touch`, even when one triangle is cut internally by the other's edge.
Near-degenerate/near-parallel unresolved cases are explicit `uncertain_*` and
must block strict certification or receive an independent exact predicate.
No topological adjacency or intentional sewn-seam exclusions occur here.
"""
import math
ANGULAR_EPS=1e-10

def sub(a,b):return tuple(x-y for x,y in zip(a,b))
def add(a,b):return tuple(x+y for x,y in zip(a,b))
def mul(a,s):return tuple(x*s for x in a)
def dot(a,b):return sum(x*y for x,y in zip(a,b))
def cross(a,b):return (a[1]*b[2]-a[2]*b[1],a[2]*b[0]-a[0]*b[2],a[0]*b[1]-a[1]*b[0])
def norm(a):return math.sqrt(dot(a,a))
def lerp(a,b,t):return add(a,mul(sub(b,a),t))
def dedup(points,eps):
 out=[]
 for p in points:
  if not any(norm(sub(p,q))<=eps for q in out):out.append(p)
 return out

def section(tri,dist,eps):
 out=[]
 for i in range(3):
  j=(i+1)%3;a,b=tri[i],tri[j];da,db=dist[i],dist[j]
  if abs(da)<=eps:out.append(a)
  # Use actual opposite signs; points already classified near plane retained.
  if da*db<0:out.append(lerp(a,b,da/(da-db)))
 return dedup(out,eps)

def strict_interior(tri,p,eps):
 # Signed edge distances IN the triangle plane are meter-valued.
 n=cross(sub(tri[1],tri[0]),sub(tri[2],tri[0]));n=mul(n,1/norm(n))
 ds=[]
 for a,b in zip(tri,tri[1:]+tri[:1]):
  edge=sub(b,a);ds.append(dot(cross(edge,sub(p,a)),n)/norm(edge))
 return min(ds)>eps,min(ds)

def clip_coplanar(a,b,n,eps):
 axis=max(range(3),key=lambda k:abs(n[k]));keep=[k for k in range(3)if k!=axis]
 project=lambda p:(p[keep[0]],p[keep[1]])
 aa=[project(p)for p in a];bb=[project(p)for p in b]
 c2=lambda p,q,r:(q[0]-p[0])*(r[1]-p[1])-(q[1]-p[1])*(r[0]-p[0])
 sign=1 if c2(*bb)>0 else -1;poly=aa
 for p,q in zip(bb,bb[1:]+bb[:1]):
  out=[]
  for x,y in zip(poly,poly[1:]+poly[:1]):
   dx=sign*c2(p,q,x);dy=sign*c2(p,q,y)
   if dx>=0:out.append(x)
   if (dx>=0)!=(dy>=0):out.append(lerp(x,y,dx/(dx-dy)))
  poly=dedup(out,eps)
  if not poly:break
 area=abs(sum(x[0]*y[1]-x[1]*y[0]for x,y in zip(poly,poly[1:]+poly[:1])))*.5 if len(poly)>=3 else 0.
 area/=abs(n[axis])
 return poly,area,axis

def triangle_intersection(a,b,eps=1e-7):
 """Classify one pair. Inputs three finite 3D points each; outputs JSON-safe."""
 a=[tuple(map(float,p))for p in a];b=[tuple(map(float,p))for p in b]
 if len(a)!=3 or len(b)!=3 or any(len(p)!=3 or not all(map(math.isfinite,p))for p in a+b):raise ValueError('Expected two finite 3D triangles')
 if not math.isfinite(eps)or eps<=0:raise ValueError('eps must be positive finite meters')
 def result(kind,intersects,**extra):return dict(kind=kind,intersects=intersects,epsilonMeters=eps,**extra)
 # AABB is another rejection only; no positive broadphase claim is made.
 if any(max(p[k]for p in a)<min(p[k]for p in b)-eps or max(p[k]for p in b)<min(p[k]for p in a)-eps for k in range(3)):return result('separated',False)
 na=cross(sub(a[1],a[0]),sub(a[2],a[0]));nb=cross(sub(b[1],b[0]),sub(b[2],b[0]));la=norm(na);lb=norm(nb)
 if min(la,lb)<=eps*eps:return result('uncertain_degenerate',None,doubleAreas=[la,lb])
 na=mul(na,1/la);nb=mul(nb,1/lb)
 da=[dot(sub(p,b[0]),nb)for p in a];db=[dot(sub(p,a[0]),na)for p in b]
 if min(da)>eps or max(da)<-eps or min(db)>eps or max(db)<-eps:return result('separated',False)
 line=cross(na,nb);ln=norm(line);plane_max=max(abs(x)for x in da+db)
 if ln<=ANGULAR_EPS:
  if plane_max>eps:return result('uncertain_near_parallel',None,normalCrossMagnitude=ln,maxPlaneDistance=plane_max)
  poly,area,axis=clip_coplanar(a,b,na,eps)
  if not poly:return result('separated',False,maxPlaneDistance=plane_max)
  keep=[k for k in range(3)if k!=axis];points=[]
  for uv in poly:
   p=[0.,0.,0.];p[keep[0]],p[keep[1]]=uv
   p[axis]=(dot(na,a[0])-sum(na[k]*p[k]for k in keep))/na[axis];points.append(tuple(p))
  if area>eps*eps:return result('coplanar_overlap',True,overlapArea=area,projectedPolygon=poly,points=points,droppedAxis=axis,maxPlaneDistance=plane_max)
  return result('touch',True,contactType='coplanar_boundary',overlapArea=area,projectedPolygon=poly,points=points,droppedAxis=axis,maxPlaneDistance=plane_max)
 line=mul(line,1/ln);sa=section(a,da,eps);sb=section(b,db,eps)
 if not sa or not sb:return result('separated',False)
 # Sections all lie along the plane/plane intersection, apart from eps band.
 ia=[dot(p,line)for p in sa];ib=[dot(p,line)for p in sb];lo=max(min(ia),min(ib));hi=min(max(ia),max(ib))
 if hi<lo-eps:return result('separated',False)
 anchor=sa[0];origin_t=dot(anchor,line)
 p=add(anchor,mul(line,lo-origin_t));q=add(anchor,mul(line,hi-origin_t));length=max(0.,hi-lo)
 mid=mul(add(p,q),.5);inside_a,edge_a=strict_interior(a,mid,eps);inside_b,edge_b=strict_interior(b,mid,eps)
 if length>eps and inside_a and inside_b:return result('proper_crossing',True,segment=[p,q],points=[p,q],segmentLength=length,midpointEdgeClearance=[edge_a,edge_b])
 return result('touch',True,contactType='noncoplanar_boundary',segment=[p,q],points=[p,q],segmentLength=length,midpointEdgeClearance=[edge_a,edge_b])
