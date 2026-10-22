import * as THREE from "three";
import {transformWorldBox} from "./world-box-transform.js";

// Only reuse the exact transformed box. Bounds, wind margins and frustum policy
// stay with their existing owners. Experimental opt-in: boundsCache=1.
export const worldBoundsCacheControl={enabled:new URLSearchParams(globalThis.location?.search||"").get("boundsCache")==="1",
  stats:{queries:0,recomputes:0,reuses:0}};
export class WorldBoundsCache {
  constructor(control=worldBoundsCacheControl){
    this.control=control;this.box=new THREE.Box3();this.values=new Float64Array(22);this.valid=false;
    this.stats={queries:0,recomputes:0,reuses:0};
  }
  get(source,matrix){
    const e=matrix.elements,v=this.values,s=this.stats,g=this.control.stats;
    s.queries++;if(g)g.queries++;
    if(!this.control.enabled){this.valid=false;s.recomputes++;if(g)g.recomputes++;return transformWorldBox(this.box,source,matrix);}
    // Check values on EVERY query, including in-place edits and object swaps.
    // Object identity and matrixWorldNeedsUpdate cannot prove either is fresh.
    let same=this.valid&&this.control.enabled;
    if(same){for(let i=0;i<16;i++)if(v[i]!==e[i]){same=false;break;}}
    if(same)same=v[16]===source.min.x&&v[17]===source.min.y&&v[18]===source.min.z
      &&v[19]===source.max.x&&v[20]===source.max.y&&v[21]===source.max.z;
    if(same){s.reuses++;if(g)g.reuses++;return this.box;}
    transformWorldBox(this.box,source,matrix);s.recomputes++;if(g)g.recomputes++;
    for(let i=0;i<16;i++)v[i]=e[i];
    v[16]=source.min.x;v[17]=source.min.y;v[18]=source.min.z;
    v[19]=source.max.x;v[20]=source.max.y;v[21]=source.max.z;
    this.valid=this.control.enabled;return this.box;
  }
}
