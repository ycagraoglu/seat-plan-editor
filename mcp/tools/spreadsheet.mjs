import path from "node:path";
import { buildMeta, buildSeats } from "../../src/core/geometry.js";
import { planHome } from "../../src/core/plan.js";
import { MUTATION_BLOCKERS, yeniPlan } from "../session.mjs";
import { scanSpreadsheet, SPREADSHEET_LIMITS } from "../spreadsheet-scan.mjs";
import {
  allSpreadsheetSeats,
  normalizeSpreadsheetAnalysis,
  compileSpreadsheetLayout,
  verifySpreadsheetLayout,
  differenceOverlay as commonDifferenceOverlay,
} from "../../src/core/spreadsheet-import.js";

const json = (o, image) => ({ content: [
  { type: "text", text: JSON.stringify(o, null, 2) },
  ...(image ? [{ type: "image", data: image.toString("base64"), mimeType: "image/png" }] : []),
] });

function hardFindings(session, plan) {
  return session.derive(plan).findings.filter((f) => f.t === "err" && MUTATION_BLOCKERS.has(f.id));
}

export function registerSpreadsheetTools(server, session, z) {
  server.registerTool("scan_spreadsheet", {
    title: "Excel oturma planını yerel olarak tara",
    description: "Tek görünür sayfalı yerel .xls/.xlsx dosyasındaki hücre konumlarını, blokları, sıraları, koltukları ve sahne/perde/saha odağını planı değiştirmeden ölçer. Birden fazla görünür sayfayı Türkçe düzeltme mesajıyla reddeder.",
    inputSchema: { path: z.string().min(1).describe("Tek görünür oturma planı sayfası içeren yerel .xls veya .xlsx dosya yolu") },
  }, async ({ path: file }) => {
    session.clearReferenceImport();
    session.importKind = null;
    const scan = await scanSpreadsheet(file);
    session.clearSpreadsheetImport();
    session.importKind = "spreadsheet";
    session.spreadsheetScan = scan;
    session.spreadsheetAnalysis = null;
    session.spreadsheetCompilation = null;
    session.spreadsheetPreviewPlan = null;
    session.spreadsheetVerified = false;
    const groups = scan.groups.map((g) => ({ groupId: g.groupId, label: g.label, level: g.level,
      sheet: g.sheet, rows: g.rows.map((r) => ({ rowId: r.rowId, label: r.label,
        labelSource: r.labelSource, axis: r.axis, seatCount: r.seats.length,
        addresses: r.seats.slice(0, 8).map((s) => s.address) })),
      seatCount: g.seatCount }));
    return json({ scanId: scan.scanId, family: scan.family, sheets: scan.sheets, availableSheets: scan.availableSheets,
      seatCount: scan.seatCount, rowCount: scan.rowCount, groups, focal: scan.focal,
      capacity: scan.capacity, conflicts: scan.conflicts, warnings: scan.warnings,
      unresolvedCells: scan.unresolvedCells, limits: SPREADSHEET_LIMITS,
      next: "submit_spreadsheet_analysis" }, scan.overlay);
  });

  server.registerTool("submit_spreadsheet_analysis", {
    title: "Excel blok anlamlarını onayla",
    description: "Tarayıcının fiziksel hücrelerini değiştirmeden yalnız plan adı, yerleşim türü ve grup ad/kat etiketlerini düzeltir.",
    inputSchema: {
      scanId: z.string(),
      venueKind: z.enum(["cinema", "theater", "stadium", "arena", "general"]),
      name: z.string().optional(),
      layout: z.enum(["source", "normalized", "ring"]).optional().describe("source: sayfa oranlarını tek ölçekle korur (varsayılan); normalized: açıkça seçilen şematik düzen; ring: açıkça seçilen türetilmiş halka"),
      groupOverrides: z.array(z.object({ groupId: z.string(), label: z.string().optional(),
        level: z.string().optional(), name: z.string().optional() })).optional(),
      excludedGroups: z.array(z.object({ groupId: z.string(), reason: z.string().min(3) })).optional(),
      excludedCells: z.array(z.object({ sourceId: z.string(), reason: z.string().min(3) })).optional()
        .describe("Yalnız unresolvedCells içindeki koltuk olmayan notları gerekçesiyle dışla"),
      focalDecision: z.union([
        z.object({ type: z.literal("none") }),
        z.object({ candidateId: z.string().min(1) }),
      ]).optional(),
    },
  }, async (a) => {
    const scan = session.spreadsheetScan;
    session.spreadsheetAnalysis = normalizeSpreadsheetAnalysis(scan, a,
      { defaultName: a.name || path.basename(scan.path, path.extname(scan.path)) });
    session.spreadsheetCompilation = null;
    session.spreadsheetPreviewPlan = null;
    session.spreadsheetVerified = false;
    return json({ accepted: true, groups: session.spreadsheetAnalysis.groups.length,
      seats: allSpreadsheetSeats(session.spreadsheetAnalysis.groups).length,
      layout: session.spreadsheetAnalysis.layout, inferred: session.spreadsheetAnalysis.layout !== "source",
      next: "build_spreadsheet_layout" });
  });

  server.registerTool("build_spreadsheet_layout", {
    title: "Excel yerleşimini atomik olarak kur",
    description: "Kaynak hücrelerinden geçici plan üretir; sert geometri ve veri kontrolleri temizse canlı editöre tek atomik güncelleme yollar.",
    inputSchema: {},
  }, async () => {
    const scan = session.spreadsheetScan, analysis = session.spreadsheetAnalysis;
    if (!scan) throw new Error("Önce scan_spreadsheet çağır.");
    if (!analysis) throw new Error("Önce submit_spreadsheet_analysis çağır.");
    const { compiled, plan: rawPlan } = compileSpreadsheetLayout(scan, analysis, {
      makePlan: (blocks, shapes = []) => ({ ...yeniPlan("spreadsheet-preview", analysis.name), blocks, shapes }),
      hardFindings: (plan) => hardFindings(session, plan),
    });
    let plan = { ...rawPlan, key: "excel-" + scan.scanId.slice(-12) };
    plan = { ...plan, home: planHome({ ...plan, home: null }) };
    const hard = hardFindings(session, plan);
    if (hard.length) throw new Error("Excel yerleşimi geri alındı; sert bulgu: "
      + hard.map((f) => `${f.id}${f.d ? ` (${f.d})` : f.ids?.length
        ? ` (${f.ids.map((id) => plan.blocks.find((b) => b.id === id)?.label || id).join(", ")})` : ""}`).join(" · "));
    session.spreadsheetCompilation = compiled;
    session.spreadsheetPreviewPlan = plan;
    session.spreadsheetVerified = false;
    const warning = scan.capacity.consistent ? "" : ` · kapasite özeti ${scan.capacity.declared}, hücre koltuğu ${scan.capacity.detected}`;
    if (session.plan) session.notify(`Excel önizlemesi hazır: ${compiled.blocks.length} blok${warning}`);
    return json({ built: true, sourceSeats: compiled.mapping.length,
      planSeats: plan.blocks.reduce((n, b) => n + buildMeta(b).seatCount, 0), blocks: compiled.blocks.length,
      inferredLayout: !compiled.sourceGeometry, layout: compiled.layout, scaleMultiplier: compiled.scaleMultiplier || 1,
      transform: compiled.transform, sourcePitch: compiled.sourcePitch,
      adjustedBlocks: Object.entries(compiled.blockShifts || {}).map(([id, shift]) => ({
        block: plan.blocks.find((b) => b.id === id)?.label, ...shift })),
      capacity: scan.capacity });
  });

  server.registerTool("verify_spreadsheet", {
    title: "Planı Excel hücreleriyle birebir doğrula",
    description: "Her kaynak hücresini tek plan koltuğuyla eşler; fazlalık, eksik, konum ve sert geometri bulgularını fark görseliyle raporlar.",
    inputSchema: {},
  }, async () => {
    const scan = session.spreadsheetScan, compiled = session.spreadsheetCompilation;
    if (!scan || !compiled) throw new Error("Önce build_spreadsheet_layout çağır.");
    const plan = session.spreadsheetPreviewPlan || session.need(), byId = new Map();
    plan.blocks.forEach((b) => buildSeats(b, buildMeta(b), plan.idTemplate).seats.forEach((s) => {
      byId.set(s.id, { ...s, blockId: b.id });
    }));
    const { metrics, plan: sealed } = verifySpreadsheetLayout(plan, scan, session.spreadsheetAnalysis, compiled, {
      hardFindings: (p) => hardFindings(session, p),
      seal: true,
      sourceHash: scan.sourceHash || null,
    });
    session.spreadsheetVerified = metrics.verified;
    if (metrics.verified && session.spreadsheetPreviewPlan) session.spreadsheetPreviewPlan = sealed;
    if (metrics.verified && session.plan) session.notify(scan.capacity.consistent
      ? "Excel kaynak doğrulaması geçti"
      : `Excel geometri doğrulaması geçti; kapasite özeti ${scan.capacity.declared}, hücre koltuğu ${scan.capacity.detected}`);
    return json(metrics, commonDifferenceOverlay(scan, compiled, byId));
  });
}
