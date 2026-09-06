import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { baglan } from "./harness.js";
import { SUREYYA } from "../../src/venues/index.js";
import { buildMeta } from "../../src/core/geometry.js";

/* ══════════════════════════════════════════════════════════════════════════
   KABUL TESTİ — bilinen bir salonu ARAÇLARLA yeniden kur

   Bu dosya bütün işin sınavı. Soru şu: MCP araç yüzeyi gerçek bir salonu
   İFADE EDEBİLİYOR MU? Süreyya sıfırdan, yalnız araç çağrılarıyla
   kuruluyor ve sonuç src/venues/sureyya.venue.js ile karşılaştırılıyor.

   Süreyya seçildi çünkü küçük (386 koltuk) ama zengin: yelpaze parter,
   üç ayrı loca kanadı, beş kat, harf numaralandırması, erişilebilir
   konumlar, iki kapı.

   ÖLÇÜT koordinat değil SAYIM: blok sayısı, koltuk sayısı, kat listesi ve
   BLOK BAŞINA dağılım birebir. Koordinatları birebir tutturmak araç
   yüzeyinin işi değil; "aynı planı ifade edebiliyor mu" sorusunun cevabı
   bu sayılar.
   ══════════════════════════════════════════════════════════════════════════ */

let t;
beforeAll(async () => {
  t = await baglan();
  await kur(t);
});
afterAll(async () => { await t.kapat(); });

/** sureyya.venue.js'in tarifini araç çağrılarına çevirir. */
async function kur(t) {
  await t.cagir("create_plan", { name: "Süreyya Operası · Kadıköy" });

  /* Sahne ve orkestra çukuru */
  await t.cagir("add_shape", { type: "stage", x: 0, y: 620, w: 1500, h: 750, label: "SAHNE", fs: 90 });
  await t.cagir("add_shape", { type: "screen", x: 0, y: 140, w: 950, h: 220, label: "ORKESTRA ÇUKURU", fs: 46 });
  for (const [n, x] of [[1, -700], [2, 700]]) {
    await t.cagir("add_shape", { type: "door", x, y: 940, w: 90, h: 90, label: `KAPI ${n}`, fs: 34 });
  }

  /* Parter — sahne önü yelpaze */
  await t.cagir("add_block", {
    kind: "fan", label: "P", level: "Parter", x: 0, y: 0, rot: 0,
    r0: 320, rows: 7, rowGap: 82, seatGap: 47, aStart: -54, aEnd: 54, aCenter: 0,
    mode: "span", pad: 45, align: "center", color: "#3E7FBF",
  });

  /* Zemin kat locaları — parterin iki yanında kutular */
  await t.cagir("add_box_wing", {
    r0: 460, rows: 2, rowGap: 78, seatGap: 46, perRow: 3, gap: 14,
    countPerSide: 8, first: "ZL1", level: "Zemin Loca", color: "#C2415A", pad: 26,
    fromDeg: 70, toDeg: 104,
  });

  /* 1. kat — orta açık balkon (harf sıralı) + yanlarda loca */
  await t.cagir("add_block", {
    kind: "fan", label: "A", level: "1. Kat", x: 0, y: 0, rot: 0,
    r0: 930, rows: 5, rowGap: 62, seatGap: 48, aStart: -34, aEnd: 34, aCenter: 0,
    mode: "span", pad: 45, align: "center", color: "#5F9142",
  });
  await t.cagir("set_numbering", { id: "A", rowScheme: "letter" });
  await t.cagir("add_box_wing", {
    r0: 930, rows: 2, rowGap: 78, seatGap: 46, perRow: 3, gap: 18,
    countPerSide: 5, first: "1L1", level: "1. Kat Loca", color: "#B79A32", pad: 26,
    fromDeg: 60, toDeg: 92,
  });

  /* 2. kat — sadece loca */
  await t.cagir("add_box_wing", {
    r0: 1280, rows: 2, rowGap: 70, seatGap: 46, perRow: 3, gap: 14,
    countPerSide: 9, first: "2L1", level: "2. Kat Loca", color: "#7C5BA8", pad: 26,
    fromDeg: 40, toDeg: 100,
  });

  /* Bölüm türleri ve erişilebilir konumlar */
  for (const [lv, kind] of [["1. Kat", "balcony"], ["Zemin Loca", "section"],
    ["1. Kat Loca", "section"], ["2. Kat Loca", "section"]]) {
    await t.cagir("define_section", { level: lv, kind });
  }
  await t.cagir("add_accessible", { level: "Zemin Loca", pairs: 2 });
  await t.cagir("add_accessible", { labels: ["P"], pairs: 2 });
  await t.cagir("auto_gates");
}

/* Karşılaştırma tarafı — salon dosyasından ölçülen gerçek */
const gercekMetas = SUREYYA.blocks.map((b) => ({ b, m: buildMeta(b) }));
const gercekKoltuk = gercekMetas.reduce((a, x) => a + x.m.seatCount, 0);
const gercekKatlar = {};
gercekMetas.forEach(({ b, m }) => { gercekKatlar[b.level] = (gercekKatlar[b.level] || 0) + m.seatCount; });
const gercekBloklar = {};
gercekMetas.forEach(({ b, m }) => { gercekBloklar[b.label] = m.seatCount; });
/* Salon dosyasındaki gerçek tekerlekli sandalye sayısı — 6. */
const gercekTekerlekli = gercekMetas.reduce((a, { m }) => a + (m.kinds.wheelchair_space || 0), 0);

describe("KABUL: Süreyya araçlarla yeniden kuruluyor", () => {
  it("blok sayısı birebir", async () => {
    const d = await t.jsonCagir("plan_summary");
    expect(d.blocks).toHaveLength(SUREYYA.blocks.length);        /* 18 */
  });

  it("koltuk sayısı birebir", async () => {
    const d = await t.jsonCagir("plan_summary");
    expect(d.seatCount).toBe(gercekKoltuk);                       /* 386 */
  });

  it("kat listesi ve kat başına koltuk birebir", async () => {
    const d = await t.jsonCagir("plan_summary");
    const kurulan = Object.fromEntries(d.levels.map((l) => [l.level, l.seats]));
    Object.entries(gercekKatlar).forEach(([lv, n]) => {
      expect(kurulan[lv], `kat "${lv}"`).toBe(n);
    });
  });

  it("BLOK BAŞINA koltuk dağılımı birebir", async () => {
    const d = await t.jsonCagir("plan_summary");
    const kurulan = {};
    d.blocks.forEach((b) => { kurulan[b.label] = b.seats; });
    expect(kurulan).toEqual(gercekBloklar);
  });

  it("harf numaralandırması taşındı (1. Kat balkonu A, B, C...)", async () => {
    const d = await t.jsonCagir("plan_summary");
    expect(d.blocks.find((b) => b.label === "A").rowLabels.slice(0, 3)).toEqual(["A", "B", "C"]);
  });

  it("doğrulama hatasız", async () => {
    const v = await t.jsonCagir("validate");
    expect(v.ok, `kalan hatalar: ${v.findings.filter((f) => f.severity === "err")
      .map((f) => f.rule).join(", ")}`).toBe(true);
  });

  it("erişilebilir konumlar GEREKSİNİMİ KARŞILIYOR (salon dosyasıyla aynı sayıda)", async () => {
    /* v.ok'e bakmak YETMEZ: kural "hiç yoksa hata, AZ VARSA UYARI" diyor,
       yani eksik erişilebilir yer v.ok'i true bırakır. İlk yazışımda bu
       testi v.ok üstüne kurmuştum ve add_accessible çağrısını silmek testi
       kırmıyordu — sabotaj yakaladı. Şimdi gereksinimin karşılandığı
       doğrudan sınanıyor. */
    const v = await t.jsonCagir("validate");
    const w = v.findings.find((f) => f.rule === "wheelchair-adequacy");
    expect(w.severity).toBe("ok");
    expect(w.message).toContain(String(gercekTekerlekli));
  });

  it("kapılar bloklara atandı ve çok kapılı bloklar korunuyor", async () => {
    const d = await t.jsonCagir("plan_summary");
    const kapiliBlok = d.blocks.filter((b) => b.gates.length).length;
    expect(kapiliBlok).toBe(SUREYYA.blocks.length);
    expect(d.blocks.some((b) => b.gates.length > 1)).toBe(true);
  });

  it("dışa aktarılan koltuk sayısı da tutuyor (uçtan uca)", async () => {
    const { writeFileSync, readFileSync, mkdtempSync } = await import("node:fs");
    const os = await import("node:os"); const path = await import("node:path");
    const dizin = mkdtempSync(path.join(os.tmpdir(), "kabul-"));
    const p = path.join(dizin, "db.json");
    await t.cagir("export_plan", { format: "db", path: p });
    const yuk = JSON.parse(readFileSync(p, "utf8"));
    expect(yuk.seats).toHaveLength(gercekKoltuk);
  });
});
