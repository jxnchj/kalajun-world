"""Publish only the independently approved candidate bytes; no default/GI/stream mutation."""
from pathlib import Path
import hashlib,json,shutil
R=Path(__file__).resolve().parents[1];D=R/'assets/src/v2/settlements/lodge-tables-v38'
m=json.loads((D/'complete-metadata.json').read_text());p=D/'lodge-tables-complete.glb'
assert hashlib.sha256(p.read_bytes()).hexdigest()==m['sourceSHA256']
assert m['originalSHA256']==json.loads((R/'web/src/v2/generated/lodge-chairs-source-38.json').read_text())['sourceSHA256']
dst=R/'web/public/assets/v2/gh_lanchuan_lodge_tables38.glb';shutil.copyfile(p,dst)
m['sourceGLB']='assets/v2/gh_lanchuan_lodge_tables38.glb';m['sourceBlend']=str((D/'lodge-tables-complete.blend').relative_to(R));m['chairCollisionSourceSHA256']=json.loads((R/'web/src/v2/generated/lodge-chairs-source-38.json').read_text())['originalSHA256']
(R/'web/src/v2/generated/lodge-tables-source-38.json').write_text(json.dumps(m,indent=2)+'\n')
print(m['sourceSHA256'],dst.stat().st_size)
