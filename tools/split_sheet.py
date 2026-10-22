"""Cut an AI-generated reference sheet (docs/ai_texture_sheets.md) into single textures.

A sheet is a grid of cells (cols x rows) with one subject per cell on a transparent or flat
key-colour background. For each cell the script
  1. keys out the background (real alpha if present, else the sheet's key colour),
  2. keeps the subject whose centre lies in that cell (small specks dropped),
  3. places it the way the renderer expects:
       top   - centred on the flower/leaf centre, scaled to fill 80 %, rotated so a petal points
               to 12 o'clock when the petal count is known
       side  - base (lowest opaque point) at the bottom centre, 90 % of the height
       free  - centred, 80 %
  4. checks what can be checked: one subject, not cut by the cell edge, petal count (angular
     profile of the outline), left/right symmetry for butterflies,
and writes ref/plant_textures_v3/<code>_<name>.png (1024 x 1024 RGBA) plus a review sheet.

Usage: split_sheet.py <sheet id A..F> <image> [--key #0000FF]
"""
import json, os, sys
import numpy as np
from PIL import Image, ImageDraw, ImageFont
from scipy import ndimage

OUT = "ref/plant_textures_v3"
REVIEW = "docs/texture_sheets"
# sheet id -> (cols, rows, cells in reading order: (code, name, placement, petal count or None))
SHEETS = {
    # grouped so that no subject shares the sheet's fallback key colour (A, C, E, F blue; B, D magenta)
    "A": (3, 2, [("C02", "poppy_top_apricot", "top", 4), ("C03", "globeflower_top", "top", None), ("C06", "buttercup_top", "top", 5),
                 ("H08", "cosmos_fading_top", "top", None), ("H07", "daisy_fading_top", "top", None), ("G01", "fireweed_flower_top", "top", 4)]),
    "B": (3, 2, [("G04", "larkspur_flower_front", "top", None), ("H02", "buttercup_leaf", "side", None), ("H03", "edelweiss_rosette_top", "top", None),
                 ("K01", "butterfly_apollo", "wing", None), ("K02", "butterfly_blue", "wing", None), ("K03", "butterfly_tortoiseshell", "wing", None)]),
    "C": (3, 2, [("H04", "poppy_bud_side", "free", None), ("H05", "globeflower_bud_side", "side", None), ("H06", "cranesbill_fruit_side", "side", None),
                 ("G02", "fireweed_spike_tip", "side", None), ("H01", "fireweed_leaf", "side", None), ("B9", "dry_grass_clump", "side", None)]),
    "D": (3, 2, [("G05", "bell_side", "free", None), ("G03", "dragonhead_flower_side", "free", None), ("B7", "brome_panicle", "side", None),
                 ("B8", "bluegrass_panicle", "side", None), ("S01", "spruce_branch", "free", None), ("S02", "spruce_top", "side", None)]),
    "E": (4, 1, [("F01s", "rose_sprig", "side", None), ("F02s", "spiraea_sprig", "side", None), ("F03s", "honeysuckle_sprig", "side", None),
                 ("F04s", "juniper_sprig", "side", None)]),
    "F": (2, 2, [("F01", "rose_shrub", "side", None), ("F02", "spiraea_shrub", "side", None), ("F03", "honeysuckle_shrub", "side", None),
                 ("F04", "juniper_shrub", "side", None)]),
    "G": (1, 2, [("T06", "yurt_band", "free", None), ("T09", "felt_rug", "free", None)]),
}


def alpha_of(a, key):
    """alpha from the image's own alpha, or keyed from a flat background colour"""
    rgb, al = a[..., :3], a[..., 3]
    if al.min() < 0.5:
        return al
    if key is None:   # sample the border: the background is the most common border colour
        b = np.concatenate([rgb[0], rgb[-1], rgb[:, 0], rgb[:, -1]])
        key = np.median(b, 0)
    k = np.round(np.array(key, np.float32))
    if np.abs(np.array(key) - k).max() < 0.2 and 0 < k.sum() < 3:
        # pure key (blue, green, magenta, ...): the key's excess over the other channels is the
        # background share of a pixel -- exact for anti-aliased edges and thin gaps between petals
        hi, lo = k > 0.5, k < 0.5
        excess = rgb[..., hi].min(-1) - rgb[..., lo].max(-1)
        return np.clip(1 - (excess - 0.06) / 0.86, 0, 1)
    d = np.linalg.norm(rgb - np.array(key, np.float32), axis=-1)
    return np.clip((d - 0.15) / 0.25, 0, 1)


def despill(rgb, al, key):
    """edge pixels are a mix al*subject + (1-al)*key: unmix them, then give the faint fringe the
    colour of the nearest solid pixel so no key colour survives"""
    if key is None:
        return rgb
    k = np.array(key, np.float32)
    a = np.maximum(al, 0.05)[..., None]
    fg = np.clip((rgb - (1 - a) * k) / a, 0, 1)
    fg = np.where((al > 0.999)[..., None], rgb, fg)
    solid = al > 0.85
    idx = ndimage.distance_transform_edt(~solid, return_distances=False, return_indices=True)
    return np.where((al < 0.6)[..., None], fg[idx[0], idx[1]], fg)


def petal_count(al):
    """dominant lobe frequency of the outline radius around the centre of mass, and its phase"""
    ys, xs = np.nonzero(al > 0.5)
    cy, cx = ys.mean(), xs.mean()
    ang = np.arctan2(ys - cy, xs - cx)
    rad = np.hypot(ys - cy, xs - cx)
    bins = ((ang + np.pi) / (2 * np.pi) * 360).astype(int) % 360
    r = np.zeros(360)
    np.maximum.at(r, bins, rad)
    r = ndimage.uniform_filter1d(r, 5, mode="wrap")
    f = np.fft.rfft(r - r.mean())
    k = 3 + int(np.argmax(np.abs(f[3:25])))
    strength = float(np.abs(f[k]) / (np.abs(f[1:40]).sum() + 1e-6))
    phase = float(np.angle(f[k]))   # peak of cos(k*theta + phase)
    return k, strength, (cy, cx), phase


def place(cell, al, mode, petals):
    """cell: RGBA float array of the subject only; returns 1024 x 1024 RGBA and notes"""
    notes = []
    ys, xs = np.nonzero(al > 0.05)
    y0, y1, x0, x1 = ys.min(), ys.max() + 1, xs.min(), xs.max() + 1
    sub = cell[y0:y1, x0:x1].copy()
    sub[..., 3] = al[y0:y1, x0:x1]
    im = Image.fromarray((np.clip(sub, 0, 1) * 255).astype(np.uint8), "RGBA")
    if mode in ("top", "wing"):
        if mode == "top" and petals:
            k, s, _, ph = petal_count(sub[..., 3])
            notes.append(f"petals {k} (want {petals}, clarity {s:.2f})")
            if k == petals:
                # angle (image coords, y down) of a petal tip: cos(k*theta + ph) max -> theta = -ph/k;
                # 12 o'clock is theta = -90 deg
                tip = np.degrees(-ph / k)
                im = im.rotate(tip + 90, resample=Image.BICUBIC, expand=True)
            else:
                notes.append("PETAL COUNT MISMATCH")
        if mode == "wing":
            a = np.asarray(im, np.float32)[..., 3] / 255
            sym = 1 - np.abs(a - a[:, ::-1]).sum() / max(a.sum(), 1)
            notes.append(f"symmetry {sym:.2f}" + ("" if sym > 0.85 else "  ASYMMETRIC"))
        s = 0.8 * 1024 / max(im.size)
        im = im.resize((max(1, round(im.width * s)), max(1, round(im.height * s))), Image.LANCZOS)
        out = Image.new("RGBA", (1024, 1024))
        out.alpha_composite(im, ((1024 - im.width) // 2, (1024 - im.height) // 2))
    elif mode == "side":
        s = 0.9 * 1024 / max(im.size)
        im = im.resize((max(1, round(im.width * s)), max(1, round(im.height * s))), Image.LANCZOS)
        out = Image.new("RGBA", (1024, 1024))
        # base: the centre of the lowest opaque row
        a = np.asarray(im)[..., 3]
        bx = int(np.nonzero(a[-1] > 128)[0].mean()) if (a[-1] > 128).any() else im.width // 2
        out.alpha_composite(im, (max(0, min(1024 - im.width, 512 - bx)), 1024 - im.height))
    else:
        s = 0.8 * 1024 / max(im.size)
        im = im.resize((max(1, round(im.width * s)), max(1, round(im.height * s))), Image.LANCZOS)
        out = Image.new("RGBA", (1024, 1024))
        out.alpha_composite(im, ((1024 - im.width) // 2, (1024 - im.height) // 2))
    return out, notes


def main():
    sid, path = sys.argv[1], sys.argv[2]
    key = None
    if "--key" in sys.argv:
        h = sys.argv[sys.argv.index("--key") + 1].lstrip("#")
        key = [int(h[i:i + 2], 16) / 255 for i in (0, 2, 4)]
    cols, rows, cells = SHEETS[sid]
    a = np.asarray(Image.open(path).convert("RGBA"), np.float32) / 255
    H, W = a.shape[:2]
    al = alpha_of(a, key)
    keyed = a[..., 3].min() > 0.5
    if keyed and key is None:
        b = np.concatenate([a[0, :, :3], a[-1, :, :3], a[:, 0, :3], a[:, -1, :3]])
        key = list(np.median(b, 0))
    if keyed:
        a[..., :3] = despill(a[..., :3], al, key)
    lab, n = ndimage.label(al > 0.5)
    sizes = ndimage.sum(np.ones_like(al), lab, range(1, n + 1))
    coms = ndimage.center_of_mass(np.ones_like(al), lab, range(1, n + 1))
    os.makedirs(OUT, exist_ok=True); os.makedirs(REVIEW, exist_ok=True)
    report, thumbs = [], []
    for i, (code, name, mode, petals) in enumerate(cells):
        cx0, cy0 = (i % cols) * W / cols, (i // cols) * H / rows
        cx1, cy1 = cx0 + W / cols, cy0 + H / rows
        # components whose centre lies in this cell; the biggest is the subject, others kept if
        # they are near it (petals, a separate bud) and dropped if they are specks
        ids = [j for j in range(n) if cx0 <= coms[j][1] < cx1 and cy0 <= coms[j][0] < cy1]
        if not ids:
            report.append({"code": code, "status": "EMPTY CELL"}); thumbs.append(None); continue
        objs = ndimage.find_objects(lab)
        # grid lines / frames: long AND thin (a band or a tall sprig is long but not thin)
        def is_line(j):
            h = objs[j][0].stop - objs[j][0].start
            w = objs[j][1].stop - objs[j][1].start
            return (w > 0.9 * W and h < 0.03 * H) or (h > 0.9 * H and w < 0.03 * W) or \
                   ((w > 0.9 * W or h > 0.9 * H) and sizes[j] < 0.08 * w * h)   # a frame: big box, almost empty
        ids = [j for j in ids if not is_line(j)]
        if not ids:
            report.append({"code": code, "status": "EMPTY CELL"}); thumbs.append(None); continue
        big = max(ids, key=lambda j: sizes[j])
        by, bx = objs[big]
        pad = 0.05 * min(W / cols, H / rows)
        def near(j):   # parts of the subject touch or nearly touch its main body; captions don't
            oy, ox = objs[j]
            return ox.start < bx.stop + pad and ox.stop > bx.start - pad and oy.start < by.stop + pad and oy.stop > by.start - pad
        keep = [j for j in ids if sizes[j] > sizes[big] * 0.003 and near(j)]
        dropped = [j for j in ids if j not in keep and sizes[j] > sizes[big] * 0.01]
        mask = np.isin(lab, [j + 1 for j in keep])
        m = ndimage.binary_dilation(mask, iterations=3)
        cal = al * m
        ys, xs = np.nonzero(cal > 0.05)
        notes = []
        if dropped:
            notes.append(f"dropped {len(dropped)} detached part(s) (caption?)")
        if len(keep) > 3:
            notes.append(f"{len(keep)} separate parts")
        # a subject may reach into its neighbour's cell (it is kept whole); it is only cut if it
        # runs into the edge of the sheet
        if xs.min() <= 1 or ys.min() <= 1 or xs.max() >= W - 2 or ys.max() >= H - 2:
            notes.append("TOUCHES SHEET EDGE (may be cut)")
        out, n2 = place(a, cal, mode, petals)
        notes += n2
        f = f"{OUT}/{code}_{name}.png"
        out.save(f, optimize=True)
        px = int(max(ys.max() - ys.min(), xs.max() - xs.min()))
        notes.append(f"subject {px} px in the sheet")
        report.append({"code": code, "file": f, "notes": notes})
        thumbs.append(out)
    # review sheet: each result on a mid-green ground (as in the meadow) with its notes
    font = ImageFont.truetype("/System/Library/Fonts/Supplemental/Arial.ttf", 18)
    rv = Image.new("RGB", (len(cells) * 340, 400), (30, 30, 30))
    for i, (t, r) in enumerate(zip(thumbs, report)):
        cell = Image.new("RGBA", (330, 330), (70, 110, 50, 255))
        if t is not None:
            cell.alpha_composite(t.resize((330, 330)))
        rv.paste(cell.convert("RGB"), (i * 340, 0))
        d = ImageDraw.Draw(rv)
        d.text((i * 340 + 4, 334), r["code"], fill=(255, 255, 255), font=font)
        for k, line in enumerate(r.get("notes", [r.get("status", "")])[:3]):
            d.text((i * 340 + 4, 354 + k * 15), line[:40], fill=(255, 120, 120) if line.isupper() or "MISMATCH" in line or "EDGE" in line else (200, 200, 200), font=ImageFont.truetype("/System/Library/Fonts/Supplemental/Arial.ttf", 13))
    rv.save(f"{REVIEW}/sheet_{sid}_review.jpg", quality=88)
    json.dump(report, open(f"{REVIEW}/sheet_{sid}_report.json", "w"), indent=1)
    for r in report:
        print(r["code"], "; ".join(r.get("notes", [r.get("status", "")])))


if __name__ == "__main__":
    main()
