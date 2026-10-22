import * as THREE from "three";

// Source detail pixels are periodic; their world-space sampling is not.
// It is baked once on the CPU, never generated as per-pixel fractal noise.
// R: 16/43/64 m moisture patches, G: 2.4 m canopy, B: maturity, A: texture blend.
export const MEADOW_SURFACE = Object.freeze({ size: 512, metres: 128, canopyMetres: 128 / 53,
  roughness: .93, canopyHeight: .16 });
const linear = hex => { const c = new THREE.Color(hex); return [c.r,c.g,c.b]; };
export const MEADOW_PALETTE = Object.freeze({
  fresh: Object.freeze(linear("#6c873e")), cool: Object.freeze(linear("#537b3d")),
  dry: Object.freeze(linear("#8a8351")), groundReference: Object.freeze(linear("#627847")),
});
// Reload-only A/B keeps immutable CPU grass-root samples and the terrain
// texture on the same source. A live texture swap would leave cached roots stale.
const requestedPattern=new URLSearchParams(globalThis.location?.search||"").get("meadowPattern");
export const MEADOW_PATTERN=["v14","v15","v19","v21","v23"].includes(requestedPattern)?requestedPattern:"v24";
// Reload-only: CPU root caches and every ground/grass shader select together.
export const MEADOW_ROTATION=new URLSearchParams(globalThis.location?.search||"").get("meadowRotation")==="v17"?"v17":"continuous";
const patternPixels=new Map();
let sharedTexture, references = 0;
const clamp = x => Math.max(0,Math.min(1,x));
const smooth = (a,b,x) => { const t=clamp((x-a)/(b-a)); return t*t*(3-2*t); };
function hash(x,y,seed) {
  let h=Math.imul(x,374761393)^Math.imul(y,668265263)^Math.imul(seed,1274126177);
  h=Math.imul(h^(h>>>13),1274126177);return ((h^(h>>>16))>>>0)/4294967295;
}
function noise(u,v,period,seed) {
  const x=Math.floor(u),y=Math.floor(v),wrap=n=>(n%period+period)%period;
  let a=u-x,b=v-y;a=a*a*a*(a*(a*6-15)+10);b=b*b*b*(b*(b*6-15)+10);
  const h=(i,j)=>hash(wrap(i),wrap(j),seed);
  return (h(x,y)*(1-a)+h(x+1,y)*a)*(1-b)+(h(x,y+1)*(1-a)+h(x+1,y+1)*a)*b;
}
function meadowV14Pixels() {
  const n=MEADOW_SURFACE.size,pixels=new Uint8Array(n*n*4);
  for(let y=0;y<n;y++)for(let x=0;x<n;x++){
    const u=(x+.5)/n,v=(y+.5)/n;
    const warpX=noise(u*2,v*2,2,11),warpY=noise(u*2+.7,v*2+.3,2,13);
    const patch=noise(u*8+warpX,v*8+warpY,8,17);
    const canopy=noise(u*53+warpX*.4,v*53+warpY*.4,53,19);
    const maturity=clamp((1-patch)*.65+noise(u*16,v*16,16,23)*.35);
    const blend=noise(u*18,v*18,18,29),i=(y*n+x)*4;
    pixels[i]=Math.round(patch*255);pixels[i+1]=Math.round(canopy*255);
    pixels[i+2]=Math.round(maturity*255);pixels[i+3]=Math.round(blend*255);
  }
  return pixels;
}
// Compact radial kernels replace axis-aligned four-corner plateaus. Each
// periodic lattice site is jittered by up to .35 cell; the 1.25-cell radius
// fits exactly in this 4x4 stencil, with zero value/first derivative at its edge.
function radialLattice(period,seed){
  const points=new Float64Array(period*period*3),radius2=1.25**2;
  for(let j=0;j<period;j++)for(let i=0;i<period;i++){
    const at=(j*period+i)*3;
    points[at]=(hash(i,j,seed+101)-.5)*.70;
    points[at+1]=(hash(i,j,seed+211)-.5)*.70;
    points[at+2]=hash(i,j,seed);
  }
  const wrap=n=>(n%period+period)%period;
  return (u,v)=>{
    const ix=Math.floor(u),iz=Math.floor(v);let value=0,weight=0;
    for(let z=iz-1;z<=iz+2;z++)for(let x=ix-1;x<=ix+2;x++){
      const at=(wrap(z)*period+wrap(x))*3;
      const dx=x+points[at]-u,dz=z+points[at+1]-v;
      const q=1-(dx*dx+dz*dz)/radius2;if(q<=0)continue;
      const w=q*q*q;value+=points[at+2]*w;weight+=w;
    }
    return value/weight;
  };
}
const MEADOW_SOURCE_MOMENTS=Object.freeze({
  sums:[31392875,34178428,34571516,31526211],
  sd:[.2137480669638738,.2260579493215527,.1595347162665532,.22555377704917393],
});
function packMeadowPattern(raw){
  const count=raw.length/4,out=new Uint8Array(raw.length);
  for(let c=0;c<4;c++){
    let sum=0,squares=0;
    for(let i=c;i<raw.length;i+=4){sum+=raw[i];squares+=raw[i]*raw[i];}
    const mean=sum/count,sd=Math.sqrt(Math.max(0,squares/count-mean*mean));
    const target=MEADOW_SOURCE_MOMENTS.sums[c]/(count*255),scale=MEADOW_SOURCE_MOMENTS.sd[c]/sd;
    let bytes=0;
    for(let i=c;i<raw.length;i+=4){const v=Math.round(clamp(target+(raw[i]-mean)*scale)*255);out[i]=v;bytes+=v;}
    // Exact channel mean keeps existing CPU/GPU mip reconstruction coherent.
    // Scatter sub-DN quantization compensation; no directional pattern or
    // global colour/exposure shift is introduced by distribution calibration.
    let remainder=MEADOW_SOURCE_MOMENTS.sums[c]-bytes,step=Math.sign(remainder),cursor=0;
    while(remainder){
      const i=(((Math.imul(cursor++,1664525)+1013904223)>>>0)&(count-1))*4+c;
      if(out[i]+step<0||out[i]+step>255)continue;
      out[i]+=step;remainder-=step;
    }
  }
  return out;
}
function meadowRadialPixels(hierarchy=false,connected=false,elongated=false,coherentMaturity=false){
  const n=MEADOW_SURFACE.size,raw=new Float32Array(n*n*4);
  const patchAt=radialLattice(8,17),canopyAt=radialLattice(53,19),maturityAt=radialLattice(16,23),blendAt=radialLattice(18,29);
  const communityAt=hierarchy?radialLattice(3,37):null,wideAt=hierarchy?radialLattice(2,41):null;
  for(let y=0;y<n;y++)for(let x=0;x<n;x++){
    const u=(x+.5)/n,v=(y+.5)/n;
    // Retain the old low-frequency domain drift and authored physical scales.
    const warpX=noise(u*2,v*2,2,11),warpY=noise(u*2+.7,v*2+.3,2,13);
    const small=patchAt(u*8+warpX,v*8+warpY),at=(y*n+x)*4;
    // Moisture/maturity have nested meadow scales instead of one repeated
    // 16 m spot size. Existing aperiodic world transforms break all source
    // periods; no new world grid or GPU samples are introduced. The fine
    // canopy and texture-blend channels remain byte-identical to v15.
    // Integer shears preserve the toroidal source exactly while giving the two
    // broad community scales different connected shapes instead of repeating
    // circular islands. World-cell rotation still removes a common direction.
    // Fine canopy/blend channels and their physical scales are unchanged.
    const community=hierarchy?communityAt((u+(elongated?v:0))*3+warpX*.4,v*3+warpY*.4):0;
    const wide=hierarchy?wideAt(u*2+warpX*.25,(v-(elongated?u:0))*2+warpY*.25):0;
    // The previous 16 m spots carried half the moisture signal everywhere.
    // Connected 43/64 m masses now carry the main moisture/maturity pattern,
    // while the same 16 m transitions remain inside them. Full source variance
    // and exact 2.4 m canopy/blend bytes are retained; no geometry is removed.
    const patch=hierarchy?(connected?small*.24+community*.46+wide*.30:
      small*.50+community*.32+wide*.18):small;
    raw[at]=patch;raw[at+1]=canopyAt(u*53+warpX*.4,v*53+warpY*.4);
    // Maturity follows the connected moisture community. The old independent
    // 8 m maturity field supplied 35% everywhere, breaking broad meadows into
    // small dry islands. Retain that local variation within the community,
    // with the exact mean/variance calibration and unchanged canopy microdetail.
    const localMaturity=maturityAt(u*16,v*16);
    raw[at+2]=clamp((1-patch)*(coherentMaturity?.85:.65)+localMaturity*(coherentMaturity?.15:.35));
    raw[at+3]=blendAt(u*18,v*18);
  }
  return packMeadowPattern(raw);
}

export function meadowFieldPixels(pattern=MEADOW_PATTERN) {
  if(pattern!=="v14"&&pattern!=="v15"&&pattern!=="v19"&&pattern!=="v21"&&pattern!=="v23"&&pattern!=="v24")throw new TypeError("Unknown meadow pattern");
  let pixels=patternPixels.get(pattern);
  if(!pixels){pixels=pattern==="v14"?meadowV14Pixels():meadowRadialPixels(["v19","v21","v23","v24"].includes(pattern),["v21","v23","v24"].includes(pattern),["v23","v24"].includes(pattern),pattern==="v24");patternPixels.set(pattern,pixels);}
  return pixels;
}
// CPU reference uses exactly WebGL repeat/bilinear texel-centre semantics.
export function sampleMeadowLegacy(x,z,pattern=MEADOW_PATTERN) {
  const n=MEADOW_SURFACE.size,data=meadowFieldPixels(pattern),wrap=i=>(i%n+n)%n;
  const u=x/MEADOW_SURFACE.metres*n-.5,v=z/MEADOW_SURFACE.metres*n-.5;
  const ix=Math.floor(u),iy=Math.floor(v),fx=u-ix,fy=v-iy;
  const at=(a,b,c)=>data[(wrap(b)*n+wrap(a))*4+c]/255;
  return Array.from({length:4},(_,c)=>(at(ix,iy,c)*(1-fx)+at(ix+1,iy,c)*fx)*(1-fy)+(at(ix,iy+1,c)*(1-fx)+at(ix+1,iy+1,c)*fx)*fy);
}

// Aperiodic world cells choose transforms of the selected detail field. Four
// quintic weights give continuous values/first derivatives at every cell edge.
// No camera coordinate, time, generated geometry or moving texture origin enters.
export const MEADOW_WORLD = Object.freeze({ cellMetres:96, minimumScale:.9, maximumScale:1.1 });
export const MEADOW_FIELD_MEAN=Object.freeze([.4696247624416671,.5112955130782508,.5171759511910784,.471619415283218]);
export const meadowWorldVariation={value:1};
export function setMeadowWorldVariation(enabled){
  if(typeof enabled!=="boolean")throw new TypeError("Meadow variation expects a boolean");
  meadowWorldVariation.value=enabled?1:0;return enabled;
}
function worldSeed(x,z){
  let h=Math.imul(x,374761393)^Math.imul(z,668265263)^2246822519;
  h=Math.imul(h^(h>>>13),1274126177);return (h^(h>>>16))>>>0;
}
const f32=Math.fround;
function worldCoordinates(x,z){
  x=f32(x);z=f32(z);
  return [f32(f32(x*f32(.8))+f32(z*f32(.6))),f32(f32(z*f32(.8))-f32(x*f32(.6)))];
}
function cornerTransform(px,pz,ix,iz,rotation){
  const h=worldSeed(ix,iz),seed=[h&255,(h>>>8)&255,(h>>>16)&255,h>>>24].map(v=>f32(v/255));
  const scale=f32(f32(.9)+f32(f32(.2)*seed[3])),turn=(h>>>16)&3;
  const x=f32(px-ix*MEADOW_WORLD.cellMetres),z=f32(pz-iz*MEADOW_WORLD.cellMetres);
  // The prior quarter turns preserve two texture lattice axes in every cell.
  // A normalized deterministic direction removes that common orientation while
  // keeping the physical size and the same four texture reads.
  let cosine=turn===0?1:turn===2?-1:0,sine=turn===1?1:turn===3?-1:0;
  if(rotation!=="v17"){
    const ax=f32(f32(seed[0]*2)-1),az=f32(f32(seed[1]*2)-1);
    const inv=f32(1/Math.sqrt(f32(f32(ax*ax)+f32(az*az))));
    cosine=f32(ax*inv);sine=f32(az*inv);
  }
  const rotated=[f32(f32(x*cosine)-f32(z*sine)),f32(f32(x*sine)+f32(z*cosine))];
  return {seed,scale,turn,cosine,sine,x:f32(f32(rotated[0]*scale)+f32(seed[0]*128)),z:f32(f32(rotated[1]*scale)+f32(seed[1]*128))};
}
// Exposed for deterministic cell-edge/gradient checks, not runtime allocations.
export function meadowWorldSamples(x,z,rotation=MEADOW_ROTATION){
  const [px,pz]=worldCoordinates(x,z),gx=px/MEADOW_WORLD.cellMetres,gz=pz/MEADOW_WORLD.cellMetres,ix=Math.floor(gx),iz=Math.floor(gz);
  const fade=t=>t*t*t*(t*(t*6-15)+10),fx=fade(gx-ix),fz=fade(gz-iz),samples=[];
  for(let dz=0;dz<2;dz++)for(let dx=0;dx<2;dx++)
    samples.push({...cornerTransform(px,pz,ix+dx,iz+dz,rotation),weight:(dx?fx:1-fx)*(dz?fz:1-fz)});
  return samples;
}
export function sampleMeadowField(x,z,pattern=MEADOW_PATTERN,rotation=MEADOW_ROTATION){
  const samples=meadowWorldSamples(x,z,rotation),field=[0,0,0,0],macro=[0,0,0,0];
  let squaredWeight=0;
  for(const sample of samples){
    const value=sampleMeadowLegacy(sample.x,sample.z,pattern),w=sample.weight;squaredWeight+=w*w;
    for(let c=0;c<4;c++){field[c]+=value[c]*w;macro[c]+=sample.seed[c]*w;}
  }
  // Preserve detail variance instead of averaging four layers into a flat blur.
  // Macro colour/maturity are correlated ecological variation, not baked light.
  const gain=1/Math.sqrt(squaredWeight);
  for(let c=0;c<4;c++)field[c]=MEADOW_FIELD_MEAN[c]+(field[c]-MEADOW_FIELD_MEAN[c])*gain;
  field[0]+=(macro[2]-.5)*.48;
  field[2]+=(.5-macro[2])*.24+(macro[3]-.5)*.10;
  field[3]+=(macro[0]-.5)*.24;
  return field.map(clamp);
}

// Broad geography is shared by terrain vertices and immutable grass roots.
// These are exactly the former terrain 128/512 m grids and 96 m DEM stencil.
// Never use physical cut-bank normals, tile LOD, camera distance or sun time.
// Reload-only: cached terrain vertices and every grass-root representation
// must use the same regional terrain positions. The accepted detail texture,
// mip chain, source palette and plant placement remain unchanged.
export const MEADOW_LANDSCAPE=new URLSearchParams(globalThis.location?.search||"").get("meadowLandscape")==="v19"?"v19":"v20";
const landformFields=new WeakMap();
export const meadowLandformVariation={value:1};
export function setMeadowLandformVariation(enabled){
  if(typeof enabled!=="boolean")throw new TypeError("Meadow landform control expects a boolean");
  meadowLandformVariation.value=enabled?1:0;return enabled;
}
export function meadowLandformResponse(exposure,hollow,{altitude=2300,wetness=0,cover={r:0,g:0,b:0}}={},target=[1,1,1,0]){
  // +z is south: positive geographic normal.z is a sun-exposed south slope.
  // A flat plane has exposure .5. Concavity is a broad moisture tendency,
  // not measured soil moisture or present sunlight baked into albedo.
  const aspect=clamp(exposure)*2-1,concavity=smooth(.18,.8,clamp(hollow));
  const moist=clamp(Math.max(0,-aspect)*.65+concavity*.50+clamp(wetness)*.85);
  const dry=Math.max(0,aspect)*(1-moist*.75);
  const alpine=smooth(2800,3600,altitude)*.25;
  const weight=(1-smooth(.12,.9,Number(cover.r)||0))*(1-smooth(.1,.9,Number(cover.b)||0))
    *(1-clamp(Number(cover.g)||0)*.6);
  target[0]=1+(.18*dry-.16*moist-.04*alpine)*weight;
  target[1]=1+(.02*dry+.035*moist-.01*alpine)*weight;
  target[2]=1+(-.12*dry+.14*moist+.07*alpine)*weight;
  target[3]=(.025*dry-.045*moist+.01*alpine)*weight;
  return target;
}
// Broad communities are terrain-position tendencies, not measured species or
// soil moisture. The neighbourhood only follows supplied DEM/landcover/hydrology.
const COMMUNITY_NEIGHBOURS=Object.freeze([[120,0],[-120,0],[0,120],[0,-120],[84.8528,84.8528],[-84.8528,84.8528],[84.8528,-84.8528],[-84.8528,-84.8528]]);
export const meadowCommunityVariation={value:1};
export function setMeadowCommunityVariation(enabled){
  if(typeof enabled!=="boolean")throw new TypeError("Meadow community control expects a boolean");
  meadowCommunityVariation.value=enabled?1:0;return enabled;
}
export function meadowCommunityWeights({exposure=.5,hollow=0,slope=0,position=0,regionalPosition=0,forestNearby=0,altitude=2300,cover={},wetness=0}={},target=[0,0,0,0]){
  const forest=smooth(.12,.9,Number(cover.r)||0),snow=smooth(.1,.9,Number(cover.b)||0);
  const available=(1-forest)*(1-snow)*(1-clamp(Number(cover.g)||0)*.72)*(1-smooth(.38,.68,slope));
  const sheltered=smooth(.006,.065,position)*smooth(.12,.65,hollow);
  // A 384 m local hollow alone misses broad valley floors and hill shoulders:
  // these can be locally flat/convex while belonging to one connected landform.
  // The 1152 m geographic context supplies that hierarchy, without painting a
  // regular world noise grid or assuming the current sun is soil moisture.
  const regionalHollow=smooth(.008,.075,regionalPosition);
  const regionalShoulder=smooth(.006,.065,-regionalPosition);
  const wet=Math.max(sheltered*.88,regionalHollow*(.34+.54*smooth(.12,.65,hollow)),
    smooth(.025,.65,wetness))*(1-smooth(.25,.50,slope));
  const crest=Math.max(smooth(.003,.055,-position),regionalShoulder*.85),sun=smooth(.52,.94,exposure);
  const alpine=smooth(2780,3500,altitude);
  const edge=smooth(.08,.68,forestNearby)*(1-smooth(.04,.65,Number(cover.r)||0))*(.5+.5*(1-exposure));
  target[0]=sun*(.25+.75*crest)*(1-wet*.9)*(1-alpine*.6);
  target[1]=wet*(1-alpine*.45);
  target[2]=edge*(1-alpine*.8)*(1-wet*.4);
  target[3]=alpine*(.55+.45*(1-wet));
  const scale=available/Math.max(1,target[0]+target[1]+target[2]+target[3]);
  for(let k=0;k<4;k++)target[k]*=scale;
  return target;
}
export const MEADOW_COMMUNITY_GLSL=/* glsl */`
uniform float uMeadowCommunityVariation;
vec4 meadowCommunityFeatures(vec4 field,vec4 community){
  if(uMeadowCommunityVariation<.5)return field;
  // Shift the SAME detail field's ecological mean; canopy/blend detail and all
  // mip/footprint filtering remain intact rather than being hidden by blur.
  field.r=clamp(field.r+dot(community,vec4(-.12,.18,.06,-.04)),0.,1.);
  field.b=clamp(field.b+dot(community,vec4(.17,-.20,-.07,.08)),0.,1.);
  return field;
}
vec3 meadowCommunityTint(vec4 community){
  return vec3(1.)+uMeadowCommunityVariation*(community.x*vec3(.13,.045,-.12)
    +community.y*vec3(-.23,.015,.18)+community.z*vec3(-.12,-.035,-.06)+community.w*vec3(-.05,-.045,.14));
}
float meadowCommunityRoughness(vec4 community){return uMeadowCommunityVariation*dot(community,vec4(.020,-.035,-.012,.018));}
`;

export class MeadowLandformField {
  constructor(world,{landscape=MEADOW_LANDSCAPE}={}){
    this.world=world;this.landscape=landscape;
    const field=(size,spacing)=>{const n=Math.ceil(size/spacing)+3;
      return{size,spacing,n,origin:-size/2-spacing,values:new Float32Array(n*n*2).fill(NaN),context:new Float32Array(n*n*4).fill(NaN),
        regional:landscape==="v19"?null:new Float32Array(n*n).fill(NaN)};};
    const size=Number(world.meta?.far?.size)||81920;
    this.far=field(size,512);this.core=field(world.meta?.core?.size||Math.min(20480,size),128);
    this.scratch=[new THREE.Vector2(),new THREE.Vector2()];
    this.stats={demSamples:0,gridPoints:0,responses:0,communityPoints:0,communityDemSamples:0,communityCoverSamples:0,regionalDemSamples:0,bytes:this.far.values.byteLength+this.core.values.byteLength+this.far.context.byteLength+this.core.context.byteLength+(this.far.regional?.byteLength||0)+(this.core.regional?.byteLength||0)};
  }
  sampleGrid(grid,x,z,target){
    const fx=Math.max(0,Math.min(grid.n-1.000001,(x-grid.origin)/grid.spacing));
    const fz=Math.max(0,Math.min(grid.n-1.000001,(z-grid.origin)/grid.spacing));
    const i=Math.floor(fx),j=Math.floor(fz),u=fx-i,v=fz-j;
    const geographic=this.world.surface.geographicHeightAt||this.world.surface.heightAt;
    let exposure=0,hollow=0;
    for(let dz=0;dz<=1;dz++)for(let dx=0;dx<=1;dx++){
      const at=((j+dz)*grid.n+i+dx)*2;
      if(Number.isNaN(grid.values[at])){
        const px=grid.origin+(i+dx)*grid.spacing,pz=grid.origin+(j+dz)*grid.spacing;
        const e=96,h=geographic(px,pz),west=geographic(px-e,pz),east=geographic(px+e,pz);
        const north=geographic(px,pz-e),south=geographic(px,pz+e);
        const normalLength=Math.hypot(west-east,2*e,north-south),normalZ=(north-south)/normalLength;
        grid.context[at*2]=h;grid.context[at*2+1]=1-2*e/normalLength;
        grid.values[at]=smooth(-.38,.38,normalZ);
        grid.values[at+1]=smooth(-.015,.07,((west+east+north+south)*.25-h)/e);
        this.stats.demSamples+=5;this.stats.gridPoints++;
      }
      const w=(dx?u:1-u)*(dz?v:1-v);
      exposure+=grid.values[at]*w;hollow+=grid.values[at+1]*w;
    }
    target.x=exposure;target.y=hollow;return target;
  }
  sample(x,z,target={x:0,y:0}){
    const far=this.sampleGrid(this.far,x,z,this.scratch[0]);
    const edge=this.core.size/2-Math.max(Math.abs(x),Math.abs(z)),w=smooth(0,600,edge);
    if(w>0)far.lerp(this.sampleGrid(this.core,x,z,this.scratch[1]),w);
    target.x=far.x;target.y=far.y;return target;
  }
  communityGrid(grid,x,z,target){
    // sampleGrid already retains the centre height and slope from its existing
    // five DEM reads. Wider terrain position and forest neighbourhood are lazy,
    // fixed-world additions, never a per-root or per-frame DEM stencil.
    this.sampleGrid(grid,x,z,this.scratch[0]);
    const fx=Math.max(0,Math.min(grid.n-1.000001,(x-grid.origin)/grid.spacing));
    const fz=Math.max(0,Math.min(grid.n-1.000001,(z-grid.origin)/grid.spacing));
    const i=Math.floor(fx),j=Math.floor(fz),u=fx-i,v=fz-j;
    const geographic=this.world.surface.geographicHeightAt||this.world.surface.heightAt;
    target.fill(0);
    for(let dz=0;dz<2;dz++)for(let dx=0;dx<2;dx++){
      const at=((j+dz)*grid.n+i+dx)*4;
      if(Number.isNaN(grid.context[at+2])){
        const px=grid.origin+(i+dx)*grid.spacing,pz=grid.origin+(j+dz)*grid.spacing,e=384;
        const average=(geographic(px-e,pz)+geographic(px+e,pz)+geographic(px,pz-e)+geographic(px,pz+e))*.25;
        grid.context[at+2]=(average-grid.context[at])/e;
        let forest=0;
        for(const [ox,oz]of COMMUNITY_NEIGHBOURS)forest=Math.max(forest,Number(this.world.landcoverAt(px+ox,pz+oz).r)||0);
        grid.context[at+3]=forest;
        this.stats.communityPoints++;this.stats.communityDemSamples+=4;this.stats.communityCoverSamples+=8;
      }
      const w=(dx?u:1-u)*(dz?v:1-v);
      target[0]+=grid.context[at+1]*w;target[1]+=grid.context[at+2]*w;target[2]+=grid.context[at+3]*w;
      if(grid.regional){
        const ri=at/4;
        if(Number.isNaN(grid.regional[ri])){
          const px=grid.origin+(i+dx)*grid.spacing,pz=grid.origin+(j+dz)*grid.spacing,e=1152;
          grid.regional[ri]=((geographic(px-e,pz)+geographic(px+e,pz)+geographic(px,pz-e)+geographic(px,pz+e))*.25-grid.context[at])/e;
          this.stats.regionalDemSamples+=4;
        }
        target[3]+=grid.regional[ri]*w;
      }
    }
    return target;
  }
  community(x,z,inputs={},target=[0,0,0,0]){
    const traits=inputs.traits||this.sample(x,z);
    const altitude=inputs.altitude??(this.world.surface.geographicHeightAt||this.world.surface.heightAt)(x,z);
    const cover=inputs.cover||this.world.landcoverAt(x,z);
    const wetness=inputs.wetness??(this.world.hydrology?.sampleAt(x,z,{includeDepth:false})?.wetness||0);
    const far=this.communityGrid(this.far,x,z,[0,0,0,0]);
    const edge=this.core.size/2-Math.max(Math.abs(x),Math.abs(z)),w=smooth(0,600,edge);
    if(w>0){const core=this.communityGrid(this.core,x,z,[0,0,0,0]);for(let k=0;k<4;k++)far[k]+=(core[k]-far[k])*w;}
    return meadowCommunityWeights({exposure:traits.x,hollow:traits.y,slope:far[0],position:far[1],regionalPosition:far[3],forestNearby:far[2],altitude,cover,wetness},target);
  }
  response(x,z,inputs={},target=[1,1,1,0],communityTarget){
    const traits=inputs.traits||this.sample(x,z);
    const altitude=inputs.altitude??(this.world.surface.geographicHeightAt||this.world.surface.heightAt)(x,z);
    const cover=inputs.cover||this.world.landcoverAt(x,z);
    const wetness=inputs.wetness??(this.world.hydrology?.sampleAt(x,z,{includeDepth:false})?.wetness||0);
    this.stats.responses++;
    if(communityTarget)this.community(x,z,{traits,altitude,cover,wetness},communityTarget);
    return meadowLandformResponse(traits.x,traits.y,{altitude,cover,wetness},target);
  }
}
export function getMeadowLandform(world){
  let field=landformFields.get(world);
  if(!field){field=new MeadowLandformField(world);landformFields.set(world,field);}return field;
}
// The GPU only interpolates a CPU response. No extra texture/DEM/noise work;
// toggling the uniform neutralises cached attributes on both terrain and grass.
export const MEADOW_LANDFORM_GLSL=/* glsl */`
uniform float uMeadowLandformVariation;
vec3 meadowLandformTint(vec4 habitat){return mix(vec3(1.),habitat.rgb,uMeadowLandformVariation);}
float meadowLandformRoughness(vec4 habitat){return habitat.a*uMeadowLandformVariation;}
`;

export function meadowCanopyColor(field) {
  const dry=smooth(.58,.86,field[2])*.28;
  return MEADOW_PALETTE.cool.map((c,i)=>(c+(MEADOW_PALETTE.fresh[i]-c)*field[0])*(1-dry)+MEADOW_PALETTE.dry[i]*dry);
}
// A 2.4 m tuft cannot support a resolved colour island at 3.5 m per pixel.
// Match its colour footprint to its existing height footprint, preserving all
// close detail and the broad ecological field instead of leaving aliasing dots.
// Independent reload A/B; density, geometry, source textures and mips stay fixed.
export const MEADOW_COLOUR_FOOTPRINT=new URLSearchParams(globalThis.location?.search||"").get("meadowFootprint")==="v23"?[1,3.5]:[.35,1.3];
export function meadowFilter(footprint) {
  return { canopy:1-smooth(.35,1.3,footprint), colour:1-smooth(...MEADOW_COLOUR_FOOTPRINT,footprint),
    micro:1-smooth(.04,.22,footprint) };
}
// Materials share one GPU texture. Disposal of one LOD or the terrain cannot
// delete it while other live materials still use it.
const bindings=new WeakMap();
export function bindMeadowField(material) {
  if(bindings.has(material))return bindings.get(material);
  if(!sharedTexture){
    const n=MEADOW_SURFACE.size;
    sharedTexture=new THREE.DataTexture(meadowFieldPixels(),n,n,THREE.RGBAFormat);
    sharedTexture.name="Shared meadow colour and canopy field";
    sharedTexture.colorSpace=THREE.NoColorSpace;sharedTexture.wrapS=sharedTexture.wrapT=THREE.RepeatWrapping;
    sharedTexture.minFilter=THREE.LinearMipmapLinearFilter;sharedTexture.magFilter=THREE.LinearFilter;
    sharedTexture.generateMipmaps=true;sharedTexture.anisotropy=4;sharedTexture.needsUpdate=true;
  }
  material.userData.meadowPattern=MEADOW_PATTERN;
  material.userData.meadowRotation=MEADOW_ROTATION;
  material.userData.meadowWorldVariation=meadowWorldVariation;
  material.userData.meadowLandformVariation=meadowLandformVariation;
  material.userData.meadowCommunityVariation=meadowCommunityVariation;
  const binding={value:sharedTexture};bindings.set(material,binding);references++;
  const release=()=>{material.removeEventListener("dispose",release);bindings.delete(material);
    if(--references===0){sharedTexture.dispose();sharedTexture=null;}};
  material.addEventListener("dispose",release);return binding;
}
const vec3 = a => "vec3("+a.map(v=>v.toFixed(8)).join(",")+")";
export const MEADOW_SURFACE_GLSL = `
vec3 meadowCanopyColor(vec4 field) {
  vec3 live=mix(${vec3(MEADOW_PALETTE.cool)},${vec3(MEADOW_PALETTE.fresh)},field.r);
  return mix(live,${vec3(MEADOW_PALETTE.dry)},smoothstep(.58,.86,field.b)*.28);
}
float meadowCanopyResolved(float footprint) { return 1.-smoothstep(.35,1.3,footprint); }
float meadowColourResolved(float footprint) { return 1.-smoothstep(${MEADOW_COLOUR_FOOTPRINT[0].toFixed(2)},${MEADOW_COLOUR_FOOTPRINT[1].toFixed(2)},footprint); }
float meadowMicroResolved(float footprint) { return 1.-smoothstep(.04,.22,footprint); }
`;
export const MEADOW_GROUND_REFERENCE_GLSL = vec3(MEADOW_PALETTE.groundReference);

export const MEADOW_FIELD_GLSL = /* glsl */`
uniform sampler2D meadowSurfaceField;
uniform float uMeadowWorldVariation;
vec4 meadowWorldSeed(ivec2 cell) {
  uint h=uint(cell.x)*374761393u ^ uint(cell.y)*668265263u ^ 2246822519u;
  h=(h^(h>>13u))*1274126177u;h=h^(h>>16u);
  return vec4(uvec4(h,h>>8u,h>>16u,h>>24u)&uvec4(255u))/255.;
}
vec2 meadowTurn(vec2 q,int turn) {
  if(turn==1)return vec2(-q.y,q.x);
  if(turn==2)return -q;
  if(turn==3)return vec2(q.y,-q.x);
  return q;
}
vec4 meadowWorldCorner(vec2 p,ivec2 cell,vec4 seed,vec2 dx,vec2 dy) {
  int turn=int(floor(seed.b*255.+.5))&3;
  float scale=.9+.2*seed.a;
  vec2 q;vec2 sampleDX,sampleDY;
  if(${MEADOW_ROTATION==='v17'?'true':'false'}){
    q=meadowTurn(p-vec2(cell)*96.,turn)*scale+seed.rg*128.;
    sampleDX=meadowTurn(dx,turn);sampleDY=meadowTurn(dy,turn);
  }else{
    vec2 direction=normalize(seed.rg*2.-1.);
    mat2 rotation=mat2(direction.x,direction.y,-direction.y,direction.x);
    q=rotation*(p-vec2(cell)*96.)*scale+seed.rg*128.;
    sampleDX=rotation*dx;sampleDY=rotation*dy;
  }
  // Explicit gradients exclude the discontinuous seed/coordinate change of
  // neighbouring fragments at cell edges. Mips/anisotropy follow physical scale.
#ifdef MEADOW_FRAGMENT
  return textureGrad(meadowSurfaceField,q/128.,sampleDX*scale/128.,sampleDY*scale/128.);
#else
  return textureLod(meadowSurfaceField,q/128.,0.);
#endif
}
vec4 meadowFieldAt(vec2 worldXZ) {
  if(uMeadowWorldVariation<.5)return texture2D(meadowSurfaceField,worldXZ/128.);
  vec2 p=mat2(.8,-.6,.6,.8)*worldXZ,g=p/96.;
  vec2 dx=vec2(0.),dy=vec2(0.);
#ifdef MEADOW_FRAGMENT
  dx=dFdx(p);dy=dFdy(p);
#endif
  ivec2 cell=ivec2(floor(g));
  vec2 f=fract(g);f=f*f*f*(f*(f*6.-15.)+10.);
  vec4 w=vec4((1.-f.x)*(1.-f.y),f.x*(1.-f.y),(1.-f.x)*f.y,f.x*f.y);
  vec4 a=meadowWorldSeed(cell),b=meadowWorldSeed(cell+ivec2(1,0));
  vec4 c=meadowWorldSeed(cell+ivec2(0,1)),d=meadowWorldSeed(cell+ivec2(1,1));
  vec4 field=meadowWorldCorner(p,cell,a,dx,dy)*w.x+meadowWorldCorner(p,cell+ivec2(1,0),b,dx,dy)*w.y
    +meadowWorldCorner(p,cell+ivec2(0,1),c,dx,dy)*w.z+meadowWorldCorner(p,cell+ivec2(1,1),d,dx,dy)*w.w;
  vec4 macro=a*w.x+b*w.y+c*w.z+d*w.w;
  // The actual source means keep unresolved mip averages independent of the
  // number of overlapping layers. Variance correction preserves fine contrast.
  vec4 mean=vec4(.4696247624,.5112955131,.5171759512,.4716194153);
  field=mean+(field-mean)*inversesqrt(dot(w,w));
#ifdef MEADOW_FRAGMENT
  macro=mix(vec4(.5),macro,1.-smoothstep(32.,128.,max(length(dx),length(dy))));
#endif
  field.r+=(macro.b-.5)*.48;
  field.b+=(.5-macro.b)*.24+(macro.a-.5)*.10;
  field.a+=(macro.r-.5)*.24;
  return clamp(field,0.,1.);
}
`;
