"""Extract the sky/ground boundary (skyline row per column) from a photo.

Pixels are classified sky/ground by an Otsu threshold on a brightness+smoothness
score, then a smooth boundary row per column is found with dynamic programming
(minimise misclassified pixels + L1 smoothness), which is robust to clouds and haze.
"""
import numpy as np
from PIL import Image
from scipy import ndimage


def otsu(x):
    hist, edges = np.histogram(x, 256)
    w = np.cumsum(hist); mu = np.cumsum(hist * edges[:-1])
    wt, mt = w[-1], mu[-1]
    between = (mt * w - mu * wt) ** 2 / np.maximum(w * (wt - w), 1)
    return edges[np.argmax(between)]


def skyline(path, width=700, smooth=0.6, max_jump=25):
    im = Image.open(path).convert("RGB")
    h = round(width * im.height / im.width)
    a = np.asarray(im.resize((width, h), Image.LANCZOS)).astype(np.float32) / 255
    lum = a @ np.array([0.299, 0.587, 0.114], np.float32)
    gy, gx = np.gradient(ndimage.gaussian_filter(lum, 1.0))
    tex = ndimage.uniform_filter(np.hypot(gx, gy), 5)
    score = lum - 4 * tex
    t = otsu(score[: int(h * 0.75)])
    sky = score > t
    # cost of putting the boundary at row r in column c: ground pixels above + sky pixels below
    ground_above = np.vstack([np.zeros((1, width)), np.cumsum(~sky, 0)])        # (h+1, w)
    sky_below = np.vstack([np.cumsum(sky[::-1], 0)[::-1], np.zeros((1, width))])
    cost = ground_above + sky_below                                             # boundary index 0..h
    H = h + 1
    acc = cost[:, 0].copy(); back = np.zeros((H, width), np.int32)
    offs = np.arange(-max_jump, max_jump + 1)
    r = np.arange(H)
    for c in range(1, width):
        prev = r[:, None] + offs[None, :]
        valid = (prev >= 0) & (prev < H)
        cand = np.where(valid, acc[np.clip(prev, 0, H - 1)] + smooth * np.abs(offs)[None, :], np.inf)
        k = np.argmin(cand, 1)
        back[:, c] = np.clip(r + offs[k], 0, H - 1)
        acc = cand[r, k] + cost[:, c]
    rows = np.zeros(width, np.float64)
    rows[-1] = np.argmin(acc)
    for c in range(width - 1, 0, -1):
        rows[c - 1] = back[int(rows[c]), c]
    rows[rows <= 1] = np.nan  # no sky in this column
    return rows, sky, a
