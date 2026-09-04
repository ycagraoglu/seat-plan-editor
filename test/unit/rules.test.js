import { describe, it, expect } from "vitest";
import { RULES, buildCtx } from "../../src/core/rules.js";

const overlapRule = RULES.find((r) => r.id === "footprint-overlap-same-level");

/* outlineOverlapArea sadece köşe noktası listesi (m.outline) ve m.bbox
   bekliyor — testin buildMeta'nın gerçek koltuk geometrisini kurmasına
   gerek yok, eksen-hizalı basit bir dikdörtgen yeterli. */
const rectMeta = (x0, x1, y0, y1) => ({
  bbox: { x0, x1, y0, y1 },
  outline: [{ x: x0, y: y0 }, { x: x1, y: y0 }, { x: x1, y: y1 }, { x: x0, y: y1 }],
});

/* Zincir çakışma: A↔B ve B↔C örtüşür, A↔C örtüşmez — 3 blok ama 2 çift.
   Görev raporundaki gerçek örnek de bu şekildeydi (balkon kademesinde 3
   blok çakışıyordu, rapor "2 blok" diyordu, durum çubuğu "3 blok"). */
function chainPlan() {
  const blocks = [
    { id: "A", label: "A", name: "A", level: "" },
    { id: "B", label: "B", name: "B", level: "" },
    { id: "C", label: "C", name: "C", level: "" },
  ];
  const metas = [
    { b: blocks[0], m: rectMeta(0, 100, 0, 100) },
    { b: blocks[1], m: rectMeta(50, 180, 0, 100) },   // A ile 50×100 = 5000 cm² örtüşür
    { b: blocks[2], m: rectMeta(160, 260, 0, 100) },  // B ile 20×100 = 2000 cm² örtüşür, A ile örtüşmez
  ];
  return { ctx: buildCtx({ blocks }, metas, new Map()), blocks };
}

describe("footprint-overlap-same-level — mesaj BLOK sayısı versin, ÇİFT sayısı değil (HATA 3)", () => {
  it("3 blok zincirleme çakışıyor (2 çift) — ids blok bazlı, m de AYNI sayıyı söylemeli", () => {
    const { ctx } = chainPlan();
    const [finding] = overlapRule.check(ctx);

    expect(finding.ids).toHaveLength(3); // hit.size: A, B, C
    /* PlanEditor.jsx'teki canlı durum çubuğu collide.length'i (= finding.ids.length)
       doğrudan gösteriyor; mesajdaki sayı bundan FARKLI olursa operatör
       hangisine güveneceğini bilemez (görev raporundaki asıl şikayet). */
    expect(finding.m).toBe(`${finding.ids.length} blok dış hattı başka bir bloğun dış hattıyla çakışıyor`);
    expect(finding.m).toContain("3 blok"); // pairs.length (2) DEĞİL
  });
});

describe("footprint-overlap-same-level — maxArea canlı büyüklük göstergesi için (EKSİK 4)", () => {
  it("birden çok çift varsa EN BÜYÜK örtüşme alanını taşır (yeni hesap yok, var olanı taşır)", () => {
    const { ctx } = chainPlan();
    const [finding] = overlapRule.check(ctx);
    expect(finding.maxArea).toBeCloseTo(5000, 6); // A↔B (5000) > B↔C (2000)
  });
});
