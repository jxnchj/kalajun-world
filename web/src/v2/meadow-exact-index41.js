// Explicit render-only candidate. Ordinary meadow wind position depends on position,
// aPlantWind and root state. UV/normal/color never displace these leaves.
// Remove only a primitive with a duplicated deformation input, not a small
// triangle, collinear triangle, low-coverage leaf, or hidden-root assumption.
export function compactMeadowLeafIndex41(source){
 if(!source?.index||!source.attributes?.position||!source.attributes?.aPlantWind)throw new TypeError('Exact meadow compaction requires indexed position and wind');
 if(source.groups.length||source.drawRange.start!==0||source.drawRange.count!==Infinity||Object.keys(source.morphAttributes).length)throw Error('Exact meadow compaction expects the complete unmorphed single material source');
 const inputs=[source.attributes.position,source.attributes.aPlantWind];
 if(inputs.some(a=>a.itemSize!==3||a.count!==inputs[0].count))throw Error('Meadow deformation input layout changed');
 const identical=(a,b)=>inputs.every(attr=>{for(let c=0;c<attr.itemSize;c++)if(!Object.is(attr.array[a*attr.itemSize+c],attr.array[b*attr.itemSize+c]))return false;return true;});
 const kept=[],removed=[];
 for(let i=0;i<source.index.count;i+=3){const a=source.index.getX(i),b=source.index.getX(i+1),c=source.index.getX(i+2);if(identical(a,b)||identical(b,c)||identical(c,a))removed.push(i/3);else kept.push(a,b,c);}
 const geometry=source.clone();geometry.setIndex(new source.index.constructor(new source.index.array.constructor(kept),1));
 // Keep source normals (including their original neighbouring contributions),
 // UVs, colours, wind weights and every vertex exactly; never recompute them.
 geometry.userData={...geometry.userData,meadowExactIndex41:{sourceTriangles:source.index.count/3,triangles:kept.length/3,removedTriangles:removed}};
 return{geometry,sourceTriangles:source.index.count/3,triangles:kept.length/3,removedTriangles:removed};
}
