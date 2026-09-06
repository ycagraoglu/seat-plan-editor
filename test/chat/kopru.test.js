import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { baglan, araclariCevir, icerigiCevir, aracCagir, INSTRUCTIONS } from "../../chat/kopru.mjs";

/* ══════════════════════════════════════════════════════════════════════════
   KÖPRÜ — çeviri doğru mu

   Buradaki iddia: 27 aracın tanımı TEK YERDE (mcp/tools/**) kalıyor ve
   sohbet katmanı onu okuyor. Testin işi o çevirinin sessizce bozulmadığını
   göstermek — özellikle görsel bloğu, çünkü iki biçim benziyor ama alan
   adları farklı ve karıştırınca istek 400 alır, kod patlamaz.
   ══════════════════════════════════════════════════════════════════════════ */

let k;
beforeAll(async () => { k = await baglan(); });
afterAll(async () => { await k?.kapat(); });

describe("araç şeması", () => {
  it("27 aracın hepsi geçerli Anthropic tanımına dönüşüyor", async () => {
    const { tools } = await k.client.listTools();
    expect(tools.length).toBeGreaterThanOrEqual(27);
    const cevrilmis = araclariCevir(tools);
    expect(cevrilmis).toHaveLength(tools.length);
    for (const t of cevrilmis) {
      expect(t.name).toMatch(/^[a-z_]+$/);
      expect(t.description.length).toBeGreaterThan(10);   /* boş açıklama = kör model */
      expect(t.input_schema.type).toBe("object");
    }
  });

  it("açıklama BAŞLIĞI da taşıyor — ikisi de modelin bilgi kaynağı", async () => {
    const { tools } = await k.client.listTools();
    const a = araclariCevir(tools).find((t) => t.name === "create_bowl");
    expect(a.description).toMatch(/Kâse kur/);          /* title */
    expect(a.description).toMatch(/köşelerde yelpaze/);  /* description */
  });

  it("sistem talimatı MCP'den geliyor — ikinci bir metin yok", () => {
    expect(INSTRUCTIONS).toMatch(/SANTİMETREDİR/);
    expect(INSTRUCTIONS).toMatch(/TASLAKTIR/);
  });
});

describe("içerik çevirisi", () => {
  it("metin bloğu olduğu gibi geçiyor", () => {
    expect(icerigiCevir([{ type: "text", text: "merhaba" }]))
      .toEqual([{ type: "text", text: "merhaba" }]);
  });

  it("GÖRSEL bloğu Anthropic'in source şekline dönüşüyor", () => {
    /* MCP {data, mimeType} · Anthropic {source:{type,media_type,data}}.
       Karıştırmak sessiz bir 400 üretir — kod patlamaz, model körleşir. */
    const [c] = icerigiCevir([{ type: "image", data: "QUJD", mimeType: "image/png" }]);
    expect(c).toEqual({ type: "image",
      source: { type: "base64", media_type: "image/png", data: "QUJD" } });
  });

  it("bilinmeyen tür SESSİZCE DÜŞMÜYOR", () => {
    const [c] = icerigiCevir([{ type: "audio" }]);
    expect(c.text).toMatch(/desteklenmeyen/);
  });

  it("boş sonuç yerine açıklama koyuyor — Anthropic boş kabul etmiyor", () => {
    expect(icerigiCevir([])).toHaveLength(1);
  });
});

describe("araç çağrısı", () => {
  it("gerçek araç çalışıyor ve tool_result üretiyor", async () => {
    await k.client.callTool({ name: "create_plan", arguments: { name: "K", key: "k1" } });
    const r = await aracCagir(k.client, "tu_1", "add_block",
      { kind: "grid", label: "A", level: "L", x: 0, y: 0, rows: 5, cols: 10 });
    expect(r.tool_use_id).toBe("tu_1");
    expect(r.is_error).toBeUndefined();
    expect(r.content[0].text).toMatch(/50 koltuk/);
  });

  it("render'ın GÖRSELİ modele ulaşıyor", async () => {
    const r = await aracCagir(k.client, "tu_2", "render", { scope: "all", width: 500 });
    const g = r.content.find((c) => c.type === "image");
    expect(g.source.type).toBe("base64");
    expect(g.source.media_type).toBe("image/png");
    expect(g.source.data.length).toBeGreaterThan(1000);
  }, 20_000);

  it("araç hatası YUTULMUYOR — is_error ile modele gidiyor", async () => {
    /* Kural motorunun hedef değerli mesajları da bu yoldan geçiyor;
       yutulursa model kendini düzeltemez. */
    const r = await aracCagir(k.client, "tu_3", "add_block",
      { kind: "fan", label: "X", level: "L", x: 0, y: 0, rows: 5 });
    expect(r.is_error).toBe(true);
    expect(r.content[0].text).toMatch(/r0/);
  });
});
