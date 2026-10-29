import * as T from 'three';
export function ecologyCollision41Enabled(search=globalThis.location?.search||'',sourceAvailable=true){const explicit=new URLSearchParams(search).get('ecologyCollision41');if(explicit==='1'&&!sourceAvailable)throw Error('ecologyCollision41 requires the live WorldEcology source');return explicit!=='0'&&sourceAvailable;}
// Extract the authored connected trunk, not its foliage AABB or a guessed radius.
// Position welding only recovers connectivity across UV/normal seams; positions
// and every retained triangle remain exact. Twig components do not share vertices.
export function extractRootedTrunk41(geometry){
 const a=geometry.attributes.position,index=geometry.index,count=index?.count??a.count,canonical=new Map(),keys=[],adj=new Map(),vertices=[];let footRadius=Infinity,start=null;
 for(let i=0;i<a.count;i++){const p=[a.getX(i),a.getY(i),a.getZ(i)],key=p.map(v=>Math.round(v*1e5)).join(',');keys[i]=key;if(!canonical.has(key))canonical.set(key,p);if(Math.abs(p[1]+.25)<1e-5&&Math.hypot(p[0],p[2])<footRadius){footRadius=Math.hypot(p[0],p[2]);start=key;}}
 for(let i=0;i<count;i+=3){const ids=[0,1,2].map(j=>index?index.getX(i+j):i+j),ks=ids.map(j=>keys[j]);for(const k of ks){if(!adj.has(k))adj.set(k,new Set());for(const n of ks)adj.get(k).add(n);}}
 const reached=new Set([start]),queue=[start];for(let i=0;i<queue.length;i++)for(const n of adj.get(queue[i])??[])if(!reached.has(n)){reached.add(n);queue.push(n);}
 for(let i=0;i<count;i+=3){const ids=[0,1,2].map(j=>index?index.getX(i+j):i+j);if(ids.every(j=>reached.has(keys[j])))for(const j of ids)vertices.push(a.getX(j),a.getY(j),a.getZ(j));}
 const g=new T.BufferGeometry();g.setAttribute('position',new T.Float32BufferAttribute(vertices,3));g.computeBoundingBox();const b=g.boundingBox;
 if(vertices.length!==192*9||b.min.y>-.2||b.max.y<17||b.max.x-b.min.x>2||b.max.z-b.min.z>2){g.dispose();throw Error('Original 192-face rooted spruce trunk changed; audit source before collision');}return g;
}
export class EcologySolids41{
 constructor(ecology,{enabled=ecologyCollision41Enabled(undefined,!!ecology)}={}){this.enabled=enabled;this.ecology=ecology;this.shapes=new Map();this.bodies=new Map();this.cell=null;this.stats={enabled,ready:false,active:0,triangles:0,queries:0,syncs:0,lastSyncMs:0,preparationMs:0,source:'same ecology.treeAt and full original high bark rooted component; LOD/wind independent'};if(enabled&&!ecology)throw Error('ecologyCollision41 requires the live WorldEcology source');}
 prepare(){if(!this.enabled||this.stats.ready)return;const start=performance.now(),parts=this.ecology.nearParts.filter(p=>p.mode===5&&/bark/.test(p.mesh.material.name));if(parts.length!==5)throw Error('ecologyCollision41 requires five loaded original high bark variants');for(const p of parts)this.shapes.set(p.variant,extractRootedTrunk41(p.mesh.geometry));this.stats.ready=true;this.stats.preparationMs=performance.now()-start;}
 sync(c,position,force=false){if(!this.enabled)return;this.prepare();const cell=Math.floor(position.x/4)+','+Math.floor(position.z/4);if(!force&&cell===this.cell)return;this.cell=cell;const started=performance.now(),reach=36+(this.ecology.forestLayout.maxShift??18),matrix=new T.Matrix4(),point=new T.Vector3();
  for(let iz=Math.floor((position.z-reach)/12);iz<=Math.floor((position.z+reach)/12);iz++)for(let ix=Math.floor((position.x-reach)/12);ix<=Math.floor((position.x+reach)/12);ix++){this.stats.queries++;const root=this.ecology.treeAt(ix,iz);if(!root||this.bodies.has(root.id)||Math.hypot(root.x-position.x,root.z-position.z)>36)continue;const geometry=this.shapes.get(root.variant),a=geometry.attributes.position,vertices=new Float32Array(a.count*3),indices=new Uint32Array(a.count);matrix.compose(new T.Vector3(root.x,root.y,root.z),new T.Quaternion().setFromAxisAngle(new T.Vector3(0,1,0),root.rot),new T.Vector3(root.s,root.sy??root.s,root.s));
   for(let j=0;j<a.count;j++){point.fromBufferAttribute(a,j).applyMatrix4(matrix).sub(c.origin);vertices[j*3]=point.x;vertices[j*3+1]=point.y;vertices[j*3+2]=point.z;indices[j]=j;}const body=c.physics.createCollider(c.R.ColliderDesc.trimesh(vertices,indices));this.bodies.set(root.id,{body,root:{...root}});
  }
  for(const[id,entry]of this.bodies)if(Math.hypot(entry.root.x-position.x,entry.root.z-position.z)>48){c.physics.removeCollider(entry.body,true);this.bodies.delete(id);}this.stats.active=this.bodies.size;this.stats.triangles=this.bodies.size*192;this.stats.syncs++;this.stats.lastSyncMs=performance.now()-started;
 }
 clear(c){for(const e of this.bodies.values())c.physics.removeCollider(e.body,true);this.bodies.clear();this.cell=null;this.stats.active=this.stats.triangles=0;}
 dispose(c){if(c.physics)this.clear(c);for(const g of this.shapes.values())g.dispose();this.shapes.clear();this.stats.ready=false;}
}
