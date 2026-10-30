"""Atomic immutable payloads; caller supplies full source/shape/dependency identity."""
import hashlib,json
from pathlib import Path
def digest(value):return hashlib.sha256(json.dumps(value,separators=(',',':'),sort_keys=True,allow_nan=False).encode()).hexdigest()
def save(path,identity,payload):
 path=Path(path);path.parent.mkdir(parents=True,exist_ok=True)
 value={'identity':identity,'payload':payload};value['sha256']=digest(value)
 if path.exists():
  assert load(path,identity)==payload,('Existing checkpoint differs',str(path));return
 temp=path.with_suffix(path.suffix+'.tmp');temp.write_text(json.dumps(value,separators=(',',':'),allow_nan=False));temp.replace(path)
def load(path,identity):
 value=json.loads(Path(path).read_text());expected=value.pop('sha256');assert digest(value)==expected,('Checkpoint digest mismatch',str(path));assert value['identity']==identity,('Checkpoint identity mismatch',str(path));return value['payload']

def apply_from_zero(points,shift):
 import math
 assert math.isfinite(shift)and abs(shift)<=.00025+1e-12
 return [(p[0],p[1],p[2]+shift)for p in points]
