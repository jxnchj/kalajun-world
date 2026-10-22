// A placement heuristic within the supplied forest mask, not a surveyed stand.
// Source membership, IDs and tree appearance remain the v14 treeAt contract.
export const FOREST_LAYOUT=Object.freeze({maxShift:18,minSpacing:2.6,cell:12,tileCells:32,cacheTiles:192,fieldNodes:8192});
const clamp=x=>Math.max(0,Math.min(1,x));
const smooth=x=>{const q=clamp(x);return q*q*(3-2*q);};
const FIELDS=Object.freeze([{size:80,amplitude:6,angle:0,ox:.317,oz:.713,salt:311},{size:240,amplitude:12,angle:.61,ox:.529,oz:.193,salt:313}]);
export function forestLayoutMode(search=globalThis.location?.search||""){
 return new URLSearchParams(search).get("forestLayout")==="v14"?"v14":"v15";
}
export class ForestRootLayout {
 constructor(world,{originalAt,excluded,random,mode="v15",priorityFirst=new URLSearchParams(globalThis.location?.search||"").get("forestPriorityFirst")!=="0"}={}){
  if(typeof originalAt!=="function"||typeof excluded!=="function"||typeof random!=="function")throw new TypeError("Forest layout needs source roots, exclusions and stable random");
  if(mode!=="v14"&&mode!=="v15")throw new RangeError("Unknown forest layout mode");
  this.priorityFirst=priorityFirst;this.world=world;this.originalAt=originalAt;this.excluded=excluded;this.random=random;this.mode=mode;
  this.maxShift=mode==="v14"?0:FOREST_LAYOUT.maxShift;this.tiles=new Map();this.field=new Map();
  this.stats={mode,priorityFirst,skippedLowerPriority:0,maxShift:this.maxShift,minSpacing:FOREST_LAYOUT.minSpacing,proposals:0,resolved:0,moved:0,conflictFallbacks:0,habitatFallbacks:0,cachedCells:0,cachedTiles:0,fieldNodes:0,demSamples:0,coverSamples:0};
 }
 _raw(ix,iz){return {x:(ix+.15+.7*this.random(ix,iz,1))*12,z:(iz+.15+.7*this.random(ix,iz,2))*12};}
 _node(f,ix,iz){
  const key=f.salt+":"+ix+":"+iz;let value=this.field.get(key);if(value)return value;
  const c=Math.cos(f.angle),s=Math.sin(f.angle),gx=(ix-f.ox)*f.size,gz=(iz-f.oz)*f.size;
  const x=gx*c-gz*s,z=gx*s+gz*c,e=Math.min(96,f.size*.5),height=this.world.surface.geographicHeightAt||this.world.surface.heightAt;
  const h=height(x,z),w=height(x-e,z),east=height(x+e,z),n=height(x,z-e),south=height(x,z+e);
  const dx=(w-east)/(2*e),dz=(n-south)/(2*e),slope=Math.hypot(dx,dz),length=Math.hypot(dx,1,dz);
  const hollow=smooth((((w+east+n+south)*.25-h)/e+.008)/.078),shelter=1-smooth((dz/length+.38)/.76);
  const cx=this.world.landcoverAt(x+e,z).r-this.world.landcoverAt(x-e,z).r;
  const cz=this.world.landcoverAt(x,z+e).r-this.world.landcoverAt(x,z-e).r;
  const angle=this.random(ix,iz,f.salt)*Math.PI*2,regrowth=.85;
  let vx=Math.cos(angle)*regrowth+dx/Math.max(.12,slope)*.45+cx*.8;
  let vz=Math.sin(angle)*regrowth+dz/Math.max(.12,slope)*.45+cz*.8;
  // Terrain affects the direction and strength of small groups. No change in
  // tree height, root membership, shader colour or total forest density.
  const normalizer=Math.max(1,Math.hypot(vx,vz)),strength=.72+.18*hollow+.10*shelter;
  value=[vx/normalizer*strength,vz/normalizer*strength];
  if(this.field.size>=FOREST_LAYOUT.fieldNodes)this.field.delete(this.field.keys().next().value);
  this.field.set(key,value);this.stats.fieldNodes=this.field.size;this.stats.demSamples+=5;this.stats.coverSamples+=4;return value;
 }
 displacement(x,z){
  let dx=0,dz=0;
  for(const f of FIELDS){
   const c=Math.cos(f.angle),s=Math.sin(f.angle),gx=(x*c+z*s)/f.size+f.ox,gz=(-x*s+z*c)/f.size+f.oz;
   const ix=Math.floor(gx),iz=Math.floor(gz),u=smooth(gx-ix),v=smooth(gz-iz);
   for(let j=0;j<2;j++)for(let i=0;i<2;i++){
    const a=this._node(f,ix+i,iz+j),weight=(i?u:1-u)*(j?v:1-v)*f.amplitude;dx+=a[0]*weight;dz+=a[1]*weight;
   }
  }
  // Each interpolated vector has length <=1, so the sum is bounded by 6+12 m.
  return {x:dx,z:dz};
 }
 _clearOriginals(x,z,ix,iz){
  const gap=FOREST_LAYOUT.minSpacing;
  for(let j=Math.floor((z-gap)/12);j<=Math.floor((z+gap)/12);j++)for(let i=Math.floor((x-gap)/12);i<=Math.floor((x+gap)/12);i++){
   if(i===ix&&j===iz)continue;const p=this._raw(i,j);
   // Even unoccupied source cells are cheap conservative guards. This makes a
   // later neighbour fallback safe, independent of tile generation order.
   if(Math.hypot(x-p.x,z-p.z)<gap)return false;
  }
  return true;
 }
 _valid(source,x,z){
  const length=Math.hypot(x-source.x,z-source.z),steps=Math.max(1,Math.ceil(length/3));
  for(let i=1;i<=steps;i++){
   const px=source.x+(x-source.x)*i/steps,pz=source.z+(z-source.z)*i/steps;
   const cover=this.world.landcoverAt(px,pz);this.stats.coverSamples++;
   if(cover.r<.24||this.excluded(px,pz,3))return null;
  }
  const y=this.world.surface.heightAt(x,z);
  return Number.isFinite(y)&&y<=3300?y-.15:null;
 }
 _proposal(ix,iz){
  const tx=Math.floor(ix/32),tz=Math.floor(iz/32),key=tx+","+tz,slot=(iz-tz*32)*32+ix-tx*32;
  let tile=this.tiles.get(key);
  if(!tile){
   if(this.tiles.size>=FOREST_LAYOUT.cacheTiles){const first=this.tiles.keys().next().value;this.stats.cachedCells-=this.tiles.get(first).size;this.tiles.delete(first);}
   tile=new Map();this.tiles.set(key,tile);this.stats.cachedTiles=this.tiles.size;
  }else if(this.lastTile!==key){this.tiles.delete(key);this.tiles.set(key,tile);}
  this.lastTile=key;
  if(tile.has(slot))return tile.get(slot);
  const source=this.originalAt(ix,iz);
  if(!source){tile.set(slot,null);this.stats.cachedCells++;return null;}
  const result={source,target:source,ix,iz,priority:this.random(ix,iz,337),final:null};
  tile.set(slot,result);this.stats.cachedCells++;this.stats.proposals++;
  const d=this.displacement(source.x,source.z);
  for(const fraction of [1,.75,.5,.25]){
   const x=source.x+d.x*fraction,z=source.z+d.z*fraction;
   if(!this._clearOriginals(x,z,ix,iz))continue;
   const y=this._valid(source,x,z);if(y===null)continue;
   result.target={...source,x,y,z};return result;
  }
  this.stats.habitatFallbacks++;return result;
 }
 at(ix,iz){
  if(this.mode==="v14")return this.originalAt(ix,iz);
  const proposal=this._proposal(ix,iz);if(!proposal)return null;if(proposal.final)return proposal.final;
  const {source,target}=proposal;let result=target;
  if(target!==source){
   const reach=FOREST_LAYOUT.maxShift+FOREST_LAYOUT.minSpacing;
   outer:for(let j=Math.floor((target.z-reach)/12);j<=Math.floor((target.z+reach)/12);j++)for(let i=Math.floor((target.x-reach)/12);i<=Math.floor((target.x+reach)/12);i++){
    if(i===ix&&j===iz)continue;const raw=this._raw(i,j);
    if(Math.hypot(target.x-raw.x,target.z-raw.z)>reach)continue;
    // Only a higher-priority proposal can force this tree back to its source.
    // Random priority is pure and independent of habitat/placement. Reject the
    // other half before their source/terrain/cover queries, preserving the same
    // coordinate and tie comparison (no distance approximation or deleted tree).
    if(this.priorityFirst){
     const priority=this.random(i,j,337);
     if(!(priority<proposal.priority||(priority===proposal.priority&&(j<iz||(j===iz&&i<ix))))){this.stats.skippedLowerPriority++;continue;}
    }
    const other=this._proposal(i,j);if(!other||other.target===other.source)continue;
    const prior=other.priority<proposal.priority||(other.priority===proposal.priority&&(j<iz||(j===iz&&i<ix)));
    if(prior&&Math.hypot(target.x-other.target.x,target.z-other.target.z)<FOREST_LAYOUT.minSpacing){result=source;this.stats.conflictFallbacks++;break outer;}
   }
  }
  proposal.final=result;this.stats.resolved++;if(result!==source)this.stats.moved++;return result;
 }
 dispose(){this.tiles.clear();this.field.clear();this.stats.cachedCells=0;this.stats.cachedTiles=0;this.stats.fieldNodes=0;}
}
