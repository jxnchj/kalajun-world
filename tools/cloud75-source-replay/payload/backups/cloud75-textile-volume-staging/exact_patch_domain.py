"""Exact rational subset/confinement proof for a named small changed XY patch.
Coordinates are the exact rationals represented by input finite binary floats.
No sliver drops, tolerance, approximate intersections, or numerical repair.
"""
from fractions import Fraction as F
import math,hashlib,json
class Limit(RuntimeError):pass
class Budget:
 def __init__(self,limit):assert limit>0;self.limit=limit;self.used=0
 def charge(self,n=1):
  self.used+=n
  if self.used>self.limit:raise Limit('Exact patch domain operation cap')
def cross(a,b,c):return (b[0]-a[0])*(c[1]-a[1])-(b[1]-a[1])*(c[0]-a[0])
def signed(poly):return sum(a[0]*b[1]-a[1]*b[0]for a,b in zip(poly,poly[1:]+poly[:1]))/2
def area(poly):return abs(signed(poly))if len(poly)>2 else F(0)
def clean(poly):
 out=[]
 for p in poly:
  if not out or out[-1]!=p:out.append(p)
 if len(out)>1 and out[0]==out[-1]:out.pop()
 return out

def polygon(points):
 assert len(points)>=3 and all(len(p)>=2 and all(math.isfinite(v)for v in p[:2])for p in points),'Nonfinite/degenerate projected input'
 p=clean([tuple(F(v)for v in q[:2])for q in points]);a=signed(p);assert a!=0,'Zero projected area receiver'
 if a<0:p.reverse()
 assert all(cross(a,b,q)>=0 for a,b in zip(p,p[1:]+p[:1])for q in p),'Nonconvex projected input'
 return p

def clip(poly,a,b,inside,budget):
 out=[];sign=1 if inside else -1
 for p,q in zip(poly,poly[1:]+poly[:1]):
  budget.charge();dp=sign*cross(a,b,p);dq=sign*cross(a,b,q)
  if dp>=0:out.append(p)
  if (dp>=0)!=(dq>=0):
   t=dp/(dp-dq);out.append((p[0]+t*(q[0]-p[0]),p[1]+t*(q[1]-p[1])))
 return clean(out)
def subtract(poly,cutter,budget):
 remain=poly;out=[]
 for a,b in zip(cutter,cutter[1:]+cutter[:1]):
  budget.charge();piece=clip(remain,a,b,False,budget)
  if area(piece)>0:out.append(piece)
  remain=clip(remain,a,b,True,budget)
  if area(remain)==0:break
 return out

def bounds(p):return (min(q[0]for q in p),min(q[1]for q in p),max(q[0]for q in p),max(q[1]for q in p))
def disjoint(a,b):return a[2]<=b[0]or b[2]<=a[0]or a[3]<=b[1]or b[3]<=a[1]
def difference(polys,cutters,budget):
 boxes=[bounds(c)for c in cutters];result=[]
 for poly in polys:
  pieces=[poly];box=bounds(poly)
  # Every cutter is considered. Exact bounding boxes reject only zero-area
  # overlap; no receiver crop or approximate spatial-index omission.
  for cutter,cb in zip(cutters,boxes):
   budget.charge()
   if disjoint(box,cb):continue
   remaining=[]
   for piece in pieces:
    budget.charge()
    if disjoint(bounds(piece),cb):remaining.append(piece)
    else:remaining.extend(subtract(piece,cutter,budget))
   pieces=remaining
   if not pieces:break
  result.extend(pieces)
 return result

def hull(points):
 points=sorted(set(points))
 def half(seq):
  out=[]
  for p in seq:
   while len(out)>1 and cross(out[-2],out[-1],p)<=0:out.pop()
   out.append(p)
  return out
 return half(points)[:-1]+half(reversed(points))[:-1]
def upper(value):
 if not value:return 0.
 return math.nextafter(float(value),math.inf)
def describe(polys):
 total=sum((area(p)for p in polys),F(0))
 return {'area':float(total),'areaUpperBound':upper(total),'exactArea':str(total),'regions':[{'polygon':[[float(v)for v in q]for q in p],'exactPolygon':[[str(v)for v in q]for q in p],'areaUpperBound':upper(area(p)),'representativePoint':[float(sum(q[k]for q in p)/len(p))for k in (0,1)]}for p in polys]}
def xy_rows(tris):
 assert all(len(t)==3 and all(len(p)>=2 and all(math.isfinite(v)for v in p[:2])for p in t)for t in tris),'Nonfinite support XY'
 return [[tuple(p[:2])for p in t]for t in tris]
def digest(value):return hashlib.sha256(json.dumps(value,separators=(',',':'),allow_nan=False).encode()).hexdigest()

def certify(old_triangles,new_triangles,old_support,new_support,changed_ids,max_operations=2000000):
 budget=Budget(max_operations);oldxy=xy_rows(old_triangles);newxy=xy_rows(new_triangles);s0=xy_rows(old_support);s1=xy_rows(new_support)
 assert len(oldxy)==len(newxy) and len(s0)>0 and s0==s1,'Full support XY triangle arrays differ or absent'
 changed=set(changed_ids);assert all(isinstance(i,int)and 0<=i<len(oldxy)for i in changed)
 actual={i for i,(a,b)in enumerate(zip(oldxy,newxy))if a!=b};assert actual<=changed,'Changed receiver outside named mask'
 assert all(a==b for i,(a,b)in enumerate(zip(oldxy,newxy))if i not in changed)
 old=[polygon(t)for t in oldxy];new=[polygon(t)for t in newxy]
 removed=difference([old[i]for i in sorted(changed)],new,budget)
 added=difference([new[i]for i in sorted(changed)],old,budget)
 sweep=[hull(old[i]+new[i])for i in sorted(changed)]
 outside=difference(removed+added,sweep,budget)
 subset=not added;confined=not outside
 theorem=subset and confined
 result={'method':'Exact rational changed-patch subtraction; all other receiver triangles cancel by exact equality; all opposite-domain triangles queried','removedDomain':describe(removed),'newDomain':describe(added),'changedDomainOutsidePatchSweep':describe(outside),'supportXYExactlyEqual':True,'supportTriangleCount':len(s0),'supportXYSHA256':digest(s0),'baselineReceiverXYSHA256':digest(oldxy),'candidateReceiverXYSHA256':digest(newxy),'unchangedReceiverTriangles':len(old)-len(changed),'namedChangedTriangleIDs':sorted(changed),'actualChangedTriangleIDs':sorted(actual),'candidateSubsetBaselineExact':subset,'patchSweepConfinementExact':confined,'operations':budget.used,'maxOperations':max_operations,'arithmetic':'Fraction exact input-binary-float coordinates; no epsilon/sliver drops or float intersection calculations','numericalAreaLossUpperBound':0.,'passed':theorem}
 result['newlyUnsupported']={'exactEmpty':True,'area':0.,'areaUpperBound':0.,'regions':[],'proof':'S0=S1 by exact full ordered raw support XY identity and C subset B by exact C\\B emptiness imply (C\\S)\\(B\\S)=empty'}if theorem else{'exactEmpty':False,'status':'NOT_PROVEN; new domain or outside-patch change rejects, no empty-region claim'}
 result['newlyUnsupportedOutsidePatch']=result['newlyUnsupported']
 return result
