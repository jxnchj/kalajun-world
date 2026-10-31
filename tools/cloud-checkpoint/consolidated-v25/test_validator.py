import unittest,tempfile,zipfile,hashlib,stat,json,copy,subprocess,sys,os
from pathlib import Path
from validator import *
def synthetic_schema():
 # Deliberately fake public fixture identities. No real account or archive metadata.
 rows=[];index={}
 for n in range(54):
  name=f'input/{n}.txt';data=str(n).encode();digest=hashlib.sha256(data).hexdigest();index[name]={'sha256':digest,'bytes':len(data)}
  rows.append({'originalPath':name,'destination':'candidate-store/'+name,'role':'candidate','sha256':digest,'bytes':len(data),'automaticOverlay':False,'occurrences':[{'source':'synthetic','entry':name}]})
 rows[0]['role']='history';rows[0]['destination']='historical-context/input/0.txt'
 gitrow={'path':'docs/example.md','bytes':3,'sha256':hashlib.sha256(b'abc').hexdigest(),'gitBlob':'1'*40}
 rows.append({'originalPath':gitrow['path'],'destination':'current-git/'+gitrow['path'],'role':'current-git','sha256':gitrow['sha256'],'bytes':3,'gitBlob':gitrow['gitBlob'],'automaticOverlay':False,'occurrences':[{'source':'current-git','entry':gitrow['path']}]})
 sources=[{'key':'synthetic','sha256':'2'*64,'manifestSHA256':'3'*64,'receiptSHA256':'4'*64,'libraryFileID':'libfile_SYNTHETIC_ONLY','backingFileID':'file_SYNTHETIC_ONLY','version':0,'entryIndex':index}]
 bound=[{'archivePath':r['originalPath'],'sha256':r['sha256']}for r in rows[:-1]]
 recipes=[{'status':'NOT_EXECUTED','automaticAdoption':False},{'status':'NOT_EXECUTED','automaticAdoption':False,'exactMetadata':{'sourceOverlay':bound[:20],'prepared12':bound[20:32]},'candidateInputs22':bound[32:54]}]
 m={'schema':'kalajun-consolidated-v25/1','production':{'commit':'5'*40,'candidateDefault':'OFF'},'primary':{'libraryFileID':'libfile_SYNTHETIC_PRIMARY','expectedCurrentVersion':24,'newVersion':None},'sourceArchives':sources,'variants':rows,'recipes':recipes}
 anchor={'productionCommit':m['production']['commit'],'primaryLibraryID':m['primary']['libraryFileID'],'variantBindings':rows,'recipes':recipes,'sourceArchives':sources,'gitTexts':[gitrow]}
 return m,anchor

class GuardTests(unittest.TestCase):
 def setUp(self):
  self.schema,self.anchor=synthetic_schema();self.temp=tempfile.TemporaryDirectory();self.addCleanup(self.temp.cleanup)
  self.anchor_path=Path(self.temp.name)/'anchor.json';raw=json.dumps(self.anchor,sort_keys=True).encode();self.anchor_path.write_bytes(raw);self.pin=hashlib.sha256(raw).hexdigest()
 def validate(self,m,**kw):
  return validate_schema(m,expected_anchor_sha=self.pin,anchor_path=kw.get('anchor_path',self.anchor_path))
 def test_paths(self):
  for x in ['/abs','../x','a/../x','a//b','a/./b','a\\b','C:x','a\x00b']:
   with self.subTest(x=x),self.assertRaises(ValueError):pathkey(x)
 def test_collisions(self):
  for a,b in [('a','a'),('A','a'),('é','e\u0301'),('a','a/b')]:
   with self.subTest(a=a),self.assertRaises(ValueError):destinations([{'destination':a},{'destination':b}])
 def fixture(self,kind='ok'):
  td=tempfile.TemporaryDirectory();root=Path(td.name);z=root/'t.zip';data=b'abc';n='payload/a';row={'destination':n,'bytes':3,'sha256':hashlib.sha256(data).hexdigest()}
  with zipfile.ZipFile(z,'w') as f:
   i=zipfile.ZipInfo(n);i.external_attr=(stat.S_IFLNK|0o777)<<16 if kind=='symlink' else (stat.S_IFREG|0o600)<<16
   if kind=='extra':i.extra=b'\x01\x00\x00\x00'
   f.writestr(i,data)
   if kind=='duplicate':f.writestr(n,data)
  return td,root,z,row
 def test_roundtrip(self):
  td,r,z,row=self.fixture()
  with td:self.assertTrue(verify_extract(z,[row],r/'out'));self.assertEqual((r/'out/payload/a').read_bytes(),b'abc')
 def test_nonregular_extra_duplicate(self):
  for k in ['symlink','extra','duplicate']:
   td,r,z,row=self.fixture(k)
   with td,self.subTest(k=k):
    with self.assertRaises(ValueError):verify_extract(z,[row],r/'out')
    self.assertFalse((r/'out').exists())
 def test_bad_hash_size(self):
  for k in ['sha256','bytes']:
   td,r,z,row=self.fixture();row[k]='0'*64 if k=='sha256' else 4
   with td,self.subTest(k=k):
    with self.assertRaises(ValueError):verify_extract(z,[row],r/'out')
    if k=='sha256': self.assertTrue((r/'out/payload/a').exists())  # failed streamed hash may retain partial output
    else: self.assertFalse((r/'out').exists())
 def test_symlink_parent(self):
  td,r,z,row=self.fixture()
  with td:
   (r/'real').mkdir();(r/'link').symlink_to(r/'real',target_is_directory=True)
   with self.assertRaises(ValueError):verify_extract(z,[row],r/'link/out')
   self.assertFalse((r/'real/out').exists())
 def test_existing_target(self):
  td,r,z,row=self.fixture()
  with td:
   (r/'out').mkdir()
   with self.assertRaises(ValueError):verify_extract(z,[row],r/'out')
 def test_schema_and_negative_gates(self):
  m=copy.deepcopy(self.schema);self.assertTrue(self.validate(m))
  for change in ['identity','version','adopt','history','source','size']:
   d=copy.deepcopy(m)
   if change=='identity':d['sourceArchives'][0]['sha256']='bad'
   if change=='version':d['primary']['newVersion']=25
   if change=='adopt':d['variants'][0]['automaticOverlay']=True
   if change=='history':d['variants'][0]['role']='history';d['variants'][0]['destination']='current-git/bad'
   if change=='source':d['variants'][0]['occurrences'][0]['source']='unknown'
   if change=='size':d['variants'][0]['bytes']=2**40
   with self.subTest(change=change),self.assertRaises(ValueError):self.validate(d)
 def test_reverse_and_trusted_git(self):
  m=copy.deepcopy(self.schema)
  for kind in ['drop-history','drop-git','commit','gitentry','gitsha','source-drop']:
   d=copy.deepcopy(m)
   if kind=='drop-history':d['variants'].pop(0)
   if kind=='drop-git':d['variants'].pop()
   if kind=='commit':d['production']['commit']='0'*40
   if kind=='gitentry':d['variants'][-1]['occurrences'][0]['entry']='wrong.txt'
   if kind=='gitsha':d['variants'][-1]['sha256']='0'*64
   if kind=='source-drop':d['sourceArchives'].pop()
   with self.subTest(kind=kind),self.assertRaises(ValueError):self.validate(d)
 def test_anchor_pin_required_and_tamper(self):
  m=copy.deepcopy(self.schema)
  with self.assertRaises(ValueError):validate_schema(m)
  with tempfile.TemporaryDirectory() as td:
   p=Path(td)/'anchor.json';a=copy.deepcopy(self.anchor);a['productionCommit']='0'*40;m['production']['commit']='0'*40;p.write_text(json.dumps(a))
   with self.assertRaises(ValueError):self.validate(m,anchor_path=p)
 def test_caps(self):
  old=dict(LIMITS)
  try:
   for key,val in [('entries',0),('fileBytes',2),('totalBytes',2),('ratio',0)]:
    LIMITS.update(old);LIMITS[key]=val;td,r,z,row=self.fixture()
    with td,self.subTest(key=key),self.assertRaises(ValueError):verify_extract(z,[row],r/'out')
  finally:LIMITS.update(old)
 def test_optimized_python_refuses_before_side_effects(self):
  module=Path(__file__).with_name('validator.py').resolve()
  for flag in ['-O','-OO']:
   with tempfile.TemporaryDirectory() as td:
    marker=Path(td)/'should-not-exist'
    code="import runpy,pathlib;runpy.run_path(%r);pathlib.Path(%r).write_bytes(b'bad')"%(str(module),str(marker))
    env=dict(os.environ,PYTHONDONTWRITEBYTECODE='1')
    result=subprocess.run([sys.executable,flag,'-c',code],capture_output=True,env=env)
    self.assertNotEqual(result.returncode,0);self.assertIn(b'Optimized Python',result.stderr);self.assertFalse(marker.exists());self.assertEqual(list(Path(td).iterdir()),[])
if __name__=='__main__':unittest.main()
