# Cloud Linux native owned-browser monitor — 2026-10-29

This installed helper runs only on Linux with `/proc`, Python pidfd support, and an authorized native desktop session. It is not a portable macOS/Windows launcher. Run it through the **cloud native Terminal**, not an exec-tool browser command. There is no browser-control, CDP, remote-debugging, JavaScript injection, screenshot, or page-evaluation API here.

Synthetic process/validation tests and the separate default/CPU-compositor lightweight native preflights have passed. Those are distinct from source regression, full-world rendering, and performance acceptance. Historical result hashes identify the exact source used at launch; later path-validation/portability hardening has synthetic coverage but does not retroactively change that launch evidence.

## Preconditions and exact native command

First establish a reachable, already-authorized **native-Terminal** loopback preflight server. Do not infer reachability from an exec-tool server's listening line. Confirm only one live 3D scene before any later world navigation. Full-source tests and scene scheduler review are independent gates; this launcher does not waive them.

Set `REPO` to the canonical absolute checkout path. Run directories must be **new and nonexistent**, below this checkout or `/tmp`; the parent must exist, with no symlink or `..` ambiguity. Existing profiles are never reused. Keep raw run evidence below ignored `backups/` or outside the checkout, never in a source commit. The first URL is always the lightweight preflight, not a scene.

Serve the installed helper in a separate native Terminal:

```sh
: "${REPO:?Set the canonical absolute checkout path}"
python3 -u -m http.server 5175 --bind 127.0.0.1 \
  --directory "$REPO/tools/cloud-review75"
```

In the monitor Terminal:

```sh
: "${REPO:?Set the canonical absolute checkout path}"
mkdir -p "$REPO/backups/cloud-review75"
RUN_DIR="$REPO/backups/cloud-review75/native-owned-preflight-01"
python3 -u "$REPO/tools/cloud-review75/monitor/native_owned_monitor.py" \
  --run-dir "$RUN_DIR" \
  --url http://127.0.0.1:5175/preflight.html \
  --window-size 1288,891 \
  --outer-seconds 300 \
  --cleanup-seconds 10 \
  --poll-seconds 1
```

For the separately reviewed nineteen-frame controlled-motion scope, use a different new directory and `--outer-seconds 1320`. For a separately reviewed static scope, use `--outer-seconds 300`. **Those numbers include preflight/window setup, all scene observation and cleanup.** There is no scene-start reset or deadline extension. Defaults are 1320 seconds total, with cleanup commencing no later than 1310 seconds; choose the scope explicitly. A short preflight run is not evidence that a subsequent full world will fit.

The native Chromium argv is exactly:

```text
/usr/bin/chromium --user-data-dir=NEW_RUN_DIR/profile --use-gl=angle --use-angle=swiftshader --gpu-watchdog-timeout-seconds=180 --force-device-scale-factor=1 --window-size=1288,891 --new-window http://127.0.0.1:5175/preflight.html
```

The installed `/usr/bin/chromium` Debian shell wrapper finally execs `/usr/lib/chromium/chromium` in normal mode. Its distribution defaults are additional to the requested argv and are not independently audited by this tool. It can otherwise inspect old `$HOME/.config/chromium/Crash Reports`; therefore this launcher also creates **fresh HOME, XDG_CONFIG_HOME, XDG_CACHE_HOME and XDG_DATA_HOME inside its run directory**. It preserves the native display/runtime environment. No existing browser profile or data is deleted, reused, or modified by this launcher. All new directories are mode 0700. No cleanup deletes these retained evidence/profile directories.

The program accepts no arbitrary Chromium-flag passthrough. It never adds `--no-sandbox`, sandbox-disabling switches, unsafe SwiftShader fallback, ignore-blocklist switches, remote debugging, or watchdog-disabling switches. It preserves a finite watchdog at 180 seconds. No setting here changes rendering density, geometry, samples, reflections, shadows, DPR, or global lighting/color. Sandbox correctness is not proven merely by the absence of dangerous flags.

### Explicit full-world CPU-compositing option (default unchanged)

Only the separately reviewed full-world route may opt in to `--full-world-cpu-compositing`. This adds exactly `--disable-gpu-compositing` and leaves the default preflight argv unchanged. Chromium's primary source describes this switch as “Prevent the compositor from using its GPU implementation.” It separately defines `--disable-gpu` and `--disable-gpu-watchdog`; this launcher adds neither. Thus this is compositor selection, not a sandbox/watchdog disable. It does not by itself prove the runtime renderer, capability preservation, or successful full-world rendering. [Chromium `content_switches.cc`](https://chromium.googlesource.com/chromium/src/+/master/content/public/common/content_switches.cc), retrieved 2026-10-29, resolved to `refs/heads/main`, blob `aeec68d9de48351df2e8236ad5c1f1f3c2ee5740`, lines 136–141 and 163–165.

For the reviewed 1320-second full-world scope, type in the native Terminal:

```sh
RUN_DIR="$REPO/backups/cloud-review75/native-owned-fullworld-01"
python3 -u "$REPO/tools/cloud-review75/monitor/native_owned_monitor.py" \
  --run-dir "$RUN_DIR" \
  --url http://127.0.0.1:5175/webgl-cpu-preflight.html \
  --window-size 1288,891 \
  --full-world-cpu-compositing \
  --outer-seconds 1320 \
  --cleanup-seconds 10 \
  --poll-seconds 1
```

This still starts with **preflight first**. Verify the settled visible 1280×800/DPR1 and capability gate below, then navigate the same native window to the reviewed scene URL only after its separate source/scheduler gates pass. SwANGLE, the 180-second watchdog, existing sandbox behavior, memory/RSS guards, and the original total deadline remain unchanged. The preflight setup and ten-second cleanup reservation are inside 1320 seconds. No full-world run of this optional mode has yet been verified.

## Required visible viewport gate

The native preflight measured **outer 1288×891 → inner 1280×800, DPR 1** after a settled native resize and reload. The cloud desktop initially respected the launch request but later auto-normalized the window to 1188×848. Therefore **the launch flags are not sufficient evidence**:

1. Open only the preflight with the command above.
2. Use native CUA to move/edge-resize to the measured outer 1288×891 if necessary.
3. Reload normally after the window has settled; wait for the visible preflight result.
4. Require visible `innerWidth:1280`, `innerHeight:800`, `devicePixelRatio:1`, plus the expected successful WebGL2/capability result. An earlier stale result is not sufficient.
5. Only after source/full-test/scheduler gates pass may this **same isolated window** be navigated to the reviewed loopback scene URL. The monitor's original total clock continues throughout.

If the fresh HOME or CPU-compositing option changes window manager behavior, measure again. The recorded native lightweight default-mode run of this helper completed: root PID 792/start ticks 288036/process group 792, twelve observed processes, peak sampled owned RSS 801804 KiB; Ctrl+C cleanup used verified pidfd signals and ended with remaining `[]`, unknown `[]`, signal errors `[]`, root return code 0. This is preflight/cleanup evidence, not a full-world run or proof that unobserved detached helpers are absent. The optional CPU-compositing mode is not covered by that completed run.

## Bounds, ownership and evidence

- Prestart `MemAvailable` must be at least **4,500,000,000 bytes**. The guard is checked again immediately before launch and cannot be lowered by CLI.
- Sampled combined RSS cap: **2,097,152 KiB** (2 GiB), including the fresh original process group **plus observed descendants even if they later move groups/sessions**. `--rss-cap-kib` can only tighten this limit. Per-process RSS is summed, so shared pages may be counted more than once. This is conservative sampled accounting, not a hard memory limit or proof that no between-poll peak occurred.
- Fresh `start_new_session=True` launch; root PID, process group, session, UID and `/proc` start ticks are recorded. A matching owned group member must still anchor any newly adopted original-group member. Descendant adoption requires a birth-verified parent/child relationship. Once an identity is observed, a later reparent does not erase it.
- Every signal opens a Linux pidfd and rechecks PID/start ticks/UID before signaling that fd. Identity ambiguity, PID reuse or inaccessible identity fails closed. There is **no** `killpg`, `pkill`, `killall`, argv substring kill, or pre-existing-browser discovery.
- `/proc/PID/cmdline` is retained as raw base64 at first observed ownership. NUL-delimited versus flattened-or-single-argument representations are labeled; neither is parsed to infer browser identity or ownership. The launched argv is retained independently in `launch.json`.
- Each poll records owned process identities, RSS, state, original-group RSS, combined owned RSS, `MemAvailable`, and observation errors in fsynced `events.jsonl`. `root-identity.json`, `browser.log`, `launch.json`, and `summary.json` are retained.
- Ctrl+C/SIGTERM/SIGHUP or creating `NEW_RUN_DIR/CANCEL` triggers cleanup. Cap, deadline, or owned-identity observation failure also stop the run. SIGTERM is sent only to verified owned identities; SIGKILL follows halfway through the reserved cleanup interval if needed. Newly observed owned children during cleanup are included. Cleanup is never extended past the original deadline.
- A Python-level monitor error uses journal-independent, pidfd-verified emergency cleanup within the remaining budget. If ownership cannot be established, it does not guess. Uncatchable SIGKILL, host/interpreter failure, OS scheduling stalls, and indefinitely blocked kernel/filesystem calls cannot be made safe/bounded by this Python monitor alone.

### Exact completeness limit

A process that **detaches and reparents before any poll observes its ancestry or original group** may escape attribution. This tool does not claim to discover all Chromium processes. Its final `no_live_observed_owned_at_final_snapshot` means only that the identities it could own were no longer live at that snapshot; `all_browser_descendants_proven_absent` is deliberately always **false**. Remaining live/unknown identities and signal failures are explicit. Zombies are recorded but not treated as running render work. Retained data is not deleted. A shutdown/deadline/RSS result is not a scene pass.

The userspace deadline is monotonic and all intentional waits are finite. A final snapshot and fsync can finish slightly after the nominal boundary; this is not a kernel-enforced real-time guarantee. The ten-second cleanup reservation avoids knowingly scheduling extra grace after the total budget.

## Safe cancellation and interpretation

Prefer Ctrl+C in the identified monitor Terminal. Alternatively, in another native Terminal:

```sh
touch "$RUN_DIR/CANCEL"
```

Do not close the monitor Terminal or kill unrelated browsers. Exit 0 means the launched root returned 0 with no live **observed owned** process remaining, not visual acceptance. Exit 1 means an observed-scope cleanup after deadline/cap/cancel or nonzero root exit. Exit 2 is CLI/preflight rejection. Exit 3 means monitor/cleanup trouble or unresolved observed ownership; inspect retained evidence and the native window. A short canceled preflight commonly exits 1 by design.

## Synthetic tests (never Chrome)

```sh
cd "$REPO/tools/cloud-review75/monitor"
python3 -m unittest -v test_native_owned_monitor.py
```

The original 19 monitor tests cover: tricky `/proc/stat` comm parsing; MemAvailable units/ambiguity; URL and dimensions; exact requested flags; explicit CPU-compositor opt-in adding only one flag with unchanged defaults; no profile reuse/symlink parent; raw NUL/flattened cmdline retention; verified group/descendant adoption; observed detached/reparented ownership; PID/group reuse rejection; UID/birth rejection; revalidation failure; unreaped zombie root group anchor; pidfd mismatch no-signal; and real lightweight Python trees stopped on RSS cap, deadline and cancellation, including TERM-ignoring escalation and an unrelated sentinel left untouched. Four additional publication-hardening tests cover checkout-relative allowed roots plus the minimal launcher's strict URL/profile rejection and unchanged argv. All 23 tests passed on Python 3.12.14 in 2.861 seconds. Temporary test files stay under the test directory and are removed on exit; launcher tests invoke a fake argv-printing executable, never Chromium. These synthetic tests do not imply Chromium integration, source regression, world rendering, or completed-frame evidence.

**Remaining verification:** environment-specific detached helpers beyond observed ownership, final source regression, and full-world GPU-completed frame evidence. The optional CPU-compositing preflight subsequently passed actual HDR 4× MSAA resolve/readback; see ../native-cpu-compositor-preflight-result.json. Those separate gates remain required.
