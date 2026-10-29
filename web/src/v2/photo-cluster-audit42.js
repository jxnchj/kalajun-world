// Read-only feasibility counter. Never creates runtime meshes or edits assets.
import * as T from 'three';
import {TREE_CULL_WIND,treeWindDisplacementBound} from './tree-frustum-cull.js';
export function photoClusters42(geometry,count){
 if(![8,16].includes(count))throw Error('Expected 8 or 16 spatial blocks');
 const p=geometry.attributes.position,wind=geometry.attributes.aPlantWind??geometry.attributes._plant_wind,index=geometry.index;
 if(!index||!p||Object.keys(geometry.morphAttributes).length||treeWindDisplacementBound(wind)>TREE_CULL_WIND[0])throw Error('Unsupported source or unbounded wind');
 const parent=Int32Array.from({length:p.count},(_,i)=>i),find=i=>{while(parent[i]!==i){parent[i]=parent[parent[i]];i=parent[i];}return i;},join=(a,b)=>{a=find(a);b=find(b);if(a!==b)parent[b]=a;};
 for(let t=0;t<index.count;t+=3){join(index.getX(t),index.getX(t+1));join(index.getX(t),index.getX(t+2));}
 const components=new Map(),v=new T.Vector3();for(let t=0;t<index.count;t+=3){const id=find(index.getX(t));let c=components.get(id);if(!c){c={box:new T.Box3(),triangles:0};components.set(id,c);}c.triangles++;for(let k=0;k<3;k++)c.box.expandByPoint(v.fromBufferAttribute(p,index.getX(t+k)));}
 for(const c of components.values())c.center=c.box.getCenter(new T.Vector3());
 const groups=[[...components.values()]];while(groups.length<count){let at=-1,best=-1;for(let i=0;i<groups.length;i++)if(groups[i].length>1){const total=groups[i].reduce((n,c)=>n+c.triangles,0);if(total>best){best=total;at=i;}}if(at<0)break;const group=groups[at],bounds=new T.Box3();for(const c of group)bounds.expandByPoint(c.center);const size=bounds.getSize(new T.Vector3()),axis=size.x>=size.y&&size.x>=size.z?'x':size.y>=size.z?'y':'z';group.sort((a,b)=>a.center[axis]-b.center[axis]);let sum=0,split=1;for(;split<group.length;split++){sum+=group[split-1].triangles;if(sum>=best/2)break;}split=Math.min(split,group.length-1);groups.splice(at,1,group.slice(0,split),group.slice(split));}
 const expansion=new T.Vector3(...TREE_CULL_WIND),blocks=groups.map(group=>{const box=new T.Box3();let triangles=0;for(const c of group){box.union(c.box);triangles+=c.triangles;}return{box:box.expandByVector(expansion),triangles,components:group.length};});return{blocks,triangles:index.count/3,components:components.size,whole:blocks.reduce((b,c)=>b.union(c.box),new T.Box3()),scope:'Full original index topology; all-phase original wind bound; no LOD/fade/occlusion shortcuts.'};
}
export function photoBoxWorld42(box,matrix,out=new T.Box3()){
 const c=box.getCenter(new T.Vector3()).applyMatrix4(matrix),h=box.getSize(new T.Vector3()).multiplyScalar(.5),e=matrix.elements;
 const x=Math.abs(e[0])*h.x+Math.abs(e[4])*h.y+Math.abs(e[8])*h.z,y=Math.abs(e[1])*h.x+Math.abs(e[5])*h.y+Math.abs(e[9])*h.z,z=Math.abs(e[2])*h.x+Math.abs(e[6])*h.y+Math.abs(e[10])*h.z;
 const pad=.03+Math.max(Math.abs(c.x),Math.abs(c.y),Math.abs(c.z))*.000002;
 out.min.set(c.x-x-pad,c.y-y-pad,c.z-z-pad);out.max.set(c.x+x+pad,c.y+y+pad,c.z+z+pad);return out;
}
export function countPhotoClusters42(batches,passes,{clusters=8,topologyCache=new WeakMap()}={}){
 const matrix=new T.Matrix4(),world=new T.Matrix4(),box=new T.Box3(),rows=[];
 for(const pass of passes){let baseline=0,rootOnly=0,clusterTriangles=0,draws=0,drawUpper=0,drawLower=0,roots=0;
 for(const batch of batches){const mesh=batch.mesh;if(![1,5].includes(batch.mode)||!mesh.visible||!(mesh.material.alphaTest>0)||!mesh.count)continue;if(pass.shadow&&!mesh.castShadow)continue;if(pass.camera&&!mesh.layers.test(pass.camera.layers))continue;let hidden=false;for(let p=mesh.parent;p;p=p.parent)if(!p.visible){hidden=true;break;}if(hidden)continue;if(mesh.frustumCulled){const fn=pass.shadow?(mesh.intersectsShadowCasterFrustum||mesh.intersectsFrustum):mesh.intersectsFrustum;if(fn){if(!fn.call(mesh,pass.frustum))continue;}else if(!pass.frustum.intersectsObject(mesh))continue;}
 const source=mesh.geometry.userData.treeWindSource||mesh.geometry;const pos=source.attributes.position,wind=source.attributes.aPlantWind??source.attributes._plant_wind,ix=source.index,stamp=[pos,pos?.array,pos?.version,wind,wind?.array,wind?.version,ix,ix?.array,ix?.version,Object.keys(source.morphAttributes).join(',')];let cached=topologyCache.get(source);if(!cached||stamp.some((v,i)=>v!==cached.stamp[i])){cached={stamp,models:new Map()};topologyCache.set(source,cached);}let model=cached.models.get(clusters);if(!model){model=photoClusters42(source,clusters);cached.models.set(clusters,model);}baseline+=model.triangles*mesh.count;draws++;const live=new Uint8Array(model.blocks.length);
 for(let root=0;root<mesh.count;root++){matrix.fromArray(mesh.instanceMatrix.array,root*16);world.multiplyMatrices(mesh.matrixWorld,matrix);roots++;if(!pass.frustum.intersectsBox(photoBoxWorld42(model.whole,world,box)))continue;rootOnly+=model.triangles;for(let k=0;k<model.blocks.length;k++){const b=model.blocks[k];if(pass.frustum.intersectsBox(photoBoxWorld42(b.box,world,box))){clusterTriangles+=b.triangles;live[k]=1;}}}const liveBlocks=live.reduce((a,b)=>a+b,0);drawUpper+=liveBlocks;if(liveBlocks)drawLower++;
 }rows.push({pass:pass.name,roots,baseline,rootOnly,clusterTriangles,saved:baseline-clusterTriangles,additionalBeyondRoot:rootOnly-clusterTriangles,savedFraction:baseline?(baseline-clusterTriangles)/baseline:0,draws,drawLower,drawUpper});}
 return{clusters,rows,scope:'Read-only submitted triangle bound; no GPU gain claimed. All root IDs/vertices/wind retained.'};
}
