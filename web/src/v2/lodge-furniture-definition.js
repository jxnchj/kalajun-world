import source from './generated/lodge-furniture-source-38.json' with {type:'json'};
import {LODGE_DOOR} from './lodge-door.js';
import {LODGE_WHOLE_ASSET} from './lodge-whole-definition.js';
export const LODGE_FURNITURE_KEY='gh_lanchuan_lodge-furniture-whole';
export const LODGE_FURNITURE_ASSET=Object.freeze({...LODGE_WHOLE_ASSET,sourceAsset:LODGE_FURNITURE_KEY});
export function lodgeFurnitureEnabled(search=globalThis.location?.search??''){
 const params=new URLSearchParams(search),explicit=params.get('lodgeFurniture');
 if(explicit==='1'&&params.get('lodgeWood')==='1')throw new Error('lodgeFurniture and lodgeWood have different source bindings; choose one candidate');
 // Existing wood comparison URLs keep their matching original source and GI.
 return explicit!=='0'&&params.get('lodgeWood')!=='1';
}

export const LODGE_FURNITURE_SOURCE=Object.freeze(source);
export const LODGE_FURNITURE_DOOR=Object.freeze({...LODGE_DOOR,sourceSHA256:source.sourceSHA256});
