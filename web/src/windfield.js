// The wind field on the CPU, the same as windQ / windDirAt / windTurb in glsl.js (integer hash
// value noise), so the plants simulated on the CPU (vegetation.js springs) feel the same gusts
// and canopy puffs that sweep the grass, the far flowers and the trees on the GPU.

function ihash(x, y) {
  const a = Math.imul(x | 0, 1597334673) >>> 0;
  const b = Math.imul(y | 0, 3812015801) >>> 0;
  return (Math.imul((a ^ b) >>> 0, 1597334673) >>> 0) / 4294967295;
}

export function wnoise(x, y) {
  const ix = Math.floor(x), iy = Math.floor(y);
  let fx = x - ix, fy = y - iy;
  fx = fx * fx * (3 - 2 * fx); fy = fy * fy * (3 - 2 * fy);
  const a = ihash(ix, iy), b = ihash(ix + 1, iy), c = ihash(ix, iy + 1), d = ihash(ix + 1, iy + 1);
  return (a + (b - a) * fx) * (1 - fy) + (c + (d - c) * fx) * fy;
}

const smooth = (e0, e1, x) => { const t = Math.min(1, Math.max(0, (x - e0) / (e1 - e0))); return t * t * (3 - 2 * t); };

// wind pressure at (x, z) (1 = a steady 4 m/s breeze): gusts drifting with the integrated wind
// `off`, canopy puffs racing at 1.3x (glsl.js windQ)
export function windQ(x, z, dx, dz, offx, offz, t, str) {
  const qx = x - offx, qz = z - offz;
  const ra = qx * dx + qz * dz, rc = -qx * dz + qz * dx;
  let g = wnoise(ra / 45 + t * 0.025, rc / 25 + t * 0.025) * 0.65 + wnoise(ra / 17 - t * 0.05 + 3.1, rc / 10 - t * 0.05 + 3.1) * 0.35;
  g = smooth(0.2, 0.85, g);
  const px = x - offx * 1.3, pz = z - offz * 1.3;
  const sa = px * dx + pz * dz, sc = -px * dz + pz * dx;
  let h = wnoise(sa / 2.5 + t * 0.12 + 17, sc / 6 + t * 0.12 + 17) * 0.7 + wnoise(sa / 1.2 - t * 0.2 + 5, sc / 2.5 - t * 0.2 + 5) * 0.3;
  h = smooth(0.3, 0.85, h);
  const u = str * (0.55 + 0.7 * g) * (0.6 + 1.1 * h * h * (0.6 + 0.6 * g));
  return u * u;
}

// how far a plant gives (0..1 of its full bend) under pressure q
export const windLeanAt = (q) => 1 - Math.exp(-q * 0.25);

// local wind direction (the mean turned by up to ~25 degrees)
export function dirAt(x, z, dx, dz, offx, offz) {
  const a = (wnoise(x * 0.012 - offx * 0.008, z * 0.012 - offz * 0.008) - 0.5) * 0.9;
  const ca = Math.cos(a), sa = Math.sin(a);
  return [dx * ca - dz * sa, dx * sa + dz * ca];
}

// small eddies of a metre or two carried by the puffs (-1..1 each; two independent components)
export function turbAt(x, z, offx, offz, t, seed) {
  const qx = x - offx * 1.3 + seed * 31.7, qz = z - offz * 1.3 - seed * 17.3;
  return [
    (wnoise(qx * 0.5 + t * 0.35, qz * 0.5 + t * 0.35) * 0.65 + wnoise(qx * 1.3 - t * 0.6, qz * 1.3 - t * 0.6) * 0.35) * 2 - 1,
    (wnoise(qx * 0.5 + 11.3 + t * 0.35, qz * 0.5 - 7.1 + t * 0.35) * 0.65 + wnoise(qx * 1.3 + 3.7 - t * 0.6, qz * 1.3 + 5.1 - t * 0.6) * 0.35) * 2 - 1,
  ];
}
