// Runtime articulation of the intact authored GLB, not a new door/entrance.
export const LODGE_DOOR=Object.freeze({
 assetId:'gh_lanchuan_lodge',entityId:'guesthouses:-1993.1,3453.7:5b4988c14b5aecdb',
 name:'gh_lanchuan_lodge_door0',sourceSHA256:'21d20750939a5915f33211eb3f68d5c9a691307589756fa68055b85c90f85997',
 hinge:Object.freeze([-2.890000104904175,0,3.5]),initial:0,open:1.75,
});
export function lodgeDoorEnabled(search=globalThis.location?.search||''){return new URLSearchParams(search).get('lodgeDoor')!=='0';}
export function lodgeEntranceViewpoints(world){
 if(!lodgeDoorEnabled())return [];
 const entity=world.entities.find(e=>e.id===LODGE_DOOR.entityId);if(!entity)return [];
 const q=world.surface.buildingPose(entity),c=Math.cos(q.rot),s=Math.sin(q.rot),x=q.x+c*(-2.3)*q.scale.x+s*10.3*q.scale.z,z=q.z-s*(-2.3)*q.scale.x+c*10.3*q.scale.z;
 return [{id:'walk-lodge-front',name:'岚川正门 · 前阶步行',category:'牧居生活',x,z,y:world.surface.heightAt(x,z)+1.59,yaw:-q.rot*180/Math.PI,pitch:-7}];
}
