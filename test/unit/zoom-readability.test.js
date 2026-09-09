import { describe, it, expect } from "vitest";
import { koltukNumarasiGoster, okunurlukZoomPct, okunurGorunumGenisligi, okunurZoomKisayolu } from "../../src/PlanEditor.jsx";
import { newGrid } from "../../src/PlanEditor.jsx";
import { buildMeta, buildSeats } from "../../src/core/geometry.js";

it("sıra etiketlerini taşınmış gerçek koltukların dışına yerleştirir", () => {
  const b = newGrid(0, 0, 3, 2);
  b.ov = { "0,0": { rm: true }, "0,1": { dx: 500, dy: 100 }, "0,2": { dx: 600, dy: 100 } };
  const { seats, labels } = buildSeats(b, buildMeta(b), "{seat}");
  const row = seats.filter(s => s.r === 0);
  expect(labels[0].x).toBeLessThan(Math.min(...row.map(s => s.x)));
  expect(labels[1].x).toBeGreaterThan(Math.max(...row.map(s => s.x)));
  expect(labels[0].y).toBe(row[0].y);
});

describe("zoom okunabilirliği", () => {
  it("yaklaşık 12 piksellik koltukta numarayı gösterir", () => {
    expect(koltukNumarasiGoster(12 / 41)).toBe(true);
  });

  it("%100, sığdırma değil okunabilir koltuk genişliğidir", () => {
    expect(okunurlukZoomPct(32 / 41)).toBe(100);
  });

  it("%100 zoom için görünüm genişliğini koltuk pikselinden hesaplar", () => {
    expect(okunurGorunumGenisligi(1200)).toBe(1538);
  });

  it("0 tuşunu okunabilir %100 zoom kısayolu yapar", () => {
    expect(okunurZoomKisayolu("0")).toBe(true);
    expect(okunurZoomKisayolu("+")).toBe(false);
  });
});
