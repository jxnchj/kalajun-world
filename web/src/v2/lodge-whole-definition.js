import {LODGE_DINING_ASSET} from './lodge-opening.js';
import {LODGE_EAST_OPENINGS} from './lodge-cross-openings.js';
export const LODGE_WHOLE_KEY='gh_lanchuan_lodge-whole';
// Continuous receivers across the actual connected building, not extended
// outside across its walls/ceiling. Source geometry remains the intact GLB.
export const LODGE_WHOLE_ASSET=Object.freeze({...LODGE_DINING_ASSET,sourceAsset:LODGE_WHOLE_KEY,name:'岚川公共楼 · 连续室内',floor:{...LODGE_DINING_ASSET.floor,x1:12.5},selectionOpenings:[...LODGE_DINING_ASSET.openings,...LODGE_EAST_OPENINGS]});
export function lodgeWholeEnabled(search=globalThis.location?.search??''){return new URLSearchParams(search).get('lodgeWholeGI')!=='0';}
export const LODGE_WHOLE_GRID=Object.freeze({size:[47,5,13],bounds:[[-12.4,.145,-3.2],[12.325,2.87,3.2]],spacing:[.5375,.68125,6.4/12]});
