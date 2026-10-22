#!/usr/bin/env node
// Deterministic geometry snapshot for the editable Blender source and glTF export.
import {writeFile,mkdir} from "node:fs/promises";
import {fileURLToPath} from "node:url";
import {dirname,resolve} from "node:path";
import {createFlowerAssets,createFlowerLODAssets} from "../web/src/v2/flower-assets.js";
const root=resolve(dirname(fileURLToPath(import.meta.url)),"..");
const low=process.argv.includes("--lod");
const destination=resolve(root,process.argv.slice(2).find(arg=>!arg.startsWith("--"))??("assets/src/v2/flowers/meadow-flowers"+(low?"-lod":"")+".source.json"));
const assets=low?createFlowerLODAssets():createFlowerAssets();
const data={schema:1,units:"metres",up:"Y",source:"web/src/v2/flower-assets.js",
  wind:{attribute:"aPlantWind",gltfAttribute:"_PLANT_WIND",components:["structural root-to-tip weight","flexible response weight","local phase"]},
  material:{roughness:.82,metalness:0,doubleSided:true,vertexColor:"linear albedo"},
  variants:assets.variants.map(({id,kind,height,footprint,role,parts})=>{
    if(parts.length!==1)throw new Error("Authoring snapshot requires one merged plant geometry");
    const g=parts[0].geometry;
    return {id,kind,height,footprint,role,position:Array.from(g.attributes.position.array),
      color:Array.from(g.attributes.color.array),wind:Array.from(g.attributes.aPlantWind.array),
      indices:Array.from(g.index.array)};
  })};
await mkdir(dirname(destination),{recursive:true});
await writeFile(destination,JSON.stringify(data));
assets.dispose();
console.log(JSON.stringify({source:destination,variants:data.variants.map(v=>({id:v.id,triangles:v.indices.length/3}))}));
