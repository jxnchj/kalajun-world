import unittest,tempfile,pathlib,json,hashlib,os,subprocess
P=pathlib.Path(__file__).resolve().parent
TEXT=(P/'README.md').read_text();CODE=TEXT.split('# REPLAY_GUARD_BEGIN\n')[1].split('# REPLAY_GUARD_END')[0]
NS={'__name__':'test'};exec(CODE,NS)
sha=lambda b:hashlib.sha256(b).hexdigest()
class Guards(unittest.TestCase):
 def setUp(self):
  self.t=tempfile.TemporaryDirectory();self.addCleanup(self.t.cleanup);self.base=pathlib.Path(self.t.name);self.r=self.base/'root';self.p=self.base/'pkg';self.r.mkdir();self.p.mkdir();(self.r/'old').write_bytes(b'old');(self.r/'producer').write_bytes(b'producer');(self.r/'priority').write_bytes(b'priority');(self.p/'candidate.patch').write_bytes(b'patch');self.e={'requiredBeforeSourceReplay':{'old':sha(b'old')}};self.m={'gitBase':'badbase','patchSHA256':sha(b'patch'),'sources':[{'path':'old','beforeSHA256':sha(b'old')},{'path':'new','beforeSHA256':None}],'originalProducer':{'path':'producer','sha256':sha(b'producer')},'unchangedPriorityProducer':{'path':'priority','sha256':sha(b'priority')},'versionedProducer':{'isolatedDestination':'driver'}};os.environ['TERRAIN77_ISOLATED_REPLAY']='YES';self.save()
 def save(self):
  b=json.dumps(self.e).encode();(self.p/'external-inputs.json').write_bytes(b);self.m['externalInputsSHA256']=sha(b);(self.p/'manifest.json').write_text(json.dumps(self.m))
 def check(self):return NS['verify'](self.r,self.p,False)
 def test_valid_readonly(self):self.assertTrue(self.check());self.assertEqual(sorted(x.name for x in self.r.iterdir()),['old','priority','producer'])
 def test_missing(self):(self.r/'old').unlink();self.assertRaises(ValueError,self.check)
 def test_tampered(self):(self.r/'old').write_bytes(b'bad');self.assertRaises(ValueError,self.check)
 def test_repeat_new_source(self):(self.r/'new').write_bytes(b'x');self.assertRaises(ValueError,self.check)
 def test_existing_driver(self):(self.r/'driver').write_bytes(b'x');self.assertRaises(ValueError,self.check)
 def test_patch_tamper(self):(self.p/'candidate.patch').write_bytes(b'x');self.assertRaises(ValueError,self.check)
 def test_manifest_tamper(self):(self.p/'external-inputs.json').write_text('{}');self.assertRaises(ValueError,self.check)
 def test_escape(self):self.e['requiredBeforeSourceReplay']={'../escape':sha(b'x')};self.save();self.assertRaises(ValueError,self.check)
 def test_symlink(self):(self.r/'old').unlink();(self.r/'old').symlink_to(self.r/'producer');self.assertRaises(ValueError,self.check)
 def test_parent_symlink(self):
  (self.base/'link').symlink_to(self.base,target_is_directory=True);self.r=self.base/'link'/'root';self.assertRaises(ValueError,self.check)
 def test_intent(self):os.environ.pop('TERRAIN77_ISOLATED_REPLAY');self.assertRaises(ValueError,self.check)
 def test_git_baseline_refusal(self):
  subprocess.run(['git','init','-q',str(self.r)],check=True);self.assertRaises(subprocess.CalledProcessError,NS['verify'],self.r,self.p,True)
 def test_optimized_before_access(self):
  for opt in ['-O','-OO']:
   a=subprocess.run(['python',opt,'-c',CODE],capture_output=True,text=True,env={**os.environ,'REPLAY':'/missing','PACKAGE':'/missing'});self.assertNotEqual(a.returncode,0);self.assertIn('Optimized Python forbidden',a.stderr);self.assertNotIn('FileNotFoundError',a.stderr)
 def test_driver_optimized_before_access(self):
  block=TEXT.split('```python\n')[2].split('```')[0]
  for opt in ['-O','-OO']:
   a=subprocess.run(['python',opt,'-c',block],capture_output=True,text=True,env={**os.environ,'REPLAY':'/missing','PACKAGE':'/missing'});self.assertNotEqual(a.returncode,0);self.assertIn('Optimized Python forbidden',a.stderr);self.assertNotIn('FileNotFoundError',a.stderr)
 def test_verifier_optimized_before_access(self):
  for opt in ['-O','-OO']:
   a=subprocess.run(['python',opt,str(P/'verify-packaging-v2b.py'),'/missing','/missing','/missing'],capture_output=True,text=True);self.assertNotEqual(a.returncode,0);self.assertIn('-O/-OO forbidden',a.stderr);self.assertNotIn('FileNotFoundError',a.stderr)
 def test_shell_failfast(self):
  marker=self.base/'mustnotexist';a=subprocess.run(['sh','-c',f'set -eu; python -c "raise RuntimeError()"; touch "{marker}"'],capture_output=True);self.assertNotEqual(a.returncode,0);self.assertFalse(marker.exists())
if __name__=='__main__':unittest.main()
