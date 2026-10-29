// Explicit pre-designed-reach material baseline for historical A/B contracts.
// The override is scoped to construction; live uniform tests keep original limits.
import {createTerrainMaterial} from '../terrain-material.js';
export function createLegacyTerrainMaterial(){
 const had=Object.hasOwn(globalThis,'location'),previous=globalThis.location;
 const query=new URLSearchParams(previous?.search||'');query.set('forestReach39','0');
 try{globalThis.location={search:'?'+query};return createTerrainMaterial();}
 finally{if(had)globalThis.location=previous;else delete globalThis.location;}
}
