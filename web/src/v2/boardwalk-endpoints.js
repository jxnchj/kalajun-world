// Associations audited against objects.json and the original authored paths.
// A path ending on open land is NOT labelled as a doorway by nearest-centre search.
export const BOARDWALK_ENDPOINTS=Object.freeze([
 Object.freeze({index:0,name:'坡上小木屋 · 原木步道',start:null,end:'cabins:-1999.5,3372.6:0f598bcbed84e01b'}),
 Object.freeze({index:1,name:'牧坡曲折木道 · 沿原路',start:null,end:null}),
 Object.freeze({index:2,name:'牧居木步道 · 连续通行',start:null,end:'yurts:-1709.8,3617.6:6ce5970440b919ae'}),
 Object.freeze({index:3,name:'岚川木步阶 · 沿原路',start:'guesthouses:-1990,3407.8:2b64af33260a910d',end:'guesthouses:-1993.1,3453.7:5b4988c14b5aecdb'}),
]);
export const BOARDWALK_CABIN=Object.freeze({assetId:'cabin_small',entityId:BOARDWALK_ENDPOINTS[0].end,name:'cabin_small_door0',hinge:Object.freeze([-.550000011920929,0,3.0999999046325684])});
export const BOARDWALK_YURT=Object.freeze({assetId:'yurt_deck',entityId:BOARDWALK_ENDPOINTS[2].end,hinges:Object.freeze([
 Object.freeze({name:'yurt_deck_door0_out',position:Object.freeze([-.550000011920929,0,3.5587074756622314])}),
 Object.freeze({name:'yurt_deck_door1_out',position:Object.freeze([.550000011920929,0,3.5587074756622314])}),
])});
