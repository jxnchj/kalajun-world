import {FOREST_REACH39_SOURCE} from './forest-reach39-source.js';
import surfaceData from './generated/forest-reach-surface41.json' with {type:'json'};
// Existing authored root lobe, not another strip following the whole river.
export const ROOT_FACE50=Object.freeze({...surfaceData.patches.find(p=>p.kind==='root'&&p.offset===1.5),halfLength:1.9,soilPeriod:.48});
const p=ROOT_FACE50,trees=FOREST_REACH39_SOURCE.trees.filter(t=>Math.hypot(t.x-p.x,t.z-p.z)<5);
const smooth=(a,b,v)=>{const t=Math.max(0,Math.min(1,(v-a)/(b-a)));return t*t*(3-2*t);};
export function rootFace50Weight({x,z,clearance,nx,nz,snow=0}){
 const dx=x-p.x,dz=z-p.z,along=dx*p.fx+dz*p.fz,across=-dx*p.fz+dz*p.fx;
 const u=along/p.halfLength,foot=Math.abs(u)>=1?0:(1-u*u)**3;
 let protectedWeight=1;for(const tree of trees)protectedWeight=Math.min(protectedWeight,smooth(.8,2,Math.hypot(x-tree.x,z-tree.z)));
 return foot*(1-smooth(.45,.8,Math.abs(across-.18)))*smooth(.12,.30,nx*p.fz-nz*p.fx)*smooth(.015,.04,clearance)*(1-smooth(.16,.22,clearance))*protectedWeight*(1-snow);
}
const n=x=>Number(x).toFixed(10),v=(x,z)=>'vec2('+n(x)+','+n(z)+')';
export const ROOT_FACE50_GLSL=`
float rootFaceWeight50(vec2 world,float clearance,vec3 normal,float snow){
 vec2 d=world-${v(p.x,p.z)};
 float along=dot(d,${v(p.fx,p.fz)})/${n(p.halfLength)};
 float across=dot(d,${v(-p.fz,p.fx)});
 float footprint=pow(max(0.,1.-along*along),3.)*(1.-smoothstep(.45,.8,abs(across-.18)));
 float protection=1.;
 ${trees.map(t=>'protection=min(protection,smoothstep(.8,2.,distance(world,'+v(t.x,t.z)+')));').join('\n')}
 return footprint*smoothstep(.12,.30,dot(normal.xz,${v(p.fz,-p.fx)}))*smoothstep(.015,.04,clearance)*(1.-smoothstep(.16,.22,clearance))*protection*(1.-snow);
}
`;
export const ROOT_FACE50_COLOR=`
 // Top living cap remains original forest material; only the actual inward
 // side slope exposes this centimetre-scale soil horizon. No new grain field.
 float reachFace50=rootFaceWeight50(terrainXZ,vTerrainHydrology.w,terrainN,terrainSnow);
 vec2 reachFaceUV50=vec2(dot(terrainXZ-${v(p.x,p.z)},${v(p.fx,p.fz)}),vTerrainWorldPosition.y-2327.25)/.48;
 vec2 reachFaceDX50=dFdx(reachFaceUV50),reachFaceDY50=dFdy(reachFaceUV50);
 vec4 reachFaceSoil50=terrainSoilValue;
 if(reachFace50>0.)reachFaceSoil50=terrainSampleGrad(1.,reachFaceUV50,.43,reachFaceDX50,reachFaceDY50);
 vec3 reachFaceColor50=mix(reachHumus41,terrainOrganicSoil,.55)*(.84+.32*reachFaceSoil50.r);
 // Avoid reapplying a forest photograph/normal to the exposed cut face.
 reachOrganic41=mix(reachOrganic41,reachFaceColor50,reachFace50);
 reachRoots41=max(reachRoots41,reachFace50);
`;
export const ROOT_FACE50_NORMAL=`
 // Packed soil GB are slopes of the same physical height field. Rotate from
 // along-bank/up chart into world space, then the existing terrain shader
 // projects the gradient onto the actual terrain tangent plane.
 vec3 reachFaceGradient50=(vec3(${n(p.fx)},0.,${n(p.fz)})*reachFaceSoil50.g+vec3(0.,1.,0.)*reachFaceSoil50.b)*(2./.48)*.35;
 terrainGradient=mix(terrainGradient,reachFaceGradient50,reachFace50);
`;
export const ROOT_FACE50_ROUGH=`
 roughnessFactor=mix(roughnessFactor,.92+.06*reachFaceSoil50.a,reachFace50);
`;
