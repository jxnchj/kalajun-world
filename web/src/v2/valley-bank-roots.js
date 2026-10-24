import {projectRiverSection,riverSectionAt} from './river-section.js';
const cache=new WeakMap(),smooth=(a,b,x)=>{const t=Math.max(0,Math.min(1,(x-a)/(b-a)));return t*t*(3-2*t);};
// Logical source IDs stay in their original cells. A broad, fixed-world bank
// deformation follows the same source/new sections as water and terrain. It is
// not camera-dependent reseeding and never shrinks leaf size or source density.
export function valleyBankContext(world){
 if(cache.has(world))return cache.get(world);
 const hydro=world.hydrology,source=hydro?.valleySource;
 if(!source||!hydro.stats.valleyMeanders.nodes){cache.set(world,null);return null;}
 const oldById=new Map(source.segments.map(s=>[s.id,s])),pairs=hydro.segments.filter(s=>(s.meander||s.a.bankShape?.bedWeight>0||s.b.bankShape?.bedWeight>0)&&s.lineId===hydro.stats.valleyMeanders.lineId).map(s=>({current:s,source:oldById.get(s.id)}));
 const bounds=pairs.reduce((b,p)=>({minX:Math.min(b.minX,p.source.bounds.minX-24),maxX:Math.max(b.maxX,p.source.bounds.maxX+24),minZ:Math.min(b.minZ,p.source.bounds.minZ-24),maxZ:Math.max(b.maxZ,p.source.bounds.maxZ+24)}),{minX:Infinity,maxX:-Infinity,minZ:Infinity,maxZ:-Infinity});
 const locate=(x,z)=>{if(x<bounds.minX||x>bounds.maxX||z<bounds.minZ||z>bounds.maxZ)return null;let best=null,score=Infinity;for(const pair of pairs){const b=pair.source.bounds;if(x<b.minX-24||x>b.maxX+24||z<b.minZ-24||z>b.maxZ+24)continue;const a=pair.source.a,bn=pair.source.b,dx=bn.x-a.x,dz=bn.z-a.z,t=Math.max(0,Math.min(1,((x-a.x)*dx+(z-a.z)*dz)/(dx*dx+dz*dz)));const p=projectRiverSection(x,z,pair.source,t);const along=(x-p.x)*p.section.fx+(z-p.z)*p.section.fz;if(Math.abs(along)>.001||p.distance>p.section.outer+24)continue;if(p.distance<score){score=p.distance;best={...pair,...p};}}return best;};
 const sourceHeight=(x,z)=>{if(!locate(x,z))return world.surface.heightAt(x,z);const base=world.surface.uncarvedHeightAt(x,z);return world.surface.heightAt(x,z)+source.bedHeightAt(x,z,base)-hydro.bedHeightAt(x,z,base);};
 const sourceWorld={...world,hydrology:source,surface:{...world.surface,heightAt:sourceHeight,normalAt(x,z,step=2){const xh=sourceHeight(x-step,z)-sourceHeight(x+step,z),zh=sourceHeight(x,z-step)-sourceHeight(x,z+step),y=2*step,l=Math.hypot(xh,y,zh);return{x:xh/l,y:y/l,z:zh/l};}}};
 // This world already selects the pre-meander valley surface. The forest
 // selector copied from world points at the post-meander valley and would
 // override sourceHeight in _grassAt, then map those roots a second time.
 // Outside this valley sourceHeight already retains the current world surface.
 delete sourceWorld.forestShoulderSourceWorld;
 source.bindSurface(sourceHeight);
 const context={sourceWorld,locate,map(root){const q=locate(root.x,root.z);if(!q)return root;const old=q.section,next=riverSectionAt(q.current,q.t),side=q.signed<0?-1:1,half=side<0?old.left:old.right,newHalf=side<0?next.left:next.right;
   const weight=1-smooth(old.outer+4,old.outer+24,q.distance),distance=side*(newHalf+q.distance-half),tx=next.x-next.fz*distance,tz=next.z+next.fx*distance;
   const x=root.x+(tx-root.x)*weight,z=root.z+(tz-root.z)*weight;return{...root,x,z,y:world.surface.heightAt(x,z)+(root.y-sourceHeight(root.x,root.z)),valleySource:{x:root.x,y:root.y,z:root.z}};
 }};cache.set(world,context);return context;
}
