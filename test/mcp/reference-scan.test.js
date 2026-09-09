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

  it("satırın ortasındaki geniş etiket boşluğunu iki blok sanmaz", () => {
    const seats = [10, 20, 30, 80, 90, 100].map((x) => ({ x, y: 25, w: 7, h: 7 }));
    const scan = scanPixels(raster(120, 60, seats));

    expect(scan.rows).toHaveLength(1);
    expect(scan.rows[0].seats).toHaveLength(6);
  });

  it("yatay salon sıralarıyla dikey yan balkonları birbirine karıştırmaz", () => {
    const canvas = createCanvas(450, 300), ctx = canvas.getContext("2d");
    ctx.fillStyle = "#fff"; ctx.fillRect(0, 0, 450, 300);
    const colors = ["#9ca3af", "#111827", "#14b8a6", "#ef4444"];
    let seatCount = 0;
    const seat = (cx, cy, i) => {
      ctx.fillStyle = colors[i % colors.length];
      ctx.beginPath(); ctx.arc(cx, cy, 5, 0, Math.PI * 2); ctx.fill(); seatCount++;
    };
    for (let r = 0; r < 18; r++) for (const start of [80, 185, 290]) for (let c = 0; c < 7; c++) {
      if (!(c === 3 && r % 5 === 0)) seat(start + c * 12 + ((r + c) % 3 === 0 ? 1 : 0),
        20 + r * 12 + ((r + c) % 5 === 0 ? 1 : 0), r + c);
    }
    for (const x of [20, 425]) for (let r = 0; r < 14; r++) seat(x, 20 + r * 12 + (r % 4 === 0 ? 1 : 0), r);

    const scan = scanPixels(ctx.getImageData(0, 0, 450, 300));

    expect(scan.seatCount).toBe(seatCount);
    expect(scan.rows).toHaveLength(20);
    expect(scan.rows.filter((row) => Math.abs(row.angle) > 80)).toHaveLength(2);
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

  it("farklı boyut ve renkteki koltuk kümelerini birlikte sayar", () => {
    const rects = [];
    for (let x = 20; x < 100; x += 16) rects.push({ x, y: 25, w: 8, h: 7, color: [30, 120, 210] });
    for (let x = 120; x < 220; x += 20) rects.push({ x, y: 25, w: 12, h: 10, color: [210, 80, 130] });
    const scan = scanPixels(raster(260, 80, rects));
    expect(scan.seatCount).toBe(rects.length);
    expect(scan.clusters).toBeGreaterThan(1);
  });

  it("büyük düzenli planda tarama süresi koltuk sayısıyla patlamaz", () => {
    const rects = [];
    for (let r = 0; r < 60; r++) for (let c = 0; c < 80; c++)
      rects.push({ x: 10 + c * 10, y: 10 + r * 10, w: 5, h: 5 });
    const t0 = performance.now();
    const scan = scanPixels(raster(840, 640, rects));
    expect(scan.seatCount).toBe(rects.length);
    expect(performance.now() - t0).toBeLessThan(1500);
  });

  it("yerel OCR sahne/perde metnini bbox ve confidence ile çıkarır", () => {
    const canvas = createCanvas(260, 110), ctx = canvas.getContext("2d");
    ctx.fillStyle = "#fff"; ctx.fillRect(0, 0, 260, 110);
    ctx.fillStyle = "#111827"; ctx.font = "bold 28px Arial"; ctx.fillText("SAHNE", 70, 35);
    ctx.fillStyle = "#2563eb";
    for (let i = 0; i < 5; i++) ctx.fillRect(50 + i * 20, 70, 9, 7);
    const scan = scanPixels(ctx.getImageData(0, 0, 260, 110));
    expect(scan.ocr?.[0]).toMatchObject({ text: "SAHNE", confidence: expect.any(Number), bbox: expect.any(Object) });
    expect(scan.focalCandidates[0]).toMatchObject({ type: "stage", label: "SAHNE" });
  });

  it("döndürülmüş/düzensiz büyük kaynakta n² tarama patlaması yapmaz", () => {
    const run = (rows, cols, size) => {
      const canvas = createCanvas(size, size), ctx = canvas.getContext("2d");
      ctx.fillStyle = "#fff"; ctx.fillRect(0, 0, size, size);
      ctx.fillStyle = "#2563eb";
      ctx.translate(size / 2, size / 2); ctx.rotate(17 * Math.PI / 180); ctx.translate(-size / 2, -size / 2);
      let count = 0;
      for (let r = 0; r < rows; r++) for (let c = 0; c < cols; c++) {
        if ((r + c) % 17 === 0) continue;
        ctx.fillRect(80 + c * 10 + (r % 3), 120 + r * 10, 5, 5);
        count++;
      }
      const t0 = performance.now();
      const scan = scanPixels(ctx.getImageData(0, 0, size, size));
      return { elapsed: performance.now() - t0, scan, count };
    };
    const small = run(60, 70, 1000);
    const large = run(80, 90, 1200);
    expect(large.scan.seatCount).toBeGreaterThan(large.count * 0.97);
    expect(large.elapsed / small.elapsed).toBeLessThan(3.8);
  }, 12_000);

  it("PDF sayfa sınırını dosyayı rasterize etmeden uygular", async () => {
    const dir = await mkdtemp(path.join(tmpdir(), "seat-scan-"));
    try {
      const file = path.join(dir, "x.pdf");
      await writeFile(file, "%PDF-1.4");
      await expect(scanReference(file, 21)).rejects.toThrow(/1\.\.20/);
    } finally { await rm(dir, { recursive: true, force: true }); }
  });
});
