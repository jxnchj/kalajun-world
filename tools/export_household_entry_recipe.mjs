// Export the actual representative site's terrain/pose contract for Blender.
// Geometry remains authored/exported in Blender; this is not a model generator.
import {readFileSync,writeFileSync,mkdirSync} from 'node:fs';
import {gunzipSync} from 'node:zlib';
import {fileURLToPath} from 'node:url';
import {createHash} from 'node:crypto';
import {createWorldData,decodeHeightBytes} from '../web/src/v2/world-data.js';
import {householdEntryStepRecipes} from '../web/src/v2/household-entry-steps.js';
const root=new URL('../',import.meta.url),publicRoot=new URL('web/public/',root),json=n=>JSON.parse(readFileSync(new URL(n,publicRoot))),bin=n=>new Uint8Array(gunzipSync(readFileSync(new URL(n,publicRoot)))),meta=json('data/scene.json');
// Building poses and final height are independent of landcover classification.
// Full DEM/detail/streams/objects remain authoritative; no flat fixture.
const lc={width:1,height:1,data:new Uint8Array([255,128,0,255])};
const world=createWorldData({meta,objects:json('data/objects.json'),detailMeta:json('data/detail.json'),manifest:json('world-v2/manifest.json'),streamData:json('data/streams.json'),coreHeights:decodeHeightBytes(bin('data/core_height.bin.gz'),meta.core.n,meta.height_scale),farHeights:decodeHeightBytes(bin('data/far_height.bin.gz'),meta.far.n,meta.height_scale),detailBytes:bin('data/detail.bin.gz'),coreLandcover:lc,farLandcover:lc});
const recipe=householdEntryStepRecipes(world).find(r=>r.courses.length),p=recipe.pose,ground=[];
for(let iz=0;iz<=48;iz++)for(let ix=0;ix<=32;ix++){
 const x=-.6+ix*.1,z=3.3+iz*.1,wx=p.x+Math.cos(p.rot)*x*p.scale.x+Math.sin(p.rot)*z*p.scale.z,wz=p.z-Math.sin(p.rot)*x*p.scale.x+Math.cos(p.rot)*z*p.scale.z;
 ground.push([x,(world.surface.heightAt(wx,wz)-p.y)/p.scale.y,z]);
}
const sources=['web/public/data/core_height.bin.gz','web/public/data/detail.bin.gz','web/public/data/objects.json','assets/src/v2/pastoral/house_a-lived.blend','assets/src/v2/pastoral/household-living-32.blend'].map(path=>({path,sha256:createHash('sha256').update(readFileSync(new URL(path,root))).digest('hex')}));
const result={version:'household-entry-tea-34',entityId:recipe.entityId,style:recipe.style,designStatus:'Designed stone approach at one verified original entity, not a surveyed historical stair',pose:p,existingTread:{x0:.23,x1:1.77,z0:4.40,z1:4.76,top:-.19},existingTreadGap:recipe.existingTreadGap,courses:recipe.courses,ground:{columns:33,rows:49,positions:ground},sources};
const out=new URL('assets/src/v2/pastoral/household-entry-tea-34.recipe.json',root);mkdirSync(fileURLToPath(new URL('.',out)),{recursive:true});writeFileSync(out,JSON.stringify(result,null,2)+'\n');console.log(JSON.stringify({path:fileURLToPath(out),entityId:result.entityId,courses:result.courses.length,groundSamples:ground.length}));
