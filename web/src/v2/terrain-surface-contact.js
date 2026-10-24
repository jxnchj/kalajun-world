// Read-only rendered contact. Logical quadtree leaves remain authoritative even
// when submission batching temporarily hides their source Mesh objects.
const contains=(n,x,z)=>x>=n.x&&z>=n.z&&x<=n.x+n.size&&z<=n.z+n.size;
function leafAt(terrain,x,z){
 let node=terrain.roots.find(n=>contains(n,x,z));
 while(node?.split&&node.children){const child=node.children.find(n=>!n.dead&&contains(n,x,z));if(!child)break;node=child;}
 return node&&!node.dead&&node.mesh?node:null;
}
function signature(node){const mesh=node.mesh,g=mesh.geometry;return {node,mesh,geometry:g,positionBuffer:g.attributes.position,indexBuffer:g.index,position:g.attributes.position.version,index:g.index.version,morph:[...(mesh.morphTargetInfluences||[])]};}
function stale(s){const n=s.node,m=n.mesh,g=m?.geometry;return n.dead||n.split||m!==s.mesh||g!==s.geometry||g.attributes.position!==s.positionBuffer||g.index!==s.indexBuffer||g.attributes.position.version!==s.position||g.index.version!==s.index||(m.morphTargetInfluences||[]).length!==s.morph.length||(m.morphTargetInfluences||[]).some((v,i)=>v!==s.morph[i]);}
function heightOf(mesh,index){const g=mesh.geometry,p=g.attributes.position;let y=p.getY(index);for(let i=0;i<(g.morphAttributes.position?.length||0);i++){const weight=mesh.morphTargetInfluences?.[i]||0;if(weight)y+=(g.morphAttributes.position[i].getY(index)-(g.morphTargetsRelative?0:p.getY(index)))*weight;}return y+mesh.position.y;}
export function createTerrainSurfaceContact(terrain){
 function sample(x,z){
  const node=leafAt(terrain,x,z);if(!node)return null;
  const mesh=node.mesh,g=mesh.geometry,spacing=mesh.userData.terrainTile.spacing,grid=Math.round(node.size/spacing);
  const u=Math.min(grid-1e-9,Math.max(0,(x-node.x)/spacing)),v=Math.min(grid-1e-9,Math.max(0,(z-node.z)/spacing));
  const ix=Math.floor(u),iz=Math.floor(v),offset=(iz*grid+ix)*6,p=g.attributes.position;
  // Read the actual two indices, including centre-chosen and morph-aligned diagonals.
  for(let tri=0;tri<2;tri++){
   const ids=[0,1,2].map(k=>g.index.getX(offset+tri*3+k)),[a,b,c]=ids;
   const ax=p.getX(a)+mesh.position.x,az=p.getZ(a)+mesh.position.z,bx=p.getX(b)+mesh.position.x,bz=p.getZ(b)+mesh.position.z,cx=p.getX(c)+mesh.position.x,cz=p.getZ(c)+mesh.position.z;
   const det=(bz-cz)*(ax-cx)+(cx-bx)*(az-cz),wa=((bz-cz)*(x-cx)+(cx-bx)*(z-cz))/det,wb=((cz-az)*(x-cx)+(ax-cx)*(z-cz))/det,wc=1-wa-wb;
   if(Math.min(wa,wb,wc)<-1e-6)continue;
   return {height:wa*heightOf(mesh,a)+wb*heightOf(mesh,b)+wc*heightOf(mesh,c),spacing,node,mesh,triangle:ids,weights:[wa,wb,wc],morphing:mesh.morphTargetInfluences?.some(v=>v!==0)||false};
  }
  return null;
 }
 return {sample,bind(points){let dependencies=[];
  function samples(){const values=points.map(p=>sample(p.x,p.z));dependencies=[...new Set(values.filter(Boolean).map(v=>v.node))].map(signature);return values;}
  return {samples,changed:()=>dependencies.length===0||dependencies.some(stale)};
 }};
}
