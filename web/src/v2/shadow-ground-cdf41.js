// Independent terrain-only representation. Four channels store actual sample
// visibility at nearby physical receiver depths, not a guessed moment bound.
export function groundBiasDistance41(normalBias,linearDepthBias,gx,gy){return-normalBias*Math.sqrt(1+gx*gx+gy*gy)+linearDepthBias;}
export const groundCDFShared41=`
uniform vec4 groundBias41; // normal bias m, signed linear depth bias m, light span m, depth range m
uniform float groundCDFWidth41;
float groundCenter41(vec2 uv){
 float du=1./momentTargetSize41;
 vec2 gradient=vec2(depthReference41(uv+vec2(du,0.))-depthReference41(uv-vec2(du,0.)),depthReference41(uv+vec2(0.,du))-depthReference41(uv-vec2(0.,du)))*groundBias41.w*momentTargetSize41/(2.*groundBias41.z);
 float distance=-groundBias41.x*sqrt(1.+dot(gradient,gradient))+groundBias41.y;
 return depthReference41(uv)+distance/groundBias41.w;
}
`;
export const groundCDFDepth41=`
float groundD41=(momentDepth41-momentEncoding41.x)*momentEncoding41.y;
float center41=groundCenter41(gl_FragCoord.xy/momentTargetSize41);
vec4 thresholds41=center41+vec4(-1.,-1./3.,1./3.,1.)*groundCDFWidth41/groundBias41.w;
gl_FragColor=step(thresholds41,vec4(groundD41));
`;
export function groundCDFKernel41(reference,size){return `
${reference}
float groundCDFApplied41=0.;uniform float momentDiagnostic41;
uniform sampler2D momentTexture41;uniform vec2 momentEncoding41;uniform float momentEnabled41,momentReverse41,momentTargetSize41;uniform vec4 momentWindow41;
${groundCDFShared41}
float cdf41(vec2 uv,float z,float receiverReference){
 // Filter along the local receiver plane, not a constant light-depth slice.
 // Keep the actual receiver/reference residual, including normal/depth bias.
 float shiftedZ=z+depthReference41(uv)-receiverReference;
 float d=(shiftedZ-groundCenter41(uv))*groundBias41.w;
 if(abs(d)>groundCDFWidth41)return -1.;
 vec4 v=texture2D(momentTexture41,uv);float t=(d/groundCDFWidth41+1.)*1.5;
 if(t<1.)return mix(v.x,v.y,t);if(t<2.)return mix(v.y,v.z,t-1.);return mix(v.z,v.w,t-2.);
}
float momentNear41(sampler2DShadow map,vec2 mapSize,float intensity,float bias,float radius,vec4 coord){
 if(momentEnabled41<.5)return getShadow(map,mapSize,intensity,bias,radius,coord);
 vec3 p=coord.xyz/coord.w;float edge=min(min(p.x-momentWindow41.x,p.y-momentWindow41.y),min(momentWindow41.z-p.x,momentWindow41.w-p.y));
 if(edge<${2/size})return getShadow(map,mapSize,intensity,bias,radius,coord);
 float z=((momentReverse41>.5?1.-p.z-bias:p.z+bias)-momentEncoding41.x)*momentEncoding41.y;
 vec2 at=p.xy*mapSize-.5,base=(floor(at)+.5)/mapSize,f=fract(at),stepUV=1./mapSize;
 float receiverReference=depthReference41(p.xy);
 vec4 v=vec4(cdf41(base,z,receiverReference),cdf41(base+vec2(stepUV.x,0.),z,receiverReference),cdf41(base+vec2(0.,stepUV.y),z,receiverReference),cdf41(base+stepUV,z,receiverReference));
 // An inaccurate ground prediction cannot silently turn into missing shadows.
 if(min(min(v.x,v.y),min(v.z,v.w))<0.)return getShadow(map,mapSize,intensity,bias,radius,coord);
 float visibility=mix(1.,mix(mix(v.x,v.y,f.x),mix(v.z,v.w,f.x),f.y),intensity),w=smoothstep(${2/size},${10/size},edge);
 groundCDFApplied41=w;return w<1.?mix(getShadow(map,mapSize,intensity,bias,radius,coord),visibility,w):visibility;
}
`;}
