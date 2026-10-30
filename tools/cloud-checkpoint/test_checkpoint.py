import importlib.util
import json
import os
from pathlib import Path
import stat
import subprocess
import tempfile
import unittest
from unittest.mock import patch
import zipfile

spec = importlib.util.spec_from_file_location('checkpoint', Path(__file__).with_name('checkpoint.py'))
cp = importlib.util.module_from_spec(spec)
spec.loader.exec_module(cp)


class CheckpointTests(unittest.TestCase):
    def setUp(self):
        self.tmp = tempfile.TemporaryDirectory()
        self.home = Path(self.tmp.name)
        self.repo = self.home / 'repo'
        self.repo.mkdir()
        self.git('init', '-q')
        self.git('config', 'user.name', 'Checkpoint Test')
        self.git('config', 'user.email', 'checkpoint@example.invalid')
        (self.repo / 'source.txt').write_text('base\n')
        (self.repo / 'asset.glb').write_text('version https://git-lfs.github.com/spec/v1\noid sha256:' + 'a' * 64 + '\nsize 123\n')
        self.git('add', '.')
        self.git('commit', '-qm', 'base')
        self.ref = self.git('rev-parse', 'HEAD').strip()
        (self.repo / 'source.txt').write_text('changed 中文\n')
        self.status = {'status': 'partial', 'unfinished_tasks': ['Browser acceptance'],
                       'passed': ['Unit tests'], 'failed': ['Known terrain budget'],
                       'not_run': ['Full suite'], 'pending_acceptance': ['Visual candidate']}
        self.out = self.home / 'checkpoint.zip'

    def tearDown(self):
        self.tmp.cleanup()

    def git(self, *args):
        return subprocess.check_output(['git', '-C', str(self.repo), *args], stderr=subprocess.DEVNULL).decode()

    def pack(self, names=None, ref=None, out=None):
        return cp.pack(self.repo, ref or self.ref, names or ['source.txt'], self.status, out or self.out)

    def rewrite(self, transform):
        entries = []
        with zipfile.ZipFile(self.out) as z:
            for info in z.infolist():
                entries.append((info.filename, z.read(info), info.external_attr >> 16 & 0o777))
        entries = transform(entries)
        with zipfile.ZipFile(self.out, 'w') as z:
            for name, data, mode in entries:
                cp.put(z, name, data, mode)

    def test_roundtrip_manifest_and_exact_bytes(self):
        result = self.pack()
        restore = self.home / 'restored'
        m = cp.verify(self.out, self.repo, restore)
        self.assertEqual(m['baseline']['commit'], self.ref)
        self.assertEqual(m['validation'], self.status)
        self.assertEqual(m['baseline']['lfs_dependencies'], [{'path': 'asset.glb', 'oid_sha256': 'a' * 64, 'size': 123}])
        self.assertEqual((restore / 'source.txt').read_bytes(), (self.repo / 'source.txt').read_bytes())
        self.assertEqual(result['sha256'], cp.sha(self.out.read_bytes()))
        self.assertEqual(set(p.name for p in restore.iterdir()), {'source.txt', cp.MANIFEST})

    def test_deterministic_zip(self):
        self.pack()
        second = self.home / 'second.zip'
        self.pack(out=second)
        self.assertEqual(self.out.read_bytes(), second.read_bytes())

    def test_preserves_existing_checkpoint(self):
        self.out.write_bytes(b'previous')
        with self.assertRaises(ValueError):
            self.pack()
        self.assertEqual(self.out.read_bytes(), b'previous')

    def test_reject_unknown_baseline_and_missing_file(self):
        for kwargs in ({'ref': 'not-a-ref'}, {'names': ['missing.txt']}):
            with self.subTest(kwargs=kwargs), self.assertRaises((ValueError, OSError)):
                self.pack(**kwargs)
            self.assertFalse(self.out.exists())

    def test_reject_noncanonical_and_reserved_names(self):
        for name in ('../x', '/x', './x', 'a//x', 'a/../x', 'a\\x', 'C:/x', '', cp.MANIFEST):
            with self.subTest(name=name), self.assertRaises(ValueError):
                cp.canonical(name)

    def test_reject_sensitive_and_temporary_paths(self):
        for name in ('.git/config', 'a/.env', '.env.production', '.aws/credentials',
                     'cache/a', 'node_modules/x', '.ssh/id_rsa', 'a/key.pem',
                     'chrome-profile-01/x', 'browser-profile/Cookies', 'a/.npmrc',
                     '.config/chromium/Default/file', 'profiles/a', 'a/module.pyc'):
            with self.subTest(name=name), self.assertRaises(ValueError):
                cp.canonical(name)

    def test_reject_directory_symlink_and_fifo(self):
        (self.repo / 'folder').mkdir()
        (self.repo / 'link').symlink_to(self.repo / 'source.txt')
        (self.repo / 'dirlink').symlink_to(self.repo, target_is_directory=True)
        os.mkfifo(self.repo / 'fifo')
        for name in ('folder', 'link', 'dirlink/source.txt', 'fifo'):
            with self.subTest(name=name), self.assertRaises(ValueError):
                self.pack(names=[name])

    def test_duplicate_and_empty_allowlists_rejected(self):
        for names in ([], ['source.txt', 'source.txt']):
            with self.assertRaises(ValueError):
                cp.pack(self.repo, self.ref, names, self.status, self.out)

    def test_status_is_explicit_and_strict(self):
        for value in ({}, {'status': 'complete'}, {**self.status, 'extra': 'x'},
                      {**self.status, 'unfinished_tasks': 'none'}):
            with self.assertRaises(ValueError):
                cp.status_record(value)

    def test_interpass_change_rejected_and_temp_removed(self):
        original = cp.stable_read
        calls = 0
        def changed(root, name):
            nonlocal calls
            calls += 1
            if calls == 2:
                (self.repo / 'source.txt').write_text('mutated')
            return original(root, name)
        with patch.object(cp, 'stable_read', changed), self.assertRaises(ValueError):
            self.pack()
        self.assertFalse(self.out.exists())
        self.assertFalse(list(self.home.glob('.checkpoint-*')))

    def test_final_pass_change_rejected(self):
        original = cp.stable_read
        calls = 0
        def changed(root, name):
            nonlocal calls
            calls += 1
            if calls == 3:
                (self.repo / 'source.txt').write_text('mutated after ZIP write')
            return original(root, name)
        with patch.object(cp, 'stable_read', changed), self.assertRaises(ValueError):
            self.pack()
        self.assertFalse(self.out.exists())

    def test_tampered_file_rejected_before_extraction(self):
        self.pack()
        self.rewrite(lambda es: [(n, b'tampered' if n == 'source.txt' else d, m) for n, d, m in es])
        dest = self.home / 'restore'
        with self.assertRaises(ValueError):
            cp.verify(self.out, self.repo, dest)
        self.assertFalse(dest.exists())

    def test_extra_missing_and_duplicate_entries_rejected(self):
        transforms = [lambda es: es + [('extra.txt', b'x', 0o644)],
                      lambda es: [x for x in es if x[0] != 'source.txt'],
                      lambda es: es + [es[0]]]
        for index, change in enumerate(transforms):
            out = self.home / ('input-' + str(index) + '.zip')
            self.pack(out=out)
            self.out = out
            self.rewrite(change)
            with self.subTest(index=index), self.assertRaises(ValueError):
                cp.verify(self.out, self.repo)

    def test_path_traversal_archive_rejected(self):
        self.pack()
        self.rewrite(lambda es: es + [('../escape', b'x', 0o644)])
        with self.assertRaises(ValueError):
            cp.verify(self.out, self.repo)

    def test_archive_symlink_rejected(self):
        self.pack()
        with zipfile.ZipFile(self.out, 'a') as z:
            info = zipfile.ZipInfo('link')
            info.create_system = 3
            info.external_attr = (stat.S_IFLNK | 0o777) << 16
            z.writestr(info, '../outside')
        with self.assertRaises(ValueError):
            cp.verify(self.out, self.repo)

    def test_existing_extraction_directory_never_overwritten(self):
        self.pack()
        dest = self.home / 'existing'
        dest.mkdir()
        (dest / 'source.txt').write_text('do not overwrite')
        with self.assertRaises(ValueError):
            cp.verify(self.out, self.repo, dest)
        self.assertEqual((dest / 'source.txt').read_text(), 'do not overwrite')

    def test_baseline_tree_tampering_rejected(self):
        self.pack()
        def change(es):
            result = []
            for n, d, mode in es:
                if n == cp.MANIFEST:
                    m = json.loads(d)
                    m['baseline']['tree'] = '0' * 40
                    d = cp.json_bytes(m)
                result.append((n, d, mode))
            return result
        self.rewrite(change)
        with self.assertRaises(ValueError):
            cp.verify(self.out, self.repo)

    def test_executable_mode_restored(self):
        (self.repo / 'source.txt').chmod(0o755)
        self.pack()
        dest = self.home / 'restored'
        cp.verify(self.out, self.repo, dest)
        self.assertEqual((dest / 'source.txt').stat().st_mode & 0o777, 0o755)


if __name__ == '__main__':
    unittest.main()
