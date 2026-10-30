# Cloud recovery checkpoints

This local-only Python 3 tool packages an **explicit reviewed list of files** against an exact existing Git commit. It never runs project tests, builds, Git LFS downloads, uploads, pushes, or deployments. A local ZIP is not an independent backup: save it to the authorized external destination and verify that saved copy separately.

## Inputs

Create an allowlist JSON array of canonical repository-relative **file** paths. Directories, wildcards, missing files, symlinks and special files are refused. Ignored staging files are included only when named explicitly. Review the list and file contents for privacy before packaging; path filtering is defense in depth, **not a secret scanner**.

```json
["docs/云端恢复与持续开发手册.md", "tools/reports/recovery-gap.json"]
```

Supply a separate status JSON with exactly these fields. Use meaningful concrete task names, source identities and test scope. Empty lists mean the caller supplied no items; the tool does not infer that work passed. `validated_checkpoint` means a verified recovery checkpoint, never automatic feature or visual acceptance.

```json
{
  "status": "partial",
  "unfinished_tasks": ["Reconstruct selected textile candidate and certify combined geometry"],
  "passed": ["Recovered baseline Git and LFS integrity"],
  "failed": ["Historical full regression: terrain 2500 ms readiness budget"],
  "not_run": ["Recovered candidate browser comparison"],
  "pending_acceptance": ["Textile shape and matching new GI"]
}
```

## Pack and verify

Run from any directory; use absolute paths for the arguments below. Replace the example paths with existing files and an existing output parent.

```bash
python3 tools/cloud-checkpoint/checkpoint.py pack \
  --repo "$PWD" \
  --baseline 4e1d6f251ff979760f7020c4d940489cba091c36 \
  --allowlist /path/to/reviewed-files.json \
  --status /path/to/recovery-status.json \
  --output /path/to/checkpoint-new.zip

python3 tools/cloud-checkpoint/checkpoint.py verify \
  /path/to/checkpoint-new.zip --repo "$PWD" \
  --extract-to /path/to/new-isolated-verification-directory
```

The output filename must not already exist. Existing checkpoints are never overwritten. The tool hashes inputs before packaging, checks bytes and normalized executable modes while packaging, and reads all inputs again before finalization. ZIP timestamps and JSON ordering are deterministic. A final atomic, no-clobber publication preserves earlier files. If a source changes, the new package is refused and its temporary ZIP is removed. **This is not a filesystem snapshot:** coordinate a stable checkpoint with writers first; edits after the final observation cannot be prevented by a read-only packager.

`CHECKPOINT.json` records exact baseline commit/tree, all baseline Git LFS pointer paths/object SHA-256/sizes, each selected file's SHA-256/size/mode, and caller-supplied validation/unfinished-task status. Git LFS pointer inventory does not prove that remote LFS objects remain downloadable: separately run `git lfs pull` and `git lfs fsck` in a recovery exercise. New or changed assets absent from the baseline must be selected as real file bytes in this checkpoint, not omitted merely because the path matches a baseline pointer.

Verification checks the exact manifest schema, complete member list, duplicate names, safe relative paths, regular-file types, CRC, SHA-256, lengths, modes and the baseline commit/tree/LFS inventory in the supplied repository. Extraction is allowed only into a newly created isolated directory, never an existing checkout. It does not apply a patch or mutate the Git baseline. Extraction failures can leave a partial new directory; treat it as failed, not recovered.

## Scope and boundaries

- Scope is always `explicit_files_only_no_deletions`. This is a selected-file checkpoint, **not an automatic full working-tree snapshot**. Unlisted modified/untracked files and deletions are not represented. Review `git status` and the gap ledger before deciding it covers all required work. Deletions must be handled in a separately reviewed Git commit or patch; do not claim full recovery if they are missing.
- Keep the original GitHub baseline, immutable archive, status/gap ledger and verification receipt together. A hash in the manifest checks integrity, not provenance; retain the independently saved ZIP hash and version.
- Credentials, `.git`, browser profiles, environment files, caches and common temporary paths are rejected. Do not rename secrets to evade filtering. Inspect any user-approved asset or script contents before external publication.
- Only selected regular file bytes and executable bits are preserved. Ownership, xattrs, timestamps, sparse layout and symlinks are not restored.
- This is a trusted-task recovery utility, not a hostile multi-user filesystem sandbox or a signed archive format. Do not use attacker-controlled output/extraction parents, or archives from untrusted sources. It does not defend against arbitrary simultaneous hostile parent-directory replacement.
- Do not add new successful test claims or mark a candidate adopted simply because ZIP verification passes. Store passed, failed, not-run and pending-acceptance separately.

## Tests

```bash
PYTHONDONTWRITEBYTECODE=1 python3 -m unittest discover -s tools/cloud-checkpoint -p 'test_*.py' -v
```

Tests use temporary miniature Git repositories and local ZIP files only. They do not touch production assets, external services or the project's test suite.
