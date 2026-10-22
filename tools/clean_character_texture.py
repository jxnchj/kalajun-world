"""Clean the walker's texture: assets/src/character/texture.png -> texture_clean.png.

The AI-made texture is cut into hundreds of small UV islands (the face alone is spread over the
whole atlas), filled between them with a dark blurred padding, and speckled with dark dots and
scratch-like strokes. Up close: dark cracks along the islands' edges (the padding bleeding in),
skin of one tone next to skin of another where two islands meet (the neck), purple fringes on
the hair. No filter in the image can mend that -- neighbours on the body are far apart in it.

So the skin is redone on the body's surface and baked back, the rest kept as painted:
  1. the vertices split at the UV seams are welded (one colour each side of a seam)
  2. each vertex takes the median of the skin-coloured texture just inside its triangles
  3. carried in under the features (eyebrows, lips) and smoothed over the surface
  4. drawn to one tone, its own light and dark kept (cheeks, ears)
  5. baked into the texture, each triangle shaded between its corners' colours
  6. used on the skin texels and on the dots and scratches inside the skin (marks small or thin
     with skin all round); the eyebrows, the mouth, the hair and the clothes keep the texture;
     and the gaps between the islands are filled outward from their edges (no dark padding
     bleeding in at the seams, nor in the mipmaps)

The geometry (UVs, bind pose) is read from web/public/assets/character.glb, which
tools/blender/character_mixamo.py builds with this texture: its UVs are the source texture's.
Python: tools/.venv (numpy, scipy, Pillow).

Another child (the schoolboy, tools/blender/character_schoolboy.py):
  tools/.venv/bin/python tools/clean_character_texture.py web/public/assets/schoolboy.glb \
      assets/src/character/schoolboy/texture.png assets/src/character/schoolboy/texture_clean.png \
      assets/src/character/schoolboy/clips.json
(his eyes are painted on the surface, no eyeball meshes: their places come from the build's clips.json)
"""
import json
import os
import struct
import warnings

import numpy as np
from PIL import Image, ImageDraw
from scipy import ndimage, sparse

import sys
ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
SRC = os.path.join(ROOT, "assets", "src", "character")
GLB = os.path.join(ROOT, "web", "public", "assets", "character.glb")
TEX_IN, TEX_OUT, EYES_JSON = os.path.join(SRC, "texture.png"), os.path.join(SRC, "texture_clean.png"), None
if len(sys.argv) > 3:
    GLB, TEX_IN, TEX_OUT = (os.path.join(ROOT, a) for a in sys.argv[1:4])
    EYES_JSON = os.path.join(ROOT, sys.argv[4]) if len(sys.argv) > 4 else None


def load_mesh(path):
    b = open(path, "rb").read()
    n = struct.unpack("<I", b[12:16])[0]
    j = json.loads(b[20:20 + n])
    off = 20 + n + 8
    types = {5126: "<f4", 5123: "<u2", 5125: "<u4", 5121: "u1"}

    def acc(i):
        a = j["accessors"][i]
        bv = j["bufferViews"][a["bufferView"]]
        k = {"SCALAR": 1, "VEC2": 2, "VEC3": 3, "VEC4": 4}[a["type"]]
        o = off + bv.get("byteOffset", 0) + a.get("byteOffset", 0)
        return np.frombuffer(b, dtype=types[a["componentType"]], count=a["count"] * k, offset=o).reshape(a["count"], k)

    body = eyes = None
    for m in j["meshes"]:
        for p in m["primitives"]:
            P = acc(p["attributes"]["POSITION"]).astype(np.float64)
            mname = j["materials"][p["material"]]["name"]
            if "eye" in mname:
                eyes = P
            elif mname == "Designer_Logic_PBR":   # (not the lids' lashes nor the inside of the mouth)
                body = P, acc(p["attributes"]["TEXCOORD_0"]).astype(np.float64), acc(p["indices"]).reshape(-1, 3).astype(np.int64)
    if eyes is None and EYES_JSON:   # (painted eyes: their places from the build)
        eyes = np.array(json.load(open(EYES_JSON))["eyes_glb"], dtype=np.float64)
    if body is None or eyes is None:
        raise SystemExit("no body or eyes")
    return (*body, eyes)


def sample(img, uv):
    """bilinear samples of img (H, W, 3) at UVs (glTF: v down from the top)"""
    h, w = img.shape[:2]
    x, y = uv[:, 0] * w - 0.5, uv[:, 1] * h - 0.5
    return np.stack([ndimage.map_coordinates(img[..., c], [y, x], order=1, mode="nearest") for c in range(3)], 1)


def rgb2hsv(c):
    mx, mn = c.max(1), c.min(1)
    d = mx - mn + 1e-9
    h = np.where(mx == c[:, 0], ((c[:, 1] - c[:, 2]) / d) % 6, np.where(mx == c[:, 1], (c[:, 2] - c[:, 0]) / d + 2, (c[:, 0] - c[:, 1]) / d + 4)) / 6
    return np.stack([h, (mx - mn) / (mx + 1e-9), mx], 1)


def is_skin(c):
    """warm, moderately saturated, not dark -- the lips (redder and stronger) and the painted-in
    shadows of hair and clothes are not"""
    hsv = rgb2hsv(c)
    h, sat, v = hsv[:, 0], hsv[:, 1], hsv[:, 2]
    warm = (h < 0.11) | (h > 0.97)
    lips = ((h < 0.03) | (h > 0.97)) & (sat > 0.5)
    return warm & ~lips & (sat > 0.2) & (sat < 0.68) & (v > 0.33)


def main():
    P, UV, I, EYES = load_mesh(GLB)
    tex = np.asarray(Image.open(TEX_IN).convert("RGB"), dtype=np.float64) / 255
    H, W = tex.shape[:2]

    # 1. weld the vertices split at the seams
    key = np.round(P / 1e-4).astype(np.int64)
    _, wid = np.unique(key, axis=0, return_inverse=True)
    wid = wid.ravel()
    nw = wid.max() + 1
    T = wid[I]                                            # triangles over the welded vertices

    # 2. the skin under each vertex: the median of the skin-coloured samples just inside its
    # triangles (an eyebrow or a speck next to it does not tint it)
    uvt = UV[I]                                           # (t, 3, 2)
    cen = uvt.mean(1, keepdims=True)
    samples, owner = [], []
    for k in range(3):
        for f in (0.2, 0.45, 0.7):
            q = cen[:, 0] + (uvt[:, k] - cen[:, 0]) * f
            samples.append(sample(tex, q))
            owner.append(T[:, k])
    samples, owner = np.concatenate(samples), np.concatenate(owner)
    ok = is_skin(samples)
    # (how much of what is round each vertex is skin: the hair's and the clothes' own warm specks
    # are not skin)
    skinfrac = np.bincount(owner, ok.astype(np.float64), nw) / np.maximum(np.bincount(owner, None, nw), 1)
    samples, owner = samples[ok], owner[ok]
    order = np.argsort(owner, kind="stable")
    owner, samples = owner[order], samples[order]
    starts = np.searchsorted(owner, np.arange(nw))
    counts = np.diff(np.append(starts, len(owner)))
    col = np.full((nw, 3), np.nan)
    pad = np.full((nw, max(1, counts.max())), np.nan)
    idx = np.arange(len(owner)) - starts[owner]
    for c in range(3):
        pad[:] = np.nan
        pad[owner, idx] = samples[:, c]
        with warnings.catch_warnings():
            warnings.simplefilter("ignore", RuntimeWarning)   # (vertices with no skin round them)
            col[:, c] = np.nanmedian(pad, 1)
    known = ~np.isnan(col[:, 0])

    # 3. over the surface (one ring): the skin carried in under the features (eyebrows, lips,
    # hair edges), then smoothed -- no blotches, no step where two islands meet
    e = np.concatenate([T[:, [0, 1]], T[:, [1, 2]], T[:, [2, 0]]])
    A = sparse.coo_matrix((np.ones(len(e)), (e[:, 0], e[:, 1])), shape=(nw, nw)).tocsr()
    A = ((A + A.T) > 0).astype(np.float64).tocsr()
    deg = np.asarray(A.sum(1)).ravel()
    have = known.copy()
    col[~have] = 0
    for _ in range(200):
        if have.all():
            break
        s_ = A @ (col * have[:, None])
        n_ = A @ have.astype(np.float64)
        new = (~have) & (n_ > 0)
        col[new] = s_[new] / n_[new][:, None]
        have |= new
    for _ in range(12):
        col = 0.5 * col + 0.5 * (A @ col) / np.maximum(deg, 1)[:, None]

    # 4. one skin tone, its own light and dark kept (cheeks, ears)
    ref = np.median(col[known], 0)
    lum = col.max(1)
    tone = np.clip(ref[None] * (lum / ref.max())[:, None], 0, 1)
    col = col * 0.5 + tone * 0.5
    print(f"welded {nw} vertices, skin on {known.mean():.0%}, skin tone {np.round(ref * 255)}")

    # 5. baked: the triangle under each texel (drawn into an id image), its corners' colours
    ids = Image.new("I", (W, H), -1)
    d = ImageDraw.Draw(ids)
    px = UV * [W, H]
    for t in range(len(I)):
        pts = [tuple(px[i]) for i in I[t]]
        d.polygon(pts, fill=t, outline=t)
    ids = np.asarray(ids, dtype=np.int64)
    cov = ids >= 0
    yy, xx = np.nonzero(cov)
    t = ids[yy, xx]
    a, b, c = px[I[t, 0]], px[I[t, 1]], px[I[t, 2]]
    p = np.stack([xx + 0.5, yy + 0.5], 1)
    v0, v1, v2 = b - a, c - a, p - a
    den = v0[:, 0] * v1[:, 1] - v1[:, 0] * v0[:, 1]
    den = np.where(np.abs(den) < 1e-12, 1e-12, den)
    l1 = np.clip((v2[:, 0] * v1[:, 1] - v1[:, 0] * v2[:, 1]) / den, 0, 1)
    l2 = np.clip((v0[:, 0] * v2[:, 1] - v2[:, 0] * v0[:, 1]) / den, 0, 1)
    s = np.maximum(l1 + l2, 1)
    l1, l2 = l1 / s, l2 / s
    l0 = 1 - l1 - l2
    skin_col = np.zeros((H, W, 3))
    skin_col[yy, xx] = col[T[t, 0]] * l0[:, None] + col[T[t, 1]] * l1[:, None] + col[T[t, 2]] * l2[:, None]

    # 6. which texels are skin. The texture's own padding is first filled from the islands' edges
    # (or blending at an edge would bring it back as a line round every island)
    _, (iy, ix) = ndimage.distance_transform_edt(~cov, return_indices=True)
    tex = tex[iy, ix]
    covf = cov.astype(np.float64)
    nblur = lambda a, sg, m=covf: ndimage.gaussian_filter(a * m, sg) / np.maximum(ndimage.gaussian_filter(m, sg), 1e-6)
    lum = tex.max(-1)
    # a texel clearly darker than its own surroundings is a drawn line, not skin: the mouth, the
    # lids, the nostrils (a broad painted-in shadow is not)
    drawn = lum < 0.8 * nblur(lum, 3.0)
    # sizes on the body, not in texels (the islands' texel densities differ several times over):
    # millimetres per texel from each triangle's area on the body and in the texture
    p3 = P[I]
    a3 = 0.5 * np.linalg.norm(np.cross(p3[:, 1] - p3[:, 0], p3[:, 2] - p3[:, 0]), axis=1)
    puv = px[I]
    auv = 0.5 * np.abs((puv[:, 1, 0] - puv[:, 0, 0]) * (puv[:, 2, 1] - puv[:, 0, 1]) - (puv[:, 2, 0] - puv[:, 0, 0]) * (puv[:, 1, 1] - puv[:, 0, 1]))
    mm = np.zeros((H, W))
    mm[yy, xx] = np.sqrt(a3[t] / np.maximum(auv[t], 1e-6)) * 1000
    # the face (brows to chin, cheek to cheek, round the eyes) and the eyes' rims
    ec = EYES.mean(0)
    head = P[P[:, 1] > ec[1] - 0.15]
    fwd = ec - head.mean(0)
    fwd[1] = 0
    fwd /= np.linalg.norm(fwd)
    fc = ec - np.array([0, 0.03, 0]) - fwd * 0.02
    tc = p3.mean(1)
    face_t = (np.linalg.norm(tc - fc, axis=1) < 0.085) & ((tc - head.mean(0)) @ fwd > 0)
    eyes2 = [EYES[EYES[:, 0] < ec[0]].mean(0), EYES[EYES[:, 0] >= ec[0]].mean(0)]
    rim_t = np.min([np.linalg.norm(tc - e, axis=1) for e in eyes2], 0) < 0.02
    tskin = skinfrac[T].mean(1)                            # how much skin round each triangle
    face, rim, onskin = (np.zeros((H, W), bool) for _ in range(3))
    face[yy, xx], rim[yy, xx], onskin[yy, xx] = face_t[t], rim_t[t], tskin[t] > 0.2
    hsv = rgb2hsv(tex.reshape(-1, 3)).reshape(H, W, 3)
    white = (hsv[..., 1] < 0.18) & (hsv[..., 2] > 0.7)
    K = cov & onskin & ((is_skin(tex.reshape(-1, 3)).reshape(H, W) & ~drawn) | (rim & white))
    # the dots and scratches inside the skin (marks small or thin, skin all round them): skin too
    # -- on the face only dots, its lines are thin as scratches
    marks, n = ndimage.label(cov & onskin & ~K)
    lab = np.arange(1, n + 1)
    area = ndimage.sum(np.ones_like(marks), marks, lab)
    thick = ndimage.maximum(ndimage.distance_transform_edt(marks > 0), marks, lab)
    near = ndimage.grey_dilation(marks, size=5)
    ring = (near > 0) & (marks == 0) & cov
    with np.errstate(all="ignore"):
        around = np.nan_to_num(np.asarray(ndimage.mean(K[ring], near[ring], lab)))
    mmk = np.asarray(ndimage.mean(mm, marks, lab))
    area_mm2, thick_mm = area * mmk ** 2, thick * mmk
    infacek = np.asarray(ndimage.mean(face, marks, lab)) > 0.5
    blemish = np.where(infacek, area_mm2 < 2, (area_mm2 < 5) | ((thick_mm < 0.8) & (area_mm2 < 40))) & (around > 0.7)
    K |= np.isin(marks, np.nonzero(blemish)[0] + 1)
    soft = np.clip(nblur(K.astype(np.float64), 0.7), 0, 1)[..., None]
    out = tex * (1 - soft) + skin_col * soft
    # in the hair and the clothes, their warm specks take the colour round them
    hairy = cov & ~onskin & is_skin(tex.reshape(-1, 3)).reshape(H, W)
    other = (cov & ~onskin & ~hairy).astype(np.float64)
    fillc = np.stack([nblur(tex[..., ch], 2.5, other) for ch in range(3)], -1)
    out[hairy] = fillc[hairy]
    # the mouth as painted (the smile's line and lips are near the skin's colour): found by its
    # teeth -- white on the face away from the eyes -- kept round them, fading into the skin
    tcol = sample(tex, UV[I].mean(1))
    th = rgb2hsv(tcol)
    below = ec[1] - tc[:, 1]
    teeth = face_t & ~rim_t & (th[:, 1] < 0.2) & (th[:, 2] > 0.65) & (below > 0.03) & (below < 0.09) & (np.abs((tc - ec) @ np.cross([0, 1, 0], fwd)) < 0.035)
    if teeth.sum() >= 3:
        mc = np.median(tc[teeth], 0)
        side = np.cross([0, 1, 0], fwd)
        rel = tc - mc
        q = np.sqrt((rel @ side / 0.034) ** 2 + (rel[:, 1] / 0.02) ** 2 + (rel @ fwd / 0.03) ** 2)
        w_t = np.clip((1.3 - q) / 0.4, 0, 1)
        wm = np.zeros((H, W))
        wm[yy, xx] = w_t[t]
        out = out * (1 - wm[..., None]) + tex * wm[..., None]
        print(f"mouth at {np.round(mc, 3)} from {int(teeth.sum())} teeth triangles (eyes at {np.round(ec, 3)}, forward {np.round(fwd, 2)}); kept {int((w_t > 0.5).sum())} triangles, {int((wm > 0.5).sum())} texels")
    out[~cov] = 0
    print(f"skin texels {K[cov].mean():.0%}, blemishes taken out {int(blemish.sum())}, specks in hair and clothes {int(hairy.sum())} texels")

    # the gaps between the islands: filled outward from the nearest island texel
    _, (iy, ix) = ndimage.distance_transform_edt(~cov, return_indices=True)
    out = out[iy, ix]
    Image.fromarray((out * 255 + 0.5).astype(np.uint8)).save(TEX_OUT)
    print("wrote", TEX_OUT)


if __name__ == "__main__":
    main()
