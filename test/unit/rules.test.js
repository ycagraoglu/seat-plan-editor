import { describe, it, expect } from "vitest";
import { RULES, buildCtx, runRules, seatCorners } from "../../src/core/rules.js";
import { buildMeta } from "../../src/core/geometry.js";

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

/* ─────────────────────────────────────────────────────────────────────
   seat_kind + features göçünden SONRA: tekerlekli yeterlilik / refakatçi /
   görüş-kısıtlı kuralları eski davranışla AYNI sonucu üretmeli — sadece
   veri kaynağı değişti (ctx.seats.at.wheel/comp/obstr → kinds/features).
   Blok, AKM/YENİKAPI'nın gerçekte yaptığı gibi SADECE eski ov.at alanını
   kullanıyor (venue dosyaları hiç migrate() görmez) — bu üç kural o ham
   veriden doğru sonucu üretebiliyor mu, asıl soru bu. ───────────────── */
function wheelchairPlan() {
  const block = {
    id: "b1", kind: "grid", label: "A", name: "A", level: "", x: 0, y: 0, rot: 0,
    cols: 10, rows: 1, taper: 0, curve: 0, seatGap: 50, rowGap: 90, counts: "",
    align: "center", color: "", attr: "", num: {},
    ov: {
      "0,0": { at: "wheel" }, "0,1": { at: "wheel" }, "0,2": { at: "wheel" },
      "0,3": { at: "comp" },
      "0,4": { at: "obstr" },
    },
  };
  const metas = [{ b: block, m: buildMeta(block) }];
  const ctx = buildCtx({ blocks: [block], shapes: [], idTemplate: undefined }, metas, new Map());
  return runRules(ctx);
}

describe("wheelchair-adequacy / companion-seat-shortfall / obstructed-view-count — yeni modelle çalışmaya devam ediyor", () => {
  const findings = wheelchairPlan();
  const byId = (id) => findings.find((f) => f.id === id);

  it("wheelchair-adequacy: 3 wheelchair_space (eski ov.at:'wheel') doğru sayılır, refakatçi sayısı mesajda", () => {
    const f = byId("wheelchair-adequacy");
    expect(f.t).toBe("ok"); // 10 koltuk için gereken 1, elde 3 → yeterli
    expect(f.m).toBe("3 tekerlekli sandalye alanı · 1 refakatçi");
  });

  it("companion-seat-shortfall: 1 companion (eski ov.at:'comp') < 3 wheelchair_space → uyarı", () => {
    const f = byId("companion-seat-shortfall");
    expect(f).toBeDefined();
    expect(f.t).toBe("warn");
    expect(f.m).toContain("1 < 3");
  });

  it("obstructed-view-count: eski ov.at:'obstr' artık bir FEATURE (restrictedView), kind DEĞİL — yine de doğru sayılıyor", () => {
    const f = byId("obstructed-view-count");
    expect(f).toBeDefined();
    expect(f.m).toBe("1 görüş kısıtlı koltuk");
  });

  it("seatCorners: wheelchair_space koltuğun köşesi artık SEAT_KINDS'ten (86cm) geliyor, tekli (41cm) değil", () => {
    const wheelSeat = { x: 0, y: 0, rot: 0, seatKind: "wheelchair_space" };
    const singleSeat = { x: 0, y: 0, rot: 0, seatKind: "single" };
    const wWheel = seatCorners(wheelSeat)[1].x - seatCorners(wheelSeat)[0].x; // sağ-üst - sol-üst
    const wSingle = seatCorners(singleSeat)[1].x - seatCorners(singleSeat)[0].x;
    expect(wWheel).toBeCloseTo(86, 6);
    expect(wSingle).toBeCloseTo(41, 6);
  });
});
