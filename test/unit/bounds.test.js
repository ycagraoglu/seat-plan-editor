import { describe, expect, it } from "vitest";
import { extent, pointBounds } from "../../src/core/bounds.js";

describe("büyük kaynak sınır hesabı", () => {
  it("100.000 öğeyi argüman spread kullanmadan hesaplar", () => {
    const points = Array.from({ length: 100_000 }, (_, i) => ({ x: i, y: 100_000 - i }));
    expect(extent(points, (p) => p.x)).toEqual({ min: 0, max: 99_999 });
    expect(pointBounds(points)).toEqual({ x0: 0, x1: 99_999, y0: 1, y1: 100_000 });
  });
});
