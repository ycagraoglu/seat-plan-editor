import { describe, it, expect } from "vitest";
import { linearArray, radialArray } from "../../src/core/arrays.js";

/* ÖNEMLİ KONVANSİYON: `count` DİZİDEKİ TOPLAM öğe sayısıdır, orijinal blok
   DAHİL. linearArray/radialArray orijinali ÜRETMEZ (çağıran zaten elinde
   tutuyor) — sadece kalan (count-1) KOPYAYI döner. builders.js'teki her
   çağrı bu sözleşmeye göre `[seed, ...linearArray(seed, {count, ...})]`
   şeklinde birleştiriyor (bkz. bowl()). Bu test o sözleşmeyi sabitliyor. */
describe("linearArray/radialArray — count = TOPLAM öğe sayısı (orijinal dahil)", () => {
  it("linearArray(count=3) sadece 2 kopya üretir (orijinal hariç)", () => {
    const seed = [{ id: "seed", label: "A", x: 0, y: 0, rot: 0 }];
    const extra = linearArray(seed, { count: 3, dx: 100, dy: 0 });
    expect(extra).toHaveLength(2);
    expect(extra.map((b) => b.x)).toEqual([100, 200]);
    expect(extra.every((b) => b.y === 0 && b.rot === 0)).toBe(true);
  });

  it("linearArray(count=1) hiç kopya üretmez (dizideki TEK öğe zaten orijinal)", () => {
    const seed = [{ id: "seed", label: "A", x: 0, y: 0, rot: 0 }];
    expect(linearArray(seed, { count: 1, dx: 100, dy: 0 })).toHaveLength(0);
  });

  it("radialArray(count=4) sadece 3 kopya üretir, her biri step kadar döner", () => {
    const seed = [{ id: "seed", label: "A", x: 100, y: 0, rot: 0 }];
    const extra = radialArray(seed, { count: 4, cx: 0, cy: 0, step: 90 });
    expect(extra).toHaveLength(3);
    // (100,0) merkez etrafında 90° dönünce (0,100) olur; rot da 90 artar.
    expect(extra[0].x).toBeCloseTo(0, 6);
    expect(extra[0].y).toBeCloseTo(100, 6);
    expect(extra[0].rot).toBe(90);
    expect(extra[1].rot).toBe(180);
    expect(extra[2].rot).toBe(270);
  });

  it("çok bloklu bir tohum: her kopya TÜM bloklar için birden üretilir (step = blocks.length)", () => {
    const seed = [
      { id: "s1", label: "A", x: 0, y: 0, rot: 0 },
      { id: "s2", label: "B", x: 10, y: 0, rot: 0 },
    ];
    const extra = linearArray(seed, { count: 2, dx: 50, dy: 0 });
    expect(extra).toHaveLength(2); // 1 kopya × 2 blok
    expect(extra.map((b) => b.x)).toEqual([50, 60]);
  });
});
