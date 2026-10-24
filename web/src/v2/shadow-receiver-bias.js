import { shadowDepthBias } from './depth-mode.js';

// r186 PCF compares (receiverDepth + bias) with the stored caster depth.
// A negative ordinary-Z bias moves the receiver toward the light; reversed-Z
// requires the opposite sign. A positive ordinary bias deepens self-occlusion.
// Keep the existing magnitude: this repairs direction, not shadow precision,
// normal offsets, PCF radius, caster sides, or the real contact geometry.
export function directionalReceiverBias(magnitude, reversedDepth, mode = 'corrected') {
  if (!Number.isFinite(magnitude) || magnitude < 0) throw new RangeError('Shadow bias magnitude must be finite and nonnegative');
  if (mode !== 'corrected' && mode !== 'legacy') throw new RangeError('Unknown directional receiver bias mode');
  return shadowDepthBias(mode === 'legacy' ? magnitude : -magnitude, reversedDepth);
}

export function receiverBiasMode(search = globalThis.location?.search || '') {
  return new URLSearchParams(search).get('shadowReceiverBias') === 'legacy' ? 'legacy' : 'corrected';
}
