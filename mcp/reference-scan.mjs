import { readFile, stat } from "node:fs/promises";
import { createHash } from "node:crypto";
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
  const fg = new Uint8Array(width * height);
  for (let p = 0; p < fg.length; p++) {
    const i = p * 4;
    const dr = data[i] - bg[0], dg = data[i + 1] - bg[1], db = data[i + 2] - bg[2];
    fg[p] = data[i + 3] > 20 && dr * dr + dg * dg + db * db > 784 ? 1 : 0;
  }
  const out = [];
  for (let start = 0; start < width * height; start++) {
    if (seen[start] || !fg[start]) continue;
    const stack = [start];
    seen[start] = 1;
    let x0 = width, y0 = height, x1 = 0, y1 = 0, area = 0;
    while (stack.length) {
      const p = stack.pop(), x = p % width, y = (p / width) | 0;
      x0 = Math.min(x0, x); y0 = Math.min(y0, y); x1 = Math.max(x1, x); y1 = Math.max(y1, y); area++;
      let q = p - width;
      if (q >= 0 && !seen[q] && fg[q]) { seen[q] = 1; stack.push(q); }
      q = p + width;
      if (q < seen.length && !seen[q] && fg[q]) { seen[q] = 1; stack.push(q); }
      if (x > 0) {
        q = p - 1;
        if (!seen[q] && fg[q]) { seen[q] = 1; stack.push(q); }
      }
      if (x < width - 1) {
        q = p + 1;
        if (!seen[q] && fg[q]) { seen[q] = 1; stack.push(q); }
      }
    }
    const w = x1 - x0 + 1, h = y1 - y0 + 1;
    if (area >= 6) out.push({ x: x0, y: y0, w, h, area, cx: x0 + w / 2, cy: y0 + h / 2 });
  }
  return out;
}

function seatCandidates(parts, width, height) {
  const usable = parts.filter((p) => p.w <= width * 0.18 && p.h <= height * 0.18);
  const clusters = new Map();
  for (const p of usable) {
    const k = `${Math.round(p.w / 3)}:${Math.round(p.h / 3)}`;
    let c = clusters.get(k);
    if (!c) clusters.set(k, c = { w: 0, h: 0, n: 0, parts: [] });
    c.parts.push(p);
    c.n++;
    c.w += (p.w - c.w) / c.n;
    c.h += (p.h - c.h) / c.n;
  }
  const list = [...clusters.values()].sort((a, b) => b.parts.length - a.parts.length);
  const biggest = list[0]?.parts.length || 0;
  return list.filter((c) => c.parts.length >= 3 && c.parts.length >= biggest * 0.08)
    .flatMap((c, clusterIndex) => c.parts
      .filter((p) => p.area >= p.w * p.h * 0.32)
      .map((p) => ({ ...p, clusterIndex })));
}

function nearestStats(seats) {
  if (seats.length < 2) return seats.map(() => ({ distance: 0, angle: 0 }));
  const size = median(seats.map((s) => Math.max(s.w, s.h))) || 10;
  const cell = Math.max(8, size * 4), grid = new Map();
  seats.forEach((s, i) => {
    const k = `${Math.floor(s.cx / cell)}:${Math.floor(s.cy / cell)}`;
    if (!grid.has(k)) grid.set(k, []);
    grid.get(k).push(i);
  });
  return seats.map((a, i) => {
    const cx = Math.floor(a.cx / cell), cy = Math.floor(a.cy / cell);
    let best = null;
    for (let ring = 0; ring < 8 && !best; ring++) {
      for (let dx = -ring; dx <= ring; dx++) for (let dy = -ring; dy <= ring; dy++) {
        if (Math.max(Math.abs(dx), Math.abs(dy)) !== ring) continue;
        for (const j of grid.get(`${cx + dx}:${cy + dy}`) || []) {
          if (j === i) continue;
          const b = seats[j], d = Math.hypot(b.cx - a.cx, b.cy - a.cy);
          if (!best || d < best.d) best = { d, angle: Math.atan2(b.cy - a.cy, b.cx - a.cx) };
        }
      }
    }
    let angle = best?.angle || 0;
    if (angle < -Math.PI / 2) angle += Math.PI;
    if (angle >= Math.PI / 2) angle -= Math.PI;
    return { distance: best?.d || 0, angle };
  });
}

function dominantAngle(seats) {
  if (seats.length < 2) return 0;
  return median(nearestStats(seats).map((x) => x.angle).filter(Number.isFinite));
}

const angleDistance = (a, b) => {
  let d = Math.abs(a - b) % Math.PI;
  return Math.min(d, Math.PI - d);
};

function freeRows(seats) {
  if (!seats.length) return [];
  const local = nearestStats(seats);
  const pitch = median(local.map((x) => x.distance).filter(Boolean));
  const parent = seats.map((_, i) => i);
  const root = (i) => parent[i] === i ? i : (parent[i] = root(parent[i]));
  const join = (a, b) => { a = root(a); b = root(b); if (a !== b) parent[b] = a; };
  const cell = Math.max(8, pitch * 3 || 24), grid = new Map();
  seats.forEach((s, i) => {
    const k = `${Math.floor(s.cx / cell)}:${Math.floor(s.cy / cell)}`;
    if (!grid.has(k)) grid.set(k, []);
    grid.get(k).push(i);
  });
  for (let i = 0; i < seats.length; i++) {
    const gx = Math.floor(seats[i].cx / cell), gy = Math.floor(seats[i].cy / cell);
    for (let dxg = -1; dxg <= 1; dxg++) for (let dyg = -1; dyg <= 1; dyg++) {
      for (const j of grid.get(`${gx + dxg}:${gy + dyg}`) || []) {
        if (j <= i) continue;
        const dx = seats[j].cx - seats[i].cx, dy = seats[j].cy - seats[i].cy;
        const d = Math.hypot(dx, dy), angle = Math.atan2(dy, dx);
        if (d <= pitch * 3 && angleDistance(angle, local[i].angle) < 0.48
          && angleDistance(angle, local[j].angle) < 0.48) join(i, j);
      }
    }
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

function axisGroups(seats, alongKey, acrossKey, tolerance, pitch) {
  const bands = [];
  for (const seat of [...seats].sort((a, b) => a[acrossKey] - b[acrossKey])) {
    let band = bands.at(-1);
    if (!band || Math.abs(band.center - seat[acrossKey]) > tolerance) {
      bands.push(band = { center: seat[acrossKey], n: 0, seats: [] });
    }
    band.seats.push(seat);
    band.n++;
    band.center += (seat[acrossKey] - band.center) / band.n;
  }
  return bands.flatMap((band) => {
    const groups = [[]];
    for (const seat of band.seats.sort((a, b) => a[alongKey] - b[alongKey])) {
      const group = groups.at(-1), previous = group.at(-1);
      if (previous && seat[alongKey] - previous[alongKey] > pitch * 3.25) groups.push([]);
      groups.at(-1).push(seat);
    }
    const merged = [];
    for (const group of groups) {
      const previous = merged.at(-1), gap = previous?.length
        ? group[0][alongKey] - previous.at(-1)[alongKey] : Infinity;
      if (previous?.length >= 3 && group.length >= 3 && gap <= pitch * 5.25) previous.push(...group);
      else merged.push(group);
    }
    return merged.filter((group) => group.length >= 3).map((group) => group.map((seat) =>
      Object.assign(seat, { along: seat[alongKey], across: seat[acrossKey] })));
  });
}

function seatRows(seats) {
  if (!seats.length) return [];
  const nearest = nearestStats(seats).map((x) => x.distance);
  const pitch = median(nearest.filter(Number.isFinite));
  const tolerance = Math.max(2, median(seats.map((s) => Math.min(s.w, s.h))) * 0.55);
  const horizontal = axisGroups(seats, "cx", "cy", tolerance, pitch);
  const horizontalSeats = new Set(horizontal.flat());
  if (horizontalSeats.size >= seats.length * 0.6) {
    const remaining = seats.filter((seat) => !horizontalSeats.has(seat));
    const vertical = axisGroups(remaining, "cy", "cx", tolerance, pitch);
    const verticalSeats = new Set(vertical.flat());
    return [...horizontal, ...vertical, ...freeRows(remaining.filter((seat) => !verticalSeats.has(seat)))];
  }
  const vertical = axisGroups(seats, "cy", "cx", tolerance, pitch);
  const verticalSeats = new Set(vertical.flat());
  if (verticalSeats.size >= seats.length * 0.6) {
    return [...vertical, ...freeRows(seats.filter((seat) => !verticalSeats.has(seat)))];
  }
  return freeRows(seats);
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

const OCR_CHARS = "ABCDEFGHIJKLMNOPQRSTUVWXYZÇĞİÖŞÜ0123456789";
const ocrTemplates = new Map();

function normalizeMaskFromImage(image, box, size = 24) {
  const mask = new Uint8Array(size * size);
  for (let y = 0; y < size; y++) for (let x = 0; x < size; x++) {
    const sx = Math.min(image.width - 1, Math.max(0, Math.floor(box.x + x / size * box.w)));
    const sy = Math.min(image.height - 1, Math.max(0, Math.floor(box.y + y / size * box.h)));
    const p = (sy * image.width + sx) * 4;
    const a = image.data[p + 3], lum = (image.data[p] + image.data[p + 1] + image.data[p + 2]) / 3;
    mask[y * size + x] = a > 20 && lum < 210 ? 1 : 0;
  }
  return mask;
}

function templateMask(ch, size = 24) {
  const key = `${ch}:${size}`;
  if (ocrTemplates.has(key)) return ocrTemplates.get(key);
  const c = createCanvas(48, 48), ctx = c.getContext("2d");
  ctx.fillStyle = "#fff"; ctx.fillRect(0, 0, 48, 48);
  ctx.fillStyle = "#000"; ctx.font = "bold 34px Arial, sans-serif";
  ctx.textBaseline = "top"; ctx.fillText(ch, 4, 4);
  const img = ctx.getImageData(0, 0, 48, 48);
  let x0 = 48, y0 = 48, x1 = 0, y1 = 0;
  for (let y = 0; y < 48; y++) for (let x = 0; x < 48; x++) {
    const p = (y * 48 + x) * 4;
    if (img.data[p] < 180) { x0 = Math.min(x0, x); y0 = Math.min(y0, y); x1 = Math.max(x1, x); y1 = Math.max(y1, y); }
  }
  const out = x1 > x0 ? normalizeMaskFromImage({ data: img.data, width: 48, height: 48 },
    { x: x0, y: y0, w: x1 - x0 + 1, h: y1 - y0 + 1 }, size) : new Uint8Array(size * size);
  ocrTemplates.set(key, out);
  return out;
}

function scoreGlyph(mask, tpl) {
  let inter = 0, union = 0;
  for (let i = 0; i < mask.length; i++) {
    if (mask[i] && tpl[i]) inter++;
    if (mask[i] || tpl[i]) union++;
  }
  return union ? inter / union : 0;
}

function readGlyph(image, part) {
  const mask = normalizeMaskFromImage(image, part);
  let best = { ch: "", confidence: 0 };
  for (const ch of OCR_CHARS) {
    const confidence = scoreGlyph(mask, templateMask(ch));
    if (confidence > best.confidence) best = { ch, confidence };
  }
  return best;
}

function lineGroups(parts) {
  const hs = parts.map((p) => p.h);
  const tol = Math.max(6, median(hs) * 0.75);
  const lines = [];
  for (const p of [...parts].sort((a, b) => a.cy - b.cy)) {
    let line = lines.at(-1);
    if (!line || Math.abs(line.center - p.cy) > tol) lines.push(line = { center: p.cy, n: 0, parts: [] });
    line.parts.push(p);
    line.n++;
    line.center += (p.cy - line.center) / line.n;
  }
  return lines.map((l) => l.parts.sort((a, b) => a.x - b.x));
}

function localOcr(image, parts, seats) {
  const seatKeys = new Set(seats.map((s) => `${s.x}:${s.y}:${s.w}:${s.h}`));
  const glyphs = parts.filter((p) => !seatKeys.has(`${p.x}:${p.y}:${p.w}:${p.h}`)
    && p.area >= 8 && p.h >= 8 && p.h <= image.height * 0.22 && p.w <= image.width * 0.16
    && p.area / Math.max(1, p.w * p.h) >= 0.08);
  const words = [];
  for (const line of lineGroups(glyphs)) {
    const gapLimit = Math.max(8, median(line.map((p) => p.h)) * 0.9);
    let word = [];
    const flush = () => {
      if (word.length < 2) { word = []; return; }
      const chars = word.map((p) => readGlyph(image, p));
      const text = chars.map((c) => c.ch).join("");
      const confidence = median(chars.map((c) => c.confidence));
      let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
      for (const p of word) {
        x0 = Math.min(x0, p.x); y0 = Math.min(y0, p.y);
        x1 = Math.max(x1, p.x + p.w); y1 = Math.max(y1, p.y + p.h);
      }
      if (confidence >= 0.35) words.push({ text, confidence: round(confidence),
        bbox: { x: x0, y: y0, w: x1 - x0, h: y1 - y0 } });
      word = [];
    };
    for (const part of line) {
      const prev = word.at(-1);
      if (prev && part.x - (prev.x + prev.w) > gapLimit) flush();
      word.push(part);
    }
    flush();
  }
  return words;
}

function ocrFocalCandidates(ocr) {
  const norm = (s) => s.replace(/[^A-ZÇĞİÖŞÜ0-9]/g, "");
  return ocr.flatMap((w, i) => {
    const t = norm(w.text);
    const type = t.includes("SAHNE") ? "stage"
      : t.includes("PERDE") ? "screen"
      : t.includes("SAHA") || t.includes("FUTBOL") || t.includes("BASKETBOL") || t.includes("OYUN") ? "pitch"
        : null;
    return type ? [{ id: `ocr-focal-${i + 1}`, type, label: w.text, bbox: w.bbox, confidence: w.confidence }] : [];
  });
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
    const spacingError = gaps.length && pitch ? Math.sqrt(gaps.reduce((n, gap) => {
      const multiple = gap / pitch;
      return n + (multiple - Math.max(1, Math.round(multiple))) ** 2;
    }, 0) / gaps.length) : 1;
    const residual = arc ? arc.residual : median(row.map((s) => Math.abs(s.across - across)));
    const confidence = Math.max(0, Math.min(1, 1 - spacingError * 0.7 - residual / Math.max(1, tolerance) * 0.15
      - (row.length < 3 ? 0.5 : 0)));
    let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
    for (const s of row) {
      x0 = Math.min(x0, s.x); y0 = Math.min(y0, s.y);
      x1 = Math.max(x1, s.x + s.w); y1 = Math.max(y1, s.y + s.h);
    }
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
  const ocr = localOcr(image, parts, seats);
  const focalCandidates = [
    ...ocrFocalCandidates(ocr),
    ...parts
    .filter((p) => p.w > image.width * 0.18 && p.h < image.height * 0.18 && p.area > 40)
    .sort((a, b) => b.area - a.area).slice(0, 5)
    .map((p, i) => ({ id: `focal-${i + 1}`, type: p.w > p.h * 2.5 ? "stage" : "screen",
      bbox: { x: p.x, y: p.y, w: p.w, h: p.h }, confidence: 0.55 })),
  ].sort((a, b) => b.confidence - a.confidence).slice(0, 8);
  return { width: image.width, height: image.height, seatCount: rows.reduce((n, r) => n + r.seats.length, 0),
    rows, needsReview: rows.filter((r) => r.needsReview).map((r) => r.rowId),
    clusters: [...new Set(seats.map((s) => s.clusterIndex))].length, ocr,
    reviewRequired: {
      rows: rows.filter((r) => r.needsReview).map((r) => r.rowId),
      focal: focalCandidates.filter((f) => f.confidence < 0.75).map((f) => f.id),
    },
    focalCandidates };
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
  const sourceHash = createHash("sha256").update(await readFile(pathname)).digest("hex");
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
  return { ...scan, sourceHash, overlay: canvas.toBuffer("image/png") };
}

export const REFERENCE_LIMITS = { maxBytes: MAX_BYTES, maxPixels: MAX_PIXELS, maxPdfPage: MAX_PDF_PAGE,
  confidenceThreshold: 0.97 };
