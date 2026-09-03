import { describe, it, expect } from "vitest";
import { offsetPoly, inPoly, outlineOverlapArea } from "../../src/core/polygon.js";

describe("offsetPoly — poligonu dış normali boyunca büyütme", () => {
  it("100x100 kareyi 10cm dışa büyütür: her köşe 10cm dışarı kayar", () => {
    const sq = [{ x: 0, y: 0 }, { x: 100, y: 0 }, { x: 100, y: 100 }, { x: 0, y: 100 }];
    const grown = offsetPoly(sq, 10);
    expect(grown).toEqual([
      { x: -10, y: -10 }, { x: 110, y: -10 }, { x: 110, y: 110 }, { x: -10, y: 110 },
    ]);
  });
  it("d=0 ya da <3 noktalı poligonda dokunmadan döner", () => {
    const sq = [{ x: 0, y: 0 }, { x: 100, y: 0 }, { x: 100, y: 100 }, { x: 0, y: 100 }];
    expect(offsetPoly(sq, 0)).toBe(sq);
    const line = [{ x: 0, y: 0 }, { x: 10, y: 10 }];
    expect(offsetPoly(line, 5)).toBe(line);
  });
});

describe("inPoly — ışın atma ile içerde mi testi", () => {
  const sq = [{ x: 0, y: 0 }, { x: 100, y: 0 }, { x: 100, y: 100 }, { x: 0, y: 100 }];
  it("merkez içeride", () => expect(inPoly(50, 50, sq)).toBe(true));
  it("dışarıdaki nokta dışarıda", () => expect(inPoly(150, 150, sq)).toBe(false));
  it("boş poligon listesiyle asla true dönmez", () => expect(inPoly(0, 0, [])).toBe(false));
});

describe("outlineOverlapArea — iki dış hattın kesişim alanı", () => {
  it("yarı yarıya binen iki 100x100 kare: kesişim tam 50x50=2500cm²", () => {
    const A = [{ x: 0, y: 0 }, { x: 100, y: 0 }, { x: 100, y: 100 }, { x: 0, y: 100 }];
    const B = [{ x: 50, y: 50 }, { x: 150, y: 50 }, { x: 150, y: 150 }, { x: 50, y: 150 }];
    expect(outlineOverlapArea(A, B)).toBeCloseTo(2500, 6);
  });
  it("birbirinden uzak iki kare: 0 (bbox ön elemesi devreye girer)", () => {
    const A = [{ x: 0, y: 0 }, { x: 100, y: 0 }, { x: 100, y: 100 }, { x: 0, y: 100 }];
    const C = [{ x: 200, y: 200 }, { x: 300, y: 200 }, { x: 300, y: 300 }, { x: 200, y: 300 }];
    expect(outlineOverlapArea(A, C)).toBe(0);
  });
  it("sadece kenarı değen (kesişim alanı sıfır) iki kare: 0", () => {
    const A = [{ x: 0, y: 0 }, { x: 100, y: 0 }, { x: 100, y: 100 }, { x: 0, y: 100 }];
    const D = [{ x: 100, y: 0 }, { x: 200, y: 0 }, { x: 200, y: 100 }, { x: 100, y: 100 }];
    expect(outlineOverlapArea(A, D)).toBe(0);
  });
});
