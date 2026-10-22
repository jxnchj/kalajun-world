// Finite diffuse aperture integration, in irradiance/radiance units. A clipped
// polygon's vector solid angle integrates cos(theta) exactly over its projected
// hemisphere. Furniture visibility remains the separately baked aperture term.
// The crown is an 8-sided approximation of its authored ellipse; doors/windows
// are exact rectangles. No light/texture/geometry is added to the scene.
import * as THREE from 'three';

export function aperturePolygon(delta,axisU,axisV,halfU,halfV,crown=false){
 const d=new THREE.Vector3(...delta),u=new THREE.Vector3(...axisU).multiplyScalar(halfU),v=new THREE.Vector3(...axisV).multiplyScalar(halfV);
 const corners=crown?Array.from({length:8},(_,i)=>[Math.cos(i*Math.PI/4),Math.sin(i*Math.PI/4)]):[[1,1],[-1,1],[-1,-1],[1,-1]];
 return corners.map(([x,y])=>d.clone().addScaledVector(u,x).addScaledVector(v,y));
}
export function finiteApertureIrradiance(polygon,normal){
 const n=new THREE.Vector3(...normal).normalize(),clipped=[];
 for(let i=0;i<polygon.length;i++){
  const a=polygon[i],b=polygon[(i+1)%polygon.length],da=a.dot(n),db=b.dot(n);
  if(da>=0)clipped.push(a);
  if((da>=0)!==(db>=0))clipped.push(a.clone().lerp(b,da/(da-db)));
 }
 if(clipped.length<3)return 0;
 let sum=0;
 for(let i=0;i<clipped.length;i++){
  const a=clipped[i].clone().normalize(),b=clipped[(i+1)%clipped.length].clone().normalize(),cross=a.clone().cross(b),length=cross.length();
  if(length>1e-10)sum+=Math.atan2(length,a.dot(b))*cross.dot(n)/length;
 }
 return Math.min(Math.PI,Math.max(0,Math.abs(sum)*.5));
}

// Streaming form of the same convex-polygon integral. Normalizing endpoints
// cancels from both atan2 and the edge projection, so no endpoint normalization
// or temporary clipped polygon is needed. The single horizon edge closes it.
export function finiteApertureEdgeIrradiance(polygon,normal){
 const n=new THREE.Vector3(...normal).normalize();let integral=0,enter=null,exit=null;
 const edge=(a,b)=>{const cross=a.clone().cross(b),s=cross.length();
  return s>1e-10*Math.sqrt(a.lengthSq()*b.lengthSq())?Math.atan2(s,a.dot(b))*cross.dot(n)/s:0;};
 for(let i=0;i<polygon.length;i++){
  let a=polygon[i],b=polygon[(i+1)%polygon.length];const da=a.dot(n),db=b.dot(n);
  if(da<0&&db<0)continue;
  if((da>=0)!==(db>=0)){
   const intersection=a.clone().lerp(b,da/(da-db));
   if(da<0){a=intersection;enter=intersection;}else{b=intersection;exit=intersection;}
  }
  integral+=edge(a,b);
 }
 if(enter&&exit)integral+=edge(exit,enter);
 return Math.min(Math.PI,Math.max(0,Math.abs(integral)*.5));
}

export const ROOM_FINITE_APERTURE_GLSL=`
uniform float uRoomFiniteAperture;
uniform float uRoomApertureEdges;
float roomFiniteSkyIrradianceReference(vec3 delta,vec3 normal,vec4 apertureU,vec4 apertureV,bool crown){
  vec3 u=apertureU.xyz*apertureU.w,v=apertureV.xyz*apertureV.w;
  vec3 vertices[8];
  if(crown){
    const float h=.7071067811865476;
    vertices[0]=delta+u;vertices[1]=delta+h*(u+v);vertices[2]=delta+v;vertices[3]=delta+h*(-u+v);
    vertices[4]=delta-u;vertices[5]=delta-h*(u+v);vertices[6]=delta-v;vertices[7]=delta+h*(u-v);
  }else{
    vertices[0]=delta+u+v;vertices[1]=delta-u+v;vertices[2]=delta-u-v;vertices[3]=delta+u-v;
  }
  int count=crown?8:4;vec3 clipped[10];int clippedCount=0;
  // Clip at the actual receiver horizon. Clamping only the final cosine loses
  // sky when the aperture centre is behind the normal but part of it is visible.
  for(int j=0;j<8;j++){
    if(j>=count)break;
    vec3 a=vertices[j],b=vertices[j+1==count?0:j+1];
    float da=dot(a,normal),db=dot(b,normal);
    if(da>=0.0){clipped[clippedCount]=a;clippedCount++;}
    if((da>=0.0)!=(db>=0.0)){clipped[clippedCount]=mix(a,b,da/(da-db));clippedCount++;}
  }
  if(clippedCount<3)return 0.0;
  float integral=0.0;
  for(int j=0;j<10;j++){
    if(j>=clippedCount)break;
    vec3 a=clipped[j],b=clipped[j+1==clippedCount?0:j+1];
    a*=inversesqrt(max(dot(a,a),.000000000001));b*=inversesqrt(max(dot(b,b),.000000000001));
    vec3 edge=cross(a,b);float s=length(edge);
    if(s>.0000001)integral+=atan(s,dot(a,b))*dot(edge,normal)/s;
  }
  return clamp(abs(integral)*.5,0.0,3.14159265);
}

float roomApertureEdge(vec3 a,vec3 b,vec3 normal){
  vec3 edge=cross(a,b);float s2=dot(edge,edge);
  // Same angular degeneracy limit as the reference, without normalizing both
  // endpoints. atan is homogeneous in its two arguments.
  if(s2<=.00000000000001*dot(a,a)*dot(b,b))return 0.0;
  float s=sqrt(s2);return atan(s,dot(a,b))*dot(edge,normal)/s;
}
float roomClippedApertureEdge(vec3 a,vec3 b,vec3 normal,inout vec3 enter,inout vec3 exit){
  float da=dot(a,normal),db=dot(b,normal);
  if(da<0.0&&db<0.0)return 0.0;
  if((da>=0.0)!=(db>=0.0)){
    vec3 horizon=mix(a,b,da/(da-db));
    if(da<0.0){a=horizon;enter=horizon;}else{b=horizon;exit=horizon;}
  }
  return roomApertureEdge(a,b,normal);
}
float roomFiniteSkyIrradianceEdges(vec3 delta,vec3 normal,vec4 apertureU,vec4 apertureV,bool crown){
  vec3 u=apertureU.xyz*apertureU.w,v=apertureV.xyz*apertureV.w;
  float centre=dot(delta,normal),extent=abs(dot(u,normal))+abs(dot(v,normal));
  if(centre+extent<=0.0)return 0.0;
  bool above=centre-extent>=0.0;float integral=0.0;
  vec3 enter=vec3(0.0),exit=vec3(0.0);
  if(crown){
    const float h=.7071067811865476;
    vec3 a=delta+u,b=delta+h*(u+v),c=delta+v,d=delta+h*(-u+v);
    vec3 e=delta-u,f=delta-h*(u+v),g=delta-v,j=delta+h*(u-v);
    if(above){
      integral=roomApertureEdge(a,b,normal)+roomApertureEdge(b,c,normal)+roomApertureEdge(c,d,normal)+roomApertureEdge(d,e,normal)
              +roomApertureEdge(e,f,normal)+roomApertureEdge(f,g,normal)+roomApertureEdge(g,j,normal)+roomApertureEdge(j,a,normal);
    }else{
      integral+=roomClippedApertureEdge(a,b,normal,enter,exit);integral+=roomClippedApertureEdge(b,c,normal,enter,exit);
      integral+=roomClippedApertureEdge(c,d,normal,enter,exit);integral+=roomClippedApertureEdge(d,e,normal,enter,exit);
      integral+=roomClippedApertureEdge(e,f,normal,enter,exit);integral+=roomClippedApertureEdge(f,g,normal,enter,exit);
      integral+=roomClippedApertureEdge(g,j,normal,enter,exit);integral+=roomClippedApertureEdge(j,a,normal,enter,exit);
    }
  }else{
    vec3 a=delta+u+v,b=delta-u+v,c=delta-u-v,d=delta+u-v;
    if(above){
      integral=roomApertureEdge(a,b,normal)+roomApertureEdge(b,c,normal)+roomApertureEdge(c,d,normal)+roomApertureEdge(d,a,normal);
    }else{
      integral+=roomClippedApertureEdge(a,b,normal,enter,exit);integral+=roomClippedApertureEdge(b,c,normal,enter,exit);
      integral+=roomClippedApertureEdge(c,d,normal,enter,exit);integral+=roomClippedApertureEdge(d,a,normal,enter,exit);
    }
  }
  if(!above)integral+=roomApertureEdge(exit,enter,normal);
  return clamp(abs(integral)*.5,0.0,3.14159265);
}
float roomFiniteSkyIrradiance(vec3 delta,vec3 normal,vec4 apertureU,vec4 apertureV,bool crown){
  if(uRoomApertureEdges>.5)return roomFiniteSkyIrradianceEdges(delta,normal,apertureU,apertureV,crown);
  return roomFiniteSkyIrradianceReference(delta,normal,apertureU,apertureV,crown);
}
`;
