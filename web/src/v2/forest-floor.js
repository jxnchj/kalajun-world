import * as THREE from "three";
import {createPlantEnvelope,relocateShorePlant,SHORE_PLANT_MAX_SHIFT} from "./shore-contact.js";
const floorEnvelopes=new Map();
const clamp=(v,a=0,b=1)=>Math.max(a,Math.min(b,v));
const smooth=(a,b,v)=>{const t=clamp((v-a)/(b-a));return t*t*(3-2*t);};
function random(x,z,salt=0){let h=Math.imul(x^0x45d9f3b,374761393)^Math.imul(z^salt,668265263);h=Math.imul(h^(h>>>13),1274126177);return((h^(h>>>16))>>>0)/4294967296;}
export const FOREST_FLOOR=Object.freeze({tile:24,cell:2.4,range:112,capacity:{shrub:480,sedge:650,fern:720,deadwood:48,stone:180}});
const emptyHydro={wetness:0,bank:0,insideWater:false};
// Growth-form placement from cover, terrain and existing stream banks; this is not a surveyed species inventory.
export function forestFloorAt(world,ix,iz,excluded=()=>false){
 const x=(ix+.15+.7*random(ix,iz,151))*FOREST_FLOOR.cell,z=(iz+.15+.7*random(ix,iz,152))*FOREST_FLOOR.cell;
 const lc=world.landcoverAt(x,z),q=world.hydrology?.sampleAt(x,z,{includeDepth:false})||emptyHydro;
 if(lc.b>.16||q.insideWater||excluded(x,z,.85))return null;
 const canopy=lc.r,bank=q.wetness>.12&&q.bank>.05;
 if(canopy<.27&&!bank)return null;
 const normal=world.surface.normalAt(x,z,1.2);if(normal.y<.72)return null;
 const y=world.surface.heightAt(x,z);if(!Number.isFinite(y)||y>3250)return null;
 const neighbors=[[12,0],[-12,0],[0,12],[0,-12]].map(([dx,dz])=>world.landcoverAt(x+dx,z+dz).r);
 const contrast=Math.max(...neighbors)-Math.min(...neighbors),edge=smooth(.06,.35,contrast),patch=random(Math.floor(ix/4),Math.floor(iz/4),157);
 const select=random(ix,iz,158),rot=random(ix,iz,159)*Math.PI*2;
 let kind,scale=1,pitch=0;
 if(bank&&q.wetness>.2&&select<.38+.34*patch&&normal.y>.82){kind="sedge";scale=.7+random(ix,iz,160)*.65;}
 else if(canopy>.33&&normal.y>.81&&patch>.22&&select<(.028+edge*.18)*(.5+patch)){kind="shrub";scale=.65+random(ix,iz,161)*.65;}
 else if(canopy>.60&&normal.y>.9&&patch>.58&&select>.992&&random(ix,iz,162)>.35){
  kind="deadwood";scale=.65+random(ix,iz,163)*.6;
  const dx=Math.cos(rot)*1.25*scale,dz=-Math.sin(rot)*1.25*scale;
  if(excluded(x-dx,z-dz,.3)||excluded(x+dx,z+dz,.3)||world.hydrology?.sampleAt(x-dx,z-dz,{includeDepth:false}).insideWater||world.hydrology?.sampleAt(x+dx,z+dz,{includeDepth:false}).insideWater)return null;
  const ha=world.surface.heightAt(x-dx,z-dz),hb=world.surface.heightAt(x+dx,z+dz);
  pitch=Math.atan2(hb-ha,2.5*scale);if(Math.abs(pitch)>.22||Math.abs((ha+hb)*.5-y)>.13)return null;
 }else if(canopy>.38&&normal.y<.96&&select>.965&&patch>.4){kind="stone";scale=.18+random(ix,iz,164)*.25;}
 else if(canopy>.42&&normal.y>.82&&patch>.28&&select>.20&&select<.43){kind="fern";scale=.72+random(ix,iz,165)*.64;}
 else return null;
 const root={id:"forest-floor:"+ix+":"+iz,kind,x,y:y-.015,z,s:scale,rot,pitch,wetness:q.wetness||0};
 if(!world.hydrology?.nearSegments||!["sedge","shrub","fern"].includes(kind))return root;
 if(!floorEnvelopes.has(kind)){const geometry=createForestFloorGeometry(kind);floorEnvelopes.set(kind,createPlantEnvelope([geometry]));geometry.dispose();}
 return relocateShorePlant(world,root,floorEnvelopes.get(kind),(px,pz)=>{
  const cover=world.landcoverAt(px,pz),water=world.hydrology.sampleAt(px,pz,{includeDepth:false});
  return !excluded(px,pz,.85)&&!water.insideWater&&cover.b<=.16&&world.surface.normalAt(px,pz,1.2).y>.72
    &&world.surface.heightAt(px,pz)<=3250&&(kind==="sedge"?water.wetness>.12&&water.bank>.05:cover.r>.27);
 });
}
function meshBuilder(){
 const positions=[],colors=[],weights=[],indices=[];
 function vertex(v,color,w){positions.push(...v);colors.push(color.r,color.g,color.b);weights.push(...w);return positions.length/3-1;}
 function tube(a,b,r1,r2,color,sides=5,caps=true){
  const A=new THREE.Vector3(...a),B=new THREE.Vector3(...b),axis=B.clone().sub(A).normalize(),u=new THREE.Vector3(0,1,0);
  if(Math.abs(axis.y)>.9)u.set(1,0,0);u.cross(axis).normalize();const v=axis.clone().cross(u);
  const start=positions.length/3;
  for(let j=0;j<2;j++)for(let k=0;k<sides;k++){const t=k/sides*Math.PI*2,p=(j?B:A).clone().addScaledVector(u,Math.cos(t)*(j?r2:r1)).addScaledVector(v,Math.sin(t)*(j?r2:r1));vertex(p.toArray(),color,[clamp(p.y/1.45)*.65,0,0]);}
  for(let k=0;k<sides;k++){const a=start+k,b=start+(k+1)%sides,c=a+sides,d=b+sides;indices.push(a,c,b,b,c,d);}
  // End grain closes both ends, preventing a hollow floating branch at eye level.
  if(caps)for(let j=0;j<2;j++){const center=vertex((j?B:A).toArray(),color.clone().multiplyScalar(j?1.22:.8),[clamp((j?B:A).y/1.45)*.65,0,0]);for(let k=0;k<sides;k++){const a=start+j*sides+k,b=start+j*sides+(k+1)%sides;indices.push(center,j?a:b,j?b:a);}}
 }
 function leaf(center,angle,length,width,color,phase,tipY=.02){
  const [x,y,z]=center,d=new THREE.Vector3(Math.cos(angle),.35,Math.sin(angle)).normalize(),side=new THREE.Vector3(-Math.sin(angle),0,Math.cos(angle)),root=new THREE.Vector3(x,y,z);
  // Rounded lamina around a raised midrib, with a curled tip. The old four
  // flat diamond triangles read as paper cut-outs in the nearest understory.
  const ps=[root];
  for(const [t,sign]of [[.24,1],[.52,1],[.78,1],[1,0],[.78,-1],[.52,-1],[.24,-1]]){
   const widthAt=Math.pow(Math.sin(Math.PI*t),.76)*width;
   ps.push(root.clone().addScaledVector(d,length*t).addScaledVector(side,widthAt*sign)
     .add(new THREE.Vector3(0,tipY*t*t-.012*Math.sin(Math.PI*t),0)));
  }
  ps.push(root.clone().addScaledVector(d,length*.49).add(new THREE.Vector3(0,.014+tipY*.2,0)));
  const first=positions.length/3;
  for(let i=0;i<ps.length;i++)vertex(ps[i].toArray(),color.clone().multiplyScalar(i===8?1.04:.94),[clamp(ps[i].y/1.45),.22,phase]);
  for(let i=0;i<8;i++)indices.push(first+i,first+(i+1)%8,first+8);
 }
 function finish(){const g=new THREE.BufferGeometry();g.setAttribute("position",new THREE.Float32BufferAttribute(positions,3));g.setAttribute("color",new THREE.Float32BufferAttribute(colors,3));g.setAttribute("aPlantWind",new THREE.Float32BufferAttribute(weights,3));g.setIndex(indices);g.computeVertexNormals();g.computeBoundingBox();g.computeBoundingSphere();return g;}
 return{vertex,tube,leaf,finish,indices,positions};
}
export function createForestFloorGeometry(kind){
 const b=meshBuilder();
 if(kind==="shrub"){
  const bark=new THREE.Color("#5d5c40");
  for(let stem=0;stem<5;stem++){
   const a=stem*2.39996,h=.65+random(stem,12,2)*.55,tip=[Math.cos(a)*.3,h,Math.sin(a)*.3];
   b.tube([0,0,0],tip,.018,.005,bark,5);
   for(let j=1;j<=4;j++){
    const t=j/5,p=tip.map(v=>v*t),side=a+(j%2?1:-1)*1.2,end=[p[0]+Math.cos(side)*.28,p[1]+.12,p[2]+Math.sin(side)*.28];
    b.tube(p,end,.007,.002,bark,3);
    for(let k=0;k<4;k++){
     const q=k/4,at=p.map((v,n)=>v+(end[n]-v)*q),direction=side+(k%2?1:-1)*.8;
     b.leaf(at,direction,.12+random(stem,j,k)*.07,.035,new THREE.Color(k%2?"#617c43":"#526f3d"),stem*.14+j*.12+k*.03);
    }
   }
  }
 }else if(kind==="sedge"){
  for(let i=0;i<17;i++){
   const a=i*2.39996,h=.45+random(i,17,21)*.4,arch=.16+random(i,17,22)*.34,width=.009+random(i,17,23)*.011;
   const tint=new THREE.Color(i%6===0?"#928857":"#647b44"),start=b.positions.length/3,rx=Math.cos(a)*.1,rz=Math.sin(a)*.1;
   for(let j=0;j<=4;j++){const t=j/4;for(const s of [-1,1])b.vertex([rx+Math.cos(a)*arch*t*t-Math.sin(a)*width*(1-t)*s,h*(t-.25*t*t),rz+Math.sin(a)*arch*t*t+Math.cos(a)*width*(1-t)*s],tint.clone().multiplyScalar(.58+.42*t),[t*.95,.12,i*.055]);}
   for(let j=0;j<4;j++){const a=start+j*2;b.indices.push(a,a+2,a+1,a+1,a+2,a+3);}
  }
 }else if(kind==="fern"){
  // Arching divided fronds: a low, broad understory under the vertical spruce.
  // It is a growth-form design, not a species survey.
  for(let f=0;f<7;f++){
   const az=f*2.399963,span=.45+random(f,82,1)*.27,height=.24+random(f,83,1)*.23;
   const stemColor=new THREE.Color("#526b2d"),leafColor=new THREE.Color(f%3?"#4d7835":"#648741");
   const point=t=>[Math.cos(az)*span*t,height*Math.sin(t*2.15),Math.sin(az)*span*t];
   let prev=[0,0,0];
   for(let j=1;j<=7;j++){
    const t=j/8,at=point(t);b.tube(prev,at,.004*(1-t*.65),.003*(1-t*.65),stemColor,3,false);prev=at;
    const length=(.055+.14*Math.sin(Math.PI*t))*(1-t*.24);
    for(const side of [-1,1]){
     b.leaf(at,az+side*(1.16-t*.26),length,.018+Math.sin(Math.PI*t)*.023,
       leafColor.clone().multiplyScalar(.72+t*.30),f*.09+j*.025,-.024);
    }
   }
   b.leaf(prev,az,.12,.022,leafColor,.83,-.055);
  }
 }else if(kind==="deadwood"){
  const bark=new THREE.Color("#5f5743");
  b.tube([-1.25,.14,0],[1.25,.22,.08],.15,.10,bark,9);
  b.tube([-.28,.18,0],[-.48,.58,-.19],.035,.012,bark,5);
  b.tube([.5,.2,.03],[.75,.12,.43],.03,.009,bark,5);
  // Modest broken bark ridges remain geometry, instead of another alpha card.
  for(let j=0;j<4;j++){const a=j*1.57;b.tube([-1.1,.14+Math.cos(a)*.145,Math.sin(a)*.145],[1.05,.20+Math.cos(a)*.105,.07+Math.sin(a)*.105],.012,.008,bark.clone().multiplyScalar(.74+j*.08),3);}
 }else if(kind==="stone"){
  const g=new THREE.IcosahedronGeometry(1,1),p=g.attributes.position,c=[];
  for(let i=0;i<p.count;i++){
   const x=p.getX(i),y=p.getY(i),z=p.getZ(i),r=.91+.09*Math.sin(x*4.1+z*5.4+y*3.3);
   p.setXYZ(i,x*r,y*.55*r+.25,z*r*.75);
   const tint=new THREE.Color("#68695b").multiplyScalar(.8+.19*(y*.5+.5));c.push(tint.r,tint.g,tint.b);
  }
  g.setAttribute("color",new THREE.Float32BufferAttribute(c,3));g.computeVertexNormals();g.computeBoundingBox();g.computeBoundingSphere();return g;
 }else throw new Error("Unknown forest-floor kind: "+kind);
 return b.finish();
}
export class ForestFloor{
 constructor(world,{excluded=()=>false,wind,depth,bounds}={}){
  this.world=world;this.excluded=excluded;this.bounds=bounds;this.group=new THREE.Group();this.group.name="forest-stream-edge";this.materials=[];this.pools=new Map();this.tiles=new Map();this.queue=[];this.anchor="";this.revision=0;this.transform=new THREE.Object3D();this.stats={shrubs:0,sedges:0,deadwood:0,stones:0,pending:0,triangles:0,builtThisFrame:0};
  for(const [kind,mode] of [["shrub",8],["sedge",9],["fern",8],["deadwood",10],["stone",11]]){
   const geometry=createForestFloorGeometry(kind),material=new THREE.MeshStandardMaterial({vertexColors:true,roughness:kind==="stone"?.88:.94,side:THREE.DoubleSide}),dynamic=kind==="shrub"||kind==="sedge"||kind==="fern";
   wind?.(material,mode,dynamic);
   const mesh=new THREE.InstancedMesh(geometry,material,FOREST_FLOOR.capacity[kind]);mesh.count=0;mesh.castShadow=true;mesh.receiveShadow=true;mesh.frustumCulled=true;if(depth)mesh.customDepthMaterial=depth(material,mode,dynamic);
   this.group.add(mesh);this.materials.push(material);this.pools.set(kind,{mesh,records:[],dirty:false,range:mode===8?110:mode===9?78:mode===10?110:65});
  }
 }
 matrix(p){const t=this.transform;t.position.set(p.x,p.y,p.z);t.rotation.set(0,p.rot,0);if(p.pitch)t.quaternion.multiply(new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0,0,1),p.pitch));t.scale.setScalar(p.s);t.updateMatrix();return t.matrix;}
 buildTile(tx,tz){
  const key=tx+","+tz,records=[];
  for(let iz=tz*10;iz<(tz+1)*10;iz++)for(let ix=tx*10;ix<(tx+1)*10;ix++){
   const p=forestFloorAt(this.world,ix,iz,this.excluded);if(!p)continue;
   const pool=this.pools.get(p.kind);if(pool.records.length>=pool.mesh.instanceMatrix.count)continue;
   p.slot=pool.records.length;p.tile=key;pool.records.push(p);pool.mesh.setMatrixAt(p.slot,this.matrix(p));pool.dirty=true;records.push(p);
  }
  this.tiles.set(key,{tx,tz,records});this.revision++;return records;
 }
 removeTile(key){
  const tile=this.tiles.get(key);if(!tile)return;
  for(const p of tile.records){
   const pool=this.pools.get(p.kind),last=pool.records.pop();if(last!==p){pool.records[p.slot]=last;last.slot=p.slot;pool.mesh.setMatrixAt(p.slot,this.matrix(last));}pool.dirty=true;
  }
  this.tiles.delete(key);this.revision++;
 }
 update(camera){
  const p=camera.position,anchor=Math.floor(p.x/12)+","+Math.floor(p.z/12);
  this.group.visible=p.y-this.world.surface.heightAt(p.x,p.z)<150;if(!this.group.visible)return;
  if(anchor!==this.anchor){
   this.anchor=anchor;const pending=[],sourceRange=FOREST_FLOOR.range+SHORE_PLANT_MAX_SHIFT;
   for(const [key,t]of this.tiles)if(Math.hypot((t.tx+.5)*24-p.x,(t.tz+.5)*24-p.z)>FOREST_FLOOR.range+40)this.removeTile(key);
   for(let tz=Math.floor((p.z-sourceRange)/24);tz<=Math.floor((p.z+sourceRange)/24);tz++)for(let tx=Math.floor((p.x-sourceRange)/24);tx<=Math.floor((p.x+sourceRange)/24);tx++){
    const d=Math.hypot((tx+.5)*24-p.x,(tz+.5)*24-p.z);if(d<sourceRange+17&&!this.tiles.has(tx+","+tz))pending.push({tx,tz,d});
   }
   this.queue=pending.sort((a,b)=>a.d-b.d);for(const pool of this.pools.values())pool.boundsDirty=true;
  }
  let built=0;const start=performance.now();
  while(this.queue.length&&built<2){const q=this.queue.shift();this.buildTile(q.tx,q.tz);built++;if(performance.now()-start>1.5)break;}
  let triangles=0;
  for(const pool of this.pools.values()){
   pool.mesh.count=pool.records.length;
   if(pool.dirty){pool.mesh.instanceMatrix.needsUpdate=true;pool.boundsDirty=true;pool.dirty=false;}
   if(pool.boundsDirty){if(this.bounds)this.bounds(pool.mesh,pool.records,p,pool.range,18);else{pool.mesh.computeBoundingSphere();if(pool.mesh.boundingSphere)pool.mesh.boundingSphere.radius+=1;}pool.boundsDirty=false;}
   triangles+=pool.records.length*(pool.mesh.geometry.index?.count??pool.mesh.geometry.attributes.position.count)/3;
  }
  if(this.shoreStatsRevision!==this.revision){
   let moved=0,unresolved=0;for(const pool of this.pools.values())for(const root of pool.records){moved+=+!!root.shoreMove;unresolved+=+!!root.shoreUnresolved;}
   this.stats.shorePlantsMoved=moved;this.stats.shorePlantsUnresolved=unresolved;this.shoreStatsRevision=this.revision;
  }
  Object.assign(this.stats,{shrubs:this.pools.get("shrub").records.length,sedges:this.pools.get("sedge").records.length,ferns:this.pools.get("fern").records.length,deadwood:this.pools.get("deadwood").records.length,stones:this.pools.get("stone").records.length,pending:this.queue.length,triangles,builtThisFrame:built,revision:this.revision,chunks:this.tiles.size});
 }
 dispose(){for(const p of this.pools.values()){p.mesh.geometry.dispose();p.mesh.material.dispose();p.mesh.customDepthMaterial?.dispose();p.mesh.dispose();}this.group.clear();this.tiles.clear();this.queue=[];}
}
