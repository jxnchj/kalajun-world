# Wall-plants v2: source-only isolated review replay

**Not production adoption.** This five-text-file package preserves the exact ten-file candidate source patch, not a runnable project or replacement for the independent archives. Never apply it in production, an active test directory, or frozen evidence. No defaults, density, plant geometry or native resource budgets may be changed to obtain a pass.

## Inputs and boundaries

Start from a **new clean isolated checkout** of `dbf707479a3bfae6aaffec957de7c7447b596c72`. The documentation-only `53b3606` / `147cabb` descendants are compatible only if ancestry and every recorded production byte/absence match. A later changed runtime is not compatible just because it descends from dbf. Do not overwrite existing candidate files or weaken this manifest; use another isolated baseline checkout.

`candidate.patch` changes ten source/test paths. The 893,322-byte generated `house-wall-obstacle-data77.js` contains actual triangle geometry: deliberately **not published as ordinary JavaScript source**. Generate it from the exact original `house_a_lived.glb` LFS bytes using the patch's hash-bound extractor, then require the recorded generated SHA. No runtime GLB, `.gz`, prepared data, GI arrays or other asset bytes are hidden in this patch.

The existing LFS source GLB must be materialized and verified, not an LFS pointer. The 22 textile candidate inputs remain external (verified v24 family dependencies). The **twelve current v2 prepared files** remain external in the wallplants-v2 checkpoint, which also records the actual generator work. The package lists all exact paths/sizes/hashes and 266 source binding rows; it does not contain their payloads. Do not use v1/family prepared files, relabel old signatures, or bypass Git LFS. Source-only Git replay is **not playable** until all these dependencies are restored and verified.

## Guard before applying

Place this package outside the target checkout. Set `PKG` to its absolute directory and enter the isolated checkout root. Confirm this is your newly allocated exclusive workspace; never use the production or native browser workspace. The following guard deliberately performs no writes:

```sh
set -eu
export PKG=/path/to/wallplants77-source-review
python - <<'PY'
if not __debug__: raise RuntimeError('Optimized Python is forbidden for replay guards')
import pathlib,json,hashlib,subprocess,os
p=pathlib.Path(os.environ['PKG']).resolve();m=json.loads((p/'manifest.json').read_text());root=pathlib.Path.cwd().resolve()
assert root != p and root not in p.parents, 'Keep package outside target checkout'
assert subprocess.run(['git','merge-base','--is-ancestor',m['baseline'],'HEAD']).returncode==0
assert not subprocess.check_output(['git','status','--porcelain']), 'Clean isolated checkout required'
h=lambda b:hashlib.sha256(b).hexdigest()
assert h((p/'candidate.patch').read_bytes())==m['patchSHA256']
assert h((p/'external-inputs.json').read_bytes())==m['externalInputsSHA256']
for row in m['exactPatchPaths']:
 f=root/row['path'];assert not f.is_symlink();expected=row['baselineSHA256']
 if expected is None: assert not f.exists(), row['path']
 else: assert h(f.read_bytes())==expected,row['path']
for row in m['boundAuxiliaryInputs']:assert h((root/row['path']).read_bytes())==row['sha256'],row['path']
subprocess.run(['git','apply','--check',str(p/'candidate.patch')],check=True)
PY
git apply "$PKG/candidate.patch"
```

Install locked Node dependencies in the isolated checkout (Node 24.22.1/npm 11.9.0 were used). Materialize the original LFS input without changing its bytes. From checkout root:

```sh
set -eu
node tools/build-house-wall-obstacles77.mjs
```

Restore the **22 + 12 exact external inputs**, mapped by `external-inputs.json`, from their independently verified archives, only into this isolated checkout. Refuse source archive path escapes, symlinks and unexpected paths. For historical reconstruction, the listed external candidates intentionally replace baseline isolated assets only after their before/after inventory is recorded; never replace production. Instead of restoring prepared bytes, a developer may rerun the original repository meadow/cover generators for default/69/73 with current source and all original world/contact-fixture inputs, preserving their roundtrip/contact checks. Actual v2 generator logs and commands reside in its frozen staging archive. That is a separate potentially expensive operation: no generator is launched by this package. Either route must meet **all twelve hashes and all source signatures below**; mismatches stop replay, not update its manifest.

## Verify reconstructed closure

```sh
set -eu
python - <<'PY'
if not __debug__: raise RuntimeError('Optimized Python is forbidden for replay guards')
import pathlib,json,hashlib,os
p=pathlib.Path(os.environ['PKG']);m=json.loads((p/'manifest.json').read_text());e=json.loads((p/'external-inputs.json').read_text());h=lambda b:hashlib.sha256(b).hexdigest()
for row in m['exactPatchPaths']:
 b=pathlib.Path(row['path']).read_bytes();assert len(b)==row['patchedBytes'] and h(b)==row['patchedSHA256'],row['path']
for row in [e['baseLFSInput'],e['derivedGeometry'],*e['prepared12']]:
 b=pathlib.Path(row['path']).read_bytes();assert h(b)==row['sha256'],row['path']
 if 'bytes' in row:assert len(b)==row['bytes']
for row in e['textileCandidateInputs']:
 b=pathlib.Path(row['isolatedCandidateDestination']).read_bytes();assert len(b)==row['bytes'] and h(b)==row['sha256']
for family,binding in e['preparedCodeBindings'].items():
 for row in binding['sources']:assert h((pathlib.Path('web')/row['path']).read_bytes())==row['sha256'],(family,row['path'])
PY
node --test web/src/v2/house-wall-plants77.test.js web/src/v2/threshold-wall-fallback77.test.js web/src/v2/textile-near-review76.test.js
node --test web/src/v2/threshold-plants.test.js web/src/v2/meadow-root-cache.test.js web/src/v2/reach-cover-prepared42.test.js
```

The existing prepared tests independently recompute and reject stale signatures; do not skip failures. Baseline asset/dependency restoration is also required for those tests. A repeat `git apply --check` must fail after application. Do not build/start a native browser until the complete source/input gate passes and the current resource and evidence plan permits it. A rebuilt bundle has its own identity; old screenshots do not validate a new build.

## Required meadow reference re-export (plain candidate, no source patch change)

The old v2 complete fully materialized regression genuinely ended2049/2050: its reference artifact still named pre-disposal ecology source provenance. Do **not** waive that assertion, change expected hashes or insert a fingerprint into the old artifact. The updated plain recipe retains the exact ten-source patch and generated wall geometry; after verified22 textile/12prepared inputs, materialize all635 baseline LFS inputs (with explicit candidate overlays), then run the **unchanged actual existing producer** below. It writes only the reference gzip and report. This is not an inputQA companion replay; do not stack its extra instrumentation sources. The independently rebuilt plain bundle remains the original v2 bundle; its new full regression is a separate outcome, not the companion98 focused tests.

Run this only in the already validated isolated checkout. It preserves the entire old parsed reference in memory, invokes the real producer and requires full parsed-object equality excluding **only** the top-level `sources`. It verifies all54 roots implicitly through full-object equality, the exact three fresh source hashes, report semantics and both output byte hashes. Existing original world/contact inputs must be actual bytes; stop if anything is missing. This is a bounded but nontrivial generator operation—do not run alongside an active resource-gated browser/test job without the current plan's permission.

```sh
set -eu
python - <<'PYCODE'
if not __debug__: raise RuntimeError('Optimized Python is forbidden for replay guards')
import pathlib,json,gzip,hashlib,subprocess,os
p=pathlib.Path(os.environ['PKG']);e=json.loads((p/'external-inputs.json').read_text());g=e['meadowReferenceRegeneration'];h=lambda b:hashlib.sha256(b).hexdigest()
producer=pathlib.Path(g['producer']['path']);assert h(producer.read_bytes())==g['producer']['sha256']
for row in g['outputs']:
 b=pathlib.Path(row['path']).read_bytes();assert len(b)==row['before']['bytes'] and h(b)==row['before']['sha256'],row['path']
asset=pathlib.Path('web/public/assets/v2/meadow-reference-v38/source.json.gz')
before=json.loads(gzip.decompress(asset.read_bytes()))
subprocess.run(['node',str(producer)],check=True)
raw=gzip.decompress(asset.read_bytes());after=json.loads(raw)
without=lambda v:{k:x for k,x in v.items() if k!='sources'}
assert without(before)==without(after), 'Entire non-sources object must remain equal'
assert len(after['roots'])==54 and after['sources']==g['semanticGate']['freshSources']
for row in after['sources']:assert h(pathlib.Path(row['path']).read_bytes())==row['sha256']
report=json.loads(pathlib.Path('tools/reports/meadow-reference-source-v38.json').read_text())
assert report['sources']==after['sources'] and report['roots']==54
assert report['sourceBytes']==len(raw) and report['sourceSHA256']==h(raw)==g['semanticGate']['rawSHA256']
assert report['gzipBytes']==asset.stat().st_size
for row in g['outputs']:
 b=pathlib.Path(row['path']).read_bytes();assert len(b)==row['after']['bytes'] and h(b)==row['after']['sha256'],row['path']
PYCODE
```

A failed check is not permission to edit the anchor or adopt intermediate outputs. Preserve failure evidence and recreate a fresh isolated input. Historical independent actual producer replay proves these two bytes and semantics, while this package revision only repeats cheap byte/semantic checks; it does not claim another generator or complete suite run. The new gzip is external/generated under existing LFS rules, never smuggled in this text package.

## Interpretation

The conservative 0.12m world-height slab projection is neither exact aperture-edge collision nor closed-solid containment. The grass-only fallback preserves shared ordinary/basal roots; flowers have no new direct wall trigger, but other callbacks may query walls. Finite 95,362-cell / 113-house audits are not whole-world proof. Cache numeric payload bounds are not V8/renderer RSS hard limits. Initial OOM and stale-prepared failures remain historical failures, not silently passed. Current test/native labels live in `validation-status.json`; old v1 native screenshots cannot certify v2. Full closed-door, cloth contact, final art, motion and target-GPU performance remain open.
