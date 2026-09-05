import { describe, it, expect } from "vitest";
import { buildDbPayload } from "../../src/core/db-export.js";
import { buildMeta, buildSeats } from "../../src/core/geometry.js";
import { gateMap } from "../../src/core/gates.js";
import * as V from "../../src/venues/index.js";
import { VENUE_NAMES } from "./helpers.js";

/* ══════════════════════════════════════════════════════════════════════════
   INVARIANT: tablo biçimli dışa aktarım referans bütünlüğünü korur.

   buildDbPayload hedef şemanın TABLOLARINI üretiyor. Bir INSERT dizisinin
   çalışabilmesi için her yabancı anahtarın hedefinin var olması şart —
   kırık bir referans veritabanına yazma anında patlar, burada yakalanmalı.

   Dokuz örnek salon üstünde otomatik: yeni bir salon eklendiğinde ya da
   dışa aktarım şekli değiştiğinde bu test onu da kapsar.
   ══════════════════════════════════════════════════════════════════════════ */

const VENUES = VENUE_NAMES;
const payload = (k) => {
  const v = V[k];
  return buildDbPayload(v, v.blocks.map((b) => ({ b, m: buildMeta(b) })), gateMap(v));
};

describe.each(VENUES)("%s · tablo dışa aktarımı", (k) => {
  const v = V[k];
  const gates = gateMap(v);
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

  it("aynı üst bölüm altında kod tekrarlanmaz (rapor §5.1 UNIQUE kısıtı)", () => {
    /* Şemanın kısıtı: UNIQUE (tenant_id, version_id, parent_section_id, code).
       Editör bir bölümü geometrisi değiştiği için birkaç bloğa bölebilir
       (Zorlu "ORK-O" → 3 blok); dışa aktarım bunları TEK bölümde birleştirir. */
    const gorulen = new Map(); const cakisan = [];
    p.sections.forEach((s) => {
      const k = `${s.parent_id ?? ""}\u0000${s.code ?? ""}`;
      if (gorulen.has(k)) cakisan.push(`${s.code} < ${s.parent_id}`); else gorulen.set(k, 1);
    });
    expect(cakisan).toEqual([]);
  });

  it("aynı bölüm içinde satır kodu tekrarlanmaz", () => {
    const gorulen = new Map(); const cakisan = [];
    p.rows.forEach((r) => {
      const k = `${r.section_id}\u0000${r.code}`;
      if (gorulen.has(k)) cakisan.push(k); else gorulen.set(k, 1);
    });
    expect(cakisan).toEqual([]);
  });

  it("kapı-bölüm eşleşmesi tekrarlanmaz (bağlantı tablosu birincil anahtarı)", () => {
    const g = new Set(); const cakisan = [];
    p.entrance_sections.forEach((e) => {
      const k = `${e.entrance_id}\u0000${e.section_id}`;
      if (g.has(k)) cakisan.push(k); else g.add(k);
    });
    expect(cakisan).toEqual([]);
  });

  it("koltuk-kapı eşlemesi TÜM kapıları taşır (çok kapılı blok yönlendirmesi)", () => {
    /* Bir blok gerçekte sık sık birden çok kapıdan girilir — Ülker'de 42
       blok, Harbiye ve AKM'de üç kapılı bloklar var. Dışa aktarım eskiden
       yalnız ilkini yazıyordu: dokuz salonda 13.575 yönlendirme satırı
       sessizce kayboluyordu, AKM'de yarıdan fazlası. seats[].entrance_id
       hâlâ BİRİNCİL kapıdır; tamamı entrance_seats'te. */
    /* Her koltuk, bloğunun kapı sayısı kadar satır üretmeli. */
    let hedef = 0;
    v.blocks.forEach((b) => {
      const n = (gates.get(b.id) || []).length;
      if (!n) return;
      hedef += n * buildSeats(b, buildMeta(b), v.idTemplate).seats.filter((s) => !s.gap).length;
    });
    expect(p.entrance_seats).toHaveLength(hedef);

    const entIds = new Set(p.entrances.map((e) => e.id));
    const seatIds = new Set(p.seats.map((s) => s.id));
    expect(p.entrance_seats.filter((e) => !entIds.has(e.entrance_id))).toEqual([]);
    expect(p.entrance_seats.filter((e) => !seatIds.has(e.seat_id))).toEqual([]);
  });

  it("birincil kapı, koltuğun kapı listesinin İÇİNDE olmalı", () => {
    const cift = new Set(p.entrance_seats.map((e) => `${e.seat_id}\u0000${e.entrance_id}`));
    const disarda = p.seats.filter((s) => s.entrance_id && !cift.has(`${s.id}\u0000${s.entrance_id}`));
    expect(disarda.slice(0, 3)).toEqual([]);
  });
});
