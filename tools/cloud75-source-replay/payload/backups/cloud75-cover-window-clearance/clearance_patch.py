"""Pure isolated rear-row clearance. Units world meters, original71 layout.
Reusable for v3 only if its XY and topology are still identical; Z is untouched.
No bpy import or file side effect. Caller must apply and independently certify.
"""
import math
COVER='pastoral_house_chest_topcover'
WOOD='pastoral_house_lining_back_window_reveal.001'
BOUNDARY=list(range(31))+[j*31+30 for j in range(1,21)]+[20*31+i for i in range(29,-1,-1)]+[j*31 for j in range(19,0,-1)]

def repair(points, wood_points):
 p=[tuple(map(float,q)) for q in points]
 assert len(p)==1902 and all(len(q)==3 and all(map(math.isfinite,q)) for q in p)
 assert len(BOUNDARY)==100
 x0=min(q[0] for q in wood_points);x1=max(q[0] for q in wood_points);front=min(q[1] for q in wood_points)
 assert abs(x0-.6775)<2e-6 and abs(x1-.7225)<2e-6 and abs(front-2.2835)<2e-6, 'Wrong reveal input'
 rear=max(q[1] for q in p)
 assert abs(rear-2.29)<2e-6, 'Wrong original XY or already patched'
 amount=rear-front+.0007
 assert 0<amount<=.0075, ('authorized displacement budget',amount)
 for i in range(651):
  assert max(abs(p[i][k]-p[i+651][k])for k in (0,1))<2e-6
  assert p[i][2]>p[i+651][2]
 # Include the bracketing outer vertices, not only vertices within wood X.
 # This ensures piecewise-linear rear edges stay on the full plateau over wood.
 rearids=list(range(620,651));xs=[p[i][0]for i in rearids]
 assert all(a<b for a,b in zip(xs,xs[1:]))
 lo=max(i for i,x in enumerate(xs)if x<=x0-.001)
 hi=min(i for i,x in enumerate(xs)if x>=x1+.001)
 assert (lo,hi)==(5,8), ('unexpected wood/outer lattice',lo,hi)
 assert all(abs(p[620+i][1]-2.29)<2e-6 for i in range(lo-3,hi+4)), 'Modified rear XY / duplicate patch'
 # C1 smoothstep field sampled across three neighboring columns each side.
 left=xs[lo-3];right=xs[hi+3]
 def weight(x):
  if xs[lo]<=x<=xs[hi]:return 1.
  t=(x-left)/(xs[lo]-left) if x<xs[lo] else (right-x)/(right-xs[hi])
  t=max(0.,min(1.,t));return t*t*(3-2*t)
 delta=[0.]*len(p)
 for i in rearids:
  delta[i]=delta[i+651]=-amount*weight(p[i][0])
 for ring,i in enumerate(BOUNDARY):
  for k in range(6):delta[1302+ring*6+k]=delta[i]
 out=[(q[0],q[1]+d,q[2]) for q,d in zip(p,delta)]
 assert all(out[i]==p[i] for i in range(589,620)), 'Inner row must remain fixed'
 return out,{'amountMeters':amount,'plateauColumns':[lo,hi],'plateauX':[xs[lo],xs[hi]],'woodX':[x0,x1],'plateauMargins':[x0-xs[lo],xs[hi]-x1],'taperEndColumns':[lo-3,hi+3],'taperX':[left,right],'revealFrontY':front,'expectedRearYOnPlateau':rear-amount,'changedVertexIDs':[i for i,d in enumerate(delta)if d]}
