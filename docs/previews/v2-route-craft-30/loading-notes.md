# Round 30: exact habitat transport

## Evidence and scope

Round 29 acceptance-B1/B2 both loaded the complete six-layer authoring atlas before reducing it to four V2 channels. B2's core habitat source took 3,143 ms of the ecology source phase; its network entry lasted 3,016 ms. The original two compressed payloads total 21,366,906 bytes and expand to 64,487,424 bytes. V2 immediately discards the atlas representation after producing 10,747,904 bytes of runtime habitat channels. These timings include main-thread scheduling, so they are not pure network latency.

The new `tools/build_habitat_transport.mjs` applies the original decoder offline. No sampling, quantization, species rule, grid resolution, count, placement, or retained runtime channel changes. Both original authoring atlases and their metadata remain intact. The source fingerprints in the derived manifest let the regression test catch a stale derivation after a source edit.

## Adopted candidate

- Default `habitatTransport=derived` (parameter may be omitted).
- Reference `habitatTransport=raw` retains the original two fetches and decoder.
- Runtime observation: `ecology.habitatTransport.local/core`, with mode, response bytes, decoded bytes, final data bytes and elapsed time.
- One hash-versioned data request per map; metadata is small build-time data. Strict revision/grid/byte-length checks and request/decompression errors reject. No silent reduced-quality fallback.
- Browser-native HTTP gzip or application gzip both return the identical byte buffer. The derived buffer is used directly, without another pixel fold or full-sized copy.
- Original source files are still shipped for the reference path and authoring; disk/build output grows by the derived 5,275,745 bytes plus small metadata. This optimizes the requested network payload and temporary decoded memory, not package disk size.

| Budget | Original source atlas path | Derived path |
|---|---:|---:|
| gzip payload, both maps | 21,366,906 B | 5,275,745 B |
| decoded payload, both maps | 64,487,424 B | 10,747,904 B |
| final V2 data, both maps | 10,747,904 B | 10,747,904 B |
| pixel counts/resolution | unchanged | unchanged |

The payload reduction is 75.3%, and temporary decoded input reduction is 83.3%. Whole startup is still gated by structure preparation, ecology creation, initial scene and first GPU upload. These byte improvements alone are not a claim that the complete startup long tail is solved.

## Verification

38 / 38 targeted tests passed:

`node --test web/src/v2/habitat-loading.test.js web/src/v2/ecology.test.js web/src/v2/ecology-loading.test.js web/src/v2/threshold-plants.test.js web/src/v2/shore-contact.test.js`

New tests compare all bytes of both actual maps against the original decoder, independently check the four atlas/channel formulas across the grid, verify source and generated hashes/metadata, both gzip delivery modes, raw/derived equality, per-load isolation, error propagation, cancellation and strict byte counts. Existing tests retain authored flower beds, pixel-center sampling, all plant identities/counts, root ownership and grass/stone/threshold contact rules.

No new asset overlap or scheduling experiment is enabled. No main entry or readiness condition changed. No GPU detail, density, render distance or quality setting changed. Source edit backup: `backups/route-continuity-v30/loading/web/src/v2/ecology.js`.

Actual same-condition browser timing and complete-version acceptance are recorded separately by the coordinating task.

## Separate screen-MSAA candidate

`world-context.js` probes a 1×1 temporary WebGL2 context, confirms reversed-depth float rendering and at least two common RGBA16F / DEPTH_COMPONENT32F samples (using the existing four-sample ceiling), explicitly loses the probe and zeroes its canvas. Only eligible devices request a real non-MSAA default framebuffer; the complete WorldFrame keeps its original multisampling. The real context is independently checked. If that differs or fails, the unused canvas is cloned with all DOM attributes before controls/listeners exist and recreated with the original screen AA. Probe exceptions, unsupported devices, `depth=log`, and `screenMSAA=1` take the original AA path. No renderer, target, DPR, shadow, vegetation or material quality setting changes.

A/B: default candidate versus `screenMSAA=1`. `loadTimings.context` reports requested/actual screen AA, common world target samples, probe eligibility and fallback. This avoids a second MSAA framebuffer for the final full-screen OutputPass triangle; benefit and final adoption depend on frozen browser pixels and GPU results, not only source reasoning.

15 / 15 context + existing WorldFrame tests pass, covering all capability combinations, single-sample hardware, probe creation/query failure and disposal, mismatched real context, conservative recreation failure, original HDR samples, attachment types, and output pipeline/error restoration. No browser benefit is asserted by these tests.
