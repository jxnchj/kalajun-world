import source from './generated/lodge-tables-source-38.json' with {type:'json'};
import {LODGE_DOOR} from './lodge-door.js';
import {LODGE_WHOLE_ASSET} from './lodge-whole-definition.js';
export const LODGE_TABLES_KEY='gh_lanchuan_lodge-tables-whole';
export const LODGE_TABLES_SOURCE=Object.freeze(source);
export const LODGE_TABLES_ASSET=Object.freeze({...LODGE_WHOLE_ASSET,sourceAsset:LODGE_TABLES_KEY});
export const LODGE_TABLES_DOOR=Object.freeze({...LODGE_DOOR,sourceSHA256:source.sourceSHA256});
export function lodgeTablesEnabled(search=globalThis.location?.search??''){
 const p=new URLSearchParams(search),explicit=p.get('lodgeTables38');
 if(explicit==='0')return false;
 if(p.get('lodgeChairs38')==='0'||p.get('lodgeFurniture')==='0'||p.get('lodgeWood')==='1'){if(explicit==='1')throw Error('lodgeTables38 requires its complete chairs-derived source');return false;}
 return true;
}
