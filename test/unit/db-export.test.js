import { describe, it, expect } from "vitest";
import { dbSeatRows } from "../../src/core/db-export.js";

/* dbSeatRows — GERİ OKUMA. Girdi kullanıcıdan gelen bir dosya: bozuk,
   eksik ya da başka bir sistemin ürettiği olabilir. Çökmemeli, sessizce
   yanlış eşleştirmemeli. */
describe("dbSeatRows — db.json'dan kimlik satırları", () => {
  const temel = {
    sections: [{ id: "s1", code: "A" }],
    rows: [{ id: "r1", section_id: "s1", code: "1" }],
    seats: [{ id: "x", code: "DB-1", row_id: "r1", label: "5" }],
  };
  it("bölüm kodu · satır kodu · koltuk etiketi · kalıcı kod olarak düzleşir", () => {
    expect(dbSeatRows(temel)).toEqual([{ block: "A", row: "1", seat: "5", id: "DB-1" }]);
  });
  it("boş yükte boş liste döner (çökmez)", () => {
    expect(dbSeatRows({})).toEqual([]);
    expect(dbSeatRows({ seats: [] })).toEqual([]);
  });
  it("çözülmeyen row_id koltuğu DÜŞÜRMEZ, boş blok/sıra ile bırakır — eşleşmez ve 'listede var, çizimde yok' olarak raporlanır", () => {
    const p = { ...temel, seats: [{ code: "DB-9", row_id: "YOK", label: "1" }] };
    expect(dbSeatRows(p)).toEqual([{ block: "", row: "", seat: "1", id: "DB-9" }]);
  });
  it("sayısal kod/etiketler dizeye çevrilir (seatKey dize karşılaştırır)", () => {
    const p = { sections: [{ id: "s1", code: 12 }], rows: [{ id: "r1", section_id: "s1", code: 3 }],
      seats: [{ code: 77, row_id: "r1", label: 8 }] };
    expect(dbSeatRows(p)).toEqual([{ block: "12", row: "3", seat: "8", id: "77" }]);
  });
});
