import * as THREE from "three";

const clamp=(v,a=0,b=1)=>Math.max(a,Math.min(b,v));
const smooth=(a,b,x)=>{const t=clamp((x-a)/(b-a));return t*t*(3-2*t);};
function hash(x,z){
  let n=Math.imul(x^0x45d9f3b,374761393)^Math.imul(z,668265263);
  n=Math.imul(n^(n>>>13),1274126177);return((n^(n>>>16))>>>0)/4294967296;
}
function noise(x,z){
  const ix=Math.floor(x),iz=Math.floor(z);let fx=x-ix,fz=z-iz;fx=fx*fx*(3-2*fx);fz=fz*fz*(3-2*fz);
  return (hash(ix,iz)*(1-fx)+hash(ix+1,iz)*fx)*(1-fz)+(hash(ix,iz+1)*(1-fx)+hash(ix+1,iz+1)*fx)*fz;
}
function force(x,z,time){
  const qx=x-.82*time*2.1,qz=z-.36*time*2.1;
  return .08+.75*smooth(.22,.84,noise(qx/22,qz/12)*.65+noise(qx/7+17,qz/3.5+17)*.35);
}
// Spatial gust, delayed force, lateral eddy, and slowly changing local direction.
// This is an art-directed wind field with lag, not a mass/spring physics solver.
export function windAt(x,z,time){
  return [force(x,z,time),force(x,z,time-.42),noise(x*.12-time*.11,z*.12-time*.047),noise(x*.025,z*.025)];
}
export class MeadowWindField {
  constructor({resolution=128,span=512,interval=.1}={}){
    if(!Number.isInteger(resolution)||resolution<4||span<=0||interval<=0)throw new RangeError("Invalid wind field dimensions");
    this.resolution=resolution;this.span=span;this.interval=interval;this.lastUpdate=-Infinity;this.sampleIndex=null;this.origin=new THREE.Vector2(Infinity,Infinity);
    const make=()=>{
      const texture=new THREE.DataTexture(new Uint8Array(resolution*resolution*4),resolution,resolution,THREE.RGBAFormat,THREE.UnsignedByteType);
      texture.minFilter=texture.magFilter=THREE.LinearFilter;texture.wrapS=texture.wrapT=THREE.ClampToEdgeWrapping;texture.generateMipmaps=false;texture.flipY=false;texture.colorSpace=THREE.NoColorSpace;return texture;
    };
    this.previous=make();this.current=make();this.revisions=0;
    this.uniforms={
      uWindPrevious:{value:this.previous},uWindCurrent:{value:this.current},
      uWindFieldOrigin:{value:this.origin},uWindFieldSpan:{value:span},uWindFieldBlend:{value:1},
    };
  }
  fill(texture,time){
    const n=this.resolution,step=this.span/n,data=texture.image.data,ox=this.origin.x,oz=this.origin.y;
    for(let z=0;z<n;z++)for(let x=0;x<n;x++){
      const px=ox+(x+.5)*step,pz=oz+(z+.5)*step,i=(z*n+x)*4;
      data[i]=Math.round(force(px,pz,time)*255);data[i+1]=Math.round(force(px,pz,time-.42)*255);
      data[i+2]=Math.round(noise(px*.12-time*.11,pz*.12-time*.047)*255);data[i+3]=Math.round(noise(px*.025,pz*.025)*255);
    }
    texture.needsUpdate=true;
  }
  update(time,position){
    if(!Number.isFinite(time)||!Number.isFinite(position.x)||!Number.isFinite(position.z))throw new TypeError("Wind coordinates must be finite");
    const step=this.span/8,ox=Math.floor((position.x-this.span*.5)/step)*step,oz=Math.floor((position.z-this.span*.5)/step)*step;
    const initial=this.sampleIndex===null;
    // Sample the same absolute-time bracket regardless of frame cadence. The
    // old 'last refresh -> next refresh' blend rewound after initialization and
    // its endpoints/phase depended on when frames crossed refresh deadlines.
    // Forecasting this deterministic field one interval ahead needs no extra
    // textures or solver.
    const index=Math.floor(time/this.interval),start=index*this.interval,end=(index+1)*this.interval;
    // Rebase only outside a central safe area; standing on a grid edge cannot trigger two uploads every frame.
    const moved=initial||Math.abs(position.x-(this.origin.x+this.span*.5))>this.span*.3||Math.abs(position.z-(this.origin.y+this.span*.5))>this.span*.3;
    const refresh=initial||moved||index!==this.sampleIndex;
    if(refresh){
      const started=performance.now();
      if(moved||initial||index!==this.sampleIndex+1){
        // A seek, skipped interval or spatial rebase must populate BOTH ends
        // from their true timestamps; never interpolate unrelated snapshots.
        this.origin.set(ox,oz);this.fill(this.previous,start);this.fill(this.current,end);
      }else{
        const swap=this.previous;this.previous=this.current;this.current=swap;this.fill(this.current,end);
      }
      this.uniforms.uWindPrevious.value=this.previous;this.uniforms.uWindCurrent.value=this.current;
      this.sampleIndex=index;this.lastUpdate=start;this.revisions++;this.lastRefreshMs=performance.now()-started;
    }
    this.uniforms.uWindFieldBlend.value=clamp((time-start)/this.interval);return refresh;
  }
  dispose(){this.previous.dispose();this.current.dispose();}
}
