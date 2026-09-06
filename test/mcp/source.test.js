import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { writeFileSync, mkdtempSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { baglan } from "./harness.js";

/* ══════════════════════════════════════════════════════════════════════════
   KAYNAK DOSYA — organizatörün listesiyle çizimi denetlemek

   Görsel NEREDE'yi, liste KAÇ TANE'yi verir. Tek başına ikisi de yetmez.
   Bu dosyanın sınadığı asıl şey: liste ile çizim TUTMUYORSA bunun sessizce
   geçmemesi. "386 eşleşti · 0 eksik · 0 fazla" cümlesi olmayan koltuğu
   satma riskini kapatan şeydir; eksik/fazla sayısını yanlış saymak o
   riski geri açar.
   ══════════════════════════════════════════════════════════════════════════ */

const ALTIN = JSON.parse(readFileSync("test/golden/sureyya.seats.json", "utf8"));
let t, dizin;

beforeEach(async () => {
  t = await baglan();
  dizin = mkdtempSync(path.join(tmpdir(), "liste-"));
  await t.cagir("open_sample", { key: "sureyya" });
});
afterEach(async () => { await t.kapat(); });

const csvYaz = (ad, satirlar) => {
  const p = path.join(dizin, ad);
  writeFileSync(p, satirlar.join("\n"));
  return p;
};
const tamListe = (kimlik = (s) => s.id) => csvYaz("liste.csv",
  ["kimlik;kat;blok;sira;koltuk",
    ...ALTIN.seats.map((s) => [kimlik(s), s.level, s.block, s.row, s.seat].join(";"))]);

describe("KABUL: liste ile çizim birebir tutuyor", () => {
  it("Süreyya'nın kendi listesi 386/386 eşleşiyor, eksik ve fazla YOK", async () => {
    const r = await t.cagir("match_seat_list", { path: tamListe() });
    expect(r).toMatch(/EŞLEŞTİ\s+386/);
    expect(r).toMatch(/EKSİK\s+0/);
    expect(r).toMatch(/FAZLA\s+0/);
    expect(r).toContain("BİREBİR tutuyor");
  });
});

describe("uyuşmazlık SESSİZCE geçmiyor", () => {
  it("listede olup çizimde olmayan = EKSİK, örnekleriyle", async () => {
    const p = csvYaz("eksikli.csv", ["kimlik;blok;sira;koltuk",
      ...ALTIN.seats.map((s) => [s.id, s.block, s.row, s.seat].join(";")),
      "X-1;ZZ;9;1", "X-2;ZZ;9;2"]);
    const r = await t.cagir("match_seat_list", { path: p });
    expect(r).toMatch(/EKSİK\s+2/);
    expect(r).toContain("ZZ|9|1");
    expect(r).toContain("TUTMUYOR");
  });

  it("çizimde olup listede olmayan = FAZLA", async () => {
    const p = csvYaz("fazlali.csv", ["kimlik;blok;sira;koltuk",
      ...ALTIN.seats.slice(0, -5).map((s) => [s.id, s.block, s.row, s.seat].join(";"))]);
    const r = await t.cagir("match_seat_list", { path: p });
    expect(r).toMatch(/FAZLA\s+5/);
    expect(r).toContain("TUTMUYOR");
  });

  it("listede tekrarlanan koltuk TEKRAR olarak sayılıyor", async () => {
    const ilk = ALTIN.seats[0];
    const p = csvYaz("tekrarli.csv", ["kimlik;blok;sira;koltuk",
      ...ALTIN.seats.map((s) => [s.id, s.block, s.row, s.seat].join(";")),
      [`${ilk.id}-kopya`, ilk.block, ilk.row, ilk.seat].join(";")]);
    expect(await t.cagir("match_seat_list", { path: p })).toMatch(/TEKRAR\s+1/);
  });

  it("sütunları eksik CSV NET hata veriyor, tanınan başlıkları sayıyor", async () => {
    const p = csvYaz("bozuk.csv", ["a;b;c", "1;2;3"]);
    await expect(t.cagir("match_seat_list", { path: p }))
      .rejects.toThrow(/sütunları eksik/);
  });
});

describe("kimlik benimseme — kalıcı kod karşı sistemdeyse", () => {
  it("dış kimlikleri benimser, çizimi değiştirmez", async () => {
    const once = (await t.jsonCagir("plan_summary")).seatCount;
    await t.cagir("match_seat_list", { path: tamListe((s) => `DB-${s.block}-${s.row}-${s.seat}`) });
    const r = await t.cagir("adopt_ids");
    expect(r).toMatch(/386 koltuk kimliği benimsendi/);
    /* Kimlik uyarlandı, ÇİZİM değişmedi. */
    expect((await t.jsonCagir("plan_summary")).seatCount).toBe(once);
  });

  it("benimsedikten sonra liste yeniden karşılaştırılınca fark KALMIYOR", async () => {
    const p = tamListe((s) => `DB-${s.block}-${s.row}-${s.seat}`);
    await t.cagir("match_seat_list", { path: p });
    await t.cagir("adopt_ids");
    const r = await t.cagir("match_seat_list", { path: p });
    expect(r).not.toContain("kimliği listedekinden farklı");
  });

  it("match çağrılmadan adopt_ids NET hata veriyor", async () => {
    await expect(t.cagir("adopt_ids")).rejects.toThrow(/Önce match_seat_list/);
  });

  it("kimlik sütunu olmayan listeden kimlik benimsenmez", async () => {
    const p = csvYaz("kimliksiz.csv", ["blok;sira;koltuk",
      ...ALTIN.seats.map((s) => [s.block, s.row, s.seat].join(";"))]);
    const r = await t.cagir("match_seat_list", { path: p });
    expect(r).toMatch(/EŞLEŞTİ\s+386/);            /* sayım denetimi yine yapılır */
    await expect(t.cagir("adopt_ids")).rejects.toThrow(/kimlik sütunu yok/);
  });
});

describe("db.json de kaynak olabilir", () => {
  it("db.json yükünden koltuk satırları okunuyor", async () => {
    const { buildDbPayload } = await import("../../src/core/db-export.js");
    const { buildMeta } = await import("../../src/core/geometry.js");
    const { gateMap } = await import("../../src/core/gates.js");
    const { SUREYYA } = await import("../../src/venues/index.js");
    const yuk = buildDbPayload(SUREYYA, SUREYYA.blocks.map((b) => ({ b, m: buildMeta(b) })), gateMap(SUREYYA));
    const p = path.join(dizin, "db.json");
    writeFileSync(p, JSON.stringify(yuk));
    const r = await t.cagir("match_seat_list", { path: p });
    expect(r).toMatch(/EŞLEŞTİ\s+386/);
    expect(r).toContain("BİREBİR tutuyor");
  });

  it("db.json değilse NET hata", async () => {
    const p = path.join(dizin, "yanlis.json");
    writeFileSync(p, JSON.stringify({ merhaba: "dünya" }));
    await expect(t.cagir("match_seat_list", { path: p })).rejects.toThrow(/db\.json bekleniyordu/);
  });
});
