import {Texture} from "three";
// One building-loader lifetime only. Identical embedded image bytes may share a
// decoded Source; Texture objects, sampler/UV state and material identity stay
// private to each glTF. Three's renderer keys uploads by Source + sampler state.
export class StructureTextureReuse {
  constructor({enabled=true, digest=bytes=>globalThis.crypto.subtle.digest('SHA-256',bytes)}={}) {
    this.enabled=enabled&&Boolean(globalThis.crypto?.subtle);
    this.digest=digest;
    this.sources=new Map();
    this.decodedSources=new Set();
    this.closed=false;
    this.stats={enabled:this.enabled,requests:0,uniqueImages:0,reusedImages:0,
      encodedBytes:0,reusedEncodedBytes:0,hashWaitMs:0};
  }

  install(loader) {
    loader.register(parser=>{
      const original=parser.loadImageSource.bind(parser), local=new Map();
      parser.loadImageSource=(index,imageLoader)=>{
        const image=parser.json.images[index];
        // External URIs, custom decoder handlers and unsupported browsers keep
        // GLTFLoader's original ownership and decode path.
        if(!this.enabled||!imageLoader.isImageBitmapLoader||image.bufferView===undefined)
          return original(index,imageLoader);
        const options=JSON.stringify(Object.entries(imageLoader.options||{}).sort(([a],[b])=>a.localeCompare(b)));
        const localKey=index+':'+options;
        if(!local.has(localKey)) local.set(localKey,(async()=>{
          const bytes=await parser.getDependency('bufferView',image.bufferView);
          const start=performance.now();
          const hash=new Uint8Array(await this.digest(bytes));
          this.stats.hashWaitMs+=performance.now()-start;
          const key=(image.mimeType||'')+':'+options+':'+Array.from(hash,b=>b.toString(16).padStart(2,'0')).join('');
          this.stats.requests++;this.stats.encodedBytes+=bytes.byteLength;
          let pending=this.sources.get(key);
          if(pending){this.stats.reusedImages++;this.stats.reusedEncodedBytes+=bytes.byteLength;}
          else {
            this.stats.uniqueImages++;
            // Cache only Source, never the first asset's Texture metadata/state.
            pending=original(index,imageLoader).then(texture=>{
              const source=texture.source;
              if(this.closed)source.data?.close?.();
              else this.decodedSources.add(source);
              return source;
            });
            if(!this.closed)this.sources.set(key,pending);
            pending.catch(()=>{if(this.sources.get(key)===pending)this.sources.delete(key);});
          }
          const source=await pending;
          // Let GLTFLoader supply its normal texture type and downstream sampler,
          // transform/color-space handling without a second image decode.
          return {source,image};
        })());
        return local.get(localKey).then(({source,image})=>{
          const texture=new Texture();
          texture.source=source;
          texture.userData=image.extras&&typeof image.extras==='object'?structuredClone(image.extras):{};
          texture.userData.mimeType=image.mimeType;
          texture.needsUpdate=true;
          return texture;
        });
      };
      return {name:'WORLD_structure_image_source_reuse'};
    });
  }

  // Called after this world disposes all of its textures. Individual texture
  // dispose events never close an image still referenced by another sampler.
  // Pending decodes finishing after cancellation close at their resolve point.
  clear(){
    this.closed=true;
    for(const source of this.decodedSources)source.data?.close?.();
    this.decodedSources.clear();this.sources.clear();
  }
}
