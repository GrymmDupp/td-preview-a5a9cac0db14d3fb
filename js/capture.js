// Quick field capture: one-handed photo or note from the map, the live navigator, or a place card.
// Photos are resized and recompressed as JPEG (EXIF, including GPS, is stripped). Submissions go to
// the existing moderation queue and stay private until a moderator approves them. An offline queue
// in IndexedDB retries when the signal comes back.
import { meters, isPrivateHome, inArea, publicAreaLabel } from './privacy.js';

export const NEAR_M = 400;
const MAX_EDGE = 1600;
const JPEG_Q = 0.82;
const MAX_PHOTOS = 6;
const DB_NAME = 'td-capture-queue';
const DB_VER = 1;
const STORE = 'jobs';

const esc = (s) => String(s == null ? '' : s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

let hooks = {
  getCatalog: () => [],
  getPosition: null,
  getSession: async () => null,
  createSubmission: null,
  suggestPlace: null,
  awardSeal: null,
  signInHref: '#/account',
  toast: (m) => console.warn(m),
  assetBase: './',
};

export function configureCapture(next) { hooks = { ...hooks, ...next }; }

/* ---------------------------------------------------------------- images: resize + strip EXIF */
export function compressImage(file, { maxEdge = MAX_EDGE, quality = JPEG_Q } = {}) {
  return new Promise((res, rej) => {
    if (!file) return res(null);
    const type = file.type || '';
    if (!/^image\//.test(type) && type !== '') return res(null);
    const url = URL.createObjectURL(file);
    const img = new Image();
    img.onload = () => {
      try {
        const s = Math.min(1, maxEdge / Math.max(img.width, img.height, 1));
        const w = Math.max(1, Math.round(img.width * s));
        const h = Math.max(1, Math.round(img.height * s));
        const c = document.createElement('canvas');
        c.width = w; c.height = h;
        const g = c.getContext('2d');
        g.fillStyle = '#111'; g.fillRect(0, 0, w, h);
        g.drawImage(img, 0, 0, w, h);
        URL.revokeObjectURL(url);
        // Canvas JPEG has no EXIF, so GPS and other camera tags are gone from the public copy.
        c.toBlob((blob) => {
          if (!blob) return rej(new Error('Could not compress that photo.'));
          const name = String(file.name || 'capture.jpg').replace(/[^\w.-]+/g, '_').replace(/\.[^.]+$/, '') + '.jpg';
          res(new File([blob], name, { type: 'image/jpeg', lastModified: Date.now() }));
        }, 'image/jpeg', quality);
      } catch (e) { URL.revokeObjectURL(url); rej(e); }
    };
    img.onerror = () => { URL.revokeObjectURL(url); rej(new Error('That photo could not be read.')); };
    img.src = url;
  });
}

/* ---------------------------------------------------------------- GPS + nearest place */
export function getPosition({ timeout = 8000, maximumAge = 15000 } = {}) {
  if (typeof hooks.getPosition === 'function') {
    return Promise.resolve(hooks.getPosition()).then((p) => p || devicePosition({ timeout, maximumAge }));
  }
  return devicePosition({ timeout, maximumAge });
}
function devicePosition({ timeout, maximumAge }) {
  return new Promise((res) => {
    if (!navigator.geolocation) return res(null);
    navigator.geolocation.getCurrentPosition(
      (pos) => res({ lat: pos.coords.latitude, lon: pos.coords.longitude, acc: pos.coords.accuracy || null, at: pos.timestamp || Date.now() }),
      () => res(null),
      { enableHighAccuracy: true, timeout, maximumAge }
    );
  });
}

export function placeLabel(p) {
  if (!p) return '';
  if (isPrivateHome(p) || p.priv) return publicAreaLabel(p) || p.areaLabel || p.area || p.name || 'A private home';
  return p.name || p.title || 'This place';
}

export function distanceToPlace(lat, lon, p) {
  if (!p || !Number.isFinite(+lat) || !Number.isFinite(+lon)) return Infinity;
  if ((isPrivateHome(p) || p.priv || p.areaOnly) && inArea(lat, lon, p)) return 0;
  if (!Number.isFinite(+p.lat) || !Number.isFinite(+p.lon)) return Infinity;
  return meters(+lat, +lon, +p.lat, +p.lon);
}

export function nearestPlaces(catalog, lat, lon, maxM = NEAR_M) {
  const out = [];
  for (const p of catalog || []) {
    const d = distanceToPlace(lat, lon, p);
    if (d <= maxM) out.push({ place: p, d });
  }
  out.sort((a, b) => a.d - b.d);
  return out;
}

export function onSite(place, fix, maxM = 50) {
  if (!place || !fix || !Number.isFinite(+fix.lat)) return false;
  if (isPrivateHome(place) || place.priv || place.areaOnly) return inArea(fix.lat, fix.lon, place);
  return distanceToPlace(fix.lat, fix.lon, place) <= maxM;
}

function sayDist(d) {
  if (!Number.isFinite(d)) return '';
  if (d <= 0) return 'you are in its area';
  if (d < 10) return 'right here';
  if (d < 1000) return Math.round(d) + ' m away';
  return (d / 1609.344).toFixed(d < 1609 ? 2 : 1) + ' mi away';
}

/* ---------------------------------------------------------------- offline queue */
function openDb() {
  return new Promise((res, rej) => {
    const r = indexedDB.open(DB_NAME, DB_VER);
    r.onupgradeneeded = () => { if (!r.result.objectStoreNames.contains(STORE)) r.result.createObjectStore(STORE, { keyPath: 'id' }); };
    r.onsuccess = () => res(r.result);
    r.onerror = () => rej(r.error);
  });
}
async function idbAll() {
  try {
    const db = await openDb();
    return await new Promise((res, rej) => {
      const q = db.transaction(STORE, 'readonly').objectStore(STORE).getAll();
      q.onsuccess = () => res(q.result || []);
      q.onerror = () => rej(q.error);
    });
  } catch { return []; }
}
async function idbPut(job) {
  const db = await openDb();
  await new Promise((res, rej) => {
    const q = db.transaction(STORE, 'readwrite').objectStore(STORE).put(job);
    q.onsuccess = () => res();
    q.onerror = () => rej(q.error);
  });
}
async function idbDel(id) {
  const db = await openDb();
  await new Promise((res, rej) => {
    const q = db.transaction(STORE, 'readwrite').objectStore(STORE).delete(id);
    q.onsuccess = () => res();
    q.onerror = () => rej(q.error);
  });
}

export async function queuedCount() { return (await idbAll()).length; }

function paintQueueBadge() {
  queuedCount().then((n) => {
    document.querySelectorAll('[data-capture-fab] .td-cap-badge, .td-cap-fab .td-cap-badge').forEach((el) => {
      el.hidden = n < 1;
      el.textContent = n > 9 ? '9+' : String(n);
    });
  }).catch(() => {});
}

let flushing = false;
export async function flushQueue() {
  if (flushing) return { sent: 0, left: await queuedCount() };
  const session = await hooks.getSession();
  if (!session) return { sent: 0, left: await queuedCount() };
  if (typeof navigator !== 'undefined' && navigator.onLine === false) return { sent: 0, left: await queuedCount() };
  flushing = true;
  let sent = 0;
  try {
    const jobs = await idbAll();
    for (const job of jobs) {
      try {
        await sendJob(job);
        await idbDel(job.id);
        sent += 1;
      } catch (e) {
        const msg = String(e.message || e);
        if (/sign in/i.test(msg)) break;
        // Keep the job and try again later for network / server errors.
        if (!/network|fetch|failed|offline|timeout|5\d\d|Failed to fetch/i.test(msg) && jobs.length > 3) {
          job.tries = (job.tries || 0) + 1;
          if (job.tries > 8) { /* keep trying; do not drop a field report */ }
          await idbPut(job);
        }
        break;
      }
    }
  } finally { flushing = false; paintQueueBadge(); }
  if (sent) hooks.toast(sent === 1 ? 'A saved field report just sent for review.' : sent + ' saved field reports just sent for review.');
  return { sent, left: await queuedCount() };
}

function bootQueue() {
  const kick = () => { flushQueue().catch(() => {}); };
  window.addEventListener('online', kick);
  document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'visible') kick(); });
  setTimeout(kick, 2000);
  paintQueueBadge();
}

/* ---------------------------------------------------------------- submit */
function creditName(session) {
  return String(session?.display_name || '').trim() || (session?.handle ? session.handle : 'A traveler');
}

async function sendJob(job) {
  const session = await hooks.getSession();
  if (!session) throw new Error('Sign in first');
  if (typeof hooks.createSubmission !== 'function') throw new Error('Capture is not connected.');
  const meta = job.meta || {};
  const files = job.files || [];
  const note = String(meta.note || '').trim();
  const listingId = meta.newPlace ? null : (meta.placeId || null);
  const capturedAt = meta.capturedAt || new Date(job.created || Date.now()).toISOString();
  const captureId = job.id;
  const base = {
    capture: true,
    capture_id: captureId,
    field: meta.newPlace ? 'other' : 'field',
    note: note || undefined,
    text: note || undefined,
    sources: 'Field report, taken on site.',
    public_ground: true,
    not_from_listing: true,
    public_road: true,
    credit: creditName(session),
    place_name: meta.placeName || undefined,
    place_kind: meta.placeKind || undefined,
    new_place: !!meta.newPlace,
    captured_at: capturedAt,
    acc: Number.isFinite(+meta.acc) ? Math.round(+meta.acc) : undefined,
    priv: !!meta.priv,
  };
  // Keep GPS on the submission for moderators (columns + payload). Public views strip it.
  if (Number.isFinite(+meta.lat) && Number.isFinite(+meta.lon)) {
    base.lat = Math.round(+meta.lat * 1e6) / 1e6;
    base.lon = Math.round(+meta.lon * 1e6) / 1e6;
  }
  const extra = { field_capture: true, capture_id: captureId, captured_at: capturedAt,
    capture_lat: Number.isFinite(+meta.lat) ? base.lat : null,
    capture_lon: Number.isFinite(+meta.lon) ? base.lon : null };

  if (files.length) {
    for (let i = 0; i < files.length; i++) {
      const file = files[i] instanceof File ? files[i] : new File([files[i].blob || files[i]], files[i].name || `capture-${i + 1}.jpg`, { type: 'image/jpeg' });
      await hooks.createSubmission({
        kind: 'photo',
        listing_id: listingId,
        rights_confirmed: true,
        file,
        extra,
        payload: {
          ...base,
          title: files.length > 1 ? `Field photo ${i + 1}` : 'Field photo',
          caption: note || 'A photo taken from a public road.',
          era: 'current',
          doc_type: 'photo',
          file_name: file.name,
        },
      });
    }
  } else if (note) {
    await hooks.createSubmission({
      kind: 'info',
      listing_id: listingId,
      rights_confirmed: false,
      extra,
      payload: { ...base, field: 'history', text: note, title: 'Field note' },
    });
  } else {
    throw new Error('Add a photo or a short note.');
  }

  if (meta.newPlace && typeof hooks.suggestPlace === 'function') {
    const name = String(meta.placeName || '').trim() || 'A place from the field';
    const story = (note && note.length >= 20) ? note : (note ? note + ' A field report was sent with this tip.' : 'A field report was sent from the live map. Please review the attached submission.');
    try {
      if (Number.isFinite(+meta.lat)) await hooks.suggestPlace({ lat: +meta.lat, lon: +meta.lon, name, story, public_road: true });
    } catch { /* suggestion is extra; the submissions already went through */ }
  }

  const place = meta.place || null;
  if (place && !meta.newPlace && typeof hooks.awardSeal === 'function' && onSite(place, meta, 50) && files.length) {
    try { await hooks.awardSeal(place, { how: 'photo', file: files[0] instanceof File ? files[0] : null }); } catch { /* seal is optional */ }
  }
}

async function enqueue(job) {
  // IndexedDB can store Blobs; Files are stored as {name, type, blob}.
  const files = [];
  for (const f of job.files || []) {
    const file = f instanceof File ? f : f;
    files.push({ name: file.name, type: file.type || 'image/jpeg', blob: file });
  }
  await idbPut({ id: job.id, created: job.created, meta: job.meta, files, tries: 0 });
  paintQueueBadge();
}

/* ---------------------------------------------------------------- UI */
let shell = null, input = null, libraryInput = null, state = null;

function ensureShell() {
  if (shell && document.body.contains(shell)) return shell;
  if (!document.querySelector('link[data-td-capture-css]')) {
    const l = document.createElement('link');
    l.rel = 'stylesheet'; l.dataset.tdCaptureCss = '1';
    l.href = (hooks.assetBase || './') + (hooks.assetBase && hooks.assetBase.endsWith('/') ? '' : (hooks.assetBase ? '/' : '')) + 'assets/css/capture.css';
    // live page uses ../assets/css/capture.css via assetBase
    if (/capture\.css$/.test(hooks.assetBase || '')) l.href = hooks.assetBase;
    else l.href = (hooks.assetBase || './') + 'assets/css/capture.css';
    document.head.appendChild(l);
  }
  shell = document.createElement('div');
  shell.id = 'td-cap';
  shell.hidden = true;
  shell.innerHTML = '<div class="td-cap-sheet" role="dialog" aria-modal="true" aria-labelledby="td-cap-title">'
    + '<div class="td-cap-bar"><b id="td-cap-title">Field report</b><button type="button" class="td-cap-x" aria-label="Close">×</button></div>'
    + '<div class="td-cap-body"></div></div>';
  document.body.appendChild(shell);
  shell.querySelector('.td-cap-x').onclick = () => closeCapture();
  shell.addEventListener('click', (e) => { if (e.target === shell) closeCapture(); });
  if (!input) {
    input = document.createElement('input');
    input.type = 'file'; input.accept = 'image/*'; input.setAttribute('capture', 'environment');
    input.className = 'td-cap-file'; input.tabIndex = -1;
    document.body.appendChild(input);
    input.addEventListener('change', () => onFiles(input.files, input));
  }
  if (!libraryInput) {
    libraryInput = document.createElement('input');
    libraryInput.type = 'file'; libraryInput.accept = 'image/*'; libraryInput.multiple = true;
    libraryInput.className = 'td-cap-file'; libraryInput.tabIndex = -1;
    document.body.appendChild(libraryInput);
    libraryInput.addEventListener('change', () => onFiles(libraryInput.files, libraryInput));
  }
  return shell;
}

async function onFiles(list, el) {
  const picked = [...(list || [])].filter((f) => /^image\//.test(f.type) || !f.type);
  if (el) el.value = '';
  if (!picked.length) return;
  if (!state) state = blankState();
  for (const f of picked) {
    if (state.files.length >= MAX_PHOTOS) { hooks.toast('You can send up to ' + MAX_PHOTOS + ' photos in one report.'); break; }
    try {
      const compressed = await compressImage(f);
      if (compressed) {
        state.files.push(compressed);
        state.previews.push(URL.createObjectURL(compressed));
      }
    } catch (e) { hooks.toast(e.message || 'That photo could not be used.'); }
  }
  if (!state.fix) state.fix = await getPosition().catch(() => null);
  openSheet();
}

function blankState(pre) {
  return {
    files: [],
    previews: [],
    note: '',
    rights: false,
    place: pre?.place || null,
    locked: !!pre?.locked,
    newPlace: false,
    newName: '',
    nearby: [],
    fix: pre?.fix || null,
    chosenId: pre?.place ? pre.place.id : '',
  };
}

function closeCapture() {
  if (shell) shell.hidden = true;
  document.body.classList.remove('td-cap-open');
  if (state?.previews) state.previews.forEach((u) => URL.revokeObjectURL(u));
  // keep a short-lived draft of the last unsent report? clear to avoid surprise resubmits
  state = null;
}

function openSheet() {
  ensureShell();
  if (!state) state = blankState();
  const body = shell.querySelector('.td-cap-body');
  const nearby = state.nearby;
  const locked = state.locked && state.place;
  const chosen = locked ? state.place : (state.newPlace ? null : (nearby.find((x) => x.place.id === state.chosenId)?.place || state.place || nearby[0]?.place || null));
  if (!state.newPlace && chosen) state.chosenId = chosen.id;

  const gpsLine = state.fix && Number.isFinite(+state.fix.lat)
    ? ('GPS and time attached · ' + new Date(state.fix.at || Date.now()).toLocaleString('en-US', { timeZone: 'America/Detroit', month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' }) + ' ET')
    : 'No GPS yet. You can still send; the time is attached.';

  let places = '';
  if (locked) {
    places = '<p class="td-cap-place-locked">For <b>' + esc(placeLabel(state.place)) + '</b></p>';
  } else {
    places = '<div class="td-cap-places" role="radiogroup" aria-label="Which place">';
    if (!nearby.length) places += '<p class="td-cap-muted">No catalogued place is within a few hundred metres.</p>';
    nearby.slice(0, 5).forEach((row, i) => {
      const p = row.place, id = p.id, on = !state.newPlace && state.chosenId === id;
      places += '<label class="td-cap-choice' + (on ? ' on' : '') + '"><input type="radio" name="td-cap-place" value="' + esc(id) + '"' + (on ? ' checked' : '') + '> '
        + '<span><b>' + esc(placeLabel(p)) + '</b><small>' + esc(sayDist(row.d)) + (p.layer || p.kind ? ' · ' + esc(p.kindLabel || p.layer || '') : '') + '</small></span></label>';
    });
    places += '<label class="td-cap-choice' + (state.newPlace ? ' on' : '') + '"><input type="radio" name="td-cap-place" value="__new__"' + (state.newPlace ? ' checked' : '') + '> '
      + '<span><b>New place here</b><small>A tip for review, not published yet</small></span></label></div>';
    if (state.newPlace) {
      places += '<label class="td-cap-label">Name of the place<input type="text" id="td-cap-newname" maxlength="120" placeholder="e.g. the old county poor farm" value="' + esc(state.newName) + '"></label>';
    }
  }

  const thumbs = state.previews.map((u, i) => '<figure class="td-cap-thumb"><img src="' + u + '" alt=""><button type="button" class="td-cap-rm" data-rm="' + i + '" aria-label="Remove photo">×</button></figure>').join('');

  body.innerHTML = '<p class="td-cap-gps">' + esc(gpsLine) + '</p>'
    + '<div class="td-cap-thumbs">' + thumbs + '</div>'
    + '<div class="td-cap-addrow">'
    + '<button type="button" class="btn sm" id="td-cap-add">Add a photo</button>'
    + '<button type="button" class="btn sm ghost" id="td-cap-lib">From the library</button>'
    + '</div>'
    + places
    + '<label class="td-cap-label">A short note <span class="td-cap-opt">(optional)</span><textarea id="td-cap-note" rows="3" maxlength="1500" placeholder="What you saw from the public road…">' + esc(state.note) + '</textarea></label>'
    + '<label class="td-cap-check"><input type="checkbox" id="td-cap-rights"' + (state.rights ? ' checked' : '') + '> <span>I took these from a public road, they are my photos (or public domain), and they are not copied from a listing or news page. No trespassing, no shots into windows, no faces or plates.</span></label>'
    + '<p class="td-cap-muted">Nothing goes public until it is reviewed. Approved reports join that place’s file.</p>'
    + '<div class="td-cap-actions"><button type="button" class="btn p td-cap-send" id="td-cap-send">Send for review</button></div>';

  shell.hidden = false;
  document.body.classList.add('td-cap-open');

  body.querySelector('#td-cap-add').onclick = () => { if (state.files.length >= MAX_PHOTOS) return hooks.toast('You can send up to ' + MAX_PHOTOS + ' photos in one report.'); input.click(); };
  body.querySelector('#td-cap-lib').onclick = () => { if (state.files.length >= MAX_PHOTOS) return hooks.toast('You can send up to ' + MAX_PHOTOS + ' photos in one report.'); libraryInput.click(); };
  body.querySelector('#td-cap-note').oninput = (e) => { state.note = e.target.value; };
  body.querySelector('#td-cap-rights').onchange = (e) => { state.rights = e.target.checked; };
  const nn = body.querySelector('#td-cap-newname'); if (nn) nn.oninput = (e) => { state.newName = e.target.value; };
  body.querySelectorAll('[data-rm]').forEach((b) => { b.onclick = () => {
    const i = +b.dataset.rm;
    URL.revokeObjectURL(state.previews[i]);
    state.files.splice(i, 1); state.previews.splice(i, 1);
    openSheet();
  }; });
  body.querySelectorAll('input[name="td-cap-place"]').forEach((r) => {
    r.onchange = () => {
      if (r.value === '__new__') { state.newPlace = true; state.chosenId = ''; state.place = null; }
      else { state.newPlace = false; state.chosenId = r.value; state.place = nearby.find((x) => x.place.id === r.value)?.place || state.place; }
      openSheet();
    };
  });
  body.querySelector('#td-cap-send').onclick = () => submitNow();
}

async function submitNow() {
  if (!state) return;
  const btn = shell.querySelector('#td-cap-send');
  if (btn) btn.disabled = true;
  try {
    if (!state.files.length && !String(state.note || '').trim()) throw new Error('Add a photo or a short note.');
    if (!state.rights) throw new Error('Please confirm the photos were taken from a public road and that you have the right to share them.');
    if (state.newPlace && String(state.newName || '').trim().length < 3) throw new Error('Give the new place a short name.');
    const session = await hooks.getSession();
    const place = state.locked ? state.place : (state.newPlace ? null : (state.nearby.find((x) => x.place.id === state.chosenId)?.place || state.place));
    const fix = state.fix || await getPosition().catch(() => null);
    const job = {
      id: (crypto.randomUUID && crypto.randomUUID()) || ('cap-' + Date.now() + '-' + Math.random().toString(16).slice(2)),
      created: Date.now(),
      files: state.files.slice(),
      meta: {
        note: String(state.note || '').trim(),
        place,
        placeId: place?.id || null,
        placeName: state.newPlace ? String(state.newName || '').trim() : placeLabel(place),
        placeKind: place?.layer || place?.kind || (place ? 'place' : 'new'),
        newPlace: !!state.newPlace,
        priv: !!(place && (isPrivateHome(place) || place.priv)),
        lat: fix?.lat, lon: fix?.lon, acc: fix?.acc,
        capturedAt: new Date(fix?.at || Date.now()).toISOString(),
      },
    };
    if (!session) {
      await enqueue(job);
      closeCapture();
      hooks.toast('Saved on this phone. Sign in and it will send for review when you have a signal.');
      return;
    }
    if (navigator.onLine === false) {
      await enqueue(job);
      closeCapture();
      hooks.toast('Saved on this phone. It will send when you have a signal.');
      return;
    }
    try {
      await sendJob(job);
      closeCapture();
      hooks.toast('Sent for review. Nothing is public until it’s approved.');
    } catch (e) {
      await enqueue(job);
      closeCapture();
      hooks.toast((e.message ? e.message + ' ' : '') + 'Saved on this phone. It will retry when you have a signal.');
    }
  } catch (e) {
    hooks.toast(e.message || 'Could not send.');
    if (btn) btn.disabled = false;
  }
}

function catalogList() {
  try { return hooks.getCatalog() || []; } catch { return []; }
}

async function prepare(pre = {}) {
  const st = blankState(pre);
  st.fix = pre.fix || await getPosition().catch(() => null);
  if (st.fix) st.nearby = nearestPlaces(catalogList(), st.fix.lat, st.fix.lon, NEAR_M);
  if (pre.place) {
    st.place = pre.place;
    st.chosenId = pre.place.id;
    if (!st.nearby.some((x) => x.place.id === pre.place.id) && st.fix) {
      st.nearby.unshift({ place: pre.place, d: distanceToPlace(st.fix.lat, st.fix.lon, pre.place) });
    } else if (!st.nearby.length) st.nearby = [{ place: pre.place, d: Infinity }];
  }
  return st;
}

// FAB on the map / live view: opens the camera immediately, then the short sheet.
export async function startCaptureCamera(pre = {}) {
  ensureShell();
  state = await prepare(pre);
  input.click();
}

// Place-card entry: pre-selects the place. Offers a photo or just a note.
export async function startCaptureForPlace(place, pre = {}) {
  if (!place) return startCaptureCamera(pre);
  ensureShell();
  state = await prepare({ ...pre, place, locked: true });
  openSheet();
}

export function mountCaptureFab(root, { pre } = {}) {
  if (!root) return null;
  let btn = root.querySelector(':scope > .td-cap-fab');
  if (!btn) {
    btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'td-cap-fab';
    btn.setAttribute('data-capture-fab', '1');
    btn.setAttribute('aria-label', 'Add a photo or a note from here');
    btn.innerHTML = '<span class="td-cap-fab-ic" aria-hidden="true">✧</span><span class="td-cap-fab-l">Add</span><span class="td-cap-badge" hidden>0</span>';
    root.appendChild(btn);
    btn.addEventListener('click', (e) => { e.preventDefault(); startCaptureCamera(typeof pre === 'function' ? pre() : pre); });
  }
  paintQueueBadge();
  return btn;
}

export function captureButtonHtml(placeId) {
  return '<button type="button" class="btn td-cap-card-btn" data-capture-place="' + esc(placeId) + '">Add photo or info</button>';
}

let booted = false;
export function bootCapture(cfg) {
  if (cfg) configureCapture(cfg);
  ensureShell();
  if (!booted) { booted = true; bootQueue(); }
  paintQueueBadge();
}

// Public payload for display: drop every GPS key so approved reports never leak a point.
export function publicReport(row) {
  const p = { ...(row || {}) };
  const payload = { ...(p.payload || {}) };
  for (const k of ['lat', 'lon', 'acc', 'accuracy', 'capture_lat', 'capture_lon', 'gps', 'coords', 'position']) {
    delete payload[k]; delete p[k];
  }
  p.payload = payload;
  return p;
}

export function reportCredit(row, fallback) {
  const n = String(row?.credit || row?.payload?.credit || row?.author?.display_name || '').trim();
  if (n) return n;
  if (row?.author?.handle) return row.author.handle;
  return fallback || 'A traveler';
}
