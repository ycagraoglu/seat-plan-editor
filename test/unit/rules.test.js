import { describe, it, expect } from "vitest";
import { RULES, buildCtx, runRules, seatCorners } from "../../src/core/rules.js";
import { buildMeta, syntheticSectionId } from "../../src/core/geometry.js";

const overlapRule = RULES.find((r) => r.id === "footprint-overlap-same-level");
const crossLevelRule = RULES.find((r) => r.id === "footprint-overlap-cross-level");
const companionGroupRule = RULES.find((r) => r.id === "companion-group-incomplete");

/* outlineOverlapArea sadece köşe noktası listesi (m.outline) ve m.bbox
   bekliyor — testin buildMeta'nın gerçek koltuk geometrisini kurmasına
   gerek yok, eksen-hizalı basit bir dikdörtgen yeterli. */
const rectMeta = (x0, x1, y0, y1) => ({
  bbox: { x0, x1, y0, y1 },
  outline: [{ x: x0, y: y0 }, { x: x1, y: y0 }, { x: x1, y: y1 }, { x: x0, y: y1 }],
});

/* Zincir çakışma: A↔B ve B↔C örtüşür, A↔C örtüşmez — 3 blok ama 2 çift.
   Görev raporundaki gerçek örnek de bu şekildeydi (balkon kademesinde 3
   blok çakışıyordu, rapor "2 blok" diyordu, durum çubuğu "3 blok"). */
function chainPlan() {
  const blocks = [
    { id: "A", label: "A", name: "A", level: "" },
    { id: "B", label: "B", name: "B", level: "" },
    { id: "C", label: "C", name: "C", level: "" },
  ];
  const metas = [
    { b: blocks[0], m: rectMeta(0, 100, 0, 100) },
    { b: blocks[1], m: rectMeta(50, 180, 0, 100) },   // A ile 50×100 = 5000 cm² örtüşür
    { b: blocks[2], m: rectMeta(160, 260, 0, 100) },  // B ile 20×100 = 2000 cm² örtüşür, A ile örtüşmez
  ];
  return { ctx: buildCtx({ blocks }, metas, new Map()), blocks };
}

describe("footprint-overlap-same-level — mesaj BLOK sayısı versin, ÇİFT sayısı değil (HATA 3)", () => {
  it("3 blok zincirleme çakışıyor (2 çift) — ids blok bazlı, m de AYNI sayıyı söylemeli", () => {
    const { ctx } = chainPlan();
    const [finding] = overlapRule.check(ctx);

    expect(finding.ids).toHaveLength(3); // hit.size: A, B, C
    /* PlanEditor.jsx'teki canlı durum çubuğu collide.length'i (= finding.ids.length)
       doğrudan gösteriyor; mesajdaki sayı bundan FARKLI olursa operatör
       hangisine güveneceğini bilemez (görev raporundaki asıl şikayet). */
    expect(finding.m).toBe(`${finding.ids.length} blok dış hattı başka bir bloğun dış hattıyla çakışıyor`);
    expect(finding.m).toContain("3 blok"); // pairs.length (2) DEĞİL
  });
});

describe("footprint-overlap-same-level — maxArea canlı büyüklük göstergesi için (EKSİK 4)", () => {
  it("birden çok çift varsa EN BÜYÜK örtüşme alanını taşır (yeni hesap yok, var olanı taşır)", () => {
    const { ctx } = chainPlan();
    const [finding] = overlapRule.check(ctx);
    expect(finding.maxArea).toBeCloseTo(5000, 6); // A↔B (5000) > B↔C (2000)
  });
});

/* ─────────────────────────────────────────────────────────────────────
   seat_kind + features göçünden SONRA: tekerlekli yeterlilik / refakatçi /
   görüş-kısıtlı kuralları eski davranışla AYNI sonucu üretmeli — sadece
   veri kaynağı değişti (ctx.seats.at.wheel/comp/obstr → kinds/features).
   Blok, AKM/YENİKAPI'nın gerçekte yaptığı gibi SADECE eski ov.at alanını
   kullanıyor (venue dosyaları hiç migrate() görmez) — bu üç kural o ham
   veriden doğru sonucu üretebiliyor mu, asıl soru bu. ───────────────── */
function wheelchairPlan() {
  const block = {
    id: "b1", kind: "grid", label: "A", name: "A", level: "", x: 0, y: 0, rot: 0,
    cols: 10, rows: 1, taper: 0, curve: 0, seatGap: 50, rowGap: 90, counts: "",
    align: "center", color: "", attr: "", num: {},
    ov: {
      "0,0": { at: "wheel" }, "0,1": { at: "wheel" }, "0,2": { at: "wheel" },
      "0,3": { at: "comp" },
      "0,4": { at: "obstr" },
    },
  };
  const metas = [{ b: block, m: buildMeta(block) }];
  const ctx = buildCtx({ blocks: [block], shapes: [], idTemplate: undefined }, metas, new Map());
  return runRules(ctx);
}

describe("wheelchair-adequacy / companion-seat-shortfall / obstructed-view-count — yeni modelle çalışmaya devam ediyor", () => {
  const findings = wheelchairPlan();
  const byId = (id) => findings.find((f) => f.id === id);

  it("wheelchair-adequacy: 3 wheelchair_space (eski ov.at:'wheel') doğru sayılır, refakatçi sayısı mesajda", () => {
    const f = byId("wheelchair-adequacy");
    expect(f.t).toBe("ok"); // 10 koltuk için gereken 1, elde 3 → yeterli
    expect(f.m).toBe("3 tekerlekli sandalye alanı · 1 refakatçi");
  });

  it("companion-seat-shortfall: 1 companion (eski ov.at:'comp') < 3 wheelchair_space → uyarı", () => {
    const f = byId("companion-seat-shortfall");
    expect(f).toBeDefined();
    expect(f.t).toBe("warn");
    expect(f.m).toContain("1 < 3");
  });

  it("obstructed-view-count: eski ov.at:'obstr' artık bir FEATURE (restrictedView), kind DEĞİL — yine de doğru sayılıyor", () => {
    const f = byId("obstructed-view-count");
    expect(f).toBeDefined();
    expect(f.m).toBe("1 görüş kısıtlı koltuk");
  });

  it("seatCorners: wheelchair_space koltuğun köşesi artık SEAT_KINDS'ten (86cm) geliyor, tekli (41cm) değil", () => {
    const wheelSeat = { x: 0, y: 0, rot: 0, seatKind: "wheelchair_space" };
    const singleSeat = { x: 0, y: 0, rot: 0, seatKind: "single" };
    const wWheel = seatCorners(wheelSeat)[1].x - seatCorners(wheelSeat)[0].x; // sağ-üst - sol-üst
    const wSingle = seatCorners(singleSeat)[1].x - seatCorners(singleSeat)[0].x;
    expect(wWheel).toBeCloseTo(86, 6);
    expect(wSingle).toBeCloseTo(41, 6);
  });
});

/* ─────────────────────────────────────────────────────────────────────
   companion-group-incomplete — rapor §5.4: bir refakatçinin hangi
   tekerlekli sandalye konumuyla ilişkili olduğu AÇIKÇA tanımlanmalı.
   Grup atfı ov.groupId üzerinden (bkz. core/geometry.js resolveSeatGroup),
   grubun kendisi plan.groups'ta (kind: "companion_group"). Blok, mevcut
   dosyadaki wheelchairPlan() ile AYNI iskelet (grid, 10 sütun, 1 sıra) —
   yalnız ov'un içeriği ve plan.groups farklı. ───────────────────────── */
function companionGroupPlan(groups, ov) {
  const block = {
    id: "b1", kind: "grid", label: "A", name: "A", level: "", x: 0, y: 0, rot: 0,
    cols: 10, rows: 1, taper: 0, curve: 0, seatGap: 50, rowGap: 90, counts: "",
    align: "center", color: "", attr: "", num: {}, ov,
  };
  const metas = [{ b: block, m: buildMeta(block) }];
  return buildCtx({ blocks: [block], shapes: [], idTemplate: undefined, groups }, metas, new Map());
}

describe("companion-group-incomplete — refakatçi grubu tekerlekli sandalye + refakatçi ikisini de içermeli", () => {
  it("plan.groups'ta hiç companion_group yoksa kural sessiz kalır (9 örnek salonun temiz kalma nedeni budur — hiçbirinde companion_group yok)", () => {
    const ctx = companionGroupPlan([{ id: "g1", code: "M1", name: "M1", kind: "table" }], {});
    expect(companionGroupRule.check(ctx)).toEqual([]);
  });

  it("tekerlekli sandalye alanı VE refakatçi koltuğu ikisi de varsa geçer (bulgu yok)", () => {
    const groups = [{ id: "g1", code: "REF-A", name: "Refakatçi A", kind: "companion_group" }];
    const ov = { "0,0": { seatKind: "wheelchair_space", groupId: "g1" }, "0,1": { seatKind: "companion", groupId: "g1" } };
    expect(companionGroupRule.check(companionGroupPlan(groups, ov))).toEqual([]);
  });

  /* TESTİN TESTİ (görev tanımının istediği "kasten eksik grup kur, kırmızı
     dönüşü doğrula" senaryosu — kalıcı regresyon olarak burada sabitlendi):
     refakatçisi hiç atanmamış bir companion_group. */
  it("testin testi: yalnız tekerlekli sandalye alanı olan (refakatçisiz) bir companion_group KIRMIZI döner", () => {
    const groups = [{ id: "g1", code: "REF-A", name: "Refakatçi A", kind: "companion_group" }];
    const ov = { "0,0": { seatKind: "wheelchair_space", groupId: "g1" } }; // refakatçi KASITLI eksik
    const [finding] = companionGroupRule.check(companionGroupPlan(groups, ov));
    expect(finding).toBeDefined();
    expect(finding.t).toBe("err");
    expect(finding.m).toBe("1 refakatçi grubu eksik — tekerlekli sandalye alanı ve refakatçi koltuğunun ikisi de gerekir");
    expect(finding.d).toBe("REF-A: refakatçi koltuğu yok");
    expect(finding.ids).toEqual(["b1"]);
  });

  it("ters eksik: yalnız refakatçi koltuğu olan (tekerlekli sandalyesiz) bir grup da KIRMIZI döner", () => {
    const groups = [{ id: "g1", code: "REF-B", name: "Refakatçi B", kind: "companion_group" }];
    const ov = { "0,0": { seatKind: "companion", groupId: "g1" } };
    const [finding] = companionGroupRule.check(companionGroupPlan(groups, ov));
    expect(finding.d).toBe("REF-B: tekerlekli sandalye alanı yok");
  });

  it("hiçbir koltuk referans vermeyen (tamamen boş) bir companion_group ikisinin de eksik olduğunu söyler", () => {
    const groups = [{ id: "g1", code: "REF-C", name: "Refakatçi C", kind: "companion_group" }];
    const [finding] = companionGroupRule.check(companionGroupPlan(groups, {}));
    expect(finding.d).toBe("REF-C: tekerlekli sandalye alanı ve refakatçi koltuğu yok");
  });

  it("birden çok companion_group varsa yalnız EKSİK olanlar sayılır/raporlanır (tamam olan sessiz kalır)", () => {
    const groups = [
      { id: "g1", code: "REF-A", name: "Refakatçi A", kind: "companion_group" },
      { id: "g2", code: "REF-B", name: "Refakatçi B", kind: "companion_group" },
    ];
    const ov = {
      "0,0": { seatKind: "wheelchair_space", groupId: "g1" }, "0,1": { seatKind: "companion", groupId: "g1" },
      "0,2": { seatKind: "wheelchair_space", groupId: "g2" }, // g2'nin refakatçisi yok
    };
    const [finding] = companionGroupRule.check(companionGroupPlan(groups, ov));
    expect(finding.m).toContain("1 refakatçi grubu");
    expect(finding.d).toBe("REF-B: refakatçi koltuğu yok");
  });
});

/* ─────────────────────────────────────────────────────────────────────
   Bölüm ağacı (rapor §5.1) sonrası: "aynı kat" artık "bloğun ait olduğu
   AYNI BÖLÜM" (buildCtx'teki bySection, core/geometry.js'teki
   resolveBlockSectionId). İki iddia:
   1. Göçmemiş bir planda (level string, sectionId YOK — 9 örnek salonun
      TAMAMININ hali) davranış eski byLevel gruplamasıyla derinlik-1'de
      BİREBİR AYNI kalmalı.
   2. Yeni model, eskisinin temsil EDEMEDİĞİ durumu temsil edebilmeli: AYNI
      level dizesini paylaşan iki blok, FARKLI bir ebeveyne (sectionId)
      açıkça bağlıysa artık AYNI bölüm SAYILMAMALI (görev tanımındaki Batı
      Tribünü → Alt Kat/Üst Kat → H Blok örneği — bugün "aynı kod farklı
      katta" mümkün değildi). ───────────────────────────────────────── */
describe("footprint-overlap-same-level / -cross-level — derinlik 1'de section tabanlı gruplama eski byLevel ile AYNI davranıyor", () => {
  /* twin(): iki blok TAM üst üste (100×100 = 10000 cm² örtüşme, eşik 50'yi
     rahatça aşıyor) — overlapRule.check devreye girsin diye YETERLİ, kaç
     cm² olduğu bu testlerin ilgisi dışında (bkz. yukarıdaki chainPlan). */
  const twin = (id, patch) => ({ b: { id, label: id, name: id, level: "", ...patch }, m: rectMeta(0, 100, 0, 100) });

  it("AYNI level dizesi, sectionId YOK (göçmemiş) → bugünkü gibi HATA (same-level)", () => {
    const metas = [twin("A", { level: "Parter" }), twin("B", { level: "Parter" })];
    const ctx = buildCtx({ blocks: metas.map((x) => x.b) }, metas, new Map());
    expect(overlapRule.check(ctx)).toHaveLength(1);
    expect(crossLevelRule.check(ctx)).toEqual([]);
  });

  it("FARKLI level dizesi, sectionId YOK (göçmemiş) → bugünkü gibi UYARI (cross-level), HATA değil", () => {
    const metas = [twin("A", { level: "Parter" }), twin("B", { level: "1. Balkon" })];
    const ctx = buildCtx({ blocks: metas.map((x) => x.b) }, metas, new Map());
    expect(overlapRule.check(ctx)).toEqual([]);
    expect(crossLevelRule.check(ctx)).toHaveLength(1);
  });

  it("iki bloğun sentetik section id'si level'dan bağımsız DOĞRUDAN eşleşir (syntheticSectionId ile)", () => {
    const metas = [twin("A", { level: "Parter" }), twin("B", { level: "Parter" })];
    const ctx = buildCtx({ blocks: metas.map((x) => x.b) }, metas, new Map());
    expect([...ctx.bySection.keys()]).toEqual([syntheticSectionId("Parter")]);
  });

  it("YENİ kapasite: AYNI level dizesi ('H Blok') ama AÇIK FARKLI sectionId (Alt Kat / Üst Kat) → artık AYNI bölüm SAYILMAZ", () => {
    const metas = [
      twin("h-alt", { level: "H Blok", sectionId: "alt-kat/h-blok" }),
      twin("h-ust", { level: "H Blok", sectionId: "ust-kat/h-blok" }),
    ];
    const ctx = buildCtx({ blocks: metas.map((x) => x.b) }, metas, new Map());
    // eski (yalnız level'a bakan) mantık bunu HATA sayardı — yeni model artık UYARI:
    // iki AYRI ebeveynin altındaki iki "H Blok" fiziksel olarak üst üste binebilir
    // (bkz. Batı Tribünü → Alt Kat/Üst Kat → H Blok, görev tanımı).
    expect(overlapRule.check(ctx)).toEqual([]);
    expect(crossLevelRule.check(ctx)).toHaveLength(1);
  });
});

/* ── narrow-aisle: bölüm anahtarı ─────────────────────────────────────
   Kural "iki blok arasında yürüme payı" arıyor. Farklı BÖLÜMDEKİ bloklar
   aynı düzlemde değildir (balkon parterin üstünde durur), aralarında
   yürünmez — dolayısıyla koridor aranmamalı. Karşılaştırma ham `level`
   üzerinden yapılıyordu; hiyerarşi geldiğinde "Alt Kat H" ile "Üst Kat G"
   aynı level string'ini paylaşıp farklı bölümde olabiliyor ve kural
   yanlışlıkla ötüyordu (footprint-overlap-* çoktan bölüme geçmişti,
   bu kural geride kalmıştı). */
function aisleBlock(id, x, sectionId) {
  return { id, kind: "grid", label: id, name: id, level: "Batı Tribünü",
    ...(sectionId ? { sectionId } : {}),
    x, y: 0, rot: 0, cols: 6, rows: 4, taper: 0, curve: 0,
    seatGap: 50, rowGap: 90, counts: "", align: "center", color: "", attr: "",
    num: {}, ov: {} };
}
const aisleFinding = (blocks) => {
  const plan = { name: "t", blocks, shapes: [] };
  const metas = plan.blocks.map((b) => ({ b, m: buildMeta(b) }));
  return runRules(buildCtx(plan, metas, new Map()))
    .find((f) => /yürüme payı|en dar açıklık/.test(f.m || ""));
};

describe("narrow-aisle bölüm anahtarını kullanır", () => {
  it("aynı bölümdeki iki blok dar kalırsa uyarır (bugünkü 9 salonun hali)", () => {
    expect(aisleFinding([aisleBlock("H", 0), aisleBlock("G", 120)])).toBeDefined();
  });

  it("farklı bölümdeki bloklar için koridor aramaz", () => {
    const f = aisleFinding([
      aisleBlock("H", 0, syntheticSectionId("Alt Kat")),
      aisleBlock("G", 120, syntheticSectionId("Üst Kat")),
    ]);
    expect(f).toBeUndefined();
  });

  it("aynı level string'i paylaşsalar bile bölüm farklıysa ayrılır", () => {
    const a = aisleBlock("H", 0, "s:alt"), b = aisleBlock("G", 120, "s:ust");
    expect(a.level).toBe(b.level);          // ham level AYNI
    expect(aisleFinding([a, b])).toBeUndefined();  // ama bölüm farklı
  });
});
