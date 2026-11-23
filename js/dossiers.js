// Research dossiers (t259u): the PUBLIC index only (data/dossiers.json: id, name, place, hero image + credit, counts).
// The dossier text itself lives in Supabase (public.place_dossiers, RLS: admins/moderators for now) and is
// fetched by ctx.be.getDossier(id). Images are public-domain / CC copies stored with the app (assets/dossier/<id>/).
let idx = null, loading = null;
export async function loadDossierIndex() {
  if (idx) return idx;
  loading ||= fetch('data/dossiers.json', { cache: 'no-cache' }).then((r) => (r.ok ? r.json() : { dossiers: [] })).catch(() => ({ dossiers: [] }))
    .then((j) => (idx = new Map((j.dossiers || []).map((d) => [d.id, d]))));
  return loading;
}
export const dossierEntry = (id) => idx?.get(id) || null;
