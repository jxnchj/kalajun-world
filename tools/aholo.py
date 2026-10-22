"""Aholo (群核科技's Lux3D OpenAPI, https://labs.aholo3d.cn) from the command line, for making assets: a model
from a text or from pictures, a humanoid rigged and given clips from its library, a model in other
formats. Each job is waited for and its files downloaded into assets/src/aholo/<name>/ with record.json
(what was asked, the task, the files). The asking jobs cost the account's credit; the queries do not.

  picture [<img>] --prompt "<text>" --name N                                     picture (+ text) to a picture (credit)
  views [<img>] [--prompt "<text>"] --name N                                     a picture to four views       (credit)
  text "<prompt>" --name N [--style S] [--turbo] [--faces F] [--pbr] [--size]   text to 3D       (credit)
  image <img> [<img> ...] --name N [--turbo] [--faces F] [--pbr] [--size]       pictures to 3D   (credit)
  rig <model.glb | url> --name N                                                 humanoid rig     (credit)
  animate <rigged.glb | url> --anims A,B --name N [--fbx] [--combined]           library clips    (credit)
  export <model.glb | url> --formats fbx_zip,obj_zip --name N                    other formats    (credit)
  download <taskId> --name N        a job's files (one that outlived the wait)
  status <taskId>  |  list [--page P]  |  animations                             free
  balance                           credits left, free trials                 free
  prices                            Aholo's own quote of each kind of job     free

Styles: photorealistic cartoon anime hand_painted cyberpunk fantasy glass. --turbo: G1-Turbo (faster);
--faces: 10000-300000; --pbr: PBR materials; --size: let it guess the real size. Local models are
uploaded first (Aholo's asset storage, China region).

The key: AHOLO_API_KEY in the environment, else read from the user's interactive zsh (~/.zshrc exports
it; the tools' shell is not interactive). It is never printed.
Run: tools/.aholo/bin/python tools/aholo.py <command> ...
"""
import argparse, json, os, subprocess, sys, time
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
OUT = ROOT / "assets" / "src" / "aholo"
REGION = os.environ.get("AHOLO_REGION", "cn")


def key():
    k = os.environ.get("AHOLO_API_KEY")
    if not k:
        try:
            k = subprocess.run(["zsh", "-ic", 'printf "%s" "$AHOLO_API_KEY"'], capture_output=True, text=True,
                               timeout=20).stdout.strip()
        except Exception:
            k = ""
    if not k:
        sys.exit("No AHOLO_API_KEY (export it in ~/.zshrc)")
    os.environ["AHOLO_API_KEY"] = k
    return k


def clients():
    from manycore.aholo_sdk_core import AholoClientConfig
    from manycore.aholo_sdk_lux3d import create_lux3d_client
    from manycore.aholo_sdk_asset import create_asset_client
    key()
    cfg = AholoClientConfig(region=REGION)
    return create_lux3d_client(cfg), create_asset_client(cfg)


def gateway(method, path, body=None, query="", soft=False):
    """A plain call to the China gateway (the account and the price quote: not in the SDK)."""
    import urllib.request, urllib.error
    base = "https://api.aholo3d.cn" if REGION == "cn" else "https://api.aholo3d.com/global"
    req = urllib.request.Request(base + path + query, method=method, data=json.dumps(body).encode() if body is not None else None,
                                 headers={"Authorization": key(), "Content-Type": "application/json"})
    try:
        with urllib.request.urlopen(req, timeout=30) as r:
            out = json.loads(r.read())
    except urllib.error.HTTPError as e:
        text = e.read().decode()
        if soft:
            return json.loads(text)
        sys.exit(f"HTTP {e.code}: {text[:300]}")
    if soft:
        return out
    if str(out.get("c")) != "0":
        sys.exit(f"Aholo: {out.get('m')}")
    return out["d"]


def account():
    return gateway("GET", "/lux3d/v1/account/balance", query="?source=2")     # (source 2: claude-code)


PRICED = {   # one of each kind of job, priced by Aholo (/lux3d/v1/pricing/openapi-quotes)
    "picture (a picture + text to a picture)": ("/generate/multimodal-to-image/task/create", {"img": "https://example.com/a.png", "prompt": "front view"}),
    "views (one picture to four views)": ("/generate/image-to-four-view/task/create", {"img": "https://example.com/a.png"}),
    "image, G1, several views": ("/generate/img-to-3d/task/create", {"imgs": ["https://example.com/a.png"] * 4, "version": "G1", "outputFormat": ["glb"]}),
    "image, G1, one picture": ("/generate/img-to-3d/task/create", {"img": "https://example.com/a.png", "version": "G1", "outputFormat": ["glb"]}),
    "image, G1-Turbo": ("/generate/img-to-3d/task/create", {"img": "https://example.com/a.png", "version": "G1-Turbo", "outputFormat": ["glb"]}),
    "text, G1": ("/generate/text-to-3d/task/create", {"prompt": "a chair", "version": "G1", "outputFormat": ["glb"]}),
    "rig": ("/animations/rig/task/create", {"modelUrl": "https://example.com/a.glb"}),
    "animate (1 clip)": ("/animations/retarget/task/create", {"rigModelUrl": "https://example.com/a.glb", "animationIds": ["Walk_Loop"]}),
    "export": ("/multi-format-export/task/create", {"modelUrl": "https://example.com/a.glb", "outputFormat": ["fbx_zip"]}),
}


def prices():
    acc = account()
    items = {str(i + 1): {"endpoint": {"method": "POST", "path": "/lux3d/v1" + p},
                          "parameters": {"pathParameters": "{}", "queryParameters": "{}", "body": json.dumps(b)}}
             for i, (p, b) in enumerate(PRICED.values())}
    def quote(its):
        return gateway("POST", "/lux3d/v1/pricing/openapi-quotes", soft=True,
                       body={"source": 2, "uniqueId": acc["uniqueId"], "agentName": "claude-code", "items": its})
    q = quote(items)
    bad = set(((q.get("d") or {}).get("errors") or {}).keys()) if str(q.get("c")) != "0" else set()
    if bad:     # priced without the ones it will not quote
        q = quote({k: v for k, v in items.items() if k not in bad})
    det = (q.get("d") or {}).get("details") or {}
    for i, label in enumerate(PRICED):
        k = str(i + 1)
        print(f"  {label}: " + ("not quotable here" if k in bad else f"{det.get(k)} credits"))
    print(f"(before free trials and member benefits; credits left {acc['availableCredits']}, free trials {acc.get('trialCountMap')})")


def model_url(asset, src):
    """A model given as a URL is used as is; a local file is uploaded first."""
    if src.startswith(("http://", "https://")):
        return src
    p = Path(src)
    if not p.exists():
        sys.exit(f"no such file: {src}")
    up = asset.upload_file(str(p))
    return getattr(up, "url", None) or up["url"]


def save(name, record, result):
    """The job's outputs downloaded (each output's content a URL), the record written."""
    import httpx
    d = OUT / name
    d.mkdir(parents=True, exist_ok=True)
    files = []
    urls = []
    for o in result.get("outputs", []):
        c = o.get("content")
        if isinstance(c, str) and c.startswith("["):      # (some jobs give a JSON list of links)
            try:
                c = json.loads(c)
            except ValueError:
                pass
        urls += c if isinstance(c, list) else [c]
    for i, url in enumerate(urls):
        if not url or url == "NOT_REQUESTED" or not str(url).startswith("http"):
            continue
        fn = Path(url.split("?")[0]).name or f"output_{i}"
        with httpx.stream("GET", url, timeout=300, follow_redirects=True) as r:
            r.raise_for_status()
            with open(d / fn, "wb") as f:
                for chunk in r.iter_bytes():
                    f.write(chunk)
        files.append(fn)
        print(f"  saved {d.relative_to(ROOT) / fn} ({(d / fn).stat().st_size // 1024} KB)")
    record.update({"taskId": result.get("taskId"), "status": result.get("status"), "files": files,
                   "outputs": [o.get("content") for o in result.get("outputs", [])],
                   "finished": time.strftime("%Y-%m-%d %H:%M:%S")})
    runs = json.loads((d / "record.json").read_text()) if (d / "record.json").exists() else []
    runs.append(record)
    (d / "record.json").write_text(json.dumps(runs, ensure_ascii=False, indent=1))
    return files


def run(lux, name, record, task_id):
    print(f"task {task_id} submitted; waiting (polls every 12 s, up to 30 min) ...")
    record["submitted"] = time.strftime("%Y-%m-%d %H:%M:%S")
    t0 = time.monotonic()
    try:
        result = lux.tasks.wait_for(task_id, timeout_ms=30 * 60 * 1000)
    except Exception as e:
        print(f"not finished: {e}\nlater: tools/.aholo/bin/python tools/aholo.py download {task_id} --name {name}")
        d = OUT / name; d.mkdir(parents=True, exist_ok=True)
        (d / f"pending_{task_id}.json").write_text(json.dumps(record, ensure_ascii=False, indent=1))
        sys.exit(1)
    print(f"done in {int(time.monotonic() - t0)} s")
    save(name, record, result)


def gen_opts(a):
    o = {"version": "G1-Turbo" if a.turbo else "G1", "output_format": ["glb"]}
    if a.faces:
        o["face_count"] = a.faces
    if a.pbr:
        o["enable_pbr"] = True
    if a.size:
        o["ai_predict_size"] = True
    return o


def main():
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    sub = ap.add_subparsers(dest="cmd", required=True)
    for c in ("text", "image"):
        s = sub.add_parser(c)
        s.add_argument("src", nargs="+")
        s.add_argument("--name", required=True)
        s.add_argument("--turbo", action="store_true")
        s.add_argument("--faces", type=int)
        s.add_argument("--pbr", action="store_true")
        s.add_argument("--size", action="store_true")
        if c == "text":
            s.add_argument("--style")
    for c in ("picture", "views"):
        s = sub.add_parser(c)
        s.add_argument("src", nargs="?")
        s.add_argument("--prompt")
        s.add_argument("--name", required=True)
    s = sub.add_parser("rig"); s.add_argument("src"); s.add_argument("--name", required=True)
    s = sub.add_parser("animate"); s.add_argument("src"); s.add_argument("--anims", required=True)
    s.add_argument("--name", required=True); s.add_argument("--fbx", action="store_true"); s.add_argument("--combined", action="store_true")
    s = sub.add_parser("export"); s.add_argument("src"); s.add_argument("--formats", required=True); s.add_argument("--name", required=True)
    s = sub.add_parser("download"); s.add_argument("task"); s.add_argument("--name", required=True)
    s = sub.add_parser("status"); s.add_argument("task")
    s = sub.add_parser("list"); s.add_argument("--page", type=int, default=1)
    sub.add_parser("animations")
    sub.add_parser("balance")
    sub.add_parser("prices")
    a = ap.parse_args()

    if a.cmd == "balance":
        acc = account()
        print(json.dumps({k: v for k, v in acc.items() if k != "uniqueId"}, ensure_ascii=False, indent=1))
        return
    if a.cmd == "prices":
        prices()
        return

    if a.cmd == "animations":
        from manycore.aholo_sdk_lux3d.humanoid_animations import HUMANOID_ANIMATION_IDS
        print("\n".join(sorted(HUMANOID_ANIMATION_IDS)))
        return
    lux, asset = clients()
    if a.cmd == "status":
        print(json.dumps(lux.tasks.retrieve(a.task), ensure_ascii=False, indent=1))
    elif a.cmd == "list":
        print(json.dumps(lux.tasks.list(page=a.page, page_size=20), ensure_ascii=False, indent=1))
    elif a.cmd == "download":
        rec = OUT / a.name / f"pending_{a.task}.json"
        record = json.loads(rec.read_text()) if rec.exists() else {"command": "download", "taskId": a.task}
        save(a.name, record, lux.tasks.retrieve(a.task))
        if rec.exists():
            rec.unlink()
    elif a.cmd == "text":
        o = gen_opts(a)
        prompt = " ".join(a.src)
        if a.style:
            o["style"] = a.style
        record = {"command": "text", "prompt": prompt, **o}
        run(lux, a.name, record, lux.text_to_3d.create(prompt=prompt, **o))
    elif a.cmd == "image":
        o = gen_opts(a)
        record = {"command": "image", "images": [str(Path(p).resolve()) for p in a.src], **o}
        tid = (lux.img_to_3d.create_from_file(a.src[0], **o) if len(a.src) == 1
               else lux.img_to_3d.create_from_files(a.src, **o))
        run(lux, a.name, record, tid)
    elif a.cmd in ("picture", "views"):
        if not a.src and not a.prompt:
            sys.exit("a picture, a prompt, or both")
        res = lux.multimodal_to_image if a.cmd == "picture" else lux.image_to_four_view
        record = {"command": a.cmd, "image": str(Path(a.src).resolve()) if a.src else None, "prompt": a.prompt}
        run(lux, a.name, record, res.create_from_file(a.src, prompt=a.prompt))
    elif a.cmd == "rig":
        url = model_url(asset, a.src)
        record = {"command": "rig", "model": a.src, "modelUrl": url}
        run(lux, a.name, record, lux.humanoid_auto_rig.create(model_url=url))
    elif a.cmd == "animate":
        url = model_url(asset, a.src)
        ids = [x.strip() for x in a.anims.split(",") if x.strip()]
        o = {"animation_ids": ids, "out_format": "fbx" if a.fbx else "glb",
             "animation_output_mode": "combined" if a.combined else "separate"}
        record = {"command": "animate", "model": a.src, "modelUrl": url, **o}
        run(lux, a.name, record, lux.humanoid_animation_retarget.create(rig_model_url=url, **o))
    elif a.cmd == "export":
        url = model_url(asset, a.src)
        fm = [x.strip() for x in a.formats.split(",") if x.strip()]
        record = {"command": "export", "model": a.src, "modelUrl": url, "formats": fm}
        run(lux, a.name, record, lux.multi_format_export.create(model_url=url, output_format=fm))


if __name__ == "__main__":
    main()
