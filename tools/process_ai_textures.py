"""Method 1: turn AI-generated sprites (ref/textures/*.png|jpg) into clean game textures.

For each image: key out a transparent or pure-blue (#0000FF) background with blue-spill
removal and a soft 1 px edge, trim to the content, pad to the target aspect, and write
  web/public/assets/ai/<name>.png         colour + alpha
  web/public/assets/ai/<name>_n.png       normal map derived from luminance (for lighting)
plus a contact sheet for review. Names follow docs/ai_texture_prompts.md (A1a, B1b, ...).
"""
import glob, os, re, sys
import numpy as np
from PIL import Image, ImageFilter
from scipy import ndimage

SRC = "ref/textures"
OUT = "web/public/assets/ai"
os.makedirs(OUT, exist_ok=True)


def key_out(img):
    a = np.asarray(img.convert("RGBA"), np.float32) / 255
    rgb, alpha = a[..., :3], a[..., 3]
    if alpha.min() > 0.99:  # no transparency: chroma-key pure blue
        r, g, b = rgb[..., 0], rgb[..., 1], rgb[..., 2]
        blueness = np.clip((b - np.maximum(r, g)) * 2.2 - 0.25, 0, 1)
        alpha = 1 - blueness
        # despill: pull remaining blue down to the max of red/green near the edge
        spill = np.clip(b - np.maximum(r, g), 0, 1) * (alpha < 0.999)
        rgb[..., 2] = b - spill * 0.9
    alpha = ndimage.gaussian_filter(alpha, 0.6)
    alpha = np.clip((alpha - 0.15) / 0.7, 0, 1)
    # remove specks: keep components larger than 0.2% of the image
    lab, n = ndimage.label(alpha > 0.5)
    if n > 1:
        sizes = ndimage.sum(np.ones_like(alpha), lab, range(1, n + 1))
        keep = np.isin(lab, 1 + np.nonzero(sizes > alpha.size * 0.002)[0])
        alpha *= ndimage.binary_dilation(keep, iterations=2)
    # bleed colour into transparent pixels so mip-maps don't show dark fringes
    solid = alpha > 0.5
    idx = ndimage.distance_transform_edt(~solid, return_distances=False, return_indices=True)
    rgb = rgb[idx[0], idx[1]]
    return np.dstack([rgb, alpha])


def trim(a, pad=0.02):
    ys, xs = np.nonzero(a[..., 3] > 0.05)
    if len(xs) == 0:
        return a
    y0, y1, x0, x1 = ys.min(), ys.max() + 1, xs.min(), xs.max() + 1
    p = int(max(a.shape) * pad)
    return a[max(0, y0 - p):y1 + p, max(0, x0 - p):x1 + p]


def normal_from_lum(a, strength=2.0):
    lum = ndimage.gaussian_filter(a[..., :3] @ np.array([0.3, 0.55, 0.15], np.float32), 1.0)
    gy, gx = np.gradient(lum)
    n = np.dstack([-gx * strength * 8, -gy * strength * 8, np.ones_like(lum)])
    n /= np.linalg.norm(n, axis=-1, keepdims=True)
    return (n * 0.5 + 0.5)


def main():
    files = sorted(glob.glob(f"{SRC}/*.png") + glob.glob(f"{SRC}/*.jpg") + glob.glob(f"{SRC}/*.webp"))
    if not files:
        print("no images in", SRC); return
    thumbs = []
    for f in files:
        name = os.path.splitext(os.path.basename(f))[0]
        a = trim(key_out(Image.open(f)))
        size = 1024
        img = Image.fromarray((np.clip(a, 0, 1) * 255).astype(np.uint8), "RGBA")
        img.thumbnail((size, size), Image.LANCZOS)
        img.save(f"{OUT}/{name}.png", optimize=True)
        n = normal_from_lum(np.asarray(img, np.float32) / 255)
        Image.fromarray((n * 255).astype(np.uint8), "RGB").save(f"{OUT}/{name}_n.png", optimize=True)
        th = Image.new("RGBA", (256, 256), (60, 60, 60, 255))
        t = img.copy(); t.thumbnail((256, 256))
        th.alpha_composite(t, ((256 - t.width) // 2, (256 - t.height) // 2))
        thumbs.append(th)
        print(f"{name}: {img.size}")
    cols = 5
    sheet = Image.new("RGBA", (cols * 260, ((len(thumbs) + cols - 1) // cols) * 260), (255, 255, 255, 255))
    for i, t in enumerate(thumbs):
        sheet.alpha_composite(t, ((i % cols) * 260, (i // cols) * 260))
    sheet.convert("RGB").save(sys.argv[1] if len(sys.argv) > 1 else f"{OUT}/_sheet.jpg")


if __name__ == "__main__":
    main()
