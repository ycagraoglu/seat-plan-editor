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
