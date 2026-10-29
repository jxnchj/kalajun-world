#!/usr/bin/env bash
# Run from the native cloud Terminal. This selects a software GL driver, not an
# unsafe WebGL fallback. It does not automate the browser or change security flags.
set -euo pipefail
if [[ $# != 2 ]]; then
  printf 'Usage: %s NEW_PROFILE_DIRECTORY LOOPBACK_HTTP_URL\n' "$0" >&2
  exit 2
fi
profile=$1
url=$2
# Share the strict URL/path validators with the monitored launcher. In
# particular, a loopback-looking userinfo prefix must not admit remote hosts.
python3 - "$profile" "$url" "${BASH_SOURCE[0]}" <<'PY'
from pathlib import Path
import argparse
import sys
sys.path.insert(0, str(Path(sys.argv[3]).resolve().parent / 'monitor'))
from native_owned_monitor import fresh_run_path, loopback_url
try:
    loopback_url(sys.argv[2])
    fresh_run_path(sys.argv[1])
except (ValueError, argparse.ArgumentTypeError) as exc:
    print(str(exc), file=sys.stderr)
    raise SystemExit(2)
PY
command -v chromium >/dev/null
# Exclusive creation, no parent creation or profile reuse.
mkdir -m 700 -- "$profile"
exec chromium \
  --user-data-dir="$profile" \
  --use-gl=angle \
  --use-angle=swiftshader \
  --new-window "$url"
