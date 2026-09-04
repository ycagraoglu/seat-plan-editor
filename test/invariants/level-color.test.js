/* ═══════════════════════════════════════════════════════════════════════
   INVARIANT: "Renklendir: Kat" kanalı her ÇOK KATLI örnek salonda gerçekten
   kat gösteriyor — yani PlanEditor.jsx'teki cc(b) mantığıyla hesaplanan
   tuval rengi, blok sayısından değil KAT sayısından farklı olmamalı.

   Gerçek hata: builders.js'teki üreteçler (bowl/gr/fanB/tier/tbl) her
   bloğa KOŞULSUZ bir `color` yazıyordu. cc(b) = b.color || LEVEL_COLORS[...]
   açık b.color'ı HER ZAMAN kat paletine tercih ettiği için (bkz.
   PlanEditor.jsx satır ~953) o sabit renk hiçbir zaman kat paletine
   düşmüyordu — lejant kat başına bir renk vaat ediyor, tuval başka
   renkler çiziyordu. Ölçülen: GS 3 kat ama 7 renk, Ülker 4 kat ama 8 renk,
   Zorlu 3 kat ama 4 renk, AKM ise üç kat ama TEK renk (bkz. görev raporu).
   Bu görev üreteçlerden/salon dosyalarından o koşulsuz `color` alanını
   kaldırdı; bu test bir daha geri gelmesin diye var.

   CSO ve YENİKAPI kapsam DIŞI: ikisi de tek kata sahip (CSO'da fanB()'nin
   varsayılan level'ı "Ana Salon" hep aynı, YENİKAPI'da tek blok) — kat
   ARASI bir çelişki fiziksel olarak mümkün değil, "farklı renk sayısı kat
   sayısına eşit olsun" testi tek katlı bir salonda anlamsız (1'e eşit olan
   her renk sayısı zaten "geçer", hiçbir şey doğrulamaz). Süreyya'ya bilerek
   dokunulmadı (kat başına zaten tek, kendine özgü bir renk var, çelişki
   yoktu — bkz. görev raporu) ama kat sayısı 1'den büyük olduğu için burada
   YİNE DE ölçülüyor: hardcoded renkleri kat sayısıyla zaten eşleştiği için
   bu test onda da yeşil kalmalı, aksi hâlde birileri Süreyya'nın elle
   seçilmiş renklerinden birini bir başka katla çakıştırmış demektir. */
import { describe, it, expect } from "vitest";
import { selectLevels } from "../../src/ui/state/selectors.js";
import { VENUES } from "./helpers.js";

/* PlanEditor.jsx'ten (satır ~409) BİREBİR kopya. İçe aktarılamıyor: orada
   modül-özel bir `const`, dışa aktarılmıyor; cc() ise onu kullanan bileşenin
   İÇİNDE tanımlı bir useCallback closure'ı, modül seviyesinde hiç yok. O
   dosyaya (DOKUNMA listesinde) yeni bir export eklemek bu görevin kapsamı
   dışında; scripts/lib/load-module.mjs'nin EXTRA_EXPORTS'u da aynı sebeple
   (scripts/** DOKUNMA) genişletilemez. Tek dizi, altı sabit hex — drift
   riski helpers.js'teki WIDE_ATTRS ile aynı mantıkla düşük tutuluyor.
   ponytail: LEVEL_COLORS değişirse (yeni renk eklenir/sıra değişir) bu
   satır da PlanEditor.jsx ile elle senkron tutulmalı. */
const LEVEL_COLORS = ["#3E7FBF", "#5F9142", "#C1743C", "#7C5BA8", "#3E9092", "#C2415A"];

/* cc(b) = b.color || LEVEL_COLORS[...] — PlanEditor.jsx satır ~953-954,
   BİREBİR aynı formül. */
function cc(b, levels) {
  return b.color || LEVEL_COLORS[Math.max(0, levels.indexOf(b.level || "")) % LEVEL_COLORS.length];
}

/* Kat sayısı ≤1 olan örnek salonlar (bkz. dosya başı notu) — kat-arası bir
   çelişki fiziksel olarak mümkün olmadığından testin kapsamı dışında. */
const MULTI_FLOOR = VENUES.filter(([, venue]) => selectLevels(venue).length > 1);

describe("invariant: kat rengi kanalı her çok katlı salonda gerçekten kat gösteriyor", () => {
  it.each(MULTI_FLOOR)("%s: cc() farklı renk sayısı == kat sayısı", (_key, venue) => {
    const levels = selectLevels(venue);
    const colors = new Set(venue.blocks.map((b) => cc(b, levels)));
    expect(colors.size, `katlar: ${JSON.stringify(levels)}, renkler: ${JSON.stringify([...colors])}`)
      .toBe(levels.length);
  });

  /* testin testi: AKM'nin asıl hatasının aynısı — iki kat, ama HER bloğa
     aynı sabit color basılmış. cc() bunu 1 renge indirger, kat sayısı (2)
     ile eşleşmez; bu test onu yakalamalı. */
  it("testin testi: iki kata basılan tek sabit renk KIRMIZI döner", () => {
    const broken = {
      blocks: [
        { level: "Parter", color: "#000" },
        { level: "1. Balkon", color: "#000" },
      ],
    };
    const levels = selectLevels(broken);
    const colors = new Set(broken.blocks.map((b) => cc(b, levels)));
    expect(colors.size).not.toBe(levels.length);
  });
});
