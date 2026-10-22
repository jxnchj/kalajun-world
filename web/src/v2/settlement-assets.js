// Authored replacement assets only. Entity layout and placement remain world-data authority.
export const SETTLEMENT_ASSETS = Object.freeze({
  house_a:Object.freeze({
    sourceAsset:"house_a",url:"v2/house_a_lived.glb",name:"林缘传统木屋",
    metadataURL:"v2/house_a_lived.metadata.json",
    floor:Object.freeze({shape:"rect",x0:-3.4,x1:3.4,z0:-2.3,z1:2.3,y:.035}),
    floorY:.035,
    outdoor:Object.freeze({x0:-3.45,x1:3.45,z0:2.78,z1:4.76,groundY:-.35,deckY:-.115,plantMargin:.18}),
    openings:Object.freeze([
      {kind:"door",center:[1,.995,2.5],width:1.1,height:1.99,normal:[0,0,1]},
      {kind:"window",center:[-2,1.45,2.5],width:1.25,height:1.2,normal:[0,0,1]},
      {kind:"window",center:[0,1.45,-2.5],width:1.25,height:1.2,normal:[0,0,-1]},
    ]),
    entry:Object.freeze({from:[1,1.6,1.8],to:[-.9,.9,-1.15]}),
    window:Object.freeze({from:[-2.3,1.7,1.6],to:[-2.3,1.7,9]}),
    representativeId:"cabins:-1743,3612:30f9adc9fb584805",
    instanceCount:113,
    source:"assets/src/v2/pastoral/house_a-lived.blend",
    references:["https://www.xjyl.gov.cn/xjylz/c112431/202609/bcea37d2fb954a6eb04c437c40785efb.shtml"],
  }),
  yurt:Object.freeze({
    sourceAsset:"yurt",url:"v2/yurt_lived.glb",name:"溪谷牧居毡房",
    metadataURL:"v2/yurt_lived.metadata.json",
    floor:Object.freeze({shape:"circle",radius:3.16,y:.025}),floorY:.025,
    openings:Object.freeze([
      {kind:"door",center:[0,.775,3.154],width:1.1,height:1.55,normal:[0,0,1]},
      {kind:"roof-crown",center:[0,3.25,0],radius:.62,partlyCovered:true,normal:[0,1,0]},
    ]),
    entry:Object.freeze({from:[0,1.55,2.2],to:[-.35,.75,-1.35]}),
    window:Object.freeze({from:[.15,1.4,.6],to:[0,1.35,9]}),
    representativeId:"yurts:-1551,3489:3337d4a3e634caaf",
    instanceCount:72,source:"assets/src/v2/pastoral/yurt-lived.blend",
    references:[
      "https://ich.unesco.org/en/RL/traditional-knowledge-and-skills-in-making-kyrgyz-kazakh-and-karakalpak-yurts-turkic-nomadic-dwellings-02284",
      "https://archive.unesco-ichcap.org/eng/ek/sub2017_4/sub2.php",
    ],
  }),
});
export function settlementAssetFor(assetId){return SETTLEMENT_ASSETS[assetId]??null;}
export function settlementMeshRole(assetId,name,extras={}){
  if(!SETTLEMENT_ASSETS[assetId])return null;
  if(["body","interior","fine","roof-grass"].includes(extras.detailRole))return extras.detailRole;
  return null; // The existing loader may continue its verified legacy classification.
}
function localToWorld(pose,p){
  const c=Math.cos(pose.rot),s=Math.sin(pose.rot),x=p[0]*pose.scale.x,z=p[2]*pose.scale.z;
  return{x:pose.x+c*x+s*z,y:pose.y+p[1]*pose.scale.y,z:pose.z-s*x+c*z};
}
export function settlementAssetViewpoints(world){
  return Object.values(SETTLEMENT_ASSETS).flatMap(asset=>{
    const entity=world.entities.find(e=>e.id===asset.representativeId);
    if(!entity)return[];
    const pose=world.surface.buildingPose(entity);
    return["entry","window"].map(kind=>{
      const view=asset[kind],p=localToWorld(pose,view.from),to=localToWorld(pose,view.to);
      const dx=to.x-p.x,dy=to.y-p.y,dz=to.z-p.z;
      return{id:"pastoral-"+asset.sourceAsset+"-"+kind,name:asset.name+(kind==="entry"?" · 室内":" · 向外眺望"),
        category:"居所",entityId:entity.id,assetId:asset.sourceAsset,...p,
        above:p.y-world.surface.heightAt(p.x,p.z),yaw:Math.atan2(dx,-dz)*180/Math.PI,
        pitch:Math.atan2(dy,Math.hypot(dx,dz))*180/Math.PI};
    });
  });
}
