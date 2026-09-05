import { describe, it, expect } from "vitest";
import { buildDbPayload, dbSeatRows } from "../../src/core/db-export.js";
import { buildMeta, buildSeats } from "../../src/core/geometry.js";
import { gateMap } from "../../src/core/gates.js";
import { seatKey } from "../../src/core/identity.js";
import * as V from "../../src/venues/index.js";

/* ══════════════════════════════════════════════════════════════════════════
   INVARIANT: db.json GİDİŞ-DÖNÜŞÜ kimliği kaybetmez.

   Dışa aktarım ve geri okuma birbirinin tersi olmak zorunda DEĞİL (geometri
   geri gelmez, bkz. db-export.js dbSeatRows notu) ama kimlik eşleşmesi
   birebir olmak ZORUNDA: karşı sistemin kodunu benimsemek için editörün her
   koltuğu db.json'daki karşılığını (blok · sıra · koltuk) bulabilmeli.

   Bu testin yakaladığı sınıf: dışa aktarımın "code" alanlarından biri
   (bölüm kodu, satır kodu, koltuk etiketi) çizimdeki karşılığından
   sapıyorsa eşleşme sessizce sıfıra düşer — kullanıcı "0 koltuk eşleşti"
   görür, sebebini göremez.
   ══════════════════════════════════════════════════════════════════════════ */

const VENUES = ["CSO", "ZORLU", "GS", "ULKER", "HARBIYE", "AYLAK", "SUREYYA", "AKM", "YENIKAPI"];

describe.each(VENUES)("%s · db.json gidiş-dönüşü", (k) => {
  const v = V[k];
  const metas = v.blocks.map((b) => ({ b, m: buildMeta(b) }));
  const payload = buildDbPayload(v, metas, gateMap(v));
  const geri = dbSeatRows(payload);

  /* çizimdeki koltuklar — PlanEditor'ün runMatch'iyle AYNI anahtar */
  const cizim = new Map();
  metas.forEach(({ b, m }) => buildSeats(b, m, v.idTemplate).seats.forEach((s) => {
    if (!s.gap) cizim.set(seatKey(s.block, s.row, s.num), s);
  }));

  it("geri okunan satır sayısı koltuk sayısına eşit", () => {
    expect(geri).toHaveLength(payload.seats.length);
    expect(geri.length).toBe(cizim.size);
  });

  it("her geri okunan satır çizimdeki bir koltuğa oturur", () => {
    const kayip = geri.filter((r) => !cizim.has(seatKey(r.block, r.row, r.seat)));
    expect(kayip.slice(0, 5)).toEqual([]);
  });

  it("eşleşme birebir: iki satır aynı koltuğa düşmez", () => {
    const g = new Set(); const cift = [];
    geri.forEach((r) => { const key = seatKey(r.block, r.row, r.seat);
      if (g.has(key)) cift.push(key); else g.add(key); });
    expect(cift.slice(0, 5)).toEqual([]);
  });

  it("taşınan kimlik çizimdeki kimliğin AYNISI (kimlik kaybı yok)", () => {
    const sapan = geri.filter((r) => {
      const s = cizim.get(seatKey(r.block, r.row, r.seat));
      return s && r.id !== s.id;
    });
    expect(sapan.slice(0, 5)).toEqual([]);
  });
});
