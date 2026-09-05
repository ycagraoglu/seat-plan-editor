import { describe, it, expect } from "vitest";
import { parseCounts, countAt, prep, offsetFor, footprintPad, tableCells,
  SEAT_KINDS, DEF, DEFAULT_SEAT_KIND, seatKindWidth, legacyAtToKind, resolveSeatKind, buildSeats,
  tableGroupId, resolveSeatGroup, resolvePlanGroups,
  syntheticSectionId, resolveBlockSectionId, resolvePlanSections }
  from "../../src/core/geometry.js";

describe("parseCounts — sayım şartnamesi metni", () => {
  it('"21..15" bir aralık (from/to) döner', () => {
    expect(parseCounts("21..15")).toEqual({ from: 21, to: 15 });
  });
  it('"5,5,6" bir liste döner', () => {
    expect(parseCounts("5,5,6")).toEqual([5, 5, 6]);
  });
  it("boş/undefined için null döner", () => {
    expect(parseCounts("")).toBeNull();
    expect(parseCounts(undefined)).toBeNull();
  });
  it("0 ve negatif sayıları listeden eler", () => {
    expect(parseCounts("0,5,-3,6")).toEqual([5, 6]);
  });
});

describe("countAt — satır başına koltuk sayısı", () => {
  it('"21..15" aralığı 5 satıra doğrusal enterpole eder (uçlar TAM, ortası yuvarlanır)', () => {
    const spec = parseCounts("21..15");
    const rows = 5;
    expect([0, 1, 2, 3, 4].map((r) => countAt(spec, r, rows, 0))).toEqual([21, 20, 18, 17, 15]);
  });
  it('"5,5,6" listesi doğrudan indekslenir, liste bitince SON eleman tekrarlanır', () => {
    const spec = parseCounts("5,5,6");
    expect([0, 1, 2, 3].map((r) => countAt(spec, r, 4, 0))).toEqual([5, 5, 6, 6]);
  });
  it("şartname yoksa (null) çağıranın verdiği varsayılana düşer", () => {
    expect(countAt(null, 2, 5, 42)).toBe(42);
  });
});

describe("prep — blok geometrisinin ön hesabı", () => {
  it("grid + taper: satır başına koltuk sayısı cols + r*taper", () => {
    expect(prep({ kind: "grid", rows: 4, cols: 10, taper: 2, counts: "" }))
      .toMatchObject({ counts: [10, 12, 14, 16], maxN: 16, R0: 0, sgn: 1 });
  });
  it("grid + curve: R0 = W²/(8h) + h/2 formülüyle çözülür (kavisli sıra yarıçapı)", () => {
    // maxN=10, seatGap=50 → W=9*50=450; curve=100 → h=100
    // R0 = 450²/(8*100) + 100/2 = 253.125 + 50 = 303.125
    const P = prep({ kind: "grid", rows: 3, cols: 10, taper: 0, seatGap: 50, curve: 100, counts: "" });
    expect(P.R0).toBeCloseTo(303.125, 6);
    expect(P.sgn).toBe(1);
  });
  it("table: tek satır, seats kadar koltuk", () => {
    expect(prep({ kind: "table", seats: 6 })).toEqual({ counts: [6], maxN: 6, R0: 0, sgn: 1 });
  });
  it("free: nokta sayısı kadar tek satır", () => {
    const pts = [{ x: 0, y: 0 }, { x: 1, y: 1 }, { x: 2, y: 2 }];
    expect(prep({ kind: "free", pts })).toEqual({ counts: [3], maxN: 3, R0: 0, sgn: 1 });
  });
});

describe("offsetFor — hizalama ofseti", () => {
  it("left: ofset her zaman 0", () => expect(offsetFor("left", 10, 4)).toBe(0));
  it("right: ofset maxN - n", () => expect(offsetFor("right", 10, 4)).toBe(6));
  it("center: ortalanır, gerekirse yuvarlanır", () => {
    expect(offsetFor("center", 10, 4)).toBe(3);
    expect(offsetFor("center", 10, 3)).toBe(4); // (10-3)/2=3.5 -> round -> 4
  });
});

describe("footprintPad — blok tabanının koltuktan taşma payı (tek kaynak, solve.js da bunu kullanır)", () => {
  it("varsayılan pad (55) + yarım koltuk + yarım koltuk aralığı", () => {
    // 55 + max(41,38)/2 + 50/2 = 55 + 20.5 + 25 = 100.5
    expect(footprintPad({ seatGap: 50 })).toBeCloseTo(100.5, 6);
  });
  it("elle verilen pad kullanılır", () => {
    expect(footprintPad({ pad: 80, seatGap: 60 })).toBeCloseTo(130.5, 6);
  });
});

describe("tableCells — yuvarlak masa çevresine koltuk dizilimi", () => {
  it("4 koltuk, 90° aralıklarla, masa merkezinden R uzaklıkta", () => {
    // R = tW/2 + clear(12) + seatH/2(19) = 50+12+19 = 81
    const cells = tableCells({ tShape: "round", tW: 100, seats: 4, clear: 12, a0: 0 })[0];
    expect(cells).toHaveLength(4);
    expect(cells[0].x).toBeCloseTo(0, 6);
    expect(cells[0].y).toBeCloseTo(-81, 6);
    expect(cells[1].x).toBeCloseTo(81, 6);
    expect(cells[1].y).toBeCloseTo(0, 6);
    expect(cells.map((c) => c.a)).toEqual([0, 90, 180, 270]);
  });
});

/* SEAT_KINDS — görev tanımının ölçü kısıtları: wheelchair_space mevcut
   salonların geometrisi buna bağlı olduğu için 86 DEĞİŞMEMELİ; companion
   ve single tekli genişlikte (41) eşit; loveseat tekliden belirgin geniş;
   stool tekliden küçük. */
describe("SEAT_KINDS — koltuk türü başına fiziksel genişlik", () => {
  it("wheelchair_space 86cm (DEĞİŞMEMELİ — mevcut 9 salonun geometrisi buna bağlı)", () => {
    expect(seatKindWidth("wheelchair_space")).toBe(86);
  });
  it("single === DEF.seatW (41)", () => {
    expect(seatKindWidth("single")).toBe(DEF.seatW);
    expect(DEF.seatW).toBe(41);
  });
  it("companion tekli ile AYNI genişlikte (rapor: 'normal tekli genişlik')", () => {
    expect(seatKindWidth("companion")).toBe(DEF.seatW);
  });
  it("loveseat tekliden BELİRGİN geniş", () => {
    expect(seatKindWidth("loveseat")).toBeGreaterThan(DEF.seatW + 15);
  });
  it("stool tekliden KÜÇÜK", () => {
    expect(seatKindWidth("stool")).toBeLessThan(DEF.seatW);
  });
  it("tech === DEF.seatW (raporun sözlüğü dışında ama geometri değişmesin diye tekli genişlikte)", () => {
    expect(seatKindWidth("tech")).toBe(DEF.seatW);
  });
  it("bilinmeyen/undefined tür DEF.seatW'a düşer (savunmacı varsayılan)", () => {
    expect(seatKindWidth("olmayan-bir-tur")).toBe(DEF.seatW);
    expect(seatKindWidth(undefined)).toBe(DEF.seatW);
  });
});

/* legacyAtToKind — göç eşlemesinin TEK kaynağı (core/schema.js'in kalıcı
   göçü VE bu dosyanın venue-okuma-anı geriye dönük uyumluluğu ikisi de
   buradan besleniyor). Görev tanımının eşleme tablosunun HER satırı. */
describe("legacyAtToKind — eski tek-alan (`at`/`attr`) → yeni {seatKind, seatFeatures}", () => {
  it('(boş) → single, []', () => {
    expect(legacyAtToKind("")).toEqual({ seatKind: "single", seatFeatures: [] });
  });
  it('"wheel" → wheelchair_space, [accessible]', () => {
    expect(legacyAtToKind("wheel")).toEqual({ seatKind: "wheelchair_space", seatFeatures: ["accessible"] });
  });
  it('"comp" → companion, [accessible]', () => {
    expect(legacyAtToKind("comp")).toEqual({ seatKind: "companion", seatFeatures: ["accessible"] });
  });
  it('"obstr" → single, [restrictedView]', () => {
    expect(legacyAtToKind("obstr")).toEqual({ seatKind: "single", seatFeatures: ["restrictedView"] });
  });
  it('"tech" → tech, [] (raporun sözlüğü DIŞINDA, editöre özgü uzantı)', () => {
    expect(legacyAtToKind("tech")).toEqual({ seatKind: "tech", seatFeatures: [] });
  });
  it("undefined/bilinmeyen değer → single, [] (savunmacı varsayılan)", () => {
    expect(legacyAtToKind(undefined)).toEqual({ seatKind: "single", seatFeatures: [] });
    expect(legacyAtToKind("hic-boyle-bir-sey-yok")).toEqual({ seatKind: "single", seatFeatures: [] });
  });
});

/* resolveSeatKind — katman önceliği (koltuk istisnası > blok varsayılanı >
   "single") VE yeni/eski alan karışık kullanıldığında (venue dosyaları hâlâ
   ham attr/at yazıyor, editör artık sadece seatKind/seatFeatures) doğru
   sonucu üretmesi. */
describe("resolveSeatKind — katman önceliği + eski/yeni alan uyumluluğu", () => {
  it("ne koltukta ne blokta bir şey yoksa → single, []", () => {
    expect(resolveSeatKind({}, {})).toEqual({ seatKind: "single", seatFeatures: [] });
  });
  it("blok YENİ alanla (seatKind/seatFeatures) varsayılan taşıyor, koltukta istisna yok", () => {
    const b = { seatKind: "companion", seatFeatures: ["accessible"] };
    expect(resolveSeatKind(b, {})).toEqual({ seatKind: "companion", seatFeatures: ["accessible"] });
  });
  it("blok ESKİ alanla (attr, venue dosyası) varsayılan taşıyor", () => {
    expect(resolveSeatKind({ attr: "wheel" }, {})).toEqual({ seatKind: "wheelchair_space", seatFeatures: ["accessible"] });
  });
  it("koltuk istisnası YENİ alanla blok varsayılanını geçersiz kılar", () => {
    const b = { attr: "wheel" };
    expect(resolveSeatKind(b, { seatKind: "stool", seatFeatures: [] })).toEqual({ seatKind: "stool", seatFeatures: [] });
  });
  it("koltuk istisnası ESKİ alanla (ov.at, venue dosyası — builders.js withAccessible) blok varsayılanını geçersiz kılar", () => {
    const b = { attr: "" };
    expect(resolveSeatKind(b, { at: "comp" })).toEqual({ seatKind: "companion", seatFeatures: ["accessible"] });
  });
  it("koltuk istisnası (rm/gap gibi ALAKASIZ anahtarlarla) boşsa blok varsayılanına düşer", () => {
    const b = { seatKind: "loveseat", seatFeatures: [] };
    expect(resolveSeatKind(b, { dx: 5 })).toEqual({ seatKind: "loveseat", seatFeatures: [] });
  });

  /* seatKind ve seatFeatures BİRBİRİNDEN BAĞIMSIZ override edilebilir —
     MultiSeatPanel'in toplu "özellik ekle/kaldır" eylemi, koltuğun türüne
     dokunmadan SADECE seatFeatures'ı override eder; resolveSeatKind bunu
     iki AYRI karar olarak çözmeli, biri diğerini "kirletmemeli". */
  it("SADECE seatFeatures override edilirse seatKind blok varsayılanından MİRAS kalır", () => {
    const b = { seatKind: "companion", seatFeatures: [] };
    expect(resolveSeatKind(b, { seatFeatures: ["restrictedView"] }))
      .toEqual({ seatKind: "companion", seatFeatures: ["restrictedView"] });
  });
  it("SADECE seatKind override edilirse seatFeatures blok varsayılanından MİRAS kalır", () => {
    const b = { seatKind: "single", seatFeatures: ["accessible"] };
    expect(resolveSeatKind(b, { seatKind: "stool" }))
      .toEqual({ seatKind: "stool", seatFeatures: ["accessible"] });
  });
});

/* buildSeats entegrasyonu: bir venue bloğunun YAPACAĞI gibi SADECE eski
   alanları (attr/ov.at) kullanan bir blok verildiğinde çıktı koltukları
   doğru seatKind/seatFeatures taşımalı — bu, "9 örnek salonun geometrisi
   değişmeden çalışmaya devam ediyor" iddiasının buildSeats seviyesindeki
   kanıtı (görev raporundaki yapısal doğrulama script'i AYRICA salon
   bazında, koltuk koltuk aynı şeyi ölçüyor). */
describe("buildSeats — SADECE eski attr/at alanlarıyla kurulmuş bir blok (venue tarzı) doğru göçüyor", () => {
  const legacyBlock = {
    id: "b1", kind: "grid", label: "A", level: "", x: 0, y: 0, rot: 0,
    cols: 4, rows: 1, counts: "", align: "center", seatGap: 50, rowGap: 90,
    curve: 0, taper: 0, attr: "obstr", num: {}, color: "",
    ov: { "0,1": { at: "wheel" }, "0,2": { at: "comp" } },
  };
  const P = prep(legacyBlock);
  const { seats } = buildSeats(legacyBlock, { P }, "{block}-{seat}");

  it("blok varsayılanı (attr:'obstr') istisnasız koltuklara single+restrictedView verir", () => {
    const s0 = seats.find((s) => s.c === 0);
    expect(s0.seatKind).toBe("single");
    expect(s0.seatFeatures).toEqual(["restrictedView"]);
  });
  it("ov.at:'wheel' istisnası wheelchair_space+accessible verir (blok varsayılanını EZER)", () => {
    const s1 = seats.find((s) => s.c === 1);
    expect(s1.seatKind).toBe("wheelchair_space");
    expect(s1.seatFeatures).toEqual(["accessible"]);
  });
  it("ov.at:'comp' istisnası companion+accessible verir", () => {
    const s2 = seats.find((s) => s.c === 2);
    expect(s2.seatKind).toBe("companion");
    expect(s2.seatFeatures).toEqual(["accessible"]);
  });
  it("hiçbir koltuk eski `at` alanını TAŞIMAZ — çıktı tamamen yeni model", () => {
    seats.forEach((s) => expect(s).not.toHaveProperty("at"));
  });
});

/* resolveSeatGroup — resolveSeatKind'in seat_group eşi (rapor §5.3).
   Öncelik: ov istisnası (null dahil) > masa bloğu varsayılanı > grupsuz. */
describe("resolveSeatGroup — masa varsayılanı + ov istisnası önceliği", () => {
  it("masa DIŞI bir blokta istisna yoksa grup yok (null)", () => {
    expect(resolveSeatGroup({ id: "b1", kind: "grid" }, {})).toBeNull();
  });
  it("kind:\"table\" bloğunda istisna yoksa grup, bloğun KENDİ id'si (tableGroupId)", () => {
    const b = { id: "b7", kind: "table" };
    expect(resolveSeatGroup(b, {})).toBe("b7");
    expect(resolveSeatGroup(b, {})).toBe(tableGroupId(b));
  });
  it("ov.groupId TANIMLIYSA masa varsayılanını da geçersiz kılar", () => {
    const b = { id: "b7", kind: "table" };
    expect(resolveSeatGroup(b, { groupId: "grp-companion-1" })).toBe("grp-companion-1");
  });
  it("ov.groupId AÇIKÇA null ise koltuk masa grubundan ÇIKARILIR (undefined'dan farklı)", () => {
    const b = { id: "b7", kind: "table" };
    expect(resolveSeatGroup(b, { groupId: null })).toBeNull();
  });
  it("masa DIŞI bir blokta ov.groupId yine de atanabilir (box/loveseat/companion_group — elle atıf)", () => {
    expect(resolveSeatGroup({ id: "b1", kind: "grid" }, { groupId: "grp-box-1" })).toBe("grp-box-1");
  });
  it("ov'daki ALAKASIZ anahtarlar (dx/label) grup atfını etkilemez", () => {
    expect(resolveSeatGroup({ id: "b1", kind: "grid" }, { dx: 5 })).toBeNull();
  });
});

/* resolvePlanGroups — kayıtlı (plan.groups) + masa-türevi grupların
   BİRLEŞTİRİLMİŞ listesi. export.js VE rules.js'in companion_group
   kuralı TEK bu fonksiyonu okur (bkz. o dosyaların notu). */
describe("resolvePlanGroups — kayıtlı + masa-türevi grupların birleşimi", () => {
  it("plan.groups yoksa (venue dosyaları, hiç migrate() görmez) çökmez, boş listeden başlar", () => {
    expect(resolvePlanGroups({ blocks: [] })).toEqual([]);
  });
  it("kayıtlı bir grup (companion_group) OLDUĞU GİBİ listede yer alır", () => {
    const plan = { groups: [{ id: "g1", code: "REF-1", name: "Refakatçi 1", kind: "companion_group" }], blocks: [] };
    expect(resolvePlanGroups(plan)).toEqual(plan.groups);
  });
  it("kind:\"table\" bloğu SAKLANMADAN türetilir: id=blok id'si, code=label, name=name||label, kind='table'", () => {
    const plan = { groups: [], blocks: [
      { id: "b1", kind: "table", label: "M1", name: "Masa 1" },
      { id: "b2", kind: "table", label: "M2" }, // name yok → label'a düşer
      { id: "b3", kind: "grid", label: "A" },   // masa DEĞİL, listeye girmez
    ] };
    expect(resolvePlanGroups(plan)).toEqual([
      { id: "b1", code: "M1", name: "Masa 1", kind: "table", blockId: "b1" },
      { id: "b2", code: "M2", name: "M2", kind: "table", blockId: "b2" },
    ]);
  });
  it("kayıtlı gruplar + masa grupları AYNI listede, kayıtlılar ÖNCE gelir", () => {
    const plan = {
      groups: [{ id: "g1", code: "REF-1", name: "Refakatçi 1", kind: "companion_group" }],
      blocks: [{ id: "b1", kind: "table", label: "M1" }],
    };
    const groups = resolvePlanGroups(plan);
    expect(groups).toHaveLength(2);
    expect(groups[0].kind).toBe("companion_group");
    expect(groups[1]).toEqual({ id: "b1", code: "M1", name: "M1", kind: "table", blockId: "b1" });
  });
});

/* Refakatçi grubu türetimi (rapor §5.4: companion asla grupsuz kalmamalı).
   Masa grubuyla aynı desen — kaydedilmiş değil, yerleşimden okunur. */
describe("companion_group türetimi — en yakın tekerlekli sandalye ile birebir eşleşme", () => {
  const blok = (ov) => ({ id: "b1", kind: "grid", label: "A", ov });
  const gid = (g, k) => g.find((x) => x.id === `cg:b1:${k}`);

  /* Örnek salonlarda ÖLÇÜLEN üç gerçek düzen (bkz. geometry.js notu). */
  it("yan yana (GS · Ülker): (r,c) sandalye, (r,c+1) refakatçi", () => {
    const b = blok({ "0,0": { at: "wheel" }, "0,1": { at: "comp" } });
    const g = resolvePlanGroups({ blocks: [b] });
    expect(g.map((x) => x.kind)).toEqual(["companion_group"]);
    expect(resolveSeatGroup(b, b.ov["0,0"], 0, 0)).toBe(g[0].id);
    expect(resolveSeatGroup(b, b.ov["0,1"], 0, 1)).toBe(g[0].id);
    expect(g[0].id).toBe("cg:b1:0,0");        // grubun kimliği SANDALYE hücresi
  });
  it("önlü arkalı (AKM): sandalye (1,c), refakatçi bir ön sırada (0,c)", () => {
    const b = blok({ "1,5": { at: "wheel" }, "1,6": { at: "wheel" },
                     "0,5": { at: "comp" },  "0,6": { at: "comp" } });
    const g = resolvePlanGroups({ blocks: [b] });
    expect(g).toHaveLength(2);
    expect(resolveSeatGroup(b, b.ov["0,5"], 0, 5)).toBe("cg:b1:1,5");  // aynı sütun eşleşir
    expect(resolveSeatGroup(b, b.ov["0,6"], 0, 6)).toBe("cg:b1:1,6");
  });
  it("blok blok (Yenikapı): 3 sandalye + 3 refakatçi, hepsi eşleşir", () => {
    const b = blok({ "9,0": { at: "wheel" }, "9,1": { at: "wheel" }, "9,2": { at: "wheel" },
                     "9,3": { at: "comp" },  "9,4": { at: "comp" },  "9,5": { at: "comp" } });
    const g = resolvePlanGroups({ blocks: [b] });
    expect(g).toHaveLength(3);
    const bagli = ["9,3", "9,4", "9,5"].map((k) => resolveSeatGroup(b, b.ov[k], ...k.split(",").map(Number)));
    expect(new Set(bagli).size).toBe(3);                 // birebir: ikisi aynı gruba düşmez
    expect(bagli.every(Boolean)).toBe(true);
  });

  it("eşi kalmayan refakatçi grup kuramaz — companion-orphan kuralına düşer", () => {
    const b = blok({ "0,0": { at: "wheel" }, "0,1": { at: "comp" }, "0,2": { at: "comp" } });
    const g = resolvePlanGroups({ blocks: [b] });
    expect(g).toHaveLength(1);                           // tek sandalye → tek grup
    expect(resolveSeatGroup(b, b.ov["0,2"], 0, 2)).toBeNull();
  });
  it("vomitorium sandalyeyi oyduysa (rm) refakatçi öksüz kalır", () => {
    const b = blok({ "0,0": { at: "wheel", rm: true }, "0,1": { at: "comp" } });
    expect(resolvePlanGroups({ blocks: [b] })).toEqual([]);
    expect(resolveSeatGroup(b, b.ov["0,1"], 0, 1)).toBeNull();
  });
  it("refakatçi tek başınaysa grup OLUŞMAZ", () => {
    const b = blok({ "0,2": { at: "comp" } });
    expect(resolvePlanGroups({ blocks: [b] })).toEqual([]);
    expect(resolveSeatGroup(b, b.ov["0,2"], 0, 2)).toBeNull();
  });
  it("ov.groupId açıkça verilmişse türetimi EZER (istisna önceliği korunur)", () => {
    const b = blok({ "0,0": { at: "wheel", groupId: "elle" }, "0,1": { at: "comp" } });
    expect(resolveSeatGroup(b, b.ov["0,0"], 0, 0)).toBe("elle");
    expect(resolvePlanGroups({ blocks: [b] })).toEqual([]);   // üyesiz ikiz grup çıkmaz
  });
  it("masa bloğunda masa grubu KAZANIR (Aylak: masadaki tekerlekli sandalye)", () => {
    const b = { id: "b9", kind: "table", label: "M1", ov: { "0,0": { at: "wheel" }, "0,1": { at: "comp" } } };
    expect(resolveSeatGroup(b, b.ov["0,0"], 0, 0)).toBe("b9");
    expect(resolvePlanGroups({ blocks: [b] }).map((x) => x.kind)).toEqual(["table"]);
  });
});

/* resolveBlockSectionId / resolvePlanSections — bölüm ağacı (rapor §5.1).
   resolvePlanGroups'un DÖRDÜNCÜ eşi: kayıtlı (plan.sections) + göçmemiş
   bir bloğun düz `level`'ından SENTETİK türetilen bölümlerin birleşimi.
   export.js VE rules.js'in footprint-overlap-same-level/-cross-level
   kuralları TEK bu iki fonksiyonu okur (bkz. o dosyaların notu). */
describe("resolveBlockSectionId — bloğun ait olduğu bölümün id'si", () => {
  it("açık sectionId varsa O KAZANIR, level'a bakılmaz", () => {
    expect(resolveBlockSectionId({ level: "Parter", sectionId: "sec-42" })).toBe("sec-42");
  });
  it("sectionId yoksa level'dan sentetik id türetilir (syntheticSectionId ile AYNI)", () => {
    expect(resolveBlockSectionId({ level: "1. Balkon" })).toBe(syntheticSectionId("1. Balkon"));
  });
  it("level de yoksa (boş dize varsayılanı) yine çökmez, tutarlı bir id döner", () => {
    expect(resolveBlockSectionId({})).toBe(syntheticSectionId(""));
    expect(resolveBlockSectionId({ level: "" })).toBe(resolveBlockSectionId({}));
  });
});

describe("resolvePlanSections — göçmemiş bir planda düz level'dan derinlik-1 bölüm türetimi", () => {
  it("plan.sections yoksa (venue dosyaları, hiç migrate() görmez) çökmez, her FARKLI level bir bölüm olur", () => {
    const plan = { blocks: [
      { id: "b1", level: "Alt Tribün" },
      { id: "b2", level: "Üst Tribün" },
      { id: "b3", level: "Alt Tribün" }, // b1 ile AYNI level → AYNI bölüm, ikinci kez EKLENMEZ
    ] };
    const sections = resolvePlanSections(plan);
    expect(sections).toHaveLength(2);
    expect(sections.every((s) => s.parentId === null && s.kind === "floor")).toBe(true);
    expect(sections.map((s) => s.code).sort()).toEqual(["Alt Tribün", "Üst Tribün"]);
    // AYNI level'ı paylaşan iki blok AYNI section id'sini üretmeli (rules.js'teki
    // çakışma kuralının derinlik-1'de eski byLevel gruplamasıyla örtüşmesi buna dayanıyor).
    expect(resolveBlockSectionId(plan.blocks[0])).toBe(resolveBlockSectionId(plan.blocks[2]));
  });
  it("level'sız bloklar (boş dize) da tek bir ortak bölüme düşer, çökmez", () => {
    const plan = { blocks: [{ id: "b1" }, { id: "b2" }] };
    expect(resolvePlanSections(plan)).toHaveLength(1);
  });
  it("kayıtlı bir bölüm (plan.sections) OLDUĞU GİBİ listede yer alır", () => {
    const plan = { sections: [{ id: "sec-x", code: "X Locası", name: "X Locası", kind: "box", parentId: null }], blocks: [] };
    expect(resolvePlanSections(plan)).toEqual(plan.sections);
  });
  it("açık sectionId'si OLAN bir blok, listede karşılığı YOKSA bile sentetik bir düşme (fallback) girişi üretir — çökmez", () => {
    const plan = { blocks: [{ id: "b1", level: "Loca", sectionId: "hayalet-id" }] };
    const sections = resolvePlanSections(plan);
    expect(sections).toEqual([{ id: "hayalet-id", code: "Loca", name: "Loca", kind: "floor", parentId: null }]);
  });
});

/* İki seviyeli bir ağaç: rapor'un motive edici örneği (Batı Tribünü →
   Alt Kat/Üst Kat → H Blok) — AYNI kod (code) FARKLI ebeveyn (parentId)
   altında yaşayabiliyor, bugün (düz level string) bu temsil edilemiyordu. */
describe("resolvePlanSections — iki seviyeli ağaç: aynı kod, farklı ebeveyn", () => {
  it("iki 'H Blok' bölümü FARKLI parentId ile AYNI listede bağımsız yaşar, bloklar doğru olana bağlanır", () => {
    const plan = {
      sections: [
        { id: "bati", code: "Batı Tribünü", name: "Batı Tribünü", kind: "stand", parentId: null },
        { id: "alt-kat", code: "Alt Kat", name: "Alt Kat", kind: "tier", parentId: "bati" },
        { id: "ust-kat", code: "Üst Kat", name: "Üst Kat", kind: "tier", parentId: "bati" },
        { id: "alt-h", code: "H Blok", name: "H Blok", kind: "section", parentId: "alt-kat" },
        { id: "ust-h", code: "H Blok", name: "H Blok", kind: "section", parentId: "ust-kat" },
      ],
      blocks: [
        { id: "b1", label: "H", level: "Alt Kat", sectionId: "alt-h" },
        { id: "b2", label: "H", level: "Üst Kat", sectionId: "ust-h" },
      ],
    };
    const sections = resolvePlanSections(plan);
    expect(sections).toEqual(plan.sections); // hepsi zaten kayıtlı, sentetik EKLEME yok
    const hBloks = sections.filter((s) => s.code === "H Blok");
    expect(hBloks).toHaveLength(2);
    expect(hBloks.map((s) => s.parentId).sort()).toEqual(["alt-kat", "ust-kat"]);
    // aynı `label`i taşıyan iki blok, aynı KOD'lu ama FARKLI id'li iki ayrı bölüme doğru bağlanıyor
    expect(resolveBlockSectionId(plan.blocks[0])).toBe("alt-h");
    expect(resolveBlockSectionId(plan.blocks[1])).toBe("ust-h");
    expect(resolveBlockSectionId(plan.blocks[0])).not.toBe(resolveBlockSectionId(plan.blocks[1]));
  });
});

/* ── Kat/kuşak alanı YOL kabul eder ───────────────────────────────────
   Mimari rapor §5.1 N seviyeli bölüm ağacı istiyor ("Batı Tribünü →
   Alt Kat → H Blok"). Ayrı bir ağaç seçici arayüzü yerine, kat alanına
   "/" ile ayrılmış bir yol yazmak zinciri kuruyor. Düz string yazan
   mevcut 9 salon TEK düğüme çözülüyor — davranışları değişmiyor, bu
   testin ilk vakası onu sabitliyor. */
describe("bölüm yolu", () => {
  const blk = (id, level) => ({ id, label: id, level, kind: "grid",
    x: 0, y: 0, rot: 0, cols: 2, rows: 1, counts: "", align: "center",
    seatGap: 50, rowGap: 90, curve: 0, taper: 0, color: "", attr: "", num: {}, ov: {} });

  it("düz kat adı tek kök düğüme çözülür (bugünkü 9 salonun hali)", () => {
    const secs = resolvePlanSections({ blocks: [blk("A", "Parter")] });
    expect(secs).toHaveLength(1);
    expect(secs[0]).toMatchObject({ code: "Parter", parentId: null });
  });

  it("yol, üst-alt zinciri kurar ve kardeşleri aynı ataya bağlar", () => {
    const secs = resolvePlanSections({ blocks: [
      blk("H", "Batı Tribünü / Alt Kat"), blk("G", "Batı Tribünü / Üst Kat")] });
    const kok = secs.find((s) => s.parentId === null);
    expect(kok.code).toBe("Batı Tribünü");
    const cocuk = secs.filter((s) => s.parentId === kok.id).map((s) => s.code).sort();
    expect(cocuk).toEqual(["Alt Kat", "Üst Kat"]);
  });

  it("aynı kod farklı ata altında yaşayabilir — özelliğin varlık sebebi", () => {
    const secs = resolvePlanSections({ blocks: [
      blk("h1", "Batı / Alt Kat / H"), blk("h2", "Batı / Üst Kat / H")] });
    const hler = secs.filter((s) => s.code === "H");
    expect(hler).toHaveLength(2);
    expect(hler[0].parentId).not.toBe(hler[1].parentId);
  });

  it("farklı yoldaki bloklar farklı bölüme çözülür", () => {
    const a = blk("H", "Batı Tribünü / Alt Kat"), b = blk("G", "Batı Tribünü / Üst Kat");
    expect(resolveBlockSectionId(a)).not.toBe(resolveBlockSectionId(b));
  });
});

/* Açık bölüm kaydı, yoldan TÜRETİLENİ geçersiz kılar — bölüm türünün
   (balcony/box/stand…) kalıcı olabilmesi buna dayanıyor: bölümler kat
   yolundan türetildiği için türü saklayacak başka yer yok, arayüz türü
   seçince plan.sections'a açık kayıt yazıyor. */
describe("açık bölüm kaydı türetilmişi geçersiz kılar", () => {
  const blk = (id, level) => ({ id, label: id, level, kind: "grid",
    x: 0, y: 0, rot: 0, cols: 2, rows: 1, counts: "", align: "center",
    seatGap: 50, rowGap: 90, curve: 0, taper: 0, color: "", attr: "", num: {}, ov: {} });

  it("açık kaydı olan bölüm kendi türünü korur, ötekiler floor kalır", () => {
    const id = syntheticSectionId("1. Balkon");
    const secs = resolvePlanSections({
      sections: [{ id, code: "1. Balkon", name: "1. Balkon", kind: "balcony", parentId: null }],
      blocks: [blk("A", "1. Balkon"), blk("B", "Parter")],
    });
    expect(secs.find((s) => s.code === "1. Balkon").kind).toBe("balcony");
    expect(secs.find((s) => s.code === "Parter").kind).toBe("floor");
  });

  it("açık kayıt bölümü ikiye katlamaz", () => {
    const id = syntheticSectionId("Loca");
    const secs = resolvePlanSections({
      sections: [{ id, code: "Loca", name: "Loca", kind: "box", parentId: null }],
      blocks: [blk("A", "Loca"), blk("B", "Loca")],
    });
    expect(secs.filter((s) => s.id === id)).toHaveLength(1);
  });
});
