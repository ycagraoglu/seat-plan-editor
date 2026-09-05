import { describe, it, expect } from "vitest";
import { buildDbPayload } from "../../src/core/db-export.js";
import { buildMeta } from "../../src/core/geometry.js";
import { gateMap } from "../../src/core/gates.js";
import * as V from "../../src/venues/index.js";

/* ══════════════════════════════════════════════════════════════════════════
   INVARIANT: tablo biçimli dışa aktarım referans bütünlüğünü korur.

   buildDbPayload hedef şemanın TABLOLARINI üretiyor. Bir INSERT dizisinin
   çalışabilmesi için her yabancı anahtarın hedefinin var olması şart —
   kırık bir referans veritabanına yazma anında patlar, burada yakalanmalı.

   Dokuz örnek salon üstünde otomatik: yeni bir salon eklendiğinde ya da
   dışa aktarım şekli değiştiğinde bu test onu da kapsar.
   ══════════════════════════════════════════════════════════════════════════ */

const VENUES = ["CSO", "ZORLU", "GS", "ULKER", "HARBIYE", "AYLAK", "SUREYYA", "AKM", "YENIKAPI"];
const payload = (k) => {
  const v = V[k];
  return buildDbPayload(v, v.blocks.map((b) => ({ b, m: buildMeta(b) })), gateMap(v));
};

describe.each(VENUES)("%s · tablo dışa aktarımı", (k) => {
  const p = payload(k);
  const ids = (rows) => new Set(rows.map((r) => r.id));

  it("bölüm ağacının her parent_id'si var olan bir bölüme işaret eder", () => {
    const S = ids(p.sections);
    const kirik = p.sections.filter((s) => s.parent_id !== null && !S.has(s.parent_id));
    expect(kirik).toEqual([]);
  });

  it("her satır var olan bir bölüme bağlı", () => {
    const S = ids(p.sections);
    expect(p.rows.filter((r) => !S.has(r.section_id))).toEqual([]);
  });

  it("her koltuk var olan bir satıra ve koltuk tipine bağlı", () => {
    const R = ids(p.rows), T = ids(p.seat_types);
    expect(p.seats.filter((s) => !R.has(s.row_id))).toEqual([]);
    expect(p.seats.filter((s) => !T.has(s.seat_type_id))).toEqual([]);
  });

  it("koltuğun grup ve giriş atıfları (varsa) çözülür", () => {
    const G = ids(p.seat_groups), E = ids(p.entrances);
    expect(p.seats.filter((s) => s.group_id && !G.has(s.group_id))).toEqual([]);
    expect(p.seats.filter((s) => s.entrance_id && !E.has(s.entrance_id))).toEqual([]);
  });

  it("giriş-bölüm eşlemelerinin iki ucu da var", () => {
    const S = ids(p.sections), E = ids(p.entrances);
    expect(p.entrance_sections.filter((x) => !E.has(x.entrance_id) || !S.has(x.section_id))).toEqual([]);
  });

  it("kimlikler tablo içinde benzersiz", () => {
    for (const t of ["sections", "rows", "seat_types", "seat_groups", "seats", "shapes", "entrances"]) {
      expect(new Set(p[t].map((r) => r.id)).size, `${t} içinde yinelenen id`).toBe(p[t].length);
    }
  });

  it("koltuk sayısı salonun gerçek sayısıyla aynı", () => {
    const v = V[k];
    const gercek = v.blocks.reduce((a, b) => a + buildMeta(b).seatCount, 0);
    expect(p.seats).toHaveLength(gercek);
  });

  it("her şekil bir shape_kind ve geometry_kind taşır", () => {
    expect(p.shapes.filter((s) => !s.shape_kind || !s.geometry_kind)).toEqual([]);
  });

  it("fiyat/satış alanı sızmamış — kapsam dışı", () => {
    const metin = JSON.stringify(p);
    expect(metin).not.toMatch(/price|fiyat|sellable|satılabilir|available/i);
  });
});
