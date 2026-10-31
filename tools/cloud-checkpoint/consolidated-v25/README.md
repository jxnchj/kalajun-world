# Consolidated-v25 metadata and isolated extraction guards

This is a small **library**, not an automatic restore, uploader, archive builder, runtime installer or production-adoption command. It makes no network calls and does not delete old work. Real account identifiers, actual source schemas and private trust anchors are deliberately absent.

## Provenance and changes

The source validator used for the independently verified 37-source v25 checkpoint had SHA256 `ee004422901b7d0b9d0a5eac2aef3e0017baf55b0e6080460f34db3ca8e0ca96`. This public port adds an explicit import-time rejection of optimized Python (`-O` and `-OO`) **before any file is read or written**. Its SHA therefore differs; it is not relabelled as the historical validator. Core validation already uses explicit `require`/`ValueError`, not assertions. The extra guard also prevents silently relying on optimized-away caller/test assertions.

The original eleven test categories are retained using a wholly synthetic in-memory schema and a temporary external anchor; a twelfth category invokes actual `python -O` and `-OO` subprocesses and verifies rejection with no marker/output side effects. No real Library identity or project payload is embedded in test data.

Run with ordinary Python 3.12 or a compatible supported Python, **not** optimized mode:

```sh
PYTHONDONTWRITEBYTECODE=1 python -m unittest discover -s tools/cloud-checkpoint/consolidated-v25 -v
```

These tests use only tiny temporary fixtures (the extraction round trip is three bytes). They do not restore project files, consume real assets, run browsers, rebuild the runtime or certify the complete private archive.

## Required trust boundary

`validate_schema(metadata, expected_anchor_sha=trusted_pin, anchor_path=external_anchor)` requires a 64-character SHA256 obtained from a **separate trusted record**. Always supply `anchor_path` explicitly. Never compute a replacement trusted pin from an anchor bundled in the untrusted input you are validating; co-tampered schema and anchor must fail against the original external pin. Missing or mismatched pins fail closed.

For the historical 37-source v25 result the externally reviewed anchor pin is `91f83ffdca6ced728ba2d795414bc92af6f469758062add2bd23008741ddd58f`. This is a historical identification, not permission to accept arbitrary future data or an implicit download link. Retrieve the matching private anchor/schema using the user's authorized recovery record. Do not put those private metadata files into this public tools directory.

The schema contract is intentionally version-specific (`kalajun-consolidated-v25/1`, expected primary predecessor24 and no prospective version assigned, two recipe layouts including20 source overlays/12 prepared/22 candidates). It is not a validator for any arbitrary backup/version. Reject incompatible layouts instead of weakening checks or rewriting a historical anchor.

## APIs and sequencing

1. Verify the actual archive's whole SHA256 against an independently trusted fixed-version receipt. Validate the supplied schema against its pinned external anchor. This checks production commit, primary identity, all source metadata, roles/destinations/recipes, current Git blobs, normalized destination uniqueness, reverse occurrence coverage and no automatic adoption.
2. Construct an **independently authorized exact entry inventory** for the ZIP, with `destination`, byte length and SHA256 for every regular entry. The historical full ZIP contains extra control/source-metadata entries in addition to schema variants. `schema['variants']` alone is not the full entry list. Those extra entries must also be bound to trusted receipts/control metadata; do not trust a self-declared entry index just because it is inside the same ZIP. This generic library intentionally does not recreate the private full-builder/remote-verifier orchestration.
3. In an exclusive trusted workspace, call `verify_extract(zip_path, complete_rows, fresh_target)` explicitly. Target must **not exist**, including an empty directory or symlink. Never target a live project, old worktree or evidence folder. The API will not overlay, resume or adopt candidates.
4. An exception means **failure**. Preflight entry/path/type/size/cap errors happen before target creation. Payload hash/CRC/decompression errors can occur after a partial fresh output has been written; retain it as failed evidence, not a successful restore. No automatic cleanup occurs. Choose another new target after diagnosing the cause.

The extractor checks exact entry set/count, Unicode/case collisions, file/directory prefix conflicts, path traversal, symlink parents, nonregular or extra-metadata entries, total/file/ratio bounds, streamed byte counts and payload SHA256. It refuses overwrites using exclusive file creation. Defaults:10,000 entries,128MiB/file,1GiB aggregate, compression ratio1000. Do not raise caps to force an unknown archive through.

This is **not a concurrent adversarial filesystem sandbox**: use an exclusive trusted parent directory, not a shared attacker-writable tree; path checks are not dirfd-based race-proof isolation. A valid extraction alone does not prove payload semantics, executable safety, LFS availability, new build/tests or runtime quality.

## Recovery versus adoption

The v25 result records635 baseline LFS identities, not their actual object bytes. Obtain and verify those external LFS inputs against the pinned Git baseline separately. Preserve current Git text and conflicting historical variants in their mapped namespaces; do not overlay history/candidate data onto newer production. Recipes stay `NOT_EXECUTED` until a separate authorized, verified reconstruction runs. Neither these twelve tests nor historical remote-extraction PASS proves a full regression, native scene, asset adoption or deploy.
