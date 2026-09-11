import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { baglan } from "./harness.js";

describe("referans analizi → deterministik plan", () => {
  let t;
  beforeEach(async () => { delete process.env.SEAT_EDITOR_API; t = await baglan(); });
  afterEach(async () => { await t.kapat(); });

  it("satır etiketlerini ve koltuk sayılarını tek seferde plana çeviriyor", async () => {
    await t.cagir("create_plan", { name: "Referans Salon" });
    const analiz = {
      venueKind: "cinema",
      focal: { type: "screen", label: "PERDE",
        bbox: { x: 100, y: 940, w: 800, h: 20 } },
      boundary: { x: 50, y: 20, w: 900, h: 950 },
      blocks: [
        { label: "UST-ORTA", level: "Salon", bbox: { x: 180, y: 60, w: 640, h: 600 },
          rows: [{ label: "R", seats: 16 }, { label: "P", seats: 13 }, { label: "O", seats: 12 }] },
        { level: "Salon", bbox: { x: 250, y: 720, w: 500, h: 170 },
          rows: [{ label: "D", seats: 12 }, { label: "C", seats: 12 },
            { label: "B", seats: 11 }, { label: "A", seats: 10 }] },
      ],
      observations: ["Üst ve alt bölüm arasında yatay koridor var.", "Perde altta."],
    };
    const kabul = await t.jsonCagir("submit_reference_analysis", analiz);
    expect(kabul.totalSeats).toBe(86);

    await t.cagir("replace_layout");
    const plan = t.session.plan;
    expect(plan.blocks).toHaveLength(2);
    expect(plan.blocks[1].label).toBe("");
    expect(plan.shapes.map((s) => s.type)).toEqual(["wall", "screen"]);
    expect(t.session.summaryData().blocks.map((b) => b.rowLabels))
      .toEqual([["R", "P", "O"], ["D", "C", "B", "A"]]);
    expect(t.session.summaryData().seatCount).toBe(86);
  });

  it("değişken uzunluktaki sinema sıralarını satır başına blok açmadan kuruyor", async () => {
    await t.cagir("create_plan", { name: "Sinema" });
    await t.cagir("submit_reference_analysis", {
      venueKind: "cinema",
      focal: { type: "screen", label: "STAGE & SCREEN",
        bbox: { x: 200, y: 10, w: 600, h: 40 } },
      blocks: [
        { level: "Salon", bbox: { x: 100, y: 100, w: 800, h: 300 },
          rows: [19, 20, 21, 21, 21, 22, 23].map((seats, i) =>
            ({ label: "ABCDEFG"[i], seats })) },
        { level: "Salon", bbox: { x: 100, y: 450, w: 800, h: 50 },
          rows: [{ label: "H", seats: 22 }] },
        { level: "Salon", bbox: { x: 50, y: 550, w: 900, h: 350 },
          rows: [25, 25, 25, 26, 26, 26, 26, 26].map((seats, i) =>
            ({ label: ["J", "K", "L", "M", "N", "O", "P", "R"][i], seats })) },
      ],
      observations: ["G ve H arasında ana koridor var."],
    });
    await t.cagir("replace_layout");
    expect(t.session.plan.blocks).toHaveLength(3);
    expect(t.session.summaryData().seatCount).toBe(374);
    const validation = await t.jsonCagir("validate");
    expect(validation.findings.some((f) => f.rule === "seat-in-own-block")).toBe(false);
  });
});
