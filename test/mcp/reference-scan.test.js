import { describe, expect, it } from "vitest";
import { createCanvas } from "@napi-rs/canvas";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { scanPixels, scanReference } from "../../mcp/reference-scan.mjs";

const raster = (width, height, rects) => {
  const data = new Uint8ClampedArray(width * height * 4).fill(255);
  for (const { x, y, w, h, color = [25, 90, 180] } of rects) {
    for (let py = y; py < y + h; py++) for (let px = x; px < x + w; px++) {
      const i = (py * width + px) * 4;
      [data[i], data[i + 1], data[i + 2], data[i + 3]] = [...color, 255];
    }
  }
  return { width, height, data };
};

describe("yerel referans tarayıcı", () => {
  it("tekrarlanan koltukları sıralara ayırıp büyük dekoratif şekli eler", () => {
    const seats = [];
    for (const y of [30, 55]) for (let x = 20; x <= 100; x += 20) {
      seats.push({ x, y, w: 9, h: 7 });
    }
    const scan = scanPixels(raster(140, 100, [
      { x: 10, y: 5, w: 110, h: 10, color: [100, 100, 100] },
      ...seats,
    ]));

    expect(scan.seatCount).toBe(10);
    expect(scan.rows.map((row) => row.seats.length)).toEqual([5, 5]);
    expect(scan.rows.every((row) => row.confidence >= 0.97)).toBe(true);
  });

  it("diyagonal bir koltuk sırasını tek segment olarak ölçer", () => {
    const seats = Array.from({ length: 6 }, (_, i) => ({
      x: 15 + i * 18, y: 15 + i * 7, w: 8, h: 6,
    }));
    const scan = scanPixels(raster(130, 75, seats));

    expect(scan.rows).toHaveLength(1);
    expect(scan.rows[0].seats).toHaveLength(6);
    expect(scan.rows[0].angle).toBeCloseTo(21.3, 0);
  });

  it("düzensiz aralıklı sırayı needsReview yapar", () => {
    const seats = [10, 28, 46, 88, 106].map((x) => ({ x, y: 25, w: 8, h: 6 }));
    const scan = scanPixels(raster(130, 60, seats));

    expect(scan.rows).toHaveLength(1);
    expect(scan.rows[0].needsReview).toBe(true);
    expect(scan.needsReview).toEqual([scan.rows[0].rowId]);
  });

  it("kavisli sırayı ortak merkez ve yarıçapla tanır", () => {
    const seats = Array.from({ length: 9 }, (_, i) => {
      const a = (-40 + i * 10) * Math.PI / 180;
      return { x: Math.round(100 + 75 * Math.sin(a)) - 4,
        y: Math.round(10 + 75 * Math.cos(a)) - 3, w: 8, h: 6 };
    });
    const scan = scanPixels(raster(200, 110, seats));
    expect(scan.rows).toHaveLength(1);
    expect(scan.rows[0].geometry).toBe("arc");
    expect(scan.rows[0].arc.r).toBeCloseTo(75, -1);
  });

  it("düşük kontrastlı ve sıkıştırılmış JPEG koltuklarını sayar", async () => {
    const dir = await mkdtemp(path.join(tmpdir(), "seat-scan-"));
    try {
      const file = path.join(dir, "low.jpg"), canvas = createCanvas(180, 80), ctx = canvas.getContext("2d");
      ctx.fillStyle = "#f7f7f7"; ctx.fillRect(0, 0, 180, 80);
      for (let i = 0; i < 7; i++) {
        ctx.fillStyle = i === 3 ? "#b7a8b5" : "#b2b2b2";
        ctx.fillRect(20 + i * 20, 30, 9, 7);
      }
      await writeFile(file, canvas.toBuffer("image/jpeg", 55));
      const scan = await scanReference(file);
      expect(scan.seatCount).toBe(7);
      expect(scan.rows).toHaveLength(1);
    } finally { await rm(dir, { recursive: true, force: true }); }
  });

  it("PDF sayfa sınırını dosyayı rasterize etmeden uygular", async () => {
    const dir = await mkdtemp(path.join(tmpdir(), "seat-scan-"));
    try {
      const file = path.join(dir, "x.pdf");
      await writeFile(file, "%PDF-1.4");
      await expect(scanReference(file, 21)).rejects.toThrow(/1\.\.20/);
    } finally { await rm(dir, { recursive: true, force: true }); }
  });
});
