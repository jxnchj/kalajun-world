# Terrain budget77 workerfix-v2 isolated source replay — NOT production adoption

This review package is not a playable asset bundle. It contains exact six-source combined patch, tests and operational replay tools only. Begin with a **new, clean isolated Git worktree at917618d6125e9766e0722b321943f56d5a3b3e54 or a descendant whose bound runtime inputs match**; never apply on live production or an active native/recovery fixture. Keep latest Git documentation, not old backup text. Before restoration, verify clean tracked/untracked state and baseline ancestry. All commands below assume exclusive trusted local workspace; not adversarial concurrent-filesystem safety.


## Workerfix-v2 source boundary

The combined patch now contains original3budget source files plus terrain-row-worker-client.js and its test and terrain-prepared42.test.js. Apply once to a NEW verified plain-v3 baseline; do not apply combined patch on v1 or stack older patches. The immutable old9-file source-review/4docs draft remains historical and unpublished. New54source tests independently pass strict unknown/invalid/query-policy negatives; this restores eligibility without relaxing unsupported variants. It does not itself prove native worker execution.

All5prepared closures/267rows,638public files and428shards remain unchanged. **Do not rerun or retag producer outputs for worker-policy correction**: use the prior genuine outputs with their exact hashes. The full generation recipe below exists to reconstruct the underlying original-budget dependency from plain, not to assert workerfix required new terrain geometry. New small workerfix archive depends on the prior492payload terrain archive and separate fullproducer archive, plus earlier wall/plain dependencies. Exact6source afterhashes bind the composition; old3source-only package is not the latest native candidate.

## Restore dependencies first

Use the already published `tools/wallplants77-source-review/README.md` and its SHA-bound external-inputs recipe to restore the exact **plain wall-v3**, not inputQA companion. This requires actual635baselineLFS objects,22cloth overlays,12prepared meadow/cover, source-derived wall geometry, and the actual two **post-v25 meadow reference regeneration outputs**. Git alone cannot supply those candidate assets. Refer to this package's `external-inputs.json` for archive SHA/receipt pins (no private IDs), old plain2904contract hash,2680runtime/asset/source inputs, protected22/12 and final267closure rows. Newer Git recovery text is deliberately excluded from historical runtime hashes. Extra runtime files/dependencies must be reviewed, not silently adopted.

The final terrain backup contains492payloads including61stage files and428binaryshards, but full producer65MBpack+manifest is a separately pinned producer12000 backup dependency. Preserve old plain manifest/pack/public outputs in a separate verified baseline directory for comparison. Do not modify archives or reuse older payloads with new hashes. If any external dependency is unavailable, STOP: the source patch alone is not a reproducible playable candidate.

## Fail-closed pre-patch guard

Set `REPLAY` to the isolated restored candidate and `PACKAGE` to this directory (absolute local paths chosen by you). The marker confirms intent, not proof that a directory is non-production. The guard binds actual pre-patch runtime bytes, baseline ancestry, package content and absence of new source paths; a failed guard must stop the shell. It is read-only. It does not authenticate a manifest supplied by an attacker: obtain the package from the independently verified Git commit.

```python
# REPLAY_GUARD_BEGIN
if not __debug__:
    raise RuntimeError('Optimized Python forbidden before any reads/writes')
import os, json, hashlib, pathlib, subprocess

def digest(p):
    return hashlib.sha256(p.read_bytes()).hexdigest()

def safe(root, rel):
    parts=pathlib.PurePosixPath(rel)
    if parts.is_absolute() or not parts.parts or any(x in ('..','.') for x in parts.parts) or '\\' in rel:
        raise ValueError('Unsafe relative path')
    p=root
    for part in parts.parts:
        p=p/part
        if p.is_symlink(): raise ValueError('Symlinks refused')
    return p

def verify(root, package, checkgit=True):
    root=pathlib.Path(os.path.abspath(root)); package=pathlib.Path(os.path.abspath(package))
    if root.resolve()!=root or package.resolve()!=package: raise ValueError('Symlinked ancestor refused')
    if os.environ.get('TERRAIN77_ISOLATED_REPLAY')!='YES': raise ValueError('Explicit isolated replay intent required')
    if root.is_symlink() or not root.is_dir(): raise ValueError('Require existing real directory')
    m=json.loads((package/'manifest.json').read_text())
    if digest(package/'external-inputs.json')!=m['externalInputsSHA256']: raise ValueError('External manifest tampered')
    if digest(package/'candidate.patch')!=m['patchSHA256']: raise ValueError('Patch tampered')
    if checkgit: subprocess.run(['git','-C',str(root),'merge-base','--is-ancestor',m['gitBase'],'HEAD'],check=True)
    e=json.loads((package/'external-inputs.json').read_text())
    for rel,want in e['requiredBeforeSourceReplay'].items():
        f=safe(root,rel)
        if not f.is_file() or digest(f)!=want: raise ValueError('Missing/tampered bound input: '+rel)
    for f in m['sources']:
        p=safe(root,f['path'])
        if f['beforeSHA256'] is None:
            if p.exists(): raise ValueError('New source already exists; refuse repeat/overwrite')
        elif not p.is_file() or digest(p)!=f['beforeSHA256']: raise ValueError('Pre-source mismatch')
    for f in [m['originalProducer'],m['unchangedPriorityProducer']]:
        if digest(safe(root,f['path']))!=f['sha256']: raise ValueError('Producer mismatch')
    driver=safe(root,m['versionedProducer']['isolatedDestination'])
    if driver.exists(): raise ValueError('Versioned driver already exists')
    return True

if __name__=='__main__':
    verify(os.environ['REPLAY'],os.environ['PACKAGE'])
# REPLAY_GUARD_END
```

Save the exact above Python block to a temporary guard file outside the candidate. Run with ordinary Python, not `-O/-OO`, and fail-fast shell:

```sh
set -eu
export REPLAY PACKAGE
export TERRAIN77_ISOLATED_REPLAY=YES
python "$GUARD_FILE"
git -C "$REPLAY" apply --check "$PACKAGE/candidate.patch"
git -C "$REPLAY" apply "$PACKAGE/candidate.patch"
```

After application verify all six source afterSHA256/size values against manifest. Do not proceed after any mismatch. The following installs the exact versioned offline driver with exclusive-create semantics; its original6000producer remains unchanged. The driver imports `../web`, so **must reside at isolated tools/build-terrain-prepared42-12000.mjs**, never execute directly from this review/repro directory.

```python
if not __debug__:
    raise RuntimeError('Optimized Python forbidden before any reads/writes')
import os,json,pathlib,hashlib
r=pathlib.Path(os.path.abspath(os.environ['REPLAY']));p=pathlib.Path(os.path.abspath(os.environ['PACKAGE']))
if r.resolve()!=r or p.resolve()!=p: raise ValueError('Symlinked ancestor refused')
def safe(root,rel):
    parts=pathlib.PurePosixPath(rel)
    if parts.is_absolute() or not parts.parts or '..' in parts.parts or '\\' in rel: raise ValueError('Unsafe relative path')
    x=root
    for part in parts.parts:
        x=x/part
        if x.is_symlink(): raise ValueError('Symlinks refused')
    return x
m=json.loads(safe(p,'manifest.json').read_text())
for f in m['sources']:
    b=safe(r,f['path']).read_bytes()
    if len(b)!=f['bytes'] or hashlib.sha256(b).hexdigest()!=f['afterSHA256']: raise ValueError('Postpatch mismatch')
f=m['versionedProducer'];b=safe(p,f['packagePath']).read_bytes();old=safe(r,m['originalProducer']['path']).read_bytes()
if hashlib.sha256(b).hexdigest()!=f['sha256'] or hashlib.sha256(old).hexdigest()!=m['originalProducer']['sha256']: raise ValueError('Driver binding mismatch')
if old.count(b'iterations<6000')!=1 or old.replace(b'iterations<6000',b'iterations<12000')!=b: raise ValueError('Not sole operational-ceiling replacement')
target=safe(r,f['isolatedDestination'])
if target.parent.is_symlink() or target.is_symlink(): raise ValueError('Symlink refused')
with target.open('xb') as out: out.write(b)
```

## Genuine regeneration, not fingerprint relabel

Under the **existing external producer1.5GiB/120s guard**, execute isolated `node tools/build-terrain-prepared42-12000.mjs` with Node global location absent (original batching, NOT QA32mode). This is a separately versioned12000 operational ceiling, not a repair of the original6000failure. Stable queue0+morph0×8 completed at6207 in the recorded run. No further ceiling/cap expansion is authorized by this recipe. Preserve the original6000 failures and outputs.

For **exact backup restoration**, BOTH historical full outputs must match the recorded SHA/size; never weaken those identities. For a **new genuine regeneration**, the full manifest includes nondeterministic timing/scheduling stats and need not equal the historical whole-file SHA. Record the new actual manifest SHA and complete stats diff, require the exact row/fullpack byte contract and fixed semantic fields, and HOLD any unexplained logical change; do not hide stats or reuse the historical hash. The full pack must still match the expected byte identity. The verifier below compares geometry/row/raw/pack and fixed semantic fields while reporting full stats differences. Public manifests/shards remain exact expected identities under the same source/input/header variant. The unchanged priority producer remains SHA-bound. Then under the same external bounded process policy run `node tools/build-terrain-priority42.mjs` and `node tools/build-terrain-priority42.mjs all`. Verify bothpublic manifests plus all428shards against external-output identities, all267sourceclosure rows and22/12protected inputs. Dependency installation uses pinned existing web/package-lock and is separate; no vendored node_modules or browser profiles.

Run exact `verify-packaging-v2b.py OLD_VERIFIED_PLAIN NEW_CANDIDATE ACTUAL_CODE_JSON --public` under a bounded external runner. ACTUAL_CODE_JSON must come from a fresh `terrainPreparedCodeBinding42()` calculation, not from copying the expected constant; compare it with external-inputs terrainCode and allsource SHA first. Verifier is exact current dataset/shape, not a generic archive unpacker. Its original strict predecessor **FAILED**. Prospective v2b permits only old19/new3 gzip OS byte9, with every other compressed byte and all decoded bytes equal, same keys/order/offsets/parents/schema/scalars; actual new compressed hashes retained. Runtime compressed SHA checks and original kernel tests remain unchanged. The full stats diff remains in verifier output, not stripped. No gzip/header rewriting is permitted.

**Original budget-v1 historical focused gate:**33budget/sibling source tests plus original20prepared actual-kernel tests = author53; not the current workerfix test count. **Corrected workerfix-v2 focused gate:**54author and54fresh independent tests passed, including strict query-policy negatives and prepared-consumer admission. `node actual-fixed32-audit.mjs "$REPLAY"` uses a small actual-world64parent/256child domain, not the native resident scene. These commands require actual dependencies/assets and their existing guard; do not run parallel to native. This publication's tiny test-replay-guards.py does NOT rerun those heavy gates.

Build is a separate gate: initial1.5GiB guard failure remains; subsequently authorized build-only3GiB/120s/floor4GiB passed. Native remains4GiB/1320s; do not silently use build allowance to widen browser guard. Build/HTTP tests do not prove native memory/art/FPS. Current independent terminal: exactworkerfix387selectedfiles2068/2068PASS, zero fail/skip/cancel/todo, complete2066toplevel+2nested TAP. One serialdefaultheap invocation1042.926s withunchanged assertions andv4guards; not inheritedplain2050. Exact2906startingcontract included2already-generated reports, then onlythose2expected reports changed duringrun. Restore their actualrecorded startingbytes from verifiedexternalproof before claiming exacttestedinput; source replay alone does not silently replace them. See external-inputs andvalidation-status for contract/evidence/backupSHA. Original budget-v1 native paused at52/60: rowWorker disabled frombefore due missing new querykey in strict compatibility policy. That case is NOT accepted. Corrected workerfix-v2 native TERMINAL:59/60control steps,held63,door0/GI0ready andworkerready/errornull/999completed are actual bounded evidence. Frozen plan required exact60/held64, so optionalclothstatic65 NOT_RUN; remaining0 afterpause means cleared request, not completed60. No matchedbaseline64, generalmemoryfix, fullart/FPS or adoption claim. Peak sampled ownedRSS3848980KiB beloworiginal4GiB only for this partialcase. See validation-status.json and independent receipt hashes; The current full serial suite2068/2068PASS is separate CPU evidence and does not complete this native59/60 trajectory.

## Recovery and adoption boundaries

`.pack`,`.gz` and other assets obey repository LFS rules; CLI LFS write authorization remains unavailable. Do not embed binary bytes/Base64 or disguise derived assets as JS/text. Recover exact candidate data from verified independent backups or regenerate genuinely. Fixed32MiB applies live+reserved numeric merged-copy accounting only, not JS heap/retired GC/driver/GPU/RSS. Activation requires terrainBatchBudget77=1 AND softwareReview75=1; terrainBatches=0 still disables, default absent/0 behavior unchanged. No production/default adoption, geometrysharing, quantization, density/LOD/material/door/physics change or deployment.
