import { buildMeta, buildSeats } from "./geometry.js";

/* ─────────────────────────  SÜRÜM FARKI  ─────────────────────────
   İki plan arasındaki koltuk kimliği farkı. Kaldırılan kimlik = satılmış
   biletin karşılığının yok olması. Yayın öncesi görülmesi gereken tek şey bu.
   ─────────────────────────────────────────────────────────────── */

export function planSeatMap(pl) {
  const m = new Map();
  pl.blocks.forEach((b) => {
    const meta = buildMeta(b);
    buildSeats(b, meta, pl.idTemplate).seats.forEach((s) => { if (!s.gap) m.set(s.id, s); });
  });
  return m;
}

export function diffPlans(base, next) {
  const A = planSeatMap(base), B = planSeatMap(next);
  const removed = [], added = [], moved = [], changed = [];
  A.forEach((s, id) => {
    const t = B.get(id);
    if (!t) { removed.push(id); return; }
    if (Math.hypot(t.x - s.x, t.y - s.y) > 25) moved.push(id);
    if ((t.at || "") !== (s.at || "")) changed.push(id);
  });
  B.forEach((s, id) => { if (!A.has(id)) added.push(id); });
  return { removed, added, moved, changed, from: A.size, to: B.size };
}

export const stripUnderlay = (p) => ({ ...p, underlay: null });
export const planFingerprint = (p) =>
  JSON.stringify({ b: p.blocks, s: p.shapes.map(({ id, ...r }) => r), n: p.name });
