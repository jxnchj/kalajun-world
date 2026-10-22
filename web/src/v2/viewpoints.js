// Authored observation points are navigation only; they never reshape the world.
const LANDSCAPES = [
  {id:"valley",name:"山谷纵览",category:"山野",x:-1700,z:4500,above:130,yaw:344,pitch:-10},
  {id:"meadow",name:"岚川草坡",category:"山野",x:-1972.53,z:3395.88,above:1.8,yaw:299.5,pitch:-1},
  {id:"trail",name:"旧时牧道",category:"山野",x:-2063.23,z:2782.74,above:3,yaw:325.6,pitch:4},
  {id:"west-slope",name:"西坡 · 听岚",category:"山野",x:-7070,z:2670,above:40,yaw:342,pitch:-12},
  {id:"forest",name:"林海与山岭",category:"山野",x:-1732.78,z:3661.16,above:65,yaw:150,pitch:2},
];
export function worldViewpoints({water=[],rooms=[],life=[]}={}) {
  const ids=new Set();
  return [...LANDSCAPES,...water.map((p,i)=>({...p,id:p.id||"water-"+i,category:"溪谷"})),...rooms,...life].map(p=>{
    if(!p.id||ids.has(p.id))throw new Error("Missing or duplicate viewpoint id: "+p.id);
    if(![p.x,p.z,p.yaw,p.pitch,p.y??p.above].every(Number.isFinite))throw new Error("Invalid viewpoint: "+p.id);
    ids.add(p.id);return {...p};
  });
}
export function initialViewpoint(params,places) {
  const id=params.get("view"),byId=places.findIndex(p=>p.id===id);
  if(byId>=0)return byId;
  const legacy=Number(params.get("place")??0);
  return Number.isFinite(legacy)?Math.max(0,Math.min(places.length-1,Math.trunc(legacy))):0;
}
export function floorClearance(world,floorAt,x,z) {
  const terrain=world.surface.heightAt(x,z),floor=floorAt?.(x,z);
  return Number.isFinite(floor)?Math.max(terrain+1.7,floor+1.55):terrain+1.7;
}
