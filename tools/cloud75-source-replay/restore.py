"""Fail-closed source replay. No bake, authorization, cache or asset restoration."""
import argparse
import hashlib
import json
from pathlib import Path, PurePosixPath
import subprocess

PREFIXES = ('backups/cloud75-textile-volume-staging/',
            'backups/cloud75-cover-window-clearance/',
            'backups/cloud75-textile-gi-staging/')

def require(ok, message):
    if not ok:
        raise ValueError(message)

def digest(data):
    return hashlib.sha256(data).hexdigest()

def safe_path(root, relative):
    require(isinstance(relative, str) and relative and '\\' not in relative,
            'Invalid relative path')
    parts = relative.split('/')
    require(not PurePosixPath(relative).is_absolute() and
            all(p not in ('', '.', '..') for p in parts), 'Path escape or alias')
    root = Path(root)
    require(root.is_dir() and not root.is_symlink(), 'Root must be real directory')
    current = root
    for part in parts:
        current = current / part
        require(not current.is_symlink(), 'Symlink refused: ' + str(current))
    require(current.resolve().is_relative_to(root.resolve()), 'Path escape')
    return current

def inspect(bundle, repo, check_live=False):
    bundle, repo = Path(bundle), Path(repo)
    manifest = json.loads(safe_path(bundle, 'manifest.json').read_text())
    require(manifest['schemaVersion'] == 1, 'Unsupported schema')
    require(set(manifest['allowedPrefixes']) == set(PREFIXES), 'Unexpected prefixes')
    base = manifest['baselineCommit']
    require(len(base) == 40 and all(c in '0123456789abcdef' for c in base), 'Bad baseline')
    require(subprocess.run(['git', '-C', str(repo), 'merge-base', '--is-ancestor',
                            base, 'HEAD'], capture_output=True).returncode == 0,
            'Baseline is not an ancestor of HEAD')
    seen = set()
    for row in manifest['boundInputs']:
        name = row['path']
        require(name not in seen, 'Duplicate bound input')
        seen.add(name)
        path = safe_path(repo, name)
        require(path.is_file() and digest(path.read_bytes()) == row['sha256'],
                'Bound production input differs: ' + name)
    require(bool(seen), 'No bound inputs')
    seen = set(); prepared = []
    for row in manifest['entries']:
        name = row['originalPath']
        require(name.startswith(PREFIXES), 'Target not allowlisted')
        require(name not in seen, 'Duplicate destination')
        seen.add(name)
        require(row['payloadPath'] == 'payload/' + name, 'Payload mapping differs')
        source = safe_path(bundle, row['payloadPath'])
        require(source.is_file(), 'Missing payload: ' + name)
        data = source.read_bytes()
        require(len(data) == row['size'] and digest(data) == row['sha256'],
                'Payload tampered: ' + name)
        target = safe_path(repo, name)
        if target.exists():
            require(target.is_file() and target.read_bytes() == data,
                    'Refuse overwrite: ' + name)
        else:
            require(not check_live, 'Live source missing: ' + name)
        prepared.append((name, data, target.exists()))
    require(bool(prepared), 'Empty payload')
    return prepared

def restore(bundle, repo, apply=False, check_live=False):
    prepared = inspect(bundle, repo, check_live)
    if apply:
        require(not check_live, 'Cannot apply during live comparison')
        for name, data, exists in prepared:
            target = safe_path(repo, name)
            if exists:
                require(target.read_bytes() == data, 'Concurrent source change')
                continue
            target.parent.mkdir(parents=True, exist_ok=True)
            target = safe_path(repo, name)
            # Exclusive creation: never overwrite even if another writer wins a race.
            with target.open('xb') as stream:
                stream.write(data)
        inspect(bundle, repo, True)
    return {'files': len(prepared), 'identicalSkipped': sum(x[2] for x in prepared),
            'wouldCreate': sum(not x[2] for x in prepared), 'applied': apply,
            'liveSourceComparison': check_live, 'bakeExecuted': False}

if __name__ == '__main__':
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--repo', type=Path, required=True)
    parser.add_argument('--bundle', type=Path, default=Path(__file__).parent)
    mode = parser.add_mutually_exclusive_group()
    mode.add_argument('--apply', action='store_true')
    mode.add_argument('--check-live', action='store_true')
    args = parser.parse_args()
    print(json.dumps(restore(args.bundle, args.repo, args.apply, args.check_live), indent=2))
