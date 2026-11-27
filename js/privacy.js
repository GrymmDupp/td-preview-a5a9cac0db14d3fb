// Neighborhood-level privacy for private homes (Grymm t225u, scouting_notes.md).
// A private home is shown only as an area label plus an approximate circle (circle_mi wide:
// rural 0.5 mi, in-town 0.25 mi). Whole-township records (exact site unknown) are shown as the
// township outline (area_outline) or a circle_mi-wide circle. Never show a street name, house
// number, exact pin, owner or resident name, or a photo of the house.
//
// The circle's center is PRECOMPUTED on the box by the publisher: an independent random offset
// (40-70% of the radius, snapped to a road or field), never derived from the public id, and
// shipped as lat/lon with circle_mi / radiusM. The true point lives only in private notes.
// This file never recomputes a center: an id-seeded offset is reversible from the public id.
// A legacy private row that still carries a street-precise pin is coarsened to its town (2 dp).
//
// Passport stamps and live proximity alerts: use inArea(lat, lon, place). It is true anywhere
// inside the public outline (if shipped) or circle (shipped center + radius).

export const CIRCLE_DIAMETER_MI = 0.25;                            // default in-town width when a row ships no circle_mi
export const CIRCLE_RADIUS_M = CIRCLE_DIAMETER_MI * 1609.344 / 2; // 201.168 m
export const TOWN_RADIUS_M = 3200; // fallback when only a town centroid is known
export const AREA_PRECISIONS = ['neighborhood', 'township'];
const EARTH_M = 6371000;

export function meters(a, b, c, d) {
  const r = Math.PI / 180, x = Math.sin((c - a) * r / 2) ** 2 + Math.cos(a * r) * Math.cos(c * r) * Math.sin((d - b) * r / 2) ** 2;
  return 2 * EARTH_M * Math.asin(Math.min(1, Math.sqrt(x)));
}

export function isPrivateHome(p) {
  return !!(p && (p.privateHome === true || p.private_home === true || p.townOnly === true
    || p.privacy === 'neighborhood' || (p.shelf === 'archive' && p.geo_precision === 'town')));
}

// Drawn and stamped as an area, never a pin: private homes, town-centroid rows, neighborhood and township rows.
export function isAreaOnly(p) {
  return !!(p && (isPrivateHome(p) || p.areaOnly === true || p.geo_precision === 'town' || AREA_PRECISIONS.includes(p.geo_precision)));
}

export function radiusM(p) {
  if (!p) return 0;
  const r = Number(p.radiusM || p.privacyRadiusM);
  if (r > 0) return r;
  const cm = Number(p.circle_mi);
  if (cm > 0) return cm * 1609.344 / 2;
  if (!isAreaOnly(p)) return 0;
  return (p.areaPrecision || p.geo_precision) === 'neighborhood' ? CIRCLE_RADIUS_M : TOWN_RADIUS_M;
}

// The shipped outer ring ([[lon, lat], ...]) of a township / area outline, or null.
export function outlineRing(p) {
  const o = p && p.area_outline;
  const ring = o && o.type === 'Polygon' && Array.isArray(o.coordinates) ? o.coordinates[0] : null;
  return Array.isArray(ring) && ring.length >= 4 && ring.every((c) => Array.isArray(c) && Number.isFinite(+c[0]) && Number.isFinite(+c[1])) ? ring : null;
}

function inRing(lat, lon, ring) {
  let ins = false;
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    const xi = +ring[i][0], yi = +ring[i][1], xj = +ring[j][0], yj = +ring[j][1];
    if (((yi > lat) !== (yj > lat)) && lon < (xj - xi) * (lat - yi) / ((yj - yi) || 1e-12) + xi) ins = !ins;
  }
  return ins;
}

// True when the visitor is inside this place's public area: the shipped outline if there is one,
// else the circle around the shipped center (callers should not use this for exact public pins).
export function inArea(lat, lon, p) {
  if (!p || !Number.isFinite(+lat) || !Number.isFinite(+lon)) return false;
  const ring = outlineRing(p);
  if (ring) return inRing(+lat, +lon, ring);
  if (!Number.isFinite(+p.lat) || !Number.isFinite(+p.lon)) return false;
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

// Display-side only: a private home or area-only row never leaves a street, a listing URL, a photo
// or an exact pin on the object the views render. Neighborhood / township rows keep their shipped
// (already offset) center and radius. A private row that still carries a street-precise pin is
// coarsened to a 2-decimal town circle; no id-seeded offset is ever computed here.
export function applyArchivePrivacy(l) {
  const priv = l.private_home === true || l.privateHome === true || (l.shelf === 'archive' && l.geo_precision === 'town');
  const area = AREA_PRECISIONS.includes(l.geo_precision);
  if (!priv && !area) return l;
  if (priv) { l.privateHome = true; l.townOnly = true; }
  l.areaOnly = true;
  l.url = '';
  l.images = [];
  if (looksLikeStreetAddress(l.address)) l.address = '';
  const hasArea = !!(l.area || l.areaLabel);
  const hasPt = l.lat != null && l.lon != null && Number.isFinite(+l.lat) && Number.isFinite(+l.lon);
  if (hasPt && area) {
    l.privacyRadiusM = radiusM({ radiusM: l.radiusM, circle_mi: l.circle_mi, geo_precision: l.geo_precision, areaOnly: true });
    l.areaPrecision = l.geo_precision;
    if (!outlineRing(l)) delete l.area_outline;
  } else if (hasPt) {
    l.lat = Math.round(+l.lat * 100) / 100;
    l.lon = Math.round(+l.lon * 100) / 100;
    l.privacyRadiusM = TOWN_RADIUS_M;
    l.areaPrecision = 'town';
    l.geo_precision = 'town';
    delete l.area_outline;
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
  CIRCLE_DIAMETER_MI, CIRCLE_RADIUS_M, TOWN_RADIUS_M, AREA_PRECISIONS,
  meters, isPrivateHome, isAreaOnly, radiusM, outlineRing, inArea,
  publicAreaLabel, looksLikeStreetAddress, applyArchivePrivacy,
};
