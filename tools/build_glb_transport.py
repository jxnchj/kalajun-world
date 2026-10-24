#!/usr/bin/env python3
"""Build lossless transport copies for the currently loaded structure and spruce GLBs.

Run from any directory: python3 tools/build_glb_transport.py [--check]
The original GLBs are read-only inputs. --check writes no files and verifies the
compressed files, exact decompression, source hashes and deterministic rebuild.
No glTF parsing/re-encoding, mesh optimisation, quantisation or image changes.
"""
import argparse
import gzip
import hashlib
import io
import json
import os
from pathlib import Path
import struct
import sys
import zlib

ROOT = Path(__file__).resolve().parent.parent
PUBLIC = ROOT / "web/public"
MANIFEST = PUBLIC / "assets/v2/glb-transport-manifest.json"
REPORT = ROOT / "tools/reports/glb-transport-report.json"
ASSETS = (
    ("gh_lanchuan_rooms_living39", "web/src/v2/generated/guest-living-source-39.json", "gh_lanchuan", "guestLiving39 candidate"),
    ("gh_lanchuan_lodge_tables38", "web/src/v2/generated/lodge-tables-source-38.json", "gh_lanchuan_lodge", "lodgeTables38 candidate"),
    ("gh_lanchuan_lodge_chairs38", "web/src/v2/generated/lodge-chairs-source-38.json", "gh_lanchuan_lodge", "lodgeChairs38 candidate"),
    ("gh_lanchuan_rooms_vanity38", "web/src/v2/generated/guest-vanity-source-38.json", "gh_lanchuan", "guestVanity38 candidate"),
    ("household_entry_tea", "web/src/v2/household-entry-steps.js", "household_entry_tea", "HouseholdEntrySteps.load"),
    ("household_living", "web/src/v2/household-living.js", "household_living", "HouseholdLiving.load"),
    ("gh_lanchuan_rooms", "web/src/v2/structures.js", "gh_lanchuan", "ASSET_OVERRIDES"),
    ("house_a_lived", "web/src/v2/settlement-assets.js", "house_a", "SETTLEMENT_ASSETS"),
    ("yurt_lived", "web/src/v2/settlement-assets.js", "yurt", "SETTLEMENT_ASSETS"),
    ("schrenk-spruce-hi", "web/src/v2/ecology.js", None, "WorldEcology.load"),
    ("schrenk-spruce-mid", "web/src/v2/ecology.js", None, "WorldEcology.load"),
)
# These complete-building sources were still raw in the first scene. Keep the
# original loader path and original GLBs intact; only transport bytes change.
LEGACY_ASSETS = (
    ("gh_lanchuan_lodge_chairs38", "web/src/v2/generated/lodge-chairs-source-38.json", "gh_lanchuan_lodge", "lodgeChairs38 candidate"),"barn", "house_b", "cabin_small", "lodge24", "gh_fj_hut", "gh_fj_lodge", "gh_fj_shed", "gh_lanchuan_lodge", "gh_tl_wing", "gh_tl_main", "gh_qk_cabin", "gh_qk_long", "haystack", "swing", "yurt_deck")
ASSETS += tuple((name, "web/src/v2/structures.js", name, "WorldStructures._loadAsset") for name in LEGACY_ASSETS)



def sha(data):
    return hashlib.sha256(data).hexdigest()


def encode(raw):
    stream = io.BytesIO()
    # Do not embed the source filename or wall-clock timestamp in the stream.
    # GzipFile also fixes the OS marker to 255, unlike platform-dependent paths.
    with gzip.GzipFile(filename="", mode="wb", compresslevel=9, fileobj=stream, mtime=0) as target:
        target.write(raw)
    return stream.getvalue()


def glb_info(raw):
    if len(raw) < 20 or struct.unpack_from("<III", raw) != (0x46546c67, 2, len(raw)):
        raise ValueError("Invalid GLB 2.0 header")
    length, kind = struct.unpack_from("<II", raw, 12)
    if kind != 0x4e4f534a or length + 20 > len(raw):
        raise ValueError("Invalid GLB JSON chunk")
    doc = json.loads(raw[20:20 + length])
    return {"gltfVersion": doc["asset"]["version"],
            "meshes": len(doc.get("meshes", [])),
            "materials": len(doc.get("materials", [])),
            "images": len(doc.get("images", [])),
            "externalResourceURIs": [v["uri"] for field in ("buffers", "images")
                                     for v in doc.get(field, []) if "uri" in v and not v["uri"].startswith("data:")]}


def write_atomic(path, data):
    path.parent.mkdir(parents=True, exist_ok=True)
    temporary = path.with_name(path.name + ".tmp")
    with temporary.open("xb") as output:
        output.write(data)
    os.replace(temporary, path)
    # Both gzip header mtime and filesystem mtime are deterministic.
    os.utime(path, (0, 0))


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--check", action="store_true", help="verify all generated assets without writing")
    parser.add_argument("--only", action="append", choices=[a[0] for a in ASSETS], help="build/check selected entries, preserving other registered transports")
    args = parser.parse_args()
    entries, details, payloads, original_states = {}, [], {}, {}
    if args.only:
        entries = json.loads(MANIFEST.read_text())["assets"]
    selected = [a for a in ASSETS if not args.only or a[0] in args.only]
    for name, module, asset_id, symbol in selected:
        key = ("assets/" if name in LEGACY_ASSETS else "assets/v2/") + name + ".glb"
        source = PUBLIC / key
        if not source.is_file():
            raise FileNotFoundError(source)
        if name not in LEGACY_ASSETS and name + ".glb" not in (ROOT / module).read_text():
            raise ValueError("Current runtime does not reference selected source: " + key)
        before = source.stat()
        raw = source.read_bytes()
        original_states[source] = (sha(raw), before.st_size, before.st_mtime_ns)
        packed = encode(raw)
        if len(packed) >= len(raw):
            raise ValueError("Selected asset does not benefit from gzip: " + key)
        if packed[:4] != b"\x1f\x8b\x08\x00" or packed[4:8] != b"\x00" * 4 or packed[9] != 255:
            raise ValueError("Non-deterministic gzip header: " + key)
        if gzip.decompress(packed) != raw:
            raise ValueError("Compressed bytes do not reproduce original: " + key)
        entry = {"url": key + ".gz", "rawBytes": len(raw), "gzipBytes": len(packed),
                 "sha256": sha(raw), "gzipSha256": sha(packed)}
        entries[key] = entry
        payloads[PUBLIC / entry["url"]] = packed
        details.append({"source": "web/public/" + key, "transport": "web/public/" + entry["url"],
                        "runtimeReference": {"module": module, "symbol": symbol, "assetId": asset_id},
                        **entry, "savedBytes": len(raw) - len(packed),
                        "savedPercent": round((1 - len(packed) / len(raw)) * 100, 4),
                        "glb": glb_info(raw), "exactDecompression": True})
    totals = {"assets": len(entries), "rawBytes": sum(v["rawBytes"] for v in entries.values()),
              "gzipBytes": sum(v["gzipBytes"] for v in entries.values())}
    totals["savedBytes"] = totals["rawBytes"] - totals["gzipBytes"]
    totals["savedPercent"] = round(totals["savedBytes"] / totals["rawBytes"] * 100, 4)
    manifest = {"schemaVersion": 1, "encoding": "gzip", "gzipMtime": 0, "assets": entries, "totals": totals}
    report = {"schemaVersion": 1, "generator": "tools/build_glb_transport.py",
              "generatorSHA256": sha(Path(__file__).read_bytes()), "zlibVersion": zlib.ZLIB_VERSION,
              "scope": ("Selected transports only: " + ",".join(args.only) if args.only else "Current structure/spruce GLBs and the entity-specific tea entry; original GLBs preserved"),
              "gzip": {"level": 9, "mtime": 0, "filename": "", "os": 255, "filesystemMtime": 0},
              "manifest": str(MANIFEST.relative_to(ROOT)), "totals": totals, "assets": details,
              "validation": {"originalGLBsReadOnly": True, "exactDecompression": True,
                             "compressedFilesReadBack": True, "deterministicRebuild": True},
              "limits": "Transfer size evidence only. Does not establish browser loading time, parsing time or visual acceptance."}
    def serialized(value):
        return (json.dumps(value, indent=2, ensure_ascii=False) + "\n").encode()
    payloads[MANIFEST] = serialized(manifest)
    report_path = REPORT.with_name("glb-transport-selected-report.json") if args.only else REPORT
    payloads[report_path] = serialized(report)
    if not args.check:
        for path, payload in payloads.items():
            write_atomic(path, payload)
    for path, expected in payloads.items():
        stored = path.read_bytes()
        if stored != expected:
            raise ValueError("Generated asset differs from deterministic rebuild: " + str(path))
        if path.stat().st_mtime != 0:
            raise ValueError("Generated asset filesystem mtime is not fixed: " + str(path))
        if path.suffix == ".gz":
            source = Path(str(path)[:-3])
            if gzip.decompress(stored) != source.read_bytes():
                raise ValueError("Read-back decompression differs from source: " + str(path))
    for source, expected in original_states.items():
        stat = source.stat()
        actual = (sha(source.read_bytes()), stat.st_size, stat.st_mtime_ns)
        if actual != expected:
            raise ValueError("Source changed during transport generation/check: " + str(source))
    print(json.dumps({"mode": "check" if args.check else "build", "verified": True,
                      "totals": totals, "assets": [{"source": x["source"], "rawBytes": x["rawBytes"],
                      "gzipBytes": x["gzipBytes"], "savedPercent": x["savedPercent"]} for x in details]},
                     ensure_ascii=False, indent=2))


if __name__ == "__main__":
    main()
