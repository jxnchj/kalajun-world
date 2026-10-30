"""Exact piecewise-affine projected support envelope, no Blender dependency.

All distances are meters, XY is projection and Z is height. Convex polygon
clipping constructs the arrangement explicitly, including equal-height lines.
Numerical tolerances: projected determinant/area 1e-14 m²; exact coefficient equality for coplanar tie ownership.
Vertical/near-zero-projection triangles have no support area and are counted.
No 3D intersection certification is implied. Complexity limits raise an error,
never silently drop support cells. Stable support IDs are input triangle indices.
"""
import math
import time
import json
import hashlib
from fractions import Fraction
from contextvars import ContextVar
from functools import wraps,lru_cache
AREA_EPS=1e-14
HEIGHT_TIE_EPS=0.0

class ComplexityLimit(RuntimeError):pass

def cross(a,b,c):
 return math.fsum(((b[0]-a[0])*(c[1]-a[1]),-(b[1]-a[1])*(c[0]-a[0])))

def _exact_cross(a,b,c):
 ax,ay=map(Fraction,a);bx,by=map(Fraction,b);cx,cy=map(Fraction,c)
 return (bx-ax)*(cy-ay)-(by-ay)*(cx-ax)

def _turn(a,b,c):
 # Fast orientation with exact fallback near cancellation. The exact sign is
 # with respect to the supplied binary64 points, not a widened geometric epsilon.
 x=(b[0]-a[0])*(c[1]-a[1]);y=(b[1]-a[1])*(c[0]-a[0]);v=math.fsum((x,-y))
 if abs(v)>8*math.ulp(1.)*(abs(x)+abs(y)):return 1 if v>0 else -1
 v=_exact_cross(a,b,c);return (v>0)-(v<0)

def signed_area(p):
 if len(p)<3:return 0.
 anchor=p[0]
 return math.fsum(cross(anchor,p[i],p[i+1])for i in range(1,len(p)-1))*.5

def area(p):return abs(signed_area(p))

def _exact_area(p):
 if len(p)<3:return Fraction(0)
 return abs(sum((_exact_cross(p[0],p[i],p[i+1])for i in range(1,len(p)-1)),Fraction(0)))/2

class _EdgePlane(tuple):
 def __new__(cls,a,b,sgn):
  dx=b[0]-a[0];dy=b[1]-a[1]
  obj=super().__new__(cls,(-dy*sgn,dx*sgn,(dy*a[0]-dx*a[1])*sgn))
  obj.anchor=a;obj.dx=dx;obj.dy=dy;obj.sgn=sgn
  return obj

def height(pl,p):
 if isinstance(pl,_EdgePlane):
  return pl.sgn*math.fsum((pl.dx*(p[1]-pl.anchor[1]),-pl.dy*(p[0]-pl.anchor[0])))
 return math.fsum((pl[0]*p[0],pl[1]*p[1],pl[2]))

def plane(tri):
 a,b,c=tri;d=cross(a,b,c)
 if abs(d)<AREA_EPS:return None
 x=math.fsum(((b[2]-a[2])*(c[1]-a[1]),-(c[2]-a[2])*(b[1]-a[1])))/d
 y=math.fsum(((b[0]-a[0])*(c[2]-a[2]),-(c[0]-a[0])*(b[2]-a[2])))/d
 return (x,y,math.fsum((a[2],-x*a[0],-y*a[1])))

def clean(poly):
 # Remove exact adjacent duplicates only. Near points can be real vertices;
 # numerical convex repair below has its own explicit area accounting.
 out=[]
 for p in poly:
  p=tuple(p)
  if not out or p!=out[-1]:out.append(p)
 if len(out)>1 and out[0]==out[-1]:out.pop()
 return out

def _convex(poly):
 return _convex_key(tuple(tuple(p)for p in poly))

@lru_cache(maxsize=8192)
def _convex_key(poly):
 if len(poly)<3:return True
 orientation=1 if signed_area(poly)>=0 else -1
 # A polygon is convex iff every vertex is in each directed edge halfplane.
 # This also rejects self-intersecting all-same-local-turn star polygons.
 return all(orientation*_turn(a,b,p)>=0 for a,b in zip(poly,poly[1:]+poly[:1])for p in poly if p!=a and p!=b)

def _require_convex(poly):
 if any(len(p)!=2 or not all(math.isfinite(v)for v in p)for p in poly):raise ValueError('Expected finite 2D polygon')
 if not _convex(poly):raise ArithmeticError('Concave source polygon is not a valid convex clipping input')

def _hull(poly):
 points=sorted(set(poly))
 if len(points)<=2:return points
 def chain(points):
  out=[]
  for p in points:
   while len(out)>1 and _turn(out[-2],out[-1],p)<=0:out.pop()
   out.append(p)
  return out
 return chain(points)[:-1]+chain(points[::-1])[:-1]

_NUMERIC_CONTEXT=ContextVar('envelope_numeric_context',default=None)

def _numeric_snapshot():
 ledger=_NUMERIC_CONTEXT.get()
 return dict(ledger)if ledger is not None else {'correctionCount':0,'addedAreaUpperBound':0.,'removedAreaUpperBound':0.,'maxCorrectionAreaUpperBound':0.}

def _clip_output(poly):
 # Caller has already proved the input convex. Only its computed halfplane
 # output may be repaired. Never hull a caller's/source polygon into validity.
 poly=clean(poly)
 if len(poly)<3 or _convex(poly):return poly
 result=_hull(poly)
 added=_exact_area(result)-_exact_area(poly)
 if added<0:raise ArithmeticError('Convex output normalization unexpectedly removed area')
 bound=math.nextafter(float(added),math.inf)if added else 0.
 if bound>AREA_EPS:raise ArithmeticError('Convex clipping output correction exceeds unchanged AREA_EPS')
 ledger=_NUMERIC_CONTEXT.get()
 if ledger is not None:
  ledger['correctionCount']+=1
  ledger['addedAreaUpperBound']=math.nextafter(math.fsum((ledger['addedAreaUpperBound'],bound)),math.inf)
  ledger['maxCorrectionAreaUpperBound']=max(ledger['maxCorrectionAreaUpperBound'],bound)
 if signed_area(poly)<0:result.reverse()
 return result

def _track_numerics(fn):
 @wraps(fn)
 def run(*args,**kwargs):
  token=_NUMERIC_CONTEXT.set({'correctionCount':0,'addedAreaUpperBound':0.,'removedAreaUpperBound':0.,'maxCorrectionAreaUpperBound':0.})
  try:
   result=fn(*args,**kwargs);numeric=_numeric_snapshot()
   if 'stats' not in result:
    scale=result.get('projectedEnvelopeUnionArea',result.get('domainUnionProjectedArea',result.get('totalProjectedArea',0.)))
    budget=max(1e-10,scale*1e-8)
    existing=max(result.get('overlapAreaBetweenEnvelopeCells',0.),result.get('summedEnvelopeOutsideOwnedSourceArea',0.),result.get('summedUncoveredSourcePartitionArea',0.))
    if existing+numeric['addedAreaUpperBound']+numeric['removedAreaUpperBound']>budget:raise ArithmeticError('Accumulated clipping correction exceeds unchanged numerical area budget')
    result['clippingNormalization']=numeric
   return result
  finally:_NUMERIC_CONTEXT.reset(token)
 return run

def halfplane(poly,coeff,positive=True):
 """Clip a validated convex polygon by affine height>=0 (or <=0)."""
 _require_convex(poly)
 out=[];sgn=1 if positive else -1
 for a,b in zip(poly,poly[1:]+poly[:1]):
  da=sgn*height(coeff,a);db=sgn*height(coeff,b)
  if da>=0:out.append(a)
  if (da>=0)!=(db>=0):
   t=da/(da-db);out.append((a[0]+t*(b[0]-a[0]),a[1]+t*(b[1]-a[1])))
 return _clip_output(out)

def edge_plane(a,b,sgn):return _EdgePlane(a,b,sgn)

def intersect(a,b,keep_slivers=False):
 _require_convex(a);_require_convex(b)
 poly=a;sgn=1 if signed_area(b)>=0 else -1
 for p,q in zip(b,b[1:]+b[:1]):
  poly=halfplane(poly,edge_plane(p,q,sgn))
  if len(poly)<3:return []
 return poly if area(poly)>(0. if keep_slivers else AREA_EPS) else []

def subtract(poly,clip):
 """Disjoint convex pieces outside a convex clipping polygon."""
 _require_convex(poly);_require_convex(clip)
 inside=poly;out=[];sgn=1 if signed_area(clip)>=0 else -1
 for a,b in zip(clip,clip[1:]+clip[:1]):
  coeff=edge_plane(a,b,sgn);outside=halfplane(inside,coeff,False)
  if area(outside)>AREA_EPS:out.append(outside)
  inside=halfplane(inside,coeff)
  if area(inside)<=AREA_EPS:break
 return out

class SpatialHash:
 def __init__(self,polygons,cell_size=.06):
  if cell_size<=0:raise ValueError('cell_size must be positive')
  self.cell_size=cell_size;self.buckets={}
  for i,p in enumerate(polygons):
   for key in self.keys(p):self.buckets.setdefault(key,[]).append(i)
 def keys(self,p):
  lo=[math.floor(min(v[k]for v in p)/self.cell_size)for k in (0,1)]
  hi=[math.floor(max(v[k]for v in p)/self.cell_size)for k in (0,1)]
  for x in range(lo[0],hi[0]+1):
   for y in range(lo[1],hi[1]+1):yield x,y
 def query(self,p):return set(i for key in self.keys(p)for i in self.buckets.get(key,[]))

def _support_records(support_triangles,cell_size,max_cells,tile_large):
 triangles=list(support_triangles);records=[];excluded=0;nonvertical=0;partitioned=0;partition_area_error=0.;partition_area_error_sum=0.;largest_partitions=0;partition_dropped_area=0.;partition_dropped_cells=0;partition_area_budget=0.
 if cell_size<=0:raise ValueError('cell_size must be positive')
 for source_id,t in enumerate(triangles):
  if len(t)!=3 or any(len(p)!=3 or not all(math.isfinite(v)for v in p)for p in t):raise ValueError('Expected finite triangles')
  pl=plane(t)
  if pl is None:excluded+=1;continue
  nonvertical+=1;polygon=[tuple(p[:2])for p in t]
  lo=[math.floor(min(p[k]for p in polygon)/cell_size)for k in (0,1)];hi=[math.floor(max(p[k]for p in polygon)/cell_size)for k in (0,1)]
  tile_count=(hi[0]-lo[0]+1)*(hi[1]-lo[1]+1)
  # Exact algorithmic partition, NOT source geometry/tolerance modification.
  # Small cloth triangles remain intact. A large cabinet triangle is divided
  # before subtracting many tiny cloth occluders, bounding local fragmentation.
  parts=[]
  if tile_large and tile_count>4:
   partitioned+=1
   for ix in range(lo[0],hi[0]+1):
    for iy in range(lo[1],hi[1]+1):
     x0=ix*cell_size;x1=(ix+1)*cell_size;y0=iy*cell_size;y1=(iy+1)*cell_size
     pp=intersect(polygon,[(x0,y0),(x1,y0),(x1,y1),(x0,y1)],keep_slivers=True)
     if pp:
      if area(pp)<=AREA_EPS:partition_dropped_area+=area(pp);partition_dropped_cells+=1
      else:parts.append(pp)
   error=abs(sum(area(pp)for pp in parts)-area(polygon));partition_area_error=max(partition_area_error,error);partition_area_error_sum+=error
   numerical_budget=max(1e-10,area(polygon)*1e-8);partition_area_budget+=numerical_budget
   if error>numerical_budget:raise ArithmeticError('Exact tile partition failed area conservation')
  else:parts=[polygon]
  largest_partitions=max(largest_partitions,len(parts))
  for partition_id,pp in enumerate(parts):
   zz=[height(pl,p)for p in pp]
   records.append({'supportId':source_id,'partitionId':partition_id,'polygon':pp,'plane':pl,'maxZ':max(zz),'minZ':min(zz)})
  if len(records)>max_cells:raise ComplexityLimit('support prepartition cell budget exceeded')
 return records,{'inputTriangles':len(triangles),'nonverticalTriangles':nonvertical,'excludedZeroProjectedAreaTriangles':excluded,'prepartitionCells':len(records),'partitionedSourceTriangles':partitioned,'maxPartitionsPerSourceTriangle':largest_partitions,'maxPartitionAreaError':partition_area_error,'summedPartitionAreaError':partition_area_error_sum,'partitionDroppedSliverArea':partition_dropped_area,'partitionDroppedSliverCells':partition_dropped_cells,'summedPartitionAreaNumericalBudget':partition_area_budget,'tileLargeEnabled':bool(tile_large)}

def _phase(callback,stage,state,started=None,**data):
 if callback is not None:
  event={'stage':stage,'state':state,**data}
  if started is not None:event['elapsedSeconds']=time.monotonic()-started
  callback(event)

def _validate_coverage(records,cells,cell_size,budget,limit,max_fragments,phase_callback=None):
 """Independent set-inclusion proof: final cells are disjoint; every original
 support partition is covered by their union. Explicit reverse containment
 verifies every cell against its owned source footprint and exact affine plane.
 Hence both projected unions coincide within recorded numerical error bounds.
 """
 index=SpatialHash([c['polygon']for c in cells],cell_size);overlap_area=0.;max_uncovered=0.;total_uncovered=0.;max_verify_fragments=0
 def charge():
  budget['tests']+=1
  if budget['tests']>limit:raise ComplexityLimit('envelope generation plus coverage candidate budget exceeded')
 started=time.monotonic();_phase(phase_callback,'coverage_disjoint','start',cellCount=len(cells),testedCandidates=budget['tests'])
 for i,c in enumerate(cells):
  if i and i%1000==0:_phase(phase_callback,'coverage_disjoint','progress',started,completedCells=i,testedCandidates=budget['tests'])
  for j in index.query(c['polygon']):
   if j<=i:continue
   charge();p=intersect(c['polygon'],cells[j]['polygon'])
   if p:overlap_area+=area(p)
 _phase(phase_callback,'coverage_disjoint','end',started,overlapArea=overlap_area,testedCandidates=budget['tests'])
 measured_area=sum(area(c['polygon'])for c in cells);numerical_budget=max(1e-10,measured_area*1e-8)
 if overlap_area>numerical_budget:raise ArithmeticError('Envelope cells have overlapping projected area: '+str(overlap_area))
 started=time.monotonic();_phase(phase_callback,'coverage_union','start',recordCount=len(records),testedCandidates=budget['tests'])
 for ri,r in enumerate(records):
  if ri and ri%1000==0:_phase(phase_callback,'coverage_union','progress',started,completedRecords=ri,testedCandidates=budget['tests'])
  pieces=[r['polygon']]
  for j in index.query(r['polygon']):
   charge();cover=intersect(r['polygon'],cells[j]['polygon'])
   if not cover:continue
   pieces=[p for piece in pieces for p in subtract(piece,cover)]
   if len(pieces)>max_fragments:raise ComplexityLimit('coverage check fragmentation budget exceeded')
   max_verify_fragments=max(max_verify_fragments,len(pieces))
   if not pieces:break
  missing=sum(area(p)for p in pieces);max_uncovered=max(max_uncovered,missing);total_uncovered+=missing
  if missing>max(1e-10,area(r['polygon'])*1e-8):raise ArithmeticError('Support footprint not covered by envelope union: source='+str(r['supportId'])+' missingArea='+str(missing))
 _phase(phase_callback,'coverage_union','end',started,uncoveredArea=total_uncovered,testedCandidates=budget['tests'])
 if total_uncovered>numerical_budget:raise ArithmeticError('Accumulated support-union missing area exceeds numerical budget: '+str(total_uncovered))
 owned={}
 for r in records:owned.setdefault(r['supportId'],[]).append(r)
 owned_planes={sid:{tuple(r['plane'])for r in rr}for sid,rr in owned.items()}
 if any(len(pl)!=1 for pl in owned_planes.values()):raise ArithmeticError('One source triangle ID maps to inconsistent affine planes')
 outside_area=0.;max_outside=0.;owner_indexes={}
 started=time.monotonic();_phase(phase_callback,'coverage_owned_subset','start',cellCount=len(cells),testedCandidates=budget['tests'])
 for ci,c in enumerate(cells):
  sid=c['supportId'];rr=owned.get(sid)
  if rr is None or tuple(c['plane'])not in owned_planes[sid]:raise ArithmeticError('Envelope cell has missing source owner or changed affine plane')
  if sid not in owner_indexes:owner_indexes[sid]=SpatialHash([r['polygon']for r in rr],cell_size)if len(rr)>4 else None
  ix=owner_indexes[sid];candidates=ix.query(c['polygon'])if ix is not None else range(len(rr));pieces=[c['polygon']]
  for ri in candidates:
   charge();clip=intersect(c['polygon'],rr[ri]['polygon'])
   if not clip:continue
   pieces=[p for piece in pieces for p in subtract(piece,clip)]
   if len(pieces)>max_fragments:raise ComplexityLimit('owned-source subset fragmentation budget exceeded')
   if not pieces:break
  extra=sum(area(p)for p in pieces);outside_area+=extra;max_outside=max(max_outside,extra)
  if extra>max(1e-10,area(c['polygon'])*1e-8):raise ArithmeticError('Envelope cell extends outside its original source owner: '+str(sid)+' extraArea='+str(extra))
  if ci and ci%1000==0:_phase(phase_callback,'coverage_owned_subset','progress',started,completedCells=ci,testedCandidates=budget['tests'])
 _phase(phase_callback,'coverage_owned_subset','end',started,outsideOwnedSourceArea=outside_area,testedCandidates=budget['tests'])
 if outside_area>numerical_budget:raise ArithmeticError('Accumulated envelope area outside owned source exceeds numerical budget')
 return {'passed':True,'method':'checked disjoint final cells + source partition subset of final union + every final cell subset of its exact sourceID/plane footprint','projectedSupportUnionArea':measured_area,'projectedEnvelopeUnionArea':measured_area,'overlapAreaBetweenEnvelopeCells':overlap_area,'summedEnvelopeOutsideOwnedSourceArea':outside_area,'maxEnvelopeOutsideOwnedSourceArea':max_outside,'sourceIdPlaneConsistencyChecked':True,'maxUncoveredSourcePartitionArea':max_uncovered,'summedUncoveredSourcePartitionArea':total_uncovered,'numericalAreaBudget':numerical_budget,'maxCoverageFragments':max_verify_fragments,'totalTestedCandidates':budget['tests']}

@_track_numerics
def check_envelope_coverage(support_triangles,envelope,max_candidate_tests=2000000,max_cells=100000,max_fragments=2048,phase_callback=None):
 """Public independent conservation check, also accepts an externally built envelope."""
 records,_=_support_records(support_triangles,envelope['cellSize'],max_cells,True)
 return _validate_coverage(records,envelope['cells'],envelope['cellSize'],{'tests':0},max_candidate_tests,max_fragments,phase_callback)

@_track_numerics
def prepare_envelope(support_triangles,cell_size=.06,max_pair_tests=2000000,max_cells=100000,max_fragments=2048,tile_large=True,phase_callback=None):
 started=time.monotonic();_phase(phase_callback,'prepartition','start')
 records,partition_stats=_support_records(support_triangles,cell_size,max_cells,tile_large)
 _phase(phase_callback,'prepartition','end',started,**partition_stats)
 return _envelope_records(records,partition_stats,cell_size,max_pair_tests,max_cells,max_fragments,phase_callback)

def _envelope_records(records,partition_stats,cell_size,max_pair_tests,max_cells,max_fragments,phase_callback):
 index=SpatialHash([r['polygon']for r in records],cell_size);cells=[];pair_tests=0;fragment_max=0
 started=time.monotonic();_phase(phase_callback,'envelope_occlusion','start',recordCount=len(records))
 for i,r in enumerate(records):
  if i and i%1000==0:_phase(phase_callback,'envelope_occlusion','progress',started,completedRecords=i,outputCells=len(cells),testedCandidates=pair_tests)
  pieces=[r['polygon']]
  competitors=sorted(index.query(r['polygon'])-{i},key=lambda k:(-records[k]['maxZ'],records[k]['supportId'],records[k]['partitionId']))
  for j in competitors:
   q=records[j]
   pair_tests+=1
   if pair_tests>max_pair_tests:raise ComplexityLimit('support envelope broadphase/narrowphase budget exceeded')
   if q['maxZ']<r['minZ']:continue
   overlap=intersect(r['polygon'],q['polygon'])
   if not overlap:continue
   coeff=tuple(q['plane'][k]-r['plane'][k]for k in range(3));vals=[height(coeff,p)for p in overlap]
   if q['plane']==r['plane']:
    if (q['supportId'],q['partitionId'])>(r['supportId'],r['partitionId']):continue
    occluder=overlap
   elif max(vals)<=0:continue
   else:occluder=halfplane(overlap,coeff)
   if area(occluder)<=AREA_EPS:continue
   pieces=[piece for p in pieces for piece in subtract(p,occluder)]
   if len(pieces)>max_fragments:raise ComplexityLimit('support envelope per-triangle fragmentation exceeded')
   fragment_max=max(fragment_max,len(pieces))
   if not pieces:break
  for p in pieces:
   if area(p)>AREA_EPS:cells.append({'polygon':p,'plane':r['plane'],'supportId':r['supportId']})
  if len(cells)>max_cells:raise ComplexityLimit('support envelope cell budget exceeded')
 _phase(phase_callback,'envelope_occlusion','end',started,outputCells=len(cells),testedCandidates=pair_tests)
 coverage=_validate_coverage(records,cells,cell_size,{'tests':pair_tests},max_pair_tests,max_fragments,phase_callback)
 numeric=_numeric_snapshot();numeric_bound=numeric['addedAreaUpperBound']+numeric['removedAreaUpperBound']
 inherited=partition_stats.get('inheritedNumericLossBounds',{})
 partition_error=partition_stats.get('summedPartitionAreaError',0.);partition_drop=partition_stats.get('partitionDroppedSliverArea',0.)
 missing=numeric_bound+max(partition_error,partition_drop)+coverage['summedUncoveredSourcePartitionArea']+inherited.get('projectedMissingAreaUpperBound',0.)
 overlap=numeric_bound+partition_error+coverage['overlapAreaBetweenEnvelopeCells']+inherited.get('projectedOverlapAreaUpperBound',0.)
 excess=numeric_bound+partition_error+coverage['summedEnvelopeOutsideOwnedSourceArea']+inherited.get('projectedExcessAreaUpperBound',0.)
 if max(missing,overlap,excess)>coverage['numericalAreaBudget']:raise ArithmeticError('Cumulative inherited envelope loss exceeds unchanged numerical area budget')
 cumulative={'passed':True,'localClippingNormalization':numeric,'projectedMissingAreaUpperBound':missing,'projectedOverlapAreaUpperBound':overlap,'projectedExcessAreaUpperBound':excess,'inheritedMissingAreaUpperBound':inherited.get('projectedMissingAreaUpperBound',0.),'inheritedOverlapAreaUpperBound':inherited.get('projectedOverlapAreaUpperBound',0.),'inheritedExcessAreaUpperBound':inherited.get('projectedExcessAreaUpperBound',0.),'localPartitionDroppedSliverArea':partition_drop,'localSummedPartitionAreaError':partition_error,'localSourceCoverageMissingArea':coverage['summedUncoveredSourcePartitionArea'],'localEnvelopeOverlapArea':coverage['overlapAreaBetweenEnvelopeCells'],'localEnvelopeOutsideOwnerArea':coverage['summedEnvelopeOutsideOwnedSourceArea'],'numericalAreaBudget':coverage['numericalAreaBudget'],'meaning':'conservative additive prior+local numeric missing/overlap/excess bounds; partition error is sign-unknown and bounded in both directions; not a widened tolerance'}
 return {'cells':cells,'cellSize':cell_size,'stats':{**partition_stats,'clippingNormalization':numeric,'pairTests':pair_tests,'totalTestedCandidatesIncludingCoverage':coverage['totalTestedCandidates'],'cellCount':len(cells),'maxFragmentsPerTriangle':fragment_max,'projectedUnionArea':sum(area(c['polygon'])for c in cells),'projectedAreaEpsilon':AREA_EPS,'heightTieEpsilon':HEIGHT_TIE_EPS,'supportUnionCheck':coverage,'cumulativeNumericLossBounds':cumulative,'partitionPolicy':'exact hash tiles for source bounding boxes spanning >4 cells'}}


@_track_numerics
def merge_envelopes(envelopes,source_id_offsets=None,cell_size=None,max_pair_tests=2000000,max_cells=100000,max_fragments=2048,phase_callback=None):
 """Exact envelope-of-envelopes, preserving original convex cells and planes.

 Every child must carry a passing source-union certificate. Child local source
 IDs are mapped by explicit constant offsets (default cumulative raw-source
 counts). No triangulation, refitting, geometry reduction or tolerance change.
 The new union proof is against ALL child envelope cells; with the certified
 child source unions this is a transitive source-coverage proof. Global IDs must
 not collide across children. Already-global merged children can use offset0.
 """
 children=list(envelopes)
 if children and all(isinstance(entry,(tuple,list))and len(entry)==2 and isinstance(entry[0],dict)for entry in children):
  if source_id_offsets is not None:raise ValueError('Supply offsets either as (envelope,offset) pairs or separate argument, not both')
  source_id_offsets=[entry[1]for entry in children];children=[entry[0]for entry in children]
 if cell_size is None:cell_size=children[0]['cellSize']if children else .06
 if source_id_offsets is None:
  source_id_offsets=[];offset=0
  for child in children:
   source_id_offsets.append(offset);offset+=child['stats']['inputTriangles']
 if len(source_id_offsets)!=len(children)or any(not isinstance(v,int)or v<0 for v in source_id_offsets):raise ValueError('One nonnegative integer source-ID offset per child is required')
 started=time.monotonic();_phase(phase_callback,'merge_inputs','start',childCount=len(children))
 records=[];owners={};partitions={};proofs=[];source_count=0;child_tests=0;inherited_missing=0.;inherited_overlap=0.;inherited_excess=0.
 for child_id,(child,offset)in enumerate(zip(children,source_id_offsets)):
  stats=child['stats'];proof=stats.get('supportUnionCheck',{})
  if not proof.get('passed'):raise ValueError('Every child envelope needs a passing source-union certificate')
  source_count+=stats['inputTriangles'];child_tests+=stats.get('totalTestedCandidatesIncludingCoverage',0)
  partition_error=stats.get('summedPartitionAreaError',stats.get('maxPartitionAreaError',0.)*stats.get('partitionedSourceTriangles',0))
  losses=stats.get('cumulativeNumericLossBounds',{'projectedMissingAreaUpperBound':max(stats.get('partitionDroppedSliverArea',0.),partition_error)+proof.get('summedUncoveredSourcePartitionArea',0.),'projectedOverlapAreaUpperBound':partition_error+proof.get('overlapAreaBetweenEnvelopeCells',0.),'projectedExcessAreaUpperBound':partition_error+proof.get('summedEnvelopeOutsideOwnedSourceArea',0.)})
  for loss_key in ('projectedMissingAreaUpperBound','projectedOverlapAreaUpperBound','projectedExcessAreaUpperBound'):
   value=losses.get(loss_key,0.)
   if not isinstance(value,(int,float))or not math.isfinite(value)or value<0:raise ValueError('Child numerical loss bounds must be finite and nonnegative')
  inherited_missing+=losses['projectedMissingAreaUpperBound'];inherited_overlap+=losses['projectedOverlapAreaUpperBound'];inherited_excess+=losses.get('projectedExcessAreaUpperBound',0.)
  child_numeric={'partitionDroppedSliverArea':stats.get('partitionDroppedSliverArea',0.),'partitionDroppedSliverCells':stats.get('partitionDroppedSliverCells',0),'maxPartitionAreaError':stats.get('maxPartitionAreaError',0.),'summedPartitionAreaError':partition_error,'summedPartitionAreaNumericalBudget':stats.get('summedPartitionAreaNumericalBudget',0.),'cumulativeNumericLossBounds':losses}
  fingerprint=hashlib.sha256(json.dumps(child,sort_keys=True,separators=(',',':')).encode()).hexdigest()
  global_ids=[]
  for cell in child['cells']:
   sid=cell['supportId']+offset
   if sid in owners and owners[sid]!=child_id:raise ValueError('Global source-ID collision between child envelopes: '+str(sid))
   owners[sid]=child_id;global_ids.append(sid);pid=partitions.get(sid,0);partitions[sid]=pid+1
   pl=tuple(cell['plane']);poly=[tuple(p)for p in cell['polygon']]
   if len(pl)!=3 or any(not math.isfinite(v)for v in pl)or any(len(p)!=2 or not all(math.isfinite(v)for v in p)for p in poly):raise ValueError('Invalid child plane/polygon')
   _require_convex(poly)
   if area(poly)<=AREA_EPS:raise ValueError('Certified child contains zero/sliver-area cell')
   zz=[height(pl,p)for p in poly]
   records.append({'supportId':sid,'partitionId':pid,'polygon':poly,'plane':pl,'minZ':min(zz),'maxZ':max(zz)})
   if len(records)>max_cells:raise ComplexityLimit('merge input cell budget exceeded')
  proofs.append({'childIndex':child_id,'sourceIdOffset':offset,'rawSourceTriangleCount':stats['inputTriangles'],'inputEnvelopeCells':len(child['cells']),'globalSourceIdMin':min(global_ids)if global_ids else None,'globalSourceIdMax':max(global_ids)if global_ids else None,'childEnvelopeSHA256':fingerprint,'childSourceUnionCheck':proof,'childNumericLossBounds':losses,'childNumericalAccounting':child_numeric})
 meta={'inputTriangles':source_count,'mergeInputEnvelopeCells':len(records),'mergeChildCount':len(children),'sourceIdOffsets':list(source_id_offsets),'sourceTriangleCount':source_count,'distinctVisibleSourceIds':len(owners),'childProofs':proofs,'childPrecomputationTestedCandidates':child_tests,'inheritedNumericLossBounds':{'projectedMissingAreaUpperBound':inherited_missing,'projectedOverlapAreaUpperBound':inherited_overlap,'projectedExcessAreaUpperBound':inherited_excess},'representation':'original child polygon + original affine plane + offset global sourceId; no refit','partitionPolicy':'reuse certified child convex cells directly'}
 _phase(phase_callback,'merge_inputs','end',started,recordCount=len(records),sourceTriangleCount=source_count)
 out=_envelope_records(records,meta,cell_size,max_pair_tests,max_cells,max_fragments,phase_callback)
 out['stats']['supportUnionCheck']['method']='disjoint merged cells + all child envelope footprints covered + child certificates bind each original raw-source union'
 out['stats']['partitionPolicy']='reuse certified child convex cells directly'
 return out


def _overlay(tri,envelope,index,budget=None,limit=2000000):
 polygon=[tuple(p[:2])for p in tri]
 for k in index.query(polygon):
  if budget is not None:
   budget['tests']+=1
   if budget['tests']>limit:raise ComplexityLimit('all tested overlay candidates budget exceeded')
  cell=envelope['cells'][k];p=intersect(polygon,cell['polygon'])
  if p:yield p,cell

@_track_numerics
def gap_metrics(underside_triangles,envelope,max_overlay_pairs=2000000):
 cells=envelope['cells'];index=SpatialHash([c['polygon']for c in cells],envelope['cellSize']);lo=math.inf;hi=-math.inf;worst_lo=None;worst_hi=None
 total=covered=0.;counts={'fullyCoveredTriangles':0,'partiallyCoveredTriangles':0,'completelyUncoveredTriangles':0,'excludedZeroProjectedAreaTriangles':0};pairs=0;extrema=0;budget={'tests':0}
 for tid,tri in enumerate(underside_triangles):
  pl=plane(tri)
  if pl is None:counts['excludedZeroProjectedAreaTriangles']+=1;continue
  ar=area([p[:2]for p in tri]);total+=ar;cov=0.
  for polygon,cell in _overlay(tri,envelope,index,budget,max_overlay_pairs):
   pairs+=1
   if pairs>max_overlay_pairs:raise ComplexityLimit('gap overlay budget exceeded')
   cov+=area(polygon);coeff=tuple(pl[k]-cell['plane'][k]for k in range(3))
   for p in polygon:
    v=height(coeff,p);extrema+=1;record={'xy':p,'undersideTriangleId':tid,'supportTriangleId':cell['supportId'],'gap':v}
    if v<lo:lo=v;worst_lo=record
    if v>hi:hi=v;worst_hi=record
  if cov>ar+max(1e-10,ar*1e-8):raise ArithmeticError('Envelope cells overlap beyond tolerance')
  cov=min(cov,ar);covered+=cov
  if cov<=AREA_EPS:counts['completelyUncoveredTriangles']+=1
  elif ar-cov>max(1e-12,ar*1e-10):counts['partiallyCoveredTriangles']+=1
  else:counts['fullyCoveredTriangles']+=1
 return {'minGap':lo if pairs else None,'maxGap':hi if pairs else None,'worstMin':worst_lo,'worstMax':worst_hi,'totalProjectedArea':total,'coveredProjectedArea':covered,'uncoveredProjectedArea':max(0.,total-covered),'overlayCells':pairs,'testedOverlayCandidates':budget['tests'],'extremalVertices':extrema,**counts,'meaning':'gap to highest support surface at each covered XY, not all hidden surfaces'}

@_track_numerics
def pointwise_delta(baseline_underside,baseline_envelope,candidate_underside,candidate_envelope,xy_tolerance=2e-6,max_overlay_pairs=2000000):
 """Exact candidate gap minus baseline gap over actual COMMON supported XY.

 Small accepted XY drift still overlays actual candidate domains, including
 neighboring triangle IDs. Coverage is measured separately for both domains.
 """
 old=list(baseline_underside);new=list(candidate_underside)
 if len(old)!=len(new):raise ValueError('Underside triangle identities differ')
 for a,b in zip(old,new):
  if any(abs(a[i][k]-b[i][k])>xy_tolerance for i in range(3)for k in (0,1)):raise ValueError('Underside XY topology differs')
  if (plane(a)is None)!=(plane(b)is None):raise ValueError('Projected degeneracy changed')
 ib=SpatialHash([c['polygon']for c in baseline_envelope['cells']],baseline_envelope['cellSize']);ic=SpatialHash([c['polygon']for c in candidate_envelope['cells']],candidate_envelope['cellSize'])
 candidate_index=SpatialHash([[p[:2]for p in t]for t in new],candidate_envelope['cellSize']) if new else None
 candidate_cells={};candidate_planes={};budget={'tests':0};old_total=new_total=old_area=new_area=common_domain=common=0.
 def valid_difference(name,value,scale):
  tolerance=max(1e-10,scale*1e-8)
  if value < -tolerance:raise ArithmeticError(name+' negative beyond numerical area budget: '+str(value))
  return max(0.,value)
 for tid,t in enumerate(new):
  pl=plane(t);candidate_planes[tid]=pl
  if pl is None:candidate_cells[tid]=[];continue
  ar=area([p[:2]for p in t]);new_total+=ar
  cc=list(_overlay(t,candidate_envelope,ic,budget,max_overlay_pairs));candidate_cells[tid]=cc;covered=sum(area(p)for p,_ in cc)
  valid_difference('candidate triangle uncovered area',ar-covered,ar);new_area+=covered
 lo=math.inf;hi=-math.inf;worst_lo=worst_hi=None;pairs=0;vertices=0
 for tid,a in enumerate(old):
  pa=plane(a)
  if pa is None:continue
  ar=area([p[:2]for p in a]);old_total+=ar;base_cells=list(_overlay(a,baseline_envelope,ib,budget,max_overlay_pairs));covered=sum(area(p)for p,_ in base_cells)
  valid_difference('baseline triangle uncovered area',ar-covered,ar);old_area+=covered
  for ctid in candidate_index.query([p[:2]for p in a]) if candidate_index else []:
   budget['tests']+=1
   if budget['tests']>max_overlay_pairs:raise ComplexityLimit('all tested delta domain candidates budget exceeded')
   pb=candidate_planes[ctid]
   if pb is None:continue
   domain=intersect([p[:2]for p in a],[p[:2]for p in new[ctid]])
   if not domain:continue
   common_domain+=area(domain);next_cells=candidate_cells[ctid]
   local=SpatialHash([p for p,_ in next_cells],candidate_envelope['cellSize'])
   for polygon,base in base_cells:
    for k in local.query(polygon):
     budget['tests']+=1
     if budget['tests']>max_overlay_pairs:raise ComplexityLimit('all tested pointwise delta candidates budget exceeded')
     pp,nxt=next_cells[k];overlap=intersect(polygon,pp)
     if not overlap:continue
     pairs+=1;common+=area(overlap);coeff=tuple(pb[i]-nxt['plane'][i]-pa[i]+base['plane'][i]for i in range(3))
     for p in overlap:
      d=height(coeff,p);vertices+=1;record={'xy':p,'undersideTriangleId':tid,'baselineUndersideTriangleId':tid,'candidateUndersideTriangleId':ctid,'baselineSupportTriangleId':base['supportId'],'candidateSupportTriangleId':nxt['supportId'],'delta':d,'baselineGap':height(pa,p)-height(base['plane'],p),'candidateGap':height(pb,p)-height(nxt['plane'],p)}
      if d<lo:lo=d;worst_lo=record
      if d>hi:hi=d;worst_hi=record
 valid_difference('common domains exceed baseline domain',old_total-common_domain,old_total)
 valid_difference('common domains exceed candidate domain',new_total-common_domain,new_total)
 baseline_uncovered=valid_difference('baseline uncovered',old_total-old_area,old_total)
 candidate_uncovered=valid_difference('candidate uncovered',new_total-new_area,new_total)
 baseline_only=valid_difference('common coverage exceeds baseline',old_area-common,old_area)
 candidate_only=valid_difference('common coverage exceeds candidate',new_area-common,new_area)
 valid_difference('supported common exceeds actual common domain',common_domain-common,common_domain)
 union_domain=old_total+new_total-common_domain
 neither=valid_difference('covered union exceeds actual domain union',union_domain-old_area-new_area+common,union_domain)
 return {'minDelta':lo if pairs else None,'maxDelta':hi if pairs else None,'worstMin':worst_lo,'worstMax':worst_hi,'totalProjectedArea':old_total,'baselineTotalProjectedArea':old_total,'candidateTotalProjectedArea':new_total,'commonDomainProjectedArea':common_domain,'domainUnionProjectedArea':union_domain,'commonCoveredProjectedArea':common,'baselineCoveredProjectedArea':old_area,'candidateCoveredProjectedArea':new_area,'baselineUncoveredProjectedArea':baseline_uncovered,'candidateUncoveredProjectedArea':candidate_uncovered,'baselineOnlyCoveredArea':baseline_only,'candidateOnlyCoveredArea':candidate_only,'neitherCoveredArea':neither,'overlayCells':pairs,'testedOverlayCandidates':budget['tests'],'extremalVertices':vertices,'meaning':'pointwise candidateGap-baselineGap on actual common supported domains, including neighboring IDs under accepted XY drift'}
