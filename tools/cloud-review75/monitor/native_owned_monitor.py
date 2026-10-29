#!/usr/bin/env python3
"""Cloud Linux native-Terminal Chromium launcher. No browser-control API.

Ownership is a recorded (PID, /proc start ticks) identity, not an argv match.
Every signal uses a verified pidfd; no killpg, pkill, reused profile, or rmtree.
This is a sampled monitor, not a cgroup or a claim to catch unseen detachments.
"""
from __future__ import annotations

import argparse
import base64
from dataclasses import asdict, dataclass
import datetime
import json
import math
import os
from pathlib import Path
import shlex
import shutil
import signal
import subprocess
import sys
import time
from urllib.parse import urlsplit

MAX_OUTER_SECONDS = 1320.0
MAX_RSS_KIB = 2_097_152
MIN_AVAILABLE_BYTES = 4_500_000_000
REPO_ROOT = Path(__file__).resolve().parents[3]
WRITABLE_ROOTS = (Path('/tmp'), REPO_ROOT)
LIMITATIONS = [
    'Ownership covers the fresh root process group plus descendants observed while ancestry was verifiable.',
    'A child that detaches/reparents before observation can escape attribution. Unobserved detached processes are not proven absent.',
    'RSS is a sampled sum (shared pages can be counted repeatedly); this is not a cgroup hard cap and between-poll peaks can be missed.',
    'PID start ticks and pidfds prevent signaling a replacement PID. Inaccessible or ambiguous identities are not signaled.',
    'Monotonic deadlines bound monitor waits; OS scheduling stalls or blocked kernel/filesystem operations cannot be bounded by Python.',
    'SIGKILL or interpreter/host failure can prevent cleanup; keep the monitor Terminal alive and cancel with Ctrl+C or the CANCEL file.',
    'No claim of browser sandbox audit, scene completion, GPU completion, or visual/performance acceptance follows from this process log.',
]


@dataclass(frozen=True)
class Proc:
    pid: int
    ppid: int
    pgid: int
    sid: int
    start_ticks: int
    rss_kib: int
    state: str
    uid: int

    @property
    def identity(self):
        return self.pid, self.start_ticks

    @property
    def live(self):
        return self.state not in ('Z', 'X', 'x')


def parse_stat(raw: bytes, uid: int, page_size: int = 4096) -> Proc:
    """Linux stat comm may itself contain spaces, newlines and parentheses."""
    opening, closing = raw.find(b'('), raw.rfind(b') ')
    if opening < 1 or closing <= opening:
        raise ValueError('malformed /proc stat envelope')
    fields = raw[closing + 2:].split()
    if len(fields) < 22:
        raise ValueError('short /proc stat')
    pid = int(raw[:opening].strip())
    state = fields[0].decode('ascii')
    if pid <= 0 or len(state) != 1:
        raise ValueError('invalid PID/state')
    ppid, pgid, sid = (int(fields[i]) for i in (1, 2, 3))
    ticks, pages = int(fields[19]), int(fields[21])
    if min(ppid, pgid, sid, ticks) < 0:
        raise ValueError('negative process identity')
    return Proc(pid, ppid, pgid, sid, ticks, max(0, pages) * page_size // 1024, state, uid)


def read_proc(pid: int) -> Proc | None:
    path = Path('/proc') / str(pid)
    try:
        uid = path.stat().st_uid
        result = parse_stat((path / 'stat').read_bytes(), uid, os.sysconf('SC_PAGE_SIZE'))
        if result.pid != pid:
            raise ValueError('stat PID mismatch')
        return result
    except (FileNotFoundError, ProcessLookupError):
        return None


def same_identity(a: Proc | None, b: Proc) -> bool:
    return a is not None and a.identity == b.identity and a.uid == b.uid


def memory_available(raw: str | None = None) -> int:
    if raw is None:
        raw = Path('/proc/meminfo').read_text()
    matches = [line.split() for line in raw.splitlines() if line.startswith('MemAvailable:')]
    if len(matches) != 1 or len(matches[0]) != 3 or matches[0][2] != 'kB':
        raise ValueError('missing/ambiguous MemAvailable kB')
    value = int(matches[0][1]) * 1024
    if value < 0:
        raise ValueError('negative MemAvailable')
    return value


def raw_cmdline(pid: int) -> dict:
    """Do not split flattened argv or treat cmdline as ownership evidence."""
    try:
        raw = (Path('/proc') / str(pid) / 'cmdline').read_bytes()
        return {
            'raw_base64': base64.b64encode(raw).decode('ascii'),
            'representation': 'nul-delimited' if b'\0' in raw else 'flattened-or-single-argument-or-empty',
            'used_for_ownership': False,
        }
    except OSError as exc:
        return {'read_error': type(exc).__name__, 'used_for_ownership': False}


def process_table() -> tuple[dict[int, Proc], list[dict]]:
    result, errors = {}, []
    for entry in os.scandir('/proc'):
        if not entry.name.isdecimal():
            continue
        try:
            proc = read_proc(int(entry.name))
            if proc is not None:
                result[proc.pid] = proc
        except (OSError, ValueError) as exc:
            errors.append({'pid': int(entry.name), 'error': type(exc).__name__})
    return result, errors


class Tracker:
    def __init__(self, root: Proc):
        if root.pgid != root.pid or root.sid != root.pid:
            raise ValueError('root is not its own fresh process group and session leader')
        self.root = root
        self.owned = {root.identity: root}
        self.reasons = {root.identity: 'launched-root'}

    def observe(self, table: dict[int, Proc], verify=read_proc) -> list[Proc]:
        """Adopt only currently verified group members or direct descendants.

        A birth-matched member must anchor the original group. Once all
        anchors are gone, a later matching numeric PGID is NOT sufficient.
        """
        current = {p.pid: p for key in self.owned for p in [table.get(key[0])]
                   if p is not None and p.identity == key and p.uid == self.root.uid}
        anchors = [p for p in current.values() if
                   p.pgid == self.root.pgid and p.sid == self.root.sid]

        def checked(candidate):
            try:
                actual = verify(candidate.pid)
                return actual if same_identity(actual, candidate) else None
            except (OSError, ValueError):
                return None

        anchor = next((a for p in anchors if (a := checked(p)) is not None
                       and a.pgid == self.root.pgid and a.sid == self.root.sid), None)
        for p in table.values():
            if p.pid in current or not p.live or p.uid != self.root.uid:
                continue
            if (anchor is not None and p.pgid == self.root.pgid and p.sid == self.root.sid
                    and p.start_ticks >= self.root.start_ticks):
                valid_anchor, actual = checked(anchor), checked(p)
                if (valid_anchor is not None and actual is not None
                        and valid_anchor.pgid == self.root.pgid and valid_anchor.sid == self.root.sid
                        and actual.pgid == self.root.pgid and actual.sid == self.root.sid):
                    self.owned[actual.identity] = actual
                    self.reasons[actual.identity] = 'verified-owned-process-group'
                    current[actual.pid] = actual
        changed = True
        while changed:
            changed = False
            for p in table.values():
                if p.pid in current or not p.live or p.uid != self.root.uid:
                    continue
                parent = current.get(p.ppid)
                if parent is None or p.start_ticks < parent.start_ticks:
                    continue
                actual, valid_parent = checked(p), checked(parent)
                if (actual is not None and valid_parent is not None and valid_parent.live
                        and actual.ppid == valid_parent.pid
                        and actual.start_ticks >= valid_parent.start_ticks):
                    self.owned[actual.identity] = actual
                    self.reasons[actual.identity] = 'observed-descendant'
                    current[actual.pid] = actual
                    changed = True
        return sorted(current.values(), key=lambda p: p.pid)


def signal_verified(proc: Proc, sig: int, reader=read_proc) -> str:
    """Open a pidfd, then recheck birth. No unsafe PID-only fallback."""
    fd = None
    try:
        fd = os.pidfd_open(proc.pid, 0)
        actual = reader(proc.pid)
        if not same_identity(actual, proc):
            return 'not-signaled-identity-mismatch-or-gone'
        if not actual.live:
            return 'not-signaled-zombie'
        signal.pidfd_send_signal(fd, sig, None, 0)
        return 'signaled'
    except ProcessLookupError:
        return 'not-signaled-gone'
    except (OSError, ValueError) as exc:
        return 'not-signaled-' + type(exc).__name__
    finally:
        if fd is not None:
            os.close(fd)


class Journal:
    def __init__(self, path: Path):
        self.handle = path.open('x', encoding='utf-8')

    def emit(self, event: str, **values):
        record = {'utc': datetime.datetime.now(datetime.timezone.utc).isoformat(),
                  'monotonic_seconds': time.monotonic(), 'event': event, **values}
        self.handle.write(json.dumps(record, sort_keys=True) + '\n')
        self.handle.flush()
        os.fsync(self.handle.fileno())

    def close(self):
        self.handle.close()


def write_json(path: Path, value):
    with path.open('x', encoding='utf-8') as handle:
        json.dump(value, handle, indent=2, sort_keys=True)
        handle.write('\n')
        handle.flush()
        os.fsync(handle.fileno())


def monitor(child, root: Proc, journal, *, total_deadline: float,
            poll_seconds: float, cleanup_seconds: float, rss_cap_kib: int,
            cancel_requested, cancel_file: Path, tracker=None) -> dict:
    tracker = tracker or Tracker(root)
    run_deadline = total_deadline - cleanup_seconds
    cleanup_deadline = kill_at = None
    reason = None
    emitted = set()
    peak = 0
    current = []
    unknown = []
    failures = []
    signaled = set()

    def sample():
        nonlocal current, unknown, peak
        table, errors = process_table()
        current = tracker.observe(table)
        unknown = [e for e in errors if any(key[0] == e['pid'] for key in tracker.owned)]
        rss = sum(p.rss_kib for p in current if p.live)
        peak = max(peak, rss)
        for p in current:
            if p.identity not in emitted:
                journal.emit('ownership_observed', process=asdict(p),
                             basis=tracker.reasons[p.identity], cmdline=raw_cmdline(p.pid))
                emitted.add(p.identity)
        try:
            available = memory_available()
        except (OSError, ValueError):
            available = None
        journal.emit('sample', owned_rss_kib=rss,
                     original_group_rss_kib=sum(p.rss_kib for p in current if p.live and
                                               p.pgid == root.pgid and p.sid == root.sid),
                     mem_available_bytes=available, processes=[asdict(p) for p in current],
                     proc_scan_errors=errors, unknown_owned=unknown)
        return rss

    def send(sig):
        # Younger descendants first; the root is last. Each target has a pidfd.
        for p in sorted(current, key=lambda p: (p.pid == root.pid, -p.start_ticks, -p.pid)):
            key = (p.identity, sig)
            if not p.live or key in signaled:
                continue
            result = signal_verified(p, sig)
            journal.emit('signal', identity=list(p.identity), signal=sig, result=result)
            if result == 'signaled':
                signaled.add(key)
            elif result not in ('not-signaled-gone', 'not-signaled-zombie'):
                failures.append({'identity': list(p.identity), 'signal': sig, 'result': result})

    while True:
        rss = sample()
        now = time.monotonic()
        root_code = child.poll()  # Reap only our direct child; never waits indefinitely.
        live = [p for p in current if p.live]
        if reason is None:
            if cancel_requested() or cancel_file.exists():
                reason = 'cancelled'
            elif unknown:
                reason = 'owned-identity-observation-error'
            elif rss >= rss_cap_kib:
                reason = 'rss-cap'
            elif now >= run_deadline:
                reason = 'deadline'
            elif root_code is not None and not live:
                reason = 'root-exited-no-live-observed-owned'
            if reason is not None:
                cleanup_deadline = min(total_deadline, now + cleanup_seconds)
                kill_at = min(cleanup_deadline, now + cleanup_seconds / 2)
                journal.emit('stopping', reason=reason, cleanup_deadline_monotonic=cleanup_deadline,
                             kill_at_monotonic=kill_at)
        if reason is not None:
            if live:
                send(signal.SIGTERM if now < kill_at else signal.SIGKILL)
            if not live and not unknown:
                break
            if time.monotonic() >= cleanup_deadline:
                # One final best-effort verified signal, without extending budget.
                send(signal.SIGKILL)
                break
        next_boundary = cleanup_deadline if reason else run_deadline
        if reason and now < kill_at:
            next_boundary = min(next_boundary, kill_at)
        wait = max(0, min(poll_seconds, next_boundary - time.monotonic()))
        if wait:
            time.sleep(wait)

    # No post-deadline wait. Snapshot verification may observe a just-signaled
    # process still alive; retain it as unresolved rather than claim completion.
    sample()
    root_code = child.poll()
    remaining = [asdict(p) for p in current if p.live]
    result = {
        'reason': reason, 'root_returncode': root_code, 'peak_sampled_owned_rss_kib': peak,
        'remaining_live_observed_owned': remaining, 'unknown_owned': unknown,
        'no_live_observed_owned_at_final_snapshot': not remaining and not unknown,
        'all_browser_descendants_proven_absent': False,
        'signal_failures': failures, 'limitations': LIMITATIONS,
        'finished_monotonic': time.monotonic(), 'total_deadline_monotonic': total_deadline,
    }
    journal.emit('monitor_finished', **result)
    return result


def emergency_cleanup(tracker, deadline: float, poll_seconds: float) -> list[dict]:
    """Journal-independent cleanup of known ownership after a monitor error."""
    remaining = []
    while True:
        try:
            table, _ = process_table()
            current = tracker.observe(table)
        except (OSError, ValueError):
            current = list(tracker.owned.values())
        remaining = []
        for proc in current:
            result = signal_verified(proc, signal.SIGKILL)
            if result not in ('not-signaled-gone', 'not-signaled-zombie'):
                remaining.append({'identity': list(proc.identity), 'result': result})
        if not remaining or time.monotonic() >= deadline:
            return remaining
        time.sleep(min(poll_seconds, max(0, deadline - time.monotonic())))


def loopback_url(value: str) -> str:
    if any(ord(c) <= 32 or ord(c) == 127 for c in value) or '\\' in value:
        raise argparse.ArgumentTypeError('URL must not contain whitespace, controls or backslashes')
    try:
        parsed = urlsplit(value)
        port = parsed.port
        valid = (parsed.scheme == 'http' and parsed.hostname in ('127.0.0.1', '::1')
                 and port is not None and 1 <= port <= 65535 and parsed.path.startswith('/')
                 and parsed.username is None and parsed.password is None and not parsed.fragment)
    except ValueError:
        valid = False
    if not valid:
        raise argparse.ArgumentTypeError('Use http://127.0.0.1:PORT/path or http://[::1]:PORT/path')
    return value


def window_size(value: str) -> str:
    try:
        fields = value.split(',')
        if len(fields) != 2 or any(not x.isdecimal() for x in fields):
            raise ValueError
        width, height = map(int, fields)
        if not 320 <= width <= 8192 or not 240 <= height <= 8192:
            raise ValueError
    except ValueError:
        raise argparse.ArgumentTypeError('window size must be WIDTH,HEIGHT within 320..8192 × 240..8192')
    return f'{width},{height}'


def fresh_run_path(value: str) -> Path:
    path = Path(value)
    if not path.is_absolute() or path.exists() or path.is_symlink():
        raise ValueError('run directory must be absolute, new and nonexistent')
    if not path.parent.is_dir() or path.parent.resolve() != path.parent:
        raise ValueError('run parent must exist and have no symlink/.. ambiguity')
    if not any(path != root and path.is_relative_to(root) for root in WRITABLE_ROOTS):
        raise ValueError('run directory must be inside an allowed task-owned workspace or /tmp')
    return path


def browser_argv(binary: str, profile: Path, url: str, size: str,
                 *, full_world_cpu_compositing: bool = False) -> list[str]:
    command = [binary, '--user-data-dir=' + str(profile), '--use-gl=angle',
               '--use-angle=swiftshader', '--gpu-watchdog-timeout-seconds=180',
               '--force-device-scale-factor=1', '--window-size=' + size]
    if full_world_cpu_compositing:
        command.append('--disable-gpu-compositing')
    return command + ['--new-window', url]


def parser():
    p = argparse.ArgumentParser(description=__doc__)
    p.add_argument('--run-dir', required=True, help='new directory; parent must already exist')
    p.add_argument('--url', required=True, type=loopback_url)
    p.add_argument('--chromium', default='chromium', help='installed executable; no extra arguments')
    p.add_argument('--window-size', default='1288,891', type=window_size)
    p.add_argument('--full-world-cpu-compositing', action='store_true',
                   help='explicit reviewed full-world route only: adds --disable-gpu-compositing; default unchanged')
    p.add_argument('--outer-seconds', default=1320.0, type=float, help='total budget INCLUDING cleanup, at most 1320')
    p.add_argument('--cleanup-seconds', default=10.0, type=float)
    p.add_argument('--poll-seconds', default=1.0, type=float)
    p.add_argument('--rss-cap-kib', default=MAX_RSS_KIB, type=int, help='may only tighten historic 2097152 KiB cap')
    return p


def main(argv=None) -> int:
    started = time.monotonic()
    p = parser()
    args = p.parse_args(argv)
    numbers = (args.outer_seconds, args.cleanup_seconds, args.poll_seconds)
    if (not all(math.isfinite(x) for x in numbers)
            or not 0 < args.outer_seconds <= MAX_OUTER_SECONDS
            or not 0.05 <= args.poll_seconds <= 5
            or not 2 * args.poll_seconds + 1 <= args.cleanup_seconds < args.outer_seconds
            or args.outer_seconds <= args.cleanup_seconds + args.poll_seconds
            or not 1 <= args.rss_cap_kib <= MAX_RSS_KIB):
        p.error('invalid finite deadline/poll/cleanup/RSS limits')
    if sys.platform != 'linux' or not hasattr(os, 'pidfd_open') or not hasattr(signal, 'pidfd_send_signal'):
        p.error('Linux /proc plus Python pidfd_open and pidfd_send_signal are required; no unsafe fallback')
    if os.geteuid() == 0:
        p.error('do not launch as root; sandbox-disabling flags are forbidden')
    if not os.environ.get('DISPLAY') and not os.environ.get('WAYLAND_DISPLAY'):
        p.error('run through the cloud native Terminal with its display environment')
    try:
        run_dir = fresh_run_path(args.run_dir)
        available = memory_available()
    except (OSError, ValueError) as exc:
        p.error(str(exc))
    if available < MIN_AVAILABLE_BYTES:
        p.error(f'prestart MemAvailable {available} < required {MIN_AVAILABLE_BYTES} bytes')
    binary = shutil.which(args.chromium)
    if binary is None:
        p.error('Chromium executable was not found')
    if time.monotonic() >= started + args.outer_seconds - args.cleanup_seconds:
        p.error('preflight consumed available run budget; no browser launched')
    run_dir.mkdir(mode=0o700)  # exclusive, no parents=True and no reuse
    profile = run_dir / 'profile'
    profile.mkdir(mode=0o700)
    # Debian's wrapper examines HOME for stale crash reports before exec.
    # A fresh HOME/XDG tree keeps even that wrapper activity task-owned.
    child_env = os.environ.copy()
    for name, relative in (('HOME', 'home'), ('XDG_CONFIG_HOME', 'config'),
                           ('XDG_CACHE_HOME', 'cache'), ('XDG_DATA_HOME', 'data')):
        directory = run_dir / relative
        directory.mkdir(mode=0o700)
        child_env[name] = str(directory)
    command = browser_argv(binary, profile, args.url, args.window_size,
                           full_world_cpu_compositing=args.full_world_cpu_compositing)
    deadline = started + args.outer_seconds
    write_json(run_dir / 'launch.json', {
        'status': 'launch-intent-not-scene-evidence', 'argv': command, 'shell_display_only': shlex.join(command),
        'started_monotonic': started, 'total_deadline_monotonic': deadline,
        'outer_seconds': args.outer_seconds, 'cleanup_seconds': args.cleanup_seconds,
        'poll_seconds': args.poll_seconds, 'rss_cap_kib': args.rss_cap_kib,
        'prestart_mem_available_bytes': available, 'minimum_prestart_mem_available_bytes': MIN_AVAILABLE_BYTES,
        'window_size_request': args.window_size, 'viewport_must_be_visibly_verified': True,
        'full_world_cpu_compositing_requested': args.full_world_cpu_compositing,
        'fresh_environment_dirs': {name: child_env[name] for name in
                                   ('HOME', 'XDG_CONFIG_HOME', 'XDG_CACHE_HOME', 'XDG_DATA_HOME')},
        'monitor_pid': os.getpid(), 'limitations': LIMITATIONS,
    })
    journal = Journal(run_dir / 'events.jsonl')
    cancelled = [False]
    previous = {}
    for sig in (signal.SIGINT, signal.SIGTERM, signal.SIGHUP):
        previous[sig] = signal.signal(sig, lambda _sig, _frame: cancelled.__setitem__(0, True))
    child = None
    root = None
    tracker = None
    try:
        with (run_dir / 'browser.log').open('xb') as output:
            launch_available = memory_available()
            if launch_available < MIN_AVAILABLE_BYTES or cancelled[0]:
                raise RuntimeError('prelaunch memory guard or cancellation prevented launch')
            journal.emit('launching', argv=command, current_mem_available_bytes=launch_available)
            child = subprocess.Popen(command, stdin=subprocess.DEVNULL, stdout=output, stderr=subprocess.STDOUT,
                                     start_new_session=True, close_fds=True, env=child_env)
            root = read_proc(child.pid)
            if root is None:
                raise RuntimeError('root identity unavailable; descendants are unproven, no group signal allowed')
            tracker = Tracker(root)
            write_json(run_dir / 'root-identity.json', asdict(root))
            print(f'Owned launch root PID={root.pid} start_ticks={root.start_ticks}; evidence={run_dir}', flush=True)
            print(f'Cancel with Ctrl+C in this Terminal or create {run_dir / "CANCEL"}; do not kill all Chromium.', flush=True)
            result = monitor(child, root, journal, total_deadline=deadline, poll_seconds=args.poll_seconds,
                             cleanup_seconds=args.cleanup_seconds, rss_cap_kib=args.rss_cap_kib,
                             cancel_requested=lambda: cancelled[0], cancel_file=run_dir / 'CANCEL', tracker=tracker)
            write_json(run_dir / 'summary.json', result)
            print(json.dumps(result, sort_keys=True), flush=True)
            if not result['no_live_observed_owned_at_final_snapshot']:
                return 3
            return 0 if result['reason'] == 'root-exited-no-live-observed-owned' and result['root_returncode'] == 0 else 1
    except BaseException as exc:
        emergency = (emergency_cleanup(tracker, min(deadline, time.monotonic() + args.cleanup_seconds),
                                       args.poll_seconds) if tracker is not None
                     else signal_verified(root, signal.SIGKILL) if root is not None
                     else 'root-identity-unavailable-or-not-launched')
        print(f'Monitor error: {type(exc).__name__}: {exc}; owned cleanup={emergency}; unseen descendants unresolved', file=sys.stderr)
        try:
            write_json(run_dir / 'error.json', {'error': repr(exc), 'root_cleanup': emergency,
                                               'all_browser_descendants_proven_absent': False})
        except OSError:
            pass
        return 3
    finally:
        for sig, handler in previous.items():
            signal.signal(sig, handler)
        journal.close()


if __name__ == '__main__':
    raise SystemExit(main())
