// Load only the entered guest room; no fixture table in outdoor startup.
export const ROOM_FIXTURE_LOADERS=Object.freeze({
"lanchuan-freedom-1":()=>import("./room-fixture-data/lanchuan-freedom-1.js").then(m=>m.default),
"lanchuan-freedom-2":()=>import("./room-fixture-data/lanchuan-freedom-2.js").then(m=>m.default),
"lanchuan-freedom-3":()=>import("./room-fixture-data/lanchuan-freedom-3.js").then(m=>m.default),
});
