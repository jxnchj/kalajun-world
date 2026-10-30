"""Pure geometry helpers; no Blender import, writes, or support-ray deformation."""
import math

def cross(a,b,c): return (b[0]-a[0])*(c[1]-a[1])-(b[1]-a[1])*(c[0]-a[0])
def clip_triangle(subject, boundary, eps=1e-12):
    poly=[tuple(p[:2]) for p in subject]
    sign=1 if cross(*boundary)>0 else -1
    for a,b in zip(boundary,boundary[1:]+boundary[:1]):
        out=[]
        for p,q in zip(poly,poly[1:]+poly[:1]):
            dp=sign*cross(a,b,p);dq=sign*cross(a,b,q)
            if dp>=-eps:out.append(p)
            if (dp>=-eps)!=(dq>=-eps):
                t=dp/(dp-dq);out.append((p[0]+t*(q[0]-p[0]),p[1]+t*(q[1]-p[1])))
        poly=out
        if not poly:break
    return poly

def polygon_area(poly):
    return abs(sum(p[0]*q[1]-p[1]*q[0]for p,q in zip(poly,poly[1:]+poly[:1])))*.5 if len(poly)>=3 else 0.

def subtract_convex(poly,clip):
    """Disjoint convex pieces of poly outside convex clip; union-safe coverage."""
    inside=poly;outside=[];sign=1 if cross(*clip[:3])>0 else -1
    for a,b in zip(clip,clip[1:]+clip[:1]):
        keep=[];drop=[]
        for p,q in zip(inside,inside[1:]+inside[:1]):
            dp=sign*cross(a,b,p);dq=sign*cross(a,b,q)
            (keep if dp>=0 else drop).append(p)
            if (dp>=0)!=(dq>=0):
                t=dp/(dp-dq);v=(p[0]+t*(q[0]-p[0]),p[1]+t*(q[1]-p[1]));keep.append(v);drop.append(v)
        if polygon_area(drop)>1e-14:outside.append(drop)
        inside=keep
        if not inside:break
    return outside

def height(tri,p):
    a,b,c=tri;d=cross(a,b,c)
    if abs(d)<1e-14:raise ValueError('vertical projected triangle')
    u=cross(p,b,c)/d;v=cross(a,p,c)/d
    return u*a[2]+v*b[2]+(1-u-v)*c[2]

def overlap_gaps(upper,lower,cell=.06):
    """Exact linear gap extrema on all projected triangle-overlap vertices.
    Spatial hash is broadphase only. Non-heightfield side triangles are excluded
    explicitly; those require a separate full 3D self-intersection gate.
    """
    buckets={};valid_lower=[]
    def keys(t):
        lo=[math.floor(min(p[k] for p in t)/cell) for k in (0,1)]
        hi=[math.floor(max(p[k] for p in t)/cell) for k in (0,1)]
        return ((x,y) for x in range(lo[0],hi[0]+1) for y in range(lo[1],hi[1]+1))
    for t in lower:
        if abs(cross(*t))<1e-14:continue
        i=len(valid_lower);valid_lower.append(t)
        for key in keys(t):buckets.setdefault(key,[]).append(i)
    minimum=math.inf;maximum=-math.inf;pairs=0;points=0;missing=0;partial=0;fully=0;total_area=0.;uncovered_area=0.
    for t in upper:
        if abs(cross(*t))<1e-14:continue
        ids=set(i for key in keys(t) for i in buckets.get(key,[]));hit=False;remnants=[[tuple(p[:2])for p in t]];area=polygon_area(remnants[0]);total_area+=area
        for i in ids:
            b=valid_lower[i];poly=clip_triangle(t,b)
            if not poly:continue
            hit=True;pairs+=1
            remnants=[piece for remnant in remnants for piece in subtract_convex(remnant,[tuple(p[:2])for p in b])]
            for p in poly:
                gap=height(t,p)-height(b,p);minimum=min(minimum,gap);maximum=max(maximum,gap);points+=1
        uncovered=sum(polygon_area(p)for p in remnants);uncovered_area+=uncovered
        if area-uncovered<=1e-12:missing+=1
        elif uncovered>1e-12:partial+=1
        else:fully+=1
    if not points:raise ValueError('No projected triangle overlaps')
    return dict(minGap=minimum,maxDifferenceAcrossAllSupportSurfaces=maximum,overlapPairs=pairs,extremalSamples=points,completelyUncoveredTriangles=missing,partiallyCoveredTriangles=partial,fullyCoveredTriangles=fully,totalProjectedArea=total_area,uncoveredProjectedArea=uncovered_area)

def profile(points,edge_factor=.55,crown=.006):
    """Coupled two-leaf profile; source vertex order is an asserted precondition."""
    if len(points)!=2940:raise ValueError('Expected two physical 1470-vertex leaves')
    result=[list(p) for p in points]
    boundary=list(range(29))+[j*29+28 for j in range(1,19)]+[18*29+i for i in range(27,-1,-1)]+[j*29 for j in range(17,0,-1)]
    for leaf in (0,1470):
        for i in range(551):
            j,k=divmod(i,29);s=2*k/28-1;t=2*j/18-1;c=(1-s*s)**2*(1-t*t)**2
            top=points[leaf+i][2];bottom=points[leaf+551+i][2]
            mid=(top+bottom)/2+crown*c;half=(top-bottom)/2*(edge_factor+(1-edge_factor)*c)
            result[leaf+i][2]=mid+half;result[leaf+551+i][2]=mid-half
        for j,i in enumerate(boundary):
            delta=(result[leaf+i][2]+result[leaf+551+i][2]-points[leaf+i][2]-points[leaf+551+i][2])/2
            for k in range(4):result[leaf+1102+j*4+k][2]+=delta
    oldlo=min(p[2] for p in points);oldhi=max(p[2] for p in points)
    lo=min(p[2] for p in result);hi=max(p[2] for p in result)
    if hi<=lo:raise ValueError('Collapsed profile')
    for p in result:p[2]=oldlo+(p[2]-lo)/(hi-lo)*(oldhi-oldlo)
    return result
