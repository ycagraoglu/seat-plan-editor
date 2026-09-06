import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { baglan, aracCagir, INSTRUCTIONS } from "../../chat/kopru.mjs";
import { sadelestir, aciklama } from "../../chat/saglayici/sema.mjs";
import { sec, HEPSI } from "../../chat/saglayici/index.mjs";

/* ══════════════════════════════════════════════════════════════════════════
   KÖPRÜ ve SAĞLAYICI SEÇİMİ

   Köprü NÖTR: hiçbir sağlayıcının biçimini bilmiyor, çeviri adaptörlerin
   işi. Buradaki iddia, 29 aracın tanımının TEK YERDE (mcp/tools/**)
   kalması ve sonucun kayıpsız taşınması.
   ══════════════════════════════════════════════════════════════════════════ */

let k;
beforeAll(async () => { k = await baglan(); });
afterAll(async () => { await k?.kapat(); });

describe("köprü · nötr sonuç", () => {
  it("sistem talimatı MCP'den geliyor — ikinci bir metin yok", () => {
    expect(INSTRUCTIONS).toMatch(/SANTİMETREDİR/);
    expect(INSTRUCTIONS).toMatch(/TASLAKTIR/);
  });

  it("gerçek araç çalışıyor, metin nötr biçimde dönüyor", async () => {
    await k.client.callTool({ name: "create_plan", arguments: { name: "K", key: "k1" } });
    const r = await aracCagir(k.client, "t1", "add_block",
      { kind: "grid", label: "A", level: "L", x: 0, y: 0, rows: 5, cols: 10 });
    expect(r).toMatchObject({ id: "t1", ad: "add_block", hata: false });
    expect(r.metin).toMatch(/50 koltuk/);
    expect(r.gorseller).toEqual([]);
  });

  it("GÖRSEL metinden AYRI duruyor — sağlayıcı ona göre karar versin", async () => {
    /* Üç sağlayıcının ikisinde araç yanıtı görsel taşıyamıyor; ayrımı
       burada yapmak her adaptörün aynı kararı yeniden vermesini önlüyor. */
    const r = await aracCagir(k.client, "t2", "render", { scope: "all", width: 400 });
    expect(r.gorseller).toHaveLength(1);
    expect(r.gorseller[0].mimeType).toBe("image/png");
    expect(r.gorseller[0].data.length).toBeGreaterThan(1000);
    expect(r.metin).not.toMatch(/base64/);        /* görsel metne karışmadı */
  }, 20_000);

  it("araç hatası YUTULMUYOR", async () => {
    const r = await aracCagir(k.client, "t3", "add_block",
      { kind: "fan", label: "X", level: "L", x: 0, y: 0, rows: 5 });
    expect(r.hata).toBe(true);
    expect(r.metin).toMatch(/r0/);
  });
});

describe("şema temizleyici", () => {
  it("exclusiveMinimum düşüyor ama BİLGİ açıklamada kalıyor", () => {
    /* Sessizce atmak modelin "rows: 0" göndermesine kapı açardı. */
    const s = sadelestir({ type: "integer", exclusiveMinimum: 0, description: "Sıra sayısı" });
    expect(s.exclusiveMinimum).toBeUndefined();
    expect(s.description).toMatch(/Sıra sayısı/);
    expect(s.description).toMatch(/0'dan büyük/);
  });

  it("tip DİZİSİ tekleşiyor, string tercih ediliyor", () => {
    /* Sayıyı metin olarak göndermek her zaman çalışıyor (first: "101"),
       tersi çalışmıyor. */
    const s = sadelestir({ type: ["number", "string"], description: "İlk kod" });
    expect(s.type).toBe("string");
    expect(s.description).toMatch(/sayı da yazılabilir/);
  });

  it("meta alanlar atılıyor, iç içe şemalar da temizleniyor", () => {
    const s = sadelestir({ $schema: "x", type: "object", additionalProperties: false,
      properties: { a: { type: "integer", exclusiveMinimum: 2 } } });
    expect(s.$schema).toBeUndefined();
    expect(s.additionalProperties).toBeUndefined();
    expect(s.properties.a.exclusiveMinimum).toBeUndefined();
    expect(s.properties.a.description).toMatch(/2'dan büyük/);
  });

  it("GERÇEK araç şemalarında katı sağlayıcıyı bozacak yapı KALMIYOR", async () => {
    const { tools } = await k.client.listTools();
    const g = JSON.stringify(tools.map((t) => sadelestir(t.inputSchema)));
    expect(g).not.toMatch(/exclusiveMinimum|exclusiveMaximum|\$schema|additionalProperties/);
    /* Tip dizisi de kalmamalı. */
    expect(g).not.toMatch(/"type":\s*\[/);
  });

  it("açıklama başlığı da taşıyor — ikisi de modelin bilgisi", async () => {
    const { tools } = await k.client.listTools();
    const t = tools.find((x) => x.name === "create_bowl");
    expect(aciklama(t)).toMatch(/Kâse kur/);
    expect(aciklama(t)).toMatch(/köşelerde yelpaze/);
  });
});

describe("sağlayıcı seçimi", () => {
  const yedek = {};
  const ANAHTARLAR = ["ANTHROPIC_API_KEY", "OPENAI_API_KEY", "GEMINI_API_KEY",
    "GOOGLE_API_KEY", "SOHBET_SAGLAYICI"];
  beforeAll(() => { ANAHTARLAR.forEach((a) => { yedek[a] = process.env[a]; delete process.env[a]; }); });
  afterAll(() => { ANAHTARLAR.forEach((a) => {
    if (yedek[a] === undefined) delete process.env[a]; else process.env[a] = yedek[a];
  }); });

  it("üç sağlayıcı da kayıtlı", () => {
    expect(HEPSI.map((x) => x.ad)).toEqual(["anthropic", "openai", "gemini"]);
  });

  it("hiç anahtar yoksa null — sohbet kapalı", () => {
    expect(sec()).toBeNull();
  });

  it("hangi anahtar varsa o seçiliyor", () => {
    process.env.GEMINI_API_KEY = "x";
    expect(sec().ad).toBe("gemini");
    process.env.OPENAI_API_KEY = "y";
    expect(sec().ad).toBe("openai");           /* sıra deterministik */
    delete process.env.GEMINI_API_KEY; delete process.env.OPENAI_API_KEY;
  });

  it("SOHBET_SAGLAYICI ile açıkça ezilebiliyor", () => {
    process.env.ANTHROPIC_API_KEY = "a"; process.env.GEMINI_API_KEY = "g";
    expect(sec("gemini").ad).toBe("gemini");
    delete process.env.ANTHROPIC_API_KEY; delete process.env.GEMINI_API_KEY;
  });

  it("olmayan sağlayıcı ve anahtarsız seçim NET hata veriyor", () => {
    expect(() => sec("kopilot")).toThrow(/Bilinmeyen sağlayıcı/);
    expect(() => sec("openai")).toThrow(/anahtarı tanımlı değil/);
  });
});
