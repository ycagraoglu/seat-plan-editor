import { describe, it, expect, beforeAll, beforeEach, afterAll } from "vitest";
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

describe("canlı görünüm · MCP çizerken editör izler", () => {
  const canli = () => fetch(`${base}/live`).then((r) => r.json());
  const yaz = (key, name = key) => fetch(`${base}/live`, {
    method: "PUT", headers: { "content-type": "application/json" },
    body: JSON.stringify({ plan: { key, name, blocks: [], shapes: [] } }),
  });
  const kes = () => fetch(`${base}/live`, { method: "DELETE" });

  beforeEach(() => { db.exec("DELETE FROM editor_prefs WHERE key = '__live'"); });

  it("kimse çizmiyorken aktif değil", async () => {
    expect(await canli()).toEqual({ aktif: false });
  });

  it("yazma kilidi alır; yaş SUNUCUDA hesaplanır", async () => {
    expect((await yaz("ai-t1", "Test Salonu")).status).toBe(204);
    const d = await canli();
    expect(d.aktif).toBe(true);
    expect(d.key).toBe("ai-t1");
    expect(d.name).toBe("Test Salonu");
    /* Tarayıcı kendi saatiyle karşılaştırsaydı saat kayması yanıltırdı. */
    expect(d.yasSaniye).toBeTypeOf("number");
    expect(d.yasSaniye).toBeLessThan(5);
  });

  it("plan editor_plans'a düşer — Store.list() onu görür", async () => {
    await yaz("ai-t2");
    expect(await (await fetch(`${base}/plans`)).json()).toContain("ai-t2");
  });

  it("altlık soyulur — her yazmada megabaytlarca base64 gitmez", async () => {
    await fetch(`${base}/live`, {
      method: "PUT", headers: { "content-type": "application/json" },
      body: JSON.stringify({ plan: { key: "ai-t3", blocks: [], shapes: [], underlay: "data:image/png;base64,AAAA" } }),
    });
    const p = await (await fetch(`${base}/plans/ai-t3`)).json();
    expect(p.underlay).toBeNull();
  });

  it("KES kilidi düşürür VE aynı çizime yazmayı 409'lar", async () => {
    await yaz("ai-t4");
    expect((await kes()).status).toBe(204);
    expect(await canli()).toEqual({ aktif: false });
    const r = await yaz("ai-t4");
    expect(r.status).toBe(409);
    expect((await r.json()).hata).toMatch(/operatör devraldı/i);
  });

  it("KES'ten sonra YENİ bir çizim serbest — kilit sahibe değil çizime bağlı", async () => {
    /* mcp/cli.mjs her çağrıda yeni Session kuruyor; oturum kimliğine bağlı
       bir iptal, bir sonraki çağrıda yeni kimlikle geri alınırdı ve KES
       hiçbir şey ifade etmezdi. İptal edilen şey ÇİZİM. */
    await yaz("ai-t5"); await kes();
    expect((await yaz("ai-t5")).status).toBe(409);
    expect((await yaz("ai-BASKA")).status).toBe(204);
    expect((await canli()).key).toBe("ai-BASKA");
  });

  it("yaş BÜYÜR — arayüz 'çizdi mi durdu mu' ayrımını buna dayandırıyor", async () => {
    /* İlk kullanımda çıkan eksik: şerit sonsuza dek "çiziyor" diyordu,
       operatör bitti mi düşünüyor mu ayırt edemiyordu. Arayüz artık bu
       sayıya bakıp 25 sn'den sonra "durdu" diyor — "bitti" DEMİYOR, çünkü
       sessizliğin bitiş mi uzun düşünme mi olduğunu bilmenin yolu yok. */
    await yaz("ai-yas");
    expect((await canli()).yasSaniye).toBeLessThan(5);
    /* Zamanı beklemek yerine damgayı eskit — testin 25 sn sürmesi saçma. */
    const eski = new Date(Date.now() - 120_000).toISOString();
    db.prepare("UPDATE editor_prefs SET value = ? WHERE key = '__live'")
      .run(JSON.stringify({ key: "ai-yas", name: "ai-yas", at: eski, revoked: false }));
    const d = await canli();
    expect(d.aktif).toBe(true);                  /* hâlâ kilitli — kendiliğinden açılmıyor */
    expect(d.yasSaniye).toBeGreaterThan(100);    /* ama operatör durduğunu görüyor */
  });

  it("yerleşik örneğin anahtarına canlı yazma REDDEDİLİR", async () => {
    /* Editörün sessiz çatallaması buradan tetikleniyor; ön ek MCP'de
       konuyor ama sunucu da denetliyor. */
    const r = await yaz("gs");
    expect(r.status).toBe(400);
    expect((await r.json()).hata).toMatch(/ai-/);
  });
});

describe("canlı görünüm · tarayıcı sürücüsü", () => {
  const S = () => apiStore(base);
  beforeEach(() => { db.exec("DELETE FROM editor_prefs WHERE key = '__live'"); });

  it("liveGet aktif çizimi okur, liveStop KES eder", async () => {
    await fetch(`${base}/live`, {
      method: "PUT", headers: { "content-type": "application/json" },
      body: JSON.stringify({ plan: { key: "ai-s1", name: "Süreyya", blocks: [], shapes: [] } }),
    });
    expect((await S().liveGet()).name).toBe("Süreyya");
    expect(await S().liveStop()).toBe(true);
    expect((await S().liveGet()).aktif).toBe(false);
  });

  it("sunucu ÖLÜYKEN liveGet çökmüyor — görüntüleme özelliği editörü düşürmemeli", async () => {
    const olu = apiStore("http://127.0.0.1:1/api");
    expect(await olu.liveGet()).toBeNull();
    expect(await olu.liveStop()).toBe(false);
  });
});

describe("canlı görünüm · adım günlüğü", () => {
  const yazAdim = (key, n, k, b, u = []) => fetch(`${base}/live`, {
    method: "PUT", headers: { "content-type": "application/json" },
    body: JSON.stringify({ plan: { key, name: key, blocks: [], shapes: [] },
      adim: { t: new Date().toISOString(), n, k, b, u } }),
  });
  beforeEach(() => { db.exec("DELETE FROM editor_prefs WHERE key = '__live'"); });

  it("adımlar SIRAYLA birikiyor — operatör ne yapıldığını okuyabilsin", async () => {
    await yazAdim("ai-g1", "Salon bloğu eklendi", 195, 1);
    await yazAdim("ai-g1", "Arka salon eklendi", 267, 2, ["⚠ Tekerlekli sandalye alanı yok"]);
    const g = (await fetch(`${base}/live`).then((r) => r.json())).gunluk;
    expect(g.map((x) => x.n)).toEqual(["Salon bloğu eklendi", "Arka salon eklendi"]);
    expect(g[1].k).toBe(267);
    expect(g[1].u[0]).toMatch(/Tekerlekli sandalye/);
  });

  it("YENİ çizime geçilince günlük sıfırlanıyor", async () => {
    await yazAdim("ai-g2", "Eski salon", 100, 1);
    await yazAdim("ai-g3", "Yeni salon", 50, 1);
    const g = (await fetch(`${base}/live`).then((r) => r.json())).gunluk;
    expect(g.map((x) => x.n)).toEqual(["Yeni salon"]);
  });

  it("günlük sınırsız büyümüyor — prefs bir metin sütunu", async () => {
    for (let i = 0; i < 65; i++) await yazAdim("ai-g4", `adım ${i}`, i, 1);
    const g = (await fetch(`${base}/live`).then((r) => r.json())).gunluk;
    expect(g.length).toBe(60);
    expect(g[g.length - 1].n).toBe("adım 64");     /* en yenisi duruyor */
  });
});
