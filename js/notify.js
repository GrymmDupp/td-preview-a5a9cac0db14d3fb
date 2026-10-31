// Notification hook: STRUCTURE ONLY. Nothing here sends anything, asks for push
// permission, or shows badges/counters. It computes what a digest WOULD contain:
// new Twisted Deed (Tier 1) listings first added to the feed since the last check.
// The real sender is a Supabase scheduled function (see NOTIFICATIONS.md); this
// module is the shared shape so the site and that function agree.
import { CONFIG } from './config.js';

const PREF_KEY = 'td-notify-pref-v1';   // { [handleOrUserId]: { opted_in, tier1_only, created_at } }, this browser only

// Pure: listings (normalized feed listings) + since (YYYY-MM-DD or ISO) -> payload.
// Only preview fields are used (id, name, place, addedAt); never locked full-file content.
export function newTwistedDeedsSince(listings, since, { tier1Only = CONFIG.notifications?.tier1Only !== false } = {}) {
  const sinceDay = String(since || '').slice(0, 10);
  const items = (listings || [])
    .filter((l) => l && l.addedAt && (!sinceDay || l.addedAt > sinceDay) && (!tier1Only || l.tier === 1))
    .sort((a, b) => String(b.addedAt).localeCompare(String(a.addedAt)) || a.name.localeCompare(b.name))
    .map((l) => ({ id: l.id, name: l.name, place: l.place, addedAt: l.addedAt, path: `#/l/${encodeURIComponent(l.id)}` }));
  return { kind: 'new-twisted-deeds', since: sinceDay || null, tier1Only, count: items.length, listings: items };
}

// Returns the payload and whether it WOULD be sent. Never sends: enabled is false by
// default and there is no sender wired in the browser at all.
export function prepareDigest(listings, since) {
  const cfg = CONFIG.notifications || {};
  const payload = newTwistedDeedsSince(listings, since);
  return { enabled: !!cfg.enabled, wouldSend: false, reason: cfg.enabled ? 'no sender wired (server-side only)' : 'notifications disabled', payload };
}

// Opt-in preference, stored in this browser only ("coming soon"). One entry per account.
function readPrefs() { try { return JSON.parse(localStorage.getItem(PREF_KEY) || '{}') || {}; } catch { return {}; } }
export function getNotifyPref(who) { return who ? readPrefs()[who] || null : null; }
export function setNotifyPref(who, optedIn) {
  if (!who) return null;
  const all = readPrefs();
  all[who] = { opted_in: !!optedIn, tier1_only: true, created_at: all[who]?.created_at || new Date().toISOString() };
  try { localStorage.setItem(PREF_KEY, JSON.stringify(all)); } catch {}
  return all[who];
}
