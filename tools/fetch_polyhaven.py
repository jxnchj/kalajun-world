"""Download Poly Haven (CC0) models as glTF (+ textures) or texture sets at a given resolution."""
import json, os, sys, urllib.request

OUT = "assets/src/polyhaven"
UA = {"User-Agent": "kalajun-scene/0.1"}


def get(url):
    return urllib.request.urlopen(urllib.request.Request(url, headers=UA), timeout=60).read()


def fetch(asset, res="1k"):
    files = json.loads(get(f"https://api.polyhaven.com/files/{asset}"))
    d = os.path.join(OUT, asset)
    os.makedirs(d, exist_ok=True)
    if "gltf" in files:  # model
        g = files["gltf"][res]["gltf"]
        items = [(g["url"], os.path.basename(g["url"]))] + [(v["url"], k) for k, v in g.get("include", {}).items()]
    else:  # texture set: diffuse / normal / rough / arm / displacement as jpg/png
        items = []
        for m in ("Diffuse", "diff", "nor_gl", "Rough", "rough", "arm", "Displacement", "disp"):
            if m in files and res in files[m]:
                fmt = "jpg" if "jpg" in files[m][res] else "png"
                u = files[m][res][fmt]["url"]
                items.append((u, os.path.basename(u)))
    n = 0
    for url, rel in items:
        p = os.path.join(d, rel)
        os.makedirs(os.path.dirname(p), exist_ok=True)
        if not os.path.exists(p):
            open(p, "wb").write(get(url)); n += 1
    print(asset, res, len(items), "files", n, "new")


if __name__ == "__main__":
    res = sys.argv[1]
    for a in sys.argv[2:]:
        fetch(a, res)
