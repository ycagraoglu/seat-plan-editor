import { describe, it, expect } from "vitest";
import { buildSeatsPayload } from "../../src/core/export.js";
import { buildMeta } from "../../src/core/geometry.js";
import { DEF_NUM } from "../../src/core/labels.js";

/* İki koltuklu, tek sıralı minimal bir grid blok — rules.test.js'teki
   wheelchairPlan/companionGroupPlan ile AYNI iskelet (bkz. o dosya):
   buildMeta/buildSeats'in ihtiyaç duyduğu tüm alanlar dolu, testin ilgisi
   dışındakiler (seatGap/rowGap/align) sabit tutuluyor. num DEF_NUM'dan
   kuruluyor (twinBlock, test/invariants/footprint-overlap.test.js ile
   AYNI desen) — boş {} numberRow'u NaN'a düşürür, id/row/seat'i okunaklı
   tutmak için gerçek varsayılanlar şart. */
const gridBlock = (patch) => ({
  id: "b1", kind: "grid", label: "A", name: "A", x: 0, y: 0, rot: 0,
  cols: 2, rows: 1, taper: 0, curve: 0, seatGap: 50, rowGap: 90, counts: "",
  align: "center", color: "", attr: "", num: { ...DEF_NUM }, ov: {}, ...patch,
});

function payloadFor(plan) {
  const metas = plan.blocks.map((b) => ({ b, m: buildMeta(b) }));
  return buildSeatsPayload(plan, metas, {}, new Map());
}

/* export.js'in resolvePlanGroups/resolvePlanSections'a TEK kaynak olarak
   dayandığını doğrulayan testler — buildSeatsPayload kendi "level'ı
   bölüme çevir" mantığını YAZMAZ, core/geometry.js'i çağırır (bkz. o
   dosyanın dosya başı notu). */
describe("buildSeatsPayload — top-level `sections`: bölüm ağacı, parent_id ile", () => {
  it("göçmemiş bir planda (venue dosyaları, sectionId YOK) her farklı level bir derinlik-1 bölüm olur", () => {
    const plan = {
      name: "Test Salonu", idTemplate: undefined, shapes: [],
      blocks: [gridBlock({ id: "b1", level: "Parter" }), gridBlock({ id: "b2", level: "1. Balkon" })],
    };
    const payload = payloadFor(plan);
    expect(payload.sections).toHaveLength(2);
    expect(payload.sections.every((s) => s.parent_id === null && s.kind === "floor")).toBe(true);
    expect(payload.sections.map((s) => s.code).sort()).toEqual(["1. Balkon", "Parter"]);
  });

  it("kayıtlı iki seviyeli bir ağaç PARENT_ID bağlarıyla aynen dışa aktarılır", () => {
    const plan = {
      name: "Test Salonu", idTemplate: undefined, shapes: [],
      sections: [
        { id: "bati", code: "Batı Tribünü", name: "Batı Tribünü", kind: "stand", parentId: null },
        { id: "alt-kat", code: "Alt Kat", name: "Alt Kat", kind: "tier", parentId: "bati" },
        { id: "alt-h", code: "H Blok", name: "H Blok", kind: "section", parentId: "alt-kat" },
      ],
      blocks: [gridBlock({ id: "b1", label: "H", level: "Alt Kat", sectionId: "alt-h" })],
    };
    const payload = payloadFor(plan);
    expect(payload.sections).toEqual([
      { id: "bati", code: "Batı Tribünü", name: "Batı Tribünü", kind: "stand", parent_id: null },
      { id: "alt-kat", code: "Alt Kat", name: "Alt Kat", kind: "tier", parent_id: "bati" },
      { id: "alt-h", code: "H Blok", name: "H Blok", kind: "section", parent_id: "alt-kat" },
    ]);
  });
});

describe("buildSeatsPayload — koltuk satırındaki `section`: block/gate/group ile AYNI desen (code, iç id değil)", () => {
  it("her koltuk kendi bloğunun bölüm KODUNU taşır (level alanı da YANINDA, silinmeden kalır)", () => {
    const plan = {
      name: "Test Salonu", idTemplate: undefined, shapes: [],
      blocks: [gridBlock({ id: "b1", level: "Parter" })],
    };
    const payload = payloadFor(plan);
    expect(payload.seats).toHaveLength(2);
    payload.seats.forEach((s) => {
      expect(s.level).toBe("Parter"); // eski alan SİLİNMEDİ
      expect(s.section).toBe("Parter"); // yeni alan, derinlik-1'de AYNI değer
    });
  });

  it("aynı `code`'u paylaşan iki FARKLI bölümde (iki seviyeli ağaç) her koltuk kendi DALININ koduna gider", () => {
    const plan = {
      name: "Test Salonu", idTemplate: undefined, shapes: [],
      sections: [
        { id: "alt-kat", code: "Alt Kat", name: "Alt Kat", kind: "tier", parentId: null },
        { id: "ust-kat", code: "Üst Kat", name: "Üst Kat", kind: "tier", parentId: null },
        { id: "alt-h", code: "H Blok", name: "H Blok (alt)", kind: "section", parentId: "alt-kat" },
        { id: "ust-h", code: "H Blok", name: "H Blok (üst)", kind: "section", parentId: "ust-kat" },
      ],
      blocks: [
        gridBlock({ id: "b1", label: "H", level: "Alt Kat", sectionId: "alt-h" }),
        gridBlock({ id: "b2", label: "H", level: "Üst Kat", sectionId: "ust-h" }),
      ],
    };
    const payload = payloadFor(plan);
    const byBlock = (label, level) => payload.seats.filter((s) => s.block === label && s.level === level);
    // her iki blok da "H" etiketini taşıyor ama level farklı — section KODU aynı ("H Blok")
    // olsa da hangi id'ye bağlı olduğu (alt-h/ust-h) doğru çözülmüş olmalı: iki blok da
    // "H Blok" kodunu taşımalı, YANLIŞ dala (ör. ust-h'nin adına) karışmamalı.
    expect(byBlock("H", "Alt Kat").every((s) => s.section === "H Blok")).toBe(true);
    expect(byBlock("H", "Üst Kat").every((s) => s.section === "H Blok")).toBe(true);
    expect(byBlock("H", "Alt Kat")).toHaveLength(2);
    expect(byBlock("H", "Üst Kat")).toHaveLength(2);
  });

  it("koltuk satırının alanları EKLEME dışında değişmez (section, gates... hep eklendi, hiçbiri bozulmadı)", () => {
    const plan = {
      name: "Test Salonu", idTemplate: undefined, shapes: [],
      blocks: [gridBlock({ id: "b1", level: "Parter" })],
    };
    const payload = payloadFor(plan);
    expect(payload.seats.map(({ section, ...rest }) => rest)).toEqual([
      { id: "A-1-1", level: "Parter", block: "A", row: "1", seat: 1, gate: null, gates: [], x: -25, y: 0, rot: 0, seat_kind: "single", features: [], group: null },
      { id: "A-1-2", level: "Parter", block: "A", row: "1", seat: 2, gate: null, gates: [], x: 25, y: 0, rot: 0, seat_kind: "single", features: [], group: null },
    ]);
  });
});
