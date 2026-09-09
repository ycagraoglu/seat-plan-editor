import { createCanvas } from "@napi-rs/canvas";
import { fanB, gr } from "../venues/builders.js";
import { buildMeta, buildSeats, prep, rowPts } from "./geometry.js";
import { DEF_NUM, reLabel } from "./labels.js";
import { nid } from "./ids.js";
import { DELIVERY_BLOCKERS, markSourceVerified } from "./readiness.js";
import { extent, pointBounds } from "./bounds.js";

const median = (xs) => {
  const a = xs.filter(Number.isFinite).toSorted((x, y) => x - y);
  return a.length ? (a[(a.length - 1) >> 1] + a[a.length >> 1]) / 2 : 0;
};

export const keyOf = (s) => `${s.sheet}!${s.address}`;
export const allSpreadsheetSeats = (groups) => groups.flatMap((g) => g.rows.flatMap((r) => r.seats));
export const seatLabel = (s) => s.label.match(/\d+[A-Z]?$/iu)?.[0] || s.label;

export function normalizeSpreadsheetAnalysis(scan, input = {}, { defaultName = "Excel plan" } = {}) {
  if (!scan || scan.scanId !== input.scanId) throw new Error("Geçerli Excel taraması yok; scan_spreadsheet çağır.");
  if (scan.family === "needsReview") throw new Error("Excel türü güvenle belirlenemedi; plan değişmedi.");
  let focal = scan.focal || null;
  if (scan.conflicts?.focal) {
    const decision = input.focalDecision;
    if (decision?.type === "none") focal = null;
    else if (decision?.candidateId) {
      focal = scan.conflicts.focal.focals.find((x) => x.id === decision.candidateId);
      if (!focal) throw new Error("Bilinmeyen Excel odak adayı: " + decision.candidateId);
    } else throw new Error("Çelişen odak alanları çözülmeden Excel derlenemez.");
  }
  for (const cell of input.excludedCells || []) {
    if (!String(cell.reason || "").trim()) {
      throw new Error("Dışlanan belirsiz hücre için neden zorunludur: " + cell.sourceId);
    }
    if (!scan.unresolvedCells?.some((c) => c.sourceId === cell.sourceId)) {
      throw new Error("Yalnız raporlanmış belirsiz hücre dışlanabilir: " + cell.sourceId);
    }
  }
  for (const group of input.excludedGroups || []) {
    if (!String(group.reason || "").trim()) {
      throw new Error("Dışlanan Excel grubu için neden zorunludur: " + group.groupId);
    }
  }
  const excluded = new Set((input.excludedGroups || []).map((x) => x.groupId));
  const overrides = new Map((input.groupOverrides || []).map((x) => [x.groupId, x]));
  for (const id of [...excluded, ...overrides.keys()]) {
    if (!scan.groups.some((g) => g.groupId === id)) throw new Error("Bilinmeyen Excel grubu: " + id);
  }
  const semanticOverride = (groupId) => {
    const raw = overrides.get(groupId) || {};
    return Object.fromEntries(["label", "name", "level"]
      .filter((key) => raw[key] != null && String(raw[key]).trim())
      .map((key) => [key, String(raw[key]).trim()]));
  };
  const groups = scan.groups.filter((g) => !excluded.has(g.groupId)).map((g) => ({
    ...structuredClone(g), ...semanticOverride(g.groupId),
  }));
  if (!groups.length) throw new Error("Derlenecek Excel grubu kalmadı.");
  const sourceIds = allSpreadsheetSeats(groups).map(keyOf);
  if (new Set(sourceIds).size !== sourceIds.length) {
    throw new Error("Aynı kaynak hücresi birden fazla blokta; çakışan grupları çöz.");
  }
  const inferred = scan.family === "flat-list";
  if (inferred && !input.layout) throw new Error("Global konum yok; türetilmiş yerleşim için layout ring açıkça seçilmeli.");
  const layout = input.layout || "source";
  if (inferred && layout !== "ring") throw new Error("Düz listede global koordinat yok; layout ring olmalı.");
  if (layout === "ring" && focal?.measured) throw new Error("Ölçülü sahne halka yerleşimine taşınamaz; source veya normalized seç.");
  return { ...input, name: input.name || defaultName, layout, groups, focal,
    excludedGroups: input.excludedGroups || [], excludedCells: input.excludedCells || [] };
}

export const sourceTarget = (seat, row, transform) => {
  const raw = { x: (seat.x - transform.cx) * transform.scaleX,
    y: (seat.y - transform.cy) * transform.scaleY };
  if (!transform.normalized) return raw;
  const vertical = row.axis === "vertical", key = vertical ? "row" : "column", axis = vertical ? "y" : "x";
  const middle = median(row.seats.map((s) => s[key]));
  const center = median(row.seats.map((s) => (s[axis] - transform[axis === "x" ? "cx" : "cy"])
    * transform[axis === "x" ? "scaleX" : "scaleY"]));
  return { ...raw, [axis]: center + (seat[key] - middle) * 50 };
};

export function sourceCompiler(scan, analysis) {
  const groups = analysis.groups;
  const source = allSpreadsheetSeats(groups);
  const xGaps = [], yGaps = [];
  for (const group of groups) {
    const ys = [];
    for (const row of group.rows) {
      const seats = row.seats.toSorted((a, b) => a.x - b.x);
      for (let i = 1; i < seats.length; i++) if (seats[i].x > seats[i - 1].x) xGaps.push(seats[i].x - seats[i - 1].x);
      ys.push(median(seats.map((s) => s.y)));
    }
    ys.sort((a, b) => a - b);
    for (let i = 1; i < ys.length; i++) if (ys[i] > ys[i - 1]) yGaps.push(ys[i] - ys[i - 1]);
  }
  const sourcePitch = { x: median(xGaps) || 64, y: median(yGaps) || 20 };
  const normalized = analysis.layout === "normalized";
  const scale = Math.max(50 / sourcePitch.x, 90 / sourcePitch.y);
  const minXGap = extent(xGaps)?.min || sourcePitch.x;
  const minYGap = extent(yGaps)?.min || sourcePitch.y;
  const scaleX = normalized ? Math.max(50 / sourcePitch.x, 50 / minXGap) : scale;
  const scaleY = normalized ? Math.max(90 / sourcePitch.y, 90 / minYGap) : scale;
  const sourceBounds = pointBounds(source);
  const cx = (sourceBounds.x0 + sourceBounds.x1) / 2;
  const cy = (sourceBounds.y0 + sourceBounds.y1) / 2;
  const transform = { cx, cy, scaleX, scaleY, normalized };
  const world = (s, row) => sourceTarget(s, row, transform);
  const mapping = [];
  const blocks = groups.map((group) => {
    const rot = group.rows.filter((r) => r.axis === "vertical").length > group.rows.length / 2 ? 90 : 0;
    const a = rot * Math.PI / 180, cos = Math.cos(a), sin = Math.sin(a);
    const project = (p) => ({ x: p.x * cos + p.y * sin, y: -p.x * sin + p.y * cos });
    const rowCenter = (row) => ({ x: median(row.seats.map((s) => world(s, row).x)),
      y: median(row.seats.map((s) => world(s, row).y)) });
    const rows = group.rows.toSorted((ra, rb) => project(rowCenter(ra)).y - project(rowCenter(rb)).y);
    const first = rowCenter(rows[0]), x = first.x, y = first.y;
    const local = (p) => project({ x: p.x - x, y: p.y - y });
    const rowCenters = rows.map((r) => local(rowCenter(r)));
    const seatGaps = rows.flatMap((row) => {
      const xs = row.seats.map((s) => local(world(s, row)).x).toSorted((u, v) => u - v);
      return xs.slice(1).map((v, i) => v - xs[i]).filter((v) => v > 0);
    });
    let block = gr({ label: group.label, name: group.name || group.label, level: group.level,
      x, y, rot, rows: rows.length, counts: rows.map((r) => r.seats.length).join(","),
      seatGap: median(seatGaps) || 50,
      rowGap: median(rowCenters.slice(1).map((p, i) => p.y - rowCenters[i].y).filter((v) => v > 0)) || 90,
      pad: 0, align: "center", num: { ...DEF_NUM, rowScheme: "custom",
        rowCustom: rows.map((r) => r.label).join(",") } });
    const P = prep(block), ov = {}, envelopes = [];
    rows.forEach((row, r) => {
      const generated = rowPts(block, r, P);
      const rowLocal = [];
      row.seats.map((sourceSeat) => ({ sourceSeat, target: world(sourceSeat, row) }))
        .toSorted((u, v) => local(u.target).x - local(v.target).x).forEach(({ sourceSeat, target }, c) => {
        const localTarget = local(target);
        ov[`${r},${c}`] = { dx: localTarget.x - generated[c].x, dy: localTarget.y - generated[c].y,
          id: keyOf(sourceSeat), label: seatLabel(sourceSeat) };
        rowLocal.push(localTarget);
        mapping.push({ sourceId: keyOf(sourceSeat), blockId: block.id, r, c, target,
          label: seatLabel(sourceSeat), row: row.label, block: group.label, level: group.level || "" });
        });
      const bounds = pointBounds(rowLocal);
      envelopes.push({ y: median(rowLocal.map((p) => p.y)),
        left: bounds.x0 - 21, right: bounds.x1 + 21 });
    });
    const left = envelopes.flatMap((e) => [{ x: e.left, y: e.y - 19.5 }, { x: e.left, y: e.y + 19.5 }]);
    const right = [...envelopes].reverse().flatMap((e) => [{ x: e.right, y: e.y + 19.5 }, { x: e.right, y: e.y - 19.5 }]);
    block = reLabel({ ...block, ov, foot: [...left, ...right] }, group.label);
    block.rowLabelSources = rows.map((r) => r.labelSource);
    return block;
  });
  const focal = analysis.focal;
  const shapes = focal?.measured ? [{ id: nid("s"), kind: "rect", type: focal.type,
    label: focal.label, x: (focal.bbox.x + focal.bbox.w / 2 - cx) * scaleX,
    y: (focal.bbox.y + focal.bbox.h / 2 - cy) * scaleY,
    w: focal.bbox.w * scaleX, h: focal.bbox.h * scaleY, rot: 0, capacity: 0, fs: 120 }] : [];
  const focalTarget = shapes[0] ? { type: shapes[0].type, x: shapes[0].x, y: shapes[0].y,
    w: shapes[0].w, h: shapes[0].h } : null;
  return { blocks, shapes, mapping, scale, scaleMultiplier: 1, focalTarget,
    transform, sourcePitch, sourceGeometry: !normalized, layout: analysis.layout };
}

export function ringCompiler(scan, analysis, { makePlan = (blocks) => ({ blocks, shapes: [] }), hardFindings = () => [] } = {}) {
  const groups = analysis.groups.toSorted((a, b) => Number(a.label.match(/\d+/)?.[0] || 0)
    - Number(b.label.match(/\d+/)?.[0] || 0));
  const slots = (row) => row.seats.map((s, i) => i);
  const width = (row) => row.seats.length;
  const n = groups.length;
  let maxCount = 0;
  for (const group of groups) for (const row of group.rows) maxCount = Math.max(maxCount, width(row));
  const baseRadius = Math.max(1200, Math.ceil((n * (maxCount * 50 + 140)) / (Math.PI * 2) / 100) * 100);
  const blocks = groups.map((group, i) => {
    const rows = group.rows.toSorted((a, b) => String(a.label).localeCompare(String(b.label), "tr", { numeric: true }));
    const aCenter = i * 360 / n;
    const block = fanB({ label: group.label, name: group.name || group.label, level: group.level,
      x: 0, y: 0, rows: rows.length, counts: rows.map(width).join(","),
      r0: baseRadius, rowGap: 90, seatGap: 50, mode: "pitch", aCenter,
      num: { ...DEF_NUM, rowScheme: "custom", rowCustom: rows.map((r) => r.label).join(",") } });
    const ov = {};
    rows.forEach((row, r) => {
      for (let c = 0; c < width(row); c++) ov[`${r},${c}`] = { rm: true };
      const columns = slots(row);
      row.seats.forEach((s, i) => { ov[`${r},${columns[i]}`] = { id: keyOf(s), label: seatLabel(s) }; });
    });
    return reLabel({ ...block, ov }, group.label);
  });
  let clean = false;
  for (let attempt = 0; attempt < 200; attempt++) {
    blocks.forEach((b) => { b.r0 = baseRadius + attempt * 100; });
    const hard = hardFindings(makePlan(blocks));
    if (!hard.length) { clean = true; break; }
  }
  if (!clean) throw new Error("Bölümler 200 yarıçap denemesinde çakışmasız yerleştirilemedi; aktif plan değişmedi.");
  const mapping = [];
  groups.forEach((group, bi) => {
    const rows = group.rows.toSorted((a, b) => String(a.label).localeCompare(String(b.label), "tr", { numeric: true }));
    const built = buildSeats(blocks[bi], buildMeta(blocks[bi]));
    const byCell = new Map(built.seats.map((s) => [`${s.r},${s.c}`, s]));
    rows.forEach((row, r) => row.seats.forEach((s, i) => {
      const c = slots(row)[i], actual = byCell.get(`${r},${c}`);
      mapping.push({ sourceId: keyOf(s), blockId: blocks[bi].id, r, c,
        label: seatLabel(s), row: row.label, block: group.label, level: group.level || "",
        target: actual ? { x: actual.x, y: actual.y } : null });
    }));
  });
  return { blocks, shapes: [], mapping, scale: null, sourceGeometry: false, layout: "ring" };
}

export function openLocalAisles(compiled, plan, hardFindings) {
  if (compiled.layout !== "normalized") return compiled;
  const shifts = {};
  const original = new Map(plan.blocks.map((b) => [b.id, buildMeta(b).bbox]));
  for (let attempt = 0; attempt < plan.blocks.length * plan.blocks.length; attempt++) {
    const hard = hardFindings(plan);
    const narrow = hard.find((f) => f.id === "narrow-aisle");
    if (!narrow || hard.some((f) => !["narrow-aisle", "seat-clash", "footprint-overlap-same-level"].includes(f.id))) break;
    const pair = (narrow.ids || []).slice(0, 2).map((id) => plan.blocks.find((b) => b.id === id));
    if (pair.length !== 2 || pair.some((b) => !b)) break;
    const boxes = pair.map((b) => buildMeta(b).bbox);
    const gap = (axis) => Math.max(boxes[0][axis + "0"], boxes[1][axis + "0"])
      - Math.min(boxes[0][axis + "1"], boxes[1][axis + "1"]);
    const initial = pair.map((b) => original.get(b.id));
    const sourceGap = (axis) => Math.max(initial[0][axis + "0"], initial[1][axis + "0"])
      - Math.min(initial[0][axis + "1"], initial[1][axis + "1"]);
    const axis = sourceGap("x") >= sourceGap("y") ? "x" : "y";
    const index = pair[0][axis] > pair[1][axis] ? 0 : 1;
    const block = pair[index], delta = Math.max(1, 120 - gap(axis));
    block[axis] += delta;
    shifts[block.id] ||= { x: 0, y: 0 };
    shifts[block.id][axis] += delta;
  }
  compiled.blockShifts = shifts;
  for (const mapping of compiled.mapping) {
    const shift = shifts[mapping.blockId];
    if (shift && mapping.target) mapping.target = {
      x: mapping.target.x + shift.x, y: mapping.target.y + shift.y,
    };
  }
  return compiled;
}

export function compileSpreadsheetLayout(scan, analysis, { makePlan, hardFindings }) {
  const compiled = analysis.layout === "ring"
    ? ringCompiler(scan, analysis, { makePlan, hardFindings })
    : sourceCompiler(scan, analysis);
  const plan = makePlan(compiled.blocks, compiled.shapes);
  openLocalAisles(compiled, plan, hardFindings);
  return { compiled, plan };
}

function boxIou(expected, actual) {
  if (!expected || !actual) return expected || actual ? 0 : null;
  const a = { x0: expected.x - expected.w / 2, x1: expected.x + expected.w / 2,
    y0: expected.y - expected.h / 2, y1: expected.y + expected.h / 2 };
  const b = { x0: actual.x - actual.w / 2, x1: actual.x + actual.w / 2,
    y0: actual.y - actual.h / 2, y1: actual.y + actual.h / 2 };
  const intersection = Math.max(0, Math.min(a.x1, b.x1) - Math.max(a.x0, b.x0))
    * Math.max(0, Math.min(a.y1, b.y1) - Math.max(a.y0, b.y0));
  return +(intersection / (expected.w * expected.h + actual.w * actual.h - intersection)).toFixed(4);
}

export function verifySpreadsheetLayout(plan, scan, analysis, compiled, {
  hardFindings = () => [], seal = false, sourceHash = null,
} = {}) {
  const actualById = new Map(), actualSeats = [];
  plan.blocks.forEach((b) => buildSeats(b, buildMeta(b), plan.idTemplate).seats.forEach((s) => {
    if (s.gap) return;
    actualSeats.push({ ...s, blockId: b.id });
    actualById.set(s.id, { ...s, blockId: b.id });
  }));
  const mappings = new Map(compiled.mapping.map((m) => [m.sourceId, m]));
  const differences = [], identities = new Set(), duplicateLabels = [];
  let matched = 0, close = 0;
  for (const group of analysis.groups || []) for (const row of group.rows) for (const seat of row.seats) {
    const sourceId = keyOf(seat), m = mappings.get(sourceId), actual = actualById.get(sourceId);
    const identity = JSON.stringify([group.groupId, row.label, seatLabel(seat)]);
    if (identities.has(identity)) duplicateLabels.push({ sourceId, block: group.label, row: row.label, label: seatLabel(seat) });
    identities.add(identity);
    if (!actual || !m) { differences.push({ sourceId, issue: "missing" }); continue; }
    matched++;
    const shift = compiled.blockShifts?.[m.blockId] || { x: 0, y: 0 };
    const baseTarget = compiled.transform ? sourceTarget(seat, row, compiled.transform) : m.target;
    const target = baseTarget ? { x: baseTarget.x + shift.x, y: baseTarget.y + shift.y } : null;
    const distance = target ? Math.hypot(actual.x - target.x, actual.y - target.y) : Infinity;
    if (distance <= 0.1) close++;
    else differences.push({ sourceId, issue: "position", distance: +distance.toFixed(2) });
    if (String(actual.num) !== String(seatLabel(seat)) || String(actual.row) !== String(row.label)
      || actual.block !== group.label || actual.level !== (group.level || "")
      || actual.blockId !== m.blockId || actual.r !== m.r || actual.c !== m.c || actual.gap) {
      differences.push({ sourceId, issue: "identity" });
    }
  }
  const sourceSeats = allSpreadsheetSeats(analysis.groups || []).length;
  const planSeats = actualSeats.length, duplicateIds = planSeats - actualById.size;
  const sourceRows = (analysis.groups || []).reduce((n, g) => n + g.rows.length, 0);
  const planRows = plan.blocks.reduce((n, b) => n + prep(b).counts.length, 0);
  const hard = hardFindings(plan).filter((f) => f.t === "err" && DELIVERY_BLOCKERS.has(f.id)
    && !String(f.id).startsWith("source-"));
  const expectedShapes = compiled.focalTarget ? 1 : 0;
  const inventedObjects = Math.max(0, (plan.shapes || []).length - expectedShapes);
  const focalIoU = compiled.focalTarget
    ? boxIou(compiled.focalTarget, (plan.shapes || []).find((s) => s.type === compiled.focalTarget.type))
    : null;
  const sourceDuplicateLabels = scan.conflicts?.duplicateLabels || [];
  const reviewed = new Set((analysis.excludedCells || []).map((c) => c.sourceId));
  const unresolvedCells = (scan.unresolvedCells || []).filter((c) => !reviewed.has(c.sourceId));
  const positionalMatch = sourceSeats ? close / sourceSeats : 0;
  const identityVerified = sourceDuplicateLabels.length === 0 && duplicateLabels.length === 0
    && duplicateIds === 0 && !differences.some((d) => d.issue === "identity");
  const verified = sourceSeats > 0 && matched === sourceSeats && planSeats === sourceSeats
    && sourceRows === planRows && positionalMatch === 1
    && (focalIoU == null || focalIoU >= 0.9) && plan.blocks.length === (analysis.groups || []).length
    && hard.length === 0 && inventedObjects === 0 && unresolvedCells.length === 0;
  const metrics = { verified, sourceSeats, planSeats, matchedSeats: matched,
    extraSeats: Math.max(0, planSeats - matched), sourceRows, planRows,
    positionalMatch: +positionalMatch.toFixed(4), focalIoU,
    verifiedSourceGeometry: compiled.sourceGeometry && verified,
    verifiedInferredLayout: !compiled.sourceGeometry && verified,
    capacityConsistent: scan.capacity?.consistent !== false,
    capacityChecked: scan.capacity?.declared != null,
    sourceWarnings: scan.warnings || [],
    unresolvedCells, excludedCells: analysis.excludedCells || [],
    verifiedIdentity: identityVerified, duplicateIds, layout: compiled.layout,
    verificationScope: "source-data-and-generated-layout",
    architecturalGeometryVerified: false,
    inferredRowLabels: (analysis.groups || []).flatMap((g) => g.rows
      .filter((r) => r.labelSource === "sheet-row").map((r) => ({ groupId: g.groupId, rowId: r.rowId, label: r.label }))),
    hardFindings: [...new Set(hard.map((f) => f.id))], inventedObjects,
    duplicateLabels: sourceDuplicateLabels.length ? sourceDuplicateLabels : duplicateLabels,
    differences: differences.slice(0, 100), sourceHash };
  return { metrics, plan: verified && seal ? markSourceVerified(plan, {
    kind: "spreadsheet", scanId: scan.scanId, sourceHash,
    geometryVerified: true, identityVerified, sourceVerified: true,
    notes: scan.capacity?.consistent === false
      ? [`Kapasite özeti ${scan.capacity.declared}; hücre koltuğu ${scan.capacity.detected}`] : [],
  }) : plan };
}

export function differenceOverlay(scan, compiled, byId) {
  const canvas = createCanvas(1000, 700), ctx = canvas.getContext("2d");
  ctx.fillStyle = "#fff"; ctx.fillRect(0, 0, canvas.width, canvas.height);
  const pts = compiled.mapping.map((m) => m.target).filter(Boolean);
  if (!pts.length) return canvas.toBuffer("image/png");
  const { x0, x1, y0, y1 } = pointBounds(pts);
  const scale = Math.min(900 / Math.max(1, x1 - x0), 600 / Math.max(1, y1 - y0));
  compiled.mapping.forEach((m) => {
    const actual = byId.get(m.sourceId), target = m.target;
    if (!target) return;
    ctx.fillStyle = actual && Math.hypot(actual.x - target.x, actual.y - target.y) <= 0.1 ? "#16a34a" : "#e11d48";
    ctx.beginPath(); ctx.arc(50 + (target.x - x0) * scale, 50 + (target.y - y0) * scale, 3, 0, Math.PI * 2); ctx.fill();
  });
  return canvas.toBuffer("image/png");
}
