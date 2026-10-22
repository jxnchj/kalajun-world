// V2's four habitat channels, derived exactly from the six authored RGBA atlases.
// Keep the source atlases intact: this is an offline representation of the same
// values the original runtime decoder produced, not a resampling or density LOD.
export function decodeHabitatMap(meta,bytes) {
  const n=Math.round(meta.size/meta.res);
  if(bytes.length!==n*n*24)throw new Error("Habitat raster size mismatch");
  const data=new Uint8Array(n*n*4),at=(i,j,t,c)=>bytes[(((Math.floor(t/3)*n+j)*3*n)+(t%3)*n+i)*4+c];
  for(let j=0;j<n;j++)for(let i=0;i<n;i++) {
    const o=(j*n+i)*4;
    data[o]=at(i,j,0,0);data[o+1]=Math.max(at(i,j,0,1),at(i,j,2,0));
    data[o+2]=Math.max(at(i,j,1,0),at(i,j,1,3),at(i,j,4,2),at(i,j,4,3));
    data[o+3]=Math.max(at(i,j,3,1),at(i,j,3,0));
  }
  return {meta,n,data};
}
