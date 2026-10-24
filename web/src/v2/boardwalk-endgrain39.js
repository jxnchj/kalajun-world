import calibration from './generated/boardwalk-endgrain-39.json' with {type:'json'};
export const boardwalkEndGrain39Enabled=()=>new URLSearchParams(globalThis.location?.search||'').get('boardwalkEndGrain39')!=='0';
// Only sawn-face material coordinates change. Shared source geometry, instances,
// collision and physical route heights remain the original authored kit.
export function configureBoardwalkEndGrain39(material){
 const scale=1/(calibration.oldUVMetres*calibration.diameterMetres);
 material.map.repeat.set(scale,scale);
 material.map.offset.set(calibration.newCenter[0]-calibration.oldOffset[0]*scale,calibration.newCenter[1]-calibration.oldOffset[1]*scale);
 material.color.setRGB(...calibration.endFactor);
 material.userData.boardwalkEndGrain39={diameterMetres:calibration.diameterMetres,source:'original wood_end.png',geometryChanged:false};
 return material;
}
