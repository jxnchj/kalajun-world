// Shore materials consume the existing physical hydrology and existing surface
// samples. No camera, extra noise, texture or placement enters these responses.
export const shoreMaterialVariation={value:1};
export function setShoreMaterialVariation(enabled){
  if(typeof enabled!=="boolean")throw new TypeError("Shore material control expects a boolean");
  shoreMaterialVariation.value=enabled?1:0;return enabled;
}
const clamp=x=>Math.max(0,Math.min(1,x));
const smooth=(a,b,x)=>{const t=clamp((x-a)/(b-a));return t*t*(3-2*t);};
// Reload-only, because terrain caches hold this height-aware attribute at all
// LODs. Keep moisture/exclusion in hydrology unchanged: height only determines
// whether the already-damp surface can still be exposed riverbed material.
export const SHORE_ELEVATION=new URLSearchParams(globalThis.location?.search||"").get("shoreElevation")==="v18"?"v18":"physical";
export function shoreTerrainBedCoverage(radialBed,groundHeight,surfaceLevel,mode=SHORE_ELEVATION){
  const bed=clamp(radialBed);
  if(mode==="v18"||!Number.isFinite(groundHeight)||!Number.isFinite(surfaceLevel))return bed;
  // Keep the submerged bed and low 2 cm mud lip intact. The exposed soil shoulder
  // recovers its existing grass/forest/rock layer over the next 10 cm, based on
  // the same physical height and river level as the water/terrain boundary.
  return bed*(1-smooth(.02,.12,groundHeight-surfaceLevel));
}
// The existing grain/patch field is a bounded local pore proxy, not an extra
// wetness or placement map. Damp pores darken before a free surface film forms.
// Dry and fully saturated endpoints stay identical to the accepted material.
export function shoreWaterFilm(wetness,grain){
  return smooth(.72+.12*clamp(grain),.99,wetness);
}
export function shoreZones(wetness,bed,slope,patch){
  const damp=smooth(.025,.55,wetness),film=shoreWaterFilm(wetness,patch);
  const living=damp*(1-smooth(.45,.86,bed))*(1-smooth(.3,.6,slope))*(.35+.65*clamp(patch));
  return [damp,film,living];
}
export function shoreWetAlbedo(wetness,grain){
  return 1-(1-(.68+.10*clamp(grain)))*smooth(.24+.16*clamp(grain),.97,wetness);
}
export function shoreWetRoughness(dry,wetness,grain){
  const film=shoreWaterFilm(wetness,grain),wet=Math.max(.34,dry*(.60+.10*clamp(grain)));
  return dry+(wet-dry)*film;
}
// Unlike the radial sediment mask, rooted turf is a patch layer: it can cover
// a fully classified bank pixel. The old monotone boundary redistribution could
// never interrupt coverage=1, however strong its existing meadow patch was.
// The same physical clearance excludes submerged material; steep rock remains
// bare. Structure already filters the existing canopy field at its footprint.
export function shoreRootCover(wetness,clearance,slope,structure){
  return smooth(.025,.55,wetness)*smooth(.02,.12,clearance)
    *(1-smooth(.52,.8,slope))*smooth(-.1,.45,structure);
}
// A submerged bed stays mineral. Above the waterline, rooted mats can reach
// the lip on sheltered, shallow soil; low-community pockets and steep cuts
// retain sediment. Reuse the SAME filtered community/tuft field as the meadow.
// No additional plants, random spots, texture reads or wetness changes.
export function shoreEcotoneCover(wetness,clearance,slope,structure){
  return smooth(.025,.55,wetness)*smooth(.001,.025,clearance)
    *(1-smooth(.28,.64,slope))*smooth(-.32,.18,structure);
}
// Exposed forest banks are soil horizons, not uniformly exposed river gravel.
// The low living mat cannot cover a cut face; humus and retained litter can.
// This cover uses the SAME resolved community field, existing forest class and
// physical clearance. This height-only response remains the previous AB path.
export function shoreOrganicCover(wetness,clearance,slope,forest,structure){
  return smooth(.04,.65,wetness)*smooth(.001,.035,clearance)*clamp(forest)
    *(1-smooth(.7,.95,slope))*(.45+.5*smooth(-.3,.25,structure));
}
// Organic-bank eligibility is a material mask, never a raised physical height.
// Humus can continue through the waterline into a very shallow soaked fringe.
// Both horizontal reach (12 cm) and depth (6 cm) bound that continuation;
// either deep water or a point away from the bank keeps the original bed.
export function shoreOrganicEligibility(clearance,shoreDistance){
  return Math.max(smooth(.001,.035,clearance),
    smooth(-.12,-.015,shoreDistance)*(1-smooth(.02,.06,-clearance)));
}
// The rooted surface is tied to the bank footprint, not just an interpolated
// triangle's elevation. A coarse face can sit millimetres below the river level
// while remaining outside the water mesh. The same shallow horizon used for
// organic soil must also drive the mineral-to-rooted-mat transition there.
// Living leaves are unchanged; this is the fibrous root/soil surface underneath.
export function shoreEcotoneBankCover(wetness,clearance,slope,structure,shoreDistance){
  const eligibility=Math.max(smooth(.001,.025,clearance),
    smooth(-.12,-.015,shoreDistance)*(1-smooth(.02,.06,-clearance)));
  return smooth(.025,.55,wetness)*eligibility
    *(1-smooth(.28,.64,slope))*smooth(-.32,.18,structure);
}
export function shoreOrganicBankCover(wetness,clearance,slope,forest,structure,shoreDistance){
  return smooth(.04,.65,wetness)*shoreOrganicEligibility(clearance,shoreDistance)*clamp(forest)
    *(1-smooth(.7,.95,slope))*(.45+.5*smooth(-.3,.25,structure));
}
// A saturated porous organic horizon retains fibre/pore roughness. Only a
// genuinely submerged point develops the earlier free-water-film response.
// Horizontal and vertical tests use the same continuous river cross-section;
// a millimetre of interpolated terrain sag must not polish the whole bank.
export function shoreOrganicRoughness(dry,wetness,grain,clearance,shoreDistance){
  const porous=dry+(Math.max(.82,dry*.91)-dry)*smooth(.35,.97,wetness);
  const film=smooth(.015,.06,-clearance)*(1-smooth(-.12,-.015,shoreDistance));
  return porous+(shoreWetRoughness(dry,wetness,grain)-porous)*film;
}
// Soil moisture fills pores before it forms a continuous reflecting water film.
// Apply that distinction to mineral/ordinary soil too, not only organic litter.
// Both metric tests are from the shared terrain/water cross-section. Keeping
// this independent of view distance preserves the same material at every LOD.
export function shorePorousRoughness(dry,wetness,grain,clearance,shoreDistance){
  const porous=dry+(Math.max(.65,dry*(.91+.04*clamp(grain)))-dry)*smooth(.35,.97,wetness);
  const film=smooth(.015,.06,-clearance)*(1-smooth(-.12,-.015,shoreDistance));
  return porous+(shoreWetRoughness(dry,wetness,grain)-porous)*film;
}
export function shoreForestSurfaceCover(forestCover,organicCover,face){
  // Both layers represent the same soil, so union rather than addition keeps
  // the coverage bounded and avoids counting the same scan twice.
  const organic=organicCover*(1-face);
  return forestCover+(1-forestCover)*organic;
}
export const SHORE_MATERIAL_GLSL=/* glsl */`
uniform float uShoreMaterialVariation;
float shoreOrganicEligibility(float clearance,float shoreDistance){
  return max(smoothstep(.001,.035,clearance),
    smoothstep(-.12,-.015,shoreDistance)*(1.-smoothstep(.02,.06,-clearance)));
}
float shoreOrganicBankCover(float wetness,float clearance,float slope,float forest,float structure,float shoreDistance){
  return smoothstep(.04,.65,wetness)*shoreOrganicEligibility(clearance,shoreDistance)*clamp(forest,0.,1.)
    *(1.-smoothstep(.7,.95,slope))*(.45+.5*smoothstep(-.3,.25,structure));
}
float shoreOrganicCover(float wetness,float clearance,float slope,float forest,float structure){
  return smoothstep(.04,.65,wetness)*smoothstep(.001,.035,clearance)*clamp(forest,0.,1.)
    *(1.-smoothstep(.7,.95,slope))*(.45+.5*smoothstep(-.3,.25,structure));
}
float shoreEcotoneBankCover(float wetness,float clearance,float slope,float structure,float shoreDistance){
  float eligibility=max(smoothstep(.001,.025,clearance),
    smoothstep(-.12,-.015,shoreDistance)*(1.-smoothstep(.02,.06,-clearance)));
  return smoothstep(.025,.55,wetness)*eligibility
    *(1.-smoothstep(.28,.64,slope))*smoothstep(-.32,.18,structure);
}
float shoreEcotoneCover(float wetness,float clearance,float slope,float structure){
  return smoothstep(.025,.55,wetness)*smoothstep(.001,.025,clearance)
    *(1.-smoothstep(.28,.64,slope))*smoothstep(-.32,.18,structure);
}
float shoreRootCover(float wetness,float clearance,float slope,float structure){
  return smoothstep(.025,.55,wetness)*smoothstep(.02,.12,clearance)
    *(1.-smoothstep(.52,.8,slope))*smoothstep(-.1,.45,structure);
}
float shoreWaterFilm(float wetness,float grain){
  return smoothstep(.72+.12*clamp(grain,0.,1.),.99,wetness);
}
vec3 shoreZones(float wetness,float bed,float slope,float surfacePatch){
  float damp=smoothstep(.025,.55,wetness),film=shoreWaterFilm(wetness,surfacePatch);
  float living=damp*(1.-smoothstep(.45,.86,bed))*(1.-smoothstep(.3,.6,slope))*(.35+.65*clamp(surfacePatch,0.,1.));
  return vec3(damp,film,living);
}
float shoreWetAlbedo(float wetness,float grain){
  return mix(1.,mix(.68,.78,clamp(grain,0.,1.)),smoothstep(.24+.16*clamp(grain,0.,1.),.97,wetness));
}
float shoreWetRoughness(float dry,float wetness,float grain){
  return mix(dry,max(.34,dry*mix(.60,.70,clamp(grain,0.,1.))),shoreWaterFilm(wetness,grain));
}
float shoreOrganicRoughness(float dry,float wetness,float grain,float clearance,float shoreDistance){
  float porous=mix(dry,max(.82,dry*.91),smoothstep(.35,.97,wetness));
  float film=smoothstep(.015,.06,-clearance)*(1.-smoothstep(-.12,-.015,shoreDistance));
  return mix(porous,shoreWetRoughness(dry,wetness,grain),film);
}
float shorePorousRoughness(float dry,float wetness,float grain,float clearance,float shoreDistance){
  float porous=mix(dry,max(.65,dry*(.91+.04*clamp(grain,0.,1.))),smoothstep(.35,.97,wetness));
  float film=smoothstep(.015,.06,-clearance)*(1.-smoothstep(-.12,-.015,shoreDistance));
  return mix(porous,shoreWetRoughness(dry,wetness,grain),film);
}
float shoreForestSurfaceCover(float forestCover,float organicCover,float face){
  float organic=organicCover*(1.-face);
  return forestCover+(1.-forestCover)*organic;
}
`;
