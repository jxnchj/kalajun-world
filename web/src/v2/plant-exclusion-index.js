// World entity membership is fixed for a WorldEcology lifetime. Pre-expand
// each query cell's original 3x3 source neighborhood once, preserving its order.
// These are entity references, not approximate footprints or cached booleans.
export function buildExclusionNeighborhoods(source){
 const queryCells=new Map(),result=new Map();
 for(const key of source.keys()){
  const [x,z]=key.split(',').map(Number);
  for(let dz=-1;dz<=1;dz++)for(let dx=-1;dx<=1;dx++)queryCells.set((x+dx)+','+(z+dz),[x+dx,z+dz]);
 }
 for(const [key,[x,z]] of queryCells){
  const rows=[];
  for(let dz=-1;dz<=1;dz++)for(let dx=-1;dx<=1;dx++)for(const e of source.get((x+dx)+','+(z+dz))||[])rows.push(e);
  if(rows.length)result.set(key,rows);
 }
 return result;
}
