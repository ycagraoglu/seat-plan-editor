import { describe, it, expect, beforeAll, afterAll, beforeEach } from "vitest";
import { createDb, createServer } from "../../server/index.mjs";
import { apiStore } from "../../src/store/api.js";
import { hepsiniKapat } from "../../chat/oturumlar.mjs";

/* ══════════════════════════════════════════════════════════════════════════
   SOHBET ROTALARI

   Gerçek model çağrılmıyor (para ve ağ) — sınanan şey rotaların sözleşmesi:
   anahtar yokken kapalı olduğunu SÖYLÜYOR mu, tur arka planda mı koşuyor,
   hata akışa düşüyor mu.

   Anahtarın tarayıcıya sızmaması ayrıca sınanıyor: sohbet panelinin
   göreceği tek şey "açık mı" olmalı.
   ══════════════════════════════════════════════════════════════════════════ */

let srv, base, db;
const ANAHTARLAR = ["ANTHROPIC_API_KEY", "OPENAI_API_KEY", "GEMINI_API_KEY", "GOOGLE_API_KEY", "SOHBET_SAGLAYICI"];
const yedek = {};

beforeAll(async () => {
  db = createDb(":memory:");
  srv = createServer(db);
  await new Promise((ok) => srv.listen(0, "127.0.0.1", ok));
  base = `http://127.0.0.1:${srv.address().port}/api`;
  ANAHTARLAR.forEach((a) => { yedek[a] = process.env[a]; });
});
afterAll(async () => {
  await hepsiniKapat();
  ANAHTARLAR.forEach((a) => {
    if (yedek[a] === undefined) delete process.env[a]; else process.env[a] = yedek[a];
  });
  await new Promise((ok) => srv.close(ok));
});

const S = () => apiStore(base);

describe("anahtar YOKKEN", () => {
  beforeEach(() => { ANAHTARLAR.forEach((a) => delete process.env[a]); });

  it("durum 'kapalı' diyor — panel kendini hiç göstermeyecek", async () => {
    expect(await S().sohbetDurum()).toEqual({ acik: false });
  });

  it("mesaj göndermek 503 ve SEBEP döndürüyor", async () => {
    const r = await fetch(`${base}/chat`, {
      method: "POST", headers: { "content-type": "application/json" },
      body: JSON.stringify({ id: "k1", mesaj: "selam" }),
    });
    expect(r.status).toBe(503);
    expect((await r.json()).hata).toMatch(/ANTHROPIC_API_KEY|GEMINI_API_KEY/);
  });
});

describe("anahtar VARKEN", () => {
  beforeEach(() => {
    ANAHTARLAR.forEach((a) => delete process.env[a]);
    process.env.ANTHROPIC_API_KEY = "sk-test-sahte";
  });

  it("durum 'açık' diyor ama ANAHTARI SIZDIRMIYOR", async () => {
    const d = await (await fetch(`${base}/chat/durum`)).json();
    expect(d).toEqual({ acik: true });
    /* Yanıtın tamamında anahtar geçmemeli. */
    expect(JSON.stringify(d)).not.toMatch(/sk-test/);
  });

  it("POST hemen dönüyor — tur arka planda", async () => {
    const t0 = Date.now();
    const r = await fetch(`${base}/chat`, {
      method: "POST", headers: { "content-type": "application/json" },
      body: JSON.stringify({ id: "k2", mesaj: "bir salon çiz" }),
    });
    expect(r.status).toBe(202);
    expect((await r.json()).kabul).toBe(true);
    expect(Date.now() - t0).toBeLessThan(3000);      /* beklemiyor */
  });

  it("HATA yutulmuyor — akışa düşüyor ve çalışıyor bayrağı kalkıyor", async () => {
    /* Sahte anahtarla gerçek API çağrısı başarısız olacak; asıl sınanan
       şey turun sessizce ölmemesi. Operatör sonsuza dek "çalışıyor"
       görmemeli, neden durduğunu okumalı. */
    await fetch(`${base}/chat`, {
      method: "POST", headers: { "content-type": "application/json" },
      body: JSON.stringify({ id: "k3", mesaj: "çiz" }),
    });
    let d = null;
    for (let i = 0; i < 100; i++) {
      d = await S().sohbetOku("k3");
      if (d && !d.calisiyor && d.akis.some((x) => x.rol === "hata" || x.rol === "asistan")) break;
      await new Promise((ok) => setTimeout(ok, 100));
    }
    expect(d.calisiyor).toBe(false);
    expect(d.akis[0]).toMatchObject({ rol: "kullanici", metin: "çiz" });
    const hata = d.akis.find((x) => x.rol === "hata");
    expect(hata).toBeTruthy();
    /* Operatör ham SDK çıktısı okumamalı — ne olduğu ve ne yapacağı yazmalı. */
    expect(hata.metin).toMatch(/API anahtarı geçersiz/);
    expect(hata.metin).not.toMatch(/authentication_error|\{"type"/);
  }, 30_000);

  it("bilinmeyen konuşma boş akış veriyor, patlamıyor", async () => {
    expect(await S().sohbetOku("yok-boyle")).toEqual({ calisiyor: false, akis: [] });
  });

  it("eksik alan 400 veriyor", async () => {
    const r = await fetch(`${base}/chat`, {
      method: "POST", headers: { "content-type": "application/json" },
      body: JSON.stringify({ id: "k4" }),
    });
    expect(r.status).toBe(400);
  });
});
