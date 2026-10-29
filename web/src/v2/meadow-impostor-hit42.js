// Isolated reference diagnostics. No production import or runtime texture.
import * as T from 'three';
export function installMeadowHit42(mesh,{rootOffset=0,capture=false}={}){
 const g=mesh.geometry,leaf=new Float32Array(g.attributes.position.count);let at=0;
 for(let b=0;b<24;b++)for(let j=0;j<(b<8?6:4);j++)leaf[at++]=b+1;
 leaf.fill(25,at);g.setAttribute('aHitLeaf42',new T.Float32BufferAttribute(leaf,1));
 g.setAttribute('aHitRoot42',new T.InstancedBufferAttribute(Float32Array.from({length:mesh.count},(_,i)=>i+rootOffset+1),1));
 const mode={value:capture?1:0,rootFilter:{value:0}},material=mesh.material,prior=material.onBeforeCompile,key=material.customProgramCacheKey;
 material.onBeforeCompile=(s,r)=>{prior(s,r);s.uniforms.uHitMode42=mode;s.uniforms.uHitRootFilter42=mode.rootFilter;
 s.vertexShader='attribute float aHitLeaf42;attribute float aHitRoot42;varying vec2 vHit42;\n'+s.vertexShader.replace('void main() {','void main() {\nvHit42=vec2(aHitLeaf42,aHitRoot42);');
 s.fragmentShader='uniform float uHitMode42;uniform float uHitRootFilter42;varying vec2 vHit42;\n'+s.fragmentShader.replace('void main() {','void main() {\nif(uHitRootFilter42>.5 && abs(vHit42.y-uHitRootFilter42)>.1)discard;');
 const anchor='else gl_FragColor=vec4(1.);';if(!s.fragmentShader.includes(anchor))throw Error('Reference hit anchor changed');
 s.fragmentShader=s.fragmentShader.replace(anchor,anchor+`\nif(uHitMode42>.5 && referencePass<.5)gl_FragColor=vec4(vHit42/255.,max(0.,dot(referenceNormal,referenceLight)),1.);\nif(uHitMode42>1.5 && referencePass<.5)gl_FragColor=packDepthToRGBA(gl_FragCoord.z);`);
 };material.customProgramCacheKey=()=>key.call(material)+'-hit42';material.needsUpdate=true;return mode;
}
