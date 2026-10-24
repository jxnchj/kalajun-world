// guesthouses.py::lanchuan_lodge E exterior openings, Blender Z-up -> glTF Y-up.
// The x=-3.7 connecting passage is opaque-BVH connectivity, never a sky source.
export const LODGE_EAST_OPENINGS=Object.freeze([
 {kind:'window',center:[-2.3,1.15,3.5],width:1.2,height:2.3,normal:[0,0,1],skyWeight:.9,source:'closed-glazed-main-door'},
 ...[[.7,2],[3.9,2],[6.9,1.6]].map(([x,width])=>({kind:'window',center:[x,1.24,3.5],width,height:2.32,normal:[0,0,1],skyWeight:.9})),
 ...[9.3,11.4].map(x=>({kind:'window',center:[x,1.475,3.5],width:1,height:1.15,normal:[0,0,1],skyWeight:.9})),
 ...[-.7,3.3,6.8,10.4].map(x=>({kind:'window',center:[x,1.5,-3.5],width:.8,height:.7,normal:[0,0,-1],skyWeight:.9})),
 {kind:'window',center:[12.7,1.475,0],width:1,height:1.15,normal:[1,0,0],skyWeight:.9},
]);
