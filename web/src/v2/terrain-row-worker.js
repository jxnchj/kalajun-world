import {createWorldData} from './world-data.js';
import {createTerrainRowKernel,terrainRowBuffers} from './terrain-row-kernel.js';
let kernel;
self.onmessage=({data})=>{
  try {
    if(data.type==='init') {kernel?.dispose();kernel=createTerrainRowKernel(createWorldData(data.inputs));self.postMessage({type:'ready'});return;}
    if(data.type!=='build'||!kernel)throw new Error('Terrain worker not initialized');
    const start=performance.now(),payload=kernel.build(data.input);
    self.postMessage({type:'result',id:data.id,payload,ms:performance.now()-start},terrainRowBuffers(payload));
  }catch(error){self.postMessage({type:'error',id:data.id,message:String(error?.stack||error)});}
};
