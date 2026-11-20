import { calm } from '../reveals.js';
import { html, esc, truncate, toast } from '../util.js';
import { CONFIG } from '../config.js';
import { LAYERS, layerInfo, storyLabel } from '../taxonomy.js';
import { displayableImages } from '../feed.js';
import { applyFilters } from './browse.js';

let maplibreP;
const loadLib = () => maplibreP ||= new Promise((res, rej) => {
  if (window.maplibregl) return res(window.maplibregl);
  const css = document.createElement('link'); css.rel = 'stylesheet'; css.href = 'vendor/maplibre/maplibre-gl.css'; document.head.appendChild(css);
  const s = document.createElement('script'); s.src = 'vendor/maplibre/maplibre-gl.js'; s.onload = () => res(window.maplibregl); s.onerror = rej; document.head.appendChild(s);
});

export async function mapView(ctx, q) {
  const L = ctx.feed.catalog;  // default map = for-sale catalog (Active + Pending); ?status=archive shows the archive
  const nArch = (ctx.feed.theArchive || []).filter((l) => l.lat != null).length, showArch = q.get('shelf') === 'archive';
  const layers = [...new Set([...Object.keys(LAYERS), ...L.map((l) => l.layer)])];
  return html`<div class="map-wrap">
    <div class="map-bar">
      <div class="chips-row tight" data-map-chips>${layers.map((k) => { const i = layerInfo(k); const n = L.filter((l) => l.layer === k && l.lat != null).length;
        return html`<button class="chip on ${n ? '' : 'dim'}" data-layer="${k}" aria-pressed="true" style="--c:${i.color}"><span class="dot"></span>${i.label}<small>${n}</small></button>`; })}</div>
      <div class="map-tools"><button class="chip arch-chip ${nArch ? '' : 'dim'}" data-archive aria-pressed="${showArch ? 'true' : 'false'}" title="Places with a verified dark history that are not for sale">The Archive <small>${nArch}</small></button><button class="chip" data-tier="1" aria-pressed="false">Twisted Deeds only</button><button class="chip" data-fly="mi">Michigan</button><button class="chip" data-fly="all">All US</button></div>
    </div>
    <div id="map" aria-label="Map of listings"></div>
    <div class="map-card" data-map-card hidden></div>
    <div class="map-note muted small">Hollow pins are approximate (town centre). Showing properties for sale; <b>The Archive</b> (places not for sale) can be switched on above. A dashed circle is a town area: a private home is never pinned. Sold and off-market ones are in <a href="#/archive?at=sold">Once for sale</a>.</div>
  </div>`;
}

// Pins as small wax seals (drawn once per colour on a canvas, then cached by the map).
// id: seal|<colour>|<approx 0/1>|<tier>. Approximate (town-centre) seals are hollow rings, as before.
export function sealImage(color, approx, tier1) {
  const S = 44, c = document.createElement('canvas'); c.width = c.height = S; const g = c.getContext('2d');
  const cx = S / 2, cy = S / 2 + 1, R = 15.5;
  g.beginPath();
  for (let i = 0; i <= 28; i++) { const a = (i / 28) * Math.PI * 2, r = R + Math.sin(i * 2.7) * 1.1 + Math.cos(i * 1.3) * 0.8; g[i ? 'lineTo' : 'moveTo'](cx + Math.cos(a) * r, cy + Math.sin(a) * r); }
  g.closePath();
  g.shadowColor = 'rgba(0,0,0,.65)'; g.shadowBlur = 4; g.shadowOffsetY = 2;
  if (approx) { g.lineWidth = 5; g.strokeStyle = color; g.stroke(); g.shadowColor = 'transparent'; g.lineWidth = 1; g.strokeStyle = 'rgba(0,0,0,.5)'; g.stroke(); }
  else {
    const gr = g.createRadialGradient(cx - 5, cy - 6, 2, cx, cy, R + 2); gr.addColorStop(0, 'rgba(255,255,255,.35)'); gr.addColorStop(0.25, color); gr.addColorStop(1, 'rgba(0,0,0,.55)');
    g.fillStyle = color; g.fill(); g.shadowColor = 'transparent'; g.fillStyle = gr; g.fill();
    g.beginPath(); g.arc(cx, cy, R - 5.5, 0, Math.PI * 2); g.lineWidth = 1.4; g.strokeStyle = 'rgba(0,0,0,.35)'; g.stroke();
    g.beginPath(); g.arc(cx - 0.6, cy - 0.8, R - 5.5, Math.PI * 1.1, Math.PI * 1.7); g.strokeStyle = 'rgba(255,255,255,.35)'; g.lineWidth = 1; g.stroke();
  }
  if (tier1) { g.beginPath(); g.arc(cx, cy, R + 2.2, 0, Math.PI * 2); g.lineWidth = 1.6; g.strokeStyle = '#ffe9d0'; g.stroke(); }
  return g.getImageData(0, 0, S, S);
}
const sealId = ['concat', 'seal|', ['get', 'color'], '|', ['to-string', ['get', 'approx']], '|', ['to-string', ['get', 'tier']]];

export async function mountMap(ctx, q, root) {
  const el = root.querySelector('#map');
  const showArch = q.get('shelf') === 'archive';
  let maplibregl;
  try { maplibregl = await loadLib(); } catch { el.innerHTML = '<div class="empty-state"><p>Map unavailable offline. <a href="#/browse">Use the list instead.</a></p></div>'; return; }
  const base = applyFilters(ctx.feed.listings, q, ctx.updates).filter((l) => l.lat != null && l.lon != null);
  // Spread pins that share coordinates so each stays tappable.
  const seen = {};
  const feats = base.map((l) => {
    const k = l.lat.toFixed(4) + ',' + l.lon.toFixed(4); const n = seen[k] = (seen[k] || 0) + 1;
    const a = n * 2.4, r = n > 1 ? 0.0009 * Math.sqrt(n) : 0;
    return { type: 'Feature', geometry: { type: 'Point', coordinates: [l.lon + r * Math.cos(a), l.lat + r * Math.sin(a)] },
      properties: { id: l.id, layer: l.layer, color: l.layerI.color, tier: l.tier, sov: l.grade === 'sovereign' ? 1 : 0, approx: l.geo_precision === 'town' ? 1 : 0 } };
  });
  const state = { layers: new Set(feats.map((f) => f.properties.layer)), tier1: false };
  const data = () => ({ type: 'FeatureCollection', features: feats.filter((f) => state.layers.has(f.properties.layer) && (!state.tier1 || f.properties.tier === 1)) });
  const saved = JSON.parse(sessionStorage.getItem('td-map-view') || 'null');
  const fallbackStyle = { version: 8, glyphs: 'https://tiles.openfreemap.org/fonts/{fontstack}/{range}.pbf', sources: { esri: { type: 'raster', tiles: [CONFIG.map.fallbackTiles], tileSize: 256, attribution: CONFIG.map.fallbackAttribution } }, layers: [{ id: 'esri', type: 'raster', source: 'esri' }] };
  let usedFallback = false;
  const map = new maplibregl.Map({ container: el, style: CONFIG.map.style, center: saved?.c || [-92, 39.5], zoom: saved?.z ?? 3.3, attributionControl: false });
  map.addControl(new maplibregl.AttributionControl({ compact: true, customAttribution: ctx.feed.meta.geo_attribution ? 'Geocoding © OpenStreetMap contributors' : '' }));
  map.addControl(new maplibregl.NavigationControl({ showCompass: false }), 'bottom-right');
  map.on('error', (e) => { if (!usedFallback && !map.isStyleLoaded() && /style|fetch|Failed/i.test(String(e?.error?.message || e?.error))) { usedFallback = true; map.setStyle(fallbackStyle); } });
  map.on('moveend', () => sessionStorage.setItem('td-map-view', JSON.stringify({ c: map.getCenter().toArray(), z: map.getZoom() })));
  const addLayers = () => {
    if (map.getSource('l')) return;
    map.addSource('l', { type: 'geojson', data: data(), cluster: true, clusterRadius: 38, clusterMaxZoom: 9 });
    map.addLayer({ id: 'cl', type: 'circle', source: 'l', filter: ['has', 'point_count'], paint: { 'circle-color': '#1f1819', 'circle-stroke-color': '#e8dcc4', 'circle-stroke-width': 1.2, 'circle-radius': ['step', ['get', 'point_count'], 14, 10, 19, 30, 25] } });
    map.addLayer({ id: 'cl-n', type: 'symbol', source: 'l', filter: ['has', 'point_count'], layout: { 'text-field': ['get', 'point_count_abbreviated'], 'text-size': 12, 'text-font': ['Noto Sans Bold'] }, paint: { 'text-color': '#e8dcc4' } });
    map.addLayer({ id: 'glow', type: 'circle', source: 'l', filter: ['!', ['has', 'point_count']], paint: { 'circle-color': ['get', 'color'], 'circle-radius': ['case', ['==', ['get', 'sov'], 1], 16, 12], 'circle-blur': 1, 'circle-opacity': 0.55 } });
    // the tapped pin glows like a lantern (under the seal)
    map.addLayer({ id: 'lantern', type: 'circle', source: 'l', filter: ['==', ['get', 'id'], ''], paint: { 'circle-color': '#ffb24a', 'circle-radius': 22, 'circle-blur': 1, 'circle-opacity': 0.6 } });
    const drop = !calm();
    map.addLayer({ id: 'pt', type: 'symbol', source: 'l', filter: ['!', ['has', 'point_count']],
      layout: { 'icon-image': sealId, 'icon-size': ['case', ['==', ['get', 'sov'], 1], 1.12, 0.95], 'icon-allow-overlap': true, 'icon-ignore-placement': true },
      paint: { 'icon-opacity': drop ? 0 : 1, 'icon-translate': drop ? [0, -34] : [0, 0], 'icon-opacity-transition': { duration: 450, delay: 0 }, 'icon-translate-transition': { duration: 700, delay: 0 } } });
    // wax seals drop in
    if (drop) setTimeout(() => { if (!map.getLayer('pt')) return; map.setPaintProperty('pt', 'icon-translate', [0, 0]); map.setPaintProperty('pt', 'icon-opacity', 1); }, 160);
    addArchiveLayers();
    if (!saved && !q.get('focus')) map.fitBounds([[-125, 24], [-66, 49.5]], { padding: 20, duration: 0 });
  };
  // The Archive (places not for sale). Exact-precision places are bone-coloured wax seals; a town-precision place (a private
  // home) is NEVER a pin: it is a dashed circle over the whole town area, and its coordinates are already rounded by the feed.
  const arch = (ctx.feed.theArchive || []).filter((l) => l.lat != null && l.lon != null);
  const circle = (lat, lon, km = 3.2, n = 48) => { const dLat = km / 110.57, dLon = km / (111.32 * Math.cos(lat * Math.PI / 180)); return { type: 'Polygon', coordinates: [Array.from({ length: n + 1 }, (_, i) => { const a = (i / n) * Math.PI * 2; return [lon + Math.cos(a) * dLon, lat + Math.sin(a) * dLat]; })] }; };
  const archData = (kind) => ({ type: 'FeatureCollection', features: arch.filter((l) => (l.geo_precision === 'town') === (kind === 'area')).map((l) => ({ type: 'Feature', id: undefined,
    geometry: kind === 'area' ? circle(l.lat, l.lon) : { type: 'Point', coordinates: [l.lon, l.lat] }, properties: { id: l.id, color: '#cfc8b8', approx: 0, tier: 0 } })) });
  let archOn = showArch;
  const archVis = () => { for (const id of ['arc-fill', 'arc-line', 'arc-pt']) if (map.getLayer(id)) map.setLayoutProperty(id, 'visibility', archOn ? 'visible' : 'none'); };
  const addArchiveLayers = () => {
    if (map.getSource('arc-a')) return;
    map.addSource('arc-a', { type: 'geojson', data: archData('area') }); map.addSource('arc-p', { type: 'geojson', data: archData('pin') });
    map.addLayer({ id: 'arc-fill', type: 'fill', source: 'arc-a', paint: { 'fill-color': '#cfc8b8', 'fill-opacity': 0.14 } });
    map.addLayer({ id: 'arc-line', type: 'line', source: 'arc-a', paint: { 'line-color': '#e8e2d6', 'line-width': 1.6, 'line-dasharray': [2, 2], 'line-opacity': 0.9 } });
    map.addLayer({ id: 'arc-pt', type: 'symbol', source: 'arc-p', layout: { 'icon-image': sealId, 'icon-size': 0.95, 'icon-allow-overlap': true, 'icon-ignore-placement': true } });
    archVis();
  };
  map.on('styleimagemissing', (e) => { const id = e.id || ''; if (map.hasImage(id)) return; if (!id.startsWith('seal|')) { map.addImage(id, { width: 1, height: 1, data: new Uint8Array(4) }); return; } const [, color, approx, tier] = id.split('|'); map.addImage(id, sealImage(color, approx === '1', tier === '1'), { pixelRatio: 2 }); });
  let glowT = 0;
  const lantern = (id) => {
    if (!map.getLayer('lantern')) return; cancelAnimationFrame(glowT);
    map.setFilter('lantern', ['==', ['get', 'id'], id || '']);
    if (!id || calm()) { map.setPaintProperty('lantern', 'circle-opacity', 0.6); return; }
    const t0 = performance.now();
    const tick = (t) => { const k = (t - t0) / 1000; if (k > 1.6) { map.setPaintProperty('lantern', 'circle-opacity', 0.6); return; }
      map.setPaintProperty('lantern', 'circle-opacity', 0.35 + 0.3 * Math.abs(Math.sin(k * 9) * Math.sin(k * 3.7))); map.setPaintProperty('lantern', 'circle-radius', 18 + k * 4); glowT = requestAnimationFrame(tick); };
    glowT = requestAnimationFrame(tick);
  };
  map.on('style.load', addLayers);
  map.on('load', addLayers);
  map.on('click', 'cl', (e) => { const f = e.features[0]; map.getSource('l').getClusterExpansionZoom(f.properties.cluster_id).then((z) => map.easeTo({ center: f.geometry.coordinates, zoom: z })); });
  const card = root.querySelector('[data-map-card]');
  const showCard = (l) => {
    card.hidden = false;
    card.innerHTML = `<button class="x" aria-label="Close">×</button><div class="mc-badges">${l.shelf === 'archive' ? '<span class="badge story">From the Archive</span>' : l.tier === 1 ? '<span class="badge ddd" style="--c:#c41e32"><b>Twisted Deed</b></span>' : `<span class="badge story">Strong Story${storyLabel(l) ? `<i>${esc(storyLabel(l))}</i>` : ''}</span>`} <span class="layer" style="--c:${l.layerI.color}"><span class="dot"></span>${esc(l.layerI.label)}</span></div>
      ${(() => { const i = displayableImages(l)[0]; return i ? `<div class="mc-photo" data-ph><img src="${esc(i.src || i.url)}" alt="${esc((i.image_type === 'illustration' ? 'Illustration, not a photo: ' : '') + (i.caption || l.name))}" referrerpolicy="no-referrer" data-ph-img>${i.image_type === 'illustration' ? '<span class="ph-note mc-note"><span class="ph-type illus">Illustration, not a photo</span></span>' : ''}</div>` : ''; })()}
      <h3>${esc(l.name)}</h3><div class="muted">${esc(l.place)}</div><div class="card-price">${l.shelf === 'archive' ? (l.status === 'Sold' ? 'Sold · in the Archive' : 'Not for sale · in the Archive') : esc(l.price) + ' · ' + esc(l.status)}</div>${l.townOnly ? '<div class="small muted">A private home: shown as a town area, not a pin.</div>' : ''}<p class="clamp2">${esc(truncate(l.preview?.summary || "", 180))}</p><a class="btn sm" href="#/l/${encodeURIComponent(l.id)}">Open</a>`;
    card.querySelector('.x').onclick = () => { card.hidden = true; lantern(''); };
    lantern(l.id);
  };
  map.on('click', 'pt', (e) => { const l = ctx.feed.byId.get(e.features[0].properties.id); if (l) showCard(l); });
  for (const id of ['arc-pt', 'arc-fill']) map.on('click', id, (e) => { const l = ctx.feed.byId.get(e.features[0].properties.id); if (l) showCard(l); });
  const archBtn = root.querySelector('[data-archive]');
  archBtn.onclick = () => {
    if (!arch.length) { toast('The Archive is being catalogued. Nothing is on the map yet.'); return; }
    archOn = !archOn; archBtn.classList.toggle('on', archOn); archBtn.setAttribute('aria-pressed', archOn); archVis();
    if (archOn) { const b = new maplibregl.LngLatBounds(); arch.forEach((l) => b.extend([l.lon, l.lat])); map.fitBounds(b, { padding: 60, maxZoom: 9 }); }
  };
  if (showArch && arch.length) archBtn.classList.add('on');
  // #/map?focus=<id>: fly to one listing (from its book) and open its card.
  const focus = q.get('focus') && ctx.feed.byId.get(q.get('focus'));
  if (focus && focus.lat != null) { if (focus.shelf === 'archive') { archOn = true; archBtn.classList.add('on'); archBtn.setAttribute('aria-pressed', 'true'); archVis(); } map.jumpTo({ center: [focus.lon, focus.lat], zoom: focus.geo_precision === 'town' ? 10.5 : 14 }); showCard(focus); map.once('idle', () => lantern(focus.id)); }
  for (const id of ['pt', 'cl']) { map.on('mouseenter', id, () => { map.getCanvas().style.cursor = 'pointer'; }); map.on('mouseleave', id, () => { map.getCanvas().style.cursor = ''; }); }
  const refresh = () => map.getSource('l')?.setData(data());
  root.querySelectorAll('[data-layer]').forEach((b) => b.onclick = () => { const k = b.dataset.layer; state.layers.has(k) ? state.layers.delete(k) : state.layers.add(k); b.classList.toggle('on'); b.setAttribute('aria-pressed', state.layers.has(k)); refresh(); });
  root.querySelector('[data-tier]').onclick = (e) => { state.tier1 = !state.tier1; e.currentTarget.classList.toggle('on', state.tier1); e.currentTarget.setAttribute('aria-pressed', state.tier1); refresh(); };
  root.querySelector('[data-fly="mi"]').onclick = () => map.fitBounds([[-90.5, 41.6], [-82.1, 47.5]], { padding: 20 });
  root.querySelector('[data-fly="all"]').onclick = () => map.fitBounds([[-125, 24], [-66, 49.5]], { padding: 20 });
  window._tdMap = map;
}
