"""Tile docs/snapshots/<names>.jpg into one small review image: snapgrid.py out.jpg name1 name2 ..."""
import sys
from PIL import Image
from pathlib import Path
SNAPSHOTS=Path(__file__).resolve().parents[1]/"docs/snapshots"
out, names = sys.argv[1], sys.argv[2:]
W = 900 if len(names) > 1 else 1400
ims = [Image.open(SNAPSHOTS/f"{n}.jpg") for n in names]
ims = [im.resize((W, round(W * im.height / im.width))) for im in ims]
cols = 1 if len(ims) == 1 else 2
rows = (len(ims) + cols - 1) // cols
h = max(im.height for im in ims)
o = Image.new("RGB", (cols * W + (cols - 1) * 8, rows * h + (rows - 1) * 8), "white")
for i, im in enumerate(ims):
    o.paste(im, ((i % cols) * (W + 8), (i // cols) * (h + 8)))
o.save(out, quality=85)
