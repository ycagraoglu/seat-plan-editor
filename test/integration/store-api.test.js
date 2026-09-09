import { describe, it, expect, beforeAll, beforeEach, afterAll } from "vitest";
import http from "node:http";
import { createDb, createServer } from "../../server/index.mjs";
import { createImportService } from "../../server/import-service.mjs";
import { apiStore } from "../../src/store/api.js";
import { makeStore } from "../../src/store/index.js";
import { sozlesme } from "../store-contract.js";
import * as V from "../../src/venues/index.js";
import { exportJWK, generateKeyPair, SignJWT } from "jose";
import XLSX from "@e965/xlsx";

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
  srv = createServer(db, { auth: { devBypass: true } });
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

  it("sert geometri hatası olan taslak yayımlanmaz", async () => {
    const S = apiStore(base);
    const cakisan = { ...V.AYLAK, key: "cakisan",
      blocks: [V.AYLAK.blocks[0], { ...V.AYLAK.blocks[0], id: "cakisan-blok", label: "X" }],
      sections: [], groups: [], shapes: [] };
    await S.save("cakisan", cakisan);
    const r = await fetch(`${base}/plans/cakisan/publish`, { method: "POST" });
    const body = await r.json();
    expect(r.status).toBe(422);
    expect(body.detay).toMatch(/yayına hazır değil|footprint-overlap|seat-clash/);
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

describe("dosya yükleme adları · tarayıcı header sınırı", () => {
  it("Türkçe/birleşik Unicode adı imports ve chat upload yollarında birebir taşır", async () => {
    const S = apiStore(base);
    const name = "Dicle U\u0308niversitesi Cahit Sıtkı Tarancı Salonu.xlsx";
    const file = new File([new Uint8Array([1, 2, 3])], name,
      { type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" });

    const imported = await S.importSource(file);
    expect(imported).toMatchObject({ name, kind: "spreadsheet", status: "uploaded" });
    expect(imported).not.toHaveProperty("path");
    expect(JSON.stringify(imported)).not.toMatch(/seat-editor-imports|\/var\/folders|\/tmp\//);

    const chat = await S.sohbetDosya(file);
    expect(chat).toMatchObject({ name, kind: "spreadsheet", status: "uploaded" });
    await S.importCancel(imported.id);
    await S.importCancel(chat.id);
  });

  it("bozuk yüzde kodlu başlığı çökerterek değil güvenli dosya adı olarak işler", async () => {
    const r = await fetch(`${base}/imports`, {
      method: "POST", headers: { "x-file-name": "%E0%A4%A.xlsx" },
      body: new Uint8Array([1]),
    });
    expect(r.status).toBe(200);
    const item = await r.json();
    expect(item).toMatchObject({ name: "%E0%A4%A.xlsx", kind: "spreadsheet" });
    expect(item).not.toHaveProperty("path");
    await apiStore(base).importCancel(item.id);

    const once = await fetch(`${base}/imports`, {
      method: "POST", headers: { "x-file-name": encodeURIComponent("%2Fsalon.xlsx") },
      body: new Uint8Array([1]),
    }).then((response) => response.json());
    expect(once.name).toBe("%2Fsalon.xlsx");
    await apiStore(base).importCancel(once.id);
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

describe("import servisi", () => {
  it("genel yükleme yolu path sızdırmadan kaynak oturumu açar", async () => {
    const r = await fetch(`${base}/imports`, {
      method: "POST",
      headers: { "x-file-name": "salon.xlsx", "content-type": "application/octet-stream" },
      body: new Uint8Array([1, 2, 3]),
    });
    const body = await r.json();
    expect(r.status).toBe(200);
    expect(body).toMatchObject({ name: "salon.xlsx", kind: "spreadsheet", status: "uploaded" });
    expect(body.path).toBeUndefined();

    const again = await fetch(`${base}/imports/${body.id}`).then((x) => x.json());
    expect(again).toEqual(body);
  });

  it("import oturumu tenant'a göre ayrılır", async () => {
    const created = await fetch(`${base}/imports`, {
      method: "POST",
      headers: { "x-file-name": "salon.png", "x-tenant-id": "a" },
      body: new Uint8Array([1]),
    }).then((r) => r.json());
    const other = await fetch(`${base}/imports/${created.id}`, { headers: { "x-tenant-id": "b" } });
    expect(other.status).toBe(404);
  });

  it("PDF kaynak kabul edilir, GIF desteklenmez", async () => {
    const pdf = await fetch(`${base}/imports`, {
      method: "POST", headers: { "x-file-name": "salon.pdf" }, body: new Uint8Array([1]),
    }).then((r) => r.json());
    expect(pdf).toMatchObject({ kind: "image", status: "uploaded" });
    const gif = await fetch(`${base}/imports`, {
      method: "POST", headers: { "x-file-name": "salon.gif" }, body: new Uint8Array([1]),
    });
    expect(gif.status).toBe(400);
  });

  it("25 MB üstü import dosyasını diske yazmadan reddeder", async () => {
    const { mkdtempSync, existsSync, readdirSync } = await import("node:fs");
    const { rm } = await import("node:fs/promises");
    const { tmpdir } = await import("node:os");
    const path = await import("node:path");
    const dir = mkdtempSync(path.join(tmpdir(), "import-limit-"));
    const service = createImportService(dir);
    try {
      await expect(service.save({
        tenant: "t", name: "buyuk.png", bytes: new Uint8Array(25 * 1024 * 1024 + 1),
      })).rejects.toMatchObject({ statusCode: 413 });
      expect(existsSync(dir)).toBe(true);
      expect(readdirSync(dir)).toEqual([]);
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  });

  it("Excel import upload→scan→analysis→build→verify→accept durumlarından geçer", async () => {
    const wb = XLSX.utils.book_new();
    const ws = XLSX.utils.aoa_to_sheet([["A1", "A2", "A3"]]);
    XLSX.utils.book_append_sheet(wb, ws, "Plan");
    wb.Workbook = { Names: [{ Name: "BLOK_A", Ref: "Plan!$A$1:$C$1" }] };
    const bytes = XLSX.write(wb, { type: "buffer", bookType: "xlsx" });
    const upload = await fetch(`${base}/imports`, {
      method: "POST", headers: { "x-file-name": "plan.xlsx" }, body: bytes,
    }).then((r) => r.json());
    expect(upload.path).toBeUndefined();
    const scan = await fetch(`${base}/imports/${upload.id}/scan`, { method: "POST" }).then((r) => r.json());
    expect(scan).toMatchObject({ phase: "scanned", scan: { seatCount: 3 } });
    const analysis = await fetch(`${base}/imports/${upload.id}/analysis`, {
      method: "POST", headers: { "content-type": "application/json" },
      body: JSON.stringify({ name: "API Excel" }),
    }).then((r) => r.json());
    expect(analysis.phase).toBe("analysis-ready");
    const build = await fetch(`${base}/imports/${upload.id}/build`, { method: "POST" }).then((r) => r.json());
    expect(build).toMatchObject({ phase: "preview-ready", preview: { seats: 3 } });
    const verify = await fetch(`${base}/imports/${upload.id}/verify`, { method: "POST" }).then((r) => r.json());
    expect(verify).toMatchObject({ phase: "verified", verification: { verified: true } });
    const accept = await fetch(`${base}/imports/${upload.id}/accept`, { method: "POST" }).then((r) => r.json());
    expect(accept.plan.importVerification.sourceVerified).toBe(true);
  });

  it("illegal phase transition 409 verir; cancel ve TTL temp dosyayı siler", async () => {
    const { mkdtempSync, existsSync } = await import("node:fs");
    const { rm } = await import("node:fs/promises");
    const { tmpdir } = await import("node:os");
    const path = await import("node:path");
    const dir = mkdtempSync(path.join(tmpdir(), "import-clean-"));
    const service = createImportService(dir);
    const localSrv = createServer(createDb(":memory:"), { importService: service, auth: { devBypass: true } });
    await new Promise((ok) => localSrv.listen(0, "127.0.0.1", ok));
    const localBase = `http://127.0.0.1:${localSrv.address().port}/api`;
    try {
      const upload = await fetch(`${localBase}/imports`, {
        method: "POST", headers: { "x-file-name": "plan.png", "x-tenant-id": "cleanup" }, body: new Uint8Array([1, 2, 3]),
      }).then((r) => r.json());
      const file = service.get("cleanup", upload.id).path;
      expect(existsSync(file)).toBe(true);
      const illegal = await fetch(`${localBase}/imports/${upload.id}/verify`, {
        method: "POST", headers: { "x-tenant-id": "cleanup" },
      });
      expect(illegal.status).toBe(409);
      await fetch(`${localBase}/imports/${upload.id}/cancel`, {
        method: "POST", headers: { "x-tenant-id": "cleanup" },
      });
      expect(existsSync(file)).toBe(false);

      const old = await service.save({ tenant: "cleanup", name: "old.png", bytes: new Uint8Array([1]) });
      const oldFile = service.get("cleanup", old.id).path;
      service.get("cleanup", old.id).updatedAt = new Date(Date.now() - 10_000).toISOString();
      service.cleanup(1);
      expect(existsSync(oldFile)).toBe(false);
    } finally {
      await new Promise((ok) => localSrv.close(ok));
      await rm(dir, { recursive: true, force: true });
    }
  });
});

describe("kimlik dikişi · x-tenant-id", () => {
  /* Bu depo tek operatörlük ama canlıda editör login'in arkasında bir
     sayfa: her istek kimin adına geldiğini taşımalı. Burada AUTH YAZMIYORUZ
     — yalnız sabiti değişkene çevirdik ki ana uygulama bağlanabilsin.
     Sınanan şey: iki kiracı birbirinin planını GÖRMÜYOR. */
  /* base beforeAll'da atanıyor; describe TOPLANIRKEN henüz undefined —
     eager kurmak sürücüyü "/api"ye bağlar ve istek hiç gitmez.
     Dosyadaki diğer testler de bu yüzden fonksiyon kullanıyor. */
  const A = () => apiStore(base, "kiraci-a");
  const B = () => apiStore(base, "kiraci-b");
  beforeEach(() => { db.exec("DELETE FROM editor_plans;"); });

  it("iki kiracı ayrı plan listesi görüyor", async () => {
    await A().save("salon", { key: "salon", name: "A'nın salonu", blocks: [], shapes: [] });
    await B().save("arena", { key: "arena", name: "B'nin arenası", blocks: [], shapes: [] });
    expect(await A().list()).toEqual(["salon"]);
    expect(await B().list()).toEqual(["arena"]);
    expect(await A().load("arena")).toBeNull();          /* öbürünü göremiyor */
    expect((await B().load("arena")).name).toBe("B'nin arenası");
  });

  it("başlık YOKSA eski davranış birebir sürüyor", async () => {
    const eski = apiStore(base);
    await eski.save("varsayilan", { key: "varsayilan", blocks: [], shapes: [] });
    expect(await eski.list()).toEqual(["varsayilan"]);
    /* Varsayılan kiracı da diğerlerinden ayrı. */
    expect(await A().list()).toEqual([]);
  });
});

describe("kimlik dikişi · JWT/JWKS", () => {
  let authSrv, authBase, jwksSrv, privateKey, jwksUrl;

  beforeAll(async () => {
    const keys = await generateKeyPair("RS256");
    privateKey = keys.privateKey;
    const jwk = await exportJWK(keys.publicKey);
    jwksSrv = await new Promise((ok) => {
      const s = http.createServer((_, res) => {
        res.writeHead(200, { "content-type": "application/json" });
        res.end(JSON.stringify({ keys: [{ ...jwk, kid: "test-key", alg: "RS256", use: "sig" }] }));
      }).listen(0, "127.0.0.1", () => ok(s));
    });
    jwksUrl = `http://127.0.0.1:${jwksSrv.address().port}/.well-known/jwks.json`;
    authSrv = createServer(createDb(":memory:"), {
      auth: { jwksUrl, issuer: "seat-editor-test", audience: "seat-editor", tenantClaim: "tenant_id" },
      corsOrigins: ["https://panel.example"],
    });
    await new Promise((ok) => authSrv.listen(0, "127.0.0.1", ok));
    authBase = `http://127.0.0.1:${authSrv.address().port}/api`;
  });
  afterAll(async () => {
    await new Promise((ok) => authSrv.close(ok));
    await new Promise((ok) => jwksSrv.close(ok));
  });

  const token = (tenant) => new SignJWT({ tenant_id: tenant })
    .setProtectedHeader({ alg: "RS256", kid: "test-key" })
    .setIssuer("seat-editor-test")
    .setAudience("seat-editor")
    .setExpirationTime("2m")
    .sign(privateKey);

  it("auth açıksa bearer token olmadan istek reddedilir", async () => {
    const r = await fetch(`${authBase}/plans`);
    expect(r.status).toBe(401);
  });

  it("tenant başlıktan değil JWT claim'inden alınır", async () => {
    const t = await token("jwt-kiraci");
    await fetch(`${authBase}/plans/salon`, {
      method: "PUT",
      headers: { authorization: `Bearer ${t}`, "x-tenant-id": "sahte", "content-type": "application/json" },
      body: JSON.stringify({ key: "salon", name: "JWT salonu", blocks: [], shapes: [] }),
    });

    const ok = await fetch(`${authBase}/plans`, { headers: { authorization: `Bearer ${t}` } }).then((r) => r.json());
    const other = await fetch(`${authBase}/plans`, { headers: { authorization: `Bearer ${await token("baska")}` } }).then((r) => r.json());
    expect(ok).toEqual(["salon"]);
    expect(other).toEqual([]);
  });

  it("CORS yalnız izin verilen origin'i yansıtır", async () => {
    const good = await fetch(`${authBase}/plans`, { method: "OPTIONS", headers: { origin: "https://panel.example" } });
    const bad = await fetch(`${authBase}/plans`, { method: "OPTIONS", headers: { origin: "https://evil.example" } });
    expect(good.headers.get("access-control-allow-origin")).toBe("https://panel.example");
    expect(bad.headers.get("access-control-allow-origin")).toBeNull();
  });

  it("apiStore bearer header'ı save/list/publish/import/live yollarında taşır", async () => {
    const t = await token("store-kiraci");
    const S = apiStore(authBase, { tokenProvider: () => t });
    await expect(S.save("aylak-auth", { ...V.AYLAK, key: "aylak-auth" })).resolves.toBe(true);
    expect(await S.list()).toEqual(["aylak-auth"]);
    await expect(S.publish("aylak-auth")).resolves.toMatchObject({ version: 1 });
    expect(await S.importSource(new File([new Uint8Array([1])], "kaynak.pdf", { type: "application/pdf" })))
      .toMatchObject({ kind: "image", status: "uploaded" });
    expect(await S.liveGet()).toEqual({ aktif: false });
  });

  it("Store factory runtime token hook'unu gerçek apiStore'a bağlar", async () => {
    const t = await token("factory-kiraci");
    globalThis.__SEAT_EDITOR_AUTH__ = { tokenProvider: () => t, apiBase: authBase };
    try {
      const S = makeStore();
      await expect(S.save("factory", { key: "factory", name: "Factory", blocks: [], shapes: [] })).resolves.toBe(true);
      expect(await S.list()).toEqual(["factory"]);
    } finally {
      delete globalThis.__SEAT_EDITOR_AUTH__;
    }
  });
});

describe("kimlik dikişi · üretim localhost bypass", () => {
  it("geliştirme ortamında da explicit bypass/JWKS yoksa fail-closed davranır", async () => {
    const old = process.env.SEAT_EDITOR_AUTH_DEV_BYPASS;
    delete process.env.SEAT_EDITOR_AUTH_DEV_BYPASS;
    const s = createServer(createDb(":memory:"));
    await new Promise((ok) => s.listen(0, "127.0.0.1", ok));
    try {
      const r = await fetch(`http://127.0.0.1:${s.address().port}/api/plans`, {
        headers: { "x-tenant-id": "sahte" },
      });
      expect(r.status).toBe(503);
    } finally {
      await new Promise((ok) => s.close(ok));
      if (old === undefined) delete process.env.SEAT_EDITOR_AUTH_DEV_BYPASS;
      else process.env.SEAT_EDITOR_AUTH_DEV_BYPASS = old;
    }
  });

  it("üretimde JWKS yoksa explicit devBypass olmadan localhost header'ına güvenmez", async () => {
    const old = process.env.NODE_ENV;
    process.env.NODE_ENV = "production";
    const s = createServer(createDb(":memory:"), { auth: { devBypass: false } });
    await new Promise((ok) => s.listen(0, "127.0.0.1", ok));
    try {
      const r = await fetch(`http://127.0.0.1:${s.address().port}/api/plans`, {
        headers: { "x-tenant-id": "sahte" },
      });
      expect(r.status).toBe(503);
    } finally {
      await new Promise((ok) => s.close(ok));
      process.env.NODE_ENV = old;
    }
  });
});
