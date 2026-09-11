import path from "node:path";
import { createCanvas } from "@napi-rs/canvas";
import { gr, fanB } from "../../src/venues/builders.js";
import { buildMeta, buildSeats, prep, rowPts } from "../../src/core/geometry.js";
import { DEF_NUM, reLabel } from "../../src/core/labels.js";
import { nid } from "../../src/core/ids.js";
import { planHome } from "../../src/core/plan.js";
import { MUTATION_BLOCKERS, yeniPlan } from "../session.mjs";
import { scanSpreadsheet, SPREADSHEET_LIMITS } from "../spreadsheet-scan.mjs";

const json = (o, image) => ({ content: [
  { type: "text", text: JSON.stringify(o, null, 2) },
  ...(image ? [{ type: "image", data: image.toString("base64"), mimeType: "image/png" }] : []),
] });
const median = (xs) => {
  const a = xs.filter(Number.isFinite).toSorted((x, y) => x - y);
  return a.length ? (a[(a.length - 1) >> 1] + a[a.length >> 1]) / 2 : 0;
};
const keyOf = (s) => `${s.sheet}!${s.address}`;
const allSeats = (groups) => groups.flatMap((g) => g.rows.flatMap((r) => r.seats));
const seatLabel = (s) => s.label.match(/\d+[A-Z]?$/iu)?.[0] || s.label;

function sourceCompiler(scan, analysis, scaleMultiplier = 1) {
  const groups = analysis.groups;
  const source = allSeats(groups);
  const gaps = source.map((s) => Math.min(...source.filter((q) => q !== s)
    .map((q) => Math.hypot(s.x - q.x, s.y - q.y)))).filter(Number.isFinite);
  const scale = 50 / (median(gaps) || 64) * scaleMultiplier;
  const cx = (Math.min(...source.map((s) => s.x)) + Math.max(...source.map((s) => s.x))) / 2;
  const cy = (Math.min(...source.map((s) => s.y)) + Math.max(...source.map((s) => s.y))) / 2;
  const world = (s) => ({ x: (s.x - cx) * scale, y: (s.y - cy) * scale });
  const mapping = [];
  const blocks = groups.map((group) => {
    const rows = group.rows.toSorted((a, b) => median(a.seats.map((s) => s.y)) - median(b.seats.map((s) => s.y)));
    const rowCenters = rows.map((r) => ({ x: median(r.seats.map((s) => world(s).x)),
      y: median(r.seats.map((s) => world(s).y)) }));
    const x = median(rowCenters.map((p) => p.x)), y = rowCenters[0].y;
    let block = gr({ label: group.label, name: group.name || group.label, level: group.level,
      x, y, rows: rows.length, counts: rows.map((r) => r.seats.length).join(","),
      seatGap: 50, rowGap: median(rowCenters.slice(1).map((p, i) => p.y - rowCenters[i].y)) || 90,
      pad: 0, align: "center", num: { ...DEF_NUM, rowScheme: "custom",
        rowCustom: rows.map((r) => r.label).join(",") } });
    const P = prep(block), ov = {}, envelopes = [];
    rows.forEach((row, r) => {
      const generated = rowPts(block, r, P);
      const rowLocal = [];
      row.seats.toSorted((a, b) => a.x - b.x).forEach((sourceSeat, c) => {
        const target = world(sourceSeat), localTarget = { x: target.x - x, y: target.y - y };
        ov[`${r},${c}`] = { dx: localTarget.x - generated[c].x, dy: localTarget.y - generated[c].y,
          id: keyOf(sourceSeat), label: seatLabel(sourceSeat) };
        rowLocal.push(localTarget);
        mapping.push({ sourceId: keyOf(sourceSeat), blockId: block.id, r, c, target });
      });
      envelopes.push({ y: median(rowLocal.map((p) => p.y)),
        left: Math.min(...rowLocal.map((p) => p.x)) - 21,
        right: Math.max(...rowLocal.map((p) => p.x)) + 21 });
    });
    const left = envelopes.flatMap((e) => [{ x: e.left, y: e.y - 19.5 }, { x: e.left, y: e.y + 19.5 }]);
    const right = [...envelopes].reverse().flatMap((e) => [{ x: e.right, y: e.y + 19.5 }, { x: e.right, y: e.y - 19.5 }]);
    const foot = [...left, ...right];
    block = reLabel({ ...block, ov, ...(foot ? { foot } : {}) }, group.label);
    return block;
  });
  const shapes = scan.focal?.measured ? [{ id: nid("s"), kind: "rect", type: scan.focal.type,
    label: scan.focal.label, x: (scan.focal.bbox.x + scan.focal.bbox.w / 2 - cx) * scale,
    y: (scan.focal.bbox.y + scan.focal.bbox.h / 2 - cy) * scale,
    w: scan.focal.bbox.w * scale, h: scan.focal.bbox.h * scale, rot: 0, capacity: 0, fs: 120 }] : [];
  const focalTarget = shapes[0] ? { type: shapes[0].type, x: shapes[0].x, y: shapes[0].y,
    w: shapes[0].w, h: shapes[0].h } : null;
  return { blocks, shapes, mapping, scale, scaleMultiplier, focalTarget, sourceGeometry: true };
}

function ringCompiler(scan, analysis, session) {
  const groups = analysis.groups.toSorted((a, b) => Number(a.label.match(/\d+/)?.[0] || 0)
    - Number(b.label.match(/\d+/)?.[0] || 0));
  const n = groups.length, maxCount = Math.max(...groups.flatMap((g) => g.rows.map((r) => r.seats.length)));
  const baseRadius = Math.max(1200, Math.ceil((n * (maxCount * 50 + 140)) / (Math.PI * 2) / 100) * 100);
  const blocks = groups.map((group, i) => {
    const rows = group.rows.toSorted((a, b) => String(a.label).localeCompare(String(b.label), "tr", { numeric: true }));
    const aCenter = i * 360 / n;
    let block = fanB({ label: group.label, name: group.name || group.label, level: group.level,
      x: 0, y: 0, rows: rows.length, counts: rows.map((r) => r.seats.length).join(","),
      r0: baseRadius, rowGap: 90, seatGap: 50, mode: "pitch", aCenter,
      num: { ...DEF_NUM, rowScheme: "custom", rowCustom: rows.map((r) => r.label).join(",") } });
    const ov = {};
    rows.forEach((row, r) => row.seats.forEach((s, c) => {
      ov[`${r},${c}`] = { id: keyOf(s), label: seatLabel(s) };
    }));
    return reLabel({ ...block, ov }, group.label);
  });
  let clean = false;
  for (let attempt = 0; attempt < 200; attempt++) {
    blocks.forEach((b) => { b.r0 = baseRadius + attempt * 100; });
    const draft = { ...yeniPlan("spreadsheet-preview", analysis.name), blocks };
    const hard = session.derive(draft).findings.filter((f) => f.t === "err" && MUTATION_BLOCKERS.has(f.id));
    if (!hard.length) { clean = true; break; }
  }
  if (!clean) throw new Error("Bölümler 200 yarıçap denemesinde çakışmasız yerleştirilemedi; aktif plan değişmedi.");
  const mapping = [];
  groups.forEach((group, bi) => {
    const rows = group.rows.toSorted((a, b) => String(a.label).localeCompare(String(b.label), "tr", { numeric: true }));
    const built = buildSeats(blocks[bi], buildMeta(blocks[bi]));
    rows.forEach((row, r) => row.seats.forEach((s, c) => {
      const actual = built.seats.find((x) => x.r === r && x.c === c);
      mapping.push({ sourceId: keyOf(s), blockId: blocks[bi].id, r, c,
        target: actual ? { x: actual.x, y: actual.y } : null });
    }));
  });
  return { blocks, shapes: [], mapping, scale: null, sourceGeometry: false };
}

function hardFindings(session, plan) {
  return session.derive(plan).findings.filter((f) => f.t === "err" && MUTATION_BLOCKERS.has(f.id));
}

export function registerSpreadsheetTools(server, session, z) {
  server.registerTool("scan_spreadsheet", {
    title: "Excel oturma planını yerel olarak tara",
    description: "Yerel .xls/.xlsx dosyasındaki hücre konumlarını, blokları, sıraları, koltukları ve sahne/perde/saha odağını planı değiştirmeden ölçer.",
    inputSchema: { path: z.string().min(1).describe("Yerel .xls veya .xlsx dosya yolu") },
  }, async ({ path: file }) => {
    const scan = await scanSpreadsheet(file);
    session.spreadsheetScan = scan;
    session.spreadsheetAnalysis = null;
    session.spreadsheetCompilation = null;
    session.spreadsheetVerified = false;
    const groups = scan.groups.map((g) => ({ groupId: g.groupId, label: g.label, level: g.level,
      sheet: g.sheet, rows: g.rows.map((r) => ({ rowId: r.rowId, label: r.label,
        seatCount: r.seats.length, addresses: r.seats.slice(0, 8).map((s) => s.address) })),
      seatCount: g.seatCount }));
    return json({ scanId: scan.scanId, family: scan.family, sheets: scan.sheets,
      seatCount: scan.seatCount, rowCount: scan.rowCount, groups, focal: scan.focal,
      capacity: scan.capacity, conflicts: scan.conflicts, limits: SPREADSHEET_LIMITS,
      next: "submit_spreadsheet_analysis" }, scan.overlay);
  });

  server.registerTool("submit_spreadsheet_analysis", {
    title: "Excel blok anlamlarını onayla",
    description: "Tarayıcının fiziksel hücrelerini değiştirmeden yalnız plan adı, yerleşim türü ve grup ad/kat etiketlerini düzeltir.",
    inputSchema: {
      scanId: z.string(),
      venueKind: z.enum(["cinema", "theater", "stadium", "arena", "general"]),
      name: z.string().optional(),
      layout: z.enum(["source", "ring"]).optional(),
      groupOverrides: z.array(z.object({ groupId: z.string(), label: z.string().optional(),
        level: z.string().optional(), name: z.string().optional() })).optional(),
      excludedGroups: z.array(z.object({ groupId: z.string(), reason: z.string().min(3) })).optional(),
    },
  }, async (a) => {
    const scan = session.spreadsheetScan;
    if (!scan || scan.scanId !== a.scanId) throw new Error("Geçerli Excel taraması yok; scan_spreadsheet çağır.");
    if (scan.family === "needsReview") throw new Error("Excel türü güvenle belirlenemedi; plan değişmedi.");
    if (scan.conflicts.focal) throw new Error("Çelişen odak alanları çözülmeden Excel derlenemez.");
    const excluded = new Set((a.excludedGroups || []).map((x) => x.groupId));
    const overrides = new Map((a.groupOverrides || []).map((x) => [x.groupId, x]));
    for (const id of [...excluded, ...overrides.keys()]) {
      if (!scan.groups.some((g) => g.groupId === id)) throw new Error("Bilinmeyen Excel grubu: " + id);
    }
    const groups = scan.groups.filter((g) => !excluded.has(g.groupId)).map((g) => ({ ...g,
      ...Object.fromEntries(Object.entries(overrides.get(g.groupId) || {}).filter(([k, v]) => k !== "groupId" && v)) }));
    if (!groups.length) throw new Error("Derlenecek Excel grubu kalmadı.");
    const inferred = scan.family === "section-manifest" || scan.family === "flat-list";
    const layout = a.layout || (inferred ? "ring" : "source");
    if (inferred && layout !== "ring") throw new Error("Bölüm manifestosunda global koordinat yok; layout ring olmalı.");
    session.spreadsheetAnalysis = { ...a, name: a.name || path.basename(scan.path, path.extname(scan.path)),
      layout, groups, excludedGroups: a.excludedGroups || [] };
    session.spreadsheetCompilation = null;
    session.spreadsheetVerified = false;
    return json({ accepted: true, groups: groups.length, seats: allSeats(groups).length,
      layout, inferred, next: "build_spreadsheet_layout" });
  });

  server.registerTool("build_spreadsheet_layout", {
    title: "Excel yerleşimini atomik olarak kur",
    description: "Kaynak hücrelerinden geçici plan üretir; sert geometri ve veri kontrolleri temizse canlı editöre tek atomik güncelleme yollar.",
    inputSchema: {},
  }, async () => {
    const scan = session.spreadsheetScan, analysis = session.spreadsheetAnalysis;
    if (!scan) throw new Error("Önce scan_spreadsheet çağır.");
    if (!analysis) throw new Error("Önce submit_spreadsheet_analysis çağır.");
    let compiled, plan, hard;
    for (let attempt = 0; attempt < (analysis.layout === "ring" ? 1 : 200); attempt++) {
      compiled = analysis.layout === "ring" ? ringCompiler(scan, analysis, session)
        : sourceCompiler(scan, analysis, 1 + attempt * 0.05);
      plan = { ...yeniPlan("excel-" + scan.scanId.slice(-12), analysis.name),
        blocks: compiled.blocks, shapes: compiled.shapes };
      plan = { ...plan, home: planHome({ ...plan, home: null }) };
      hard = hardFindings(session, plan);
      if (!hard.length) break;
    }
    if (hard.length) throw new Error("Excel yerleşimi geri alındı; sert bulgu: "
      + hard.map((f) => `${f.id}${f.d ? ` (${f.d})` : f.ids?.length
        ? ` (${f.ids.map((id) => plan.blocks.find((b) => b.id === id)?.label || id).join(", ")})` : ""}`).join(" · "));
    session.spreadsheetCompilation = compiled;
    session.spreadsheetVerified = false;
    const warning = scan.capacity.consistent ? "" : ` · kapasite özeti ${scan.capacity.declared}, hücre koltuğu ${scan.capacity.detected}`;
    session.yeni(plan, { preserveSpreadsheet: true,
      baslik: `Excel yerleşimi kuruldu: ${compiled.blocks.length} blok${warning}` });
    return json({ built: true, sourceSeats: compiled.mapping.length,
      planSeats: session.summaryData().seatCount, blocks: compiled.blocks.length,
      inferredLayout: !compiled.sourceGeometry, scaleMultiplier: compiled.scaleMultiplier || 1,
      capacity: scan.capacity });
  });

  server.registerTool("verify_spreadsheet", {
    title: "Planı Excel hücreleriyle birebir doğrula",
    description: "Her kaynak hücresini tek plan koltuğuyla eşler; fazlalık, eksik, konum ve sert geometri bulgularını fark görseliyle raporlar.",
    inputSchema: {},
  }, async () => {
    const scan = session.spreadsheetScan, compiled = session.spreadsheetCompilation;
    if (!scan || !compiled) throw new Error("Önce build_spreadsheet_layout çağır.");
    const plan = session.need(), byId = new Map();
    plan.blocks.forEach((b) => buildSeats(b, buildMeta(b), plan.idTemplate).seats.forEach((s) => byId.set(s.id, s)));
    let matched = 0, close = 0;
    const differences = [];
    compiled.mapping.forEach((m) => {
      const actual = byId.get(m.sourceId);
      if (!actual) { differences.push({ sourceId: m.sourceId, issue: "missing" }); return; }
      matched++;
      const distance = m.target ? Math.hypot(actual.x - m.target.x, actual.y - m.target.y) : 0;
      if (!compiled.sourceGeometry || distance <= 17.5) close++;
      else differences.push({ sourceId: m.sourceId, issue: "position", distance: +distance.toFixed(2) });
    });
    const sourceSeats = compiled.mapping.length, planSeats = byId.size;
    const sourceRows = session.spreadsheetAnalysis.groups.reduce((n, g) => n + g.rows.length, 0);
    const planRows = plan.blocks.reduce((n, b) => n + prep(b).counts.length, 0);
    const hard = hardFindings(session, plan), positionalMatch = sourceSeats ? close / sourceSeats : 0;
    const expectedShapes = scan.focal?.measured ? 1 : 0;
    const inventedObjects = Math.max(0, plan.shapes.length - expectedShapes);
    const focalIoU = compiled.focalTarget ? boxIou(compiled.focalTarget,
      plan.shapes.find((s) => s.type === compiled.focalTarget.type)) : null;
    const verified = matched === sourceSeats && planSeats === sourceSeats && positionalMatch >= 0.99
      && sourceRows === planRows && (focalIoU == null || focalIoU >= 0.9)
      && hard.length === 0 && inventedObjects === 0;
    session.spreadsheetVerified = verified;
    if (verified) session.notify(scan.capacity.consistent
      ? "Excel kaynak doğrulaması geçti"
      : `Excel geometri doğrulaması geçti; kapasite özeti ${scan.capacity.declared}, hücre koltuğu ${scan.capacity.detected}`);
    return json({ verified, sourceSeats, planSeats, sourceRows, planRows, matchedSeats: matched,
      extraSeats: Math.max(0, planSeats - matched), positionalMatch: +positionalMatch.toFixed(4),
      focalIoU,
      verifiedSourceGeometry: compiled.sourceGeometry && verified,
      verifiedInferredLayout: !compiled.sourceGeometry && verified,
      capacityConsistent: scan.capacity.consistent,
      verifiedIdentity: scan.conflicts.duplicateLabels.length === 0,
      hardFindings: [...new Set(hard.map((f) => f.id))], inventedObjects,
      duplicateLabels: scan.conflicts.duplicateLabels, differences: differences.slice(0, 100) },
    differenceOverlay(scan, compiled, byId));
  });
}

function boxIou(expected, actual) {
  if (!actual) return 0;
  const a = { x0: expected.x - expected.w / 2, x1: expected.x + expected.w / 2,
    y0: expected.y - expected.h / 2, y1: expected.y + expected.h / 2 };
  const b = { x0: actual.x - actual.w / 2, x1: actual.x + actual.w / 2,
    y0: actual.y - actual.h / 2, y1: actual.y + actual.h / 2 };
  const intersection = Math.max(0, Math.min(a.x1, b.x1) - Math.max(a.x0, b.x0))
    * Math.max(0, Math.min(a.y1, b.y1) - Math.max(a.y0, b.y0));
  return +(intersection / (expected.w * expected.h + actual.w * actual.h - intersection)).toFixed(4);
}

function differenceOverlay(scan, compiled, byId) {
  const canvas = createCanvas(1000, 700), ctx = canvas.getContext("2d");
  ctx.fillStyle = "#fff"; ctx.fillRect(0, 0, canvas.width, canvas.height);
  const pts = compiled.mapping.map((m) => m.target).filter(Boolean);
  if (!pts.length) return canvas.toBuffer("image/png");
  const x0 = Math.min(...pts.map((p) => p.x)), x1 = Math.max(...pts.map((p) => p.x));
  const y0 = Math.min(...pts.map((p) => p.y)), y1 = Math.max(...pts.map((p) => p.y));
  const scale = Math.min(900 / Math.max(1, x1 - x0), 600 / Math.max(1, y1 - y0));
  compiled.mapping.forEach((m) => {
    const actual = byId.get(m.sourceId), target = m.target;
    if (!target) return;
    ctx.fillStyle = actual ? "#16a34a" : "#e11d48";
    ctx.beginPath(); ctx.arc(50 + (target.x - x0) * scale, 50 + (target.y - y0) * scale, 3, 0, Math.PI * 2); ctx.fill();
  });
  return canvas.toBuffer("image/png");
}
