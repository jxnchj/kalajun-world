// NOAA solar position (same algorithm as tools/viewpoint.py).
// Returns azimuth (deg, clockwise from north) and elevation (deg).

const rad = Math.PI / 180;

export function sunPosition(lat, lon, date) {
  const jd = date.getTime() / 86400000 + 2440587.5;
  const jc = (jd - 2451545) / 36525;
  const L0 = (280.46646 + jc * (36000.76983 + jc * 0.0003032)) % 360;
  const M = 357.52911 + jc * (35999.05029 - 0.0001537 * jc);
  const e = 0.016708634 - jc * (0.000042037 + 0.0000001267 * jc);
  const Mr = M * rad;
  const C =
    Math.sin(Mr) * (1.914602 - jc * (0.004817 + 0.000014 * jc)) +
    Math.sin(2 * Mr) * (0.019993 - 0.000101 * jc) +
    Math.sin(3 * Mr) * 0.000289;
  const lam = L0 + C - 0.00569 - 0.00478 * Math.sin((125.04 - 1934.136 * jc) * rad);
  const eps0 = 23 + (26 + (21.448 - jc * (46.815 + jc * (0.00059 - jc * 0.001813))) / 60) / 60;
  const eps = eps0 + 0.00256 * Math.cos((125.04 - 1934.136 * jc) * rad);
  const decl = Math.asin(Math.sin(eps * rad) * Math.sin(lam * rad));
  const y = Math.tan((eps / 2) * rad) ** 2;
  const L0r = L0 * rad;
  const eot =
    4 / rad *
    (y * Math.sin(2 * L0r) -
      2 * e * Math.sin(Mr) +
      4 * e * y * Math.sin(Mr) * Math.cos(2 * L0r) -
      0.5 * y * y * Math.sin(4 * L0r) -
      1.25 * e * e * Math.sin(2 * Mr));
  const minutes = date.getUTCHours() * 60 + date.getUTCMinutes() + date.getUTCSeconds() / 60;
  const tst = (((minutes + eot + 4 * lon) % 1440) + 1440) % 1440;
  const ha = (tst / 4 - 180) * rad;
  const latr = lat * rad;
  const cz = Math.sin(latr) * Math.sin(decl) + Math.cos(latr) * Math.cos(decl) * Math.cos(ha);
  const zen = Math.acos(Math.max(-1, Math.min(1, cz)));
  const az = Math.atan2(Math.sin(ha), Math.cos(ha) * Math.sin(latr) - Math.tan(decl) * Math.cos(latr)) / rad + 180;
  return { azimuth: ((az % 360) + 360) % 360, elevation: 90 - zen / rad };
}

// Beijing time string "YYYY-MM-DD HH:MM:SS" -> Date
export function beijingTime(str) {
  return new Date(str.replace(" ", "T") + "+08:00");
}

// Unit vector in scene frame (x east, y up, z south) pointing toward the sun.
export function sunDirection(azimuth, elevation, out) {
  const a = azimuth * rad, el = elevation * rad;
  out.set(Math.sin(a) * Math.cos(el), Math.sin(el), -Math.cos(a) * Math.cos(el));
  return out;
}
