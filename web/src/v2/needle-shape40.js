import {bakeNeedleShape39,needleShapeLayout39} from './needle-shape-precompute39.js';

export function needleShapeShader40(source){
 if(source.includes('// NEEDLE_SHAPE40'))return source;
 const begin=source.indexOf(' int needle=gl_VertexID/3,corner=gl_VertexID%3;vec2 al;');
 const end=source.indexOf('p=aNeedleFrame0.xyz+',begin);
 if(begin<0||end<0)throw Error('Needle shape candidate requires the original station construction');
 let original=source.slice(begin,end),branches=original.includes('int station=gl_InstanceID%288;');
 original=original.replace(' int needle=gl_VertexID/3,corner=gl_VertexID%3;vec2 al;','vec2 al;').replace('int station=gl_InstanceID%288;','').replace('vec3 delta=','delta=').replace('vec3 side=','side=');
 return `// NEEDLE_SHAPE40\nuniform sampler2D uNeedleShapeDelta40,uNeedleShapeSide40;\nuniform float uNeedleShapeActive40;\nuniform int uNeedleShapeWidth40;\nattribute float aTreeRootNeedleStart;\n`+source.slice(0,begin)+`
 int needle=gl_VertexID/3,corner=gl_VertexID%3;${branches?'int station=gl_InstanceID%288;':''}
 vec3 delta,side;
 if(uNeedleShapeActive40>.5){
  int index=(gl_InstanceID+int(aTreeRootNeedleStart+.5)*288)*5+needle;
  ivec2 pixel=ivec2(index%uNeedleShapeWidth40,index/uNeedleShapeWidth40);
  vec4 d=texelFetch(uNeedleShapeDelta40,pixel,0),s=texelFetch(uNeedleShapeSide40,pixel,0);
  delta=d.xyz;side=vec3(d.w,s.xy);
 }else{${original}}
 `+source.slice(end);
}

// opt-in world-local owner. Tables are per source form/packet, never per tree.
// Preparation is explicit and outside render callbacks; unprepared packets keep
// the exact original equations. No original geometry or wind input is replaced.
export class NeedleShape40{
 constructor({enabled=false,bake=bakeNeedleShape39}={}){
  this.installed=enabled;this.enabled=enabled;this.bake=bake;this.records=new Map();this.renderer=null;this.closed=false;
  this.stats={installed:enabled,enabled,forms:0,prepared:0,pending:0,attachmentBytes:0,bakes:0,submissionMs:0,gpuMs:null,error:null};
 }
 register(form){
  if(!this.installed)return null;if(this.records.has(form))return this.records.get(form);
  const uniforms={uNeedleShapeDelta40:{value:null},uNeedleShapeSide40:{value:null},uNeedleShapeActive40:{value:0},uNeedleShapeWidth40:{value:1}};
  const record={form,uniforms,result:null,error:null,bytes:needleShapeLayout39(form.stationGeometry.userData.stationCount).attachmentBytes};this.records.set(form,record);
  for(const material of [form.material,form.depth]){
   const previous=material.onBeforeCompile,key=material.customProgramCacheKey();
   material.onBeforeCompile=function(shader,renderer){previous.call(this,shader,renderer);shader.vertexShader=needleShapeShader40(shader.vertexShader);Object.assign(shader.uniforms,uniforms);};
   material.customProgramCacheKey=()=>key+'-needle-local-shape40';material.needsUpdate=true;
  }
  this.refresh();return record;
 }
 setEnabled(enabled){if(enabled&&!this.installed)throw Error('Reload with needleShape40=1 before enabling the review candidate');this.enabled=!!enabled;for(const r of this.records.values())r.uniforms.uNeedleShapeActive40.value=this.enabled&&r.result?1:0;this.refresh();return this.stats;}
 prepare(renderer,{budgetMs=2,maxForms=1}={}){
  if(!this.enabled||this.closed)return this.stats;
  if(this.renderer&&this.renderer!==renderer)throw Error('Needle shape tables cannot cross WebGL contexts');
  if(!this.renderer){this.renderer=renderer;this.onRestore=()=>this.invalidate();renderer.domElement?.addEventListener('webglcontextrestored',this.onRestore);}
  const start=performance.now();let count=0;
  for(const r of this.records.values()){
   if(r.result||r.error)continue;
   try{r.result=this.bake(renderer,r.form);r.uniforms.uNeedleShapeDelta40.value=r.result.target.textures[0];r.uniforms.uNeedleShapeSide40.value=r.result.target.textures[1];r.uniforms.uNeedleShapeWidth40.value=r.result.layout.width;r.uniforms.uNeedleShapeActive40.value=1;this.stats.bakes++;this.stats.submissionMs+=r.result.stats.submissionMs;}
   catch(error){r.error=String(error.message||error);this.stats.error=r.error;}
   if(++count>=maxForms||performance.now()-start>=budgetMs)break;
  }
  this.refresh();return this.stats;
 }
 invalidate(){for(const r of this.records.values()){r.uniforms.uNeedleShapeActive40.value=0;r.uniforms.uNeedleShapeDelta40.value=r.uniforms.uNeedleShapeSide40.value=null;r.result?.dispose();r.result=null;r.error=null;}this.stats.error=null;this.refresh();}
 unregister(form){const r=this.records.get(form);if(!r)return;r.uniforms.uNeedleShapeActive40.value=0;r.result?.dispose();this.records.delete(form);this.refresh();}
 refresh(){const records=[...this.records.values()];Object.assign(this.stats,{enabled:this.enabled,forms:records.length,prepared:records.filter(r=>r.result).length,pending:this.enabled?records.filter(r=>!r.result&&!r.error).length:0,attachmentBytes:records.reduce((n,r)=>n+(r.result?.layout.attachmentBytes||0),0)});}
 dispose(){if(this.closed)return;this.closed=true;this.renderer?.domElement?.removeEventListener('webglcontextrestored',this.onRestore);for(const f of [...this.records.keys()])this.unregister(f);this.renderer=null;}
}
