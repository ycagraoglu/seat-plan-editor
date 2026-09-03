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
    expect(migrated.blocks[0].attr).toBe(""); // eksik attr tamamlandı
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
