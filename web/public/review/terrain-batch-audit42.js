// Read-only actual resident output audit. Never calls update or modifies buffers.
export function auditTerrainBatchGeometry42(app){
 const b=(app.debug??app).terrain.submissionBatches;const out={groups:b.records.size,vertices:0,indices:0,positionComponents:0,positionDifferent:0,maxWorldPositionError:0,attributeComponents:0,attributeDifferent:0,indexDifferent:0,materialDifferent:0,drawStateDifferent:0,rebasedLocalComponents:0};
 for(const r of b.records.values()){
  let vertexOffset=0,indexOffset=0;const batch=r.mesh,g=batch.geometry;
  for(const m of r.sources){const src=m.geometry;
   if(m.material!==batch.material||m.customDepthMaterial!==batch.customDepthMaterial)out.materialDifferent++;
   for(const key of ['castShadow','receiveShadow','renderOrder','frustumCulled'])if(m[key]!==batch[key])out.drawStateDifferent++;
   if(m.layers.mask!==batch.layers.mask)out.drawStateDifferent++;
   for(const [name,a]of Object.entries(src.attributes)){const dst=g.attributes[name];
    if(!dst||dst.itemSize!==a.itemSize||dst.normalized!==a.normalized||dst.gpuType!==a.gpuType||dst.array.constructor!==a.array.constructor)throw Error('Attribute contract mismatch '+name);
    for(let i=0;i<a.array.length;i++){const actual=dst.array[vertexOffset*a.itemSize+i],expected=a.array[i];
     if(name==='position'){const axis=['x','y','z'][i%3],error=Math.abs((actual+batch.position[axis])-(expected+m.position[axis]));out.positionComponents++;if(error){out.positionDifferent++;out.maxWorldPositionError=Math.max(error,out.maxWorldPositionError);}if(actual!==expected)out.rebasedLocalComponents++;}
     else{out.attributeComponents++;if(actual!==expected)out.attributeDifferent++;}
    }
   }
   for(const index of src.index.array){out.indices++;if(g.index.array[indexOffset++]!==index+vertexOffset)out.indexDifferent++;}
   vertexOffset+=src.attributes.position.count;out.vertices+=src.attributes.position.count;
  }
  if(indexOffset!==g.index.count||vertexOffset!==g.attributes.position.count)throw Error('Primitive count mismatch');
 }
 out.note='World-position comparison uses stored Float32 vertices plus authored translations in Float64; does not establish GPU matrix operation/raster equivalence. Index order is exact within each sibling group; global object sorting may change.';return out;
}
