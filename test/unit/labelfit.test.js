import { describe, it, expect } from "vitest";
import { etiketSigdirici, ortakOnek, oran, TABAN_PX } from "../../src/core/labelfit.js";
import { contentBBox, planHome } from "../../src/core/plan.js";
import { newGrid } from "../../src/PlanEditor.jsx";

/* ══════════════════════════════════════════════════════════════════════════
   GÖRÜNÜRLÜK — kullanıcının ekranda gördüğü iki kusur

   Bu dosyadaki her vaka, çizimi gören birinin SÖYLEDİĞİ bir şikâyetten
   geliyor; ikisi de sayıların doğru, resmin yanlış olduğu türden:

   A) "sahne nerde?"  — sahne plandaydı, sığdırma hesabı yalnız bloklara
      bakıyordu, sahne ekran dışında kalıyordu.
   B) "tüm yazılar birbirine girmiş" — rozetler sabit boydaydı, dar
      blokların üstünde komşusuna biniyordu.
   ══════════════════════════════════════════════════════════════════════════ */

/* Bursa Tayyare'nin gerçek ölçüleri: sahne blokların 675 cm ÜSTÜNDE. */
const TAYYARE = {
  blocks: [
    { ...newGrid(0, 250), id: "b1", label: "SALON-ON", level: "Zemin", rows: 10, cols: 10 },
    { ...newGrid(0, 1520), id: "b2", label: "SALON-ARKA", level: "Zemin", rows: 3, cols: 10 },
  ],
  shapes: [{ id: "s1", kind: "rect", type: "stage", label: "SAHNE", x: 0, y: -450, w: 1300, h: 450 }],
};

describe("çerçeve ŞEKİLLERİ de kapsar", () => {
  it("sahne, blokların dışında olsa da içerik sınırının içinde", () => {
    const b = contentBBox(TAYYARE);
    /* Sahnenin ÜST kenarı -675. Sınır onu kapsamıyorsa sahne ekranda yok. */
    expect(b.y0).toBeLessThanOrEqual(-675);
  });

  it("Sığdır çerçevesi sahnenin TAMAMINI gösterir", () => {
    const h = planHome({ ...TAYYARE, home: null });
    expect(h.y).toBeLessThan(-675);
    expect(h.y + h.h).toBeGreaterThan(-225);
  });

  it("operatörün kaydettiği home'a dokunulmaz", () => {
    const home = { x: -1, y: -2, w: 3, h: 4 };
    expect(planHome({ ...TAYYARE, home })).toBe(home);
  });

  it("şekilsiz plan eskisi gibi çalışır", () => {
    const b = contentBBox({ blocks: TAYYARE.blocks, shapes: [] });
    expect(b.y0).toBeGreaterThan(0);
  });

  it("boş plan null döner — çağıran boş çerçeveye düşsün", () => {
    expect(contentBBox({ blocks: [], shapes: [] })).toBe(null);
  });
});

describe("ortak önek", () => {
  it("hepsinin paylaştığı baştaki kelimeleri sayar", () => {
    expect(ortakOnek(["MARATON ALT A", "MARATON ALT B", "MARATON ÜST A"])).toBe(1);
    expect(ortakOnek(["MARATON ALT A", "MARATON ALT B"])).toBe(2);
  });
  it("son kelimeyi ASLA yemez — geriye boş ad kalmasın", () => {
    expect(ortakOnek(["LOCA", "LOCA"])).toBe(0);
    expect(ortakOnek(["A B C", "A B C"])).toBe(2);
  });
  it("ortak yoksa 0", () => {
    expect(ortakOnek(["KUZEY A", "MARATON A"])).toBe(0);
  });
  it("tek etiketin öneki kesilmez — kıyaslayacak kardeşi yok", () => {
    expect(ortakOnek(["MARATON ALT A"])).toBe(0);
  });
});

/* Sığdırıcıyı gerçek ölçülerle çağırmak için küçük bir yardımcı:
   pxPerDunya = 1 alınca "dünya boyu" doğrudan piksel demek. */
const sig = (etiketler) => {
  const f = etiketSigdirici(etiketler);
  return (ad, enPx) => f(ad, enPx, 1000, 1);
};

describe("rozet, bloğuna sığar", () => {
  it("sığan etiket olduğu gibi yazılır", () => {
    const r = sig(["SALON"])("SALON", 400);
    expect(r.metin).toBe("SALON");
    expect(r.boy * oran("SALON")).toBeLessThanOrEqual(400 * 1.03);
  });

  it("dar blokta ORTAK ÖNEK atılır — tribüne yakınlaşınca olan bu", () => {
    const etk = ["MARATON ALT A", "MARATON ALT B", "MARATON ÜST A", "MARATON ÜST B"];
    /* Tam etiket bu genişlikte tabanın altına düşüyor. */
    const dar = TABAN_PX * oran("MARATON ALT B") * 0.9;
    const r = sig(etk)("MARATON ALT B", dar);
    expect(r.metin).toBe("ALT B");
  });

  it("kısaltma AYIRT ETMİYORSA yazılmaz — 8 bloğa 'A' yazmak yanlış bilgidir", () => {
    /* Şükrü Saracoğlu'nun gerçek kalıbı: son kelime tribünler arasında
       tekrar ediyor, ortak önek yok. */
    const etk = ["KUZEY ALT A", "KUZEY ALT B", "MARATON ALT A", "MARATON ALT B"];
    const dar = TABAN_PX * oran("KUZEY ALT A") * 0.9;
    expect(sig(etk)("KUZEY ALT A", dar)).toBe(null);
  });

  it("son kelime TEKİLSE kullanılır — dokuz loca", () => {
    const etk = ["LOCA 1", "LOCA 2", "LOCA 3", "SALON-ON"];
    const dar = TABAN_PX * oran("LOCA 3") * 0.9;
    expect(sig(etk)("LOCA 3", dar).metin).toBe("3");
  });

  it("tek kelimelik ad kısaltılamaz — sığmıyorsa yazılmaz", () => {
    const dar = TABAN_PX * oran("SALON-ARKA") * 0.9;
    expect(sig(["SALON-ARKA", "SALON-ON"])("SALON-ARKA", dar)).toBe(null);
  });

  it("hiçbir yazı bloğundan GENİŞ çizilmez", () => {
    const etk = ["MARATON ALT A", "MARATON ALT B", "KUZEY ALT A"];
    const f = sig(etk);
    for (const ad of etk) {
      for (const en of [120, 400, 3000]) {
        const r = f(ad, en);
        if (r) expect(r.boy * r.oran).toBeLessThanOrEqual(en * 1.03);
      }
    }
  });

  it("okunabilirlik tabanının altına inen yazı hiç çizilmez", () => {
    expect(sig(["TEK AD"])("TEK AD", 1)).toBe(null);
  });

  it("boş etiket yazılmaz", () => {
    expect(sig(["A"])("", 500)).toBe(null);
  });
});
