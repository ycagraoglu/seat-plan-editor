import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { createDb, createServer } from "../../server/index.mjs";
import { apiStore } from "../../src/store/api.js";
import { sozlesme } from "../store-contract.js";
import * as V from "../../src/venues/index.js";

/* ══════════════════════════════════════════════════════════════════════════
   ENTEGRASYON: gerçek sunucu + gerçek şema

   Buradaki iddia şu: "editörü kendi backend'inize bağlamak tek dosya
   değiştirmek demek". Bunu kanıtlayan şey, bellek sürücüsünün geçtiği
   AYNI sözleşme paketinin HTTP + SQLite üstünde de geçmesi.

   İkinci yarısı yayımlama: taslak belge → raporun kanonik tabloları.
   Editörün planı bir üretim tarifidir; yayımlama onu çalıştırıp sonucu
   dondurur (rapor §5.4: published sürüm değiştirilemez).
   ══════════════════════════════════════════════════════════════════════════ */

let srv, base, db;

beforeAll(async () => {
  db = createDb(":memory:");
  srv = createServer(db);
  await new Promise((ok) => srv.listen(0, "127.0.0.1", ok));
  base = `http://127.0.0.1:${srv.address().port}/api`;
});
afterAll(() => new Promise((ok) => srv.close(ok)));

/* Sözleşmenin ÜÇÜNCÜ uygulaması — bellek ve sahte sürücüyle aynı paket.
   Her vaka temiz masa istediği için tablolar sıfırlanıyor. */
sozlesme("gerçek API sürücüsü (HTTP + SQLite)", () => {
  db.exec("DELETE FROM editor_plans; DELETE FROM editor_prefs;");
  return apiStore(base);
});

describe("yayımlama · taslak belge → kanonik tablolar", () => {
  it("yayımlanan plan raporun tablolarına yazılır ve sürüm alır", async () => {
    const S = apiStore(base);
    await S.save("aylak", V.AYLAK);
    const r = await S.publish("aylak");
    expect(r.version).toBe(1);
    expect(r.seats).toBe(47);

    const surumler = await (await fetch(`${base}/versions`)).json();
    expect(surumler).toHaveLength(1);
    expect(surumler[0].status).toBe("published");
    expect(surumler[0].seats).toBe(47);

    /* Koltuğun TAM ADRESİ zincirden okunabiliyor — raporun §5.5'teki
       "Batı Tribünü → Üst Kat → H Blok → A Sırası → 12" hedefi. */
    const koltuk = await (await fetch(`${base}/versions/${surumler[0].id}/seats?limit=1`)).json();
    expect(koltuk[0]).toMatchObject({ section_code: expect.any(String),
      row_code: expect.any(String), label: expect.any(String), seat_kind: expect.any(String) });
  });

  it("yeniden yayımlamak yeni SÜRÜM açar, eskisini superseded yapar", async () => {
    const S = apiStore(base);
    const r = await S.publish("aylak");
    expect(r.version).toBe(2);
    const surumler = await (await fetch(`${base}/versions`)).json();
    expect(surumler.map((v) => v.status)).toEqual(["superseded", "published"]);
  });

  it("bölüm ağacı üst-alt ilişkisiyle geri okunur (§5.1)", async () => {
    const surumler = await (await fetch(`${base}/versions`)).json();
    const secs = await (await fetch(`${base}/versions/${surumler.at(-1).id}/sections`)).json();
    expect(secs.length).toBeGreaterThan(0);
    expect(secs.some((s) => s.parent_section_id === null)).toBe(true);   /* kök var */
    expect(secs.some((s) => s.parent_section_id !== null)).toBe(true);   /* çocuk var */
    const ids = new Set(secs.map((s) => s.id));
    expect(secs.filter((s) => s.parent_section_id && !ids.has(s.parent_section_id))).toEqual([]);
  });

  it("şemaya oturmayan plan 422 ile ve SEBEBİYLE reddedilir, yarım kayıt kalmaz", async () => {
    const S = apiStore(base);
    const bozuk = { ...V.AYLAK, key: "bozuk",
      blocks: V.AYLAK.blocks.map((b, i) => (i === 0 ? { ...b, attr: "" } : b)),
      shapes: [{ ...V.AYLAK.shapes[0], type: "__yok__" }] };
    await S.save("bozuk", bozuk);
    const r = await fetch(`${base}/plans/bozuk/publish`, { method: "POST" });
    const body = await r.json();
    /* decoration'a düşerse şema kabul eder — o zaman da sürüm sayısı artar
       ve bu test bize dışa aktarımın bilinmeyen tipi nasıl ele aldığını
       söyler. Kritik olan: hangi yol olursa olsun YARIM KAYIT kalmaması. */
    expect(db.prepare("PRAGMA foreign_key_check").all()).toEqual([]);
    if (!r.ok) { expect(r.status).toBe(422); expect(body.detay).toBeTruthy(); }
  });

  it("ağ koparsa sözleşme bozulmaz: load null, save false, çökme yok", async () => {
    const olu = apiStore("http://127.0.0.1:1/api");
    await expect(olu.list()).resolves.toEqual([]);
    await expect(olu.load("x")).resolves.toBeNull();
    await expect(olu.save("x", {})).resolves.toBe(false);
    await expect(olu.remove("x")).resolves.toBeUndefined();
    await expect(olu.pref("x")).resolves.toBeNull();
  });
});

describe("şema kurulumu tekrarlanabilir — var olan veritabanına bağlanmak", () => {
  /* createDb() her açılışta schema.sql + editor.sql'i baştan çalıştırıyor.
     schema.sql'deki 14 CREATE TABLE ve 4 CREATE INDEX korumasızdı, yani
     sunucu YALNIZ boş bir dosyaya kalkabiliyordu: `npm run db:build`
     çalıştırılmış (ya da sunucu bir kez açılıp kapanmış) bir kurulumda
     "table already exists" ile ölüyordu. Canlı görünüm sunucuyu zorunlu
     kıldığı için bu, kullanıcının çarpacağı İLK duvardı. */
  it("aynı dosyaya iki kez bağlanmak patlamıyor", async () => {
    const { mkdtempSync, rmSync } = await import("node:fs");
    const { tmpdir } = await import("node:os");
    const path = await import("node:path");
    const dizin = mkdtempSync(path.join(tmpdir(), "sema-"));
    const dosya = path.join(dizin, "t.db");
    try {
      createDb(dosya).close();
      expect(() => createDb(dosya).close()).not.toThrow();
    } finally { rmSync(dizin, { recursive: true, force: true }); }
  });
});
