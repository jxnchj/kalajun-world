import {Object3D,Matrix4} from 'three';
const native=Object3D.prototype.updateMatrixWorld;
function prototypeMethod(object,name){for(let p=Object.getPrototypeOf(object);p;p=Object.getPrototypeOf(p))if(Object.hasOwn(p,name))return {owner:p,method:p[name]};return null;}
// A matrix algebra fast path, not a cache. All transforms are read on every
// call, and manual/foreign matrices retain native behavior without exemptions.
function translation(m){const e=m.elements;return e.length===16&&e[0]===1&&e[5]===1&&e[10]===1&&e[15]===1&&Object.is(e[1],0)&&Object.is(e[2],0)&&Object.is(e[3],0)&&Object.is(e[4],0)&&Object.is(e[6],0)&&Object.is(e[7],0)&&Object.is(e[8],0)&&Object.is(e[9],0)&&Object.is(e[11],0)&&Number.isFinite(e[12])&&Number.isFinite(e[13])&&Number.isFinite(e[14]);}
export function installStructureMatrixArithmetic41(group,{nativeWorld=native,allowAutoLeaves=false}={}){
 const worldPrototype=prototypeMethod(group,'updateMatrixWorld'),matrixPrototype=prototypeMethod(group.matrixWorld,'multiplyMatrices');
 if(!worldPrototype||worldPrototype.method!==nativeWorld||!Object.hasOwn(worldPrototype.owner,'updateWorldMatrix')||!Object.hasOwn(worldPrototype.owner,'updateMatrix')||!matrixPrototype||!Object.hasOwn(matrixPrototype.owner,'makeTranslation'))throw Error('Structure matrix41 native references must come from scene prototype owners');
 const multiply=matrixPrototype.method,nativeLocal=worldPrototype.owner.updateMatrix,nativeCompose=matrixPrototype.owner.compose;
 if(group.updateMatrixWorld!==nativeWorld)throw Error('Structure matrix41 requires an unwrapped native group');
 const own=Object.hasOwn(group,'updateMatrixWorld'),stats={enabled:true,calls:0,fastLeaves:0,autoLeaves:0,fallbackLeaves:0};
 function update(force){
  stats.calls++;
  if(this.matrixAutoUpdate)this.updateMatrix();
  if(this.matrixWorldNeedsUpdate||force){if(this.matrixWorldAutoUpdate===true){if(this.parent===null)this.matrixWorld.copy(this.matrix);else this.matrixWorld.multiplyMatrices(this.parent.matrixWorld,this.matrix);}this.matrixWorldNeedsUpdate=false;force=true;}
  const parentTranslation=translation(this.matrixWorld),pe=this.matrixWorld.elements;
  for(let i=0,l=this.children.length;i<l;i++){
   const c=this.children[i];
   // Automatic leaves still execute their original local composition on EVERY
   // call. Identity TRS is checked live, never frozen or reused across frames.
   const automatic=allowAutoLeaves&&c.matrixAutoUpdate&&c.updateMatrix===nativeLocal&&c.matrix.compose===nativeCompose
    &&c.pivot===null&&Object.is(c.quaternion.x,0)&&Object.is(c.quaternion.y,0)&&Object.is(c.quaternion.z,0)&&c.quaternion.w===1
    &&c.scale.x===1&&c.scale.y===1&&c.scale.z===1&&Number.isFinite(c.position.x)&&Number.isFinite(c.position.y)&&Number.isFinite(c.position.z);
   if(parentTranslation&&c.parent===this&&c.matrixWorld!==c.matrix&&c.matrixWorld!==this.matrixWorld&&(!c.matrixAutoUpdate||automatic)&&!c.children.length&&c.updateMatrixWorld===nativeWorld&&c.matrixWorld.multiplyMatrices===multiply&&(automatic||translation(c.matrix))){
    if(automatic){c.updateMatrix();stats.autoLeaves++;}
    if(c.matrixWorldNeedsUpdate||force){if(c.matrixWorldAutoUpdate===true){const e=c.matrixWorld.elements,a=c.matrix.elements;
     e[0]=e[5]=e[10]=e[15]=1;e[1]=e[2]=e[3]=e[4]=e[6]=e[7]=e[8]=e[9]=e[11]=0;
     // Keep the native multiplication's additions (including signed zero).
     e[12]=a[12]+0*a[13]+0*a[14]+pe[12];e[13]=0*a[12]+a[13]+0*a[14]+pe[13];e[14]=0*a[12]+0*a[13]+a[14]+pe[14];
    }c.matrixWorldNeedsUpdate=false;}stats.fastLeaves++;
   }else{stats.fallbackLeaves++;c.updateMatrixWorld(force);}
  }
 }
 group.updateMatrixWorld=update;
 return{stats,dispose(){if(group.updateMatrixWorld===update){if(own)group.updateMatrixWorld=nativeWorld;else delete group.updateMatrixWorld;}}};
}
