import * as T from 'three';
import {boardwalkTimber,timberGeometry} from './boardwalk-timber.js';
import {createPlantGeometryCollider,plantIntersectsStone,placedSlabs} from './shore-contact.js';
const phase=id=>{let h=2166136261;for(const c of id)h=Math.imul(h^c.charCodeAt(0),16777619);return(h>>>0)/4294967296;};
export class BoardwalkPlantContact39 {
 constructor(world,{indexed=new URLSearchParams(globalThis.location?.search||'').get('boardwalkContactIndex74')==='1',enabled=new URLSearchParams(globalThis.location?.search||'').get('boardwalkPlantContact39')!=='0'}={}){this.world=world;this.enabled=enabled;this.indexed=indexed;this.colliderBins74=new Map();this.route=null;this.routes=[];this.routeColliders=new Map();this.stats={enabled,moved:0,unresolved:0};if(enabled){this.routes=boardwalkTimber(world).routes;this.route=this.routes.find(r=>r.index===3)||null;}}
 ensure(route){if(this.routeColliders.has(route.index))return this.routeColliders.get(route.index);const geometries=new Map(),colliders=route.pieces.map((p,index)=>{if(!geometries.has(p.kind))geometries.set(p.kind,timberGeometry(p.kind));return{...createPlantGeometryCollider(geometries.get(p.kind),p.matrix),kind:p.kind,index,routeIndex:route.index};});for(const g of geometries.values())g.dispose();this.routeColliders.set(route.index,colliders);return colliders;}
 candidates74(route,root,r){
  const colliders=this.ensure(route);if(!this.indexed)return colliders;
  let cached=this.colliderBins74.get(route.index);
  if(!cached||cached.source!==colliders){const bins=new Map();for(const c of colliders){const b=c.box;for(let x=Math.floor(b.min.x/4);x<=Math.floor(b.max.x/4);x++)for(let z=Math.floor(b.min.z/4);z<=Math.floor(b.max.z/4);z++){const key=x+','+z;if(!bins.has(key))bins.set(key,[]);bins.get(key).push(c);}}cached={source:colliders,bins};this.colliderBins74.set(route.index,cached);}
  const found=new Set();for(let x=Math.floor((root.x-r)/4);x<=Math.floor((root.x+r)/4);x++)for(let z=Math.floor((root.z-r)/4);z<=Math.floor((root.z+r)/4);z++)for(const c of cached.bins.get(x+','+z)||[])found.add(c);
  // Broad phase only; preserve native collider order and exact swept tests.
  return [...found].sort((a,b)=>a.index-b.index);
 }
 hits(root,envelope){let placed=null;const hits=[],r=envelope.radius*(root.s??1);for(const route of this.routes){const b=route.bounds;if(root.x+r<b.min.x||root.x-r>b.max.x||root.z+r<b.min.z||root.z-r>b.max.z)continue;for(const c of this.candidates74(route,root,r)){if(this.indexed){const b=c.box;if(root.x+r<b.min.x||root.x-r>b.max.x||root.z+r<b.min.z||root.z-r>b.max.z)continue;placed??=placedSlabs(root,envelope);}if(plantIntersectsStone(root,envelope,c,placed))hits.push(c);}}return hits;}
 intersects(root,envelope){return this.hits(root,envelope).length>0;}
 relocate(root,envelope,suitable=()=>true){if(!root)return root;const hits=this.hits(root,envelope);if(!hits.length)return root;const originalHits=hits.filter(c=>!this.routes.find(r=>r.index===c.routeIndex)?.extension);const touched=new Set((originalHits.length?originalHits:hits).map(c=>c.routeIndex));const route=this.routes.filter(r=>touched.has(r.index)).reduce((best,r)=>Math.min(...r.steps.map(s=>Math.hypot(s.x-root.x,s.z-root.z)))<Math.min(...best.steps.map(s=>Math.hypot(s.x-root.x,s.z-root.z)))?r:best);const step=route.steps.reduce((best,s)=>Math.hypot(s.x-root.x,s.z-root.z)<Math.hypot(best.x-root.x,best.z-root.z)?s:best),offset=root.y-this.world.surface.heightAt(root.x,root.z),side=(root.x-step.x)*step.nx+(root.z-step.z)*step.nz>=0?1:-1;
 // Search nearest side first, in short longitudinal offsets. Only conflicted roots move.
 const longitudinal=Math.max(-step.run*.45,Math.min(step.run*.45,(root.x-step.x)*step.fx+(root.z-step.z)*step.fz));
 for(const margin of [.08,.2,.35,.55,.8,1.1,1.45,1.85,2.3])for(const along of [0,.18,-.18,.38,-.38,.65,-.65])for(const sign of [side,-side]){const across=sign*(route.width/2+margin+phase(root.id)*.08),x=step.x+step.nx*across+step.fx*(along+longitudinal),z=step.z+step.nz*across+step.fz*(along+longitudinal),d=Math.hypot(x-root.x,z-root.z);if(d>4.8)continue;const moved={...root,x,z,y:this.world.surface.heightAt(x,z)+offset};if(!Number.isFinite(moved.y)||this.intersects(moved,envelope)||!suitable(moved))continue;this.stats.moved++;return{...moved,boardwalkMove:d};}
 this.stats.unresolved++;throw Error('Boardwalk vegetation has no valid side seat: '+root.id);
 }
}
