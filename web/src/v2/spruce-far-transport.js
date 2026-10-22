// Lossless delivery format only. GPU textures, alpha, normal RGB (including
// fully transparent texels) and mip generation are byte-identical to capture.
export const FAR_NORMAL_TRANSPORT="rgb-planar-shared-albedo-alpha-v1";
const littleEndian=new Uint8Array(new Uint32Array([0x04030201]).buffer)[0]===1;
export function restoreFarNormalRGBA(rgb,albedo,pixels){
  if(!Number.isSafeInteger(pixels)||pixels<=0||!(rgb instanceof Uint8Array)||rgb.byteLength!==pixels*3||!(albedo instanceof Uint8Array)||albedo.byteLength!==pixels*4)throw new RangeError("Far spruce shared-alpha byte count mismatch");
  const out=new Uint8Array(pixels*4),g=pixels,b=pixels*2;
  if(littleEndian){
    const words=new Uint32Array(out.buffer);
    for(let i=0;i<pixels;i++)words[i]=rgb[i]|(rgb[g+i]<<8)|(rgb[b+i]<<16)|(albedo[i*4+3]<<24);
  }else{
    for(let i=0,k=0;i<pixels;i++,k+=4){out[k]=rgb[i];out[k+1]=rgb[g+i];out[k+2]=rgb[b+i];out[k+3]=albedo[k+3];}
  }
  return out;
}
export function farTransportFile(file,mode="v27"){
  if(mode!=="v26"&&mode!=="v27")throw new RangeError("Unsupported far spruce transport mode");
  return mode==="v26"||!file.losslessTransport?file:{...file,...file.losslessTransport};
}
export function validateFarTransport(file,pixels){
  const t=file.losslessTransport;if(!t)return;
  if(file.kind!=="normal"||t.encoding!==FAR_NORMAL_TRANSPORT||t.alphaSource!=="albedo"||typeof t.url!=="string"||!t.url||!Number.isSafeInteger(t.bytes)||t.bytes<=0||t.decodedBytes!==pixels*3||t.rgbaSHA256!==file.sha256||!/^[a-f0-9]{64}$/.test(t.gzipSHA256??""))throw new Error("Invalid far spruce lossless transport contract");
}
