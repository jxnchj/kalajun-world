// Mode 0: original path. Mode 1: explicit-gradient control. Mode 2: same
// gradients, but return the original domain-mask zero before texture reads.
export function installFarRectGate39(shader,uniform){
 if(!uniform)return false;
 if(shader.fragmentShader.includes('uniform float uFarRectGate39;'))return false;
 const start=shader.fragmentShader.indexOf('void farSample('),end=shader.fragmentShader.indexOf('vec3 farSurvivingNormal',start);
 if(start<0||end<0)throw Error('Far rectangle gate requires original sample helpers');
 let sample=shader.fragmentShader.slice(start,end);
 const coordinate='vec2 st=(vFarPlane-rect.xy)/(rect.zw-rect.xy);';
 const oldCondition='if(uFarZeroWeightLayers>.5||uFarDeferredNormal>.5)';
 if(sample.split(coordinate).length!==2||!sample.includes(oldCondition))throw Error('Far sample source changed');
 sample=sample.replace(coordinate,coordinate+'\n if(uFarRectGate39>1.5&&(st.x<0.||st.x>1.||st.y<0.||st.y>1.)){c=vec4(0.);n=vec3(0.);return;}');
 sample=sample.replace(oldCondition,'if(uFarRectGate39>.5||uFarZeroWeightLayers>.5||uFarDeferredNormal>.5)');
 const tail=shader.fragmentShader.slice(end),normalEnd=tail.indexOf('\n}');
 if(normalEnd<0)throw Error('Far surviving normal helper changed');
 let normal=tail.slice(0,normalEnd);
 if(normal.split(coordinate).length!==2||!normal.includes('textureGrad(uFarNormal'))throw Error('Far surviving normal source changed');
 normal=normal.replace(coordinate,coordinate+'\n if(uFarRectGate39>1.5&&(st.x<0.||st.x>1.||st.y<0.||st.y>1.))return vec3(0.);');
 shader.fragmentShader='uniform float uFarRectGate39;\n'+shader.fragmentShader.slice(0,start)+sample+normal+tail.slice(normalEnd);
 shader.uniforms.uFarRectGate39=uniform;return true;
}
