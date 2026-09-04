/* ═══════════════════════════════════════════════════════════════════════
   INVARIANT: aynı kat çakışma sıfır; kat-arası çakışma sıfır (örnek
   salonlarda hiç olmamalı).

   Gerçek hata: AKM'de 1. ve 2. Balkon tabanları %16 biniyordu — yalnız-
   aynı-kat kontrolü bunu hiç görmemişti (bkz. rules.js dosya başı notu).
   rules.js'teki "footprint-overlap-same-level" (err) ve
   "footprint-overlap-cross-level" (warn — gerçek bir salonda balkon
   parterin üstüne sarkabilir, bu YÜZDEN üretimde hata değil uyarı) ZATEN
   var; yeni kural YAZMIYORUZ. Ama scripts/validate-venues.mjs'in kendi
   kabul çıtası (FAIL_REGARDLESS_OF_SEVERITY) production'dan daha SIKI:
   9 örnek salonda kat-arası çakışma da SIFIR olmalı — aynı çıtayı burada
   da uyguluyoruz.
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

/* İki blok, aynı yerde, birbiriyle 100% çakışacak şekilde — bilerek kırık. */
const twinBlock = (id, level) => ({
  id, kind: "grid", label: id, name: id, level, rot: 0, x: 0, y: 0,
  cols: 5, rows: 3, taper: 0, curve: 0, seatGap: 50, rowGap: 90, counts: "",
  align: "center", color: "#000", attr: "", num: { ...DEF_NUM }, ov: {},
});

describe("invariant: aynı kat taban çakışması sıfır", () => {
  it.each(VENUES)("%s", (_key, venue) => {
    const hit = findingsFor(venue).find((f) => f.id === "footprint-overlap-same-level");
    expect(hit, JSON.stringify(hit)).toBeUndefined();
  });

  it("testin testi: aynı kattaki iki üst üste blok KIRMIZI döner", () => {
    const plan = { blocks: [twinBlock("b1", "Parter"), twinBlock("b2", "Parter")], shapes: [], idTemplate: undefined };
    const hit = findingsFor(plan).find((f) => f.id === "footprint-overlap-same-level");
    expect(hit).toBeDefined();
    expect(hit.ids.sort()).toEqual(["b1", "b2"]);
  });
});

describe("invariant: kat-arası taban çakışması sıfır (örnek salonlarda hiç olmamalı)", () => {
  it.each(VENUES)("%s", (_key, venue) => {
    const hit = findingsFor(venue).find((f) => f.id === "footprint-overlap-cross-level");
    expect(hit, JSON.stringify(hit)).toBeUndefined();
  });

  it("testin testi: farklı kattaki iki üst üste blok KIRMIZI döner (üretimde warn, burada da yakalanır)", () => {
    const plan = { blocks: [twinBlock("b1", "1. Balkon"), twinBlock("b2", "2. Balkon")], shapes: [], idTemplate: undefined };
    const hit = findingsFor(plan).find((f) => f.id === "footprint-overlap-cross-level");
    expect(hit).toBeDefined();
    expect(hit.ids.sort()).toEqual(["b1", "b2"]);
  });
});
