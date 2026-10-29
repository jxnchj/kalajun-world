import * as THREE from 'three';

// Review-only visibility proposal for original ordinary grass. No density,
// distance exit, per-leaf threshold or terrain-root occlusion assumption.
// RGBA wind field is normalized to [0,1]; all source wind weights are retained.
export function meadowWindBox41(geometry){
 geometry.computeBoundingBox();const box=geometry.boundingBox.clone(),wind=geometry.attributes.aPlantWind;
 let x=0,y=0;for(let i=0;i<wind.count;i++){x=Math.max(x,Math.abs(wind.getX(i)));y=Math.max(y,Math.abs(wind.getY(i)));}
 // |current+returning|<=1.32, flex<=1.25, |eddy|<=.5,
 // |local|<=.5. Triangle inequality includes longitudinal and lateral force.
 const offset=1.32*.23*1.25*x*x+(.10+.006)*y+.5*.045*1.25*x*x;
 box.min.x-=offset;box.max.x+=offset;box.min.z-=offset;box.max.z+=offset;
 box.min.y-=offset*offset*.55;
 return box;
}
export function meadowRootBoxes41(geometry,roots,matrixForRoot){
 const local=meadowWindBox41(geometry);
 return roots.map((root,index)=>{
  const box=local.clone().applyMatrix4(matrixForRoot(root,index));
  // Float32 GPU multiply/add can differ from the CPU boundary by a few ulps.
  const magnitude=Math.max(...box.min.toArray().map(Math.abs),...box.max.toArray().map(Math.abs));
  return box.expandByScalar(magnitude*2**-20+1e-5);
 });
}
export function visibleMeadowRoots41(boxes,frusta,target=[]){
 target.length=0;
 for(let i=0;i<boxes.length;i++)if(frusta.some(f=>f.intersectsBox(boxes[i])))target.push(i);
 return target;
}
// Classify the complete wind-expanded tile first. Only boundary tiles need
// individual root tests; interior tiles keep their original order/buffers.
export function meadowTileVisibility41(tileBox,boxes,frusta,target=[]){
 target.length=0;
 let intersects=false;
 for(const frustum of frusta){
  if(!frustum.intersectsBox(tileBox))continue;
  intersects=true;
  const inside=frustum.planes.every(p=>p.normal.x*(p.normal.x>=0?tileBox.min.x:tileBox.max.x)+p.normal.y*(p.normal.y>=0?tileBox.min.y:tileBox.max.y)+p.normal.z*(p.normal.z>=0?tileBox.min.z:tileBox.max.z)+p.constant>=0);
  if(inside)return {mode:'full',count:boxes.length,indices:null};
 }
 if(!intersects)return {mode:'outside',count:0,indices:target};
 visibleMeadowRoots41(boxes,frusta,target);
 return {mode:'boundary',count:target.length,indices:target};
}
