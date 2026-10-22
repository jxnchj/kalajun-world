"""Turn a CC0 photo texture (Poly Haven, assets/src/polyhaven) into the scene's painted look.

  1. orient: rotate so wood grain / planks run along U, as the models' UVs expect
  2. match: per-channel gain toward the mean colour of the texture it replaces (the scene's
     palette and overall tone stay as they are)
  3. paint (stylised variant only): total-variation smoothing (flat painted patches with crisp
     edges), soft value banding, the photo's cracks and grooves kept as darker strokes
Shingle roofs additionally get their courses resampled so each of the 8 texture bands used by
the roof builder (tools/blender/cabin.py shingle_slope) holds exactly one course.

Writes assets/tex/<target>_ph.png (photo, colour-matched) and <target>_ph_paint.png.
Usage: stylise_texture.py <polyhaven id> <target: wood_log|wood_plank|shingles> [rotate90]
"""
import sys
import numpy as np
from PIL import Image
from scipy import ndimage

SRC = "assets/src/polyhaven"
OUT = "assets/tex"
lin = lambda c: np.where(c <= 0.04045, c / 12.92, ((c + 0.055) / 1.055) ** 2.4)
srgb = lambda c: np.where(c <= 0.0031308, c * 12.92, 1.055 * np.power(np.clip(c, 0, None), 1 / 2.4) - 0.055)


def load(asset, kind):
    return np.asarray(Image.open(f"{SRC}/{asset}/textures/{asset}_{kind}_1k.jpg").convert("RGB"), np.float32) / 255


def kuwahara(img, r):
    """classic Kuwahara: each pixel takes the mean of the least-varied of its four quadrants"""
    k = r + 1
    means, vars_ = [], []
    lum = img @ np.array([0.3, 0.55, 0.15], np.float32)
    for dy in (0, -r):
        for dx in (0, -r):
            sl = lambda a: ndimage.shift(ndimage.uniform_filter(a, k, mode="wrap"), (-(dy + r / 2), -(dx + r / 2)), order=0, mode="wrap")
            m = np.stack([sl(img[..., c]) for c in range(3)], -1)
            v = sl(lum * lum) - sl(lum) ** 2
            means.append(m); vars_.append(v)
    idx = np.argmin(np.stack(vars_), 0)
    out = np.zeros_like(img)
    for q in range(4):
        out[idx == q] = means[q][idx == q]
    return out


def shingle_courses(img, n=8):
    """resample so the tile holds exactly n courses, each ending (butt edge, darkest line) at the
    bottom of its band"""
    lum = img.mean(2).mean(1)
    lum = lum - lum.mean()
    ac = np.correlate(np.tile(lum, 2), lum, "valid")[: len(lum)]
    lo = len(lum) // 12
    period = lo + int(np.argmax(ac[lo: len(lum) // 3]))
    phase = int(np.argmin(np.convolve(np.tile(lum, 2), np.ones(period) / period, "same")[:period]))
    rows = np.concatenate([np.tile(img, (3, 1, 1))[phase + k * period + (period // 2): phase + (k + 1) * period + (period // 2)] for k in range(n)])
    h = img.shape[0]
    return np.asarray(Image.fromarray((rows * 255).astype(np.uint8)).resize((img.shape[1], h), Image.LANCZOS), np.float32) / 255, period


def main():
    asset, target = sys.argv[1], sys.argv[2]
    rot = len(sys.argv) > 3 and sys.argv[3] == "rotate90"
    col, nor = load(asset, "diff"), load(asset, "nor_gl")
    if rot:
        col, nor = np.rot90(col).copy(), np.rot90(nor).copy()
    if target == "shingles":
        col, period = shingle_courses(col)
        nor, _ = shingle_courses(nor)
        print("course period", period, "px")
    ref = np.asarray(Image.open(f"{OUT}/{target}.png").convert("RGB"), np.float32) / 255
    c = lin(col)
    gain = lin(ref).reshape(-1, 3).mean(0) / c.reshape(-1, 3).mean(0)
    if target == "shingles":   # clay tiles -> weathered wood: take the value pattern, the wood's hue
        l = c @ np.array([0.2126, 0.7152, 0.0722], np.float32)
        c = l[..., None] * (lin(ref).reshape(-1, 3).mean(0) / max(l.mean(), 1e-4))
        gain = np.ones(3, np.float32)
    photo = np.clip(srgb(c * gain), 0, 1)
    Image.fromarray((photo * 255).astype(np.uint8)).save(f"{OUT}/{target}_ph.png", optimize=True)

    # painted: flatten photo noise into patches with crisp edges, band the values softly, keep the
    # dark cracks and grooves of the photo as strokes, and a trace of the grain
    from skimage.restoration import denoise_tv_chambolle
    p = denoise_tv_chambolle(photo, weight=0.09, channel_axis=-1).astype(np.float32)
    l = p @ np.array([0.3, 0.55, 0.15], np.float32)
    band = np.round(l * 8) / 8
    p = p * ((l + (band - l) * 0.35) / np.maximum(l, 1e-3))[..., None]
    lp = photo @ np.array([0.3, 0.55, 0.15], np.float32)
    crack = np.clip((ndimage.gaussian_filter(lp, 3) - lp) * 5 - 0.12, 0, 1)   # darker than surroundings
    crack = ndimage.gaussian_filter(crack, 0.7)
    p = p * (1 - 0.55 * crack[..., None])
    p = p + (photo - ndimage.gaussian_filter(photo, (2, 2, 0))) * 0.25          # a trace of fine grain
    Image.fromarray((np.clip(p, 0, 1) * 255).astype(np.uint8)).save(f"{OUT}/{target}_ph_paint.png", optimize=True)
    print("wrote", f"{target}_ph.png", f"{target}_ph_paint.png")


if __name__ == "__main__":
    main()
