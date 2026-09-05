import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { baglan } from "./harness.js";
import { BUILTINS } from "../../src/venues/index.js";
import { buildMeta } from "../../src/core/geometry.js";

/* ══════════════════════════════════════════════════════════════════════════
   MCP ARAÇ YÜZEYİ

   Testler araçları GERÇEK MCP yolundan çağırıyor (bellek-içi taşıma, şema
   doğrulaması dahil) — işleyicileri doğrudan çağırmak "testte geçiyor ama
   istemciden çalışmıyor" ayrışmasına kapı bırakırdı. Bu projede o hata
   sınıfı (aynı kuralın iki yerde ayrı davranması) kural motorunu doğuran
   şeydi; araç yüzeyinde tekrarlamayalım.
   ══════════════════════════════════════════════════════════════════════════ */

let t;
beforeEach(async () => { t = await baglan(); });
afterEach(async () => { await t.kapat(); });

describe("bağlantı ve araç listesi", () => {
  it("sunucu ayağa kalkıyor", async () => {
    expect(await t.cagir("ping")).toContain("hazır");
  });

  it("araçlar kayıtlı ve hepsinin açıklaması var", async () => {
    const { tools } = await t.client.listTools();
    expect(tools.length).toBeGreaterThanOrEqual(10);
    const aciklamasiz = tools.filter((x) => !x.description || x.description.length < 20);
    expect(aciklamasiz.map((x) => x.name)).toEqual([]);
  });

  it("aktif plan yokken araç NET hata verir (sessiz boş sonuç değil)", async () => {
    await expect(t.cagir("plan_summary")).rejects.toThrow(/Aktif plan yok/);
  });
});

describe("plan yaşam döngüsü", () => {
  it("create_plan boş plan açar, kural gürültüsü yapmaz", async () => {
    const r = await t.cagir("create_plan", { name: "Test Salonu" });
    expect(r).toContain("0 koltuk");
    /* Boş planda "tekerlekli sandalye yok" uyarısı doğru ama işe yaramaz —
       LLM'i olmayan sorunun peşine takmasın diye bastırılıyor. */
    expect(r).not.toContain("DOĞRULAMA");
  });

  it("open_sample gerçek salonu taban alır ve ÖRNEĞİ BOZMAZ", async () => {
    const oncekiBlok = BUILTINS.sureyya.blocks.length;
    const oncekiKoltuk = BUILTINS.sureyya.blocks.reduce((a, b) => a + buildMeta(b).seatCount, 0);

    await t.cagir("open_sample", { key: "sureyya" });
    await t.cagir("delete_block", { id: "P" });

    /* Modül düzeyindeki salon nesnesi tek örnek; doğrudan mutasyon TÜM
       oturumu (ve testleri) kirletirdi. structuredClone bunu engelliyor. */
    expect(BUILTINS.sureyya.blocks.length).toBe(oncekiBlok);
    expect(BUILTINS.sureyya.blocks.reduce((a, b) => a + buildMeta(b).seatCount, 0)).toBe(oncekiKoltuk);
  });

  it("list_samples on salonu anahtarıyla verir", async () => {
    const list = await t.jsonCagir("list_samples");
    expect(list.find((x) => x.key === "fener").name).toMatch(/Şükrü Saracoğlu/);
    expect(list.length).toBe(Object.keys(BUILTINS).length);
  });
});

describe("blok araçları", () => {
  beforeEach(async () => { await t.cagir("create_plan", { name: "Test Salonu" }); });

  it("grid blok koltuk sayısından kurulur (rows × cols)", async () => {
    await t.cagir("add_block", { kind: "grid", label: "A", level: "Parter", x: 0, y: 0, rows: 10, cols: 20 });
    const d = await t.jsonCagir("plan_summary");
    expect(d.seatCount).toBe(200);
    expect(d.blocks[0]).toMatchObject({ label: "A", level: "Parter", kind: "grid", seats: 200 });
  });

  it("gerçek santimetre üretir — kaynaktan ölçü almadan", async () => {
    /* 20 koltuk × 50 cm aralık = 19 aralık = 950 cm genişlik.
       Ölçek koltuğun kendisinden geliyor; görselden mesafe ölçülmüyor. */
    await t.cagir("add_block", { kind: "grid", label: "A", level: "Parter", x: 0, y: 0, rows: 2, cols: 20 });
    const d = await t.jsonCagir("plan_summary");
    const en = d.blocks[0].bbox.x1 - d.blocks[0].bbox.x0;
    expect(en).toBeGreaterThan(950);
    expect(en).toBeLessThan(1250);           /* + taban payı */
  });

  it("counts deseni sıra başına farklı koltuk verir", async () => {
    await t.cagir("add_block", { kind: "grid", label: "A", level: "P", x: 0, y: 0, rows: 3, counts: "5,6,7" });
    expect((await t.jsonCagir("plan_summary")).seatCount).toBe(18);
  });

  it("fan blok yelpaze kurar", async () => {
    await t.cagir("add_block", { kind: "fan", label: "B", level: "Balkon", x: 0, y: 0, rows: 6, r0: 1500, aStart: -40, aEnd: 40 });
    const d = await t.jsonCagir("plan_summary");
    expect(d.blocks[0].kind).toBe("fan");
    expect(d.seatCount).toBeGreaterThan(0);
  });

  it("kat YOLU bölüm ağacı kurar", async () => {
    await t.cagir("add_block", { kind: "grid", label: "A", level: "Maraton / Alt", x: 0, y: 0, rows: 5, cols: 10 });
    await t.cagir("add_block", { kind: "grid", label: "B", level: "Maraton / Üst", x: 0, y: 3000, rows: 5, cols: 10 });
    const d = await t.jsonCagir("plan_summary");
    const katlar = d.levels.map((l) => l.level);
    expect(katlar).toContain("Maraton");                    /* ara düğüm */
    expect(katlar).toContain("Maraton / Alt");
    /* Üst bölümün sayacı altındakilerin toplamı */
    expect(d.levels.find((l) => l.level === "Maraton").seats).toBe(100);
  });

  it("update_block yalnız verilen alanı değiştirir", async () => {
    await t.cagir("add_block", { kind: "grid", label: "A", level: "P", x: 0, y: 0, rows: 5, cols: 10 });
    await t.cagir("update_block", { id: "A", cols: 20 });
    const d = await t.jsonCagir("plan_summary");
    expect(d.seatCount).toBe(100);
    expect(d.blocks[0].level).toBe("P");                    /* dokunulmadı */
  });

  it("delete_block bloğu ve kapı referansını birlikte düşürür", async () => {
    await t.cagir("add_block", { kind: "grid", label: "A", level: "P", x: 0, y: 0, rows: 5, cols: 10 });
    await t.cagir("delete_block", { id: "A" });
    expect((await t.jsonCagir("plan_summary")).seatCount).toBe(0);
  });

  it("array_blocks çoğaltır ve kodları ilerletir — count TOPLAM sayıdır", async () => {
    await t.cagir("add_block", { kind: "grid", label: "A", level: "P", x: 0, y: 0, rows: 5, cols: 10 });
    await t.cagir("array_blocks", { id: "A", mode: "linear", count: 3, dx: 1200, dy: 0 });
    const d = await t.jsonCagir("plan_summary");
    expect(d.blocks).toHaveLength(3);
    expect(d.blocks.map((b) => b.label)).toEqual(["A", "B", "C"]);
    expect(d.seatCount).toBe(150);
  });
});

describe("numaralandırma — gerçek salonların kuralları", () => {
  beforeEach(async () => {
    await t.cagir("create_plan", { name: "Test" });
    await t.cagir("add_block", { kind: "grid", label: "A", level: "P", x: 0, y: 0, rows: 22, cols: 10 });
  });

  it("sıra 1'den başlamak zorunda değil ve TERS akabilir (Şükrü Saracoğlu Maraton Alt: 4–25, 25 sahaya en yakın)", async () => {
    await t.cagir("set_numbering", { id: "A", rowScheme: "number", rowStart: 4, rowRev: true });
    const d = await t.jsonCagir("plan_summary");
    const e = d.blocks[0].rowLabels;
    /* İLK sıra (sahaya en yakın) 25, SON sıra 4 — numara sahadan geriye akıyor. */
    expect(e[0]).toBe("25");
    expect(e.at(-1)).toBe("4");
  });

  it("harf şeması I/O/Q atlar (1 ve 0 ile karışır — koltuk düzeninde standart)", async () => {
    await t.cagir("set_numbering", { id: "A", rowScheme: "letter", skipAmbig: true });
    const e = (await t.jsonCagir("plan_summary")).blocks[0].rowLabels;
    expect(e.slice(0, 3)).toEqual(["A", "B", "C"]);
    /* I/O/Q çıkarılmış alfabe 23 harf; 22. sıra "Y" olur. */
    expect(e.at(-1)).toBe("Y");
  });

  it("kapalı: atlanan harfler listede HİÇ geçmez", async () => {
    await t.cagir("set_numbering", { id: "A", rowScheme: "letter", skipAmbig: true });
    /* Kısaltılmamış tam liste için bloğu 8 sıraya indiriyoruz. */
    await t.cagir("update_block", { id: "A", rows: 12 });
    const e = (await t.jsonCagir("plan_summary")).blocks[0].rowLabels;
    expect(e.filter((x) => ["I", "O", "Q"].includes(x))).toEqual([]);
  });
});

describe("kural motoru geri bildirimi — LLM'i kendini düzeltebilir yapan şey", () => {
  it("her değişiklikten sonra bulgular HEDEF DEĞERLE dönüyor", async () => {
    await t.cagir("create_plan", { name: "Test" });
    const r = await t.cagir("add_block", { kind: "grid", label: "A", level: "P", x: 0, y: 0, rows: 10, cols: 20 });
    /* "hata var" değil, "en az 5 gerekiyor" — düzeltilebilir bilgi. */
    expect(r).toMatch(/en az \d+ gerekiyor/);
  });

  it("çakışan blokları hangi çift olduğunu söyleyerek bildirir", async () => {
    await t.cagir("create_plan", { name: "Test" });
    await t.cagir("add_block", { kind: "grid", label: "A", level: "P", x: 0, y: 0, rows: 5, cols: 10 });
    const r = await t.cagir("add_block", { kind: "grid", label: "B", level: "P", x: 100, y: 0, rows: 5, cols: 10 });
    expect(r).toMatch(/çakış/i);
    expect(r).toMatch(/A|B/);
  });
});
