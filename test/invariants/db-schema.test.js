import { describe, it, expect } from "vitest";
import { openDb, createSchema, loadPayload } from "../../db/load.mjs";
import { buildDbPayload } from "../../src/core/db-export.js";
import { buildMeta } from "../../src/core/geometry.js";
import { gateMap } from "../../src/core/gates.js";
import * as V from "../../src/venues/index.js";

/* ══════════════════════════════════════════════════════════════════════════
   INVARIANT: dışa aktarım MİMARİ RAPORUN ŞEMASINA oturur.

   Bu dosyanın hakemi ben değilim, db/schema.sql. Raporun sözlükleri orada
   CHECK, §5.1'in kardeş-tekil kod kuralı UNIQUE, §5.4'ün composite FK'i FK.
   Dokuz salon oraya gerçekten INSERT ediliyor — "uyumlu" cümlesi bir iddia
   değil, veritabanının reddedebileceği bir olgu.

   İkinci yarısı da en az ilki kadar önemli: şemanın GERÇEKTEN reddettiğini
   göstermeyen bir uyum testi, kendi kendini onaylayan bir tören olurdu.
   ══════════════════════════════════════════════════════════════════════════ */

const NAMES = ["CSO", "ZORLU", "GS", "ULKER", "HARBIYE", "AYLAK", "SUREYYA", "AKM", "YENIKAPI"];
const yuk = (k) => {
  const v = V[k];
  return buildDbPayload(v, v.blocks.map((b) => ({ b, m: buildMeta(b) })), gateMap(v));
};
const taze = () => createSchema(openDb(":memory:"));

describe("dokuz salon şemaya oturuyor", () => {
  it.each(NAMES)("%s yükleniyor ve kırık referans bırakmıyor", (k) => {
    const db = taze();
    const r = loadPayload(db, yuk(k), { planKey: k });
    expect(r.seats).toBeGreaterThan(0);
    expect(db.prepare("PRAGMA foreign_key_check").all()).toEqual([]);
    const n = db.prepare("SELECT COUNT(*) c FROM seating_seats").get().c;
    expect(n).toBe(r.seats);
  });

  it("dokuzu AYNI veritabanında yan yana durur (tenant/sürüm izolasyonu)", () => {
    const db = taze();
    let seats = 0;
    NAMES.forEach((k) => { seats += loadPayload(db, yuk(k), { planKey: k }).seats; });
    expect(db.prepare("PRAGMA foreign_key_check").all()).toEqual([]);
    expect(db.prepare("SELECT COUNT(*) c FROM seating_seats").get().c).toBe(seats);
    expect(db.prepare("SELECT COUNT(*) c FROM seating_seat_plan_versions").get().c).toBe(9);
  });
});

/* ── Hakemin dişleri ──────────────────────────────────────────────────── */
describe("şema bozuk veriyi REDDEDER", () => {
  /* Aylak küçük (47 koltuk) — bozma testleri onun üstünde hızlı koşar. */
  const bozukYukle = (boz) => {
    const db = taze();
    const p = yuk("AYLAK");
    boz(p);
    return () => loadPayload(db, p, { planKey: "AYLAK" });
  };

  it("rapor sözlüğü dışı seat_kind reddedilir (§5.4 CHECK)", () => {
    expect(bozukYukle((p) => { p.seat_types[0].seat_kind = "bean_bag"; })).toThrow();
  });

  it("rapor sözlüğü dışı section.kind reddedilir (§5.1 CHECK)", () => {
    expect(bozukYukle((p) => { p.sections[0].kind = "her_neyse"; })).toThrow();
  });

  it("rapor sözlüğü dışı shape_kind reddedilir (§6.3 CHECK)", () => {
    expect(bozukYukle((p) => { p.shapes[0].shape_kind = "ejderha"; })).toThrow();
  });

  it("sürümlenmemiş geometry_kind reddedilir (§6.2 — .v1 eki sözleşmenin parçası)", () => {
    expect(bozukYukle((p) => { p.shapes[0].geometry_kind = "rect"; })).toThrow();
  });

  it("aynı üst altında tekrarlanan bölüm kodu reddedilir (§5.1 UNIQUE)", () => {
    expect(bozukYukle((p) => {
      const k = p.sections.find((s) => s.parent_id);
      p.sections.push({ ...k, id: k.id + ":kopya" });      /* aynı parent + aynı code */
    })).toThrow();
  });

  it("çözülmeyen bölüm referansı reddedilir (FK)", () => {
    expect(bozukYukle((p) => { p.rows[0].section_id = "olmayan-bolum"; })).toThrow();
  });

  it("çözülmeyen koltuk tipi referansı reddedilir (§5.4 composite FK)", () => {
    expect(bozukYukle((p) => { p.seats[0].seat_type_id = "st:olmayan"; })).toThrow();
  });

  it("tanınmayan feature reddedilir (§5.4 CHECK)", () => {
    expect(bozukYukle((p) => { p.seats[0].features = ["vip_kokteyl"]; })).toThrow();
  });

  it("reddedilen yükleme YARIM KAYIT bırakmaz (işlem geri alınır)", () => {
    const db = taze();
    const p = yuk("AYLAK");
    p.seats[0].seat_type_id = "st:olmayan";
    expect(() => loadPayload(db, p, { planKey: "AYLAK" })).toThrow();
    expect(db.prepare("SELECT COUNT(*) c FROM seating_seats").get().c).toBe(0);
    expect(db.prepare("SELECT COUNT(*) c FROM seating_sections").get().c).toBe(0);
    expect(db.prepare("SELECT COUNT(*) c FROM seating_seat_plan_versions").get().c).toBe(0);
  });
});

/* ── Kapsam: satış/fiyat şemada YOK ───────────────────────────────────── */
it("şemada fiyat · satış · envanter sütunu yok (rapor §4.3 sahiplik ayrımı)", () => {
  const db = taze();
  const tablolar = db.prepare(
    "SELECT name FROM sqlite_master WHERE type='table'").all().map((r) => r.name);
  const yasak = /price|fiyat|amount|currency|sellable|availab|blocked|hold|inventory|reserv/i;
  const bulunan = [];
  tablolar.forEach((t) => {
    if (yasak.test(t)) bulunan.push(`tablo ${t}`);
    db.prepare(`PRAGMA table_info(${t})`).all()
      .forEach((c) => { if (yasak.test(c.name)) bulunan.push(`${t}.${c.name}`); });
  });
  expect(bulunan).toEqual([]);
});
