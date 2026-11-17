// Privacy-friendly analytics: a tiny first-party event log in our own Supabase table.
// No cookies, no third parties, no account id, no session id, no IP and no user agent are stored: a row is the time,
// the kind of event and a short label (a section name or a listing id). Honors Do Not Track and Global Privacy
// Control, and the reader can switch it off on the Account page (per device, localStorage 'td-analytics' = '0').
const ls = { get(k) { try { return localStorage.getItem(k); } catch { return null; } }, set(k, v) { try { localStorage.setItem(k, v); } catch { /* private mode */ } } };
const KEY = 'td-analytics';
export const EVENTS = ['view', 'listing_open', 'unlock_click', 'pricing_view', 'pricing_click', 'share_click', 'radio_toggle', 'effects_toggle'];

export const analyticsBlocked = () => {
  try { return navigator.doNotTrack === '1' || window.doNotTrack === '1' || navigator.msDoNotTrack === '1' || navigator.globalPrivacyControl === true; } catch { return false; }
};
export const analyticsOn = () => !analyticsBlocked() && ls.get(KEY) !== '0';
export const setAnalytics = (on) => ls.set(KEY, on ? '1' : '0');

let be = null, last = { k: '', t: 0 }, chain = Promise.resolve();
let down = (() => { try { return sessionStorage.getItem('td-an-down') === '1'; } catch { return false; } })();
export function initAnalytics(backend) { be = backend; }

// A label is a short slug: letters, digits, dash, underscore, dot, slash, colon. Nothing from the query string or hash.
const clean = (s) => String(s ?? '').toLowerCase().replace(/[^a-z0-9._:\/-]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 80);

export function track(event, ref = '') {
  try {
    if (!be || down || be.mode !== 'supabase' || !be.features?.analytics || !be.logEvent || !EVENTS.includes(event) || !analyticsOn()) return;
    const r = clean(ref), k = event + '|' + r, now = Date.now();
    if (k === last.k && now - last.t < 1500) return;      // ignore double fires
    last = { k, t: now };
    // One at a time: if the table is not there (or we are offline), the first failure stops all counting for this session.
    chain = chain.then(() => (down ? null : be.logEvent(event, r))).catch(() => { down = true; try { sessionStorage.setItem('td-an-down', '1'); } catch { /* ignore */ } });
  } catch { /* never let counting break the app */ }
}

// Section name for a route path (#/l/<id> -> 'l', #/ -> 'home').
export const routeName = (path) => clean((path || '/').split('/').filter(Boolean)[0] || 'home') || 'home';
