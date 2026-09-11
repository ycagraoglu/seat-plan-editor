import { readFile, stat } from "node:fs/promises";
import path from "node:path";
import { createCanvas, loadImage } from "@napi-rs/canvas";

const MAX_BYTES = 25 * 1024 * 1024;
const MAX_PIXELS = 40_000_000;
const MAX_PDF_PAGE = 20;

const median = (xs) => {
  const a = [...xs].sort((x, y) => x - y);
  return a.length ? (a[(a.length - 1) >> 1] + a[a.length >> 1]) / 2 : 0;
};
const round = (n, d = 3) => +n.toFixed(d);

function components({ data, width, height }) {
  const corners = [[0, 0], [width - 1, 0], [0, height - 1], [width - 1, height - 1]];
  const bg = [0, 1, 2].map((c) => median(corners.map(([x, y]) => data[(y * width + x) * 4 + c])));
  const seen = new Uint8Array(width * height);
  const foreground = (p) => data[p * 4 + 3] > 20
    && Math.hypot(data[p * 4] - bg[0], data[p * 4 + 1] - bg[1], data[p * 4 + 2] - bg[2]) > 28;
  const out = [];
  for (let start = 0; start < width * height; start++) {
    if (seen[start] || !foreground(start)) continue;
    const stack = [start];
    seen[start] = 1;
    let x0 = width, y0 = height, x1 = 0, y1 = 0, area = 0;
    while (stack.length) {
      const p = stack.pop(), x = p % width, y = (p / width) | 0;
      x0 = Math.min(x0, x); y0 = Math.min(y0, y); x1 = Math.max(x1, x); y1 = Math.max(y1, y); area++;
      for (const q of [p - 1, p + 1, p - width, p + width]) {
        if (q < 0 || q >= seen.length || seen[q] || !foreground(q)) continue;
        if ((q === p - 1 || q === p + 1) && ((q / width) | 0) !== y) continue;
        seen[q] = 1; stack.push(q);
      }
    }
    const w = x1 - x0 + 1, h = y1 - y0 + 1;
    if (area >= 6) out.push({ x: x0, y: y0, w, h, area, cx: x0 + w / 2, cy: y0 + h / 2 });
  }
  return out;
}

function seatCandidates(parts, width, height) {
  const usable = parts.filter((p) => p.w <= width * 0.12 && p.h <= height * 0.12);
  const clusters = [];
  for (const p of usable) {
    let c = clusters.find((x) => Math.abs(x.w - p.w) <= Math.max(2, x.w * 0.28)
      && Math.abs(x.h - p.h) <= Math.max(2, x.h * 0.28));
    if (!c) clusters.push(c = { w: p.w, h: p.h, parts: [] });
    c.parts.push(p);
    c.w = median(c.parts.map((x) => x.w)); c.h = median(c.parts.map((x) => x.h));
  }
  return (clusters.sort((a, b) => b.parts.length - a.parts.length)[0]?.parts || [])
    .filter((p) => p.area >= p.w * p.h * 0.35);
}

function dominantAngle(seats) {
  if (seats.length < 2) return 0;
  const angles = seats.map((a) => {
    let best = null;
    for (const b of seats) {
      if (a === b) continue;
      const d = Math.hypot(b.cx - a.cx, b.cy - a.cy);
      if (!best || d < best.d) best = { d, a: Math.atan2(b.cy - a.cy, b.cx - a.cx) };
    }
    let angle = best.a;
    if (angle < -Math.PI / 2) angle += Math.PI;
    if (angle >= Math.PI / 2) angle -= Math.PI;
    return angle;
  });
  return median(angles);
}

const angleDistance = (a, b) => {
  let d = Math.abs(a - b) % Math.PI;
  return Math.min(d, Math.PI - d);
};

function seatRows(seats) {
  if (!seats.length) return [];
  const local = seats.map((a) => {
    let best = null;
    seats.forEach((b) => {
      if (a === b) return;
      const d = Math.hypot(b.cx - a.cx, b.cy - a.cy);
      if (!best || d < best.d) best = { d, angle: Math.atan2(b.cy - a.cy, b.cx - a.cx) };
    });
    let angle = best?.angle || 0;
    if (angle < -Math.PI / 2) angle += Math.PI;
    if (angle >= Math.PI / 2) angle -= Math.PI;
    return { distance: best?.d || 0, angle };
  });
  const pitch = median(local.map((x) => x.distance).filter(Boolean));
  const parent = seats.map((_, i) => i);
  const root = (i) => parent[i] === i ? i : (parent[i] = root(parent[i]));
  const join = (a, b) => { a = root(a); b = root(b); if (a !== b) parent[b] = a; };
  for (let i = 0; i < seats.length; i++) for (let j = i + 1; j < seats.length; j++) {
    const dx = seats[j].cx - seats[i].cx, dy = seats[j].cy - seats[i].cy;
    const d = Math.hypot(dx, dy), angle = Math.atan2(dy, dx);
    if (d <= pitch * 3 && angleDistance(angle, local[i].angle) < 0.48
      && angleDistance(angle, local[j].angle) < 0.48) join(i, j);
  }
  const groups = new Map();
  seats.forEach((seat, i) => {
    const key = root(i);
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key).push(seat);
  });
  return [...groups.values()].map((row) => {
    const angle = dominantAngle(row), cos = Math.cos(angle), sin = Math.sin(angle);
    return row.map((s) => ({ ...s, along: s.cx * cos + s.cy * sin,
      across: -s.cx * sin + s.cy * cos })).sort((a, b) => a.along - b.along);
  });
}

function fitArc(seats) {
  if (seats.length < 5) return null;
  const a = seats[0], b = seats[(seats.length / 2) | 0], c = seats.at(-1);
  const d = 2 * (a.cx * (b.cy - c.cy) + b.cx * (c.cy - a.cy) + c.cx * (a.cy - b.cy));
  if (Math.abs(d) < 1e-6) return null;
  const aa = a.cx ** 2 + a.cy ** 2, bb = b.cx ** 2 + b.cy ** 2, cc = c.cx ** 2 + c.cy ** 2;
  const cx = (aa * (b.cy - c.cy) + bb * (c.cy - a.cy) + cc * (a.cy - b.cy)) / d;
  const cy = (aa * (c.cx - b.cx) + bb * (a.cx - c.cx) + cc * (b.cx - a.cx)) / d;
  const r = Math.hypot(a.cx - cx, a.cy - cy);
  const residual = median(seats.map((s) => Math.abs(Math.hypot(s.cx - cx, s.cy - cy) - r)));
  const chord = Math.hypot(c.cx - a.cx, c.cy - a.cy);
  const sag = chord ? Math.abs((c.cy - a.cy) * b.cx - (c.cx - a.cx) * b.cy + c.cx * a.cy - c.cy * a.cx) / chord : 0;
  const size = median(seats.map((s) => Math.min(s.w, s.h)));
  if (residual > Math.max(1.5, size * 0.3) || sag < size * 0.6) return null;
  return { cx: round(cx), cy: round(cy), r: round(r), residual: round(residual) };
}

export function scanPixels(image) {
  const parts = components(image);
  const seats = seatCandidates(parts, image.width, image.height);
  const groups = seatRows(seats);
  const rows = groups.map((row, i) => {
    const angle = dominantAngle(row), tolerance = Math.max(2,
      median(row.map((s) => Math.min(s.w, s.h))) * 0.6);
    const across = median(row.map((s) => s.across));
    const arc = fitArc(row);
    const gaps = row.slice(1).map((s, n) => Math.hypot(s.cx - row[n].cx, s.cy - row[n].cy));
    const pitch = median(gaps);
    const cv = gaps.length && pitch ? Math.sqrt(gaps.reduce((n, g) => n + (g - pitch) ** 2, 0) / gaps.length) / pitch : 1;
    const residual = arc ? arc.residual : median(row.map((s) => Math.abs(s.across - across)));
    const confidence = Math.max(0, Math.min(1, 1 - cv * 0.7 - residual / Math.max(1, tolerance) * 0.15
      - (row.length < 3 ? 0.5 : 0)));
    const x0 = Math.min(...row.map((s) => s.x)), y0 = Math.min(...row.map((s) => s.y));
    const x1 = Math.max(...row.map((s) => s.x + s.w)), y1 = Math.max(...row.map((s) => s.y + s.h));
    return {
      rowId: `row-${i + 1}`,
      seats: row.map((s, n) => ({ id: `row-${i + 1}-seat-${n + 1}`, x: round(s.cx), y: round(s.cy),
        bbox: { x: s.x, y: s.y, w: s.w, h: s.h } })),
      bbox: { x: x0, y: y0, w: x1 - x0, h: y1 - y0 },
      angle: round(angle * 180 / Math.PI, 2), medianGap: round(pitch),
      geometry: arc ? "arc" : "line", ...(arc ? { arc } : {}),
      confidence: round(confidence), needsReview: confidence < 0.97,
    };
  }).sort((a, b) => a.bbox.y - b.bbox.y || a.bbox.x - b.bbox.x)
    .map((r, i) => ({ ...r, rowId: `row-${i + 1}`,
      seats: r.seats.map((s, n) => ({ ...s, id: `row-${i + 1}-seat-${n + 1}` })) }));
  return { width: image.width, height: image.height, seatCount: rows.reduce((n, r) => n + r.seats.length, 0),
    rows, needsReview: rows.filter((r) => r.needsReview).map((r) => r.rowId) };
}

async function decode(pathname, page = 1) {
  const info = await stat(pathname);
  if (info.size > MAX_BYTES) throw new Error("Referans dosyası 25 MB sınırını aşıyor.");
  const ext = path.extname(pathname).toLowerCase();
  let canvas;
  if (ext === ".pdf") {
    if (page < 1 || page > MAX_PDF_PAGE) throw new Error("PDF sayfası 1..20 arasında olmalı.");
    const pdfjs = await import("pdfjs-dist/legacy/build/pdf.mjs");
    const doc = await pdfjs.getDocument({ data: new Uint8Array(await readFile(pathname)), disableWorker: true }).promise;
    if (page > doc.numPages) throw new Error(`PDF yalnız ${doc.numPages} sayfa.`);
    const pdfPage = await doc.getPage(page), viewport = pdfPage.getViewport({ scale: 2 });
    if (viewport.width * viewport.height > MAX_PIXELS) throw new Error("Raster boyutu 40 MP sınırını aşıyor.");
    canvas = createCanvas(Math.ceil(viewport.width), Math.ceil(viewport.height));
    await pdfPage.render({ canvasContext: canvas.getContext("2d"), viewport }).promise;
  } else {
    if (![".png", ".jpg", ".jpeg", ".webp"].includes(ext)) {
      throw new Error("Yalnız PNG, JPEG, WebP ve PDF desteklenir.");
    }
    const image = await loadImage(pathname);
    if (image.width * image.height > MAX_PIXELS) throw new Error("Raster boyutu 40 MP sınırını aşıyor.");
    canvas = createCanvas(image.width, image.height);
    canvas.getContext("2d").drawImage(image, 0, 0);
  }
  return canvas;
}

export async function scanReference(pathname, page = 1) {
  const canvas = await decode(pathname, page);
  const ctx = canvas.getContext("2d");
  const pixels = ctx.getImageData(0, 0, canvas.width, canvas.height);
  const scan = scanPixels({ data: pixels.data, width: canvas.width, height: canvas.height });
  ctx.lineWidth = Math.max(1, Math.round(canvas.width / 700));
  ctx.font = `${Math.max(11, Math.round(canvas.width / 90))}px sans-serif`;
  scan.rows.forEach((row) => {
    ctx.strokeStyle = row.needsReview ? "#e11d48" : "#16a34a";
    row.seats.forEach((seat) => ctx.strokeRect(seat.bbox.x - 1, seat.bbox.y - 1,
      seat.bbox.w + 2, seat.bbox.h + 2));
    ctx.fillStyle = ctx.strokeStyle;
    ctx.fillText(`${row.rowId} (${row.seats.length})`, row.bbox.x, Math.max(12, row.bbox.y - 4));
  });
  return { ...scan, overlay: canvas.toBuffer("image/png") };
}

export const REFERENCE_LIMITS = { maxBytes: MAX_BYTES, maxPixels: MAX_PIXELS, maxPdfPage: MAX_PDF_PAGE,
  confidenceThreshold: 0.97 };
