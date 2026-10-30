"""STAGING ONLY. Requires explicit resource release; never invoked on import.
After authorization: blender -b -t 1 --python this_file -- --released
No GI is baked or relabeled. Output is unvalidated and must remain OFF.
"""
import argparse,hashlib,json,sys,traceback
from pathlib import Path
sys.dont_write_bytecode=True
HERE=Path(__file__).resolve().parent
ROOT=HERE.parents[1]
sys.path.insert(0,str(HERE))
from volume_math import profile,overlap_gaps
from cover_domain_contract import verify_exact_patch,domain_accounting
from volume_v4_contract import edge_field as selected_e4_field
from phase_checkpoint import digest as json_digest,save as save_checkpoint,load as load_checkpoint,apply_from_zero
NAMES=['pastoral_house_felt_mattress','pastoral_house_bed_quilt','pastoral_house_bed_foot']+['pastoral_house_chest_folded'+str(i)for i in range(4)]+['pastoral_house_chest_topcover','pastoral_house_bench_felt']
CHANGED=NAMES[3:8]
SOURCE=ROOT/'assets/src/v2/pastoral/textiles62/house-a-textiles62.blend'
sha=lambda p:hashlib.sha256(p.read_bytes()).hexdigest()

def main():
 import bpy
 runtime=json.loads((HERE/'runtime-provenance.json').read_text())
 assert sha(Path(bpy.app.binary_path))==runtime['binarySHA256'],'Actual running Blender changed'
 assert runtime['versionOutput'].splitlines()[0]=='Blender '+bpy.app.version_string
 assert bpy.app.build_hash.decode() in runtime['versionOutput'],'Runtime build hash mismatch'
 from mathutils import Vector
 import numpy as np
 parser=argparse.ArgumentParser();parser.add_argument('--released',action='store_true');parser.add_argument('--recompute-ao',action='store_true');parser.add_argument('--out',type=Path,required=True);parser.add_argument('--phase',choices=['generate-zero','zero-interfaces','zero-cover','solve','corrected-interfaces','corrected-cover','export'],required=True)
 args=parser.parse_args(sys.argv[sys.argv.index('--')+1:] if '--' in sys.argv else [])
 if not args.released:raise RuntimeError('Resource release required: do not run Blender until parent explicitly releases it')
 assert HERE==ROOT/'backups/cloud75-textile-volume-staging'
 OUT=args.out.resolve();assert OUT.parent==HERE, 'Direct staging output required'
 if args.phase=='generate-zero':assert not OUT.exists(),'Fresh output required';OUT.mkdir()
 else:assert OUT.is_dir(),'Generate zero first'
 assert not args.recompute_ao, 'AO is a separate released stage'
 files=[SOURCE,ROOT/'web/public/assets/v2/house-textiles62/geometry.glb',ROOT/'web/public/assets/v2/house-textiles62/manifest.json',ROOT/'web/public/assets/v2/house_a_lived.glb']
 protected={str(p.relative_to(ROOT)):sha(p)for p in files}
 report={'candidateVersion':4,'variant':'v4-E4-coupled-eight-leaf-plus-named-window-clearance','artisticBudgetChange':'Per-piece Z-range normalization removed explicitly; common world-XY C2 cumulative compression <=16mm, <=2mm per leaf; all physical guards retained','status':'PARTIAL phase running; no final acceptance','GI':'INVALIDATED — no matching GI exists','runtimeEnabled':False,'aoRecomputed':args.recompute_ao,'protectedInputs':protected,'rows':[],'pending':['full 3D non-adjacent self-intersection certification','GLB readback identity','runtime owner fixture','full 25-state GI rebake','same-condition real screenshots']}
 def save_report():
  report['activePhase']=args.phase
  temp=OUT/'audit.json.tmp';temp.write_text(json.dumps(report,indent=2)+'\n');temp.replace(OUT/'audit.json')
  temp=OUT/(args.phase+'-audit.json.tmp');temp.write_text(json.dumps(report,indent=2)+'\n');temp.replace(OUT/(args.phase+'-audit.json'))
 def array(items,key):return [list(getattr(v,key)) if hasattr(getattr(v,key),'__len__') else getattr(v,key)for v in items]
 def snapshot(o):
  m=o.data;m.calc_loop_triangles()
  attrs={}
  for a in m.attributes:
   vals=[]
   for v in a.data:
    fields={}
    for prop in v.bl_rna.properties:
     k=prop.identifier
     if k=='rna_type':continue
     value=getattr(v,k)
     if isinstance(value,(str,int,float,bool)):fields[k]=value
     elif hasattr(value,'__len__'):
      try:fields[k]=list(value)
      except TypeError:pass
    vals.append(fields)
   attrs[a.name]={'domain':a.domain,'type':a.data_type,'values':vals}
  return {'matrix':[list(r)for r in o.matrix_world], 'vertices':array(m.vertices,'co'),'edges':array(m.edges,'vertices'),'polygons':array(m.polygons,'vertices'),'loopTriangles':[list(t.vertices)for t in m.loop_triangles],'smooth':[p.use_smooth for p in m.polygons],'materialIndex':[p.material_index for p in m.polygons],'loopVertex':[v.vertex_index for v in m.loops],'uv':{u.name:array(u.data,'uv')for u in m.uv_layers},'attributes':attrs,'materials':[x.name if x else None for x in m.materials]}
 def pts(o):return [tuple(o.matrix_world@v.co)for v in o.data.vertices]
 def bounds(p):return [[min(q[k]for q in p)for k in range(3)],[max(q[k]for q in p)for k in range(3)]]
 def triangles(o,p=None,lo=None,hi=None):
  p=p or pts(o);o.data.calc_loop_triangles()
  return [[p[i]for i in t.vertices]for t in o.data.loop_triangles if lo is None or all(lo<=i<hi for i in t.vertices)]
 def folded_layout(o):
  m=o.data;assert len(m.vertices)==2940,(o.name,'vertex layout');p=pts(o)
  boundary=list(range(29))+[j*29+28 for j in range(1,19)]+[18*29+i for i in range(27,-1,-1)]+[j*29 for j in range(17,0,-1)]
  expected=[]
  for start in (0,1470):
   for j in range(18):
    for i in range(28):
     a=start+j*29+i;q=(a,a+1,a+30,a+29);expected.extend([q,tuple(k+551 for k in reversed(q))])
   for k,a in enumerate(boundary):
    b=boundary[(k+1)%len(boundary)];expected.append((start+a,start+551+a,start+551+b,start+b))
   for j in range(len(boundary)):
    for k in range(4):expected.append((start+1102+j*4+k,start+1102+((j+1)%len(boundary))*4+k,start+1102+((j+1)%len(boundary))*4+(k+1)%4,start+1102+j*4+(k+1)%4))
   for i in range(551):
    assert max(abs(p[start+i][k]-p[start+551+i][k])for k in (0,1))<2e-6,(o.name,'paired XY',i)
    assert p[start+i][2]>p[start+551+i][2],(o.name,'reversed shell',i)
   for j,a in enumerate(boundary):
    mid=(Vector(p[start+a])+Vector(p[start+551+a]))*.5
    ring=[Vector(p[start+1102+j*4+k])for k in range(4)]
    assert (sum(ring,Vector())/4-mid).length<2e-6,(o.name,'welt seam owner',j)
    assert all((q-mid).length>1e-6 for q in ring),(o.name,'collapsed welt',j)
  assert [tuple(f.vertices)for f in m.polygons]==expected,(o.name,'source shell/welt topology order')
 def diagonal_map(o,start,nx,ny):
  o.data.calc_loop_triangles();cells={}
  for t in o.data.loop_triangles:
   ids=[i-start for i in t.vertices]
   if not all(0<=i<(nx+1)*(ny+1)for i in ids):continue
   ii=min(i%(nx+1)for i in ids);jj=min(i//(nx+1)for i in ids)
   if ii>=nx or jj>=ny:raise AssertionError((o.name,'invalid lattice triangle',ids))
   a=jj*(nx+1)+ii;corners={a,a+1,a+nx+1,a+nx+2}
   assert set(ids)<=corners,(o.name,'non-cell lattice triangle',ids)
   diag=True if a in ids and a+nx+2 in ids else False if a+1 in ids and a+nx+1 in ids else None
   assert diag is not None,(o.name,'missing cell diagonal',ids)
   cells.setdefault((ii,jj),[]).append(diag)
  assert len(cells)==nx*ny and all(len(v)==2 and v[0]==v[1]for v in cells.values()),(o.name,'incomplete or inconsistent diagonals')
  return {k:v[0]for k,v in cells.items()}
 def cover_diagonal_contract():
  lower=diagonal_map(bpy.data.objects[NAMES[6]],1470,28,18)
  cover=bpy.data.objects[NAMES[7]]
  for start in (0,651):
   d=diagonal_map(cover,start,30,20)
   assert all(d[(i+1,j+1)]==v for (i,j),v in lower.items()),('cover/folded diagonal mismatch',start)
 def put(o,p):
  inv=o.matrix_world.inverted()
  for v,q in zip(o.data.vertices,p):v.co=inv@Vector(q)
  o.data.update();o.data.calc_loop_triangles()
 def invariant(o):
  now=snapshot(o);old=before[o.name]
  for key in ('matrix','edges','polygons','loopTriangles','smooth','materialIndex','loopVertex','uv','materials'):assert now[key]==old[key],(o.name,key)
  assert len(now['vertices'])==len(old['vertices'])
  # Position and derived normals may change; all other source attributes stay.
  for key,value in old['attributes'].items():
   if key=='position' or (args.recompute_ao and key=='Color'):continue
   assert now['attributes'][key]==value,(o.name,'attribute',key)
  assert all(t.area>1e-12 for t in o.data.loop_triangles),o.name
 def record(o,old,shift,cover_drape=False):
  p=pts(o);bb=bounds(p);base=bounds(old)
  xy=max(abs(p[i][k]-old[i][k])for i in range(len(p))for k in (0,1))
  if o.name==NAMES[7]:
   assert 'coverXYExpected' in report, 'Named cover footprint contract absent'
   verify_exact_patch(old,p,report['coverXYExpected'],report['coverWindowClearance']['changedVertexIDs'])
  else:assert xy<2e-6
  assert abs(shift)<=.010+1e-10,(o.name,'settlement exceeds 10mm',shift)
  assert abs(shift)<=.00025+1e-12,('v3 joint rigid settlement exceeds0.25mm',o.name,shift)
  delta=[p[i][2]-old[i][2]for i in range(len(p))];vector_delta=[Vector(p[i])-Vector(old[i])for i in range(len(p))];jumps=[(vector_delta[a]-vector_delta[b]).length for a,b in (e.vertices for e in o.data.edges)]
  assert min(d-shift for d in delta)>=-.016-2e-6 and max(d-shift for d in delta)<=2e-6,(o.name,'shape-only compression budget',min(delta),max(delta),shift)
  assert max(jumps)<=.020,(o.name,'absolute adjacent displacement exceeds 20mm',max(jumps))
  grid_slope=[];edge_classes={}
  def edge_class(a,b):
   if '_folded' in o.name:
    for start in (0,1470):
     aa=a-start;bb=b-start
     if 0<=aa<1102 and 0<=bb<1102:
      return 'through-thickness' if (aa<551)!=(bb<551) else 'surface-grid'
    return 'welt'
   if a<1302 and b<1302:return 'through-thickness' if (a<651)!=(b<651) else 'surface-grid'
   return 'welt'
  for e in o.data.edges:
   a,b=e.vertices;kind=edge_class(a,b);jump=(vector_delta[a]-vector_delta[b]).length;d=(Vector(old[a])-Vector(old[b])).length
   row=edge_classes.setdefault(kind,{'maxJump':-1,'maxProjectedSlope':0})
   if jump>row['maxJump']:row.update(maxJump=jump,edge=[a,b],before=[old[a],old[b]],after=[p[a],p[b]])
   if kind!='through-thickness':
    assert jump<=.008,(o.name,kind,'along-surface displacement exceeds 8mm',[a,b],jump)
    if d>1e-6:
     slope=jump/d;grid_slope.append(slope)
     if slope>row['maxProjectedSlope']:row.update(maxProjectedSlope=slope,slopeEdge=[a,b])
  assert not grid_slope or max(grid_slope)<=.6,(o.name,'gradient cap',edge_classes)
  invariant(o)
  report['rows']=[row for row in report['rows']if row['name']!=o.name]
  report['rawVertexReadback']=report.get('rawVertexReadback',{});report['rawVertexReadback'][o.name]={'before':old,'after':p}
  report['rows'].append({'name':o.name,'vertices':len(p),'triangles':len(o.data.loop_triangles),'rigidSettlementZ':shift,'beforeBounds':base,'afterBounds':bb,'xyMaxDelta':xy,'zDisplacementRange':[min(delta),max(delta)],'gradientMetric':'complete XYZ displacement difference / original full 3D edge length','maxAdjacentDisplacementJump':max(jumps),'maxAlongSurfaceDisplacementSlope':max(grid_slope,default=0),'edgeClasses':edge_classes})
 try:
  bpy.ops.wm.open_mainfile(filepath=str(SOURCE));bpy.context.preferences.filepaths.save_version=0;bpy.context.view_layer.update()
  sys.path.insert(0,str(ROOT/'backups/cloud75-textile-gi-staging'))
  from material_fingerprint import fingerprint_scene_materials
  report['materialFingerprintHelperSHA256']=sha(ROOT/'backups/cloud75-textile-gi-staging/material_fingerprint.py')
  report['materialFingerprintBefore']=fingerprint_scene_materials(bpy.context.scene,ROOT)
  def material_guard(label):
   value=fingerprint_scene_materials(bpy.context.scene,ROOT)
   report.setdefault('materialFingerprintChecks',{})[label]=value['sha256']
   assert value==report['materialFingerprintBefore'],('Material/image/node content changed',label)
   assert sha(ROOT/'backups/cloud75-textile-gi-staging/material_fingerprint.py')==report['materialFingerprintHelperSHA256'],'Material helper changed during generation'

  assert len(bpy.context.scene.objects)==269
  assert sum(o.type=='MESH'for o in bpy.context.scene.objects)==267
  assert all(not any(m.show_viewport or m.show_render for m in o.modifiers) and (o.type!='MESH' or o.data.shape_keys is None)for o in bpy.context.scene.objects), 'Raw geometry not authoritative with enabled modifiers/shapes'
  report['sceneObjectTypes']={o.name:o.type for o in bpy.context.scene.objects}
  before={o.name:snapshot(o)for o in bpy.context.scene.objects if o.type=='MESH'}
  report['frozenMeshFingerprints']={name:hashlib.sha256(json.dumps(snap,sort_keys=True).encode()).hexdigest()for name,snap in before.items()if name not in CHANGED}
  for name in NAMES[3:7]:folded_layout(bpy.data.objects[name])
  cover_diagonal_contract()
  original={n:pts(bpy.data.objects[n])for n in CHANGED}
  allfold=[q for name in NAMES[3:7]for q in original[name]]
  xylo=[min(q[k]for q in allfold)for k in (0,1)];xyhi=[max(q[k]for q in allfold)for k in (0,1)]
  minth=min(original[name][start+i][2]-original[name][start+551+i][2]for name in NAMES[3:7]for start in (0,1470)for i in range(551))
  amplitude=min(.002,.10*minth);assert 0<amplitude<=.002
  def edge_field(x,y):
   return selected_e4_field(x,y,xylo,xyhi)
  report['sharedField']={'worldXYBounds':[xylo,xyhi],'amplitudePerLeaf':amplitude,'minimumSourceLeafThickness':minth,'maximumCumulativeCompression':8*amplitude,'definition':'E4=1-(max(0,1-s^2)^3+max(0,1-t^2)^3)/2; common world XY C2 field','rigidSettlements':[0,0,0,0]}
  boundary=list(range(29))+[j*29+28 for j in range(1,19)]+[18*29+i for i in range(27,-1,-1)]+[j*29 for j in range(17,0,-1)]
  support=bpy.data.objects['pastoral_house_chest_lid']
  for piece,name in enumerate(NAMES[3:7]):
   o=bpy.data.objects[name];old=original[name];p=[list(q)for q in old]
   for local,start in enumerate((0,1470)):
    leaf=2*piece+local
    for i in range(551):
     e=edge_field(*old[start+i][:2]);assert 0<=e<=1
     p[start+i][2]-=(leaf+1)*amplitude*e
     p[start+551+i][2]-=leaf*amplitude*e
     th=p[start+i][2]-p[start+551+i][2];source_th=old[start+i][2]-old[start+551+i][2]
     assert th>=source_th*.90-2e-6,(name,'leaf thickness ratio',local,i,th,source_th)
    for j,i in enumerate(boundary):
     delta=(p[start+i][2]+p[start+551+i][2]-old[start+i][2]-old[start+551+i][2])/2
     for k in range(4):p[start+1102+j*4+k][2]+=delta
   put(o,p)
   leafgap=overlap_gaps(triangles(o,lo=2021,hi=2572),triangles(o,lo=0,hi=551))
   assert leafgap['minGap']>=.0005,(name,'internal leaf gap',leafgap)
   contact_after=overlap_gaps(triangles(o,lo=551,hi=1102),triangles(support))
   # Authoritative zero-settlement clearance/max/delta gates run on the true envelope below.
   record(o,old,0.);report['rows'][-1].update(internalLeafGap=leafgap,supportGap=contact_after)
   support=o
  o=bpy.data.objects[NAMES[7]];old=original[o.name];p=[list(q)for q in old];lastold=original[NAMES[6]];last=pts(support)
  assert len(p)==1902,('Unexpected existing cover layout',len(p))
  n=31*21;boundary=list(range(31))+[j*31+30 for j in range(1,21)]+[20*31+i for i in range(29,-1,-1)]+[j*31 for j in range(19,0,-1)]
  for j in range(21):
   for i in range(31):
    a=j*31+i;b=1470+max(0,min(18,j-1))*29+max(0,min(28,i-1));delta=last[b][2]-lastold[b][2] if 1<=i<=29 and 1<=j<=19 else -8*amplitude*edge_field(*old[a][:2])
    for q in (a,a+n):p[q][2]+=delta
  for j,a in enumerate(boundary):
   delta=p[a][2]-old[a][2]
   for k in range(6):p[2*n+j*6+k][2]+=delta
  sys.path.insert(0,str(ROOT/'backups/cloud75-cover-window-clearance'))
  from clearance_patch import repair,WOOD
  p,patch=repair(p,pts(bpy.data.objects[WOOD]))
  report['coverWindowClearance']=patch
  report['coverXYExpected']=[q[:2] for q in p]
  report['clearanceHelperSHA256']=sha(ROOT/'backups/cloud75-cover-window-clearance/clearance_patch.py')
  assert report['clearanceHelperSHA256']=='5776af8b8e3c8203169831716ffceb5e0422228a2dae32ca34ef811aac6ebfd5'
  put(o,p)
  cover_diagonal_contract()
  # Explicit v2 artistic-envelope budget, not a relaxation of physical guards.
  # No independent cover rigid settlement. Inherited folded3 support translation
  # is reported separately and cannot offset a failing shape-only displacement.
  inherited=report['rows'][-1]['rigidSettlementZ']
  total_delta=[p[i][2]-old[i][2]for i in range(len(p))]
  shape_delta=[v-inherited for v in total_delta]
  assert min(total_delta)>=-.020 and max(total_delta)<=.010,('cover total envelope',min(total_delta),max(total_delta))
  assert min(shape_delta)>=-.020 and max(shape_delta)<=.010,('cover shape-only envelope',min(shape_delta),max(shape_delta))
  record(o,old,0.,cover_drape=True)
  report['rows'][-1].update(artisticContract='v3 cover follows actual internal upper lattice; outer extends common -8aE; shape envelope [-20,+10]mm',ownRigidSettlementZ=0.,inheritedSupportTranslationZ=inherited,totalZDisplacementRange=[min(total_delta),max(total_delta)],shapeOnlyZDisplacementRange=[min(shape_delta),max(shape_delta)],nonRigidBudgetMetWithoutTranslationCancellation=True)
  covergap=overlap_gaps(triangles(o,lo=n,hi=2*n),triangles(support,lo=1470,hi=2021))
  assert covergap['minGap']>=.0007-2e-6,covergap
  report['rows'][-1]['upperLeafSupportGap']=covergap
  support_names=[name for name in before if name.startswith('pastoral_house_chest_') and name!=o.name]
  all_support=[tri for name in support_names for tri in triangles(bpy.data.objects[name])]
  sys.path.insert(0,str(HERE/'v3_metrics'))
  from upper_envelope import prepare_envelope,gap_metrics,pointwise_delta,merge_envelopes
  baseline_report=json.loads((HERE/'v3_metrics/baseline.json').read_text())
  assert baseline_report['status']=='baseline metrics measured'
  assert baseline_report['sourceSHA256']==sha(SOURCE)
  assert baseline_report['helperSHA256']==sha(HERE/'v3_metrics/upper_envelope.py')
  for filename,digest in baseline_report['aggregateFilesSHA256'].items():assert sha(HERE/'v3_metrics'/filename)==digest,('baseline aggregate hash mismatch',filename)
  baseline_inputs=json.loads((HERE/'v3_metrics/baseline-inputs.json').read_text());baseline_envelopes=json.loads((HERE/'v3_metrics/baseline-envelopes.json').read_text())
  report['gapMetrics']={};report['baselineMetricSourceSHA256']=baseline_report['sourceSHA256']
  report['helperPhases']=[];candidate_envelopes={}
  def phase_event(key,event):
   report['helperPhases'].append({'metric':key,**event});print(json.dumps({'metric':key,**event}),flush=True)
  dependencies=[Path(__file__),HERE/'phase_checkpoint.py',HERE/'volume_v4_contract.py',HERE/'cover_domain_contract.py',HERE/'exact_patch_domain.py',HERE/'volume_math.py',HERE/'v3_metrics/upper_envelope.py',HERE/'v3_metrics/joint_settlement.py',ROOT/'backups/cloud75-cover-window-clearance/clearance_patch.py',ROOT/'backups/cloud75-textile-gi-staging/material_fingerprint.py']
  common_identity={'protectedInputs':protected,'dependencies':{str(p.relative_to(ROOT)):sha(p)for p in dependencies},'baselineSHA256':sha(HERE/'v3_metrics/baseline.json'),'runtimeProvenanceSHA256':sha(HERE/'runtime-provenance.json'),'runtimeBinarySHA256':runtime['binarySHA256'],'runtimeVersion':bpy.app.version_string,'runtimeBuildHash':bpy.app.build_hash.decode()}
  state_label='zero';state_identity=None
  def state_digest():return json_digest({name:{'worldVertices':pts(bpy.data.objects[name]),'triangles':[list(t.vertices)for t in bpy.data.objects[name].data.loop_triangles]}for name in CHANGED})
  def establish_state(label,create=False):
   nonlocal state_label,state_identity
   state_label=label;blend=OUT/(label+'-settlement-unvalidated.blend');path=OUT/(label+'-state.json')
   identity={**common_identity,'state':label,'worldVerticesSHA256':state_digest(),'materialsSHA256':report['materialFingerprintBefore']['sha256']}
   if create:
    material_guard(label+'-before-save')
    for name,snap in before.items():
     if name not in CHANGED:assert snapshot(bpy.data.objects[name])==snap,('frozen object changed',name)
    bpy.ops.wm.save_as_mainfile(filepath=str(blend))
    save_checkpoint(path,identity,{'blendSHA256':sha(blend),'rows':report['rows'],'sharedField':report['sharedField']})
   payload=load_checkpoint(path,identity);assert sha(blend)==payload['blendSHA256'],'Saved state blend changed'
   state_identity={**identity,'blendSHA256':payload['blendSHA256']};report[label+'StateIdentity']=state_identity
  def metric_identity(key,under,support):return {**state_identity,'metric':key,'undersideSHA256':json_digest(under),'supportSHA256':json_digest(support)}
  def envelope_for(key,support,compute=True,children=None,offsets=None):
   identity={**state_identity,'metric':key,'supportSHA256':json_digest(support)};path=OUT/'checkpoints'/state_label/(key+'-envelope.json')
   if path.exists():return load_checkpoint(path,identity)
   assert compute,('Missing envelope phase',state_label,key)
   env=prepare_envelope(support,phase_callback=lambda event:phase_event(key,event))if children is None else merge_envelopes(children,source_id_offsets=offsets,phase_callback=lambda event:phase_event(key,event))
   save_checkpoint(path,identity,env);return env
  def gap_gate(key,under,support_triangles,internal=False,enforce_support_min=True,envelope=None,compute=True):
   identity=metric_identity(key,under,support_triangles);path=OUT/'checkpoints'/state_label/(key+'-metric.json')
   env=envelope if envelope is not None else envelope_for(key,support_triangles,compute);candidate_envelopes[key]=env
   if path.exists():
    row=load_checkpoint(path,identity);report['gapMetrics'][key]=row;return
   assert compute,('Missing metric phase',state_label,key)
   print(json.dumps({'metric':key,'phase':'candidate-gap'}),flush=True)
   value=gap_metrics(under,env)
   delta=pointwise_delta(baseline_inputs[key]['underside'],baseline_envelopes[key],under,env,xy_tolerance=.0075+2e-6 if key=='cover-support' else 2e-6)
   oldvalue=baseline_report['rows'][key]
   row={'baseline':oldvalue,'candidate':value,'pointwiseDelta':delta,'envelopeStats':env['stats']};report['gapMetrics'][key]=row
   print(json.dumps({'metric':key,'candidate':value,'delta':delta}),flush=True)
   assert value['minGap'] is not None and delta['maxDelta'] is not None,('no supported overlap',key)
   required_min=.0005 if internal else .0007-2e-6
   if internal or enforce_support_min:assert value['minGap']>=required_min,(key,'minimum gap fails',value['minGap'],required_min,value['worstMin'],delta['worstMin'])
   assert value['maxGap']<=oldvalue['maxGap']+.002+2e-6,(key,'max gap exceeds baseline+2mm',row)
   assert delta['maxDelta']<=.002+2e-6,(key,'pointwise gap increase exceeds2mm',delta)
   if key=='cover-support':
    row['authorizedDomainChange']={'kind':'exact named rear-row clearance patch','baselineArea':delta['baselineTotalProjectedArea'],'candidateArea':delta['candidateTotalProjectedArea'],'commonArea':delta['commonDomainProjectedArea'],'removedArea':delta['baselineTotalProjectedArea']-delta['commonDomainProjectedArea'],'newArea':delta['candidateTotalProjectedArea']-delta['commonDomainProjectedArea'],'baselineOnlyCoveredArea':delta['baselineOnlyCoveredArea'],'candidateOnlyCoveredArea':delta['candidateOnlyCoveredArea'],'neitherCoveredArea':delta['neitherCoveredArea']}
    cover_obj=bpy.data.objects[NAMES[7]];cover_obj.data.calc_loop_triangles();under_faces=[list(t.vertices)for t in cover_obj.data.loop_triangles if all(n<=i<2*n for i in t.vertices)]
    changed_ids=set(report['coverWindowClearance']['changedVertexIDs']);changed_triangles=[i for i,t in enumerate(under_faces)if any(v in changed_ids for v in t)]
    row['domainLocalization']=domain_accounting(baseline_inputs[key]['underside'],under,baseline_envelopes[key],env,changed_triangles,old_support_triangles=baseline_inputs[key]['support'],new_support_triangles=support_triangles)
    save_report();assert row['domainLocalization']['passed'],('Unreviewed cover domain/support change',row['domainLocalization'])
    assert value['uncoveredProjectedArea']<=oldvalue['uncoveredProjectedArea']+1e-8,(key,'new unsupported area',row)
   else:assert abs(value['uncoveredProjectedArea']-oldvalue['uncoveredProjectedArea'])<=1e-8,(key,'support coverage changed',row)
   save_checkpoint(path,identity,row);save_report()
  chest_names=['pastoral_house_chest_body','pastoral_house_chest_lid','pastoral_house_chest_strap','pastoral_house_chest_strap.001']
  def all_gap_gates(enforce_min,phase):
   report['gapMetrics']={};candidate_envelopes.clear()
   for k,name in enumerate(NAMES[3:7]):
    obj=bpy.data.objects[name]
    gap_gate('internal-'+str(k),triangles(obj,lo=2021,hi=2572),triangles(obj,lo=0,hi=551),internal=True,compute=phase=='interfaces')
    lower=[t for nn in chest_names for t in triangles(bpy.data.objects[nn])]if k==0 else triangles(bpy.data.objects[NAMES[3+k-1]])
    gap_gate('support-'+str(k),triangles(obj,lo=551,hi=1102),lower,enforce_support_min=enforce_min,compute=phase=='interfaces')
   if phase=='interfaces':return
   cover_support=[t for nn in support_names for t in triangles(bpy.data.objects[nn])]
   assert support_names==chest_names+NAMES[3:7],('cover support ordering differs',support_names)
   top_env=envelope_for('top-fold-full',triangles(bpy.data.objects[NAMES[6]]),compute=phase=='cover')
   children=[candidate_envelopes['support-'+str(k)]for k in range(4)]+[top_env]
   offsets=[];offset=0
   for child in children:offsets.append(offset);offset+=child['stats']['inputTriangles']
   assert offset==len(cover_support)
   merged=envelope_for('cover-support',cover_support,compute=phase=='cover',children=children,offsets=offsets)
   gap_gate('cover-support',triangles(bpy.data.objects[NAMES[7]],lo=n,hi=2*n),cover_support,enforce_support_min=enforce_min,envelope=merged,compute=phase=='cover')
  establish_state('zero',create=args.phase=='generate-zero')
  report['zeroSettlementUnvalidatedBlendSHA256']=state_identity['blendSHA256']
  save_report()
  if args.phase=='generate-zero':
   report['status']='PARTIAL zero geometry persisted; metrics pending';return
  if args.phase in ('zero-interfaces','zero-cover'):
   all_gap_gates(False,args.phase.split('-')[1]);report['zeroSettlementGapMetrics']=report['gapMetrics'];report['status']='PARTIAL '+args.phase+' measured; correction/export pending';return
  all_gap_gates(False,'load')
  report['zeroSettlementGapMetrics']=json.loads(json.dumps(report['gapMetrics']))
  report['zeroSettlementRows']=json.loads(json.dumps(report['rows']))
  deficiencies=[{'interface':key,'minGap':row['candidate']['minGap'],'shortfallTo0_7mm':.0007-row['candidate']['minGap'],'worstMin':row['candidate']['worstMin']}for key,row in report['gapMetrics'].items()if not key.startswith('internal-')and row['candidate']['minGap']<.0007-2e-6]
  report['zeroSettlementSupportDeficiencies']=deficiencies
  if deficiencies:
   from joint_settlement import solve_joint
   intervals=[]
   for k in range(4):
    row=report['gapMetrics']['support-'+str(k)];value=row['candidate'];oldvalue=row['baseline'];delta=row['pointwiseDelta']
    lo=.0007-value['minGap'] if value['minGap']<.0007-2e-6 else min(0.,.0007-value['minGap'])
    hi=min(.002-delta['maxDelta'],oldvalue['maxGap']+.002-value['maxGap'])
    intervals.append((lo,hi))
   solution=solve_joint(intervals,cap=.00025);report['jointSettlement']=solution
   print(json.dumps({'jointSettlement':solution,'zeroSettlementDeficiencies':deficiencies}),flush=True)
   for name,shift in zip(NAMES[3:7],solution['shifts']):
    obj=bpy.data.objects[name];q=apply_from_zero(pts(obj),shift)
    put(obj,q);record(obj,original[name],shift)
   inherited=solution['shifts'][-1];obj=bpy.data.objects[NAMES[7]];q=apply_from_zero(pts(obj),inherited)
   put(obj,q);record(obj,original[NAMES[7]],inherited,cover_drape=True)
   report['rows'][-1].update(ownRigidSettlementZ=0.,inheritedSupportTranslationZ=inherited,artisticContract='v3 cover rigidly inherits top-piece shift; shape-only total compression<=16mm')
   report['sharedField']['rigidSettlements']=solution['shifts']
   cover_diagonal_contract()

  else:report['jointSettlement']={'shifts':[0.,0.,0.,0.],'needed':False,'reason':'zero settlement meets fixed support target within2um tolerance'}
  if args.phase=='solve':
   assert not (OUT/'corrected-state.json').exists(),'Correction already persisted'
   establish_state('corrected',create=True)
   save_checkpoint(OUT/'joint-solution.json',common_identity,report['jointSettlement'])
   report['status']='PARTIAL corrected geometry persisted; corrected metrics pending';return
  assert json_digest(load_checkpoint(OUT/'joint-solution.json',common_identity))==json_digest(report['jointSettlement']),'Joint solution changed'
  establish_state('corrected')
  if args.phase in ('corrected-interfaces','corrected-cover'):
   all_gap_gates(True,args.phase.split('-')[1]);report['correctedSettlementGapMetrics']=report['gapMetrics'];report['status']='PARTIAL '+args.phase+' measured; export pending';return
  assert args.phase=='export'
  all_gap_gates(True,'load')
  report['correctedSettlementGapMetrics']=json.loads(json.dumps(report['gapMetrics']))
  report['rows'][-1].update(allChestProjectedEnvelope=report['gapMetrics']['cover-support']['candidate'],allChestSupportNames=support_names,projectedEnvelopeLimit='exact highest projected chest/leaf/welt faces; triangle-surface and volumetric containment certification remain separate')
  if args.recompute_ao:
   sys.path.insert(0,str(ROOT/'tools/blender'));from v2_interior_surfaces import contact_ao
   contact_ao([bpy.data.objects[n]for n in CHANGED])
  report['AO']='recomputed for five changed nodes' if args.recompute_ao else 'STALE: retained to isolate shape; not lighting validation'
  assert {o.name:o.type for o in bpy.context.scene.objects}==report['sceneObjectTypes']
  for name,snap in before.items():
   if name not in CHANGED:assert snapshot(bpy.data.objects[name])==snap,('frozen object changed',name)
  for name in CHANGED:invariant(bpy.data.objects[name])
  material_guard('final-before-save')
  bpy.ops.wm.save_as_mainfile(filepath=str(OUT/'textile-volume75.blend'))
  bpy.ops.object.select_all(action='DESELECT')
  for name in NAMES:bpy.data.objects[name].select_set(True)
  bpy.ops.export_scene.gltf(filepath=str(OUT/'geometry.glb'),export_format='GLB',use_selection=True,export_materials='NONE',export_yup=True,export_texcoords=True,export_normals=True,export_vertex_color='ACTIVE',export_active_vertex_color_when_no_material=True)
  manifest=json.loads((ROOT/'web/public/assets/v2/house-textiles62/manifest.json').read_text());manifest['geometrySHA256']=sha(OUT/'geometry.glb')
  (OUT/'manifest.json').write_text(json.dumps(manifest,separators=(',',':')))
  material_guard('after-export')
  report['outputSHA256']={p.name:sha(p)for p in (OUT/'geometry.glb',OUT/'manifest.json',OUT/'textile-volume75.blend')}
  report['status']='PARTIAL geometry checks only; full 3D certification and runtime validation pending'
 except Exception as exc:
  report['status']='REJECTED';report['error']=repr(exc);report['traceback']=traceback.format_exc();raise
 finally:
  report['protectedInputsUnchanged']=all(sha(ROOT/p)==h for p,h in protected.items());save_report()
  assert report['protectedInputsUnchanged'],'Protected input modified'
if __name__=='__main__':main()
