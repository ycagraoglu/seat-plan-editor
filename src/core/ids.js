let uid = 0;
export const nid = (p = "b") => `${p}${++uid}`;

/** Kaydedilmiş plan yüklenirken kimlik sayacını ileri sarar — çakışma olmasın. */
export function absorbIds(p) {
  const scan = (id) => { const m = String(id || "").match(/(\d+)$/); if (m) uid = Math.max(uid, +m[1]); };
  (p.blocks || []).forEach((b) => scan(b.id));
  (p.shapes || []).forEach((s) => scan(s.id));
  return p;
}
