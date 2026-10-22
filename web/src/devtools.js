// Dev-only helpers for automated checks (loaded only under `vite dev`).
// __snap(name): renders a frame, composites the photo overlay if comparison mode is on,
// and posts a JPEG to the dev server (saved under docs/snapshots/).

export function installDevtools({ renderFrame, renderer, viewpoints }) {
  window.__snap = async (name, { quality = 0.9 } = {}) => {
    renderFrame(0);
    const src = renderer.domElement;
    const c = document.createElement("canvas");
    c.width = src.width;
    c.height = src.height;
    const g = c.getContext("2d");
    g.drawImage(src, 0, 0);
    const vp = viewpoints.active;
    if (vp) {
      const k = src.width / window.innerWidth;
      const r = viewpoints.frame.getBoundingClientRect();
      const img = viewpoints.img;
      if (!img.complete) await img.decode();
      const [x, y, w, h] = [r.left * k, r.top * k, r.width * k, r.height * k];
      // dim outside the photo frame like the UI does
      g.fillStyle = "rgba(10,12,11,0.55)";
      g.fillRect(0, 0, c.width, y); g.fillRect(0, y + h, c.width, c.height - y - h);
      g.fillRect(0, y, x, h); g.fillRect(x + w, y, c.width - x - w, h);
      if (viewpoints.mode === "wipe") {
        const cut = w * viewpoints.amount;
        const sx = (img.naturalWidth * cut) / w;
        g.drawImage(img, sx, 0, img.naturalWidth - sx, img.naturalHeight, x + cut, y, w - cut, h);
        g.fillStyle = "#e8c86a";
        g.fillRect(x + cut - k, y, 2 * k, h);
      } else {
        g.globalAlpha = viewpoints.amount;
        g.drawImage(img, x, y, w, h);
        g.globalAlpha = 1;
      }
    }
    const blob = await new Promise((r) => c.toBlob(r, "image/jpeg", quality));
    const res = await fetch(`/__snapshot?name=${encodeURIComponent(name)}`, { method: "POST", body: blob });
    return res.ok ? `saved ${name}.jpg (${c.width}x${c.height})` : `failed ${res.status}`;
  };
}

// Hero cameras for the vertical slice (golden hour unless a time is given).
export function installHeroShots(S) {
  const { THREE, terrain, controls, viewpoints, objects, setTime } = S;
  const look = (tx, tz, ty, x, z, up) => {
    const y = terrain.heightAt(x, z) + up;
    const yaw = (Math.atan2(tx - x, -(tz - z)) * 180) / Math.PI;
    const pitch = (Math.atan2(ty - y, Math.hypot(tx - x, tz - z)) * 180) / Math.PI;
    controls.setPose(new THREE.Vector3(x, y, z), yaw, pitch);
  };
  const vp = (i) => viewpoints.vps[i];
  const shots = {
    photo2: () => { const v = vp(1); controls.setPose(new THREE.Vector3(v.x, terrain.heightAt(v.x, v.z) + 1.6, v.z), v.yaw, v.pitch); },
    camp: () => { const v = vp(0); controls.setPose(new THREE.Vector3(v.x, terrain.heightAt(v.x, v.z) + 1.7, v.z), v.yaw + 8, 1.5); },
    swing: () => { const w = objects.swings[0]; const a = (285 * Math.PI) / 180; look(w.x + Math.sin(a) * 40, w.z - Math.cos(a) * 40, terrain.heightAt(w.x, w.z) + 6, w.x - Math.sin(a) * 9 + 3, w.z + Math.cos(a) * 9 + 4, 1.5); },
    lodge: () => { const L = objects.guesthouses.find((g) => g.home) || objects.cabins[0]; look(L.x, L.z, terrain.heightAt(L.x, L.z) + 2, L.x + 35, L.z + 45, 14); },
    meadow: () => { const v = vp(6); controls.setPose(new THREE.Vector3(v.x - 40, terrain.heightAt(v.x - 40, v.z + 30) + 0.9, v.z + 30), 60, -6); },
    edge: () => { const v = vp(0); controls.setPose(new THREE.Vector3(v.x + 120, terrain.heightAt(v.x + 120, v.z + 560) + 0.9, v.z + 560), 160, -5); },
    overview: () => { const v = vp(0); controls.setPose(new THREE.Vector3(v.x, terrain.heightAt(v.x, v.z + 1500) + 350, v.z + 1500), 5, -8); },
    aerial: () => { const v = vp(0); controls.setPose(new THREE.Vector3(v.x + 400, terrain.heightAt(v.x + 400, v.z + 900) + 160, v.z + 900), 330, -14); },
    hill: () => { const v = vp(6); controls.setPose(new THREE.Vector3(v.x + 200, terrain.heightAt(v.x + 200, v.z + 150) + 25, v.z + 150), 290, -6); },
    walk: () => { const v = vp(1); const a = (v.yaw * Math.PI) / 180; look(v.x + Math.sin(a) * 30, v.z - Math.cos(a) * 30, terrain.heightAt(v.x, v.z) + 2.5, v.x + Math.sin(a) * 6 + Math.cos(a) * 2.5, v.z - Math.cos(a) * 6 + Math.sin(a) * 2.5, 1.2); },
    trail: () => { const v = vp(6); const a = vp(1); look(v.x, v.z, terrain.heightAt(v.x, v.z) + 1, a.x + (v.x - a.x) * 0.15, a.z + (v.z - a.z) * 0.15, 1.7); },
    gully: () => { const v = vp(0); controls.setPose(new THREE.Vector3(v.x - 60, terrain.heightAt(v.x - 60, v.z - 150) + 18, v.z - 150), 200, -14); },
    south: () => { const v = vp(4); controls.setPose(new THREE.Vector3(v.x + 30, terrain.heightAt(v.x + 30, v.z + 20) + 25, v.z + 20), 175, 2); },
    // the pre-tourism layout (2013 imagery): a winter yard, hay field, the forestry station
    // the camp seen from a paraglider (the user's check of the meadow colour from above)
    campAir: () => look(-2000, 3470, terrain.heightAt(-2000, 3470), -1760, 3780, 230),
    farm: () => look(-2183, 2528, terrain.heightAt(-2183, 2528) + 2, -2120, 2590, 14),
    farm2: () => look(-2716, 2866, terrain.heightAt(-2716, 2866) + 2, -2680, 2940, 12),
    hayfield: () => look(-1560, 2720, terrain.heightAt(-1560, 2720), -1470, 2860, 20),
    station: () => look(-2040, 4080, terrain.heightAt(-2040, 4080) + 2, -1960, 4010, 16),
    horses: () => { const h = S.slice.herd.horses[3]; look(h.x, h.z, h.y + 1.2, h.x - 12, h.z + 6, 1.6); },
  };
  window.__look = look;
  // the near spruce forms side by side on open meadow (tools/blender/spruce2.py review):
  // forms in a row across the view, camera `dist` m away at `camUp` m, looking at `lookH` m
  window.__treeShot = async (name, forms, dist, camUp, lookH, az = 200, cx = -1760, cz = 2700, spacing = 9, lod = "hi") => {
    const F = S.slice.forest;
    for (const f of Object.keys(F.hi)) for (const L of ["hi", "mid"]) for (const im of F[L][f].children) im.count = 0;
    const a = (az * Math.PI) / 180, dx = Math.sin(a), dz = -Math.cos(a);
    forms.forEach((f, i) => {
      const o = (i - (forms.length - 1) / 2) * spacing, x = cx - dz * o, z = cz + dx * o, h = f === "young" ? 0.4 : 1.0;
      const m = new THREE.Matrix4().compose(new THREE.Vector3(x, terrain.heightAt(x, z) - 0.3, z),
        new THREE.Quaternion().setFromEuler(new THREE.Euler(0, i * 1.3, 0)), new THREE.Vector3(h, h, h));
      for (const im of F[lod][f].children) { im.setMatrixAt(0, m); im.count = 1; im.instanceMatrix.needsUpdate = true; im.computeBoundingSphere(); }
    });
    const x = cx + dx * dist, z = cz + dz * dist;
    look(cx, cz, terrain.heightAt(cx, cz) + lookH, x, z, camUp);
    F.last.set(x, 0, z);   // keep NearForest.update from re-placing the forest
    for (let i = 0; i < 6; i++) S.renderFrame(1 / 30);
    return await window.__snap(name);
  };
  // material experiment: put another texture on every asset material of a name (log, plank, shingle...)
  const texCache = new Map();
  window.__swapTex = async (matName, url) => {
    if (!texCache.has(url)) {
      const t = await new THREE.TextureLoader().loadAsync(url);
      t.flipY = false; t.colorSpace = THREE.SRGBColorSpace; t.wrapS = t.wrapT = THREE.RepeatWrapping; t.anisotropy = 8;
      texCache.set(url, t);
    }
    let n = 0;
    S.slice.root.traverse((o) => {
      if (o.isMesh && o.material && o.material.name === matName && o.material.uniforms?.map) { o.material.uniforms.map.value = texCache.get(url); n++; }
    });
    return n;
  };
  window.__houseShot = (x, z, dist, yawDeg, up) => { const a = (yawDeg * Math.PI) / 180; look(x, z, terrain.heightAt(x, z) + 2.5, x + Math.sin(a) * dist, z - Math.cos(a) * dist, up); };
  // Consistency check of the flora across distances: find patches where one colour family
  // dominates, then shoot each from 400 m down to standing in it (tools/walkin.py measures).
  const FAM = { yellow: [2, 3, 9, 12], purple: [5, 6, 7, 14], pink: [0, 10, 13, 17], blue: [4, 15], white: [1, 8, 16] };
  window.__findSites = (step = 40, R = 3500) => {
    const P = window.__scene.plants, f = P.flora, lc = terrain.landcoverSampler();
    const c0 = viewpoints.vps[0];
    const best = {};
    for (let x = c0.x - R; x <= c0.x + R; x += step)
      for (let z = c0.z - R; z <= c0.z + R; z += step) {
        const L = lc(x, z);
        if (L.r > 0.1 || L.g > 0.2) continue;
        const cov = f.map((q, k) => (q ? Math.min(P.sample(P.floraMaps[k], x, z) * q.maxDens, 1) * q.cov1 : 0));
        for (const [fam, ks] of Object.entries(FAM)) {
          const c = ks.reduce((a, k) => a + cov[k], 0);
          const other = cov.reduce((a, b) => a + b, 0) - c;
          const score = c - other * 0.5;
          if (!best[fam] || score > best[fam].score) best[fam] = { x, z, score: +score.toFixed(3), cover: +c.toFixed(3), other: +other.toFixed(3) };
        }
      }
    return best;
  };
  // approach direction with a clear view: no forest along the way, no ridge in the line of sight
  const clearFrom = (x, z) => {
    const lc = terrain.landcoverSampler();
    let best = null;
    for (let k = 0; k < 24; k++) {
      const deg = k * 15, a = (deg * Math.PI) / 180;
      let bad = 0;
      for (const d of [8, 25, 60, 150, 400]) {
        const cx = x + Math.sin(a) * d, cz = z - Math.cos(a) * d;
        const cy = terrain.heightAt(cx, cz) + (d >= 60 ? d * 0.2 + 2 : d >= 25 ? 4 : 1.7), ty = terrain.heightAt(x, z);
        for (let t = 0.05; t < 0.97; t += 0.04) {
          const px = cx + (x - cx) * t, pz = cz + (z - cz) * t, py = cy + (ty - cy) * t;
          if (terrain.heightAt(px, pz) > py - 0.3) bad += 1;
          bad += lc(px, pz).r * 0.6;
        }
      }
      const sunSide = Math.abs(((deg - 200 + 540) % 360) - 180) / 180;   // prefer the sun at the side
      const score = bad + sunSide * 2;
      if (!best || score < best.score) best = { deg, score };
    }
    return best.deg;
  };
  // the same view rendered as seen on the ground (plants, grass, flower rings) and with the
  // far-view shading only -- tools/farcal.py compares the two over the meadow 30-80 m out
  window.__farPair = async (prefix, x, z, fromDeg = null, d = 55, up = 8, time = "2026-07-25T21:20:00+08:00") => {
    viewpoints.exit();
    setTime(new Date(time));
    if (fromDeg === null) fromDeg = clearFrom(x, z);
    const a = (fromDeg * Math.PI) / 180;
    look(x, z, terrain.heightAt(x, z), x + Math.sin(a) * d, z - Math.cos(a) * d, up);
    const out = [];
    for (const k of [0, 1]) {
      S.worldUniforms.uFarRef.value = k;
      for (let i = 0; i < 4; i++) S.renderFrame(1 / 30);
      out.push(await window.__snap(`${prefix}_${k ? "far" : "near"}`));
    }
    S.worldUniforms.uFarRef.value = 0;
    return out;
  };
  window.__walkin = async (prefix, x, z, fromDeg = null, time = "2026-07-25T21:20:00+08:00") => {
    viewpoints.exit();
    setTime(new Date(time));
    if (fromDeg === null) fromDeg = clearFrom(x, z);
    const out = [];
    const a = (fromDeg * Math.PI) / 180;
    for (const d of [400, 150, 60, 25, 8, 0]) {
      if (d === 0) {
        const y = terrain.heightAt(x, z) + 1.6;
        controls.setPose(new THREE.Vector3(x, y, z), (fromDeg + 180) % 360, -38);
      } else {
        const up = d >= 60 ? d * 0.2 + 2 : d >= 25 ? 4 : 1.7;
        look(x, z, terrain.heightAt(x, z), x + Math.sin(a) * d, z - Math.cos(a) * d, up);
      }
      for (let i = 0; i < 4; i++) S.renderFrame(1 / 30);
      out.push(await window.__snap(`${prefix}_${String(d).padStart(3, "0")}`));
    }
    return out;
  };
  window.__hero = async (prefix, names = Object.keys(shots), time = "2026-07-25T21:20:00+08:00") => {
    viewpoints.exit();
    setTime(new Date(time));
    const out = [];
    for (const n of names) {
      shots[n]();
      for (let i = 0; i < 3; i++) S.renderFrame(1 / 30);
      out.push(await window.__snap(`${prefix}_${n}`));
    }
    return out;
  };
}
