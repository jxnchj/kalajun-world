import * as T from 'three';
export function timberLinearMean48(data,srgb=true){const sum=[0,0,0];for(let i=0;i<data.length;i+=4)for(let c=0;c<3;c++){const x=data[i+c]/255;sum[c]+=srgb?(x<=.04045?x/12.92:Math.pow((x+.055)/1.055,2.4)):x;}return sum.map(x=>x/(data.length/4));}
const sourceMeans48=new WeakMap();
export function cachedTimberMean48(texture,compute,immutable){const image=texture.image,version=texture.version,colorSpace=texture.colorSpace,old=sourceMeans48.get(texture);if(immutable&&old?.image===image&&old.version===version&&old.colorSpace===colorSpace)return old.mean;const mean=compute();if(immutable)sourceMeans48.set(texture,{image,version,colorSpace,mean});return mean;}
export function sourceTimberMean48(texture){if(!texture?.image)return [1,1,1];const image=texture.image,immutable=typeof ImageBitmap!=='undefined'&&image instanceof ImageBitmap;return cachedTimberMean48(texture,()=>{const canvas=document.createElement('canvas');canvas.width=image.width;canvas.height=image.height;const ctx=canvas.getContext('2d',{willReadFrequently:true});ctx.drawImage(image,0,0);return timberLinearMean48(ctx.getImageData(0,0,image.width,image.height).data,texture.colorSpace===T.SRGBColorSpace);},immutable);}
// Colour remains hardware sRGB; numeric normal/roughness channels remain linear.
export function packHouseTimberPixels48(images){
 const n=images.color.width;if(n!==1024||images.color.height!==n||images.normal.width!==n||images.normal.height!==n||images.rough.width!==n||images.rough.height!==n||images.end.width!==256||images.end.height!==256)throw Error('House timber original image dimensions differ');
 const color=new Uint8Array(n*n*8),numeric=new Uint8Array(n*n*4),end=images.end;for(const image of Object.values(images))if(image.data.length!==image.width*image.height*4)throw Error('House timber pixel count differs');
 for(let y=0;y<n;y++)for(let x=0;x<n;x++){const i=(y*n+x)*4,j=((y%256)*256+x%256)*4;color.set(images.color.data.subarray(i,i+4),i);color.set(end.data.subarray(j,j+4),n*n*4+i);numeric.set(images.normal.data.subarray(i,i+3),i);numeric[i+3]=images.rough.data[i+1];}
 return{color,numeric,width:n};
}
export function combineHouseTimberTextures48(textures){
 const images={};for(const[k,t]of Object.entries(textures)){const image=t.image,canvas=document.createElement('canvas');canvas.width=image.width;canvas.height=image.height;const ctx=canvas.getContext('2d',{willReadFrequently:true});ctx.translate(0,image.height);ctx.scale(1,-1);ctx.drawImage(image,0,0);images[k]=ctx.getImageData(0,0,image.width,image.height);}
 const pixels=packHouseTimberPixels48(images),color=new T.DataArrayTexture(pixels.color,pixels.width,pixels.width,2),numeric=new T.DataTexture(pixels.numeric,pixels.width,pixels.width);color.userData.linearMean48=timberLinearMean48(images.color.data);color.colorSpace=T.SRGBColorSpace;numeric.colorSpace=T.NoColorSpace;
 for(const t of [color,numeric]){t.wrapS=t.wrapT=T.RepeatWrapping;t.magFilter=T.LinearFilter;t.minFilter=T.LinearMipmapLinearFilter;t.generateMipmaps=true;t.anisotropy=4;t.needsUpdate=true;}
 return {color,numeric};
}
