// Neighborhood-level privacy for private homes (Grymm t225u, scouting_notes.md).
// A private home is shown only as a neighborhood / district / area label plus an
// approximate circle about 0.25 mi wide. The circle's center is offset from the
// house, seeded by the place id so it never moves. Never show a street name,
// house number, exact pin, owner or resident name, or a photo of the house.
//
// True coordinates belong in private notes only, not in public feed or map data.
// If display data still carries a precise pin, offsetCenter() + applyArchivePrivacy()
// strip it on the way to the page.
//
// Passport stamps and live proximity alerts: use inArea(lat, lon, place). That is
// true anywhere inside the public circle (the already-offset lat/lon plus radiusM).
// Do not geofence to a hidden house point — it is not present on public records.
// live/passport-live.js currently skips p.approx and only stamps m.exact; import
// inArea() (and isPrivateHome()) so a private home can be stamped inside its circle.

export const CIRCLE_DIAMETER_MI = 0.25;
export const CIRCLE_RADIUS_M = CIRCLE_DIAMETER_MI * 1609.344 / 2; // 201.168 m
export const TOWN_RADIUS_M = 3200; // fallback when only a town centroid is known
const EARTH_M = 6371000;

export function fnv1a(s) {
  let h = 0x811c9dc5;
  const str = String(s || '');
  for (let i = 0; i < str.length; i++) {
    h ^= str.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return h >>> 0;
}

// Destination a deterministic distance and bearing from (lat, lon). Distance is
// 40–70% of the radius, so the house stays inside the circle but is never the center.
export function offsetCenter(lat, lon, id, radiusM = CIRCLE_RADIUS_M) {
  const h = fnv1a(id);
  const angle = (h / 0x100000000) * Math.PI * 2;
  const frac = 0.40 + ((h >>> 16) / 0x10000) * 0.30;
  const dist = radiusM * frac;
  const latR = lat * Math.PI / 180;
  const dLat = (dist * Math.cos(angle)) / EARTH_M * (180 / Math.PI);
  const dLon = (dist * Math.sin(angle)) / (EARTH_M * Math.cos(latR)) * (180 / Math.PI);
  return { lat: lat + dLat, lon: lon + dLon, radiusM, offsetM: dist };
}

export function meters(a, b, c, d) {
  const r = Math.PI / 180, x = Math.sin((c - a) * r / 2) ** 2 + Math.cos(a * r) * Math.cos(c * r) * Math.sin((d - b) * r / 2) ** 2;
  return 2 * EARTH_M * Math.asin(Math.min(1, Math.sqrt(x)));
}

export function isPrivateHome(p) {
  return !!(p && (p.privateHome === true || p.private_home === true || p.townOnly === true
    || p.privacy === 'neighborhood' || (p.shelf === 'archive' && p.geo_precision === 'town')));
}

export function radiusM(p) {
  if (!p) return 0;
  const r = Number(p.radiusM || p.privacyRadiusM);
  if (r > 0) return r;
  if (!isPrivateHome(p)) return 0;
  return p.areaPrecision === 'neighborhood' ? CIRCLE_RADIUS_M : TOWN_RADIUS_M;
}

// True when the visitor is inside this place's public privacy circle (or, for an
// exact public pin, within 0 m of it — callers should not use this for exact pins).
export function inArea(lat, lon, p) {
  if (!p || !Number.isFinite(+lat) || !Number.isFinite(+p.lat) || !Number.isFinite(+p.lon)) return false;
  const r = radiusM(p);
  return r > 0 && meters(+lat, +lon, +p.lat, +p.lon) <= r;
}

export function publicAreaLabel(p) {
  if (!p) return '';
  return String(p.area || p.areaLabel || p.place || '').trim();
}

// Looks like a street address (house number + street, or a named road). Used only
// as a display-side strip; never invents a replacement beyond the area label.
const STREET_RE = /^\s*\d{1,6}\s+\S|\b(st|street|ave|avenue|rd|road|dr|drive|ln|lane|blvd|boulevard|ct|court|way|ter|terrace|pl|place|cir|circle|hwy|highway|trl|trail|pkwy|parkway)\b/i;

export function looksLikeStreetAddress(s) {
  const t = String(s || '').trim();
  if (!t) return false;
  return STREET_RE.test(t);
}

// Display-side only: if this is a private home, never leave a street, a listing
// URL or an exact pin on the object the views render. When the coordinates still
// look precise (not already a 2-decimal town centroid) they are offset in memory
// and the originals are dropped. Town-centroid records keep a larger town circle;
// no side-of-town label is invented.
export function applyArchivePrivacy(l) {
  const flagged = l.private_home === true || l.privateHome === true || (l.shelf === 'archive' && l.geo_precision === 'town');
  if (!flagged) return l;
  l.privateHome = true;
  l.townOnly = true;
  l.url = '';
  l.images = [];
  if (looksLikeStreetAddress(l.address)) l.address = '';
  const hasArea = !!(l.area || l.areaLabel);
  const precise = l.lat != null && l.lon != null && l.geo_precision === 'address';
  if (precise && l.id) {
    const o = offsetCenter(+l.lat, +l.lon, l.id);
    l.lat = Math.round(o.lat * 1e6) / 1e6;
    l.lon = Math.round(o.lon * 1e6) / 1e6;
    l.privacyRadiusM = CIRCLE_RADIUS_M;
    l.areaPrecision = 'neighborhood';
    l.geo_precision = 'neighborhood';
  } else if (l.lat != null && l.lon != null && (l.geo_precision === 'town' || !l.geo_precision)) {
    l.lat = Math.round(l.lat * 100) / 100;
    l.lon = Math.round(l.lon * 100) / 100;
    l.privacyRadiusM = TOWN_RADIUS_M;
    l.areaPrecision = 'town';
    l.geo_precision = 'town';
  }
  if (!hasArea) {
    l.areaLabel = l.place || '';
    l.address = l.areaLabel || l.place || '';
  } else {
    l.areaLabel = l.area || l.areaLabel;
    l.address = l.areaLabel;
  }
  return l;
}

if (typeof window !== 'undefined') window.TDPrivacy = {
  CIRCLE_DIAMETER_MI, CIRCLE_RADIUS_M, TOWN_RADIUS_M,
  fnv1a, offsetCenter, meters, isPrivateHome, radiusM, inArea,
  publicAreaLabel, looksLikeStreetAddress, applyArchivePrivacy,
};
