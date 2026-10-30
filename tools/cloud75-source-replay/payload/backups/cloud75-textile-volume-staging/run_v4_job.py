"""One explicit, bounded job. Does not authorize subsequent stages."""
import argparse,os,sys,json,time,subprocess,resource,hashlib,threading
from pathlib import Path
from execution_budget import budget,refuse_snapshot_overwrite
H=Path(__file__).resolve().parent;R=H.parents[1]
p=argparse.ArgumentParser();p.add_argument('mode',choices=['baseline-interfaces','baseline-cover','geometry','certificate','readback','owners','preview']);p.add_argument('--candidate',type=Path);p.add_argument('--released',action='store_true');p.add_argument('--phase',choices=['generate-zero','zero-interfaces','zero-cover','solve','corrected-interfaces','corrected-cover','export']);p.add_argument('--extended-cover',action='store_true');a=p.parse_args()
assert a.released,'Explicit parent resource release required'
runtime=json.loads((H/'runtime-provenance.json').read_text());binary=runtime['binaryPath']
assert runtime['archiveSHA256']=='78486c018b4443efe5e75ab54c290ed8c15abafd249b862c2c9ce2530a918eec'
assert runtime['binaryMatchesVerifiedArchiveMember']
assert hashlib.sha256(Path(binary).read_bytes()).hexdigest()==runtime['binarySHA256'],'Actual runtime binary changed'
assert subprocess.check_output([binary,'--version'],text=True,timeout=10).strip()==runtime['versionOutput'],'Runtime version/build changed'
if a.mode.startswith('baseline-'):
 script=H/'v3_metrics/baseline_blender.py';argv=['--phase',a.mode.split('-')[1]]
else:
 assert a.candidate is not None;candidate=a.candidate.resolve();assert candidate.parent==H
 script=H/{'geometry':'stage_volume75_v4.py','certificate':'certification3d/certify_v4.py','readback':'readback75_v4.py','owners':'owner75_v4.test.mjs','preview':'preview75_v4.py'}[a.mode]
 if a.mode=='geometry':
  assert a.phase is not None,'Explicit bounded geometry phase required'
  refuse_snapshot_overwrite(candidate,a.phase)
 argv=['--released','--out',str(candidate),'--phase',a.phase]if a.mode=='geometry'else['--candidate',str(candidate)]
env={**os.environ,'PYTHONDONTWRITEBYTECODE':'1','OMP_NUM_THREADS':'1','OPENBLAS_NUM_THREADS':'1'}
for k in ['config','cache','tmp']:(H/'runtime'/k).mkdir(parents=True,exist_ok=True)
env.update(BLENDER_USER_CONFIG=str(H/'runtime/config'),XDG_CACHE_HOME=str(H/'runtime/cache'),TMPDIR=str(H/'runtime/tmp'))
if a.mode=='owners':
 env['TEXTILE_CANDIDATE_DIR']=str(candidate);cmd=['node','--test',str(script)]
else:cmd=[binary,'-noaudio','--background','--factory-startup','--disable-autoexec','-t','1','--python-exit-code','17','--python',str(script),'--',*argv]
sha=lambda x:hashlib.sha256(x.read_bytes()).hexdigest()
protected={str(x):sha(x) for x in [R/'assets/src/v2/pastoral/textiles62/house-a-textiles62.blend',R/'web/public/assets/v2/house-textiles62/geometry.glb',R/'web/public/assets/v2/house-textiles62/manifest.json',R/'web/public/assets/v2/house_a_lived.glb']}
job=H/'v4-jobs'/(time.strftime('%Y%m%dT%H%M%S',time.gmtime())+'-'+a.mode+('-'+a.phase if a.phase else ''));job.mkdir(parents=True,exist_ok=False)
def available_memory():
 return int(next(line.split()[1]for line in Path('/proc/meminfo').read_text().splitlines()if line.startswith('MemAvailable:')))*1024
mem_before=available_memory();timeout,tier,reason=budget(a.mode,a.phase,a.extended_cover,mem_before)
record={'runtimeBinarySHA256':runtime['binarySHA256'],'runtimeVersionOutput':runtime['versionOutput'],'mode':a.mode,'phase':a.phase,'command':cmd,'scriptSHA256':sha(script),'helperSHA256':sha(H/'v3_metrics/upper_envelope.py'),'protectedInputs':protected,'timeoutSeconds':timeout,'executionTier':tier,'executionReason':reason,'memAvailableBytesBefore':mem_before,'launcherSHA256':sha(Path(__file__)),'budgetPolicySHA256':sha(H/'execution_budget.py'),'status':'RUNNING'}
(job/'execution.json').write_text(json.dumps(record,indent=2)+'\n');start=time.monotonic()
usage_before=resource.getrusage(resource.RUSAGE_CHILDREN)
with(job/'run.log').open('w')as f,(job/'phase-global-events.jsonl').open('w')as timeline:
 child=subprocess.Popen(cmd,cwd=R,env=env,stdout=subprocess.PIPE,stderr=subprocess.STDOUT,text=True)
 def copy_output():
  for line in child.stdout:
   f.write(line);f.flush()
   try:event=json.loads(line)
   except ValueError:continue
   timeline.write(json.dumps({'jobElapsedSeconds':time.monotonic()-start,'event':event})+'\n');timeline.flush()
 thread=threading.Thread(target=copy_output);thread.start()
 try:record.update(returncode=child.wait(timeout=timeout),timedOut=False)
 except subprocess.TimeoutExpired:
  child.kill();child.wait();record.update(returncode=None,timedOut=True)
 finally:thread.join()
usage_after=resource.getrusage(resource.RUSAGE_CHILDREN)
record.update(wallSeconds=time.monotonic()-start,childUserCPUSeconds=usage_after.ru_utime-usage_before.ru_utime,childSystemCPUSeconds=usage_after.ru_stime-usage_before.ru_stime,maxRSSKiB=usage_after.ru_maxrss,memAvailableBytesAfter=available_memory(),protectedUnchanged=all(sha(Path(k))==v for k,v in protected.items()))
record['status']='COMMAND_COMPLETED_NOT_WHOLE_ACCEPTANCE'if record['returncode']==0 and record['protectedUnchanged'] else'FAILED_OR_INCOMPLETE'
(job/'execution.json').write_text(json.dumps(record,indent=2)+'\n');print(json.dumps(record));print('JOB',job)
assert record['protectedUnchanged'],'Protected source changed'
raise SystemExit(124 if record['timedOut']else record['returncode'])
