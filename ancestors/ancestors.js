// Ancestors Trail page (2026-11-27). Browse your own family tree on a map of the US: zoom anywhere, tap a place for who
// was there, tap a person for their card. Search and list views for people and places. Upload a GEDCOM to start.
// Only the signed-in owner ever sees their tree (Supabase RLS owner = auth.uid(), plus a copy on this phone).
import * as A from '../js/ancestors.js';
const $ = (s) => document.querySelector(s);
const esc = A.esc;
let map = null, layer = null, marks = new Map(), listTab = 'people';
const COL = { exact: '#e6c352', cemetery: '#d7dcd2', town: '#c9a227', township: '#b0813a', county: '#8a5a2c', living: '#7f9a6a' };
const colOf = (pl) => (pl.lv ? COL.living : COL[pl.q] || COL.town);

function toast(t, ms) { const el = $('#at-toast'); el.textContent = t; el.hidden = false; clearTimeout(toast.t); toast.t = setTimeout(() => { el.hidden = true; }, ms || 3500); }
function gate(html) { $('#at-app').hidden = true; const g = $('#at-gate'); g.hidden = false; g.innerHTML = '<span class="orn">✥ ❦ ✥</span><h1>Ancestors Trail</h1>' + html; }

/* ------------------------------------------------ boot */
async function boot() {
  const s = await A.init();
  if (s.status === 'off') return gate('<div class="at-card"><p>The Ancestors Trail is almost ready. It switches on for accounts as soon as its database step has been run.</p><div class="row"><a class="btn" href="../">Back to the app</a></div></div>');
  if (s.status === 'signed-out') return gate('<div class="at-card"><p>Your family tree is private to your account, so sign in to see your trail or to add a tree.</p><div class="row"><a class="btn p" href="../#/account">Sign in</a></div></div>' + about());
  if (s.status === 'error') return gate('<div class="at-card"><p>Could not load your tree right now. Check your connection and try again.</p><p class="muted small">' + esc(s.err) + '</p><div class="row"><button class="btn p" onclick="location.reload()">Try again</button></div></div>');
  if (s.status === 'none') return uploadGate();
  app();
}
function about() {
  return '<div class="at-card"><p><b>How it works.</b> Export your family tree from Ancestry, FamilySearch or MyHeritage as a GEDCOM file (.ged) and add it here. Your phone reads the file; only the places and people it finds are saved, and only to your own account.</p>'
    + '<ul><li>Every birth, marriage, home and grave in the United States lands on your map. Places outside the US are left off.</li>'
    + '<li>Records that name only a town or a county show as that town or county, not a made-up spot.</li>'
    + '<li>Living relatives stay in your tree, but their places are only ever a wide circle, never a house.</li>'
    + '<li>With the live map running, you get a nudge when you drive near one of your ancestors’ places, and a family stamp in your passport.</li></ul></div>';
}
function uploadGate(prev) {
  gate('<div class="at-card"><p>' + (prev ? 'Replace your tree with a new file. Your current trail and family stamps are replaced.' : 'Add your family tree to start your trail.') + '</p>'
    + '<label class="at-file">Choose a GEDCOM file (.ged)<input type="file" id="at-file" accept=".ged,.gedcom,text/plain,application/octet-stream"></label>'
    + '<p id="at-step" class="muted small" role="status"></p>' + (prev ? '<div class="row"><button class="btn ghost" id="at-cancel">Cancel</button></div>' : '') + '</div>' + about());
  if (prev) $('#at-cancel').onclick = () => app();
  $('#at-file').onchange = async (e) => {
    const f = e.target.files[0]; if (!f) return;
    const step = (t) => { $('#at-step').textContent = t; };
    try {
      if (f.size > 60 * 1024 * 1024) throw new Error('That file is over 60 MB. Export the tree without media and try again.');
      const t = await A.processFile(f, '../', step);
      if (!t.people.length) throw new Error('No people with places in the United States were found in that file.');
      await A.saveTree(t, f.name.replace(/\.[^.]+$/, ''));
      app(t.stats);
    } catch (err) { step(err.message || String(err)); }
  };
}

/* ------------------------------------------------ map */
function app(justAdded) {
  $('#at-gate').hidden = true; $('#at-app').hidden = false;
  if (!map) {
    map = L.map('at-map', { zoomControl: false, preferCanvas: true, worldCopyJump: true }).setView([39.5, -96], 4);
    L.control.zoom({ position: 'bottomright' }).addTo(map);
    L.tileLayer('https://tile.openstreetmap.org/{z}/{x}/{y}.png', { maxZoom: 18, attribution: '&copy; OpenStreetMap contributors' }).addTo(map);
    layer = L.layerGroup().addTo(map);
    map.on('zoomend', paintZoom);
    $('#at-px').onclick = closePanel;
    $('#at-list-btn').onclick = () => (panelKind === 'list' ? closePanel() : showList());
    $('#at-menu-btn').onclick = () => (panelKind === 'menu' ? closePanel() : showMenu());
    $('#at-find').onsubmit = (e) => { e.preventDefault(); showList($('#at-q').value); };
    $('#at-q').oninput = () => { if (panelKind === 'list' || $('#at-q').value.length >= 2) showList($('#at-q').value); };
    window.addEventListener('hashchange', route);
  }
  draw();
  legend();
  // frame where most of the family was (trim the farthest 3% so one record in Alaska or Hawaii does not shrink the map)
  const pts = A.mappedPlaces().map((i) => A.state.tree.places[i]).filter((p) => !p.lv);
  if (pts.length) {
    const q = (arr, f) => arr.slice().sort((a, b) => a - b)[Math.min(arr.length - 1, Math.max(0, Math.round(f * (arr.length - 1))))];
    const la = pts.map((p) => p.la), lo = pts.map((p) => p.lo), t = pts.length > 30 ? 0.03 : 0;
    map.fitBounds([[q(la, t), q(lo, t)], [q(la, 1 - t), q(lo, 1 - t)]], { maxZoom: 9, padding: [20, 20] });
  }
  if (justAdded) showStats(justAdded); else route();
}
function draw() {
  layer.clearLayers(); marks.clear();
  const places = A.state.tree.places;
  const idx = A.mappedPlaces().sort((a, b) => (places[b].r || 0) - (places[a].r || 0));   // big areas first, so small ones stay tappable on top
  for (const i of idx) {
    const pl = places[i], got = !!A.state.stamps[A.stampId(i)], c = colOf(pl);
    let m;
    if (pl.q === 'exact' || pl.q === 'cemetery') {
      m = L.marker([pl.la, pl.lo], { icon: L.divIcon({ className: '', html: '<div class="at-pin' + (pl.q === 'cemetery' ? ' cem' : '') + (got ? ' got' : '') + '"></div>', iconSize: [22, 22], iconAnchor: [11, 11] }), title: pl.lb, keyboard: false });
    } else {
      const area = L.circle([pl.la, pl.lo], { radius: pl.r, color: got ? '#ff4a4a' : c, weight: pl.lv ? 1.5 : 1.2, dashArray: pl.lv ? '6 6' : (pl.q === 'county' ? '2 5' : null), fillColor: c, fillOpacity: pl.q === 'county' ? 0.05 : 0.13, interactive: true });
      const dot = L.circleMarker([pl.la, pl.lo], { radius: pl.q === 'county' ? 4 : 5, color: got ? '#ff4a4a' : '#120d0d', weight: got ? 2 : 1, fillColor: c, fillOpacity: 0.95 });
      m = L.featureGroup([area, dot]);
      m.area = area; m.dot = dot;
    }
    m.on('click', () => { location.hash = 'p=' + i; });
    m.bindTooltip(esc(pl.lb), { sticky: true, direction: 'top' });
    layer.addLayer(m); marks.set(i, m);
  }
  paintZoom();
}
function paintZoom() { const z = map.getZoom(); for (const [i, m] of marks) if (m.dot) { const pl = A.state.tree.places[i]; m.dot.setRadius(z >= 9 ? 6 : pl.q === 'county' ? 3 : 4); } }
function legend() {
  const t = A.state.tree, n = A.mappedPlaces().length;
  $('#at-legend').innerHTML = '<span><i style="background:' + COL.cemetery + '"></i>Cemetery</span><span><i style="background:' + COL.town + '"></i>Town</span><span><i style="background:' + COL.county + '"></i>County</span><span><i style="background:' + COL.living + '"></i>Living (wide area)</span><span class="muted">' + n.toLocaleString() + ' places · ' + t.people.length.toLocaleString() + ' people</span>';
}

/* ------------------------------------------------ panel */
let panelKind = '';
function openPanel(kind, title, html) { panelKind = kind; $('#at-panel').hidden = false; $('#at-pt').textContent = title; $('#at-pb').innerHTML = html; $('#at-pb').scrollTop = 0; $('#at-list-btn').setAttribute('aria-expanded', kind === 'list'); $('#at-menu-btn').setAttribute('aria-expanded', kind === 'menu'); wire($('#at-pb')); }
function closePanel() { panelKind = ''; $('#at-panel').hidden = true; if (location.hash) history.replaceState(null, '', location.pathname); $('#at-list-btn').setAttribute('aria-expanded', false); $('#at-menu-btn').setAttribute('aria-expanded', false); }
function wire(root) {
  root.querySelectorAll('[data-i]').forEach((b) => { b.onclick = () => { location.hash = 'i=' + b.dataset.i; }; });
  root.querySelectorAll('[data-p]').forEach((b) => { b.onclick = () => { location.hash = 'p=' + b.dataset.p; }; });
}
function route() {
  const h = location.hash.slice(1); const m = h.match(/^(i|p)=(.+)$/);
  if (!m) return;
  if (m[1] === 'i') showPerson(decodeURIComponent(m[2])); else showPlace(+m[2], true);
}
const pdot = (p) => '<span class="dot" style="background:' + (p.liv ? COL.living : '#c9a227') + '"></span>';
const personRow = (p, sub) => '<button class="at-li" data-i="' + esc(p.i) + '">' + pdot(p) + '<span><span class="nm">' + esc(p.n) + '</span><br><span class="sub">' + esc([A.rel(p.i), A.lifeLine(p), sub].filter(Boolean).join(' · ')) + '</span></span></button>';

function showPlace(i, fly) {
  const pl = A.state.tree.places[i]; if (!pl) return;
  if (fly && isFinite(pl.la)) map.flyTo([pl.la, pl.lo], Math.max(map.getZoom(), pl.q === 'county' ? 8 : pl.q === 'cemetery' || pl.q === 'exact' ? 13 : 11), { duration: 0.8 });
  const rows = A.peopleAt(i).map(([pid, k]) => { const p = A.state.byId.get(pid); const e = p.e[k]; return { p, e }; })
    .sort((a, b) => (A.yearOf(a.e[1]) || 9999) - (A.yearOf(b.e[1]) || 9999));
  const got = A.state.stamps[A.stampId(i)];
  let h = '<div><span class="tag">' + esc(A.QWORD[pl.q] || pl.q) + '</span>' + (pl.lv ? '<span class="tag lv">living relative</span>' : '') + (got ? '<span class="tag st">Family stamp ' + esc(new Date(got.at).toLocaleDateString()) + '</span>' : '') + '</div>'
    + '<p class="at-note">' + esc(A.precisionNote(pl)) + '</p>';
  if (pl.alt) h += '<p class="at-note">The record names only the town. ' + esc(pl.alt.cm) + ' is the cemetery named after it, so it may be there, but the record does not say.</p>';
  h += rows.map(({ p, e }) => personRow(p, A.evLabel(e) + (e[1] ? ' ' + e[1] : ''))).join('');
  if (!pl.lv && (pl.q === 'cemetery' || pl.q === 'exact')) h += '<div class="row"><a class="btn sm" target="_blank" rel="noopener" href="https://www.google.com/maps/dir/?api=1&destination=' + pl.la + ',' + pl.lo + '&travelmode=driving">Directions</a></div>';
  openPanel('place', pl.lb, h);
}
function showPerson(id) {
  const p = A.state.byId.get(id); if (!p || p.link) return;
  const T = A.state.tree;
  const fam = (ids, word) => { const ok = (ids || []).map((x) => A.state.byId.get(x)).filter((q) => q && !q.link); return ok.length ? '<div class="at-st">' + word + '</div><div class="at-fam">' + ok.map((q) => '<button data-i="' + esc(q.i) + '">' + esc(q.n) + '</button>').join('') + '</div>' : ''; };
  const kids = T.people.filter((q) => (q.f || []).includes(id)).map((q) => q.i);
  let h = '<div class="at-person"><h2>' + esc(p.n) + '</h2>' + (A.rel(id) ? '<div class="at-rel">' + esc(A.rel(id) === 'you' ? 'This is you' : A.rel(id).charAt(0).toUpperCase() + A.rel(id).slice(1)) + '</div>' : '')
    + '<div class="at-life">' + esc(A.lifeLine(p)) + (p.liv ? ' <span class="tag lv">living: places shown only as wide areas</span>' : '') + '</div>';
  h += '<div class="at-ev">' + (p.e.length ? p.e.map((e) => {
    const pl = e[2] >= 0 ? T.places[e[2]] : null; const w = e[3] ? A.state.byId.get(e[3]) : null;
    return '<div class="k">' + esc(A.evLabel(e)) + '</div><div class="v">' + esc(e[1] || 'date not recorded') + (w && !w.link ? ' · with <button data-i="' + esc(w.i) + '">' + esc(w.n) + '</button>' : '')
      + (pl ? '<br>' + (pl.q === 'state' ? esc(pl.lb) + '<span class="q">state only, not on the map</span>' : '<button data-p="' + e[2] + '">' + esc(pl.lb) + '</button><span class="q">' + esc(A.QWORD[pl.q] + (pl.lv ? ', wide area' : '')) + '</span>') : '') + '</div>';
  }).join('') : '<div class="k"></div><div class="v muted">No US records for this person in the tree.</div>') + '</div>';
  h += fam(p.f, 'Parents') + fam(p.s, 'Spouses') + fam(kids, 'Children');
  h += '<div class="row">' + (A.state.home === id ? '' : '<button class="btn sm ghost" id="at-me">This is me</button>') + '</div></div>';
  openPanel('person', p.n, h);
  const me = $('#at-me'); if (me) me.onclick = async () => { await A.setHome(id); toast('Relationships now show from ' + p.n + '.'); showPerson(id); };
}
function showList(q) {
  q = String(q == null ? $('#at-q').value : q).trim().toLowerCase();
  const T = A.state.tree;
  const tabs = '<div class="at-tabs" role="tablist"><button role="tab" data-t="people" aria-selected="' + (listTab === 'people') + '">People</button><button role="tab" data-t="places" aria-selected="' + (listTab === 'places') + '">Places</button><button role="tab" data-t="stamps" aria-selected="' + (listTab === 'stamps') + '">Stamps</button></div>';
  let body = '';
  if (listTab === 'people') {
    const sname = (p) => { const w = p.n.split(' '); return (w[w.length - 1] + ' ' + p.n).toLowerCase(); };
    let ppl = T.people.filter((p) => !q || p.n.toLowerCase().includes(q) || A.rel(p.i).includes(q));
    const near = (p) => { const r = A.rel(p.i); return r === 'you' ? 0 : /father|mother|parent/.test(r) && !/grand/.test(r) ? 1 : /grand/.test(r) && !/uncle|aunt|nephew|niece|spouse|husband|wife/.test(r) ? 2 : r && !/of your|spouse’s/.test(r) ? 3 : r ? 4 : 5; };
    ppl = ppl.sort((a, b) => (q ? 0 : near(a) - near(b)) || sname(a).localeCompare(sname(b)));
    body = '<p class="muted small">' + ppl.length.toLocaleString() + (q ? ' matching' : '') + ' people' + (q ? '' : ', closest relatives first') + '</p>' + ppl.slice(0, 300).map((p) => personRow(p)).join('') + (ppl.length > 300 ? '<p class="muted small">Showing 300. Type a name to narrow it down.</p>' : '');
  } else if (listTab === 'places') {
    const idx = A.mappedPlaces().filter((i) => !q || T.places[i].lb.toLowerCase().includes(q));
    const byState = new Map(); for (const i of idx) { const s = T.places[i].lb.split(', ').pop(); if (!byState.has(s)) byState.set(s, []); byState.get(s).push(i); }
    body = '<p class="muted small">' + idx.length.toLocaleString() + ' places on the map</p>' + [...byState.entries()].sort((a, b) => a[0].localeCompare(b[0])).map(([s, list]) => '<div class="at-st">' + esc(s) + ' · ' + list.length + '</div>'
      + list.sort((a, b) => T.places[a].lb.localeCompare(T.places[b].lb)).map((i) => { const pl = T.places[i]; return '<button class="at-li" data-p="' + i + '"><span class="dot" style="background:' + colOf(pl) + '"></span><span><span class="nm">' + esc(pl.lb.split(', ').slice(0, -1).join(', ') || pl.lb) + '</span><br><span class="sub">' + esc(A.QWORD[pl.q] + (pl.lv ? ', living relative (wide area)' : '') + ' · ' + A.peopleAt(i).length + ' record' + (A.peopleAt(i).length === 1 ? '' : 's')) + '</span></span></button>'; }).join('')).join('');
  } else {
    const st = A.familyStamps();
    body = st.length ? st.map((s) => { const pl = T.places[s.place]; return '<button class="at-li" data-p="' + s.place + '"><span class="dot" style="background:#ff4a4a"></span><span><span class="nm">' + esc(pl.lb) + '</span><br><span class="sub">Stamped ' + esc(new Date(s.at).toLocaleDateString()) + '</span></span></button>'; }).join('')
      : '<p>No family stamps yet. Open the <a href="../live/">live map</a>, press Start, and drive to any of these places: the stamp lands in your passport.</p>';
  }
  openPanel('list', 'Your family', tabs + body);
  document.querySelectorAll('[data-t]').forEach((b) => { b.onclick = () => { listTab = b.dataset.t; showList(); }; });
}
const pl = (n, one, many) => n.toLocaleString() + ' ' + (n === 1 ? one : many || one + 's');
function showStats(s) {
  const pr = s.precision || {};
  const sum = (re) => Object.entries(pr).filter(([k]) => re.test(k)).reduce((a, [, v]) => a + v, 0);
  openPanel('stats', 'Your trail is ready', '<div class="at-stats"><div><b>' + s.people_kept.toLocaleString() + '</b>people</div><div><b>' + s.places.toLocaleString() + '</b>places</div><div><b>' + (sum(/^cemetery/) + sum(/^exact/)) + '</b>exact spots</div><div><b>' + sum(/^town|^township/) + '</b>towns</div><div><b>' + sum(/^county/) + '</b>counties</div><div><b>' + s.living + '</b>living relatives</div></div>'
    + '<p class="at-note">Left off: ' + pl(s.non_us_events, 'record') + ' outside the US, ' + s.unplaceable_events.toLocaleString() + ' too vague to place, ' + pl(s.duplicates_people, 'duplicate person', 'duplicate people') + ' and ' + pl(s.duplicates_events, 'repeated event') + '.</p><div class="row"><button class="btn p" id="at-go">See the map</button></div>');
  $('#at-go').onclick = closePanel;
}
function showMenu() {
  const T = A.state.tree, home = A.state.byId.get(A.state.home);
  openPanel('menu', 'Your tree', '<p>Relationships are shown from <b>' + esc(home ? home.n : 'nobody yet') + '</b>. To change it, open anyone’s card and tap “This is me”.</p>'
    + '<p class="muted small">' + T.people.length.toLocaleString() + ' people, ' + A.mappedPlaces().length.toLocaleString() + ' places on the map. Made ' + esc(new Date(T.made).toLocaleDateString()) + '. Only you can see this tree.</p>'
    + '<div class="row"><button class="btn" id="at-replace">Replace with a new file</button><button class="btn ghost" id="at-del">Delete my tree</button></div>');
  $('#at-replace').onclick = () => { closePanel(); uploadGate(true); };
  $('#at-del').onclick = async () => { if (!confirm('Delete your family tree and family stamps from your account? This cannot be undone.')) return; try { await A.deleteTree(); closePanel(); layer.clearLayers(); uploadGate(); } catch (e) { toast(e.message); } };
}
boot();
window.__tdAncDebug = { get state() { return { status: A.state.status, people: A.state.tree?.people.length || 0, places: A.state.tree ? A.mappedPlaces().length : 0, drawn: marks.size, stamps: Object.keys(A.state.stamps || {}).length }; }, get map() { return map; } };
