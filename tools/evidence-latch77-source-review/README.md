# Evidence latch77 QA-only source replay

This package adds7QA source files to a NEW isolated verified workerfix candidate, not production. Gitbase1d9ff5d or descendant with exact bound inputs. Existing F/Run60, scheduler/delta/fences, sourcebindings267rows,638public assets/22cloth/12prepared and defaults remain unchanged. New fullsuite onQA NOT_RUN; previous workerfix2068 belongs priorcode, not this helper.

## Required dependencies

Begin clean isolated Gitworktree, verify base ancestry, restore exact workerfix using SHA-pinned published tools/terrain-budget77-source-review recipe. This includes actual635LFS objects,22cloth/12prepared,derivedwallgeometry,post-v25two meadowreference outputs,492terrain archive/fullproducer dependency,29workerfix archive and exact2startingreports. Gittextalone is NOT a playable candidate. external-inputs binds runtime/source/asset preconditions and publishedrecipe SHA; latestGit human docs win overolder backup text. Do not blindly use active liveworktree or historicalvariants. No productionoverwrite; exclusive trustedworkspace required, not raceproof adversarialFS.

## Read-only prepatch guard

Export REPLAY/PACKAGE absolute paths, LATCH77_ISOLATED_REPLAY=YES. Save exact Python block to an externaltemporary GUARD_FILE. It checks ancestry, boundinputs and absenceofnewQAfiles; repeatedapply/refusal and symlink/optimizedPython failclosed. Package trust comes fromverifiedGit commit, not its self-reported hashes.

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
    if os.environ.get('LATCH77_ISOLATED_REPLAY')!='YES': raise ValueError('Explicit isolated replay intent required')
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
    return True

if __name__=='__main__':
    verify(os.environ['REPLAY'],os.environ['PACKAGE'])
# REPLAY_GUARD_END
```

```sh
set -eu
export REPLAY PACKAGE
export LATCH77_ISOLATED_REPLAY=YES
python "$GUARD_FILE"
git -C "$REPLAY" apply --check "$PACKAGE/candidate.patch"
git -C "$REPLAY" apply "$PACKAGE/candidate.patch"
```

The793B embedded source identity JSON is sourcehash metadata, NOT geometry. Regeneration is deterministicfromexact4paths; the following recomputes bytes in memory and verifies the supplied record before build without changing sources. Never copy a new hashlabel to conceal changed source.

```python
if not __debug__:
    raise RuntimeError('Optimized Python forbidden before any reads/writes')
import os,json,pathlib,hashlib
r=pathlib.Path(os.path.abspath(os.environ['REPLAY']));p=pathlib.Path(os.path.abspath(os.environ['PACKAGE']))
if r.resolve()!=r or p.resolve()!=p: raise ValueError('Symlinked ancestor refused')
def safe(root,rel):
    parts=pathlib.PurePosixPath(rel)
    if parts.is_absolute() or not parts.parts or '..' in parts.parts or '\\' in rel: raise ValueError('Unsafe relative path')
    q=root
    for part in parts.parts:
        q=q/part
        if q.is_symlink(): raise ValueError('Symlink refused')
    return q
m=json.loads(safe(p,'manifest.json').read_text())
for f in m['sources']:
    b=safe(r,f['path']).read_bytes()
    if len(b)!=f['bytes'] or hashlib.sha256(b).hexdigest()!=f['afterSHA256']: raise ValueError('Postpatch source mismatch')
paths=m['bindingSourcePaths']
if sorted(paths)!=sorted(['src/v2/evidence-latch77.js','src/v2/software-review75.js','src/v2/software-review-policy75.js','evidence-latch-smoke77.js']): raise ValueError('Binding keyset mismatch')
record={'schema':'evidence-latch-source77-v1','scope':'Embedded exact source identity. Actual emitted shared chunk is independently SHA-verified over HTTP; this is not self-attested browser acceptance.','sources':[{'path':x,'sha256':hashlib.sha256(safe(r/'web',x).read_bytes()).hexdigest()} for x in paths]}
expected=(json.dumps(record,indent=2)+'\n').encode()
if safe(r,'web/src/v2/evidence-latch-source77.json').read_bytes()!=expected: raise ValueError('Stale source binding; STOP, do not retag to bypass')
```

Build only isolated NEW output under separately approved3GiB/120s/floor4GiB buildguard; use installedpinnedweb/package-lock dependencies (not shipped). From isolated web run `node node_modules/vite/bin/vite.js build --config vite.latch77.config.js --outDir NEW_EMPTY_EXTERNAL_DIST`. Multi-entry config and actual world/fixture sharedcompiledchunk are required; not defaultvitebuild or copiedbundle labels. Verify currentworld/fixture/sharedmodule HTTP byteSHA and same267sourcebindings/638public hashes. No producer regeneration or asset retag needed. Newoutputs' bundle names/hashes must be recorded from actualbuild.

Tests: author52focused, independentfresh36source subset; no claim all52independentlyrerun. Lightweightpackageguardtests do not rerun native/heavyasset/kernel tests. New fullsuite onthisQA helper NOT_RUN, prior2068doesnottransfer.

## Prospective protocol, historical rules preserved

PRE_F and CLOSED64 immutable in-memory slots are a new explicitly reviewed protocol. Arm only captures evidence, not F/Run60. Eachslot256KiB/export1MiB data caps are not RSS/GPU limits. Mutation/missing/crash/exportfailure means evidencefailure; no retrospective repair ofold52/59step runs orold disk-before-return rule. ActualLIGHT sharedcompiled fixture uses labeledstubs and0worldcounters; not WORLDacceptance. Original4GiB/1320s,unfinishedpause1020s,atleast280s beforeoptional unchanged; AFTER65 remains separate originalexport.

WORLD actual4/64/65 terminal and explicitcopiedpair/afterfile are now independentlyreviewed andbacked up; exact60simulationsteps thenstatic65delta0. Whole64hexUIcomparison remainsINCOMPLETE; first60hexprefix+bytesvisible andactualfilefullSHAknown. Resourcepeak4111528KiB leavesonly80.84MiBheadroom underoriginal4GiB; renderwork differs oldbaselines, notcausalmemoryfix. Originalreceipt overclaim retained andsuperseded by explicitwordingcorrection, no retry to erase history. ExplicitlycopiedJSON/filefullSHA can beverified independently, but screenshotUI exposes only60hexprefix, NOT full64visualmatching. No globalmemoryfix,finecontact/fullart/FPS/defaultadoption. Privatephotos,profiles/downloadIDs/images andruntimebinaryassets excluded.
