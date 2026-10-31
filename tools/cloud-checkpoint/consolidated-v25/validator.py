"""Consolidated v25 schema guard. No network, deletion, or implicit adoption."""
# Public port: fail closed even if assertions in a caller/test are optimized away.
if not __debug__:
 raise RuntimeError('Optimized Python (-O/-OO) is not supported for recovery validation')
import hashlib, json, re, stat, unicodedata, zipfile
from pathlib import Path, PurePosixPath
SHA=re.compile(r'^[0-9a-f]{64}$')
LIMITS={'entries':10000,'fileBytes':134217728,'totalBytes':1073741824,'ratio':1000}
def require(ok,msg):
 if not ok: raise ValueError(msg)
def pathkey(name):
 require(isinstance(name,str) and name and '\\' not in name and '\x00' not in name,'unsafe path')
 p=PurePosixPath(name)
 require(not p.is_absolute() and all(x not in ('','..','.') for x in name.split('/')) and ':' not in name,'unsafe path')
 return unicodedata.normalize('NFC',name).casefold()
def destinations(rows):
 seen={}
 for r in rows:
  k=pathkey(r['destination']);require(k not in seen,'duplicate normalized destination');seen[k]=r
 for k in seen:
  require(not any('/'.join(k.split('/')[:i]) in seen for i in range(1,len(k.split('/')))),'file directory collision')
 return seen
def validate_schema(m, *, expected_anchor_sha=None, anchor_path=None):
 require(isinstance(expected_anchor_sha,str) and SHA.fullmatch(expected_anchor_sha) is not None,'external anchor pin required')
 raw=Path(anchor_path or Path(__file__).with_name('trust-anchor.json')).read_bytes()
 require(hashlib.sha256(raw).hexdigest()==expected_anchor_sha,'anchor digest mismatch')
 trusted=json.loads(raw)
 require(m['production']['commit']==trusted['productionCommit'],'production commit')
 require(m['primary']['libraryFileID']==trusted['primaryLibraryID'],'primary identity')
 require(m['variants']==trusted['variantBindings'],'trusted variant roles/destinations/precedence')
 require(m['recipes']==trusted['recipes'],'trusted recipes')
 require(m['sourceArchives']==trusted['sourceArchives'],'trusted source metadata')
 expectedGit={f['path']:f for f in trusted['gitTexts']}
 observedGit=set();observedOrigins=set()
 require(m['schema']=='kalajun-consolidated-v25/1','schema')
 require(m['primary']['expectedCurrentVersion']==24 and m['primary']['newVersion'] is None,'premature version')
 require(m['production']['candidateDefault']=='OFF','candidate default')
 sources={}
 for s in m['sourceArchives']:
  require(s['key'] not in sources,'source duplicate');sources[s['key']]=s
  for f in ('sha256','manifestSHA256','receiptSHA256'):require(bool(SHA.fullmatch(s[f])),f)
  require(s['libraryFileID'].startswith('libfile_') and s['backingFileID'].startswith('file_') and isinstance(s['version'],int) and s['version']>=0,'source identity')
 require(m['variants'] and len(m['variants'])<=LIMITS['entries'],'count')
 destinations(m['variants']);total=0
 for v in m['variants']:
  require(bool(SHA.fullmatch(v['sha256'])) and isinstance(v['bytes'],int) and 0<=v['bytes']<=LIMITS['fileBytes'],'payload bound');total+=v['bytes']
  require(v['role'] in ('current-git','candidate','history','evidence'),'role')
  require(v['automaticOverlay'] is False,'implicit overlay')
  if v['role']=='history':require(v['destination'].startswith('historical-context/'),'history namespace')
  require(v['occurrences'],'missing origins')
  for o in v['occurrences']:
   require(o['source'] in sources or o['source']=='current-git','unknown source');pathkey(o['entry'])
   require((o['source'],o['entry']) not in observedOrigins,'duplicate occurrence')
   observedOrigins.add((o['source'],o['entry']))
   if o['source']!='current-git':
    e=sources[o['source']]['entryIndex'].get(o['entry']);require(e is not None and e['sha256']==v['sha256'] and e['bytes']==v['bytes'],'origin content mismatch')
   else:
    e=expectedGit.get(o['entry']);require(e is not None,'git entry')
    require(v['role']=='current-git' and v['originalPath']==o['entry'] and v['destination']=='current-git/'+o['entry'] and all(v[k]==e[k] for k in ('bytes','sha256','gitBlob')),'git binding');observedGit.add(o['entry'])
 require(total<=LIMITS['totalBytes'],'total bound')
 expectedOrigins={(key,n) for key,s in sources.items() for n in s['entryIndex']}|{('current-git',n) for n in expectedGit}
 require(observedOrigins==expectedOrigins and observedGit==set(expectedGit),'incomplete reverse coverage')
 require(m['recipes'] and all(r['status']=='NOT_EXECUTED' and r['automaticAdoption'] is False for r in m['recipes']),'recipe execution')
 byOriginal={(v['originalPath'],v['sha256']) for v in m['variants']}
 r=m['recipes'][1];meta=r['exactMetadata'];require(len(meta['sourceOverlay'])==20 and len(meta['prepared12'])==12 and len(r['candidateInputs22'])==22,'recipe counts')
 for x in meta['sourceOverlay']+meta['prepared12']+r['candidateInputs22']:
  require((x['archivePath'],x['sha256']) in byOriginal,'missing recipe input')
 return True
def verify_extract(zip_path,rows,target):
 """Explicit caller only. Fresh isolated directory; never overwrite. No live restore. On failure partial fresh output is evidence only, not a successful restore; no automatic cleanup."""
 destinations(rows);expected={r['destination']:r for r in rows};target=Path(target)
 require(not target.exists() and not target.is_symlink(),'target exists')
 for p in [target.parent,*target.parent.parents]:require(not p.is_symlink(),'symlink parent')
 with zipfile.ZipFile(zip_path) as z:
  infos=z.infolist();require(len(infos)==len(rows)<=LIMITS['entries'],'entry count');require(set(z.namelist())==set(expected),'entry set')
  require(len(z.namelist())==len(set(z.namelist())),'duplicate zip entry');total=0
  for i in infos:
   pathkey(i.filename);mode=i.external_attr>>16
   require(stat.S_IFMT(mode) in (0,stat.S_IFREG),'nonregular entry')
   require(not i.extra,'extra metadata/link forbidden')
   require(i.file_size==expected[i.filename]['bytes'] and i.file_size<=LIMITS['fileBytes'],'size')
   require(i.file_size<=max(1,i.compress_size)*LIMITS['ratio'],'ratio');total+=i.file_size
  require(total<=LIMITS['totalBytes'],'total')
  target.mkdir()
  for i in infos:
   p=target/i.filename;p.parent.mkdir(parents=True,exist_ok=True)
   require(p.resolve().is_relative_to(target.resolve()),'containment')
   for q in [p.parent,*p.parent.parents]:require(not q.is_symlink(),'symlink parent')
   h=hashlib.sha256();n=0
   with z.open(i) as src,p.open('xb') as out:
    while chunk:=src.read(65536):
     n+=len(chunk);require(n<=expected[i.filename]['bytes'],'actual size exceeded');h.update(chunk);out.write(chunk)
   require(n==expected[i.filename]['bytes'] and h.hexdigest()==expected[i.filename]['sha256'],'payload hash')
 return True
