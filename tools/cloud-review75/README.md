# Reproducible cloud graphics preflight

## Current verified outcome

On October 29, 2026, Chromium155's managed profile failed WebGL2 with renderer Disabled. A separate default native profile also failed with Mesa llvmpipe. **Neither failure meant cloud WebGL was impossible.** Recalling the prior October24–26 route and explicitly selecting the documented SwANGLE driver succeeded.

`preflight-result.json` records the actual native-window result: WebGL2, EXT_clip_control, float render targets, timer queries, RGBA16F/DEPTH_COMPONENT32F 4× MSAA, texture size8192; clear/readback passed with GL error0 and no context loss. Parallel shader compilation was unavailable. This is capability evidence only, not world quality or performance acceptance.

## Exact successful driver selection

```sh
chromium --user-data-dir="$NEW_TASK_PROFILE" \
  --use-gl=angle --use-angle=swiftshader \
  --new-window "$LOOPBACK_PREFLIGHT_URL"
```

Chromium documents this as the OpenGL ES driver mode. It is **not** the unsafe `swiftshader-webgl` fallback. See [official SwiftShader documentation](https://chromium.googlesource.com/chromium/src/+/main/docs/gpu/swiftshader.md). Do not add `--enable-unsafe-swiftshader`, `--no-sandbox`, sandbox-disabling options, blocklist overrides, remote debugging, or `--disable-gpu-watchdog`.

The recipe does not change sandbox switches. A GL error's `Sandboxed` field is not a complete browser/OS sandbox audit; this run did not independently verify each sandbox layer.

## Native launch workflow

1. Use CUA to open the **cloud** native Terminal; do not move the task to the user's Mac. Set `QA_WORKSPACE` to an existing canonical task-owned directory below this checkout or `/tmp`, and `REPO` to this checkout. The cloud helper is Linux-specific; the monitored route also requires `/proc` and Python pidfd support. Keep runtime profiles outside deliverable/source directories.
2. In one native Terminal tab, serve this helper on an unused loopback port:

   ```sh
   python3 -u -m http.server 5175 --bind 127.0.0.1 \
     --directory "$REPO/tools/cloud-review75"
   ```

3. In a second native Terminal tab, use a **new**, nonexistent profile directory:

   ```sh
   bash "$REPO/tools/cloud-review75/launch-native.sh" \
     "$QA_WORKSPACE/swangle-profile-01" \
     http://127.0.0.1:5175/preflight.html
   ```

   The helper refuses an existing profile; it never deletes or changes existing browser data. Only `http://127.0.0.1:PORT/path` or `http://[::1]:PORT/path` is accepted: explicit valid port, no userinfo, fragment, whitespace, or backslash. The new profile parent must exist with no symlink/`..` ambiguity; allowed roots are this checkout and `/tmp`. The minimal helper is for a short manually closed capability probe; use the owned monitor below for bounded scene work.
4. Inspect the new native window using CUA. Its window description must identify the new profile. Read the visible JSON and canvas, scrolling normally; verify WebGL2 true, desired renderer, float framebuffer complete, original sample support, error0, and no context loss. Do not infer success from a process or HTTP200 alone.
5. Leave the page inert for handoff, or close **only this new browser window** normally. Stop **only its server** with Ctrl+C in the identified server terminal; verify `Keyboard interrupt received, exiting.` and shell prompt. Do not kill unrelated browser/server processes.

### Tool/network distinction

In this cloud environment, an exec-tool Python server printed a listening address but separate exec calls and the browser received connection refused. Starting the identical authorized server through the native Terminal made it reachable. Therefore a printed listen line is insufficient: verify the actual browser page. This was a process/network-context difference, not an egress-policy bypass. Browser internal `chrome://` navigation was separately policy-denied; use the authorized HTTP helper rather than retrying denied URLs.

CUA's browser `evaluate` is read-only; native browser windows may expose only X11 window metadata. Use ordinary native input and visible page output, not hidden browser control or DevTools workarounds. Profiles, caches and downloaded private data must never be included in an archive or source commit.

## Full-world continuation (separate acceptance)

The historically successful October24 route added CPU compositing and an explicitly enabled, source-matched single-full-frame fence/backpressure mode. Historical notes describe terrain completion as `waitForAll`; that is **historical wording, not the current API**. Current `web/src/v2/terrain.js` accepts `terrain.prepareView(camera, { waitFor: 'all', ... })`. Its finite `maxMs` can still end preparation at a budget limit, so verify the returned readiness and pending domains rather than treating the option as proof of completion. The old route then advanced ecology/water at dt0; preserved original HDR/Float32/4×MSAA, geometry, vegetation, shadows and reflections; and recorded three real GPU completions with all eleven pending domains zero. Use the separately tested current scheduler; these notes do not reproduce the missing historical helper's source.

[Chromium's source](https://chromium.googlesource.com/chromium/src/+/main/gpu/config/gpu_switches.cc) documents `--gpu-watchdog-timeout-seconds` as a finite timeout override. This preflight did not need or use it. Do not assume the full scene will work merely because capability probing passed; keep stage5 global lighting/color and unvalidated candidate defaults unchanged.

### Separate, explicit full-world safety recipe — not the preflight command

Only use this after the source-matched review scheduler, ownership/cleanup checks, selected scene and evidence plan have passed review. It is an opt-in native-Terminal invocation, **not** an automatic launcher change. Keep the preflight command and its completed evidence unchanged.

- The original October24 **static** run used watchdog180s, per-fence210s and outer300s, producing three complete frames.
- A later **controlled-motion** run planned nineteen frames (three original plus sixteen controlled frames), with scene1200s and outer1320s, per-fence210s and bounded hold60s. That larger observation window belongs to that distinct reviewed run; it is not the original static budget or a general default.
- Both scopes are slow software-rendered evidence, **not realtime FPS**. Select and record one finite outer budget before launch; never extend it in response to missing completion.

Use the installed [owned-browser monitor](monitor/README.md), whose strict URL/path validators are also shared by the minimal preflight launcher. Do not duplicate a shell-glob URL check or rely on `timeout` alone to attribute descendants. Example for a separately reviewed static run (choose a new directory each time):

```sh
: "${REPO:?Set the canonical absolute checkout path}"
mkdir -p "$REPO/backups/cloud-review75"
python3 -u "$REPO/tools/cloud-review75/monitor/native_owned_monitor.py" \
  --run-dir "$REPO/backups/cloud-review75/native-owned-static-01" \
  --url http://127.0.0.1:5175/preflight.html \
  --window-size 1288,891 \
  --outer-seconds 300 --cleanup-seconds 10 --poll-seconds 1
```

The first URL is always the lightweight preflight. Verify its settled viewport/capabilities before navigating the same isolated window to the reviewed local scene. For the separately reviewed controlled-motion scope, select `--outer-seconds 1320` **before launch**; the clock includes all setup, observation, and cleanup. The monitor's explicit `--full-world-cpu-compositing` option adds only `--disable-gpu-compositing`, as documented and capability-tested separately. It is not an implicit default or proof of scene success.

The monitor keeps the watchdog enabled at a finite180s threshold and does not change sandbox flags. The application independently enforces its per-fence210s limit, stops on context loss/error, and records completed-frame evidence. See the monitor documentation for exact attribution and cleanup limits; unobserved detached descendants are not proven absent.

A deadline/cancellation/RSS-cap termination is **not a pass**. Verify the actual frame records, context/error state, source identity and expected original quality. Confirm only this isolated instance's window/processes have exited; never use broad browser kill commands. Keep its HTTP server separate and stop only that owned server when finished. Do not disable watchdog/sandbox, raise limits mid-run, navigate untrusted content in the test profile, or infer target-hardware performance from software timing.
