import { describe, it, expect } from "vitest";
import { parseCounts, countAt, prep, offsetFor, footprintPad, tableCells,
  SEAT_KINDS, DEF, DEFAULT_SEAT_KIND, seatKindWidth, legacyAtToKind, resolveSeatKind, buildSeats }
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
