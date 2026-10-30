"""Independent immutable AO release/run/output binding shared by readbacks."""
import hashlib,json
from pathlib import Path
H=Path(__file__).resolve().parent;R=H.parents[1];G=R/'backups/cloud75-textile-gi-staging'
def sha(p):return hashlib.sha256(Path(p).read_bytes()).hexdigest()
def bind(ao,receipt):
 ao=Path(ao).resolve();receipt=Path(receipt).resolve();assert ao.parent==G
 release=json.loads(receipt.read_text());assert release['schemaVersion']==1 and release['candidateVersion']==4;assert release['stage']=='ao'and release['approvedBy']=='root'and release['approvedForStaging']is True
 assert set(release['inputs'])=={'blend','geometry','manifest'}
 pre={k:Path(v['path']).resolve()for k,v in release['inputs'].items()}
 assert all(p.parent==pre['blend'].parent for p in pre.values())
 for k,p in pre.items():assert p.is_relative_to(R/'backups')and sha(p)==release['inputs'][k]['sha256']
 assert release['gates']['geometry3D']is True and release['gates']['sameConditionGeometryVisual']is True
 assert len(release['evidence'])==2 and {e['role']for e in release['evidence']}=={'geometry3D','sameConditionGeometryVisual'}
 evidence={}
 for row in release['evidence']:
  p=Path(row['path']);assert sha(p)==row['sha256'];v=json.loads(p.read_text());assert v['role']==row['role'];assert v['status']=='PASS'and v['approvedBy']=='root'and v['inputs']==release['inputs'];evidence[row['role']]={'path':str(p),'sha256':sha(p)}
 run=json.loads((ao/'run.json').read_text());assert run['status']=='BAKED_NOT_VALIDATED'and run['stage']=='ao'and run['protectedUnchanged']is True and run['receiptSHA256']==sha(receipt)
 for name,h in run['outputs'].items():assert Path(name).name==name and sha(ao/name)==h,('AO output changed',name)
 protected=json.loads((ao/'protected-inputs.json').read_text());drift=[p for p,h in protected.items()if not Path(p).is_file()or sha(p)!=h];assert not drift,('Protected input drift after AO',drift)
 post={'blend':ao/'textile-volume75.blend','geometry':ao/'geometry.glb','manifest':ao/'manifest.json'}
 before_manifest=json.loads(pre['manifest'].read_text());after_manifest=json.loads(post['manifest'].read_text());assert before_manifest['geometrySHA256']==sha(pre['geometry'])and after_manifest['geometrySHA256']==sha(post['geometry'])
 a=dict(before_manifest);b=dict(after_manifest);a.pop('geometrySHA256');b.pop('geometrySHA256');assert a==b,'AO changed manifest beyond geometry SHA'
 expected=[n['name']for n in before_manifest['nodes']];assert len(expected)==9 and len(set(expected))==9
 return pre,post,{'receipt':{'path':str(receipt),'sha256':sha(receipt)},'run':{'path':str(ao/'run.json'),'sha256':sha(ao/'run.json')},'preAO':{k:{'path':str(p),'sha256':sha(p)}for k,p in pre.items()},'postAO':{k:{'path':str(p),'sha256':sha(p)}for k,p in post.items()},'typedGeometryAndPreviewEvidence':evidence,'protectedFileCount':len(protected),'protectedAllRechecked':True,'textileNames':expected}
