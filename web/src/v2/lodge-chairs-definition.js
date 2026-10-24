import source from './generated/lodge-chairs-source-38.json' with {type:'json'};
import {LODGE_DOOR} from './lodge-door.js';
import {LODGE_WHOLE_ASSET} from './lodge-whole-definition.js';
export const LODGE_CHAIRS_KEY='gh_lanchuan_lodge-chairs-whole';
export const LODGE_CHAIRS_SOURCE=Object.freeze(source);
export const LODGE_CHAIRS_ASSET=Object.freeze({...LODGE_WHOLE_ASSET,sourceAsset:LODGE_CHAIRS_KEY});
export const LODGE_CHAIRS_DOOR=Object.freeze({...LODGE_DOOR,sourceSHA256:source.sourceSHA256});
export function lodgeChairsEnabled(search=globalThis.location?.search??''){
 const p=new URLSearchParams(search),explicit=p.get('lodgeChairs38');
 if(explicit==='0')return false;
 if(p.get('lodgeWood')==='1'||p.get('lodgeFurniture')==='0'){
  if(explicit==='1')throw Error('lodgeChairs38 requires its complete furniture source; incompatible source switches');
  return false; // Existing original-source comparison URLs retain their paired GI.
 }
 return true;
}
