import { describe, it, expect } from "vitest";
import { migrate, CURRENT_SCHEMA_VERSION, stampSchema } from "../../src/core/schema.js";
import { DEF_NUM } from "../../src/core/labels.js";

/* validate-interactions.mjs (mevcut CI betiği) migrate()'i zaten kapsıyor
   — bu dosya AYNI davranışı vitest'in hızlı birim-test katmanında da
   sabitliyor (farklı araç, aynı sözleşme; CI betiği SİLİNMİYOR). */
describe("migrate — şema göçü (core/schema.js)", () => {
  it("schemaVersion'sız eski kayıt güncel sürüme çıkar, eksik alanlar tamamlanır", () => {
    const legacy = {
      key: "p1", name: "Eski kayıt",
      blocks: [{ id: "b1", kind: "grid", label: "A", num: { rowScheme: "letter", seatStart: 5 } }],
      shapes: [],
    };
    const migrated = migrate(legacy);
    expect(migrated.schemaVersion).toBe(CURRENT_SCHEMA_VERSION);
    // attr eksikti → migrations[0] "" ile tamamladı → migrations[1] onu OKUYUP seatKind/seatFeatures EKLEDİ
    expect(migrated.blocks[0].seatKind).toBe("single");
    expect(migrated.blocks[0].seatFeatures).toEqual([]);
    expect(migrated.blocks[0].attr).toBe(""); // eski alan KALIR (eklemeli göç, bkz. migrations[1] notu) — migrations[0]'ın garantisi
    expect(migrated.blocks[0].num).toMatchObject({ ...DEF_NUM, rowScheme: "letter", seatStart: 5 }); // var olan alanlar KORUNDU
    expect(migrated.blocks[0].id).toBe("b1"); // kimlik bozulmadı
  });

  it("zaten güncel bir kayıt DEĞİŞMEDEN çıkar (idempotent)", () => {
    const current = { schemaVersion: CURRENT_SCHEMA_VERSION, blocks: [], shapes: [], name: "x" };
    expect(migrate(current)).toEqual(current);
  });

  it("stampSchema kaydı güncel sürümle damgalar, başka hiçbir alanı değiştirmez", () => {
    const plan = { name: "x", blocks: [], shapes: [] };
    expect(stampSchema(plan)).toEqual({ ...plan, schemaVersion: CURRENT_SCHEMA_VERSION });
  });
});

/* migrations[1] (1 → 2): seat_kind + features ayrımı. Görev tanımının göç
   eşlemesi satır satır burada doğrulanıyor — her satır ayrı bir it(), ki
   biri regressiona uğrarsa hangisi olduğu hemen görünsün. Blok SEVİYESİNDE
   (b.attr) test ediyoruz; koltuk seviyesi (ov[key].at) ayrı bir describe'da. */
describe("migrate — seat_kind + features göçü, blok varsayılanı (b.attr → b.seatKind/seatFeatures)", () => {
  const migratedBlock = (attr) => {
    const plan = { schemaVersion: 1, blocks: [{ id: "b1", kind: "grid", label: "A", attr, num: {} }], shapes: [] };
    return migrate(plan).blocks[0];
  };

  it('(boş) → single, []', () => {
    const b = migratedBlock("");
    expect(b.seatKind).toBe("single");
    expect(b.seatFeatures).toEqual([]);
  });
  it('"wheel" → wheelchair_space, [accessible]', () => {
    const b = migratedBlock("wheel");
    expect(b.seatKind).toBe("wheelchair_space");
    expect(b.seatFeatures).toEqual(["accessible"]);
  });
  it('"comp" → companion, [accessible]', () => {
    const b = migratedBlock("comp");
    expect(b.seatKind).toBe("companion");
    expect(b.seatFeatures).toEqual(["accessible"]);
  });
  it('"obstr" → single, [restrictedView]', () => {
    const b = migratedBlock("obstr");
    expect(b.seatKind).toBe("single");
    expect(b.seatFeatures).toEqual(["restrictedView"]);
  });
  it('"tech" → tech, [] (raporun sözlüğü DIŞINDA, editöre özgü — bkz. core/geometry.js)', () => {
    const b = migratedBlock("tech");
    expect(b.seatKind).toBe("tech");
    expect(b.seatFeatures).toEqual([]);
  });

  /* attr BİLEREK silinmiyor — göç EKLEMELİ (yeni alan eklenir, eskisi
     kalır): resolveSeatKind seatKind'i attr'ın HER ZAMAN önüne koyduğu
     için geride kalan attr bir daha okunmaz, zararsız. scripts/validate-
     interactions.mjs (DOKUNMA) migrations[0]'ın "eksik attr boşla
     tamamlanır" garantisinin CURRENT_SCHEMA_VERSION'a göçmüş bir kayıtta
     da geçerli olduğunu sınıyor — attr'ı silmek o script'i kırardı. */
  it("attr alanı SİLİNMEZ, göç sonrası da (artık okunmayan, zararsız) eski değeriyle KALIR", () => {
    expect(migratedBlock("wheel").attr).toBe("wheel");
  });
});

describe("migrate — seat_kind + features göçü, koltuk istisnası (ov[key].at → ov[key].seatKind/seatFeatures EKLENİR)", () => {
  it("eski at:\"wheel\" içeren bir koltuk istisnası doğru koltuk-seviyesi alanları KAZANIR, diğer alanlar (dx/label) korunur, at SİLİNMEZ", () => {
    const plan = {
      schemaVersion: 1,
      blocks: [{
        id: "b1", kind: "grid", label: "A", attr: "", num: {},
        ov: { "0,2": { at: "wheel", dx: 15, label: "12A" }, "0,3": { at: "comp" } },
      }],
      shapes: [],
    };
    const b = migrate(plan).blocks[0];
    // at KALIR (eklemeli göç, bkz. migrations[1] notu) — seatKind/seatFeatures resolveSeatKind'de ÖNCELİKLİ, at bir daha okunmaz
    expect(b.ov["0,2"]).toEqual({ at: "wheel", dx: 15, label: "12A", seatKind: "wheelchair_space", seatFeatures: ["accessible"] });
    expect(b.ov["0,3"]).toEqual({ at: "comp", seatKind: "companion", seatFeatures: ["accessible"] });
  });

  it("at alanı OLMAYAN bir koltuk istisnası (ör. sadece konum düzeltmesi) dokunulmadan kalır", () => {
    const plan = {
      schemaVersion: 1,
      blocks: [{ id: "b1", kind: "grid", label: "A", attr: "", num: {}, ov: { "0,0": { dx: 5 } } }],
      shapes: [],
    };
    const b = migrate(plan).blocks[0];
    expect(b.ov["0,0"]).toEqual({ dx: 5 });
  });
});

/* migrations[2] (2 → 3): seat_group (bkz. görev raporu §5.3, core/
   geometry.js'teki resolvePlanGroups notu). Yeni alan PLAN seviyesinde
   (plan.groups) — eskiden hiç yoktu, göç yalnız EKLER. */
describe("migrate — seat_group göçü (plan.groups EKLENİR)", () => {
  it("groups alanı hiç yoksa boş dizi ile tamamlanır", () => {
    const plan = { schemaVersion: 2, blocks: [], shapes: [] };
    expect(migrate(plan).groups).toEqual([]);
  });
  it("groups zaten VARSA (ör. bir önceki göçten) dokunulmadan KORUNUR", () => {
    const existing = [{ id: "g1", code: "REF-1", name: "Refakatçi 1", kind: "companion_group" }];
    const plan = { schemaVersion: 2, blocks: [], shapes: [], groups: existing };
    expect(migrate(plan).groups).toEqual(existing);
  });
  it("v0'dan başlayan bir kayıt da (attr/seatKind göçlerinden SONRA) groups ile çıkar — zincirin son adımı", () => {
    const legacy = { blocks: [{ id: "b1", kind: "grid", label: "A", num: {} }], shapes: [] };
    const migrated = migrate(legacy);
    expect(migrated.schemaVersion).toBe(CURRENT_SCHEMA_VERSION);
    expect(migrated.groups).toEqual([]);
    expect(migrated.blocks[0].seatKind).toBe("single"); // önceki adımlar da hâlâ çalışıyor
  });
});
