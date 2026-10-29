import {selectTextileGI73} from './house-textiles-gi73.js';
// Generated room-specific loaders; outdoor startup does not load solar tables.
export const ROOM_SECOND_SOLAR_LOADERS = Object.freeze({
  "yurt":()=>import("./room-second-solar-data/yurt.js").then(module=>module.default),
  "lanchuan-freedom-1":()=>import("./room-second-solar-data/lanchuan-freedom-1.js").then(module=>module.default),
  "lanchuan-freedom-3":()=>import("./room-second-solar-data/lanchuan-freedom-3.js").then(module=>module.default),
  "lanchuan-freedom-2":()=>import("./room-second-solar-data/lanchuan-freedom-2.js").then(module=>module.default),
  "house_a":()=>selectTextileGI73('house_a',()=>import("./room-second-solar-data/house_a.js").then(module=>module.default),{part:'secondSolar'}),
});
