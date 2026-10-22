// The solid of a building model as the walker meets it (physics.js 'grid' shapes): over a 10 cm
// grid in the model's own frame, the vertical spans its triangles occupy in each cell, merged.
// The walker stands on the highest span top within a step (floors, porch decks, steps, the
// turf bank, a rug) and is stopped by any span between that and its head (log walls, posts,
// railings, the stove, a closed door frame) -- so a building is as walkable as it is modelled:
// up the steps onto the porch, through the open door, round the table. Built once per model
// from its meshes (the door leaves excluded: they move, slice.js Doors). A closed thing is solid,
// not a shell: up each cell, from a surface facing down to the next facing up is filled (a stone
// block under a step is a step from the ground up, not a thin tread over air).

const K = 8;   // spans kept per cell (more are merged)

// does triangle (a, b, c) (x, z pairs) overlap the box [x0, x1] x [z0, z1]? (separating axes)
function triBox(ax, az, bx, bz, cx, cz, x0, z0, x1, z1) {
  if (Math.max(ax, bx, cx) < x0 || Math.min(ax, bx, cx) > x1 || Math.max(az, bz, cz) < z0 || Math.min(az, bz, cz) > z1) return false;
  const P = [[ax, az], [bx, bz], [cx, cz]];
  for (let e = 0; e < 3; e++) {
    const [px, pz] = P[e], [qx, qz] = P[(e + 1) % 3], [rx, rz] = P[(e + 2) % 3];
    const nx = qz - pz, nz = px - qx;                       // edge normal
    const t = (rx - px) * nx + (rz - pz) * nz;              // the third vertex's side
    const s = Math.sign(t) || 1;
    // the box corner farthest toward the triangle's side
    const bx_ = s * nx > 0 ? x1 : x0, bz_ = s * nz > 0 ? z1 : z0;
    if (s * ((bx_ - px) * nx + (bz_ - pz) * nz) < 0) return false;
  }
  return true;
}

export function buildGrid(root, { cell = 0.1, skip = () => false } = {}) {
  root.updateMatrixWorld(true);
  const inv = root.matrixWorld.clone().invert();
  const tris = [];
  let x0 = Infinity, z0 = Infinity, x1 = -Infinity, z1 = -Infinity;
  const v = [0, 0, 0].map(() => ({ x: 0, y: 0, z: 0 }));
  root.traverse((o) => {
    if (!o.isMesh || skip(o)) return;
    const M = inv.clone().multiply(o.matrixWorld).elements;
    const pos = o.geometry.attributes.position, idx = o.geometry.index;
    const n = idx ? idx.count : pos.count;
    for (let i = 0; i < n; i += 3) {
      for (let k = 0; k < 3; k++) {
        const j = idx ? idx.getX(i + k) : i + k;
        const px = pos.getX(j), py = pos.getY(j), pz = pos.getZ(j);
        v[k].x = M[0] * px + M[4] * py + M[8] * pz + M[12];
        v[k].y = M[1] * px + M[5] * py + M[9] * pz + M[13];
        v[k].z = M[2] * px + M[6] * py + M[10] * pz + M[14];
      }
      tris.push(v[0].x, v[0].y, v[0].z, v[1].x, v[1].y, v[1].z, v[2].x, v[2].y, v[2].z);
      for (const q of v) { x0 = Math.min(x0, q.x); x1 = Math.max(x1, q.x); z0 = Math.min(z0, q.z); z1 = Math.max(z1, q.z); }
    }
  });
  x0 -= cell; z0 -= cell;
  const nx = Math.ceil((x1 - x0) / cell) + 2, nz = Math.ceil((z1 - z0) / cell) + 2;
  const spans = new Float32Array(nx * nz * K * 2), count = new Uint8Array(nx * nz);
  const insert = (c, lo, hi) => {
    const o = c * K * 2;
    let n = count[c];
    // merge with every span it touches (or nearly: gaps under 4 cm are no room for anything)
    for (let s = 0; s < n; s++) {
      const a = spans[o + s * 2], b = spans[o + s * 2 + 1];
      if (lo <= b + 0.04 && hi >= a - 0.04) {
        lo = Math.min(lo, a); hi = Math.max(hi, b);
        spans[o + s * 2] = spans[o + (n - 1) * 2]; spans[o + s * 2 + 1] = spans[o + (n - 1) * 2 + 1];
        n--; s = -1;                                     // (start over: the grown span may touch others)
      }
    }
    if (n === K) {                                       // full: join the two closest
      let best = 0, gap = Infinity;
      for (let s = 0; s < n; s++) {
        const d = Math.max(spans[o + s * 2] - hi, lo - spans[o + s * 2 + 1]);
        if (d < gap) { gap = d; best = s; }
      }
      lo = Math.min(lo, spans[o + best * 2]); hi = Math.max(hi, spans[o + best * 2 + 1]);
      spans[o + best * 2] = spans[o + (n - 1) * 2]; spans[o + best * 2 + 1] = spans[o + (n - 1) * 2 + 1];
      n--;
    }
    spans[o + n * 2] = lo; spans[o + n * 2 + 1] = hi;
    count[c] = n + 1;
  };
  // the flat surfaces over each cell: cell, lo, hi, facing up (1) or down (0)
  let fc = new Int32Array(1 << 16), fv = new Float32Array(1 << 17), fu = new Uint8Array(1 << 16), fn = 0;
  const face = (c, lo, hi, up) => {
    if (fn === fc.length) {
      const g = (a, n) => { const b = new a.constructor(n); b.set(a); return b; };
      fc = g(fc, fn * 2); fv = g(fv, fn * 4); fu = g(fu, fn * 2);
    }
    fc[fn] = c; fv[fn * 2] = lo; fv[fn * 2 + 1] = hi; fu[fn] = up; fn++;
  };
  for (let t = 0; t < tris.length; t += 9) {
    const ax = tris[t], ay = tris[t + 1], az = tris[t + 2], bx = tris[t + 3], by = tris[t + 4], bz = tris[t + 5], cx = tris[t + 6], cy = tris[t + 7], cz = tris[t + 8];
    // the triangle's plane as y = p0 + px x + pz z (none if it stands upright)
    const ux = bx - ax, uy = by - ay, uz = bz - az, wx = cx - ax, wy = cy - ay, wz = cz - az;
    const Nx = uy * wz - uz * wy, Ny = uz * wx - ux * wz, Nz = ux * wy - uy * wx;
    const len = Math.hypot(Nx, Ny, Nz) || 1;
    const flat = Math.abs(Ny) / len > 0.05;
    const tmin = Math.min(ay, by, cy), tmax = Math.max(ay, by, cy);
    const i0 = Math.max(0, Math.floor((Math.min(ax, bx, cx) - x0) / cell)), i1 = Math.min(nx - 1, Math.floor((Math.max(ax, bx, cx) - x0) / cell));
    const j0 = Math.max(0, Math.floor((Math.min(az, bz, cz) - z0) / cell)), j1 = Math.min(nz - 1, Math.floor((Math.max(az, bz, cz) - z0) / cell));
    for (let j = j0; j <= j1; j++)
      for (let i = i0; i <= i1; i++) {
        const cx0 = x0 + i * cell, cz0 = z0 + j * cell, cx1 = cx0 + cell, cz1 = cz0 + cell;
        if (!triBox(ax, az, bx, bz, cx, cz, cx0, cz0, cx1, cz1)) continue;
        let lo = tmin, hi = tmax;
        if (flat) {   // the plane's heights over the cell, within the triangle's own range
          const h = (x, z) => ay - (Nx * (x - ax) + Nz * (z - az)) / Ny;
          const a = h(cx0, cz0), b = h(cx1, cz0), c = h(cx0, cz1), d = h(cx1, cz1);
          lo = Math.max(tmin, Math.min(a, b, c, d)); hi = Math.min(tmax, Math.max(a, b, c, d));
          if (lo > hi) { const m = Math.min(Math.max((lo + hi) / 2, tmin), tmax); lo = hi = m; }
          face(j * nx + i, lo, hi, Ny > 0 ? 1 : 0);
        }
        insert(j * nx + i, lo - 0.02, hi + 0.02);
      }
  }
  // by cell (counting sort), each cell's few by height (insertion sort), then filled
  const start = new Int32Array(nx * nz + 1);
  for (let i = 0; i < fn; i++) start[fc[i] + 1]++;
  for (let c = 0; c < nx * nz; c++) start[c + 1] += start[c];
  const at = start.slice(0, nx * nz), ord = new Int32Array(fn);
  for (let i = 0; i < fn; i++) ord[at[fc[i]]++] = i;
  const mid = (i) => fv[i * 2] + fv[i * 2 + 1];
  for (let c = 0; c < nx * nz; c++) {
    const a = start[c], b = start[c + 1];
    if (b - a < 2) continue;
    for (let k = a + 1; k < b; k++) {
      const v = ord[k], m = mid(v);
      let q = k - 1;
      while (q >= a && mid(ord[q]) > m) { ord[q + 1] = ord[q]; q--; }
      ord[q + 1] = v;
    }
    let open = false, lo = 0;
    for (let k = a; k < b; k++) {
      const i = ord[k];
      if (!fu[i]) { if (!open) { open = true; lo = fv[i * 2]; } }
      else if (open) { insert(c, lo - 0.02, fv[i * 2 + 1] + 0.02); open = false; }
    }
  }
  return { cell, x0, z0, nx, nz, K, spans, count };
}

// the spans of the cell under local (x, z): calls fn(lo, hi) for each; false if outside the grid
export function cellSpans(G, x, z, fn) {
  const i = Math.floor((x - G.x0) / G.cell), j = Math.floor((z - G.z0) / G.cell);
  if (i < 0 || j < 0 || i >= G.nx || j >= G.nz) return false;
  const c = j * G.nx + i, o = c * G.K * 2;
  for (let s = 0; s < G.count[c]; s++) fn(G.spans[o + s * 2], G.spans[o + s * 2 + 1]);
  return true;
}
