#!/usr/bin/env python3
"""Explicit, local-only checkpoints. A ZIP is not independently saved until uploaded."""
import argparse
import hashlib
import json
import os
from pathlib import Path, PurePosixPath
import re
import stat
import subprocess
import tempfile
import zipfile

MANIFEST = 'CHECKPOINT.json'
SCHEMA = 'kalajun-cloud-checkpoint-v1'
FORBIDDEN = {'.git', '.aws', '.ssh', '.gnupg', '.npm', '.cache', '.config', '.local', '.codex', 'node_modules',
             '__pycache__', '.venv', 'venv', 'tmp', 'temp', 'cache', 'caches',
             'browser-profile', 'browser-profiles', 'chrome-profile', 'chromium-profile',
             'user-data', 'user-data-dir', 'profile', 'profiles', 'credentials', 'secrets'}
FORBIDDEN_FILES = {'credentials.json', 'cookies', 'cookies.sqlite', 'login data',
                   'local state', 'id_rsa', 'id_ed25519', '.netrc', '.npmrc'}
LFS = re.compile(rb'version https://git-lfs.github.com/spec/v1\noid sha256:([0-9a-f]{64})\nsize ([0-9]+)\n?')
HEX = re.compile(r'[0-9a-f]{64}')


def canonical(value):
    if not isinstance(value, str) or not value or '\\' in value or '\x00' in value:
        raise ValueError('path must be a nonempty POSIX relative path')
    p = PurePosixPath(value)
    if p.is_absolute() or str(p) != value or any(x in ('', '.', '..') for x in p.parts):
        raise ValueError('non-canonical or escaping path: ' + value)
    if ':' in p.parts[0] or value == MANIFEST:
        raise ValueError('reserved path: ' + value)
    for part in p.parts:
        low = part.lower()
        if (low in FORBIDDEN or low in FORBIDDEN_FILES or low == '.env' or
                low.startswith('.env.') or low.endswith(('.pem', '.key', '.p12', '.pfx', '.pyc')) or
                low.startswith(('profile-', 'chrome-profile-', 'chromium-profile-'))):
            raise ValueError('excluded sensitive/temporary path: ' + value)
    return value


def local_file(root, name):
    canonical(name)
    p = root
    for part in PurePosixPath(name).parts:
        p = p / part
        mode = p.lstat().st_mode
        if stat.S_ISLNK(mode):
            raise ValueError('symlinks are not checkpoint inputs: ' + name)
    if not stat.S_ISREG(mode):
        raise ValueError('input is not a regular file: ' + name)
    return p


def sha(data):
    return hashlib.sha256(data).hexdigest()


def stable_read(root, name):
    p = local_file(root, name)
    before = p.stat()
    flags = os.O_RDONLY | getattr(os, 'O_NOFOLLOW', 0)
    fd = os.open(p, flags)
    try:
        opened = os.fstat(fd)
        if not stat.S_ISREG(opened.st_mode) or (opened.st_dev, opened.st_ino) != (before.st_dev, before.st_ino):
            raise ValueError('input changed before reading: ' + name)
        with os.fdopen(fd, 'rb', closefd=False) as f:
            data = f.read()
        after = os.fstat(fd)
    finally:
        os.close(fd)
    end = local_file(root, name).stat()
    key = lambda s: (s.st_dev, s.st_ino, s.st_size, s.st_mtime_ns, s.st_ctime_ns)
    if key(before) != key(after) or key(after) != key(end) or len(data) != after.st_size:
        raise ValueError('input changed while reading: ' + name)
    return data, 0o755 if end.st_mode & 0o111 else 0o644


def git(root, *args, input=None):
    r = subprocess.run(['git', '-C', str(root), *args], input=input, capture_output=True)
    if r.returncode:
        raise ValueError('git ' + args[0] + ' failed: ' + r.stderr.decode(errors='replace').strip())
    return r.stdout


def baseline(root, ref):
    commit = git(root, 'rev-parse', '--verify', ref + '^{commit}').decode().strip()
    tree = git(root, 'rev-parse', commit + '^{tree}').decode().strip()
    raw = git(root, 'ls-tree', '-rlz', commit)
    small = []
    for row in raw.split(b'\0'):
        if not row:
            continue
        meta, path = row.split(b'\t', 1)
        mode, kind, oid, size = meta.split()
        if kind == b'blob' and int(size) <= 1024:
            small.append((path.decode('utf-8'), oid.decode()))
    pointers = []
    if small:
        data = git(root, 'cat-file', '--batch', input=''.join(oid + '\n' for _, oid in small).encode())
        offset = 0
        for path, oid in small:
            stop = data.index(b'\n', offset)
            header = data[offset:stop].split()
            if len(header) != 3 or header[0].decode() != oid or header[1] != b'blob':
                raise ValueError('unexpected git batch response')
            n = int(header[2])
            body = data[stop + 1:stop + 1 + n]
            offset = stop + n + 2
            m = LFS.fullmatch(body)
            if m:
                pointers.append({'path': path, 'oid_sha256': m[1].decode(), 'size': int(m[2])})
    return {'commit': commit, 'tree': tree, 'lfs_dependencies': sorted(pointers, key=lambda x: x['path'])}


def status_record(value):
    fields = {'status', 'unfinished_tasks', 'passed', 'failed', 'not_run', 'pending_acceptance'}
    if not isinstance(value, dict) or set(value) != fields:
        raise ValueError('status JSON requires exactly: ' + ', '.join(sorted(fields)))
    if value['status'] not in ('partial', 'candidate', 'validated_checkpoint'):
        raise ValueError('invalid explicit status')
    for k in fields - {'status'}:
        if not isinstance(value[k], list) or any(not isinstance(x, str) or not x.strip() for x in value[k]):
            raise ValueError(k + ' must be a list of nonempty strings (empty list allowed)')
    return value


def json_bytes(value):
    return (json.dumps(value, ensure_ascii=False, sort_keys=True, indent=2) + '\n').encode()


def put(z, name, data, mode=0o644):
    info = zipfile.ZipInfo(name, (1980, 1, 1, 0, 0, 0))
    info.create_system = 3
    info.external_attr = (stat.S_IFREG | mode) << 16
    info.compress_type = zipfile.ZIP_DEFLATED
    z.writestr(info, data)


def pack(root, ref, names, status, output):
    root = Path(root).resolve(strict=True)
    if not isinstance(names, list) or not names or len(names) != len(set(names)):
        raise ValueError('allowlist must be a nonempty list of unique file paths, not directories')
    names = sorted(canonical(n) for n in names)
    status = status_record(status)
    output = Path(output).absolute()
    if output.exists() or output.is_symlink():
        raise ValueError('output already exists; previous checkpoints must be preserved')
    if any(output.resolve() == (root / n).resolve() for n in names):
        raise ValueError('output cannot be a selected input')
    if not output.parent.is_dir():
        raise ValueError('output parent must already exist')
    base = baseline(root, ref)  # Fail unknown baseline before output is created.
    # First pass captures hashes without retaining large assets in memory.
    records = []
    for name in names:
        data, mode = stable_read(root, name)
        records.append({'path': name, 'sha256': sha(data), 'size': len(data), 'mode': mode})
    manifest = {'schema': SCHEMA, 'scope': 'explicit_files_only_no_deletions',
                'baseline': base, 'validation': status, 'files': records}
    fd, temp = tempfile.mkstemp(prefix='.checkpoint-', suffix='.zip', dir=output.parent)
    os.close(fd)
    try:
        with zipfile.ZipFile(temp, 'w', compression=zipfile.ZIP_DEFLATED, compresslevel=6) as z:
            for item in records:
                data, mode = stable_read(root, item['path'])
                if (sha(data), len(data), mode) != (item['sha256'], item['size'], item['mode']):
                    raise ValueError('input changed between snapshot passes: ' + item['path'])
                put(z, item['path'], data, mode)
            put(z, MANIFEST, json_bytes(manifest))
        # Final complete pass catches files edited after their ZIP entry was written.
        for item in records:
            data, mode = stable_read(root, item['path'])
            if (sha(data), len(data), mode) != (item['sha256'], item['size'], item['mode']):
                raise ValueError('input changed before finalization: ' + item['path'])
        verify(temp, root)
        with open(temp, 'rb') as f:
            os.fsync(f.fileno())
        os.link(temp, output)  # Atomic no-clobber publication on the same filesystem.
    finally:
        os.unlink(temp)
    return {'path': str(output), 'sha256': sha(output.read_bytes()), 'size': output.stat().st_size,
            'files': len(records), 'baseline': base['commit'], 'status': status['status']}


def verify(archive, root=None, extract_to=None):
    with zipfile.ZipFile(archive) as z:
        infos = z.infolist()
        names = [i.filename for i in infos]
        if len(names) != len(set(names)) or names.count(MANIFEST) != 1:
            raise ValueError('duplicate archive entry or missing manifest')
        for i in infos:
            if i.filename != MANIFEST:
                canonical(i.filename)
            if i.is_dir() or stat.S_IFMT(i.external_attr >> 16) != stat.S_IFREG or i.flag_bits & 1:
                raise ValueError('non-regular/encrypted ZIP entry')
        m = json.loads(z.read(MANIFEST))
        if set(m) != {'schema', 'scope', 'baseline', 'validation', 'files'} or m['schema'] != SCHEMA or m['scope'] != 'explicit_files_only_no_deletions':
            raise ValueError('unsupported checkpoint manifest')
        status_record(m['validation'])
        b = m['baseline']
        if (not isinstance(b, dict) or set(b) != {'commit', 'tree', 'lfs_dependencies'} or
                not re.fullmatch(r'[0-9a-f]{40}', b['commit']) or
                not re.fullmatch(r'[0-9a-f]{40}', b['tree'])):
            raise ValueError('invalid baseline identity')
        for p in b['lfs_dependencies']:
            if set(p) != {'path', 'oid_sha256', 'size'} or not HEX.fullmatch(p['oid_sha256']) or type(p['size']) != int or p['size'] < 0:
                raise ValueError('invalid LFS dependency')
            canonical(p['path'])
        records = m['files']
        if not isinstance(records, list) or not records:
            raise ValueError('empty file manifest')
        listed = []
        for item in records:
            if set(item) != {'path', 'sha256', 'size', 'mode'}:
                raise ValueError('invalid file entry')
            name = canonical(item['path'])
            listed.append(name)
            if not HEX.fullmatch(item['sha256']) or type(item['size']) != int or item['size'] < 0 or item['mode'] not in (0o644, 0o755):
                raise ValueError('invalid file integrity fields')
        if len(listed) != len(set(listed)) or set(names) != set(listed) | {MANIFEST}:
            raise ValueError('archive/manifest file list mismatch')
        if root is not None and baseline(Path(root), b['commit']) != b:
            raise ValueError('baseline or LFS dependencies mismatch')
        for item in records:
            info = z.getinfo(item['path'])
            if info.file_size != item['size'] or (info.external_attr >> 16) & 0o777 != item['mode']:
                raise ValueError('ZIP size/mode mismatch')
            data = z.read(info)  # Also checks ZIP CRC.
            if sha(data) != item['sha256']:
                raise ValueError('SHA mismatch: ' + item['path'])
        if extract_to is not None:
            dest = Path(extract_to).absolute()
            if dest.exists() or dest.is_symlink():
                raise ValueError('extraction requires a new directory, not an existing checkout')
            if not dest.parent.is_dir() or dest.parent.is_symlink():
                raise ValueError('extraction parent must be an existing non-symlink directory')
            dest.mkdir(mode=0o700)
            for item in records:
                p = dest / item['path']
                p.parent.mkdir(parents=True, exist_ok=True)
                with p.open('xb') as f:
                    f.write(z.read(item['path']))
                p.chmod(item['mode'])
            (dest / MANIFEST).write_bytes(json_bytes(m))
    return m


def main():
    ap = argparse.ArgumentParser(description=__doc__)
    sub = ap.add_subparsers(dest='command', required=True)
    p = sub.add_parser('pack')
    for arg in ('repo', 'baseline', 'allowlist', 'status', 'output'):
        p.add_argument('--' + arg, required=True)
    v = sub.add_parser('verify')
    v.add_argument('archive')
    v.add_argument('--repo', required=True, help='verify exact baseline commit/tree/LFS pointer list exists')
    v.add_argument('--extract-to', help='new isolated directory only; never applies over a checkout')
    a = ap.parse_args()
    try:
        if a.command == 'pack':
            result = pack(a.repo, a.baseline, json.loads(Path(a.allowlist).read_text()),
                          json.loads(Path(a.status).read_text()), a.output)
        else:
            m = verify(a.archive, a.repo, a.extract_to)
            result = {'verified': True, 'files': len(m['files']), 'baseline': m['baseline']['commit'],
                      'status': m['validation']['status'], 'extracted_to': a.extract_to}
        print(json.dumps(result, ensure_ascii=False, sort_keys=True))
    except (ValueError, OSError, KeyError, TypeError, zipfile.BadZipFile, json.JSONDecodeError) as e:
        ap.exit(1, 'checkpoint refused: ' + str(e) + '\n')


if __name__ == '__main__':
    main()
