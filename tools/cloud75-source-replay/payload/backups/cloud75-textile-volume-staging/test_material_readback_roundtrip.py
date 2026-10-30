import ast,copy,json,unittest,sys
from pathlib import Path
sys.path.insert(0,str(Path(__file__).resolve().parent.parent/'cloud75-textile-gi-staging'))
from material_fingerprint import digest as material_digest
class Readback(unittest.TestCase):
 def verifier(self):
  path=Path(__file__).with_name('readback_saved_blend75_v4.py');tree=ast.parse(path.read_text());node=next(n for n in tree.body if isinstance(n,ast.FunctionDef)and n.name=='verify_material_roundtrip');ns={'material_digest':material_digest};exec(compile(ast.Module(body=[node],type_ignores=[]),str(path),'exec'),ns);return ns[node.name]
 def fixture(self):
  details={'assignments':{'mesh':[('DATA','wool')]},'material':{'roughness':.8,'links':[('BSDF','BSDF','Output','Surface',False)]}};return {'sha256':material_digest(details),'details':details}
 def test_tuple_list_full_roundtrip(self):
  a=self.fixture();self.assertTrue(self.verifier()(a,json.loads(json.dumps(a))))
 def test_material_value_changed_even_rehashed_rejected(self):
  a=self.fixture();b=copy.deepcopy(a);b['details']['material']['roughness']=.2;b['sha256']=material_digest(b['details'])
  with self.assertRaises(AssertionError):self.verifier()(a,b)
 def test_stored_hash_not_trusted(self):
  a=self.fixture();b=copy.deepcopy(a);b['details']['material']['roughness']=.2
  with self.assertRaises(AssertionError):self.verifier()(a,b)
  a['sha256']='0'*64
  with self.assertRaises(AssertionError):self.verifier()(a,self.fixture())
if __name__=='__main__':unittest.main()
