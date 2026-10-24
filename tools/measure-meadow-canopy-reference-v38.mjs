import {writeFileSync,readFileSync} from 'node:fs';
import {createHash} from 'node:crypto';
import {meadowGeometry} from '../web/src/v2/ecology.js';
import {canopyReferenceSamples,angularDirection,sourceCanopyResponse,roughDiffuseResponse,fitRoughDiffuse} from '../web/src/v2/meadow-canopy-reference.js';
import {sunPosition,beijingTime} from '../web/src/sun.js';
const meta=JSON.parse(readFileSync(new URL('../web/public/data/scene.json',import.meta.url)));
const sceneSun=[870,1080,1200].map(minutes=>({minutes,...sunPosition(meta.lat,meta.lon,beijingTime('2026-07-25 '+String(Math.floor(minutes/60)).padStart(2,'0')+':'+String(minutes%60).padStart(2,'0')+':00'))}));
const result={sceneSun,version:38,scope:'Unit diffuse source-normal reference; no mutual occlusion, no ground BRDF, no runtime adoption',sourceSHA256:createHash('sha256').update(readFileSync(new URL('../web/src/v2/ecology.js',import.meta.url))).digest('hex'),material:{type:'MeshStandardMaterial DoubleSide',diffuse:'Unit albedo factored out; existing vertex pigment/root shading is not recoloured',specular:'Excluded from diffuse comparison; existing roughness approximately .93 unchanged'},cases:[]};
for(const near of [true,false])for(const heightRatio of [.78,.955,1.13,.78*.77]){
 const geometry=meadowGeometry(near),{samples,stats}=canopyReferenceSamples(geometry,{heightRatio}),rows=[];
 for(const sunElevation of [15,30,45,60,75])for(const viewElevation of [5,20,45,75])for(const relativeAzimuth of [0,90,180]){
  const light=angularDirection(sunElevation),view=angularDirection(viewElevation,relativeAzimuth),source=sourceCanopyResponse(samples,light,view);
  rows.push({sunElevation,viewElevation,relativeAzimuth,light,view,source,flat:light[1]});
 }
 const fit=fitRoughDiffuse(rows);for(const r of rows)r.fit=roughDiffuseResponse(r.light,r.view,fit.sigmaDegrees*Math.PI/180);
 const actualSunRows=[];for(const sun of sceneSun)for(const viewElevation of [1,20,45])for(const relativeAzimuth of [0,90,180]){const light=angularDirection(sun.elevation),view=angularDirection(viewElevation,relativeAzimuth),source=sourceCanopyResponse(samples,light,view),prediction=roughDiffuseResponse(light,view,fit.sigmaDegrees*Math.PI/180);actualSunRows.push({...sun,viewElevation,relativeAzimuth,source,prediction,error:prediction-source});}
 result.cases.push({lod:near?'near':'middle',...stats,fit,rows,actualSunRows});geometry.dispose();
}
result.acceptance={maxAbsoluteError:.08,rmse:.04,meaning:'Engineering fit tolerance in unit diffuse response; does not establish physical canopy validity'};
result.fitAccepted=result.cases.every(c=>c.fit.maxAbsoluteError<=result.acceptance.maxAbsoluteError&&c.fit.rmse<=result.acceptance.rmse);
const path=new URL('./reports/meadow-canopy-reference-v38.json',import.meta.url);writeFileSync(path,JSON.stringify(result,null,2)+'\n');
console.log(JSON.stringify({path:path.pathname,fitAccepted:result.fitAccepted,cases:result.cases.map(({rows,actualSunRows,...c})=>c)},null,2));
