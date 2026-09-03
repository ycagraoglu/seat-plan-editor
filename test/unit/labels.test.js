import { describe, it, expect } from "vitest";
import { letterLabel, rowLabel, numberRow, DEF_NUM } from "../../src/core/labels.js";

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
