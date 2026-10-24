import {RoomExteriorGroundBounce} from './room-exterior-ground-bounce.js';
import {RoomExteriorGround} from './room-exterior-ground.js';
import {DataUtils,MathUtils} from 'three';
import {ROOM_BOUNCE_DATA} from './room-bounce-registry.js';
import {ROOM_SECOND_BOUNCE_DATA} from './room-second-bounce-registry.js';
export const EXTERIOR_ROOM_ENTITY='cabins:-3967,2822.3:eec01b1433084d64';
export const EXTERIOR_ROOM_KEY='house_a-living-2';
const decode=f=>{const bytes=Uint8Array.from(atob(f.data),c=>c.charCodeAt(0)),view=new DataView(bytes.buffer),out=new Float32Array(bytes.length/2);for(let i=0;i<out.length;i++)out[i]=DataUtils.fromHalfFloat(view.getUint16(i*2,true));return out;};
export function validateExteriorRoom(data,pose){
 const base=ROOM_BOUNCE_DATA[EXTERIOR_ROOM_KEY];
 if(data.entityId!==EXTERIOR_ROOM_ENTITY||data.roomKey!==EXTERIOR_ROOM_KEY)throw new Error('Exterior terrain room identity differs');
 if(JSON.stringify(data.pose)!==JSON.stringify(pose))throw new Error('Exterior terrain room pose changed; rebake required');
 if(JSON.stringify(data.externalSources)!==JSON.stringify(base.externalSources))throw new Error('Exterior furniture sources changed');
 for(const state of ['open','closed'])for(const component of ['sky','groundSky'])for(const order of ['first','second']){
  const field=data.states[state][component][order];for(const prop of ['sourceSHA256','blendSHA256','bounds','size','validProbes','openings'])if(JSON.stringify(field[prop])!==JSON.stringify(base[prop]))throw new Error('Exterior room source/grid differs: '+prop);
 }
 return data;
}

export function validateExteriorApertures(data,baseData){
 for(const key of ['entityId','roomKey','pose','externalSources','terrainSources'])if(JSON.stringify(data[key])!==JSON.stringify(baseData[key]))throw new Error('Exterior aperture identity/source mismatch: '+key);
 const base=ROOM_BOUNCE_DATA[EXTERIOR_ROOM_KEY];
 for(const key of ['bounds','size','validProbes','sourceSHA256','blendSHA256','openings'])if(JSON.stringify(data[key])!==JSON.stringify(base[key]))throw new Error('Exterior aperture geometry binding mismatch: '+key);
 if(data.encoding!=='u8-opening-slabs'||data.apertureSamples!==36)throw new Error('Exterior aperture quadrature mismatch');
 const count=data.size.reduce((a,b)=>a*b,1)*3,fields={};
 for(const state of ['open','closed']){
  const own=Uint8Array.from(atob(data.states[state].ownOnly),c=>c.charCodeAt(0)),sky=Uint8Array.from(atob(data.states[state].upperSky),c=>c.charCodeAt(0));
  if(own.length!==count||sky.length!==count)throw new Error('Exterior aperture dimensions mismatch');
  if(sky.some((value,i)=>value>own[i]))throw new Error('Exterior aperture creates unoccluded sky through an opaque opening');
  fields[state]=sky;
 }
 return fields;
}

export class RoomExteriorTerrain{
 constructor(){this.ground=new RoomExteriorGround();this.groundBounce=new RoomExteriorGroundBounce();this.enabled=new URLSearchParams(globalThis.location?.search||'').get('roomExteriorTerrain')==='1';this.target=false;this.ready=false;this.disposed=false;this.stats={enabled:this.enabled,active:false,pending:false,ready:false,model:'one entity: upper sky plus terrain sky reflection; one/two internal diffuse bounces; original solar remains; direct terrain sky/solar return plus terrain solar followed by one/two internal bounces; finite static transport, not complete dynamic GI'};}
 setRoom(item){this.target=this.enabled&&item?.id===EXTERIOR_ROOM_ENTITY;if(this.target)this.pose=item.pose;this.stats.active=this.target&&this.ready;}
 prepare(key){
  if(!this.target||key!==EXTERIOR_ROOM_KEY)return Promise.resolve();if(this.pending)return this.pending;this.stats.pending=true;
  this.pending=Promise.all([import('./room-exterior-terrain-data.js'),import('./room-exterior-aperture-data.js'),import('./room-exterior-ground-data.js'),import('./room-exterior-ground-bounce-data.js')]).then(([m,apertureModule,groundModule,groundBounceModule])=>{
   const data=validateExteriorRoom(m.default,this.pose);if(this.disposed)return;this.data=data;this.ground.setData(groundModule.default,data);this.stats.groundDirect=this.ground.stats;this.groundBounce.setData(groundBounceModule.default,data);this.stats.groundBounce=this.groundBounce.stats;this.apertures=validateExteriorApertures(apertureModule.default,data);this.apertureMetadata=apertureModule.default;this.fields={};
   for(const state of ['open','closed']){this.fields[state]={};for(const component of ['sky','groundSky']){this.fields[state][component]={};for(const order of ['first','second'])this.fields[state][component][order]=decode(data.states[state][component][order]);}}
   this.originalOpen=[decode(ROOM_BOUNCE_DATA[key]),decode(ROOM_SECOND_BOUNCE_DATA[key])];this.ready=true;Object.assign(this.stats,{ready:true,pending:false,bytes:Object.values(this.fields).flatMap(s=>Object.values(s).flatMap(c=>Object.values(c))).reduce((a,b)=>a+b.byteLength,0)});
  }).catch(e=>{this.error=e;this.stats.pending=false;throw e;});return this.pending;
 }
 apply(key,output,owner,daylight,scale,secondWeight,fraction,groundContext){
  this.stats.active=false;this.ground.stats.active=false;this.groundBounce.stats.active=false;if(!this.target||key!==EXTERIOR_ROOM_KEY)return;if(this.error)throw this.error;if(!this.ready)return;
  // This candidate has no lamp source. At zero daylight write an explicitly
  // empty radiance field when no lamp-normalization scale is active.
  // If fixtures are active, the base sky is already zero; preserve their RGB.
  // Preserve validity/aperture channels; never retain daytime coefficients.
  if(daylight<=0){if(scale<=0)for(let i=0;i<output.length;i++)if(i%4!==3)output[i]=0;Object.assign(this.stats,{active:true,oldMeanBandSum:0,skyMeanBandSum:0,groundSkyMeanBandSum:0,groundSolarIncluded:false,directApertureSkyCorrected:false});return;}
  const closed=owner.fields.get(key);if(!closed)return;
  if(!this.originalClosed)this.originalClosed=[decode(closed.data.sky),decode(closed.data.secondSky)];
  const weight=MathUtils.clamp(secondWeight,0,1),ratio=scale>0?daylight/scale:0;
  let removed=0,sky=0,ground=0;
  for(let i=0;i<output.length;i++)if(i%4!==3){
   const old=MathUtils.lerp(this.originalClosed[0][i]+weight*this.originalClosed[1][i],this.originalOpen[0][i]+weight*this.originalOpen[1][i],fraction);
   const sum=c=>MathUtils.lerp(this.fields.closed[c].first[i]+weight*this.fields.closed[c].second[i],this.fields.open[c].first[i]+weight*this.fields.open[c].second[i],fraction);
   const directSky=sum('sky'),groundSky=sum('groundSky');
   output[i]=DataUtils.toHalfFloat(DataUtils.fromHalfFloat(output[i])+(directSky+groundSky-old)*ratio);
   if(i<output.length/4){removed+=old;sky+=directSky;ground+=groundSky;}
  }
  if(groundContext){this.ground.apply(output,{daylight,scale,fraction,...groundContext});if(this.ground.solarEnabled)this.groundBounce.apply(output,{daylight,scale,fraction,...groundContext});}
  Object.assign(this.stats,{active:true,oldMeanBandSum:removed,skyMeanBandSum:sky,groundSkyMeanBandSum:ground,groundSolarIncluded:Boolean(groundContext&&this.ground.solarEnabled),groundDirectSkyIncluded:Boolean(groundContext),directApertureSkyCorrected:false});
 }
 aperture(key,offset,fraction){
  if(!this.target||!this.ready||key!==EXTERIOR_ROOM_KEY)return null;
  this.stats.directApertureSkyCorrected=true;this.stats.directApertureModel=this.apertureMetadata.scope;
  return MathUtils.lerp(this.apertures.closed[offset],this.apertures.open[offset],MathUtils.clamp(fraction,0,1));
 }
 dispose(){this.disposed=true;this.fields=null;this.ground.dispose();this.groundBounce.dispose();}
}
