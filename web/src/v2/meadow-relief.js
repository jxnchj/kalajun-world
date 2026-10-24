// Directional terrain position, evaluated only on the shared fixed-world grid.
// Values describe a topographic tendency, not measured soil water or species.
const clamp = x => Math.max(0, Math.min(1, x));
const smooth = (a, b, x) => { const t = clamp((x - a) / (b - a)); return t * t * (3 - 2 * t); };

/**
 * A four-way mean cannot distinguish a drainage hollow across a slope from a
 * concave roll along it. Use the full symmetric height Hessian in the direction
 * perpendicular to the DEM gradient. Diagonal samples avoid cardinal bias.
 * The result remains dimensionless (metres of relief / stencil metres).
 * On a rotationally symmetric bowl it equals the old terrain-position index;
 * on a tilted trough it connects its whole long axis rather than painting
 * isolated rings around changes in longitudinal slope.
 */
export function meadowDirectionalPosition({center,west,east,north,south,northWest,northEast,southWest,southEast,spacing}) {
  const gx=(east-west)/(2*spacing),gz=(south-north)/(2*spacing);
  const slope2=gx*gx+gz*gz;
  const xx=(east+west-2*center)/spacing,zz=(north+south-2*center)/spacing;
  const xz=(southEast+northWest-northEast-southWest)/(4*spacing);
  const mean=(xx+zz)*.25;
  // A nearly flat summit/floor has no stable flow direction: retain its broad
  // bowl/shoulder response instead of normalizing an arbitrary tiny gradient.
  if(slope2<1e-12)return mean;
  const across=(xx*gz*gz-2*xz*gx*gz+zz*gx*gx)/slope2;
  return mean+(.5*across-mean)*.85*smooth(.015,.09,Math.sqrt(slope2));
}

export function sampleMeadowDirectionalPosition(height,x,z,center,spacing,cardinal) {
  const [west,east,north,south]=cardinal;
  return meadowDirectionalPosition({center,west,east,north,south,spacing,
    northWest:height(x-spacing,z-spacing),northEast:height(x+spacing,z-spacing),
    southWest:height(x-spacing,z+spacing),southEast:height(x+spacing,z+spacing)});
}
