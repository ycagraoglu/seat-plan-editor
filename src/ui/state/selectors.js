import { sectionPath, SECTION_SEP } from "../../core/geometry.js";

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
  /* Ağaç, EKLENME sırasını koruyarak kuruluyor (Map sırayı tutar): düz
     katlı planlarda çıktı eskisiyle BİREBİR aynı kalsın diye. Yol yazılmış
     planlarda ise çocuk, üstünün hemen ALTINDA görünmeli — blok dizisi
     "önce tüm Alt'lar, sonra tüm Üst'ler" diye sıralıysa düz toplama
     "Üst"leri sona yığıyordu. */
  const kok = new Map();
  const dugum = () => ({ tam: null, cocuk: new Map() });
  plan.blocks.forEach((b) => {
    if (!b.level) return;
    const yol = sectionPath(b.level);
    /* ARA DÜĞÜMLER DE LİSTELENİR. "Maraton / Alt" yazılmış bir blok hem
       "Maraton"u hem "Maraton / Alt"ı üretir. Eskiden yalnız yapraklar
       toplanıyordu ve bu, yol yazılmış planlarda iki şeyi birden
       bozuyordu: (1) listede dört ayrı "› Alt" görünüyor, hangisinin
       hangi tribün olduğu ayırt edilemiyordu; (2) "tüm Maraton"u seçmek
       mümkün değildi, çünkü "Maraton" hiçbir bloğun level'ı değil.
       Düz katlarda (yol uzunluğu 1) davranış BİREBİR eskisi gibi. */
    let seviye = kok;
    for (let i = 1; i <= yol.length; i++) {
      const anahtar = yol[i - 1];
      if (!seviye.has(anahtar)) seviye.set(anahtar, dugum());
      const d = seviye.get(anahtar);
      /* Tam derinlikte bloğun KENDİ dizesini kullan (birebir dönüşsün);
         ara düğümleri ayraçla birleştir. */
      d.tam = d.tam ?? (i === yol.length ? b.level : yol.slice(0, i).join(SECTION_SEP));
      seviye = d.cocuk;
    }
  });
  const out = [];
  const gez = (m) => m.forEach((d) => { out.push(d.tam); gez(d.cocuk); });
  gez(kok);
  return out;
}

/** Blokların GERÇEKTEN bulunduğu katlar, blok sırasında. selectLevels artık
 *  ara düğümleri de listeliyor; renk kanalı onları saymamalı, yoksa yaprak
 *  katların renk indeksi kayar ve mevcut salonların görünümü değişir. */
export function selectBlockLevels(plan) {
  const s = [];
  plan.blocks.forEach((b) => { if (b.level && !s.includes(b.level)) s.push(b.level); });
  return s;
}

/** Bir bloğun katı, seçili filtreye giriyor mu? Üst bölüm seçiliyse ALTINDAKİ
 *  her şey girer — "Maraton" filtresi Maraton/Alt ve Maraton/Üst'ü kapsar.
 *  TEK kaynak: aynı karşılaştırma dört ayrı yerde yapılıyordu. */
export function levelMatches(blockLevel, filter) {
  if (filter === "*") return true;
  const b = sectionPath(blockLevel || ""), f = sectionPath(filter);
  return f.length <= b.length && f.every((seg, i) => seg === b[i]);
}

/** Kat başına koltuk sayısı. metas — {b, m} çiftlerinden (m.seatCount). */
export function selectLevelCounts(metas) {
  const m = {};
  metas.forEach(({ b, m: mm }) => {
    const yol = sectionPath(b.level || "");
    if (!yol.length) { m["—"] = (m["—"] || 0) + mm.seatCount; return; }
    /* Üst bölümün sayacı altındakilerin TOPLAMI — "Maraton · 15.512"
       görünmeli, boş görünmemeli. Düz katta tek tur döner, eskisiyle aynı. */
    for (let i = 1; i <= yol.length; i++) {
      const l = i === yol.length ? b.level : yol.slice(0, i).join(SECTION_SEP);
      m[l] = (m[l] || 0) + mm.seatCount;
    }
  });
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
