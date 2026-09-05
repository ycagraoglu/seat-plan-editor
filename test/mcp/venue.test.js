import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { baglan } from "./harness.js";
import { GS } from "../../src/venues/index.js";
import { buildMeta } from "../../src/core/geometry.js";

/* ══════════════════════════════════════════════════════════════════════════
   YÜKSEK SEVİYE KURGULAR

   Bu dosyanın en önemli testi ilki: GS'nin KENDİ parametreleriyle araçlardan
   kurulan kâse, gs.venue.js ile AYNI sayıyı vermeli. Verirse araç yüzeyi
   48.600 koltukluk bir stadyumu ifade edebiliyor demektir — "LLM stadyum
   çizebilir mi" sorusunun ölçülmüş cevabı budur.
   ══════════════════════════════════════════════════════════════════════════ */

let t;
beforeEach(async () => { t = await baglan(); });
afterEach(async () => { await t.kapat(); });

const gsKoltuk = GS.blocks.reduce((a, b) => a + buildMeta(b).seatCount, 0);
const gsKapi = GS.shapes.filter((s) => s.type === "door").length;

/** GS'yi araçlardan kurar — gs.venue.js'teki parametrelerin birebir aynısı. */
async function gsKur(t, { vomitorium = true } = {}) {
  await t.cagir("create_plan", { name: "GS taklidi" });
  const K = JSON.parse(await t.cagir("solve_tiers", {
    mode: "bowl",
    tiers: [
      { id: "alt", rows: 21, rowGap: 85, seatGap: 50, pad: 80, W: 6600, H: 4600 },
      { id: "orta", rows: 13, rowGap: 85, seatGap: 50, pad: 80, gapFromPrev: 649 },
      { id: "ust", rows: 17, rowGap: 85, seatGap: 50, pad: 80, gapFromPrev: 479 },
    ],
  }));
  const Rc = { alt: 2200, orta: 4800, ust: 6550 };
  const first = { alt: 100, orta: 200, ust: 400 };
  const aisle = { alt: 240, orta: 260, ust: 280 };
  const ad = { alt: "Alt Tribün", orta: "Orta Tribün", ust: "Üst Tribün" };
  for (const k of K) {
    await t.cagir("create_bowl", {
      W: k.W, H: k.H, Rc: Rc[k.id], rows: k.rows, rowGap: k.rowGap, seatGap: k.seatGap,
      nLong: 6, nShort: 4, nCorner: 3, first: first[k.id], level: ad[k.id],
      aisle: aisle[k.id], pad: k.pad,
    });
    if (vomitorium) await t.cagir("cut_vomitories", { level: ad[k.id] });
  }
  return K;
}

describe("KABUL: GS araçlardan yeniden kuruluyor", () => {
  it("blok · koltuk · kapı sayısı gs.venue.js ile BİREBİR aynı", async () => {
    await gsKur(t);
    const d = await t.jsonCagir("plan_summary");
    expect(d.blocks).toHaveLength(GS.blocks.length);          /* 96 */
    expect(d.seatCount).toBe(gsKoltuk);                        /* 48.600 */
    expect(d.shapes.filter((s) => s.type === "door")).toHaveLength(gsKapi);
  });

  it("kat başına dağılım da aynı", async () => {
    await gsKur(t);
    const d = await t.jsonCagir("plan_summary");
    const beklenen = {};
    GS.blocks.forEach((b) => { beklenen[b.level] = (beklenen[b.level] || 0) + buildMeta(b).seatCount; });
    d.levels.forEach(({ level, seats }) => {
      if (beklenen[level] !== undefined) expect(seats).toBe(beklenen[level]);
    });
  });

  it("kademeler ÇAKIŞMIYOR — çözücü taban payını bildiği için", async () => {
    await gsKur(t);
    const d = await t.jsonCagir("plan_summary");
    /* footprint-overlap-same-level projenin en pahalı hata sınıfıydı;
       solve_tiers kullanıldığında oluşamaz. */
    const cakisma = d.findings.filter((f) => f.id === "footprint-overlap-same-level");
    expect(cakisma).toEqual([]);
  });
});

describe("solve_tiers — sihirli sayı yerine türetme", () => {
  it("ilk kademe verdiğin W/H'yi korur, sonrakiler türetilir", async () => {
    await t.cagir("create_plan", { name: "T" });
    const K = JSON.parse(await t.cagir("solve_tiers", {
      mode: "bowl",
      tiers: [
        { id: "a", rows: 20, rowGap: 85, seatGap: 50, pad: 70, W: 5000, H: 4000 },
        { id: "b", rows: 10, rowGap: 85, seatGap: 50, pad: 70, gapFromPrev: 300 },
      ],
    }));
    expect(K[0].W).toBe(5000);
    /* İkinci kademe birincinin DIŞINDA başlamalı: ilk sıra + sıralar + iki
       taban payı + istenen boşluk. */
    expect(K[1].W).toBeGreaterThan(5000 + 19 * 85);
  });

  it("ilk kademe W/H vermezse NET hata verir", async () => {
    await t.cagir("create_plan", { name: "T" });
    await expect(t.cagir("solve_tiers", {
      mode: "bowl", tiers: [{ id: "a", rows: 10, rowGap: 85, seatGap: 50 }],
    })).rejects.toThrow(/W ve H/);
  });
});

describe("cut_vomitories — tünel tribünün İÇİNE oyulur", () => {
  beforeEach(async () => {
    await t.cagir("create_plan", { name: "T" });
    await t.cagir("add_block", { kind: "grid", label: "A", level: "Tribün", x: 0, y: 0, rows: 10, cols: 20 });
  });

  it("koltuk SİLER ve tam o boşluğa kapı koyar", async () => {
    const onceki = (await t.jsonCagir("plan_summary")).seatCount;
    await t.cagir("cut_vomitories", { level: "Tribün" });
    const d = await t.jsonCagir("plan_summary");
    expect(d.seatCount).toBeLessThan(onceki);                  /* koltuk silindi */
    expect(d.shapes.filter((s) => s.type === "door")).toHaveLength(1);
  });

  it("açılan kapı hiçbir koltukla KESİŞMEZ", async () => {
    await t.cagir("cut_vomitories", { level: "Tribün" });
    const d = await t.jsonCagir("plan_summary");
    /* Kapıyı koltuğun üstüne koymak, kapı mimarisindeki asıl hataydı. */
    expect(d.findings.filter((f) => f.id === "seat-clash")).toEqual([]);
  });

  it("eşleşen blok yoksa sessizce geçmez, hata verir", async () => {
    await expect(t.cagir("cut_vomitories", { level: "Olmayan Kat" }))
      .rejects.toThrow(/Eşleşen blok yok/);
  });
});

describe("add_accessible — tekerlekli sandalye + refakatçi ÇİFTİ", () => {
  it("doğrulamadaki eksiği kapatır", async () => {
    await t.cagir("create_plan", { name: "T" });
    await t.cagir("add_block", { kind: "grid", label: "A", level: "P", x: 0, y: 0, rows: 10, cols: 20 });

    const once = (await t.jsonCagir("plan_summary")).findings
      .find((f) => f.id === "wheelchair-adequacy");
    expect(once).toBeTruthy();
    expect(once.m + " " + (once.d || "")).toMatch(/\d/);        /* hedef değer veriyor */

    await t.cagir("add_accessible", { level: "P", pairs: 5 });
    const sonra = (await t.jsonCagir("plan_summary")).findings
      .filter((f) => f.id === "wheelchair-adequacy" && f.t === "err");
    expect(sonra).toEqual([]);
  });

  it("refakatçi grupsuz kalmaz (rapor §5.4)", async () => {
    await t.cagir("create_plan", { name: "T" });
    await t.cagir("add_block", { kind: "grid", label: "A", level: "P", x: 0, y: 0, rows: 10, cols: 20 });
    await t.cagir("add_accessible", { level: "P", pairs: 5 });
    const d = await t.jsonCagir("plan_summary");
    expect(d.findings.filter((f) => f.id === "companion-orphan")).toEqual([]);
  });
});

describe("şekiller ve kapılar", () => {
  beforeEach(async () => {
    await t.cagir("create_plan", { name: "T" });
    await t.cagir("add_block", { kind: "grid", label: "A", level: "P", x: 0, y: 2000, rows: 5, cols: 10 });
  });

  it("pitch nizami ölçüyü kendisi koyar, sport zorunlu", async () => {
    await expect(t.cagir("add_shape", { type: "pitch", x: 0, y: 0 }))
      .rejects.toThrow(/sport zorunlu/);
    await t.cagir("add_shape", { type: "pitch", x: 0, y: 0, sport: "football" });
    expect((await t.jsonCagir("plan_summary")).shapes.some((s) => s.type === "pitch")).toBe(true);
  });

  it("pitch dışındaki şekiller w/h ister", async () => {
    await expect(t.cagir("add_shape", { type: "stage", x: 0, y: 0 }))
      .rejects.toThrow(/w ve h zorunlu/);
  });

  it("BİR BLOK BİRDEN ÇOK KAPIDAN girilebilir (Şükrü Saracoğlu Maraton Üst A-E → 26 ve 27)", async () => {
    await t.cagir("add_shape", { type: "door", x: -500, y: 4000, w: 300, h: 300, label: "KAPI 26" });
    await t.cagir("add_shape", { type: "door", x: 500, y: 4000, w: 300, h: 300, label: "KAPI 27" });
    await t.cagir("assign_gate", { gate: "KAPI 26", blocks: ["A"] });
    await t.cagir("assign_gate", { gate: "KAPI 27", blocks: ["A"] });
    const d = await t.jsonCagir("plan_summary");
    expect(d.blocks[0].gates.sort()).toEqual(["KAPI 26", "KAPI 27"]);
  });

  it("olmayan kapıya atama sessizce geçmez", async () => {
    await expect(t.cagir("assign_gate", { gate: "KAPI YOK", blocks: ["A"] }))
      .rejects.toThrow(/Kapı bulunamadı/);
  });
});

describe("define_section — rapor sözlüğü", () => {
  it("bölüme tür verir", async () => {
    await t.cagir("create_plan", { name: "T" });
    await t.cagir("add_block", { kind: "grid", label: "A", level: "Maraton / Üst", x: 0, y: 0, rows: 5, cols: 10 });
    await t.cagir("define_section", { level: "Maraton", kind: "stand" });
    /* Araç hata vermeden geçtiyse ve plan hâlâ tutarlıysa yeter — bölüm
       türünün kendisi dışa aktarımda sınanıyor (db-export testleri). */
    expect((await t.jsonCagir("plan_summary")).seatCount).toBe(50);
  });

  it("sözlük dışı tür ŞEMADA reddedilir", async () => {
    await t.cagir("create_plan", { name: "T" });
    await expect(t.cagir("define_section", { level: "X", kind: "her_neyse" })).rejects.toThrow();
  });
});

/* ══════════════════════════════════════════════════════════════════════════
   EDİTÖRÜN OLUP MCP'DE OLMAYAN YETENEKLER

   Ölçüldü: on salonun dördü ikon şekli kullanıyor (22 örnek), ikisi
   düzensiz çokgen salon sınırı (2 örnek). Soğuk LLM testinde model "REJİ
   ODASI için şekil türü yok" diye takıldı ve not olarak koymak zorunda
   kaldı. free blok türü ise 334 bloğun HİÇBİRİNDE kullanılmıyor —
   bilerek açılmadı, olmayan ihtiyaç uydurmamak için.
   ══════════════════════════════════════════════════════════════════════════ */
describe("ikon ve çokgen şekiller", () => {
  beforeEach(async () => { await t.cagir("create_plan", { name: "T" }); });

  it("tesis ikonu eklenebiliyor (tuvalet, vestiyer, danışma...)", async () => {
    await t.cagir("add_shape", { type: "icon", icon: "cloak", x: -900, y: 900, label: "Vestiyer" });
    const d = await t.jsonCagir("plan_summary");
    expect(d.shapes.find((s) => s.type === "icon").label).toBe("Vestiyer");
  });

  it("ikon türü verilmezse sessizce geçmiyor", async () => {
    await expect(t.cagir("add_shape", { type: "icon", x: 0, y: 0 }))
      .rejects.toThrow(/icon türü zorunlu/);
  });

  it("çokgen duvar SINIR olarak çalışıyor — düzensiz salonlar için", async () => {
    /* Dikdörtgen duvar düzensiz bir salonu temsil edemez; CSO ve Harbiye'nin
       sınırı çokgen. Sınır kuralları (koltuk salon dışına taşmasın) duvara
       bakıyor, yani çokgen olmadan o salonlar doğru denetlenemez. */
    await t.cagir("add_shape", { type: "wall", x: 0, y: 0,
      points: [{ x: -600, y: -400 }, { x: 600, y: -400 }, { x: 0, y: 600 }] });
    await t.cagir("add_block", { kind: "grid", label: "A", level: "P", x: 0, y: 0, rows: 4, cols: 20 });
    const v = await t.jsonCagir("validate");
    expect(v.findings.some((f) => f.rule === "seats-outside-boundary")).toBe(true);
  });

  it("çokgen ÇOKGEN olarak çiziliyor, dikdörtgene indirgenmiyor", async () => {
    await t.cagir("add_shape", { type: "wall", x: 0, y: 0,
      points: [{ x: -600, y: -400 }, { x: 600, y: -400 }, { x: 0, y: 600 }] });
    await t.cagir("add_block", { kind: "grid", label: "A", level: "P", x: 0, y: 0, rows: 2, cols: 4 });
    const { renderSvg } = await import("../../mcp/render.mjs");
    expect(renderSvg(t.session.plan, { scope: "all" }).svg).toMatch(/<polygon[^>]*-600,-400/);
  });

  it("en az 3 nokta şartı şemada zorunlu", async () => {
    await expect(t.cagir("add_shape", { type: "wall", x: 0, y: 0,
      points: [{ x: 0, y: 0 }, { x: 10, y: 10 }] })).rejects.toThrow();
  });
});
