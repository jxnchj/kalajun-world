# Scoped PCF rotation candidate (not adopted by this subtask)

Three r186 `getShadow(sampler2DShadow, ...)` invokes `vogelDiskSample(i, 5, phi)` five times. Each computes sine/cosine of the same per-pixel IGN angle plus a constant Vogel angle. The candidate preserves five hardware PCF samples and all five original radii, rotating five fixed disk vectors by one sine/cosine pair of `phi`.

`installSharedPCFRotation(shader)` in `shadow-pcf-rotation.js` expands only this material's shadow include; it does not modify shared Three chunks or install itself. Caller must arrange the enabled flag, distinct material shader cache key and recompilation. Directional/spot 2D PCF only: point shadows, basic/VSM branches, frustum checks, depth/bias, texture radius, comparison format, averaging order/weight and shadow intensity are retained.

This algebraic equivalence is not a bitwise floating-point equality claim. Float32 CPU modeling over 500,005 sample coordinates finds max coordinate delta `9.071081876754761e-7`; at shadowRadius 2 this is `0.0000018142163753509521` shadow texels. Max radius deviation is `1.2608294419624855e-7`; double precision identity error is below `1e-15`. Real GLSL trigonometric approximations and hardware filtering need frozen browser image comparison.

Three targeted checks pass (`shadow-pcf-rotation-tests.log`). GLSL compilation, actual frozen pixels and GPU AB are not performed by this subtask. Driver compilers may already rewrite or optimize equivalent expressions; no improvement is claimed and no default renderer integration was made. There is no reduction in shadow samples, resolution, detail, geometry, density or filtering quality setting.
