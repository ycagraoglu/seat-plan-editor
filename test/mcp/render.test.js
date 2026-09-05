import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { writeFileSync, mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { baglan } from "./harness.js";
import { renderSvg } from "../../mcp/render.mjs";
import { SUREYYA, FENER } from "../../src/venues/index.js";

/* ══════════════════════════════════════════════════════════════════════════
   GÖRME KATMANI

   Blender'da LLM ekran görüntüsü alır; burada aynısı, artı bizde olan şey:
   ALTLIK BİNDİRMESİ. Organizatörün planı arkada, çizim önde — LLM kendi
   işini kaynakla üst üste görüyor.

   Bu dosyanın sınadığı asıl şey resmin "güzel" olması değil, LLM'in ondan
   BİLGİ ÇIKARABİLMESİ: koltuklar ne zaman çizilir, etiket okunur mu,
   yakınlaşma çalışıyor mu.
   ══════════════════════════════════════════════════════════════════════════ */

let t;
beforeEach(async () => { t = await baglan(); });
afterEach(async () => { await t.kapat(); });

describe("renderSvg — LOD ve kapsam", () => {
  it("küçük salonda koltuklar TEK TEK çizilir", () => {
    const r = renderSvg(SUREYYA, { scope: "all" });
    expect(r.seatsDrawn).toBe(true);
    expect(r.seats).toBe(386);
  });

  it("52.838 koltuklu planda koltuk çizilmez — o ölçekte okunmaz ve dosyayı şişirir", () => {
    const r = renderSvg(FENER, { scope: "all" });
    expect(r.seatsDrawn).toBe(false);
    expect(r.svg.length).toBeLessThan(200_000);
  });

  it("tek bloğa yakınlaşınca koltuklar AÇILIR", () => {
    const r = renderSvg(FENER, { scope: "MARATON ÜST A" });
    expect(r.blocks).toBe(1);
    expect(r.seatsDrawn).toBe(true);
  });

  it("kat yoluyla yakınlaşma tribünün tamamını alır", () => {
    const r = renderSvg(FENER, { scope: "Maraton" });
    expect(r.blocks).toBe(18);                     /* Alt 9 + Üst 9 */
  });

  it("kapsamda blok yoksa sessizce boş resim değil, HATA döner", () => {
    expect(() => renderSvg(FENER, { scope: "Olmayan Tribün" })).toThrow(/Kapsamda blok yok/);
  });

  it("seats:'on' eşiği ezer", () => {
    expect(renderSvg(FENER, { scope: "all", seats: "on" }).seatsDrawn).toBe(true);
  });
});

describe("etiketler kendi bloğuna SIĞAR", () => {
  it("sığmayan etiket yazılmaz, sayısı bildirilir", () => {
    /* Sabit yazı boyu kullanınca 56 bloklu stadyumda etiketler üst üste
       binip "FENERIFENERIFENERI..." oluyordu — okunmaz. */
    const r = renderSvg(FENER, { scope: "all" });
    expect(r.labelsHidden).toBeGreaterThan(0);
  });

  it("yakınlaşınca hepsi sığar", () => {
    expect(renderSvg(FENER, { scope: "Maraton" }).labelsHidden).toBe(0);
  });

  it("hiçbir etiket bloğundan geniş çizilmez", () => {
    const r = renderSvg(SUREYYA, { scope: "all" });
    const boylar = [...r.svg.matchAll(/font-size="([\d.]+)"[^>]*font-weight="700"/g)]
      .map((m) => Number(m[1]));
    expect(boylar.length).toBeGreaterThan(0);
    /* Süreyya'nın en dar bloğu ~200 cm; etiket ondan büyük olamaz. */
    expect(Math.max(...boylar)).toBeLessThan(1000);
  });
});

describe("render aracı — LLM'in gerçekten göreceği şey", () => {
  it("metin özeti + PNG döndürür", async () => {
    await t.cagir("open_sample", { key: "sureyya" });
    const r = await t.client.callTool({ name: "render", arguments: { scope: "all" } });
    const txt = r.content.find((c) => c.type === "text");
    const img = r.content.find((c) => c.type === "image");
    expect(txt.text).toContain("koltuk");
    expect(img.mimeType).toBe("image/png");
    /* Gerçekten PNG mi: sihirli baytlar. */
    expect(Buffer.from(img.data, "base64").subarray(0, 4)).toEqual(Buffer.from([0x89, 0x50, 0x4e, 0x47]));
  });

  it("özet, koltukların çizilip çizilmediğini SÖYLER", async () => {
    await t.cagir("open_sample", { key: "fener" });
    const r = await t.client.callTool({ name: "render", arguments: { scope: "all" } });
    expect(r.content[0].text).toMatch(/çizilmedi/);
    const y = await t.client.callTool({ name: "render", arguments: { scope: "MARATON ÜST A" } });
    expect(y.content[0].text).toMatch(/çizildi/);
  });
});

describe("altlık — organizatörün planı arkada", () => {
  /* 1×1 saydam PNG */
  const PNG = Buffer.from(
    "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==",
    "base64");
  let dosya;
  beforeEach(() => {
    dosya = path.join(mkdtempSync(path.join(tmpdir(), "altlik-")), "plan.png");
    writeFileSync(dosya, PNG);
  });

  it("yüklenir ve render'a bindirilir", async () => {
    await t.cagir("open_sample", { key: "sureyya" });
    expect(await t.cagir("set_underlay", { path: dosya })).toContain("Altlık yüklendi");
    const r = await t.client.callTool({ name: "render", arguments: { scope: "all" } });
    expect(r.content[0].text).toContain("altlık bindirildi");
  });

  it("withUnderlay:false ile kapatılabilir", async () => {
    await t.cagir("open_sample", { key: "sureyya" });
    await t.cagir("set_underlay", { path: dosya });
    const r = await t.client.callTool({
      name: "render", arguments: { scope: "all", withUnderlay: false } });
    expect(r.content[0].text).not.toContain("altlık");
  });

  it("desteklenmeyen dosya türü sessizce geçmez", async () => {
    await t.cagir("open_sample", { key: "sureyya" });
    await expect(t.cagir("set_underlay", { path: "/tmp/olmayan.txt" }))
      .rejects.toThrow(/Desteklenmeyen görsel/);
  });
});

describe("görüntü çerçevesi çizime göre BÜYÜR", () => {
  it("create_plan'ın çerçevesi boş tuvalde kilitli kalmaz", async () => {
    /* EMPTY'nin home'u 40×30 m'lik boş tuval. create_plan onu taşıyordu ve
       render o pencereye kilitleniyordu: LLM stadyum çizse bile çizdiğine
       bakamıyordu. home artık verilmiyor, planHome içerikten türetiyor. */
    await t.cagir("create_plan", { name: "T" });
    await t.cagir("add_block", { kind: "fan", label: "A", level: "S", x: 0, y: 6020,
      r0: 6545, rows: 12, rowGap: 105, aCenter: 0, counts: "39..48", mode: "pitch" });
    const d = await t.jsonCagir("plan_summary");
    const bb = d.blocks[0].bbox;
    const vb = d.home;
    /* Çerçeve bloğu KAPSAMALI */
    expect(vb.x).toBeLessThanOrEqual(bb.x0);
    expect(vb.y).toBeLessThanOrEqual(bb.y0);
    expect(vb.x + vb.w).toBeGreaterThanOrEqual(bb.x1);
    expect(vb.y + vb.h).toBeGreaterThanOrEqual(bb.y1);
  });
});

describe("altlık dünyada konumlanabiliyor", () => {
  const PNG = Buffer.from(
    "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==",
    "base64");
  let dosya;
  beforeEach(() => {
    dosya = path.join(mkdtempSync(path.join(tmpdir(), "altlik2-")), "p.png");
    writeFileSync(dosya, PNG);
    });

  it("x/y/width/height verilince o dikdörtgene oturur", async () => {
    await t.cagir("create_plan", { name: "T" });
    const r = await t.cagir("set_underlay",
      { path: dosya, x: -2900, y: -4600, width: 5800, height: 7700 });
    expect(r).toContain("5800×7700");
    await t.cagir("add_block", { kind: "grid", label: "A", level: "S", x: 0, y: 0, rows: 5, cols: 10 });
    /* Aracın KENDİSİNDEN geç — renderSvg'yi doğrudan çağırmak kabloyu
       sınamaz; ilk yazışımda öyle yapmıştım ve konumu yok saymak testi
       kırmıyordu (sabotaj yakaladı). */
    const c = await t.client.callTool({ name: "render", arguments: { scope: "all" } });
    expect(c.content[0].text).toContain("konumlu");
  });

  it("verilmezse HİZALANMAYACAĞI açıkça söyleniyor", async () => {
    await t.cagir("create_plan", { name: "T" });
    /* Sessizce gerilmiş bir altlık, LLM'i "çizim tutuyor" sanmaya iter. */
    expect(await t.cagir("set_underlay", { path: dosya })).toMatch(/hizalanmaz/);
    await t.cagir("add_block", { kind: "grid", label: "A", level: "S", x: 0, y: 0, rows: 5, cols: 10 });
    const c = await t.client.callTool({ name: "render", arguments: { scope: "all" } });
    expect(c.content[0].text).toContain("GERİLMİŞ");
  });
});
