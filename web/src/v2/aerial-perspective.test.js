import test from "node:test";
import assert from "node:assert/strict";
import { averageAirDensity, aerialTransmittance } from "./aerial-perspective.js";

test("air path integral is finite, reciprocal and continuous through horizontal views", () => {
  for (const h of [1400, 8000]) for (const a of [-500, 2000, 6000, 18000]) for (const b of [-500, 2000, 6000, 18000]) {
    const value = averageAirDensity(a, b, h);
    assert.ok(Number.isFinite(value) && value > 0);
    assert.ok(Math.abs(value - averageAirDensity(b, a, h)) < 1e-10);
  }
  assert.equal(averageAirDensity(2000, 2000, 1400), 1);
  assert.ok(Math.abs(averageAirDensity(2000, 2000.999, 1400) - averageAirDensity(2000, 2001.001, 1400)) < 1e-6);
});

test("clear-air transmittance changes continuously with distance and thins at altitude", () => {
  const origin = { x: 0, y: 2000, z: 0 };
  assert.deepEqual(aerialTransmittance(origin, origin), [1, 1, 1]);
  let previous = [1, 1, 1];
  for (const x of [1, 100, 1000, 5000, 10000, 40000, 80000]) {
    const value = aerialTransmittance(origin, { ...origin, x });
    value.forEach((v, i) => { assert.ok(v > 0 && v <= previous[i]); });
    assert.ok(value[0] > value[1] && value[1] > value[2]); previous = value;
  }
  const low = aerialTransmittance(origin, { ...origin, x: 10000 });
  const high = aerialTransmittance({ x: 0, y: 6500, z: 0 }, { x: 10000, y: 6500, z: 0 });
  high.forEach((v, i) => assert.ok(v > low[i]));
  assert.ok(low[0] > 0.85 && low[2] > 0.7, "clear mountain air must retain distant silhouettes");
});
