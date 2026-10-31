if not __debug__:
 raise RuntimeError('Packaging verifier requires enabled assertions; -O/-OO forbidden')
import sys,json,gzip,hashlib,copy
from pathlib import Path
old,new=map(Path,sys.argv[1:3]);actualCode=json.loads(Path(sys.argv[3]).read_text());public='--public' in sys.argv[4:];sha=lambda b:hashlib.sha256(b).hexdigest()
rel=Path('tools/candidates/terrain-prepared42');a=json.loads((old/rel/'river-forest.json').read_text());b=json.loads((new/rel/'river-forest.json').read_text());assert b['code']==actualCode;assert set(a)==set(b)=={'version','candidateOnly','code','inputs','scope','position','entries','stats'},'Unexpected full manifest top-level keys';assert {k:v for k,v in a.items() if k not in ['code','entries','stats']}=={k:v for k,v in b.items() if k not in ['code','entries','stats']};pa=(old/rel/'river-forest.pack').read_bytes();pb=(new/rel/'river-forest.pack').read_bytes();assert len(a['entries'])==len(b['entries'])==1628;assert len(pa)==len(pb)==65280568
rows=[]
def block(x,y,oa,nb):
 assert {k:v for k,v in x.items()if k!='sha256'}=={k:v for k,v in y.items()if k!='sha256'}
 aa=oa[x['offset']:x['offset']+x['length']];bb=nb[y['offset']:y['offset']+y['length']];assert len(aa)==len(bb)==x['length'];assert sha(aa)==x['sha256'];assert sha(bb)==y['sha256'];assert aa[9]==19 and bb[9]==3;assert aa[:9]==bb[:9]and aa[10:]==bb[10:];raw=gzip.decompress(aa);assert raw==gzip.decompress(bb);assert len(raw)==x['rawLength'];return {'key':x['key'],'rawSHA256':sha(raw),'oldCompressedSHA256':sha(aa),'newCompressedSHA256':sha(bb),'rawBytes':len(raw)}
position=0
for x,y in zip(a['entries'],b['entries']):assert x['offset']==position;rows.append(block(x,y,pa,pb));position+=x['length']
assert position==len(pa);assert sum(r['rawBytes']for r in rows)==264002992

for k in ['rawBytes','packedBytes','tiles']:assert a['stats'][k]==b['stats'][k]
for k in ['visibleTiles','residentTiles','triangles','minSpacing','maxSpacing','generatedTiles','maxDepth','nearQueuedTiles','queuedTiles','morphingGroups']:assert a['stats']['terrain'][k]==b['stats']['terrain'][k],k
variants={}
if public:
 for v in ['terrain-prepared42','terrain-demand42']:
  rel=Path('web/public/data/v2')/v;ma=json.loads((old/rel/'river-forest.json').read_text());mb=json.loads((new/rel/'river-forest.json').read_text());assert mb['code']==actualCode
  def structure(m):
   c=copy.deepcopy(m);del c['code']
   for e in c['entries']:del e['sha256']
   return c
  assert structure(ma)==structure(mb),v
  paths=lambda base:{str(p.relative_to(base))for p in base.rglob('*')if p.is_file()}
  assert paths(old/rel)==paths(new/rel)
  shardRows=[]
  for sa,sb in zip(ma['shards'],mb['shards']):
   assert sa==sb;aa=(old/rel/sa['url']).read_bytes();bb=(new/rel/sb['url']).read_bytes();assert len(aa)==len(bb)==sa['bytes'];ea=[e for e in ma['entries']if e['shard']==sa['id']];eb=[e for e in mb['entries']if e['shard']==sb['id']];assert len(ea)==len(eb);position=0
   for x,y in zip(ea,eb):assert x['offset']==position;block(x,y,aa,bb);position+=x['length']
   assert position==len(aa);shardRows.append({'path':sa['url'],'bytes':len(bb),'newSHA256':sha(bb),'oldSHA256':sha(aa)})
  variants[v]={'rows':len(ma['entries']),'shards':shardRows,'allOtherManifestFieldsEqual':True,'headerExceptionOnly':True}
def diff(a,b,p='stats'):
 if isinstance(a,dict)and isinstance(b,dict):return sum((diff(a.get(k),b.get(k),p+'.'+k)for k in sorted(set(a)|set(b))),[])
 return []if a==b else[{'path':p,'before':a,'after':b}]
print(json.dumps({'status':'PASS_PROSPECTIVE_CONTRACT_V2_ONLY; prior strict contract FAIL remains','producerRows':rows,'oldPackSHA256':sha(pa),'newPackSHA256':sha(pb),'publicStatus':'PASS'if public else'NOT_RUN','publicVariants':variants,'statsChanges':diff(a['stats'],b['stats']),'actualCode':actualCode},indent=2))
