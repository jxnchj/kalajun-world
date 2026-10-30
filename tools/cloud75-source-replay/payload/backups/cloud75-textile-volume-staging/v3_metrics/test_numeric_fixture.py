"""Local numeric regression only: tile-clipped source fixtures, NOT baseline metrics.
This is newly extracted source data, not the lost historical 49-cell fixture.
"""
import hashlib,json,time,unittest
from pathlib import Path
import upper_envelope as u
FIXTURE_SHA='bc8850ee3a1c0412e514e1b848897669a4ec61d16a522899b4e2de73daf9b888'

def local_records():
 path=Path(__file__).with_name('fixture_source2262_raw.json')
 assert hashlib.sha256(path.read_bytes()).hexdigest()==FIXTURE_SHA
 data=json.loads(path.read_text());groups={}
 assert data['sourceUnchanged'] and data['target']['sourceId']==2262
 for r in data['records']:
  pl=u.plane(r['xyz'])
  if pl is None:continue
  pp=u.intersect([p[:2]for p in r['xyz']],data['tile'])
  if not pp:continue
  zz=[u.height(pl,p)for p in pp]
  groups.setdefault(r['node'],[]).append({'supportId':r['sourceId'],'partitionId':0,'polygon':pp,'plane':pl,'maxZ':max(zz),'minZ':min(zz)})
 return data,groups

@u._track_numerics
def envelope(records):
 return u._envelope_records(records,{'inputTriangles':len(records),'fixtureOnly':True},.06,2000000,100000,2048,None)

class RealSourceNumericFixtureTests(unittest.TestCase):
 def test_source2262_tile_hierarchy_union(self):
  data,groups=local_records();records=[r for group in groups.values()for r in group]
  self.assertIn(2262,{r['supportId']for r in records})
  children=[envelope(group)for group in groups.values()]
  merged=u.merge_envelopes(children,[0]*len(children))
  self.assertTrue(merged['stats']['supportUnionCheck']['passed'])
  self.assertAlmostEqual(merged['stats']['projectedUnionArea'],.0036,places=12)
  tile=data['tile'];receiver=[[(tile[i][0],tile[i][1],2.)for i in ids]for ids in ((0,1,2),(0,2,3))]
  gap=u.gap_metrics(receiver,merged)
  self.assertAlmostEqual(gap['coveredProjectedArea'],.0036,places=12)
  self.assertEqual(merged['stats']['supportUnionCheck']['summedUncoveredSourcePartitionArea'],0.)
  for env in children+[merged]:
   loss=env['stats']['cumulativeNumericLossBounds']
   for key in ('projectedMissingAreaUpperBound','projectedOverlapAreaUpperBound','projectedExcessAreaUpperBound'):
    self.assertLessEqual(loss[key],loss['numericalAreaBudget'])

if __name__=='__main__':unittest.main()
