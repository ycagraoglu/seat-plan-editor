import { describe, it, expect } from "vitest";
import { letterLabel, rowLabel, numberRow, DEF_NUM,
  freeLabel, reLabel, relevelPatch } from "../../src/core/labels.js";

describe("letterLabel — harfle sıra adı, I/O/Q atlama", () => {
  it("skipAmbig=false: standart alfabe, i=8 -> I", () => {
    expect(letterLabel(8, false)).toBe("I");
  });
  it("skipAmbig=true: I/O/Q alfabeden çıkar, aynı indeks (8) artık J'ye denk gelir", () => {
    expect(letterLabel(8, true)).toBe("J");
  });
  it("i=0 her zaman A", () => {
    expect(letterLabel(0, true)).toBe("A");
    expect(letterLabel(0, false)).toBe("A");
  });
  it("23-harfli (I/O/Q'suz) alfabe dolunca AA'ya sarar", () => {
    expect(letterLabel(23, true)).toBe("AA");
  });
});

describe("rowLabel — sıra etiketi", () => {
  it("letter şeması letterLabel'i rowStart ofsetiyle kullanır", () => {
    expect(rowLabel({ rowScheme: "letter", rowStart: 1, skipAmbig: true, rowRev: false }, 0, 5)).toBe("A");
  });
  it("custom şeması virgülle ayrılmış listeden indeksler", () => {
    expect(rowLabel({ rowScheme: "custom", rowCustom: "AA,BB,CC", rowRev: false }, 1, 3)).toBe("BB");
  });
  it("numeric (varsayılan) şema idx+rowStart döner", () => {
    expect(rowLabel({ rowScheme: "number", rowStart: 1, rowRev: false }, 2, 5)).toBe("3");
  });
  it("rowRev=true indeksleri ters çevirir (son sıra ilk etiketi alır)", () => {
    expect(rowLabel({ rowScheme: "number", rowStart: 1, rowRev: true }, 0, 5)).toBe("5");
  });
});

describe("numberRow — koltuk numaralandırma", () => {
  const flags5 = [0, 1, 2, 3, 4].map((ci) => ({ rm: false, gap: false, ci }));

  it("seq + ltr: soldan sağa 1,2,3,4,5", () => {
    expect(numberRow(flags5, { ...DEF_NUM }, 5)).toEqual({ 0: 1, 1: 2, 2: 3, 3: 4, 4: 5 });
  });
  it("seq + rtl: sağdan sola aynı sayı dizisi ters seatlere dağılır", () => {
    expect(numberRow(flags5, { ...DEF_NUM, seatDir: "rtl" }, 5)).toEqual({ 0: 5, 1: 4, 2: 3, 3: 2, 4: 1 });
  });
  it("gap bir sayı YER — atlanan koltuk çıktıda yok ama sayaç ilerler (2 hiç kullanılmaz)", () => {
    const flags = [{ rm: false, gap: false, ci: 0 }, { rm: false, gap: true, ci: 1 }, { rm: false, gap: false, ci: 2 }];
    expect(numberRow(flags, { ...DEF_NUM }, 3)).toEqual({ 0: 1, 2: 3 });
  });
  it('anchor:"column" + rtl + even + seatStart: sıra sırasından değil SÜTUN indeksinden numaralanır (Zorlu "Çift" bloklarının gerçek konvansiyonu)', () => {
    // nCift(): { seatScheme:"even", seatDir:"rtl", seatStart:102, anchor:"column" }
    expect(numberRow(flags5, { ...DEF_NUM, seatScheme: "even", seatDir: "rtl", seatStart: 102, anchor: "column" }, 5))
      .toEqual({ 0: 110, 1: 108, 2: 106, 3: 104, 4: 102 });
  });
  it("skip listesindeki sayılar atlanır (uğursuz numara vb.)", () => {
    expect(numberRow(flags5, { ...DEF_NUM, skip: "2" }, 5)).toEqual({ 0: 1, 1: 3, 2: 4, 3: 5, 4: 6 });
  });
});

/* HATA 1: Salon şablonunda D'yi çoğaltınca kopya D (hiç artmıyor), radyal
   çoğaltta ise D+3=E/F alıyordu — parterde ZATEN kullanılan harfler. */
describe("freeLabel — incLabel'i döngüye sokup planda KULLANILMAYAN ilk etiketi bulur", () => {
  it("çakışma yoksa incLabel ile birebir aynı sonucu verir", () => {
    expect(freeLabel("A", 1, new Set())).toBe("B");
  });
  it("hedef zaten kullanılmışsa boş bir tane bulana dek birer birer ilerler", () => {
    // D+1=E (kullanımda), E+1=F (kullanımda), F+1=G (boş)
    expect(freeLabel("D", 1, new Set(["D", "E", "F"]))).toBe("G");
  });
  it("sayısal etiketlerde de aynı şekilde çalışır", () => {
    expect(freeLabel("3", 1, new Set(["4", "5"]))).toBe("6");
  });
});

describe("reLabel — YENİ blok üretirken adlandırma relabelPatch'le TUTARLI", () => {
  it("kaynağın adı hâlâ otomatikse (level · label) yeni etikete göre günceller", () => {
    const b = { label: "D", level: "Salon", name: "Salon · D", x: 0, y: 0 };
    const cp = reLabel(b, "G");
    expect(cp.label).toBe("G");
    expect(cp.name).toBe("Salon · G");
  });
  it("kaynağın adı elle özelleştirilmişse kopya da AYNEN miras alır, ezilmez", () => {
    const b = { label: "D", level: "Salon", name: "VIP Loca", x: 0, y: 0 };
    const cp = reLabel(b, "G");
    expect(cp.label).toBe("G");
    expect(cp.name).toBe("VIP Loca");
  });
  it("sayısal alanları hâlâ 4 ondalığa yuvarlar (eski davranış korunuyor)", () => {
    const cp = reLabel({ label: "A", level: "", name: "A", x: 1.123456789, rot: 45.00001234 }, "B");
    expect(cp.x).toBeCloseTo(1.1235, 4);
    expect(cp.rot).toBeCloseTo(45, 4);
  });
});

/* HATA 2: bloğun "Kat / kuşak" alanı değiştirilince ağaçtaki ad eski katta
   takılı kalıyordu — relabelPatch label için yapıyordu, level için eşdeğeri
   yoktu. relevelPatch bunun simetriği. */
describe("relevelPatch — relabelPatch'in KAT alanı için simetriği", () => {
  it("ad hâlâ otomatik türetilmişse (level · label) yeni kata göre günceller", () => {
    const b = { label: "D", level: "Salon", name: "Salon · D" };
    expect(relevelPatch(b, "Balkon")).toEqual({ level: "Balkon", name: "Balkon · D" });
  });
  it("kullanıcının ELLE yazdığı ad KORUNUR, ezilmez", () => {
    const b = { label: "D", level: "Salon", name: "VIP Loca" };
    expect(relevelPatch(b, "Balkon")).toEqual({ level: "Balkon" });
  });
  it("ad hiç yoksa (yeni blok) otomatik türetir", () => {
    const b = { label: "D", level: "Salon", name: "" };
    expect(relevelPatch(b, "Balkon")).toEqual({ level: "Balkon", name: "Balkon · D" });
  });
});

/* ══════════════════════════════════════════════════════════════════════════
   ORTADAN TEK/ÇİFT BÖLÜNEN SIRA — iki AYRI gelenek

   Gerçek bir plan (Ege Ü. AKM Tiyatro Salonu, 340 koltuk) soğuk bir LLM'e
   verildiğinde ortaya çıktı: model bu düzeni ifade edemedi, sırayı iki
   bloğa bölmek zorunda kaldı ve aradaki koltuk aralığı SAHTE bir "dar
   geçit" hatası doğurdu — yani araç, olmayan bir orta geçidi olan bir
   salon tarif ediyordu.

   İkisi de gerçek ve karıştırılırsa biletin koltuğu yanlış yeri gösterir.
   ══════════════════════════════════════════════════════════════════════════ */
describe("center / center-in — 17 koltuklu sıra", () => {
  const diz = (sema) => {
    const bayrak = Array.from({ length: 17 }, () => ({}));
    const r = numberRow(bayrak, { ...DEF_NUM, seatScheme: sema }, 17);
    return Object.keys(r).sort((a, b) => a - b).map((k) => r[k]);
  };

  it("center: 1 ve 2 MERKEZDE, numara duvarlara doğru büyür", () => {
    expect(diz("center")).toEqual([18, 16, 14, 12, 10, 8, 6, 4, 2, 3, 5, 7, 9, 11, 13, 15, 17]);
  });

  it("center-in: 1 ve 2 DUVARLARDA, numara merkeze doğru büyür", () => {
    /* Ege Ü. AKM Tiyatro Salonu'nun resmî planındaki dizinin BİREBİR aynısı. */
    expect(diz("center-in")).toEqual([2, 4, 6, 8, 10, 12, 14, 16, 18, 15, 13, 11, 9, 7, 5, 3, 1]);
  });

  it("ikisi birbirinin aynısı DEĞİL — karıştırmak bileti yanlış koltuğa gönderir", () => {
    expect(diz("center")).not.toEqual(diz("center-in"));
  });

  it("her iki şema da tek sayıda koltukta tam sıra üretir (boşluk bırakmaz)", () => {
    ["center", "center-in"].forEach((s) => {
      const d = diz(s);
      expect(d).toHaveLength(17);
      expect(new Set(d).size).toBe(17);        /* numara tekrarı yok */
    });
  });
});
