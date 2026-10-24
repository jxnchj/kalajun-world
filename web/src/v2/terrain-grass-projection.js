// Retain both source detail projections and their metres-per-texel. The
// already sampled fixed-world meadow field supplies a bounded continuous shift.
// Height gradients follow the coordinate Jacobian, so albedo and relief agree.
export const TERRAIN_GRASS_PROJECTION=new URLSearchParams(globalThis.location?.search||'').get('meadowProjection')==='v36'?'v36':'ecological';
export function meadowDetailCoordinates(x,z,field){return [x/2+.6*(field[0]-.5),z/2+.6*(field[3]-.5)];}
export function meadowDetailGradient(gradient,jacobian){return [jacobian[0]*gradient[0]+jacobian[2]*gradient[1],jacobian[1]*gradient[0]+jacobian[3]*gradient[1]];}
export const TERRAIN_GRASS_PROJECTION_GLSL=/* glsl */`
vec2 terrainGrassGradient(vec2 gradient,vec2 p,vec2 q){
  mat2 screenToBase=mat2(dFdx(p),dFdy(p));
  if(abs(determinant(screenToBase))<1e-12)return gradient;
  mat2 baseToSample=mat2(dFdx(q),dFdy(q))*inverse(screenToBase);
  return transpose(baseToSample)*gradient;
}
`;
