// Field capture on the live navigator: the always-visible Add button, and "Add photo or info"
// on a place's detail sheet. Submissions use the same account as the passport (td-auth).
import * as P from '../js/passport.js';
import { bootCapture, configureCapture, mountCaptureFab, startCaptureForPlace, flushQueue, placeLabel } from '../js/capture.js';
import { CONFIG } from '../js/config.js';

const BUCKET = 'contributions';
let api = null, sb = null;

function catalog() {
  if (!api) return [];
  const out = [];
  const seen = new Set();
  const add = (p, extra = {}) => {
    if (!p || !p.id || seen.has(p.id) || !Number.isFinite(+p.lat)) return;
    seen.add(p.id);
    const priv = !!(api.isPriv ? api.isPriv(p) : p.privateHome || p.priv);
    out.push({
      id: p.id, name: p.name, lat: +p.lat, lon: +p.lon,
      layer: extra.layer || p.layer || (p.lyr && p.r >= 1 ? (p.kind || 'marker') : (p.arch ? 'archive' : 'listing')),
      kind: extra.kind || p.cat || p.kind, kindLabel: extra.kindLabel,
      priv, privateHome: priv,
      area: p.area, areaLabel: p.areaLabel || (api.locLabel ? api.locLabel(p) : p.area),
      radiusM: p.radiusM, circle_mi: p.circle_mi, area_outline: p.area_outline || p.outline,
      townOnly: p.townOnly, geo_precision: p.geo_precision,
    });
  };
  for (const p of api.pins || []) add(p, { layer: p.cat === 'context' ? 'place' : (p.arch ? 'archive' : 'listing'), kindLabel: p.cat });
  if (api.lyr) for (const x of api.lyr.values()) add(x, { layer: x.kind === 'cem' || x.lyr === 'cem' ? 'cemetery' : 'marker', kindLabel: x.kind === 'cem' ? 'Cemetery' : 'Historical marker' });
  const cat = window.__tdPassportDebug?.catalog;
  if (cat && cat.values) for (const m of cat.values()) add(m, { layer: m.layer, kindLabel: m.layer === 'archive' ? 'The Archive' : m.layer });
  return out;
}

async function client() {
  if (sb) return sb;
  sb = await P.backend();
  return sb;
}

async function createSubmission({ kind, listing_id, payload, rights_confirmed, file, extra }) {
  const c = await client();
  if (!c || !P.remote.uid) throw new Error('Sign in first');
  let storage_path = null;
  if (file) {
    storage_path = `${P.remote.uid}/${crypto.randomUUID()}-${String(file.name || 'capture.jpg').replace(/[^\w.-]+/g, '_')}`;
    const up = await c.storage.from(BUCKET).upload(storage_path, file, { contentType: file.type || 'image/jpeg' });
    if (up.error) throw new Error(up.error.message);
    payload = { ...payload }; delete payload.data_url;
  }
  const row = { kind, listing_id: listing_id || null, author_id: P.remote.uid, payload, rights_confirmed: !!rights_confirmed, storage_path };
  const withExtra = extra ? { ...row, ...pickExtra(extra) } : row;
  let r = await c.from('submissions').insert(withExtra).select().single();
  if (r.error && extra && /column|schema cache|field_capture|capture_/i.test(r.error.message)) {
    r = await c.from('submissions').insert(row).select().single();
  }
  if (r.error) throw new Error(r.error.message);
  return r.data;
}
function pickExtra(e) {
  const o = {};
  if (e.field_capture != null) o.field_capture = !!e.field_capture;
  if (e.capture_id) o.capture_id = e.capture_id;
  if (e.captured_at) o.captured_at = e.captured_at;
  if (Number.isFinite(+e.capture_lat)) o.capture_lat = +e.capture_lat;
  if (Number.isFinite(+e.capture_lon)) o.capture_lon = +e.capture_lon;
  return o;
}

function hookDetails() {
  const body = document.getElementById('sh-body');
  if (!body || body.querySelector('[data-capture-place], #td-cap-here')) return;
  const sheet = document.getElementById('sheet');
  if (!sheet || sheet.hidden || (sheet.dataset.kind && sheet.dataset.kind !== 'details')) return;
  // Find the place this sheet is about: last details id from a data attribute, or the Open in app link.
  const open = body.querySelector('a[href*="#/l/"]');
  let id = '';
  if (open) {
    const m = open.getAttribute('href').match(/#\/l\/([^?&#]+)/);
    if (m) id = decodeURIComponent(m[1]);
  }
  const place = id ? catalog().find((p) => p.id === id) : null;
  const row = document.createElement('div');
  row.className = 'row';
  const b = document.createElement('button');
  b.type = 'button';
  b.className = 'btn p g';
  b.id = 'td-cap-here';
  b.textContent = 'Add photo or info';
  b.onclick = () => startCaptureForPlace(place || undefined, { fix: fixNow() });
  row.appendChild(b);
  body.appendChild(row);
}

function fixNow() {
  const me = api && api.me;
  if (me && Number.isFinite(me[0])) return { lat: me[0], lon: me[1], acc: api.meAcc, at: Date.now() };
  return null;
}

async function boot() {
  api = window.__tdLiveApi;
  if (!api) return;
  mountCaptureFab(document.getElementById('stage'), { pre: () => ({ fix: fixNow() }) });
  bootCapture({
    assetBase: '../',
    signInHref: '../#/account',
    toast: (m) => api.toast(m, 5000),
    getCatalog: catalog,
    getPosition: () => fixNow(),
    getSession: async () => {
      await P.backend();
      if (P.remote.status === 'signed-out' || !P.remote.uid) return null;
      if (P.remote.status === 'on') return { id: P.remote.uid, handle: 'reader', display_name: '' };
      return P.remote.uid ? { id: P.remote.uid } : null;
    },
    createSubmission,
    suggestPlace: (opts) => P.suggest(opts),
    awardSeal: (place, opts) => P.awardSeal(place, opts),
  });
  const mo = new MutationObserver(() => hookDetails());
  const sh = document.getElementById('sh-body');
  if (sh) mo.observe(sh, { childList: true });
  flushQueue().catch(() => {});
}

if (window.__tdLiveApi) boot();
else window.addEventListener('td-live-api', boot, { once: true });
