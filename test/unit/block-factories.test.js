/* ═══════════════════════════════════════════════════════════════════════
   ŞEMSİYE INVARIANT A — renk KORUNUMU: renksiz giren blok renksiz çıkar,
   renkli giren blok rengini korur. "Renksiz" ⇒ cc(b) = b.color ||
   LEVEL_COLORS[...] (PlanEditor.jsx ~953) kat paletine düşer; açık bir
   b.color HER ZAMAN o paletin önüne geçer, dolayısıyla bir üretim yolu
   RASTGELE bir renk enjekte ederse kat paleti bir daha hiç görünmez
   (bkz. level-color.test.js). Bu dosya o korunumu PlanEditor.jsx'teki ÜÇ
   üretim noktasında (blok fabrikaları + adoptPlan + mirror) doğruluyor;
   aynı invariant'ın geri kalan yolları için bkz. arrays.test.js
   (linearArray/radialArray) ve test/invariants/template-plans.test.js
   ("hiçbir blokta açık color alanı yok" — şablonlar hiç girdi bloğu
   almadığı için sadece "enjekte etmez" yönü test edilebiliyor, "korur"
   yönü şablonlara uygulanmıyor).

   handle-roundtrip.test.js'in kanıtladığı gibi vite.config.js zaten
   react() eklentisini yüklüyor, vitest de onu kullanıyor — PlanEditor.jsx
   JSX içerse bile düz fonksiyonları doğrudan import edilebiliyor. Bu
   yüzden level-color.test.js'teki hand-copy yerine GERÇEK fonksiyonlar
   çağrılıyor: biri regressiona uğrarsa bu test onu kopyasız yakalar. */
import { describe, it, expect } from "vitest";
import { newGrid, newFan, newTable, newFree, adoptPlan, mirrorBlock } from "../../src/PlanEditor.jsx";

/* ── 1) blok fabrikaları ───────────────────────────────────────────────
   REGRESYON: yeni blok fabrikaları (operatörün TUVALE ÇİZDİĞİ bloklar)
   açık bir `color` yazmamalı. 81966d5 örnek salonlardan/şablonlardan
   sabit rengi kaldırdı ama bu dört fabrika unutulmuştu: newTable hariç
   üçü hâlâ "#3E7FBF" basıyordu, yani operatör salonu şablondan değil
   ELLE kurarsa 81966d5'in kazanımı hiç görünmüyordu (ölçülen: elle
   kurulan salon + balkon → iki kata rağmen 171 koltuğun hepsi #3E7FBF,
   bkz. görev raporu, HATA 1). Fabrikalar saf üreteç olduğu için (girdi
   bloğu almazlar) sadece "enjekte etmez" yönü anlamlı — korunacak bir
   girdi rengi yok. */
describe("blok fabrikaları açık renk yazmaz, kat paletine bırakır", () => {
  it("newGrid → color boş", () => expect(newGrid(0, 0, 4, 4).color).toBe(""));
  it("newFan → color boş", () => expect(newFan(0, 0, 500).color).toBe(""));
  it("newFree → color boş", () => expect(newFree(0, 0).color).toBe(""));
  /* newTable zaten doğruydu (tek doğru olan) — regresyon bekçisi olarak burada. */
  it("newTable → color boş (regresyon bekçisi)", () => expect(newTable(0, 0).color).toBe(""));
});

/* ── 2) adoptPlan (plan.json içe aktarma) ───────────────────────────────
   HATA 1'in İKİNCİ, o turda hâlâ atlanan üretim noktası: adoptPlan'ın
   varsayılan iskeleti "#3E7FBF" basıyordu, `...b` spread'i SADECE b.color
   VARSA onun önüne geçiyordu — yani dışarıdan gelen RENKSİZ bir blok
   (color alanı hiç yoksa) içe aktarma yoluyla renk KAZANIYORDU, tıpkı
   eski fabrikalar gibi. Renkli girdi (kullanıcının o planda zaten seçtiği
   renk) zaten spread sayesinde güvenliydi — burada TERS yönü de (renk
   silinmiyor) ölçüyoruz ki "düzeltme" renklendirmeyi başka bir yönde
   bozmadığını kanıtlasın. */
describe("adoptPlan renk enjekte etmez, girdinin rengini KORUR", () => {
  const rawPlan = (blocks) => ({ blocks, home: { x: 0, y: 0, w: 100, h: 100 } });

  it("color alanı hiç olmayan girdi bloğu → çıktı da renksiz", () => {
    const plan = adoptPlan(rawPlan([{ label: "A", cols: 4, rows: 4 }]), "k");
    expect(plan.blocks[0].color).toBeFalsy();
  });

  it("color: '' ile gelen girdi → çıktı yine boş kalır (kat paletine bırakılır)", () => {
    const plan = adoptPlan(rawPlan([{ label: "A", color: "" }]), "k");
    expect(plan.blocks[0].color).toBe("");
  });

  it("renkli girdi (kullanıcının o planda seçtiği renk) → çıktıda AYNEN korunur, ezilmez", () => {
    const plan = adoptPlan(rawPlan([{ label: "A", color: "#C1743C" }]), "k");
    expect(plan.blocks[0].color).toBe("#C1743C");
  });
});

/* ── 3) mirror (aynalama) ────────────────────────────────────────────
   mirror() PlanEditor.jsx içinde bir component closure'ı — component
   dışına, tek bloğu dönüştüren SAF kısmı (mirrorBlock) çıkarıldı ki bu
   dosyadaki diğerleri gibi GERÇEK fonksiyon çağrılabilsin (bkz.
   PlanEditor.jsx'teki mirrorBlock yorumu). Alttaki dönüşüm reLabel'e
   ({...b, id, x:-b.x}) dayanıyor; reLabel color'a hiç dokunmuyor
   (core/labels.js) — ama bu bir varsayım değil, burada ÖLÇÜLÜYOR. */
describe("mirrorBlock (aynalama) renk enjekte etmez, girdinin rengini KORUR", () => {
  it("renksiz kaynak blok → aynalanmış kopya da renksiz", () => {
    const src = { id: "seed", label: "A", kind: "grid", x: 100, y: 0, rot: 0 };
    expect(mirrorBlock(src, "B").color).toBeFalsy();
  });

  it("renkli kaynak blok (kullanıcının seçtiği renk) → kopya AYNI rengi taşır", () => {
    const src = { id: "seed", label: "A", kind: "grid", x: 100, y: 0, rot: 0, color: "#7C5BA8" };
    expect(mirrorBlock(src, "B").color).toBe("#7C5BA8");
  });

  it("gerçek fonksiyon çağrıldığının kanıtı: id yenilenir, x negatiflenir, label yazılır", () => {
    const src = { id: "seed", label: "A", kind: "grid", x: 100, y: 0, rot: 0 };
    const cp = mirrorBlock(src, "B");
    expect(cp.id).not.toBe("seed");
    expect(cp.x).toBe(-100);
    expect(cp.label).toBe("B");
  });
});
