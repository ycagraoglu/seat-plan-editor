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
const BLOCK = /(?:blok|block|balkon|trib[uü]n|section)/iu;
const FOCAL = /^(sahne|perde|futbolsahasi|basketbolsahasi|oyunalani)$/u;
const TOTAL = /(?:toplam\s*kapasite|total\s*capacity)/iu;
const clean = (v) => String(v ?? "").replace(/\p{Cf}/gu, "").trim();
const norm = (v) => clean(v).toLocaleLowerCase("tr").normalize("NFD")
  .replace(/[\u0300-\u036f]/g, "").replace(/ı/g, "i");
const focalKey = (v) => norm(v).replace(/[\s._-]+/g, "");
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
  const ranges = ws["!merges"] || [];
  const maxC = cells.reduce((n, x) => Math.max(n, x.c), ranges.reduce((n, r) => Math.max(n, r.e.c), 0));
  const maxR = cells.reduce((n, x) => Math.max(n, x.r), ranges.reduce((n, r) => Math.max(n, r.e.r), 0));
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
    if (seats.length) groups.push(makeGroup(`group-${groups.length + 1}`, named.Name, seats));
  }
  return groups;
}

function makeGroup(groupId, label, seats, sheet = seats[0]?.sheet) {
  const byRow = new Map();
  const identities = seats.map((s) => s.label.match(/^([A-ZÇĞİÖŞÜ]+)[- .]?(\d+[A-Z]?)$/iu));
  const canInferAxis = !seats.some((s) => s.rowLabel != null) && identities.every(Boolean);
  const purity = (axis) => {
    const buckets = new Map();
    seats.forEach((s, i) => {
      const key = s[axis];
      if (!buckets.has(key)) buckets.set(key, new Map());
      const prefix = identities[i][1].toLocaleUpperCase("tr");
      buckets.get(key).set(prefix, (buckets.get(key).get(prefix) || 0) + 1);
    });
    return [...buckets.values()].reduce((n, counts) => {
      let max = 0;
      for (const count of counts.values()) max = Math.max(max, count);
      return n + max;
    }, 0) / seats.length;
  };
  const vertical = canInferAxis && purity("column") > purity("row") + 0.1;
  seats.forEach((s) => {
    const key = `${s.sheet}:${vertical ? s.column : s.row}`;
    if (!byRow.has(key)) byRow.set(key, []);
    byRow.get(key).push(s);
  });
  const entries = [...byRow.entries()].sort(([, a], [, b]) => vertical ? a[0].x - b[0].x : a[0].y - b[0].y);
  const rows = entries
    .map(([key, list], i) => {
      const label = rowLabel(list);
      const axis = vertical ? "vertical" : "horizontal";
      const matchingPrefixes = list.filter((s) => s.label.match(/^([A-ZÇĞİÖŞÜ]+)[- .]?\d+/iu)?.[1] === label).length;
      return { rowId: `${groupId}-row-${i + 1}`, sourceRow: key, label,
        labelSource: list.some((s) => s.rowLabel != null) && list.every((s) => s.rowLabel == null || String(s.rowLabel) === label) ? "explicit"
          : matchingPrefixes > list.length / 2 ? "seat-prefix" : "sheet-row",
        axis, seats: list.sort((a, b) => axis === "vertical" ? a.y - b.y : a.x - b.x) };
    });
  return { groupId, label: clean(label) || groupId, level: sheet || "Ana Salon", sheet, rows,
    seatCount: seats.length };
}

function rowLabel(seats) {
  const explicit = seats.map((s) => s.rowLabel).filter((v) => v != null);
  if (explicit.length && explicit.every((v) => v === explicit[0])) return String(explicit[0]);
  const labels = seats.map((s) => s.label.match(/^([A-ZÇĞİÖŞÜ]+)[- .]?\d+/iu)?.[1]).filter(Boolean);
  const counts = new Map();
  labels.forEach((x) => counts.set(x, (counts.get(x) || 0) + 1));
  const majority = [...counts].toSorted((a, b) => b[1] - a[1])[0];
  return majority && majority[1] > seats.length / 2 ? majority[0] : String(seats[0]?.row + 1 || "");
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
  const summaryRows = new Set(sheet.cells.filter((x) => /toplam|total|kapasite|capacity/iu.test(x.text)).map((x) => x.r));
  const candidates = sheet.cells.filter((x) => Number.isInteger(x.value) && x.value >= 0 && !x.formula && !summaryRows.has(x.r)
    && qualified.has(x.style));
  const accepted = [], short = [];
  const rows = new Map();
  candidates.forEach((x) => { if (!rows.has(x.r)) rows.set(x.r, []); rows.get(x.r).push(x); });
  for (const list of rows.values()) {
    list.sort((a, b) => a.c - b.c);
    let run = [];
    const flush = () => { (run.length >= 3 ? accepted : short).push(...run); run = []; };
    for (const cell of list) {
      if (run.length && cell.c - run.at(-1).c > 2) flush();
      run.push(cell);
    }
    flush();
  }
  const anchors = new Set(accepted.map((c) => `${c.r}:${c.c}:${c.style}`));
  return [...accepted, ...short.filter((c) => [-1, 1].some((d) => anchors.has(`${c.r + d}:${c.c}:${c.style}`)))];
}

function canvasGroups(sheets, unresolved) {
  const all = [];
  for (const sheet of sheets.values()) {
    const sourceRows = new Map();
    for (const cell of sheet.cells) {
      if (!sourceRows.has(cell.r)) sourceRows.set(cell.r, []);
      sourceRows.get(cell.r).push(cell);
    }
    const candidates = new Map();
    [...sheet.cells.filter((x) => isSeatText(x.text)), ...numericRuns(sheet)]
      .forEach((x) => candidates.set(x.address, x));
    const occupied = new Set([...candidates.values()].map((c) => `${c.r},${c.c}`));
    for (const cell of candidates.values()) {
      if (!isSeatText(cell.text)) continue;
      let neighbor = false;
      for (let dr = -2; dr <= 2; dr++) for (let dc = -2; dc <= 2; dc++) {
        if ((dr || dc) && occupied.has(`${cell.r + dr},${cell.c + dc}`)) neighbor = true;
      }
      if (!neighbor) {
        candidates.delete(cell.address);
        unresolved.push({ sourceId: `${sheet.name}!${cell.address}`, text: cell.text, reason: "isolated-seat-like-text" });
      }
    }
    const labels = sheet.cells.filter((x) => BLOCK.test(x.text)).map((label) => {
      const merge = (sheet.ws["!merges"] || []).find((m) => label.r === m.s.r && label.c === m.s.c);
      const x = merge ? (sheet.dims.xs[merge.s.c] + sheet.dims.xs[merge.e.c + 1]) / 2 : center(label, sheet.dims).x;
      return { ...label, x };
    });
    let above = 0, below = 0;
    for (const cell of candidates.values()) {
      const nearest = labels.reduce((best, label) => !best || Math.abs(label.r - cell.r) < Math.abs(best.r - cell.r) ? label : best, null);
      if (nearest && cell.r < nearest.r) above++;
      if (nearest && cell.r > nearest.r) below++;
    }
    if (!labels.length) all.push({ sheet, label: "BLOK 1", cells: [...candidates.values()] });
    else {
      const rows = new Map();
      candidates.forEach((cell) => { if (!rows.has(cell.r)) rows.set(cell.r, []); rows.get(cell.r).push(cell); });
      const segments = [];
      for (const row of rows.values()) {
        row.sort((a, b) => a.c - b.c);
        let segment = [];
        for (const cell of row) {
          const previous = segment.at(-1);
          const reset = previous && Number(cell.value) === 1 && Number(previous.value) > 1;
          if (previous && (cell.c - previous.c > 2 || reset)) { segments.push(segment); segment = []; }
          segment.push(cell);
        }
        if (segment.length) segments.push(segment);
      }
      segments.forEach((segment) => {
        const cell = segment[0];
        // Headers above/below a tier define one band; do not switch blocks halfway through its rows.
        const directional = labels.filter((l) => above > below ? l.r >= cell.r : l.r <= cell.r);
        const pool = directional.length ? directional : labels;
        let rowDistance = Infinity;
        for (const label of pool) rowDistance = Math.min(rowDistance, Math.abs(label.r - cell.r));
        const band = pool.filter((l) => Math.abs(l.r - cell.r) === rowDistance);
        const x = (center(cell, sheet.dims).x + center(segment.at(-1), sheet.dims).x) / 2;
        const nearest = band.toSorted((a, b) => Math.abs(a.x - x) - Math.abs(b.x - x))[0];
        const markerDistance = (c) => c.c < cell.c ? cell.c - c.c : c.c - segment.at(-1).c;
        const rowMarker = sourceRows.get(cell.r).filter((c) => markerDistance(c) > 0 && markerDistance(c) <= 4
          && !candidates.has(c.address) && !c.formula && (Number.isInteger(c.value) || /^[A-ZÇĞİÖŞÜ]{1,3}$/iu.test(c.text)))
          .sort((a, b) => Number(a.c > cell.c) - Number(b.c > cell.c) || markerDistance(a) - markerDistance(b))[0];
        all.push({ sheet, label: nearest.text, anchor: nearest.address,
          cells: segment.map((c) => ({ ...c, rowLabel: rowMarker?.text, rowLabelColumn: rowMarker?.c })) });
      });
    }
  }
  const merged = new Map();
  all.forEach((x, i) => {
    const key = `${x.sheet.name}:${x.anchor || x.label || i}`;
    if (!merged.has(key)) merged.set(key, { sheet: x.sheet, label: x.label || `BLOK ${i + 1}`, cells: [] });
    merged.get(key).cells.push(...x.cells);
  });
  return [...merged.values()].map((x, i) => {
    const columns = new Set(x.cells.map((c) => c.rowLabelColumn).filter((c) => c != null));
    const seatAddresses = new Set(x.cells.map((c) => c.address));
    const markers = new Map();
    for (const c of x.sheet.cells.filter((c) => columns.has(c.c) && !c.formula
      && !seatAddresses.has(c.address)
      && (Number.isInteger(c.value) || /^[A-ZÇĞİÖŞÜ]{1,3}$/iu.test(c.text)))) {
      if (!markers.has(c.r)) markers.set(c.r, c);
      else if (markers.get(c.r)?.text !== c.text) markers.set(c.r, null);
    }
    return makeGroup(`group-${i + 1}`, x.label,
      [...new Map(x.cells.map((c) => [c.address, { ...seat(c, x.sheet.dims),
        rowLabel: c.rowLabel ?? markers.get(c.r)?.text }])).values()], x.sheet.name);
  });
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
      const key = JSON.stringify([sheet.name, block]);
      if (!groups.has(key)) groups.set(key, new Map());
      if (!groups.get(key).has(row)) groups.get(key).set(row, []);
      groups.get(key).get(row).push(seat(source, sheet.dims));
    }
  }
  return [...groups].map(([key, rows], i) => ({ groupId: `group-${i + 1}`, label: JSON.parse(key)[1],
    level: JSON.parse(key)[0], sheet: JSON.parse(key)[0],
    rows: [...rows].map(([row, seats], ri) => ({ rowId: `group-${i + 1}-row-${ri + 1}`,
      sourceRow: row, label: row, labelSource: "explicit", seats })),
    seatCount: [...rows.values()].reduce((n, seats) => n + seats.length, 0) }));
}

function findFocals(sheets) {
  const out = [];
  for (const sheet of sheets.values()) for (const cell of sheet.cells) {
    const key = focalKey(cell.text);
    if (!FOCAL.test(key)) continue;
    const merge = (sheet.ws["!merges"] || []).find((m) => cell.r >= m.s.r && cell.r <= m.e.r
      && cell.c >= m.s.c && cell.c <= m.e.c);
    const range = merge || { s: { r: cell.r, c: cell.c }, e: { r: cell.r, c: cell.c } };
    out.push({ type: key === "perde" ? "screen" : /saha|oyun/u.test(key) ? "pitch" : "stage",
      label: cell.text, sheet: sheet.name, measured: !!merge,
      bbox: { x: sheet.dims.xs[range.s.c], y: sheet.dims.ys[range.s.r],
        w: sheet.dims.xs[range.e.c + 1] - sheet.dims.xs[range.s.c],
        h: sheet.dims.ys[range.e.r + 1] - sheet.dims.ys[range.s.r] } });
  }
  return out;
}

function declaredCapacity(sheets) {
  for (const sheet of sheets.values()) for (const cell of sheet.cells) {
    const inline = norm(cell.text).match(/(?:toplam\s*)?kapasite\s*[:=-]?\s*([\d.]+)/u);
    if (inline) return Number(inline[1].replace(/\./g, ""));
  }
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
  const bytes = await readFile(file);
  const sourceHash = crypto.createHash("sha256").update(bytes).digest("hex");
  const wb = XLSX.read(bytes, { type: "buffer", cellStyles: true, cellFormula: true, cellNF: true });
  if (wb.SheetNames.length > SPREADSHEET_LIMITS.sheets) throw new Error("Excel dosyası 200 sayfa sınırını aşıyor.");
  const visibleSheets = wb.SheetNames.filter((name) => !wb.Workbook?.Sheets?.find((s) => s.name === name)?.Hidden);
  if (visibleSheets.length !== 1) {
    const names = visibleSheets.length
      ? `: ${visibleSheets.slice(0, 5).join(", ")}${visibleSheets.length > 5 ? ` ve ${visibleSheets.length - 5} sayfa daha` : ""}`
      : "";
    throw new Error(`Bu Excel'de ${visibleSheets.length} görünür sayfa var${names}. Oturma planını tek bir görünür sayfada bırakıp dosyayı yeniden yükleyin.`);
  }
  const sheets = new Map(); let filled = 0;
  wb.SheetNames.forEach((name) => {
    if (name !== visibleSheets[0]) return;
    const ws = wb.Sheets[name], cells = cellsOf(ws, name);
    filled += Object.keys(ws).filter((key) => key[0] !== "!").length;
    sheets.set(name, { name, ws, cells, dims: dimensions(ws, cells) });
  });
  if (filled > SPREADSHEET_LIMITS.filledCells) throw new Error("Excel dosyası 1.000.000 dolu hücre sınırını aşıyor.");
  const named = namedGroups(wb, sheets), flat = flatGroups(sheets);
  const focals = findFocals(sheets).map((f, i) => ({ ...f, id: `focal-${i + 1}` }));
  const focal = focals[0] || null;
  let family, groups; const unresolved = [];
  if (named.length) { family = "named-range-plan"; groups = named; }
  else if (flat.length) { family = "flat-list"; groups = flat; }
  else if (focal) { family = "canvas-sheet-plan"; groups = canvasGroups(sheets, unresolved); }
  else { groups = []; family = "needsReview"; }
  groups = groups.filter((g) => g.seatCount > 0);
  const seatCount = groups.reduce((n, g) => n + g.seatCount, 0);
  if (seatCount > SPREADSHEET_LIMITS.seats) throw new Error("Excel dosyası 100.000 koltuk sınırını aşıyor.");
  const labels = new Map(), sourceIds = new Map();
  groups.forEach((g) => g.rows.forEach((r) => r.seats.forEach((s) => {
    sourceIds.set(s.sourceId, (sourceIds.get(s.sourceId) || 0) + 1);
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
  const inferredRows = groups.reduce((n, g) => n + g.rows.filter((r) => r.labelSource === "sheet-row").length, 0);
  const result = { scanId: "sheet-scan-" + crypto.randomUUID(), path: file, sourceHash, family,
    sheets: [...sheets.keys()], availableSheets: wb.SheetNames, filledCells: filled, groups, focal, seatCount,
    rowCount: groups.reduce((n, g) => n + g.rows.length, 0),
    unresolvedCells: unresolved,
    warnings: [
      ...(unresolved.length ? [{ code: "unresolved-cells", count: unresolved.length, message: "İzole koltuk benzeri metinler sayılmadı; kaynakta kontrol edilmeli." }] : []),
      ...(family === "canvas-sheet-plan" ? [{ code: "inferred-block-membership", message: "Blok üyeliği başlık bantlarından türetildi; adlandırılmış kaynak alanı yok." }] : []),
      ...(inferredRows ? [{ code: "inferred-row-labels", count: inferredRows, message: "Excel satır indeksleri gerçek sıra numarası değildir; çizimde gizlenir." }] : []),
      ...(focal && !focal.measured ? [{ code: "unmeasured-focal", message: "Odak etiketi bulundu fakat boyutu ölçülmedi; fiziksel şekil üretilmez." }] : []),
    ],
    capacity: { declared, detected: seatCount, consistent: declared == null || declared === seatCount },
    conflicts: { duplicateLabels, duplicateSourceIds: [...sourceIds].filter(([, count]) => count > 1).map(([id]) => id), focal: focals.length > 1
      ? { candidates: focals.length, focals } : null }, limits: SPREADSHEET_LIMITS };
  result.overlay = overlayFor(sheets, groups, focal);
  return result;
}

function seatNumber(label) {
  return clean(label).match(/\d+[A-Z]?$/iu)?.[0] || clean(label);
}
