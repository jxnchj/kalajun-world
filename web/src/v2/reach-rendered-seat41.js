import {reachPlantIntersectsWater40}from'./reach-water-contact40.js';
// Mirrors World's settled height sampling and centre-chosen diagonal at a
// particular resolution. No altered contact threshold or wind envelope.
export function reachRenderedHeight41(world,x,z,spacing=.15625){
 const x0=Math.floor(x/spacing)*spacing,z0=Math.floor(z/spacing)*spacing,u=(x-x0)/spacing,v=(z-z0)/spacing,h=(a,b)=>Math.fround(world.surface.heightAt(a,b));
 const a=h(x0,z0),b=h(x0+spacing,z0),c=h(x0,z0+spacing),d=h(x0+spacing,z0+spacing),center=world.surface.heightAt(x0+spacing*.5,z0+spacing*.5);
 if(Math.abs((a+d)/2-center)<Math.abs((b+c)/2-center))return u<=v?a+(c-a)*v+(d-c)*u:a+(b-a)*u+(d-b)*v;
 return u+v<=1?a+(b-a)*u+(c-a)*v:d+(b-d)*(1-v)+(c-d)*(1-u);
}
export function reachSettledWaterSafe41(world,root,asset){
 const actual=asset.geometry.clone(),p=actual.attributes.position;
 for(const group of asset.seats){const level=Math.min(...group.points.map(v=>reachRenderedHeight41(world,v.x,v.z)))-.002,delta=(level-group.level)/(root.sy??root.s);for(let i=group.start;i<group.start+group.count;i++)p.setY(i,p.getY(i)+delta);}
 const safe=!reachPlantIntersectsWater40(world,root,[actual]);actual.dispose();return safe;
}
