// Visual phases follow visible elapsed time, not the bounded control/physics step.
// main.js owns visibility and destination-preparation resets; no background catch-up.
export function visualDelta(dt){return Number.isFinite(dt)&&dt>0?dt:0;}
