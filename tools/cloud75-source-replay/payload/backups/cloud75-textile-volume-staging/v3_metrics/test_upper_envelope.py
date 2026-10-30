import unittest
from upper_envelope import prepare_envelope,gap_metrics,pointwise_delta,ComplexityLimit,check_envelope_coverage,merge_envelopes
XY=[(0,0),(1,0),(0,1)]
def tri(fn,xy=XY):return [(x,y,fn(x,y))for x,y in xy]
class EnvelopeTests(unittest.TestCase):
 def test_highest_not_hidden(self):
  e=prepare_envelope([tri(lambda x,y:-5),tri(lambda x,y:0)])
  r=gap_metrics([tri(lambda x,y:.0007)],e)
  self.assertAlmostEqual(r['minGap'],.0007);self.assertAlmostEqual(r['maxGap'],.0007);self.assertAlmostEqual(e['stats']['projectedUnionArea'],.5)
 def test_equal_height_arrangement_vertex(self):
  e=prepare_envelope([tri(lambda x,y:x),tri(lambda x,y:1-x)])
  r=gap_metrics([tri(lambda x,y:2)],e)
  self.assertAlmostEqual(r['minGap'],1);self.assertAlmostEqual(r['maxGap'],1.5);self.assertAlmostEqual(r['worstMax']['xy'][0],.5)
  self.assertAlmostEqual(r['coveredProjectedArea'],.5)
 def test_three_plane_interior_extremum(self):
  e=prepare_envelope([tri(lambda x,y:x),tri(lambda x,y:y),tri(lambda x,y:1-x-y)])
  r=gap_metrics([tri(lambda x,y:2)],e);self.assertAlmostEqual(r['maxGap'],5/3);self.assertAlmostEqual(r['worstMax']['xy'][0],1/3);self.assertAlmostEqual(r['worstMax']['xy'][1],1/3);self.assertAlmostEqual(r['coveredProjectedArea'],.5)
 def test_coplanar_duplicate_union(self):
  t=tri(lambda x,y:0);e=prepare_envelope([t,t,t]);self.assertAlmostEqual(e['stats']['projectedUnionArea'],.5);self.assertEqual({c['supportId']for c in e['cells']},{0})
 def test_partial_uncovered(self):
  t=tri(lambda x,y:0,[(0,0),(.5,0),(0,.5)])
  e=prepare_envelope([t,t]);r=gap_metrics([tri(lambda x,y:1)],e)
  self.assertAlmostEqual(r['uncoveredProjectedArea'],.375);self.assertEqual(r['partiallyCoveredTriangles'],1)
 def test_pointwise_delta(self):
  b=prepare_envelope([tri(lambda x,y:0)]);c=prepare_envelope([tri(lambda x,y:x),tri(lambda x,y:1-x)])
  r=pointwise_delta([tri(lambda x,y:2)],b,[tri(lambda x,y:2.1)],c)
  self.assertAlmostEqual(r['minDelta'],-.9);self.assertAlmostEqual(r['maxDelta'],-.4);self.assertAlmostEqual(r['commonCoveredProjectedArea'],.5)
 def test_changing_envelope_partition(self):
  b=prepare_envelope([tri(lambda x,y:x),tri(lambda x,y:1-x)]);c=prepare_envelope([tri(lambda x,y:x+.2),tri(lambda x,y:.8-x)])
  t=tri(lambda x,y:2);r=pointwise_delta([t],b,[t],c)
  self.assertAlmostEqual(r['minDelta'],-.2);self.assertAlmostEqual(r['maxDelta'],.2);self.assertAlmostEqual(r['commonCoveredProjectedArea'],.5);self.assertGreaterEqual(r['overlayCells'],3)
 def test_reverse_winding(self):
  e=prepare_envelope([tri(lambda x,y:0)[::-1]]);r=gap_metrics([tri(lambda x,y:1)],e);self.assertAlmostEqual(r['coveredProjectedArea'],.5)
 def test_vertical_excluded(self):
  e=prepare_envelope([[(0,0,0),(0,0,1),(0,1,0)],tri(lambda x,y:0)])
  self.assertEqual(e['stats']['excludedZeroProjectedAreaTriangles'],1)
 def test_complexity_fails_not_skips(self):
  with self.assertRaises(ComplexityLimit):prepare_envelope([tri(lambda x,y:0)]*2,max_pair_tests=0)
 def test_no_support(self):
  e=prepare_envelope([]);r=gap_metrics([tri(lambda x,y:1)],e)
  self.assertIsNone(r['minGap']);self.assertAlmostEqual(r['uncoveredProjectedArea'],.5)
 def test_tiled_large_support_preserves_envelope_under_fragment_cap(self):
  import importlib.util
  from pathlib import Path
  spec=importlib.util.spec_from_file_location('old_envelope',Path(__file__).with_name('upper_envelope.v1.py'));old=importlib.util.module_from_spec(spec);spec.loader.exec_module(old)
  floor=tri(lambda x,y:0,[(0,0),(.36,0),(0,.36)])
  islands=[]
  for i in range(5):
   for j in range(5-i):
    x=.06*i+.02;y=.06*j+.02;islands.append(tri(lambda x,y:.5,[(x,y),(x+.01,y),(x,y+.01)]))
  source=[floor]+islands
  with self.assertRaises(old.ComplexityLimit):old.prepare_envelope(source,max_fragments=8)
  original=old.prepare_envelope(source);new=prepare_envelope(source,max_fragments=8)
  underside=[tri(lambda x,y:1,[(0,0),(.36,0),(0,.36)])]
  a=gap_metrics(underside,original);b=gap_metrics(underside,new)
  for k in ('minGap','maxGap','coveredProjectedArea','uncoveredProjectedArea'):self.assertAlmostEqual(a[k],b[k])
  self.assertLessEqual(new['stats']['maxFragmentsPerTriangle'],8);self.assertGreater(new['stats']['partitionedSourceTriangles'],0)
  d=pointwise_delta(underside,original,underside,new);self.assertAlmostEqual(d['minDelta'],0);self.assertAlmostEqual(d['maxDelta'],0)
 def test_tiling_equivalence_crossed_planes_duplicates_and_holes(self):
  underside=[tri(lambda x,y:2)]
  examples=[
   [tri(lambda x,y:x),tri(lambda x,y:y),tri(lambda x,y:1-x-y)],
   [tri(lambda x,y:.3)]*3,
   [tri(lambda x,y:.2,[(0,0),(.2,0),(0,.2)]),tri(lambda x,y:.5,[(.7,0),(.9,0),(.7,.2)])],
  ]
  for source in examples:
   a=prepare_envelope(source,tile_large=False);b=prepare_envelope(source,tile_large=True)
   self.assertAlmostEqual(a['stats']['projectedUnionArea'],b['stats']['projectedUnionArea'])
   ga=gap_metrics(underside,a);gb=gap_metrics(underside,b)
   for k in ('minGap','maxGap','coveredProjectedArea','uncoveredProjectedArea'):self.assertAlmostEqual(ga[k],gb[k])
   d=pointwise_delta(underside,a,underside,b)
   self.assertAlmostEqual(d['minDelta'],0);self.assertAlmostEqual(d['maxDelta'],0);self.assertAlmostEqual(d['commonCoveredProjectedArea'],ga['coveredProjectedArea'])
 def test_near_coplanar_nontransitive_ties_all_permutations(self):
  import itertools
  for levels in itertools.permutations([0.,.8e-12,1.6e-12]):
   e=prepare_envelope([tri(lambda x,y,z=z:z)for z in levels])
   self.assertAlmostEqual(e['stats']['projectedUnionArea'],.5)
   self.assertEqual({c['supportId']for c in e['cells']},{levels.index(1.6e-12)})
 def test_tile_gridline_negative_coordinates_exact_vertices(self):
  t=tri(lambda x,y:.3*x-.1*y,[(-.12,-.12),(.12,-.12),(-.12,.12)])
  a=prepare_envelope([t],tile_large=False);b=prepare_envelope([t],tile_large=True)
  self.assertAlmostEqual(a['stats']['projectedUnionArea'],b['stats']['projectedUnionArea'])
  self.assertLessEqual(b['stats']['maxPartitionAreaError'],b['stats']['summedPartitionAreaNumericalBudget'])
  self.assertGreaterEqual(b['stats']['partitionDroppedSliverArea'],0)
  u=[[(x,y,z+.1)for x,y,z in t]];d=pointwise_delta(u,a,u,b)
  self.assertAlmostEqual(d['minDelta'],0);self.assertAlmostEqual(d['maxDelta'],0)
 def test_xy_drift_uses_actual_common_footprint(self):
  e=prepare_envelope([tri(lambda x,y:0,[(-1,-1),(3,-1),(-1,3)])],cell_size=.3)
  shift=1e-6;a=tri(lambda x,y:1);b=[(x+shift,y,1.1)for x,y,z in a]
  r=pointwise_delta([a],e,[b],e)
  self.assertAlmostEqual(r['baselineTotalProjectedArea'],.5);self.assertAlmostEqual(r['candidateTotalProjectedArea'],.5)
  self.assertAlmostEqual(r['commonCoveredProjectedArea'],.5*(1-shift)**2,places=11)
  self.assertAlmostEqual(r['minDelta'],.1);self.assertAlmostEqual(r['maxDelta'],.1)
 def test_xy_drift_crosses_neighbor_triangle_ids(self):
  e=prepare_envelope([tri(lambda x,y:0,[(-1,-1),(4,-1),(-1,4)])],cell_size=.3)
  a=[[(0,0,1),(1,0,1),(1,1,1)],[(0,0,1),(1,1,1),(0,1,1)]];shift=1e-6;b=[[(x+shift,y,2)for x,y,z in t]for t in a]
  r=pointwise_delta(a,e,b,e)
  self.assertAlmostEqual(r['commonCoveredProjectedArea'],1-shift,places=10);self.assertAlmostEqual(r['minDelta'],1);self.assertAlmostEqual(r['maxDelta'],1)
 def test_failed_overlay_candidates_consume_budget(self):
  e=prepare_envelope([tri(lambda x,y:0,[(.8,.8),(1,.8),(.8,1)])],cell_size=2)
  with self.assertRaises(ComplexityLimit):gap_metrics([tri(lambda x,y:1)],e,max_overlay_pairs=0)
 def test_conservation_rejects_original_cycle_hole(self):
  import importlib.util
  from pathlib import Path
  spec=importlib.util.spec_from_file_location('old_cycle',Path(__file__).with_name('upper_envelope.v1.py'));old=importlib.util.module_from_spec(spec);spec.loader.exec_module(old)
  source=[tri(lambda x,y,z=z:z)for z in [0.,.8e-12,1.6e-12]]
  broken=old.prepare_envelope(source);self.assertEqual(len(broken['cells']),0)
  with self.assertRaises(ArithmeticError):check_envelope_coverage(source,broken)
  good=prepare_envelope(source);self.assertTrue(good['stats']['supportUnionCheck']['passed'])
 def test_conservation_rejects_doublecounted_cells(self):
  source=[tri(lambda x,y:0)];e=prepare_envelope(source,tile_large=False);e['cells']=e['cells']*2
  with self.assertRaises(ArithmeticError):check_envelope_coverage(source,e)
 def test_direct_hierarchy_crossed_duplicate_and_hole_equivalence(self):
  examples=[
   [[tri(lambda x,y:x)],[tri(lambda x,y:1-x)],[tri(lambda x,y:.2)]],
   [[tri(lambda x,y:.3),tri(lambda x,y:.3)],[tri(lambda x,y:.3)]],
   [[tri(lambda x,y:.2,[(0,0),(.2,0),(0,.2)])],[tri(lambda x,y:.4,[(.7,0),(.9,0),(.7,.2)])]],
  ]
  for groups in examples:
   raw=[t for g in groups for t in g];direct=prepare_envelope(raw,cell_size=.2);children=[prepare_envelope(g,cell_size=.2)for g in groups]
   offsets=[];n=0
   for g in groups:offsets.append(n);n+=len(g)
   merged=merge_envelopes(children,offsets)
   self.assertTrue(merged['stats']['supportUnionCheck']['passed']);self.assertEqual(merged['stats']['sourceTriangleCount'],len(raw))
   self.assertEqual({c['supportId']for c in direct['cells']},{c['supportId']for c in merged['cells']})
   self.assertTrue(all(tuple(c['plane'])in {tuple(x['plane'])for child in children for x in child['cells']}for c in merged['cells']))
   self.assertAlmostEqual(direct['stats']['projectedUnionArea'],merged['stats']['projectedUnionArea'])
   u=[tri(lambda x,y:2)];ga=gap_metrics(u,direct);gb=gap_metrics(u,merged)
   for k in ('minGap','maxGap','coveredProjectedArea','uncoveredProjectedArea'):self.assertAlmostEqual(ga[k],gb[k])
   delta=pointwise_delta(u,direct,u,merged);self.assertAlmostEqual(delta['minDelta'],0);self.assertAlmostEqual(delta['maxDelta'],0)
 def test_hierarchy_changed_winner_and_global_provenance(self):
  old=[tri(lambda x,y:x),tri(lambda x,y:1-x)];new=[tri(lambda x,y:x+.2),tri(lambda x,y:.8-x)]
  b=merge_envelopes([prepare_envelope([t],cell_size=.2)for t in old],[10,20]);c=merge_envelopes([prepare_envelope([t],cell_size=.2)for t in new],[10,20])
  self.assertEqual({cell['supportId']for cell in c['cells']},{10,20});self.assertEqual(c['stats']['sourceIdOffsets'],[10,20])
  u=[tri(lambda x,y:2)];r=pointwise_delta(u,b,u,c);direct=pointwise_delta(u,prepare_envelope(old,cell_size=.2),u,prepare_envelope(new,cell_size=.2))
  for k in ('minDelta','maxDelta','commonCoveredProjectedArea'):self.assertAlmostEqual(r[k],direct[k])
  self.assertIn(r['worstMin']['candidateSupportTriangleId'],(10,20))
 def test_nested_hierarchy_and_phase_events(self):
  events=[];children=[prepare_envelope([tri(lambda x,y,z=z:z)],cell_size=.2,phase_callback=events.append)for z in (0,.1,.2)]
  first=merge_envelopes(children[:2],[0,1],phase_callback=events.append);final=merge_envelopes([first,children[2]],[0,2],phase_callback=events.append)
  self.assertEqual({c['supportId']for c in final['cells']},{2});self.assertEqual(final['stats']['sourceTriangleCount'],3)
  for stage in ('prepartition','merge_inputs','envelope_occlusion','coverage_disjoint','coverage_union'):
   self.assertTrue(any(e['stage']==stage and e['state']=='start'for e in events));self.assertTrue(any(e['stage']==stage and e['state']=='end'and 'elapsedSeconds'in e for e in events))
 def test_hierarchy_rejects_uncertified_and_colliding_ids(self):
  a=prepare_envelope([tri(lambda x,y:0)],cell_size=.2)
  with self.assertRaises(ValueError):merge_envelopes([a,a],[0,0])
  broken=dict(a);broken['stats']=dict(a['stats']);broken['stats']['supportUnionCheck']={'passed':False}
  with self.assertRaises(ValueError):merge_envelopes([broken],[0])
 def test_both_hierarchy_associations_negative_disjoint_holes_partitions(self):
  raw=[tri(lambda x,y:-.4+.5*x,[(-.12,-.12),(.48,-.12),(-.12,.48)]),tri(lambda x,y:-.3-.1*y,[(0,0),(.48,0),(0,.48)]),tri(lambda x,y:-.1,[(.66,0),(.84,0),(.66,.18)])]
  a,b,c=[prepare_envelope([t],cell_size=size)for t,size in zip(raw,[.06,.1,.09])]
  left=merge_envelopes([(merge_envelopes([(a,0),(b,1)]),0),(c,2)])
  right=merge_envelopes([(a,0),(merge_envelopes([(b,1),(c,2)]),0)])
  direct=prepare_envelope(raw);u=[tri(lambda x,y:1,[(-.2,-.2),(1.2,-.2),(-.2,1.2)])]
  self.assertEqual({x['supportId']for x in left['cells']},{x['supportId']for x in right['cells']})
  for target in (left,right):
   d=pointwise_delta(u,direct,u,target)
   self.assertAlmostEqual(d['minDelta'],0);self.assertAlmostEqual(d['maxDelta'],0)
   self.assertAlmostEqual(target['stats']['projectedUnionArea'],direct['stats']['projectedUnionArea'])
   loss=target['stats']['cumulativeNumericLossBounds'];self.assertTrue(loss['passed']);self.assertLessEqual(loss['projectedMissingAreaUpperBound'],loss['numericalAreaBudget'])
   self.assertGreaterEqual(loss['projectedMissingAreaUpperBound'],loss['inheritedMissingAreaUpperBound'])
 def test_hierarchy_cumulative_loss_cannot_reset_budget(self):
  import copy
  a=prepare_envelope([tri(lambda x,y:0)],cell_size=.2);b=copy.deepcopy(a)
  b['stats']['cumulativeNumericLossBounds']['projectedMissingAreaUpperBound']=1.
  with self.assertRaises(ArithmeticError):merge_envelopes([(b,0)])
 def test_external_extra_cell_outside_owned_source_rejected(self):
  import copy
  source=[tri(lambda x,y:0,[(0,0),(.01,0),(0,.01)])];e=prepare_envelope(source)
  broken=copy.deepcopy(e);broken['cells'].append({'supportId':0,'plane':(0.,0.,0.),'polygon':[(1,1),(1.01,1),(1,1.01)]})
  with self.assertRaises(ArithmeticError):check_envelope_coverage(source,broken)
 def test_external_changed_plane_or_owner_rejected(self):
  import copy
  source=[tri(lambda x,y:0)];e=prepare_envelope(source,cell_size=.2)
  for key,value in [('plane',(0.,0.,.1)),('supportId',99)]:
   broken=copy.deepcopy(e);broken['cells'][0][key]=value
   with self.assertRaises(ArithmeticError):check_envelope_coverage(source,broken)
 def test_nested_merge_retains_explicit_prior_numeric_losses(self):
  import copy
  a=prepare_envelope([tri(lambda x,y:0)],cell_size=.2);a=copy.deepcopy(a)
  a['stats']['partitionDroppedSliverArea']=2e-13;a['stats']['summedPartitionAreaError']=3e-13;a['stats']['maxPartitionAreaError']=3e-13
  loss=a['stats']['cumulativeNumericLossBounds'];loss['projectedMissingAreaUpperBound']=1e-12;loss['projectedOverlapAreaUpperBound']=3e-13;loss['projectedExcessAreaUpperBound']=3e-13
  first=merge_envelopes([(a,0)]);final=merge_envelopes([(first,0)])
  self.assertEqual(first['stats']['childProofs'][0]['childNumericalAccounting']['partitionDroppedSliverArea'],2e-13)
  self.assertEqual(first['stats']['childProofs'][0]['childNumericalAccounting']['summedPartitionAreaError'],3e-13)
  self.assertGreaterEqual(final['stats']['cumulativeNumericLossBounds']['projectedMissingAreaUpperBound'],1e-12)
  self.assertGreaterEqual(final['stats']['cumulativeNumericLossBounds']['projectedOverlapAreaUpperBound'],3e-13)
  self.assertGreaterEqual(final['stats']['cumulativeNumericLossBounds']['projectedExcessAreaUpperBound'],3e-13)
 def test_json_roundtrip_checkpoint_planes_and_owner_proof(self):
  import json
  source=[tri(lambda x,y:x),tri(lambda x,y:1-x)];children=[prepare_envelope([t],cell_size=.2)for t in source]
  original=merge_envelopes(children,[0,1]);restored_children=json.loads(json.dumps(children));restored=merge_envelopes(restored_children,[0,1])
  self.assertEqual([p['childEnvelopeSHA256']for p in original['stats']['childProofs']],[p['childEnvelopeSHA256']for p in restored['stats']['childProofs']])
  self.assertTrue(check_envelope_coverage(source,json.loads(json.dumps(restored)))['passed'])
  u=[tri(lambda x,y:2)];d=pointwise_delta(u,original,u,restored)
  self.assertAlmostEqual(d['minDelta'],0);self.assertAlmostEqual(d['maxDelta'],0)
 def test_topology_mismatch(self):
  e=prepare_envelope([tri(lambda x,y:0)])
  with self.assertRaises(ValueError):pointwise_delta([tri(lambda x,y:1)],e,[tri(lambda x,y:1,[(0,0),(2,0),(0,1)])],e)

class NumericRobustnessTests(unittest.TestCase):
 def test_source_concavity_is_rejected_not_hulled(self):
  from upper_envelope import halfplane,intersect
  polygon=[(0.,0.),(1.,0.),(1.,1.),(.5,1.-1e-15),(0.,1.)]
  for operation in (lambda:halfplane(polygon,(1.,0.,1.)),lambda:intersect(polygon,[(0.,0.),(2.,0.),(0.,2.)])):
   with self.assertRaisesRegex(ArithmeticError,'Concave source'):operation()
 def test_anchored_area_preserves_small_translated_rectangle(self):
  from upper_envelope import area
  p=[(1e6,1e6),(1e6+.001,1e6),(1e6+.001,1e6+.002),(1e6,1e6+.002)]
  expected=(p[1][0]-p[0][0])*(p[2][1]-p[1][1])
  self.assertEqual(area(p),expected)
 def test_relative_edge_plane_does_not_cancel_at_world_coordinates(self):
  from upper_envelope import edge_plane,height
  a=(.84,2.22);b=(.84+3.125e-13,2.22+3.125e-13)
  self.assertEqual(height(edge_plane(a,b,1),a),0.)
  self.assertEqual(height(edge_plane(a,b,1),b),0.)
  self.assertGreater(height(edge_plane(a,b,1),(.84,2.28)),0.)
 def test_convex_output_tiny_repair_is_explicit_and_bounded(self):
  from upper_envelope import _NUMERIC_CONTEXT,_clip_output,_numeric_snapshot,AREA_EPS,_convex
  token=_NUMERIC_CONTEXT.set({'correctionCount':0,'addedAreaUpperBound':0.,'removedAreaUpperBound':0.,'maxCorrectionAreaUpperBound':0.})
  try:
   p=[(0.,0.),(1.,0.),(1.,1.),(.5,1.-1e-15),(0.,1.)]
   q=_clip_output(p);n=_numeric_snapshot()
   self.assertTrue(_convex(q));self.assertEqual(n['correctionCount'],1)
   self.assertGreater(n['addedAreaUpperBound'],0.);self.assertLessEqual(n['addedAreaUpperBound'],AREA_EPS)
   self.assertEqual(n['removedAreaUpperBound'],0.)
  finally:_NUMERIC_CONTEXT.reset(token)
 def test_material_concave_output_cannot_be_repaired(self):
  from upper_envelope import _clip_output
  with self.assertRaisesRegex(ArithmeticError,'unchanged AREA_EPS'):_clip_output([(0.,0.),(1.,0.),(1.,1.),(.5,.9),(0.,1.)])
 def test_unchanged_convex_output_no_extra_vertex_or_area(self):
  from upper_envelope import halfplane,_numeric_snapshot
  p=[(.84,2.22),(.90,2.22),(.90,2.28),(.84,2.28)]
  self.assertEqual(halfplane(p,(0.,0.,1.)),p)
 def test_children_opposed_losses_do_not_cancel(self):
  import copy
  a=prepare_envelope([tri(lambda x,y:0)],tile_large=False)
  b=copy.deepcopy(a)
  # Each child alone fits its 5e-9 budget, but merging the same footprint must
  # not reset to a fresh budget or cancel opposite inherited uncertainties.
  for child in (a,b):
   child['stats']['cumulativeNumericLossBounds']['projectedMissingAreaUpperBound']=3e-9
   child['stats']['cumulativeNumericLossBounds']['projectedExcessAreaUpperBound']=3e-9
  with self.assertRaisesRegex(ArithmeticError,'Cumulative inherited'):merge_envelopes([(a,0),(b,1)])

 def test_child_negative_or_nan_uncertainty_rejected(self):
  import copy
  a=prepare_envelope([tri(lambda x,y:0)],tile_large=False)
  for value in (-1.,float('nan'),float('inf')):
   b=copy.deepcopy(a);b['stats']['cumulativeNumericLossBounds']['projectedMissingAreaUpperBound']=value
   with self.assertRaisesRegex(ValueError,'finite and nonnegative'):merge_envelopes([(b,0)])

if __name__=='__main__':unittest.main()
