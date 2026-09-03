import { describe, it, expect } from "vitest";
import { parseCounts, countAt, prep, offsetFor, footprintPad, tableCells }
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
