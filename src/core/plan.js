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

/* Özellik listesi karşılaştırması: sıradan bağımsız olsun diye sıralanıp
   birleştiriliyor — PlanEditor.jsx özellikleri hep FEATURES'in kanonik
   sırasıyla yazsa da (bkz. sortFeatures), bir diff fonksiyonu için bu
   VARSAYIMA güvenmek yerine burada AYRICA garanti etmek daha ucuz bir
   sigorta. */
const featureKey = (f) => (f || []).slice().sort().join(",");

export function diffPlans(base, next) {
  const A = planSeatMap(base), B = planSeatMap(next);
  const removed = [], added = [], moved = [], changed = [];
  A.forEach((s, id) => {
    const t = B.get(id);
    if (!t) { removed.push(id); return; }
    if (Math.hypot(t.x - s.x, t.y - s.y) > 25) moved.push(id);
    if (t.seatKind !== s.seatKind || featureKey(t.seatFeatures) !== featureKey(s.seatFeatures)) changed.push(id);
  });
  B.forEach((s, id) => { if (!A.has(id)) added.push(id); });
  return { removed, added, moved, changed, from: A.size, to: B.size };
}

export const stripUnderlay = (p) => ({ ...p, underlay: null });
export const planFingerprint = (p) =>
  JSON.stringify({ b: p.blocks, s: p.shapes.map(({ id, ...r }) => r), n: p.name });

/* ─────────────────────────  GÖRÜNTÜ ÇERÇEVESİ  ─────────────────────────
   `plan.home` planın açılışta gösterileceği dünya dikdörtgeni. Bildirilmiş
   olması BEKLENİR ama zorunlu DEĞİLDİR: dışarıdan gelen bir plan.json, elle
   yazılmış bir salon dosyası ya da göçmemiş eski bir kayıt onu taşımayabilir.

   Taşımadığında editör ÇÖKMEMELİ. Eskiden `view: venues[vk].home` doğrudan
   okunuyordu ve home yoksa `view.w` tanımsızda patlıyordu — kullanıcı için
   uygulamanın tamamen kaybı, üstelik sebebi görünmeden. (Aynı türetme
   adoptPlan içinde zaten vardı; oradan geçmeyen her yol korumasızdı.)

   Türetme: blokların kapladığı alan + %10 pay. Blok yoksa boş plan çerçevesi.
   ───────────────────────────────────────────────────────────────────────── */

export const FALLBACK_HOME = { x: -2000, y: -2000, w: 4000, h: 4000 };

export function planHome(plan, bos = FALLBACK_HOME) {
  const h = plan && plan.home;
  if (h && Number.isFinite(h.w) && Number.isFinite(h.h) && h.w > 0 && h.h > 0) return h;

  const bb = (plan?.blocks || []).map(buildMeta).map((m) => m.bbox)
    .filter((b) => b && Number.isFinite(b.x0));
  if (!bb.length) return bos;

  const x0 = Math.min(...bb.map((b) => b.x0)), x1 = Math.max(...bb.map((b) => b.x1));
  const y0 = Math.min(...bb.map((b) => b.y0)), y1 = Math.max(...bb.map((b) => b.y1));
  const pad = Math.max(x1 - x0, y1 - y0) * 0.1;
  return { x: x0 - pad, y: y0 - pad, w: x1 - x0 + 2 * pad, h: y1 - y0 + 2 * pad };
}
