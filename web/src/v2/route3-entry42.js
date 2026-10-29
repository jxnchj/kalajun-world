import * as T from 'three';
import asset from './generated/route3-entry42.json' with {type:'json'};
export const route3Entry42Enabled=()=>new URLSearchParams(globalThis.location?.search||'').get('route3Entry42')!=='0';
export const route3Entry42Asset=asset;
// Same authored triangles are consumed by render, Rapier and full wind-envelope
// vegetation contact through the existing structural timber pipeline.
export function route3Entry42(world){
 if(!route3Entry42Enabled())return null;
 const entity=world.entities?.find(e=>e.id===asset.entityId);if(!entity)return null;
 if(world.manifest?.assetMetadata?.[entity.assetId]?.sha256!==asset.sourceSHA256)throw Error('Rear entry source changed; re-audit its opening');
 const q=world.surface.buildingPose(entity),matrix=new T.Matrix4().compose(new T.Vector3(q.x,q.y,q.z),new T.Quaternion().setFromAxisAngle(new T.Vector3(0,1,0),q.rot),new T.Vector3(q.scale.x,q.scale.y,q.scale.z));
 const bounds=new T.Box3(new T.Vector3(...asset.bounds[0]),new T.Vector3(...asset.bounds[1])).applyMatrix4(matrix),steps=[];
 for(let i=0;i<4;i++){
  const p=new T.Vector3(-4.6,asset.floorTop,-4.278+i*.212).applyMatrix4(matrix),forward=new T.Vector3(0,0,1).transformDirection(matrix),normal=new T.Vector3(1,0,0).transformDirection(matrix);
  steps.push({x:p.x,z:p.z,top:p.y,fx:forward.x,fz:forward.z,nx:normal.x,nz:normal.z,run:.212,distance:(i+.5)*.212});
 }
 return {id:'route3:rear-entry42',index:42,extension:true,viewpoint:false,source:'Blender source fitted rear landing; no historic reconstruction claim',width:1.24*q.scale.x,steps,pieces:[{kind:'rear-entry42',matrix}],bounds,length:.84,maxStep:0,triangles:asset.parts['rear-entry42'].triangles,entityId:entity.id};
}
