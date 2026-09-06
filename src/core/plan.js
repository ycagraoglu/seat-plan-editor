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

   Türetme: İÇERİĞİN kapladığı alan + %10 pay. İçerik yoksa boş plan
   çerçevesi.
   ───────────────────────────────────────────────────────────────────────── */

export const FALLBACK_HOME = { x: -2000, y: -2000, w: 4000, h: 4000 };

/** Bir şeklin dünya sınırı. Dikdörtgen w/h taşır, çokgen nokta listesi. */
export function shapeBBox(s) {
  if (!s || !Number.isFinite(s.x) || !Number.isFinite(s.y)) return null;
  if (s.kind === "poly" && Array.isArray(s.pts) && s.pts.length) {
    const xs = s.pts.map((p) => s.x + p.x), ys = s.pts.map((p) => s.y + p.y);
    return { x0: Math.min(...xs), x1: Math.max(...xs), y0: Math.min(...ys), y1: Math.max(...ys) };
  }
  const w = s.w || 0, h = s.h || 0;
  return { x0: s.x - w / 2, x1: s.x + w / 2, y0: s.y - h / 2, y1: s.y + h / 2 };
}

/* İÇERİK = bloklar + ŞEKİLLER. Şekilleri saymamak gerçek bir kayıptı:
   sahne blokların dışında (üstünde) durur, dolayısıyla yalnız bloklara
   bakan her sığdırma sahneyi ekran dışında bırakıyordu — "sahne nerede?"
   sorusunun tek sebebi buydu. Aynı hata mcp/render.mjs'te AYRI ayrı
   bulunup orada YEREL olarak yamanmıştı; kural buraya alındı ki iki yol
   ayrışamasın. Duvar, perde, kapı da aynı şekilde artık içerik. */
export function contentBBox(plan) {
  const bb = (plan?.blocks || []).map(buildMeta).map((m) => m.bbox)
    .concat((plan?.shapes || []).map(shapeBBox))
    .filter((b) => b && Number.isFinite(b.x0) && Number.isFinite(b.y0));
  if (!bb.length) return null;
  return {
    x0: Math.min(...bb.map((b) => b.x0)), x1: Math.max(...bb.map((b) => b.x1)),
    y0: Math.min(...bb.map((b) => b.y0)), y1: Math.max(...bb.map((b) => b.y1)),
  };
}

export function planHome(plan, bos = FALLBACK_HOME) {
  const h = plan && plan.home;
  if (h && Number.isFinite(h.w) && Number.isFinite(h.h) && h.w > 0 && h.h > 0) return h;

  const b = contentBBox(plan);
  if (!b) return bos;

  const pad = Math.max(b.x1 - b.x0, b.y1 - b.y0) * 0.1;
  return { x: b.x0 - pad, y: b.y0 - pad, w: b.x1 - b.x0 + 2 * pad, h: b.y1 - b.y0 + 2 * pad };
}
