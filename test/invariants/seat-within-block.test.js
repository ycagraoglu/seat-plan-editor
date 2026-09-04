/* ═══════════════════════════════════════════════════════════════════════
   INVARIANT: hiçbir koltuk kendi bloğunun tabanı dışında değil (köşeleriyle
   birlikte).

   Bu kontrol aslında src/core/rules.js'te ZATEN var ("seat-in-own-block") —
   A2/A3'te kural motoruna taşındığında eklendi ve validate() bunu otomatik
   kazandı (bkz. rules.js'teki "Aşağıdaki iki kural validate()'te YOKTU..."
   notu). Ülker'in tek sıralı yelpaze bloğunda tam bu hata çıkmıştı: taban
   hesabı kavisi takip etmediğinden koltuklar tabanın dışında kalıyordu
   (bkz. ulker.venue.js'in başlık yorumu). Yeni bir kural YAZMIYORUZ — bu
   dosya var olan kuralı 9 örnek salonun HEPSİNDE otomatik çalıştıran ve
   "testin testi" ile kırmızıya döndüğünü kanıtlayan invariant katmanı.
   ═══════════════════════════════════════════════════════════════════════ */
import { describe, it, expect } from "vitest";
import { buildMeta } from "../../src/core/geometry.js";
import { gateMap } from "../../src/core/gates.js";
import { buildCtx, runRules } from "../../src/core/rules.js";
import { DEF_NUM } from "../../src/core/labels.js";
import { VENUES } from "./helpers.js";

function findingsFor(venue) {
  const metas = venue.blocks.map((b) => ({ b, m: buildMeta(b) }));
  const gates = gateMap(venue);
  const ctx = buildCtx(venue, metas, gates);
  return runRules(ctx);
}

describe("invariant: koltuk kendi bloğunun tabanı içinde kalır (seat-in-own-block)", () => {
  it.each(VENUES)("%s", (_key, venue) => {
    const hit = findingsFor(venue).find((f) => f.id === "seat-in-own-block");
    expect(hit, JSON.stringify(hit)).toBeUndefined();
  });

  it("testin testi: elle çizilmiş, koltuklardan mil ötede bir taban (foot) KIRMIZI döner", () => {
    /* b.foot verilince buildMeta koltuklardan DEĞİL bu elle çizilmiş
       poligondan taban kurar (bkz. geometry.js'teki "manual" dalı) —
       koltuklar normal yerinde dururken taban minicik ve alakasız bir
       yerde olursa köşe kontrolü kaçırmamalı. */
    const broken = {
      id: "b-test", kind: "grid", label: "X", name: "X", level: "", rot: 0, x: 0, y: 0,
      cols: 5, rows: 3, taper: 0, curve: 0, seatGap: 50, rowGap: 90, counts: "",
      align: "center", color: "#000", attr: "", num: { ...DEF_NUM }, ov: {},
      foot: [{ x: 0, y: 0 }, { x: 2, y: 0 }, { x: 0, y: 2 }],
    };
    const plan = { blocks: [broken], shapes: [], idTemplate: undefined };
    const findings = findingsFor(plan);
    const hit = findings.find((f) => f.id === "seat-in-own-block");
    expect(hit).toBeDefined();
    expect(hit.ids).toContain("b-test");
  });
});
