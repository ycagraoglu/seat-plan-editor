import crypto from "node:crypto";
import { stat, readFile } from "node:fs/promises";
import path from "node:path";
import XLSX from "@e965/xlsx";
import { createCanvas } from "@napi-rs/canvas";

export const SPREADSHEET_LIMITS = Object.freeze({
  fileBytes: 25 * 1024 * 1024,
  sheets: 200,
  filledCells: 1_000_000,
  seats: 100_000,
});

const SEAT = /^[A-ZÇĞİÖŞÜ]{1,8}[- .]?\d+[A-Z]?$/iu;
const SECTION = /^(?:section|sheet|bölüm|bolum)\s*[-_ ]?\d+$/iu;
const BLOCK = /(?:blok|block|trib[uü]n|section)/iu;
const FOCAL = /^(sahne|perde|futbol sahası|futbol sahasi|basketbol sahası|basketbol sahasi|oyun alanı|oyun alani)$/iu;
const TOTAL = /(?:toplam\s*kapasite|total\s*capacity)/iu;
const clean = (v) => String(v ?? "").replace(/\p{Cf}/gu, "").trim();
const norm = (v) => clean(v).toLocaleLowerCase("tr").normalize("NFD")
  .replace(/[\u0300-\u036f]/g, "").replace(/ı/g, "i");
const styleKey = (cell) => JSON.stringify(cell?.s || cell?.z || "");
const isSeatText = (v) => SEAT.test(v) && !BLOCK.test(v);

function cellsOf(ws, sheet) {
  return Object.entries(ws).filter(([a]) => a[0] !== "!").map(([address, cell]) => {
    const { r, c } = XLSX.utils.decode_cell(address);
    return { sheet, address, r, c, value: cell.v, text: clean(cell.w ?? cell.v),
      formula: cell.f || null, style: styleKey(cell) };
  }).filter((x) => (x.text || x.formula)
    && !ws["!rows"]?.[x.r]?.hidden && !ws["!cols"]?.[x.c]?.hidden);
}

function dimensions(ws, cells) {
  const maxC = Math.max(0, ...cells.map((x) => x.c));
  const maxR = Math.max(0, ...cells.map((x) => x.r));
  const widths = Array.from({ length: maxC + 2 }, (_, c) => ws["!cols"]?.[c]?.wpx
    || (ws["!cols"]?.[c]?.wch ? ws["!cols"][c].wch * 7 : 64));
  const heights = Array.from({ length: maxR + 2 }, (_, r) => ws["!rows"]?.[r]?.hpx
    || (ws["!rows"]?.[r]?.hpt ? ws["!rows"][r].hpt * 96 / 72 : 20));
  const xs = [0], ys = [0];
  widths.forEach((w) => xs.push(xs.at(-1) + w));
  heights.forEach((h) => ys.push(ys.at(-1) + h));
  return { widths, heights, xs, ys, width: xs.at(-1), height: ys.at(-1) };
}

const center = (cell, dims) => ({ x: dims.xs[cell.c] + dims.widths[cell.c] / 2,
  y: dims.ys[cell.r] + dims.heights[cell.r] / 2 });

function seat(cell, dims) {
  return { sourceId: `${cell.sheet}!${cell.address}`, sheet: cell.sheet, address: cell.address,
    label: cell.text, ...center(cell, dims), row: cell.r, column: cell.c };
}

function parseRefs(ref) {
  const out = [];
  for (const part of String(ref || "").split(/,(?=(?:[^']*'[^']*')*[^']*$)/)) {
    const m = part.match(/^(?:'((?:[^']|'')+)'|([^!]+))!(.+)$/);
    if (!m || m[3].includes("#REF!")) continue;
    try { out.push({ sheet: (m[1] || m[2]).replace(/''/g, "'"), range: XLSX.utils.decode_range(m[3].replace(/\$/g, "")) }); }
    catch { /* bozuk adlandırılmış alan taramayı bozmaz */ }
  }
  return out;
}

function namedGroups(wb, sheets) {
  const groups = [];
  for (const named of wb.Workbook?.Names || []) {
    if (!BLOCK.test(named.Name || "")) continue;
    const refs = parseRefs(named.Ref);
    const seats = refs.flatMap(({ sheet, range }) => {
      const s = sheets.get(sheet);
      if (!s) return [];
      return s.cells.filter((x) => x.r >= range.s.r && x.r <= range.e.r
        && x.c >= range.s.c && x.c <= range.e.c
        && (isSeatText(x.text) || typeof x.value === "number")).map((x) => seat(x, s.dims));
    });
    if (seats.length >= 3) groups.push(makeGroup(`group-${groups.length + 1}`, named.Name, seats));
  }
  return groups;
}

function makeGroup(groupId, label, seats, sheet = seats[0]?.sheet) {
  const byRow = new Map();
  seats.forEach((s) => {
    const key = `${s.sheet}:${s.row}`;
    if (!byRow.has(key)) byRow.set(key, []);
    byRow.get(key).push(s);
  });
  const rows = [...byRow.entries()].sort(([, a], [, b]) => a[0].y - b[0].y)
    .map(([key, list], i) => ({ rowId: `${groupId}-row-${i + 1}`, sourceRow: key,
      label: rowLabel(list), seats: list.sort((a, b) => a.x - b.x) }));
  return { groupId, label: clean(label) || groupId, level: sheet || "Ana Salon", sheet, rows,
    seatCount: seats.length };
}

function rowLabel(seats) {
  const labels = seats.map((s) => s.label.match(/^([A-ZÇĞİÖŞÜ]+)[- .]?\d+/iu)?.[1]).filter(Boolean);
  return labels.length && labels.every((x) => x === labels[0]) ? labels[0] : String(seats[0]?.row + 1 || "");
}

function sectionGroups(sheets) {
  return [...sheets.values()].filter((s) => SECTION.test(s.name)).map((s, i) => {
    const seats = s.cells.filter((x) => isSeatText(x.text)).map((x) => seat(x, s.dims));
    return makeGroup(`group-${i + 1}`, s.name, seats, s.name);
  }).filter((g) => g.seatCount >= 3);
}

function numericRuns(sheet) {
  const byRow = new Map();
  sheet.cells.filter((x) => typeof x.value === "number" && !x.formula).forEach((x) => {
    const key = `${x.r}:${x.style}`;
    if (!byRow.has(key)) byRow.set(key, []);
    byRow.get(key).push(x);
  });
  const qualified = new Set();
  for (const list of byRow.values()) {
    list.sort((a, b) => a.c - b.c);
    let run = [];
    const flush = () => {
      if (run.length >= 3) qualified.add(run[0].style);
      run = [];
    };
    for (const cell of list) {
      if (run.length && cell.c - run.at(-1).c > 2) flush();
      run.push(cell);
    }
    flush();
  }
  if (!qualified.size) return [];
  const candidates = sheet.cells.filter((x) => typeof x.value === "number" && !x.formula
    && qualified.has(x.style));
  const accepted = [];
  const rows = new Map();
  candidates.forEach((x) => { if (!rows.has(x.r)) rows.set(x.r, []); rows.get(x.r).push(x); });
  for (const list of rows.values()) {
    list.sort((a, b) => a.c - b.c);
    let run = [];
    const flush = () => { if (run.length >= 3) accepted.push(...run); run = []; };
    for (const cell of list) {
      if (run.length && cell.c - run.at(-1).c > 2) flush();
      run.push(cell);
    }
    flush();
  }
  return accepted;
}

function canvasGroups(sheets) {
  const all = [];
  for (const sheet of sheets.values()) {
    const candidates = new Map();
    [...sheet.cells.filter((x) => isSeatText(x.text)), ...numericRuns(sheet)]
      .forEach((x) => candidates.set(x.address, x));
    const labels = sheet.cells.filter((x) => BLOCK.test(x.text));
    if (!labels.length) all.push({ sheet, label: "BLOK 1", cells: [...candidates.values()] });
    else candidates.forEach((cell) => {
      const distance = (label) => Math.hypot(label.c - cell.c, (label.r - cell.r) * 10);
      const nearest = labels.toSorted((a, b) => distance(a) - distance(b))[0];
      all.push({ sheet, label: nearest.text, cells: [cell] });
    });
  }
  const merged = new Map();
  all.forEach((x, i) => {
    const key = `${x.sheet.name}:${x.label || i}`;
    if (!merged.has(key)) merged.set(key, { sheet: x.sheet, label: x.label || `BLOK ${i + 1}`, cells: [] });
    merged.get(key).cells.push(...x.cells);
  });
  return [...merged.values()].map((x, i) => makeGroup(`group-${i + 1}`, x.label,
    [...new Map(x.cells.map((c) => [c.address, seat(c, x.sheet.dims)])).values()], x.sheet.name));
}

function flatGroups(sheets) {
  const groups = new Map();
  for (const sheet of sheets.values()) {
    const byRow = new Map();
    sheet.cells.forEach((cell) => { if (!byRow.has(cell.r)) byRow.set(cell.r, new Map()); byRow.get(cell.r).set(cell.c, cell); });
    let header = null;
    for (const [r, cells] of byRow) {
      if (r > 10) continue;
      const cols = {};
      cells.forEach((cell, c) => {
        const h = norm(cell.text);
        if (["blok", "block", "section", "bolum"].includes(h)) cols.block = c;
        if (["sira", "row", "satir"].includes(h)) cols.row = c;
        if (["koltuk", "seat", "koltuk no", "seat no"].includes(h)) cols.seat = c;
      });
      if (["block", "row", "seat"].every((k) => cols[k] != null)) { header = { r, cols }; break; }
    }
    if (!header) continue;
    for (const [r, cells] of byRow) {
      if (r <= header.r) continue;
      const block = clean(cells.get(header.cols.block)?.text);
      const row = clean(cells.get(header.cols.row)?.text);
      const source = cells.get(header.cols.seat);
      if (!block || !row || !source || !clean(source.text)) continue;
      if (!groups.has(block)) groups.set(block, new Map());
      if (!groups.get(block).has(row)) groups.get(block).set(row, []);
      groups.get(block).get(row).push(seat(source, sheet.dims));
    }
  }
  return [...groups].map(([label, rows], i) => ({ groupId: `group-${i + 1}`, label,
    level: "Ana Salon", sheet: [...rows.values()][0]?.[0]?.sheet,
    rows: [...rows].map(([row, seats], ri) => ({ rowId: `group-${i + 1}-row-${ri + 1}`,
      sourceRow: row, label: row, seats })),
    seatCount: [...rows.values()].reduce((n, seats) => n + seats.length, 0) }));
}

function findFocals(sheets) {
  const out = [];
  for (const sheet of sheets.values()) for (const cell of sheet.cells) {
    if (!FOCAL.test(cell.text)) continue;
    const merge = (sheet.ws["!merges"] || []).find((m) => cell.r >= m.s.r && cell.r <= m.e.r
      && cell.c >= m.s.c && cell.c <= m.e.c);
    const range = merge || { s: { r: cell.r, c: cell.c }, e: { r: cell.r, c: cell.c } };
    out.push({ type: /perde/iu.test(cell.text) ? "screen" : /saha|oyun/iu.test(cell.text) ? "pitch" : "stage",
      label: cell.text, sheet: sheet.name, measured: !!merge,
      bbox: { x: sheet.dims.xs[range.s.c], y: sheet.dims.ys[range.s.r],
        w: sheet.dims.xs[range.e.c + 1] - sheet.dims.xs[range.s.c],
        h: sheet.dims.ys[range.e.r + 1] - sheet.dims.ys[range.s.r] } });
  }
  return out;
}

function declaredCapacity(sheets) {
  for (const sheet of sheets.values()) for (const cell of sheet.cells) {
    if (!TOTAL.test(norm(cell.text))) continue;
    const hit = sheet.cells.filter((x) => typeof x.value === "number"
      && x.r === cell.r && x.c > cell.c && x.c <= cell.c + 4)
      .sort((a, b) => a.c - b.c)[0];
    if (hit) return Number(hit.value);
  }
  for (const sheet of sheets.values()) {
    const total = sheet.cells.find((x) => norm(x.text) === "total");
    if (!total) continue;
    const header = sheet.cells.find((x) => x.r < total.r && norm(x.text) === "total seats");
    const value = header && sheet.cells.find((x) => x.r === total.r && x.c === header.c
      && typeof x.value === "number");
    if (value) return Number(value.value);
  }
  return null;
}

function overlayFor(sheets, groups, focal) {
  const positions = groups.flatMap((g) => g.rows.flatMap((r) => r.seats));
  const maxX = Math.max(800, ...positions.map((s) => s.x), focal ? focal.bbox.x + focal.bbox.w : 0);
  const maxY = Math.max(500, ...positions.map((s) => s.y), focal ? focal.bbox.y + focal.bbox.h : 0);
  const scale = Math.min(1, 1600 / maxX, 1000 / maxY);
  const canvas = createCanvas(Math.ceil(maxX * scale), Math.ceil(maxY * scale));
  const ctx = canvas.getContext("2d");
  ctx.fillStyle = "#fff"; ctx.fillRect(0, 0, canvas.width, canvas.height);
  const colors = ["#2563eb", "#db2777", "#16a34a", "#d97706", "#7c3aed"];
  groups.forEach((g, i) => {
    ctx.fillStyle = colors[i % colors.length];
    g.rows.forEach((r) => r.seats.forEach((s) => ctx.fillRect((s.x - 4) * scale, (s.y - 3) * scale, 8 * scale, 6 * scale)));
  });
  if (focal?.measured) {
    ctx.strokeStyle = "#111827"; ctx.lineWidth = 2;
    ctx.strokeRect(focal.bbox.x * scale, focal.bbox.y * scale, focal.bbox.w * scale, focal.bbox.h * scale);
  }
  return canvas.toBuffer("image/png");
}

export async function scanSpreadsheet(file) {
  const ext = path.extname(file).toLowerCase();
  if (![".xls", ".xlsx"].includes(ext)) throw new Error("Yalnız .xls ve .xlsx dosyaları desteklenir.");
  const info = await stat(file);
  if (info.size > SPREADSHEET_LIMITS.fileBytes) throw new Error("Excel dosyası 25 MB sınırını aşıyor.");
  const wb = XLSX.read(await readFile(file), { type: "buffer", cellStyles: true, cellFormula: true, cellNF: true });
  if (wb.SheetNames.length > SPREADSHEET_LIMITS.sheets) throw new Error("Excel dosyası 200 sayfa sınırını aşıyor.");
  const sheets = new Map(); let filled = 0;
  wb.SheetNames.forEach((name) => {
    const ws = wb.Sheets[name], cells = cellsOf(ws, name);
    filled += Object.keys(ws).filter((key) => key[0] !== "!").length;
    sheets.set(name, { name, ws, cells, dims: dimensions(ws, cells) });
  });
  if (filled > SPREADSHEET_LIMITS.filledCells) throw new Error("Excel dosyası 1.000.000 dolu hücre sınırını aşıyor.");
  const named = namedGroups(wb, sheets), focals = findFocals(sheets), focal = focals[0] || null;
  const sectionCount = [...sheets.keys()].filter((n) => SECTION.test(n)).length;
  let family, groups;
  if (named.length) { family = "named-range-plan"; groups = named; }
  else if (focal) { family = "canvas-sheet-plan"; groups = canvasGroups(sheets); }
  else if (sectionCount >= 2) { family = "section-manifest"; groups = sectionGroups(sheets); }
  else {
    const headers = [...sheets.values()].flatMap((s) => s.cells.filter((c) => c.r < 5).map((c) => c.text.toLocaleLowerCase("tr")));
    family = ["blok", "sıra", "koltuk"].every((h) => headers.some((x) => x.includes(h))) ? "flat-list" : "needsReview";
    groups = family === "flat-list" ? flatGroups(sheets) : [];
  }
  const seatCount = groups.reduce((n, g) => n + g.seatCount, 0);
  if (seatCount > SPREADSHEET_LIMITS.seats) throw new Error("Excel dosyası 100.000 koltuk sınırını aşıyor.");
  const labels = new Map();
  groups.forEach((g) => g.rows.forEach((r) => r.seats.forEach((s) => {
    const visible = clean(s.label).toLocaleUpperCase("tr");
    const key = isSeatText(visible) ? `${g.groupId}|@|${visible}`
      : `${g.groupId}|${clean(r.label).toLocaleUpperCase("tr")}|${clean(seatNumber(s.label)).toLocaleUpperCase("tr")}`;
    if (!labels.has(key)) labels.set(key, []);
    labels.get(key).push(s.sourceId);
  })));
  const duplicateLabels = [...labels].filter(([, ids]) => ids.length > 1)
    .map(([key, sourceIds]) => ({ groupId: key.split("|")[0], row: key.split("|")[1],
      label: key.split("|").slice(2).join("|"), sourceIds }));
  const declared = declaredCapacity(sheets);
  const result = { scanId: "sheet-scan-" + crypto.randomUUID(), path: file, family,
    sheets: wb.SheetNames, filledCells: filled, groups, focal, seatCount,
    rowCount: groups.reduce((n, g) => n + g.rows.length, 0),
    capacity: { declared, detected: seatCount, consistent: declared == null || declared === seatCount },
    conflicts: { duplicateLabels, focal: focals.length > 1
      ? { candidates: focals.length, focals } : null }, limits: SPREADSHEET_LIMITS };
  result.overlay = overlayFor(sheets, groups, focal);
  return result;
}

function seatNumber(label) {
  return clean(label).match(/\d+[A-Z]?$/iu)?.[0] || clean(label);
}
