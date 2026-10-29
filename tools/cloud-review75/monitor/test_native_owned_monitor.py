#!/usr/bin/env python3
"""Fast synthetic-only tests. This file never invokes Chromium."""
import dataclasses
import json
import os
from pathlib import Path
import signal
import subprocess
import sys
import tempfile
import time
import unittest
from unittest.mock import patch

import native_owned_monitor as m

HERE = Path(__file__).resolve().parent
LAUNCHER = HERE.parent / 'launch-native.sh'


def proc(pid, *, ppid=1, pgid=100, sid=100, ticks=10, rss=12, state='S', uid=1000):
    return m.Proc(pid, ppid, pgid, sid, ticks, rss, state, uid)


class ParsingTests(unittest.TestCase):
    def test_stat_tricky_comm(self):
        fields = ['S', '1', '100', '100'] + ['0'] * 15 + ['123456', '900000', '7']
        parsed = m.parse_stat(b'100 (strange ) name\n) ' + ' '.join(fields).encode(), 1000, 4096)
        self.assertEqual((parsed.pid, parsed.ppid, parsed.pgid, parsed.sid, parsed.start_ticks,
                          parsed.rss_kib), (100, 1, 100, 100, 123456, 28))

    def test_stat_rejects_short(self):
        with self.assertRaises(ValueError):
            m.parse_stat(b'3 (name) S 1', 1000)

    def test_memory_units(self):
        self.assertEqual(m.memory_available('MemAvailable: 4394532 kB\n'), 4_500_000_768)
        for invalid in ('MemFree: 100 kB', 'MemAvailable: 12 bytes', 'MemAvailable: -1 kB',
                        'MemAvailable: 1 kB\nMemAvailable: 2 kB'):
            with self.assertRaises(ValueError):
                m.memory_available(invalid)

    def test_loopback(self):
        for valid in ('http://127.0.0.1:5175/preflight.html', 'http://[::1]:5174/v2.html?a=1&b=2'):
            self.assertEqual(m.loopback_url(valid), valid)
        for bad in ('https://127.0.0.1:8/a', 'http://127.0.0.1/a', 'http://example.com:8/a',
                    'http://127.0.0.1:8@evil.com/a', 'http://127.0.0.1:8/a#x',
                    'http://127.0.0.1:8/a\n', 'http://localhost:8/a', 'http://127.0.0.1:99999/a'):
            with self.assertRaises(m.argparse.ArgumentTypeError):
                m.loopback_url(bad)

    def test_window(self):
        self.assertEqual(m.window_size('1288,891'), '1288,891')
        for bad in ('1288x891', '1,1', '1288,891,1', 'nan,800', '--no-sandbox'):
            with self.assertRaises(m.argparse.ArgumentTypeError):
                m.window_size(bad)

    def test_exact_browser_flags(self):
        command = m.browser_argv('/usr/bin/chromium', Path('/tmp/owned/profile'),
                                 'http://127.0.0.1:5175/preflight.html', '1288,891')
        self.assertEqual(command[2:-2], ['--use-gl=angle', '--use-angle=swiftshader',
                         '--gpu-watchdog-timeout-seconds=180', '--force-device-scale-factor=1',
                         '--window-size=1288,891'])
        self.assertEqual(len(command), 9)

    def test_full_world_cpu_compositing_adds_only_one_flag(self):
        values = ('/usr/bin/chromium', Path('/tmp/owned/profile'),
                  'http://127.0.0.1:5175/webgl-preflight.html', '1288,891')
        default = m.browser_argv(*values)
        opted_in = m.browser_argv(*values, full_world_cpu_compositing=True)
        self.assertEqual(opted_in, default[:-2] + ['--disable-gpu-compositing'] + default[-2:])
        self.assertNotIn('--disable-gpu', opted_in)
        self.assertNotIn('--disable-gpu-watchdog', opted_in)

    def test_full_world_cpu_compositing_parser_is_explicit_opt_in(self):
        values = ['--run-dir', '/tmp/new-run', '--url', 'http://127.0.0.1:5175/webgl-preflight.html']
        self.assertFalse(m.parser().parse_args(values).full_world_cpu_compositing)
        self.assertTrue(m.parser().parse_args(values + ['--full-world-cpu-compositing']).full_world_cpu_compositing)

    def test_fresh_path_no_reuse(self):
        with tempfile.TemporaryDirectory(dir=HERE) as folder:
            parent = Path(folder)
            self.assertEqual(m.fresh_run_path(str(parent / 'new')), parent / 'new')
            for bad in (str(parent), 'relative/run', str(parent / 'missing' / 'run')):
                with self.assertRaises(ValueError):
                    m.fresh_run_path(bad)
            (parent / 'link').symlink_to(parent, target_is_directory=True)
            with self.assertRaises(ValueError):
                m.fresh_run_path(str(parent / 'link' / 'new'))

    def test_roots_are_checkout_relative_or_tmp(self):
        self.assertEqual(m.WRITABLE_ROOTS, (Path('/tmp'), HERE.parents[2]))
        with self.assertRaises(ValueError):
            m.fresh_run_path('/var/kalajun-new-profile')

    def test_cmdline_raw_nul_and_flattened(self):
        for raw, expected in ((b'chrome\0--x=a b\0', 'nul-delimited'),
                              (b'chrome --x=a b', 'flattened-or-single-argument-or-empty')):
            with patch.object(Path, 'read_bytes', return_value=raw):
                result = m.raw_cmdline(100)
            self.assertEqual(m.base64.b64decode(result['raw_base64']), raw)
            self.assertEqual(result['representation'], expected)
            self.assertFalse(result['used_for_ownership'])


class MinimalLauncherTests(unittest.TestCase):
    """The fake executable only prints argv; these tests never invoke Chromium."""
    def run_launcher(self, folder, profile, url):
        fake = folder / 'chromium'
        fake.write_text('#!/bin/sh\nprintf "%s\\n" "$@"\n')
        fake.chmod(0o700)
        return subprocess.run(['bash', str(LAUNCHER), str(profile), url],
                              env={**os.environ, 'PATH': str(folder) + os.pathsep + os.environ['PATH']},
                              capture_output=True, text=True, timeout=5)

    def test_valid_loopback_keeps_exact_minimal_flags(self):
        with tempfile.TemporaryDirectory(dir=HERE) as folder:
            folder = Path(folder)
            for index, url in enumerate(('http://127.0.0.1:5175/preflight.html',
                                         'http://[::1]:5175/preflight.html?a=1')):
                profile = folder / f'profile-{index}'
                result = self.run_launcher(folder, profile, url)
                self.assertEqual(result.returncode, 0, result.stderr)
                self.assertEqual(result.stdout.splitlines(), ['--user-data-dir=' + str(profile),
                                 '--use-gl=angle', '--use-angle=swiftshader', '--new-window', url])
                self.assertEqual(profile.stat().st_mode & 0o777, 0o700)

    def test_bad_url_never_creates_profile_or_reaches_executable(self):
        with tempfile.TemporaryDirectory(dir=HERE) as folder:
            folder = Path(folder)
            for url in ('http://127.0.0.1:5175@evil.example/path', 'http://127.0.0.1/path',
                        'http://127.0.0.1:99999/path', 'http://localhost:5175/path',
                        'http://127.0.0.1:5175/path#fragment', 'http://127.0.0.1:5175/path\n',
                        'http://127.0.0.1:5175\\@evil.example/path'):
                profile = folder / 'rejected-profile'
                result = self.run_launcher(folder, profile, url)
                self.assertEqual(result.returncode, 2, result.stderr)
                self.assertEqual(result.stdout, '')
                self.assertFalse(profile.exists())

    def test_reused_symlink_and_dotdot_paths_are_rejected(self):
        with tempfile.TemporaryDirectory(dir=HERE) as folder:
            folder = Path(folder)
            existing = folder / 'existing'
            existing.mkdir()
            link = folder / 'linked'
            link.symlink_to(existing, target_is_directory=True)
            for profile in (existing, link, link / 'new', existing / '..' / 'new',
                            folder / 'missing' / 'new', Path('relative/profile')):
                result = self.run_launcher(folder, profile, 'http://127.0.0.1:5175/preflight.html')
                self.assertEqual(result.returncode, 2, result.stderr)
                self.assertEqual(result.stdout, '')
            self.assertFalse((existing / 'new').exists())
            self.assertFalse((folder / 'new').exists())


class OwnershipTests(unittest.TestCase):
    def setUp(self):
        self.root = proc(100)
        self.tracker = m.Tracker(self.root)

    def test_group_and_detached_observed_descendant(self):
        child = proc(101, ppid=100, ticks=11)
        detached = proc(102, ppid=101, pgid=102, sid=102, ticks=12)
        unrelated = proc(900, pgid=900, sid=900)
        table = {p.pid: p for p in (self.root, child, detached, unrelated)}
        self.assertEqual([p.pid for p in self.tracker.observe(table, table.get)], [100, 101, 102])
        self.assertEqual(self.tracker.reasons[detached.identity], 'observed-descendant')
        orphan = dataclasses.replace(detached, ppid=1)
        self.assertEqual(self.tracker.observe({102: orphan}, {102: orphan}.get), [orphan])

    def test_reused_group_no_anchor_not_adopted(self):
        reused = proc(100, ticks=999)
        stranger = proc(101, ppid=100, ticks=1000)
        table = {100: reused, 101: stranger}
        self.assertEqual(self.tracker.observe(table, table.get), [])

    def test_wrong_uid_and_older_birth_not_adopted(self):
        table = {100: self.root, 101: proc(101, uid=999), 102: proc(102, ticks=1)}
        self.assertEqual(self.tracker.observe(table, table.get), [self.root])

    def test_revalidation_failure_fail_closed(self):
        table = {100: self.root, 101: proc(101, ticks=11)}
        self.assertEqual(self.tracker.observe(table, lambda _pid: None), [self.root])

    def test_zombie_root_can_anchor_unreaped_group(self):
        root = dataclasses.replace(self.root, state='Z')
        child = proc(101, ppid=1, ticks=11)
        table = {100: root, 101: child}
        self.assertEqual(self.tracker.observe(table, table.get), [root, child])

    def test_pidfd_mismatch_never_signals(self):
        with patch.object(os, 'pidfd_open', return_value=42), patch.object(os, 'close') as close, \
                patch.object(signal, 'pidfd_send_signal') as send:
            status = m.signal_verified(self.root, signal.SIGTERM,
                                       reader=lambda _: dataclasses.replace(self.root, start_ticks=999))
        self.assertIn('identity-mismatch', status)
        send.assert_not_called()
        close.assert_called_once_with(42)


class SyntheticProcessTests(unittest.TestCase):
    def run_case(self, *, cap, cancelled=False, root_code=None):
        with tempfile.TemporaryDirectory(dir=HERE) as folder:
            folder = Path(folder)
            if root_code is None:
                root_code = ('import subprocess,sys,time; '
                             'subprocess.Popen([sys.executable,"-c","import time; time.sleep(20)"]); '
                             'time.sleep(20)')
            child = subprocess.Popen([sys.executable, '-c', root_code], start_new_session=True,
                                     stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
            root = m.read_proc(child.pid)
            journal = m.Journal(folder / 'events.jsonl')
            tracker = m.Tracker(root)
            try:
                # Let the lightweight Python child spawn, without launching any browser.
                time.sleep(0.12)
                began = time.monotonic()
                result = m.monitor(child, root, journal, total_deadline=began + 1.1,
                                   poll_seconds=0.05, cleanup_seconds=0.55, rss_cap_kib=cap,
                                   cancel_requested=lambda: cancelled, cancel_file=folder / 'CANCEL',
                                   tracker=tracker)
                self.assertLess(time.monotonic() - began, 1.5)
                self.assertTrue(result['no_live_observed_owned_at_final_snapshot'])
                self.assertFalse(result['all_browser_descendants_proven_absent'])
                records = [json.loads(s) for s in (folder / 'events.jsonl').read_text().splitlines()]
                return result, records
            finally:
                m.emergency_cleanup(tracker, time.monotonic() + 0.5, 0.05)
                child.wait(timeout=1)
                journal.close()

    def test_rss_cap_cleans_only_owned_tree(self):
        outsider = subprocess.Popen([sys.executable, '-c', 'import time; time.sleep(10)'], start_new_session=True)
        identity = m.read_proc(outsider.pid)
        try:
            result, records = self.run_case(cap=1)
            self.assertEqual(result['reason'], 'rss-cap')
            self.assertGreaterEqual(len([r for r in records if r['event'] == 'ownership_observed']), 2)
            self.assertIsNone(outsider.poll(), 'unrelated synthetic process must not be signaled')
        finally:
            m.signal_verified(identity, signal.SIGKILL)
            outsider.wait(timeout=1)

    def test_deadline(self):
        result, _ = self.run_case(cap=m.MAX_RSS_KIB)
        self.assertEqual(result['reason'], 'deadline')

    def test_cancel_escalates_term_ignoring_child(self):
        result, records = self.run_case(cap=m.MAX_RSS_KIB, cancelled=True,
                                       root_code='import signal,time; signal.signal(signal.SIGTERM, signal.SIG_IGN); time.sleep(20)')
        self.assertEqual(result['reason'], 'cancelled')
        self.assertTrue(any(r['event'] == 'signal' and r['signal'] == signal.SIGKILL for r in records))


if __name__ == '__main__':
    unittest.main(verbosity=2)
