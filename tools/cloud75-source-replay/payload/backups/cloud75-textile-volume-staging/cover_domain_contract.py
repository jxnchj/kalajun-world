"""Explicit changed-domain accounting for the named cover footprint exception.
No region is cropped from geometry metrics; this complements full gap checks.
"""
import math,sys
from pathlib import Path
sys.path.insert(0,str(Path(__file__).resolve().parent/'v3_metrics'))
from upper_envelope import area,subtract,SpatialHash,AREA_EPS

def hull(points):
 p=sorted(set(tuple(q)for q in points))
 def turn(a,b,c):return (b[0]-a[0])*(c[1]-a[1])-(b[1]-a[1])*(c[0]-a[0])
 def half(seq):
  out=[]
  for q in seq:
   while len(out)>1 and turn(out[-2],out[-1],q)<=0:out.pop()
   out.append(q)
  return out
 return half(p)[:-1]+half(reversed(p))[:-1]

def verify_exact_patch(original,current,expected,changed_ids,tolerance=2e-6):
 assert len(original)==len(current)==len(expected)
 allowed=set(changed_ids)
 for i,(old,new,want)in enumerate(zip(original,current,expected)):
  assert all(math.isfinite(v)for v in new)
  assert abs(new[0]-old[0])<=tolerance,('cover X changed',i)
  assert abs(new[1]-want[1])<=tolerance,('cover Y outside exact patch contract',i)
  if i not in allowed:assert abs(new[1]-old[1])<=tolerance,('cover XY changed outside mask',i)
  assert -.0075-tolerance<=new[1]-old[1]<=tolerance,('cover footprint cap',i)
 return True

def domain_accounting(old_triangles,new_triangles,old_envelope,new_envelope,changed_triangle_ids,area_tolerance=1e-8,max_operations=2000000,*,old_support_triangles,new_support_triangles):
 """Exact full-support identity and changed receiver subset/confinement proof."""
 from exact_patch_domain import certify
 assert area_tolerance==1e-8,'No area budget change allowed'
 result=certify(old_triangles,new_triangles,old_support_triangles,new_support_triangles,changed_triangle_ids,max_operations)
 result['areaTolerance']=area_tolerance
 result['supportEnvelopeNumericalBounds']={'baseline':old_envelope.get('stats',{}).get('cumulativeNumericLossBounds',{}),'candidate':new_envelope.get('stats',{}).get('cumulativeNumericLossBounds',{})}
 result['supportEnvelopeBoundsRole']='Recorded for full gap metrics, not used to fabricate subset proof; raw projected support-domain identity is exact and independent of envelope heights.'
 return result
