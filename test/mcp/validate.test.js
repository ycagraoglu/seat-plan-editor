import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { baglan } from "./harness.js";

/* ══════════════════════════════════════════════════════════════════════════
   DOĞRULAMA DÖNGÜSÜ — bütün fikri ayakta tutan şey

   Blender'da LLM'in tek geri bildirimi ekran görüntüsüdür: "güzel göründü mü".
   Burada kural motoru ÖLÇÜYOR ve hedef değer veriyor, yani LLM kendini
   düzeltebiliyor. Bu dosya o döngünün gerçekten kapandığını sınıyor:
   hatalı plan → bulguyu oku → düzelt → temiz.

   Bulgu "hata var" demekle kalırsa döngü kapanmaz; asıl sınanan şey
   HEDEF DEĞERİN taşınması.
   ══════════════════════════════════════════════════════════════════════════ */

let t;
beforeEach(async () => { t = await baglan(); });
afterEach(async () => { await t.kapat(); });

describe("validate — düzeltilebilir bilgi döndürüyor", () => {
  beforeEach(async () => {
    await t.cagir("create_plan", { name: "T" });
    await t.cagir("add_block", { kind: "grid", label: "A", level: "P", x: 0, y: 0, rows: 5, cols: 10 });
  });

  it("verdict tek bakışta 'bitti mi' sorusunu cevaplıyor", async () => {
    const v = await t.jsonCagir("validate");
    expect(v.verdict).toMatch(/hata|Temiz/);
    expect(typeof v.ok).toBe("boolean");
    expect(v.counts).toHaveProperty("err");
  });

  it("bulgu HEDEF DEĞERİ target alanında taşıyor", async () => {
    /* Kuralların bir kısmı hedefi ayrı bir alanda (rules.js'te `d`) veriyor:
       "geçit için en az 90 cm gerekir", "P · A↔P · B (28.611cm²)".
       target'ı düşürmek döngüyü kırar — bu test onu yakalamalı, mesajın
       içindeki sayıya bakarak DEĞİL. */
    await t.cagir("add_block", { kind: "grid", label: "B", level: "P", x: 600, y: 0, rows: 5, cols: 10 });
    const v = await t.jsonCagir("validate", { severity: "err" });
    const c = v.findings.find((f) => f.rule === "footprint-overlap-same-level");
    expect(c.target).toBeTruthy();
    expect(c.target).toMatch(/A|B/);
  });

  it("hedefi mesajda veren kurallar da sayıyı taşıyor", async () => {
    const w = (await t.jsonCagir("validate")).findings
      .find((f) => f.rule === "wheelchair-adequacy");
    expect(w.message).toMatch(/en az \d+/);
  });

  it("bulgu ilgili BLOK KİMLİKLERİNİ veriyor", async () => {
    await t.cagir("add_block", { kind: "grid", label: "B", level: "P", x: 600, y: 0, rows: 5, cols: 10 });
    const v = await t.jsonCagir("validate", { severity: "err" });
    const c = v.findings.find((f) => f.rule === "footprint-overlap-same-level");
    expect(c.blocks.length).toBeGreaterThanOrEqual(2);
  });

  it("severity süzgeci çalışıyor", async () => {
    const hepsi = await t.jsonCagir("validate");
    const sadeceHata = await t.jsonCagir("validate", { severity: "err" });
    expect(sadeceHata.findings.every((f) => f.severity === "err")).toBe(true);
    expect(sadeceHata.findings.length).toBeLessThanOrEqual(hepsi.findings.length);
  });
});

describe("KABUL: LLM kendini düzeltip temize çıkabiliyor", () => {
  it("çakışma → uzaklaştır → tekerlekli sandalye hedefi → ekle → TEMİZ", async () => {
    await t.cagir("create_plan", { name: "Döngü" });
    await t.cagir("add_block", { kind: "grid", label: "A", level: "P", x: 0, y: 0, rows: 5, cols: 10 });
    await t.cagir("add_block", { kind: "grid", label: "B", level: "P", x: 600, y: 0, rows: 5, cols: 10 });
    await t.cagir("add_shape", { type: "stage", x: 0, y: -1500, w: 1200, h: 400, label: "SAHNE" });
    await t.cagir("add_shape", { type: "door", x: -1500, y: 0, w: 300, h: 300, label: "KAPI 1" });
    await t.cagir("auto_gates");

    /* 1 — başlangıçta hata var */
    let v = await t.jsonCagir("validate");
    expect(v.ok).toBe(false);

    /* 2 — çakışma bulgusunu OKU, işaret ettiği bloğu uzaklaştır */
    const cak = v.findings.find((f) => f.rule === "footprint-overlap-same-level");
    expect(cak).toBeTruthy();
    await t.cagir("update_block", { id: "B", x: 1400 });
    v = await t.jsonCagir("validate");
    expect(v.findings.find((f) => f.rule === "footprint-overlap-same-level")).toBeFalsy();

    /* 3 — kalan hatanın HEDEFİNİ oku ve karşıla */
    const w = v.findings.find((f) => f.rule === "wheelchair-adequacy" && f.severity === "err");
    const gereken = Number(w.message.match(/en az (\d+)/)[1]);
    expect(gereken).toBeGreaterThan(0);
    await t.cagir("add_accessible", { level: "P", pairs: Math.ceil(gereken / 2) });

    /* 4 — temiz */
    v = await t.jsonCagir("validate");
    expect(v.ok).toBe(true);
    expect(v.verdict).toContain("Temiz");
  });
});
