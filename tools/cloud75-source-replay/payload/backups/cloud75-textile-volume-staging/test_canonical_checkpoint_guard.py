import ast,json,unittest,tempfile,copy
from pathlib import Path
from phase_checkpoint import save,load,digest
class CanonicalGuard(unittest.TestCase):
 def guard(self,stored,current):
  tree=ast.parse(Path(__file__).with_name('stage_volume75_v4.py').read_text())
  node=next(n for n in ast.walk(tree)if isinstance(n,ast.Assert)and isinstance(n.msg,ast.Constant)and n.msg.value=='Joint solution changed')
  return eval(compile(ast.Expression(node.test),'<actual-stage-guard>','eval'),{'json_digest':digest,'load_checkpoint':lambda *a:stored,'OUT':Path('.'),'common_identity':{},'report':{'jointSettlement':current}})
 def test_actual_stage_guard_roundtrip_and_adversaries(self):
  original={'shifts':[0.,.0001],'intervals':[(0.,.001),(-.001,.002)]};stored=json.loads(json.dumps(original));self.assertTrue(self.guard(stored,original))
  changes=[]
  v=copy.deepcopy(stored);v['shifts'][1]+=.00001;changes.append(v)
  v=copy.deepcopy(stored);del v['shifts'];changes.append(v)
  v=copy.deepcopy(stored);v['intervals'].reverse();changes.append(v)
  v=copy.deepcopy(stored);v['shifts'][0]='0.0';changes.append(v)
  for v in changes:self.assertFalse(self.guard(v,original))
  for value in (float('nan'),float('inf')):
   v=copy.deepcopy(stored);v['shifts'][0]=value
   with self.assertRaises(ValueError):self.guard(v,original)
 def test_existing_tuple_payload_idempotent_and_strict(self):
  with tempfile.TemporaryDirectory()as d:
   p=Path(d)/'p.json';identity={'source':'a'};payload={'intervals':[(0.,1.)]};save(p,identity,payload);raw=p.read_bytes();save(p,identity,payload);self.assertEqual(p.read_bytes(),raw)
   for other in ({'intervals':[(0.,2.)]},{'intervals':[(0,1)]},{'intervals':[('0',1.)]}):
    with self.assertRaises(AssertionError):save(p,identity,other)
   with self.assertRaises(AssertionError):save(p,{'source':'b'},payload)
   with self.assertRaises(ValueError):save(p,identity,{'x':float('nan')})
   self.assertEqual(p.read_bytes(),raw)
   v=json.loads(raw);v['payload']['intervals'][0][1]=2;p.write_text(json.dumps(v))
   with self.assertRaises(AssertionError):load(p,identity)
if __name__=='__main__':unittest.main()
