import { html, esc, truncate } from '../util.js';
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
  const layers = [...new Set([...Object.keys(LAYERS), ...L.map((l) => l.layer)])];
  return html`<div class="map-wrap">
    <div class="map-bar">
      <div class="chips-row tight" data-map-chips>${layers.map((k) => { const i = layerInfo(k); const n = L.filter((l) => l.layer === k && l.lat != null).length;
        return html`<button class="chip on ${n ? '' : 'dim'}" data-layer="${k}" aria-pressed="true" style="--c:${i.color}"><span class="dot"></span>${i.label}<small>${n}</small></button>`; })}</div>
      <div class="map-tools"><button class="chip" data-tier="1" aria-pressed="false">Twisted Deeds only</button><button class="chip" data-fly="mi">Michigan</button><button class="chip" data-fly="all">All US</button></div>
    </div>
    <div id="map" aria-label="Map of listings"></div>
    <div class="map-card" data-map-card hidden></div>
    <div class="map-note muted small">Hollow pins are approximate (town centre). Showing properties for sale; sold and off-market ones are in the <a href="#/archive">archive</a>.</div>
  </div>`;
}

export async function mountMap(ctx, q, root) {
  const el = root.querySelector('#map');
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
    map.addLayer({ id: 'pt', type: 'circle', source: 'l', filter: ['!', ['has', 'point_count']], paint: {
      'circle-color': ['case', ['==', ['get', 'approx'], 1], 'rgba(0,0,0,0)', ['get', 'color']],
      'circle-stroke-color': ['case', ['==', ['get', 'approx'], 1], ['get', 'color'], ['case', ['==', ['get', 'tier'], 1], '#ffe9d0', '#0b0909']],
      'circle-stroke-width': ['case', ['==', ['get', 'approx'], 1], 2.5, ['==', ['get', 'tier'], 1], 1.8, 1],
      'circle-radius': ['case', ['==', ['get', 'sov'], 1], 7.5, 6] } });
    if (!saved) map.fitBounds([[-125, 24], [-66, 49.5]], { padding: 20, duration: 0 });
  };
  map.on('style.load', addLayers);
  map.on('load', addLayers);
  map.on('click', 'cl', (e) => { const f = e.features[0]; map.getSource('l').getClusterExpansionZoom(f.properties.cluster_id).then((z) => map.easeTo({ center: f.geometry.coordinates, zoom: z })); });
  const card = root.querySelector('[data-map-card]');
  map.on('click', 'pt', (e) => {
    const l = ctx.feed.byId.get(e.features[0].properties.id); if (!l) return;
    card.hidden = false;
    card.innerHTML = `<button class="x" aria-label="Close">×</button><div class="mc-badges">${l.tier === 1 ? '<span class="badge ddd" style="--c:#c41e32"><b>Twisted Deed</b></span>' : `<span class="badge story">Strong Story${storyLabel(l) ? `<i>${esc(storyLabel(l))}</i>` : ''}</span>`} <span class="layer" style="--c:${l.layerI.color}"><span class="dot"></span>${esc(l.layerI.label)}</span></div>
      ${(() => { const i = displayableImages(l)[0]; return i ? `<div class="mc-photo" data-ph><img src="${esc(i.src || i.url)}" alt="${esc((i.image_type === 'illustration' ? 'Illustration, not a photo: ' : '') + (i.caption || l.name))}" referrerpolicy="no-referrer" data-ph-img>${i.image_type === 'illustration' ? '<span class="ph-note mc-note"><span class="ph-type illus">Illustration, not a photo</span></span>' : ''}</div>` : ''; })()}
      <h3>${esc(l.name)}</h3><div class="muted">${esc(l.place)}</div><div class="card-price">${esc(l.price)} · ${esc(l.status)}</div><p class="clamp2">${esc(truncate(l.preview?.summary || "", 180))}</p><a class="btn sm" href="#/l/${encodeURIComponent(l.id)}">Open</a>`;
    card.querySelector('.x').onclick = () => { card.hidden = true; };
  });
  for (const id of ['pt', 'cl']) { map.on('mouseenter', id, () => { map.getCanvas().style.cursor = 'pointer'; }); map.on('mouseleave', id, () => { map.getCanvas().style.cursor = ''; }); }
  const refresh = () => map.getSource('l')?.setData(data());
  root.querySelectorAll('[data-layer]').forEach((b) => b.onclick = () => { const k = b.dataset.layer; state.layers.has(k) ? state.layers.delete(k) : state.layers.add(k); b.classList.toggle('on'); b.setAttribute('aria-pressed', state.layers.has(k)); refresh(); });
  root.querySelector('[data-tier]').onclick = (e) => { state.tier1 = !state.tier1; e.currentTarget.classList.toggle('on', state.tier1); e.currentTarget.setAttribute('aria-pressed', state.tier1); refresh(); };
  root.querySelector('[data-fly="mi"]').onclick = () => map.fitBounds([[-90.5, 41.6], [-82.1, 47.5]], { padding: 20 });
  root.querySelector('[data-fly="all"]').onclick = () => map.fitBounds([[-125, 24], [-66, 49.5]], { padding: 20 });
  window._tdMap = map;
}
