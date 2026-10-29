import * as T from 'three';
import data from './generated/pasture-life-contact41.json' with {type:'json'};
import {plantIntersectsStone} from './shore-contact.js';
import {pastureLife41Available,pastureLife41Site} from './pasture-life41.js';
import {selectPasture} from './pasture.js';
const phase=id=>{let h=2166136261;for(const c of id)h=Math.imul(h^c.charCodeAt(0),16777619);return(h>>>0)/4294967296;};
// Separate physical parts retain the empty space between the rack and trough.
// Slabs are exported from the editable source which produces the shipped GLB.
export class PasturePlantContact41 {
 constructor(world,{enabled=pastureLife41Available(world)}={}){this.world=world;this.enabled=enabled;this.colliders=[];this.bounds=new T.Box3();this.stats={enabled,moved:0,unresolved:0};if(!enabled)return;this.site=pastureLife41Site(world,selectPasture(world));const p=this.site;for(const part of data.parts){const box=new T.Box3(new T.Vector3(...part.min),new T.Vector3(...part.max)).translate(new T.Vector3(p.x,p.y,p.z)),slabs=part.slabs.map(s=>({...s,lo:s.lo+p.y,hi:s.hi+p.y,polygon:s.polygon.map(v=>[v[0]+p.x,v[1]+p.z])}));this.colliders.push({box,slabs,name:part.name});this.bounds.union(box);}}
 intersects(root,envelope){if(!root||!this.enabled)return false;const r=envelope.radius*(root.s??1),b=this.bounds;if(root.x+r<b.min.x||root.x-r>b.max.x||root.z+r<b.min.z||root.z-r>b.max.z)return false;return this.colliders.some(c=>plantIntersectsStone(root,envelope,c));}
 relocate(root,envelope,suitable=()=>true){if(!this.intersects(root,envelope))return root;const offset=root.y-this.world.surface.heightAt(root.x,root.z),angle=phase(root.id)*Math.PI*2;
 // Nearest-first radial seats conserve the original root identity and scale;
 // individual-part tests allow grass in genuinely usable gaps, not a bare ring.
 for(const distance of [.12,.24,.4,.6,.85,1.1,1.4,1.8,2.3,3,3.8,4.8])for(let k=0;k<32;k++){const a=angle+k*Math.PI/16,x=root.x+Math.sin(a)*distance,z=root.z+Math.cos(a)*distance,moved={...root,x,z,y:this.world.surface.heightAt(x,z)+offset};if(!Number.isFinite(moved.y)||this.intersects(moved,envelope)||!suitable(moved))continue;this.stats.moved++;return{...moved,pastureLifeMove:distance};}
 this.stats.unresolved++;throw Error('Pasture vegetation has no valid adjacent seat: '+root.id);
 }
}
