import {createReadStream} from "node:fs";
import {realpath, stat} from "node:fs/promises";
import {resolve, extname, sep} from "node:path";

const mime={".html":"text/html; charset=utf-8",".js":"text/javascript; charset=utf-8",".css":"text/css; charset=utf-8",".json":"application/json",".png":"image/png",".jpg":"image/jpeg",".webp":"image/webp",".svg":"image/svg+xml",".glb":"model/gltf-binary",".wasm":"application/wasm",".gz":"application/octet-stream"};
export function useNativeGzip(req,prefix,path){
 const encodings=(req.headers?.["accept-encoding"]||"").split(",");
 const acceptsGzip=encodings.some(item=>{const [coding,...params]=item.trim().toLowerCase().split(";");const q=params.find(v=>v.trim().startsWith("q="));return coding==="gzip"&&(!q||Number(q.trim().slice(2))>0);});
 if(!["dist-v2","dist-route-v21-baseline","dist-route-v22-baseline","dist-route-v23-baseline","dist-route-v24-baseline","dist-route-v25-baseline","dist-route-v26-baseline","dist-route-v27-baseline","dist-route-v28-baseline","dist-route-v29-baseline","dist-route-v30-baseline","dist-route-v31-baseline","dist-route-v32-baseline"].includes(prefix)||!path.endsWith(".gz")||!acceptsGzip)return false;
 try{return new URL(req.headers?.referer||"http://localhost").searchParams.get("httpGzip")!=="0";}catch{return false;}
}
// Built artifacts must reach the browser byte-for-byte. Vite's transform
// middleware otherwise treats dist JavaScript as source and injects its runtime.
export function builtPreview(root) {
 return {name:"kalajun-built-preview",configureServer(server){
  server.middlewares.use(async(req,res,next)=>{
   let path;try{path=decodeURIComponent(new URL(req.url,"http://localhost").pathname);}catch{res.statusCode=400;res.end();return;}
   const prefix=["dist-v2","dist-route-v19-baseline","dist-route-v20-baseline","dist-route-v21-baseline","dist-route-v22-baseline","dist-route-v23-baseline","dist-route-v24-baseline","dist-route-v25-baseline","dist-route-v26-baseline","dist-route-v27-baseline","dist-route-v28-baseline","dist-route-v29-baseline","dist-route-v30-baseline","dist-route-v31-baseline","dist-route-v32-baseline"].find(name=>path.startsWith("/"+name+"/"));
   if(!prefix){next();return;}
   if(req.method!=="GET"&&req.method!=="HEAD"){res.statusCode=405;res.end();return;}
   try{
    const base=await realpath(resolve(root,prefix));
    const file=await realpath(resolve(base,path.slice(prefix.length+2)));
    if(!file.startsWith(base+sep)){res.statusCode=403;res.end();return;}
    const info=await stat(file);if(!info.isFile()){res.statusCode=404;res.end();return;}
    res.setHeader("Content-Type",mime[extname(file)]||"application/octet-stream");
    res.setHeader("Content-Length",info.size);
    // Let the browser network decoder consume existing lossless gzip files.
    // Application loaders also accept plain decoded bytes, so there is no
    // second decompression. Each historical baseline retains the serving used in its own round.
    if(useNativeGzip(req,prefix,path)){
      res.setHeader("Content-Encoding","gzip");
      res.setHeader("Vary","Accept-Encoding, Referer");
    }
    res.setHeader("Cache-Control","no-store");
    if(req.method==="HEAD"){res.end();return;}
    const stream=createReadStream(file);stream.on("error",()=>res.destroy());stream.pipe(res);
   }catch(error){res.statusCode=error.code==="ENOENT"?404:403;res.end();}
  });
 }};
}
