// #/dossier/<id>: a place's research dossier (t259u). Index + images are public; the text comes from
// public.place_dossiers (Supabase, RLS). Admins (public.admin_emails) and moderators read every dossier free.
// Wikipedia text is rewritten in our voice and attributed (CC BY-SA 4.0); news is summaries + short quotes with links;
// lore is labelled as lore. Nothing here touches for-sale data.
import { html, raw, esc, safeUrl, fmtDate } from '../util.js';
import { loadDossierIndex, dossierEntry } from '../dossiers.js';

const ext = (u, t) => { const s = safeUrl(u || ''); return s ? html`<a href="${s}" target="_blank" rel="noopener nofollow">${t}</a>` : t; };
const credit = (g) => html`${g.author ? html`${g.author} · ` : ''}${ext(g.license_url, g.license)} · ${ext(g.source_url, g.origin || 'source')}`;
const fig = (g, cls = '') => html`<figure class="dz-fig ${cls}"><img src="${g.src}" alt="${g.caption || ''}" width="${g.w}" height="${g.h}" loading="lazy" decoding="async">
  <figcaption>${g.caption && g.caption.length < 160 ? html`${g.caption}<br>` : ''}<span class="dz-cred">${credit(g)}</span></figcaption></figure>`;

function gate(ctx, e) {
  const msg = !ctx.me ? html`<p>Dossiers are open to staff during the preview. <a href="#/account">Sign in</a> with your admin account to read this one.</p>`
    : ctx.adminBypass ? html`<p>This dossier should be open on your account, but it didn’t load. Close and reopen the app, then try again.</p>`
    : html`<p>This dossier isn't open to your account yet. Dossiers are staff-only during the preview.</p>`;
  return html`<section class="dz-gate" role="note"><h2>The dossier is sealed</h2>${msg}
    <p class="small muted">${e.counts?.images || 0} credited photos · ${e.counts?.timeline || 0} dated events · ${e.counts?.news || 0} news summaries · ${e.counts?.documents || 0} documents</p></section>`;
}

function body(d) {
  const W = d.wikipedia;
  return html`
  ${d.summary ? html`<p class="dz-lede">${d.summary}</p>` : ''}
  ${(d.story || []).map((s) => html`<section class="dz-sec"><h2>${s.h}</h2>${(s.paras || []).map((p) => html`<p>${p}</p>`)}</section>`)}
  ${d.timeline?.length ? html`<section class="dz-sec"><h2>Timeline</h2><ol class="dz-tl">${d.timeline.map((t) => html`<li><b>${t.date}</b><span>${t.text}${t.source ? html` <i class="dz-src">${t.source}</i>` : ''}</span></li>`)}</ol></section>` : ''}
  ${d.people?.length ? html`<section class="dz-sec"><h2>People</h2><ul class="dz-people">${d.people.map((p) => html`<li><b>${p.name}</b> · ${p.role}</li>`)}</ul></section>` : ''}
  ${d.gallery?.length ? html`<section class="dz-sec"><h2>Photographs</h2><div class="dz-gal">${d.gallery.map((g) => fig(g))}</div></section>` : ''}
  ${d.news?.length ? html`<section class="dz-sec"><h2>In the news</h2><p class="small muted">Summaries in our words, with short quotes. Read the full stories at the source.</p>${d.news.map((n) => html`<article class="dz-news">
      <h3>${ext(n.url, n.title)}</h3><p class="small muted">${n.outlet}${n.date ? html` · ${fmtDate(n.date) || n.date}` : ''}</p><p>${n.summary}</p>
      ${n.quote ? html`<blockquote>“${n.quote}”${n.quote_by ? html` <cite>${n.quote_by}</cite>` : ''}</blockquote>` : ''}</article>`)}</section>` : ''}
  ${d.documents?.length ? html`<section class="dz-sec"><h2>Documents</h2>${d.documents.map((x) => html`<article class="dz-doc"><h3>${ext(x.url || x.pdf_url, x.title)}</h3>
      <p class="small muted">${x.source}${x.date ? html` · ${x.date}` : ''} · ${x.license}</p>${x.note ? html`<p class="small">${x.note}</p>` : ''}
      ${(x.facts || []).length ? html`<ul class="small">${x.facts.map((f) => html`<li>${f}</li>`)}</ul>` : ''}
      ${x.pdf_url ? html`<p class="small">${ext(x.pdf_url, 'Open the original scan (PDF)')}</p>` : ''}
      ${x.transcript_pages?.length ? html`<details class="dz-tx"><summary>Read the transcript (${x.transcript_pages.length} pages)</summary>${x.transcript_note ? html`<p class="small muted">${x.transcript_note}</p>` : ''}
        ${x.transcript_pages.map((p) => html`<div class="dz-page"><b>Page ${p.page}</b><p>${p.text}</p></div>`)}</details>` : ''}</article>`)}</section>` : ''}
  ${d.lore?.length ? html`<section class="dz-sec dz-lore"><h2>Lore</h2><p class="small muted">Told by guests, staff and TV crews. Not verified.</p><ul>${d.lore.map((l) => html`<li>${l.text}</li>`)}</ul></section>` : ''}
  <section class="dz-sec dz-sources"><h2>Sources & credits</h2><ul>
    ${W ? html`<li>Parts of this dossier are adapted and rewritten from the Wikipedia article ${ext(W.oldid_url || W.url, W.title)} (revision ${W.revid}, retrieved ${W.retrieved}), ${ext(W.license_url, W.license)}. Our adaptation is shared under the same license.</li>` : ''}
    ${(d.sources || []).map((s) => html`<li>${ext(s.url, s.title)}</li>`)}</ul>
    <p class="small muted">${d.license_line}</p><p class="small muted">Dossier updated ${fmtDate(d.updated) || d.updated}.</p></section>`;
}

export async function dossier(ctx, q, id) {
  id = decodeURIComponent(id || '');
  await loadDossierIndex();
  const e = dossierEntry(id), l = ctx.feed.byId.get(id) || (ctx.feed.theArchive || []).find((x) => x.id === id);
  if (!e) return html`<div class="empty-state"><h1>No dossier yet</h1><p>We haven't finished a research dossier for this place.</p><p><a class="btn" href="#/archive">The Archive</a></p></div>`;
  let d = null, err = '';
  if (ctx.me && ctx.be.getDossier) { try { d = await ctx.be.getDossier(id); } catch (x) { err = x.message; } }
  document.title = `${e.name} · Dossier · ${ctx.config.siteName}`;
  return html`<nav class="crumbs"><a href="#/archive">The Archive</a> › ${l ? html`<a href="#/l/${encodeURIComponent(id)}">${l.name}</a> › ` : ''}Dossier</nav>
  <article class="dossier">
    <header class="dz-head"><p class="dz-kicker">Twisted Deeds research dossier</p><h1>${e.name}</h1><p class="muted">${e.place}</p></header>
    ${e.hero ? fig({ ...e.hero, origin: 'Wikimedia Commons' }, 'dz-hero') : ''}
    ${d ? body(d) : gate(ctx, e)}
    ${err ? html`<p class="small muted">Couldn't load the dossier: ${err}</p>` : ''}
  </article>`;
}
