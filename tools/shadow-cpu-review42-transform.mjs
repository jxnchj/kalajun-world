// Review-only native shadow timing; no production imports.
export function shadowCPUTransform42(source){
 const marker='function renderObject( object, camera, shadowCamera, light, type ) {';
 if(!source.includes(marker))throw Error('Native shadow renderer signature changed');
 const api=`
const review42=globalThis.shadowCPUReview42 ??= {
 mode:'off',samples:[],current:null,stack:[],remaining:0,
 start(mode='pass',passes=8){if(!['off','pass','detail'].includes(mode))throw Error('Invalid mode');this.mode=mode;this.remaining=passes;this.samples=[];},
 stop(){this.mode='off';this.remaining=0;return this.samples;},
 snapshot(){return {mode:this.mode,remaining:this.remaining,samples:this.samples};},
 begin(){if(this.mode==='off'||this.remaining<=0)return false;this.remaining--;this.current={mode:this.mode,total:0,nodes:0,stages:{},stageCalls:{},exclusiveTraversal:0};this.stack=[];return true;},
 end(start){this.current.total=performance.now()-start;this.samples.push(this.current);this.current=null;if(!this.remaining)this.mode='off';},
 measure(name,fn){if(this.current?.mode!=='detail')return fn();const start=performance.now();try{return fn();}finally{const elapsed=performance.now()-start,c=this.current;c.stages[name]=(c.stages[name]||0)+elapsed;c.stageCalls[name]=(c.stageCalls[name]||0)+1;if(this.stack.length)this.stack.at(-1).spent+=elapsed;}},
 node(fn){if(this.current?.mode!=='detail')return fn();const entry={start:performance.now(),spent:0,children:0};this.stack.push(entry);this.current.nodes++;try{return fn();}finally{const elapsed=performance.now()-entry.start;this.stack.pop();this.current.exclusiveTraversal+=elapsed-entry.spent-entry.children;if(this.stack.length)this.stack.at(-1).children+=elapsed;}},
 calibration(n=20000){const start=performance.now();for(let i=0;i<n;i++)performance.now();return {calls:n,ms:performance.now()-start,note:'clock-call lower bound only; wrappers and bookkeeping are additional'};}
};
`;
 source=source.replace(marker,api+'\nfunction renderObject( object, camera, shadowCamera, light, type ) { return review42.node(()=>renderObjectBody42(object,camera,shadowCamera,light,type)); }\nfunction renderObjectBody42( object, camera, shadowCamera, light, type ) {');
 const begin=source.indexOf('function renderObjectBody42('),end=source.indexOf('\n\tfunction onMaterialDispose',begin);
 let body=source.slice(begin,end);
 for(const [pattern,label] of [
  [/object\.intersectsFrustum\( _frustum \)/g,'frustum'],
  [/object\.modelViewMatrix\.multiplyMatrices\( shadowCamera\.matrixWorldInverse, object\.matrixWorld \)/g,'matrix'],
  [/objects\.update\( object \)/g,'objectsUpdate'],
  [/getDepthMaterial\( object, (?:groupMaterial|material), light, type \)/g,'depthMaterial'],
  [/object\.onBeforeShadow\( [^;]+? \)/g,'beforeHook'],
  [/renderer\.renderBufferDirect\( [^;]+? \)/g,'direct'],
  [/object\.onAfterShadow\( [^;]+? \)/g,'afterHook']
 ]){let count=0;body=body.replace(pattern,m=>{count++;return `review42.measure('${label}',()=>${m})`;});if(!count)throw Error('Missing native stage '+label);}
 const originalBody=source.slice(begin,end).replace("function renderObjectBody42(","function renderObjectOriginal42(").replaceAll("renderObject( children[ i ],","renderObjectOriginal42( children[ i ],");
 source=source.slice(0,begin)+body+"\n"+originalBody+source.slice(end);
 const call='renderObject( scene, camera, shadowCamera, light, this.type );';
 if(source.split(call).length!==2)throw Error('Native pass entry changed');
 source=source.replace(call,`{const sampled42=review42.begin(),start42=sampled42?performance.now():0;try{if(review42.current?.mode==='detail'){${call}}else{renderObjectOriginal42(scene,camera,shadowCamera,light,this.type);}}finally{if(sampled42)review42.end(start42);}}`);
 return source;
}
export function shadowCPUReviewPlugin42(){let transformed=0;return {name:'review-shadow-cpu42',enforce:'pre',transform(code,id){
 const path=id.replaceAll('\\','/');
 if(path.endsWith('/renderers/webgl/WebGLShadowMap.js')){transformed++;return {code:shadowCPUTransform42(code),map:null};}
 if(path.endsWith('/three/build/three.module.js')){
  const begin=code.indexOf('function WebGLShadowMap( renderer, objects, capabilities ) {'),end=code.indexOf('function WebGLState(',begin);
  if(begin<0||end<0)throw Error('Bundled Three shadow boundary changed');
  transformed++;return {code:code.slice(0,begin)+shadowCPUTransform42(code.slice(begin,end))+code.slice(end),map:null};
 }
 },generateBundle(_options,bundle){if(transformed!==1)throw Error('Review must transform exactly one actual Three shadow module: '+transformed);if(!Object.values(bundle).some(item=>item.type==='chunk'&&item.code.includes('shadowCPUReview42')))throw Error('Review API absent in emitted bundle');}};}
