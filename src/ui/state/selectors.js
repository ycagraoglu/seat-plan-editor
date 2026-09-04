/* ══════════════════════════════════════════════════════════════════════════
   SEÇİCİLER (selectors) — A6.1
   --------------------------------------------------------------------------
   PlanEditor.jsx'teki useMemo'ların SADECE reducer durumuna (bkz.
   ui/state/reducer.js) bağlı olan kısmı: saf, React'siz, tek başına test
   edilebilir fonksiyonlar. Memoizasyon SINIRI PlanEditor.jsx'te kalıyor —
   bileşen bu fonksiyonları useMemo ile sarmalıyor, burası sadece HESABI
   taşıyor.

   metas/shown/drawn gibi core/geometry.js'teki buildMeta/buildSeats'i
   çağıran AĞIR türetmeler BURADA DEĞİL — PlanEditor.jsx'te useMemo olarak
   kalıyor (bkz. görev tanımı A6.1): onlar zaten render döngüsüne bağlı bir
   önbellek (seatCache) kullanıyor, seçiciye taşımak sadece bir dolaylama
   katmanı eklerdi. levelCounts/totalSeats aşağıda metas'ı PARAMETRE olarak
   alıyor (koltuk sayısı ancak geometriden çıkar) ama kendileri saf — hesap
   mantığı React'ten bağımsız, mock bir metas listesiyle de test edilebilir.
   ══════════════════════════════════════════════════════════════════════════ */

/** O an düzenlenen plan — venues sözlüğünden aktif anahtarla okunur. */
export const selectPlan = (state) => state.venues[state.vk];

/** Plandaki katların GÖRÜLME sırasıyla tekilleştirilmiş listesi (kat
 *  filtresi <select>'inin seçenekleri, lejant sırası). */
export function selectLevels(plan) {
  const s = [];
  plan.blocks.forEach((b) => { if (b.level && !s.includes(b.level)) s.push(b.level); });
  return s;
}

/** Kat başına koltuk sayısı. metas — {b, m} çiftlerinden (m.seatCount). */
export function selectLevelCounts(metas) {
  const m = {};
  metas.forEach(({ b, m: mm }) => { m[b.level || "—"] = (m[b.level || "—"] || 0) + mm.seatCount; });
  return m;
}

/** Plandaki TÜM blokların toplam koltuk sayısı (görünüme göre süzülmemiş —
 *  bkz. PlanEditor.jsx'teki shownSeats, o görünen alanı ölçer). */
export function selectTotalSeats(metas) {
  return metas.reduce((a, x) => a + x.m.seatCount, 0);
}

/** Şu an seçili bloklar — plan.blocks ile selIds'in kesişimi. */
export function selectSelectedBlocks(plan, selIds) {
  return plan.blocks.filter((b) => selIds.includes(b.id));
}
