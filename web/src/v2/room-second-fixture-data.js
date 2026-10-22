// Load only the entered guest room; second fixture bounce is absent from outdoor startup.
export const ROOM_SECOND_FIXTURE_LOADERS=Object.freeze({
"lanchuan-freedom-1":()=>import("./room-second-fixture-data/lanchuan-freedom-1.js").then(m=>m.default),
"lanchuan-freedom-2":()=>import("./room-second-fixture-data/lanchuan-freedom-2.js").then(m=>m.default),
"lanchuan-freedom-3":()=>import("./room-second-fixture-data/lanchuan-freedom-3.js").then(m=>m.default),
});
