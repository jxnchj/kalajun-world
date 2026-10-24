// Opt-in physical candidate for the measured representative forest reach.
// Source root selection, water levels, widths and moisture/exclusion are untouched.
export const FOREST_BANK_LINE='river-41711e76-99c57ca2';
const clamp=x=>Math.max(0,Math.min(1,x));
const smooth=(a,b,x)=>{const t=clamp((x-a)/(b-a));return t*t*(3-2*t);};
// Reuse actual land-cover forest fraction and the existing canopy channel.
// This is a root-mat potential, not a claim that procedural cover is a survey.
export function forestBankRootCover(cover,field){
 return smooth(.12,.9,cover.r)*smooth(.26,.66,field[1]);
}
export function forestRootedShoulderHeight({lineId,section,side,distance,height,rawHeight,rootCover,offset,protectedGround}){
 if(lineId!==FOREST_BANK_LINE||protectedGround!==false)return height;
 if(![distance,height,rawHeight,rootCover,offset,section?.level,section?.outer].every(Number.isFinite)||![-1,1].includes(side))throw new TypeError('Invalid forest bank physical inputs');
 const half=side<0?section.left:section.right,d=distance-half;
 if(d<=0||distance>=section.outer||rawHeight<=section.level||rootCover<=0)return height;
 const bar=side<0?section.barLeft:section.barRight;
 // Existing erosion faces already rise 4–13 cm in the first 10 cm. Leave
 // those exact profiles alone. Only rooted depositional shoulders qualify.
 const deposition=smooth(.60,.92,bar),reach=1-smooth(36,60,Math.abs(offset));
 // Do not turn low DEM beyond the water polygon into a dam. Suppress the
 // proposal continuously before reaching zero source freeboard; taller banks
 // need no extra mat. The authoritative raw water crossing is not moved.
 const freeboard=rawHeight-section.level;
 const room=smooth(0,.025,freeboard)*(1-smooth(.08,.16,freeboard));
 const span=Math.min(1.25,(section.outer-half)*.90);
 if(d>=span)return height;
 const contact=clamp(d/.55),rise=contact*(2-contact);
 const release=1-smooth(span*.55,span,d);
 return height+.09*clamp(rootCover)*deposition*reach*room*rise*release;
}

export function seatForestShoulderRoot(world,root){
 if(!root||!world.forestShoulderSourceWorld)return root;
 const delta=world.surface.heightAt(root.x,root.z)-world.forestShoulderSourceWorld.surface.heightAt(root.x,root.z);
 return delta===0?root:{...root,y:root.y+delta};
}
