import hashlib
import json
from pathlib import Path
import subprocess
import tempfile
import unittest
import restore as r

class Replay(unittest.TestCase):
    def setUp(self):
        self.tmp = tempfile.TemporaryDirectory(); self.addCleanup(self.tmp.cleanup)
        self.root = Path(self.tmp.name); self.repo = self.root/'repo'; self.repo.mkdir()
        self.bundle = self.root/'bundle'; self.bundle.mkdir()
        self.git('init', '-q'); self.git('config','user.name','Isolated Test')
        self.git('config','user.email','test@example.invalid')
        (self.repo/'production.txt').write_bytes(b'production')
        self.git('add','.'); self.git('commit','-qm','baseline')
        self.name = r.PREFIXES[0]+'helper.py'; self.data = b'# source\n'
        p=self.bundle/'payload'/self.name;p.parent.mkdir(parents=True);p.write_bytes(self.data)
        self.m={'schemaVersion':1,'baselineCommit':self.git('rev-parse','HEAD').strip(),
                'allowedPrefixes':list(r.PREFIXES),
                'boundInputs':[{'path':'production.txt','sha256':r.digest(b'production')}],
                'entries':[{'originalPath':self.name,'payloadPath':'payload/'+self.name,
                'size':len(self.data),'sha256':r.digest(self.data),'status':'TEST_ONLY'}]}
        self.save()
    def git(self,*args):
        return subprocess.check_output(['git','-C',str(self.repo),*args],text=True,stderr=subprocess.DEVNULL)
    def save(self): (self.bundle/'manifest.json').write_text(json.dumps(self.m))
    def run_restore(self,**kw): return r.restore(self.bundle,self.repo,**kw)
    def test_dry_run(self):
        self.assertEqual(self.run_restore()['wouldCreate'],1);self.assertFalse((self.repo/'backups').exists())
    def test_restore_and_identical_skip(self):
        self.run_restore(apply=True);self.assertEqual(self.run_restore(apply=True)['identicalSkipped'],1)
        self.assertTrue(self.run_restore(check_live=True)['liveSourceComparison'])
    def test_different_existing_refused(self):
        self.run_restore(apply=True);(self.repo/self.name).write_bytes(b'other')
        with self.assertRaisesRegex(ValueError,'overwrite'):self.run_restore(apply=True)
        self.assertEqual((self.repo/self.name).read_bytes(),b'other')
    def test_missing_or_tampered_payload(self):
        p=self.bundle/'payload'/self.name;p.write_bytes(b'tamper')
        with self.assertRaises(ValueError):self.run_restore(apply=True)
        p.unlink()
        with self.assertRaises(ValueError):self.run_restore()
        self.assertFalse((self.repo/'backups').exists())
    def test_path_escape(self):
        for name in [r.PREFIXES[0]+'../bad','/tmp/bad',r.PREFIXES[0]+'a//b',r.PREFIXES[0]+'a\\b']:
            self.m['entries'][0]['originalPath']=name;self.m['entries'][0]['payloadPath']='payload/'+name;self.save()
            with self.assertRaises(ValueError):self.run_restore(apply=True)
    def test_destination_symlink(self):
        (self.repo/'backups').symlink_to(self.root,target_is_directory=True)
        with self.assertRaisesRegex(ValueError,'Symlink'):self.run_restore(apply=True)
    def test_payload_symlink(self):
        p=self.bundle/'payload'/self.name;p.unlink();p.symlink_to(self.repo/'production.txt')
        with self.assertRaisesRegex(ValueError,'Symlink'):self.run_restore()
    def test_root_symlink(self):
        alias=self.root/'alias';alias.symlink_to(self.repo,target_is_directory=True)
        with self.assertRaises(ValueError):r.restore(self.bundle,alias)
    def test_baseline_mismatch(self):
        self.m['baselineCommit']='0'*40;self.save()
        with self.assertRaisesRegex(ValueError,'ancestor'):self.run_restore()
    def test_descendant_docs_commit_allowed(self):
        (self.repo/'notes.md').write_text('later docs');self.git('add','.');self.git('commit','-qm','docs')
        self.run_restore(apply=True)
    def test_bound_input_change(self):
        (self.repo/'production.txt').write_bytes(b'changed')
        with self.assertRaisesRegex(ValueError,'production input'):self.run_restore()
    def test_duplicate_target(self):
        self.m['entries'].append(dict(self.m['entries'][0]));self.save()
        with self.assertRaisesRegex(ValueError,'Duplicate'):self.run_restore()
    def test_live_missing(self):
        with self.assertRaisesRegex(ValueError,'Live source missing'):self.run_restore(check_live=True)
    def test_fail_all_preflight_before_write(self):
        row=dict(self.m['entries'][0]);row['originalPath']=r.PREFIXES[0]+'missing.py';row['payloadPath']='payload/'+row['originalPath'];self.m['entries'].append(row);self.save()
        with self.assertRaises(ValueError):self.run_restore(apply=True)
        self.assertFalse((self.repo/'backups').exists())

if __name__ == '__main__':unittest.main()
