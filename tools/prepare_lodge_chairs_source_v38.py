"""Publish independent chair candidate binding; verifies existing final source, never edits parent."""
from pathlib import Path
import json,hashlib,shutil
ROOT=Path(__file__).resolve().parents[1]
D=ROOT/'assets/src/v2/settlements/lodge-chairs-v38'
V=ROOT/'web/src/v2'
m=json.loads((D/'complete-metadata.json').read_text())
sha=lambda p:hashlib.sha256(p.read_bytes()).hexdigest()
assert sha(ROOT/m['sourceGLB'])==m['sourceSHA256']
assert sha(ROOT/m['sourceBlend'])==m['blendSHA256']
parent=json.loads((V/'generated/lodge-furniture-source-38.json').read_text())
assert m['originalSHA256']==parent['sourceSHA256']
assert sha(ROOT/'web/public'/parent['sourceGLB'])==m['originalSHA256']
s={k:m[k] for k in ['sourceSHA256','sourceBlend','blendSHA256','originalSHA256','totalTriangles']}
s['sourceGLB']='assets/v2/gh_lanchuan_lodge_chairs38.glb'
s['materialReflectance']={**parent['materialReflectance'],**m['materialReflectance']}
shutil.copyfile(ROOT/m['sourceGLB'],ROOT/'web/public'/s['sourceGLB'])
assert sha(ROOT/'web/public'/s['sourceGLB'])==s['sourceSHA256']
(V/'generated/lodge-chairs-source-38.json').write_text(json.dumps(s,indent=2)+'\n')
print(json.dumps({'source':s['sourceGLB'],'sha256':s['sourceSHA256'],'triangles':s['totalTriangles']}))
