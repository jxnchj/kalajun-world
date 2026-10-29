#!/usr/bin/env python3
"""Fast synthetic-only tests. This file never invokes Chromium."""
import dataclasses
import io
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


class MemoryTierTests(unittest.TestCase):
    def test_default_standard_limits_are_unchanged(self):
        args = m.parser().parse_args(['--run-dir', '/tmp/new', '--url', 'http://127.0.0.1:5175/a'])
        self.assertEqual(args.memory_tier, 'standard')
        self.assertEqual(m.memory_limits(args.memory_tier, args.rss_cap_kib),
                         (2_097_152, 4_500_000_000, None))

    def test_large_scene_is_explicit_and_cannot_auto_raise(self):
        self.assertEqual(m.memory_limits('large-scene', None), (3_145_728, 7_000_000_000, 4_500_000_000))
        for tier, maximum in (('standard', 2_097_152), ('large-scene', 3_145_728)):
            self.assertEqual(m.memory_limits(tier, maximum)[0], maximum)
            self.assertEqual(m.memory_limits(tier, 1)[0], 1)
            for invalid in (0, -1, maximum + 1):
                with self.assertRaises(ValueError):
                    m.memory_limits(tier, invalid)
        with self.assertRaises(ValueError):
            m.memory_limits('larger', None)

    def test_software_world_is_explicit_and_four_gib_is_absolute_tier_ceiling(self):
        self.assertEqual(m.memory_limits('software-world', None), (4_194_304, 8_000_000_000, 4_500_000_000))
        self.assertEqual(m.memory_limits('software-world', 1)[0], 1)
        self.assertEqual(m.memory_limits('software-world', 4_194_304)[0], 4_194_304)
        for invalid in (0, -1, 4_194_305, 8_388_608):
            with self.assertRaises(ValueError):
                m.memory_limits('software-world', invalid)
        values = ['--run-dir', '/tmp/new', '--url', 'http://127.0.0.1:5175/a']
        self.assertEqual(m.parser().parse_args(values).memory_tier, 'standard')
        self.assertEqual(m.parser().parse_args(values + ['--memory-tier', 'software-world']).memory_tier, 'software-world')
        with patch.object(sys, 'stderr', new_callable=io.StringIO), self.assertRaises(SystemExit):
            m.parser().parse_args(values + ['--memory-tier', 'unbounded'])

    def test_software_world_prestart_and_immediate_prelaunch_require_eight_gb(self):
        for available, expected_code, directory_created in (
                ([7_999_999_999], 2, False), ([8_000_000_000, 7_999_999_999], 3, True)):
            with self.subTest(available=available), tempfile.TemporaryDirectory(dir=HERE) as folder:
                run, code, launch = self.guarded_main(folder, 'software-world', available)
                self.assertEqual(code, expected_code)
                self.assertEqual(run.exists(), directory_created)
                launch.assert_not_called()

    def guarded_main(self, folder, tier, available):
        """Fake all launch environment gates; Popen always raises, never starts a browser."""
        run = Path(folder) / 'new-run'
        with patch.object(m.os, 'geteuid', return_value=1000), \
                patch.dict(m.os.environ, {'DISPLAY': ':test'}), \
                patch.object(m, 'memory_available', side_effect=available), \
                patch.object(m.shutil, 'which', return_value='/fake/chromium'), \
                patch.object(m.subprocess, 'Popen', side_effect=RuntimeError('synthetic-launch-sentinel')) as launch, \
                patch.object(sys, 'stderr', new_callable=io.StringIO):
            try:
                code = m.main(['--run-dir', str(run), '--url', 'http://127.0.0.1:5175/a', '--memory-tier', tier])
            except SystemExit as exc:
                code = exc.code
        return run, code, launch

    def test_large_scene_prestart_rejects_below_seven_gb_before_files_or_launch(self):
        with tempfile.TemporaryDirectory(dir=HERE) as folder:
            run, code, launch = self.guarded_main(folder, 'large-scene', [6_999_999_999])
            self.assertEqual(code, 2)
            self.assertFalse(run.exists())
            launch.assert_not_called()

    def test_large_scene_immediate_prelaunch_rechecks_seven_gb(self):
        with tempfile.TemporaryDirectory(dir=HERE) as folder:
            run, code, launch = self.guarded_main(folder, 'large-scene', [7_000_000_000, 6_999_999_999])
            self.assertEqual(code, 3)
            launch.assert_not_called()
            events = [json.loads(line) for line in (run / 'events.jsonl').read_text().splitlines()]
            self.assertEqual(events[-1]['event'], 'launch_prevented')
            self.assertEqual(events[-1]['current_mem_available_bytes'], 6_999_999_999)

    def test_tier_prestart_boundary_and_recorded_limits(self):
        for tier, minimum in (('standard', 4_500_000_000), ('large-scene', 7_000_000_000),
                              ('software-world', 8_000_000_000)):
            with self.subTest(tier=tier), tempfile.TemporaryDirectory(dir=HERE) as folder:
                run, code, launch = self.guarded_main(folder, tier, [minimum, minimum])
                self.assertEqual(code, 3, 'synthetic launch sentinel, not a real launch')
                launch.assert_called_once()
                record = json.loads((run / 'launch.json').read_text())
                cap, prestart, floor = m.memory_limits(tier, None)
                self.assertEqual((record['rss_cap_kib'], record['minimum_prestart_mem_available_bytes'],
                                  record['minimum_runtime_available_bytes']), (cap, prestart, floor))


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
    def run_case(self, *, cap, cancelled=False, root_code=None, runtime_floor=None,
                 available=8_000_000_000, forced_root_rss=None):
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
                real_table = m.process_table
                def sample_table():
                    table, errors = real_table()
                    if forced_root_rss is not None and root.pid in table:
                        table[root.pid] = dataclasses.replace(table[root.pid], rss_kib=forced_root_rss)
                    return table, errors
                with patch.object(m, 'process_table', side_effect=sample_table), \
                        patch.object(m, 'memory_available', side_effect=ValueError('synthetic missing')
                                     if available is None else None, return_value=available):
                    result = m.monitor(child, root, journal, total_deadline=began + 1.1,
                                       poll_seconds=0.05, cleanup_seconds=0.55, rss_cap_kib=cap,
                                       cancel_requested=lambda: cancelled, cancel_file=folder / 'CANCEL',
                                       tracker=tracker, minimum_runtime_available_bytes=runtime_floor)
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

    def test_large_scene_three_gib_sample_stops_and_cleans(self):
        result, _ = self.run_case(cap=m.LARGE_SCENE_MAX_RSS_KIB,
                                 forced_root_rss=m.LARGE_SCENE_MAX_RSS_KIB,
                                 runtime_floor=m.MIN_AVAILABLE_BYTES)
        self.assertEqual(result['reason'], 'rss-cap')

    def test_software_world_four_gib_sample_stops_and_cleans(self):
        cap, _, floor = m.memory_limits('software-world', None)
        result, _ = self.run_case(cap=cap, forced_root_rss=cap, runtime_floor=floor)
        self.assertEqual(result['reason'], 'rss-cap')

    def test_software_world_runtime_floor_and_missing_observation_fail_closed(self):
        cap, _, floor = m.memory_limits('software-world', None)
        for available, reason in ((4_499_999_999, 'system-memory-floor'),
                                  (None, 'system-memory-observation-error')):
            with self.subTest(available=available):
                result, _ = self.run_case(cap=cap, runtime_floor=floor, available=available)
                self.assertEqual(result['reason'], reason)

    def test_large_scene_runtime_floor_and_missing_observation_fail_closed(self):
        for available, reason in ((4_499_999_999, 'system-memory-floor'),
                                  (None, 'system-memory-observation-error')):
            with self.subTest(available=available):
                result, _ = self.run_case(cap=m.LARGE_SCENE_MAX_RSS_KIB,
                                         runtime_floor=m.MIN_AVAILABLE_BYTES, available=available)
                self.assertEqual(result['reason'], reason)

    def test_runtime_floor_boundary_allowed_and_standard_behavior_unchanged(self):
        for floor, available in ((m.MIN_AVAILABLE_BYTES, m.MIN_AVAILABLE_BYTES), (None, None), (None, 1)):
            with self.subTest(floor=floor, available=available):
                result, _ = self.run_case(cap=m.MAX_RSS_KIB, runtime_floor=floor, available=available)
                self.assertEqual(result['reason'], 'deadline')

    def test_cancel_escalates_term_ignoring_child(self):
        result, records = self.run_case(cap=m.MAX_RSS_KIB, cancelled=True,
                                       root_code='import signal,time; signal.signal(signal.SIGTERM, signal.SIG_IGN); time.sleep(20)')
        self.assertEqual(result['reason'], 'cancelled')
        self.assertTrue(any(r['event'] == 'signal' and r['signal'] == signal.SIGKILL for r in records))


if __name__ == '__main__':
    unittest.main(verbosity=2)
