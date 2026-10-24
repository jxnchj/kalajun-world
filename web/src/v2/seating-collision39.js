const Q={x:0,y:0,z:0,w:1};
function pose(c,p,b){return{x:p.x-c.origin.x,y:p.y-b.eye+b.height/2-c.origin.y,z:p.z-c.origin.z};}
export function seatPathClear39(c,start,points,body){
 if(!c.enabled||!c.physics||!c.body)return false;c.ensureNearby(start);c.physics.step();const shape=new c.R.Capsule(body.height/2-body.radius,body.radius);let p=start;
 for(const end of points){const at=pose(c,p,body),to=pose(c,end,body),velocity={x:to.x-at.x,y:to.y-at.y,z:to.z-at.z};if(c.physics.intersectionWithShape(at,Q,shape,undefined,undefined,c.body)!==null)return false;const hit=c.physics.castShape(at,Q,velocity,shape,.005,1,true,undefined,undefined,c.body);if(hit&&hit.time_of_impact<.99999)return false;if(c.physics.intersectionWithShape(to,Q,shape,undefined,undefined,c.body)!==null)return false;p=end;}return true;
}
export function useSeatBody39(c,position,body){const replacement=c.physics.createCollider(c.R.ColliderDesc.capsule(body.height/2-body.radius,body.radius).setTranslation(...Object.values(pose(c,position,body))));if(c.body)c.physics.removeCollider(c.body,true);c.body=replacement;c.velocityY=0;}
export function placeSeatBody39(c,position,body){c.body.setTranslation(pose(c,position,body));}
