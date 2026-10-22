"""Does a drawn figure stand like the model it is to replace? Its silhouette (against a plain background)
measured against a front render of the model in its rest pose (the bones' A-pose), both as fractions of
the figure's height: where the head ends (the neck's narrowest), the crotch, the hands (height and how far
apart), the feet (how far apart), the shoulders' breadth -- the things the model's clips depend on. Prints
them side by side with the differences, and draws both outlines over each other (the drawing scaled to
the same height, feet on the same line): red the model, green the drawing.
Only the largest piece of the drawing counts (an inset photo in a corner, say, is left out).

Run: tools/.bpy/bin/python tools/silhouette_check.py <model_front.png> <drawing.jpg> <overlay.jpg>
"""
import sys
import numpy as np
import bpy

TOL = 0.03          # a difference beyond 3 % of the height: not the same stance


def load(path):
    im = bpy.data.images.load(path)
    W, H = im.size
    a = np.array(im.pixels[:], np.float32).reshape(H, W, 4)[::-1, :, :3]     # rows from the top
    bpy.data.images.remove(im)
    return a


def mask(img):
    """the figure: away from the background's colour (the border's median), its largest piece"""
    edge = np.concatenate([img[:4].reshape(-1, 3), img[-4:].reshape(-1, 3), img[:, :4].reshape(-1, 3), img[:, -4:].reshape(-1, 3)])
    bg = np.median(edge, 0)
    m = np.abs(img - bg).max(2) > 0.07
    # largest connected piece, on a coarse grid then back
    k = max(1, img.shape[1] // 256)
    small = m[::k, ::k]
    lab = np.zeros(small.shape, int); n = 0; sizes = {}
    for y, x in zip(*np.nonzero(small)):
        if lab[y, x]:
            continue
        n += 1; stack = [(y, x)]; lab[y, x] = n; c = 0
        while stack:
            a, b = stack.pop(); c += 1
            for dy, dx in ((1, 0), (-1, 0), (0, 1), (0, -1)):
                p, q = a + dy, b + dx
                if 0 <= p < small.shape[0] and 0 <= q < small.shape[1] and small[p, q] and not lab[p, q]:
                    lab[p, q] = n; stack.append((p, q))
        sizes[n] = c
    keep = max(sizes, key=sizes.get)
    big = np.kron(lab == keep, np.ones((k, k), bool))[:m.shape[0], :m.shape[1]]
    return m & big


def measure(m):
    ys, xs = np.nonzero(m)
    top, bot = ys.min(), ys.max(); H = bot - top
    cx = np.median(xs)
    width = m.sum(1)
    rows = np.arange(int(top + 0.10 * H), int(top + 0.34 * H))
    neck = rows[np.argmin(width[rows])]
    # the crotch: up the middle from the feet, the first row filled
    col = m[:, int(cx) - 2:int(cx) + 3].any(1)
    crotch = bot
    while crotch > top and not col[crotch]:
        crotch -= 1
    left, right = xs.min(), xs.max()
    hl = ys[xs == left].mean(); hr = ys[xs == right].mean()
    feet_rows = m[int(bot - 0.03 * H):bot + 1]
    fx = np.nonzero(feet_rows.any(0))[0]
    gaps = np.nonzero(np.diff(fx) > 2)[0]
    if len(gaps):
        g = gaps[np.argmax(np.diff(fx)[gaps])]
        feet = (fx[:g + 1].mean(), fx[g + 1:].mean())
    else:
        feet = (fx.min(), fx.max())
    sh_row = int(top + 0.30 * H)
    shoulders = np.nonzero(m[sh_row])[0]
    return {"H": H, "top": top, "bot": bot, "cx": cx,
            "head (top to neck)": (neck - top) / H,
            "legs (crotch to floor)": (bot - crotch) / H,
            "hands' height (from floor)": (bot - (hl + hr) / 2) / H,
            "hands apart": (right - left) / H,
            "feet apart": abs(feet[1] - feet[0]) / H,
            "breadth at 30 % down": (shoulders.max() - shoulders.min()) / H if len(shoulders) else 0}


def main():
    ref_p, drw_p, out_p = sys.argv[-3:]
    ref, drw = load(ref_p), load(drw_p)
    mr, md = mask(ref), mask(drw)
    a, b = measure(mr), measure(md)
    print(f"{'':28s} model  drawing  difference")
    bad = []
    for k in a:
        if k in ("H", "top", "bot", "cx"):
            continue
        d = b[k] - a[k]
        flag = "  <-- off" if abs(d) > TOL else ""
        if flag:
            bad.append(k)
        print(f"{k:28s} {a[k]:.3f}  {b[k]:.3f}   {d:+.3f}{flag}")
    # the outlines over each other
    s = a["H"] / b["H"]
    Hh, Wh = mr.shape
    yy, xx = np.mgrid[0:Hh, 0:Wh]
    sy = ((yy - a["bot"]) / s + b["bot"]).astype(int); sx = ((xx - a["cx"]) / s + b["cx"]).astype(int)
    ok = (sy >= 0) & (sy < md.shape[0]) & (sx >= 0) & (sx < md.shape[1])
    md2 = np.zeros_like(mr); md2[ok] = md[sy[ok], sx[ok]]
    edge = lambda m: m & ~(np.roll(m, 1, 0) & np.roll(m, -1, 0) & np.roll(m, 1, 1) & np.roll(m, -1, 1))
    over = ref * 0.35 + 0.6
    for e, c in ((edge(mr), (1, 0.1, 0.1)), (edge(md2), (0.1, 0.8, 0.1))):
        for d in range(-1, 2):
            over[np.roll(e, d, 1)] = c
    iou = (mr & md2).sum() / max(1, (mr | md2).sum())
    print(f"overlap of the silhouettes (IoU): {iou:.2f}")
    print("SAME STANCE" if not bad else "NOT THE SAME STANCE: " + ", ".join(bad))
    im = bpy.data.images.new("o", Wh, Hh)
    im.pixels = np.concatenate([over[::-1], np.ones((Hh, Wh, 1))], 2).ravel()
    im.filepath_raw = out_p; im.file_format = "JPEG"; im.save()


main()
