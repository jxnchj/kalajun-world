"""Four-variable difference-constraint minimax rigid settlement, no geometry search."""
def solve_joint(intervals,cap=.00025,iterations=48):
 if len(intervals)!=4:raise ValueError('Expected chest + three interpiece gap intervals')
 if any(lo>hi for lo,hi in intervals):raise ValueError('Infeasible interface gap bounds')
 def reachable(t,fixed_zero):
  lo=max(-t,intervals[0][0]);hi=min(t,intervals[0][1])
  if fixed_zero:lo=max(lo,0.);hi=min(hi,0.)
  rows=[(lo,hi)]
  if lo>hi:return None
  for a,b in intervals[1:]:
   lo=max(-t,lo+a);hi=min(t,hi+b)
   if lo>hi:return None
   rows.append((lo,hi))
  return rows
 fixed=True
 if reachable(cap,True)is None:
  fixed=False
  if reachable(cap,False)is None:raise ValueError('No joint settlement within 0.25mm cap')
 low=0.;high=cap
 for _ in range(iterations):
  mid=(low+high)/2
  if reachable(mid,fixed)is None:low=mid
  else:high=mid
 rows=reachable(high,fixed);values=[0.]*4
 clamp=lambda x,a,b:max(a,min(b,x))
 values[3]=clamp(0.,*rows[3])
 for i in (2,1,0):
  lo=max(rows[i][0],values[i+1]-intervals[i+1][1]);hi=min(rows[i][1],values[i+1]-intervals[i+1][0]);assert lo<=hi+1e-12
  values[i]=clamp(0.,lo,hi)
 for i,(a,b)in enumerate(intervals):
  d=values[i]-(values[i-1]if i else 0.)
  assert a-1e-12<=d<=b+1e-12 and abs(values[i])<=cap+1e-12
 return {'shifts':values,'maxAbsoluteShift':max(map(abs,values)),'bottomFixedZero':fixed,'intervals':intervals,'objective':'minimize maximum absolute rigid shift; prefer feasible s0=0, then deterministic backward closest-zero tie break','geometryParameterSearch':False}
