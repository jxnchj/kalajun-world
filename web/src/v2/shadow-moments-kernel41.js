import {momentReferenceGLSL41} from './shadow-moments-reference41.js';
export function momentKernel41({half=false,gain=1,centered=true,localRef=true,size=2048,resolveLow=0,resolveHigh=size,dynamicRect=false}={}){const gainGLSL=`vec4(${[1,2,3,4].map(n=>(gain**n).toFixed(1)).join(',')})`;return `
${localRef?momentReferenceGLSL41:''}
float debugShadow41=1.;uniform float momentDiagnostic41;uniform vec4 momentWindow41;
uniform float momentReverse41;uniform sampler2D momentTexture41;uniform vec2 momentEncoding41;uniform float momentBias41;uniform float momentEnabled41;
float momentVisibility41(vec4 inputMoments,float t){
 vec4 b=inputMoments;
 float mean=b.x,mean2=mean*mean;
 float variance=b.y-mean2;
 // Quantization-scale degeneracy test: a flat surface is a point mass,
 // not an unstable matrix needing an arbitrary dark/bright fallback.
 float tolerance=max(1e-16,${half?'0.004':'8e-7'}*max(abs(b.y),mean2));
 if(variance<=tolerance)return t<=mean?1.:0.;
 float sigma=sqrt(variance),x=(t-mean)/sigma;
 float third=b.z-3.*mean*b.y+2.*mean*mean2;
 float fourth=b.w-4.*mean*b.z+6.*mean2*b.y-3.*mean2*mean2;
 float skew=third/(variance*sigma);
 float kurt=fourth/(variance*variance);
 // Cholesky in centered, variance-normalized coordinates. Its first two
 // pivots are exactly 1; the remaining Schur complement must be positive.
 float pivot=max(kurt-1.-skew*skew,max(momentBias41,1e-5));
 float c2=(x*x-1.-skew*x)/pivot,c1=x-skew*c2,c0=1.-c2;
 if(abs(c2)<1e-15)return x<=0.?1.:0.;
 float halfP=c1/(2.*c2),disc=max(0.,halfP*halfP-c0/c2);
 float q=-halfP-(halfP<0.?-1.:1.)*sqrt(disc);
 vec2 roots=abs(q)>1e-20?vec2(q,(c0/c2)/q):vec2(0.);roots=vec2(min(roots.x,roots.y),max(roots.x,roots.y));
 float denominator1=(roots.x-x)*(roots.x-roots.y);
 float denominator2=(roots.y-x)*(roots.y-roots.x);
 if(abs(denominator1)<1e-15||abs(denominator2)<1e-15)return x<=0.?1.:0.;
 float w1=(1.+x*roots.y)/denominator1,w2=(1.+x*roots.x)/denominator2;
 return clamp(1.-(roots.x<x?w1:0.)-(roots.y<x?w2:0.),0.,1.);
}
float localVisibility41(vec2 uv,float z){return momentVisibility41(texture2D(momentTexture41,uv)/${gainGLSL},z${localRef?'-depthReference41(uv)':''});}
float useNative41(sampler2DShadow depthTex,vec2 mapSize,float intensity,float b,float r,vec4 p){debugShadow41=nativeShadow41(depthTex,mapSize,intensity,b,r,p);return debugShadow41;}
float getShadow(sampler2DShadow nativeDepth,vec2 mapSize,float intensity,float depthBias,float radius,vec4 coord){
 if(momentEnabled41<.5){debugShadow41=nativeShadow41(nativeDepth,mapSize,intensity,depthBias,radius,coord);return debugShadow41;}
 vec3 p=coord.xyz/coord.w;float edge=min(min(p.x-${dynamicRect?'momentWindow41.x':(resolveLow/size).toFixed(8)},p.y-${dynamicRect?'momentWindow41.y':(resolveLow/size).toFixed(8)}),min(${dynamicRect?'momentWindow41.z':(resolveHigh/size).toFixed(8)}-p.x,${dynamicRect?'momentWindow41.w':(resolveHigh/size).toFixed(8)}-p.y));
 if(edge<=${(2/size).toFixed(8)})return useNative41(nativeDepth,mapSize,intensity,depthBias,radius,coord);if(any(lessThan(p.xy,vec2(0.)))||any(greaterThan(p.xy,vec2(1.))))return 1.;
 float z=((momentReverse41>.5?1.-p.z-depthBias:p.z+depthBias)-momentEncoding41.x)*momentEncoding41.y+${centered?'0.':'.5'};
 float validZ=z${localRef?'-depthReference41(p.xy)':''};
 if(validZ<=${centered?'-.5':'0.'}||validZ>=${centered?'.5':'1.'})return useNative41(nativeDepth,mapSize,intensity,depthBias,radius,coord);
 float v;
 ${localRef?`vec2 position=p.xy*mapSize-.5,base=(floor(position)+.5)/mapSize,f=fract(position);vec2 stepUV=1./mapSize;
 v=mix(mix(localVisibility41(base,z),localVisibility41(base+vec2(stepUV.x,0.),z),f.x),mix(localVisibility41(base+vec2(0.,stepUV.y),z),localVisibility41(base+stepUV,z),f.x),f.y);`:`v=localVisibility41(p.xy,z);`}
 debugShadow41=v<0.?0.:mix(1.,v,intensity);float transition=smoothstep(${(2/size).toFixed(8)},${(10/size).toFixed(8)},edge);if(transition<1.)debugShadow41=mix(nativeShadow41(nativeDepth,mapSize,intensity,depthBias,radius,coord),debugShadow41,transition);return debugShadow41;
}`;
}
