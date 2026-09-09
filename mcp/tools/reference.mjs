import crypto from "node:crypto";
import { buildMeta } from "../../src/core/geometry.js";
import {
  compileReferenceLayout,
  normalizeReferenceAnalysis,
  referenceDifferenceOverlay,
  verifyReferenceLayout,
} from "../../src/core/reference-import.js";
import { REFERENCE_LIMITS, scanReference } from "../reference-scan.mjs";

const json = (o, image) => ({ content: [
  { type: "text", text: JSON.stringify(o, null, 2) },
  ...(image ? [{ type: "image", data: image.toString("base64"), mimeType: "image/png" }] : []),
] });
const rowCount = (analysis) => analysis.groups.reduce((n, g) => n + g.rowIds.length, 0);

export function registerReferenceTools(server, session, z) {
  const bbox = z.object({ x: z.number().min(0), y: z.number().min(0),
    w: z.number().positive(), h: z.number().positive() });

  server.registerTool("scan_reference", {
    title: "Referans görselini yerel olarak tara",
    description: "PNG/JPEG/WebP veya PDF içindeki tekrarlanan koltukları ölçer, sıra kimlikleri ve kontrol görseli döndürür. Koltuk sayısını veya koordinatlarını kendin üretme.",
    inputSchema: {
      path: z.string().min(1).describe("Yerel PNG/JPEG/WebP/PDF dosya yolu"),
      page: z.number().int().min(1).max(REFERENCE_LIMITS.maxPdfPage).optional(),
    },
  }, async ({ path, page = 1 }) => {
    session.need();
    if (!session.referenceMode) throw new Error("Önce set_underlay ile kaynak yükle.");
    if (session.referenceSource?.path && session.referenceSource.path !== path) {
      throw new Error("scan_reference yolu set_underlay ile yüklenen kaynakla aynı olmalı.");
    }
    session.notify("Referans taranıyor");
    const result = await scanReference(path, page);
    session.clearSpreadsheetImport();
    session.importKind = "reference";
    const scanId = "scan-" + crypto.randomUUID();
    session.referenceScan = { ...result, scanId, path, page };
    session.referenceAnalysis = null;
    session.referenceCompilation = null;
    session.referencePreviewPlan = null;
    session.referenceVerified = false;
    session.notify("Tarama tamamlandı: " + result.rows.length + " sıra · " + result.seatCount + " koltuk");
    const rows = result.rows.map(({ rowId, seats, bbox, angle, geometry, arc, medianGap, confidence, needsReview }) =>
      ({ rowId, centers: seats.map((s) => [s.x, s.y]), bbox, angle, geometry,
        ...(arc ? { arc } : {}), medianGap, confidence, needsReview }));
    return json({ scanId, width: result.width, height: result.height,
      seatCount: result.seatCount, rowCount: result.rows.length, rows,
      needsReview: result.needsReview, clusters: result.clusters,
      focalCandidates: result.focalCandidates, limits: REFERENCE_LIMITS }, result.overlay);
  });

  server.registerTool("submit_reference_analysis", {
    title: "Tarama satırlarını anlamlı gruplara bağla",
    description: "scan_reference rowId değerlerine yalnız blok/kat/etiket anlamı ekler. Piksel bbox veya koltuk sayısı kabul edilmez.",
    inputSchema: {
      scanId: z.string().optional(),
      venueKind: z.enum(["cinema", "theater", "stadium", "arena", "general"]),
      groups: z.array(z.object({
        rowIds: z.array(z.string()).min(1), level: z.string().min(1),
        label: z.string().optional(), name: z.string().optional(),
        rowLabels: z.record(z.string(), z.string()).optional(),
      })).optional(),
      focal: z.object({ type: z.enum(["screen", "stage", "pitch"]), label: z.string().min(1), bbox }).optional(),
      focalDecision: z.union([
        z.object({ type: z.literal("none") }),
        z.object({ candidateId: z.string().min(1) }),
        z.object({ type: z.literal("measured") }),
      ]).optional(),
      excludedRows: z.array(z.object({ rowId: z.string(), reason: z.string().min(3) })).optional(),
      reviewedRowIds: z.array(z.string()).optional(),
      sourceSize: z.unknown().optional(), blocks: z.unknown().optional(), observations: z.unknown().optional(),
    },
  }, async (a) => {
    const scan = session.referenceScan;
    const analysis = normalizeReferenceAnalysis(scan, a);
    session.referenceAnalysis = analysis;
    session.referenceCompilation = null;
    session.referencePreviewPlan = null;
    session.referenceVerified = false;
    session.notify("Kaynak anlamlandırıldı: " + analysis.groups.length + " grup");
    const accepted = analysis.groups.flatMap((g) => g.rowIds);
    const totalSeats = scan.rows.filter((r) => accepted.includes(r.rowId))
      .reduce((n, r) => n + r.seats.length, 0);
    return json({ accepted: true, groups: analysis.groups.length, acceptedRows: accepted.length,
      excludedRows: analysis.excludedRows.length, totalSeats, next: "replace_layout" });
  });

  server.registerTool("replace_layout", {
    title: "Taranmış yerleşimi atomik olarak derle",
    description: "Kaydedilmiş scanId/rowId analizini mevcut grid ve koltuk ov düzeltmeleriyle birebir kurar. Başarısız doğrulamada canlı plan değişmez.",
    inputSchema: {},
  }, async () => {
    const scan = session.referenceScan, analysis = session.referenceAnalysis;
    if (!scan) throw new Error("Önce scan_reference çağır.");
    if (!analysis) throw new Error("Önce submit_reference_analysis çağır.");
    const { plan: preview, compiled } = compileReferenceLayout(session.need(), scan, analysis);
    session.referenceCompilation = compiled;
    session.referencePreviewPlan = preview;
    session.referenceVerified = false;
    session.notify("Referans önizlemesi hazır: " + preview.blocks.length + " blok");
    const planSeats = preview.blocks.reduce((n, b) => n + buildMeta(b).seatCount, 0);
    return json({ built: true, sourceSeats: compiled.mapping.length,
      planSeats, previewSeats: compiled.mapping.length, blocks: preview.blocks.length, scale: +compiled.scale.toFixed(4),
      next: "verify_reference" });
  });

  server.registerTool("verify_reference", {
    title: "Planı kaynak taramasıyla birebir doğrula",
    description: "Kaynak koltuklarını plan koltuklarıyla birebir eşler; sayı, konum, focal ve sert geometri bulguları geçmeden başarı vermez.",
    inputSchema: {},
  }, async () => {
    const scan = session.referenceScan, compiled = session.referenceCompilation;
    if (!scan || !compiled) throw new Error("Önce replace_layout ile referans yerleşimini derle.");
    session.notify("Kaynak eşleşmesi doğrulanıyor");
    const { metrics, plan } = verifyReferenceLayout(
      session.referencePreviewPlan || session.need(), scan, session.referenceAnalysis, compiled,
      { seal: true, sourceHash: scan.sourceHash || null });
    session.referenceVerified = metrics.verified;
    if (metrics.verified && session.referencePreviewPlan) session.referencePreviewPlan = plan;
    session.notify(metrics.verified ? "Kaynak doğrulaması geçti; accept_import ile aktif plana al" : "Kaynak doğrulaması başarısız");
    return json({ ...metrics, next: metrics.verified ? "accept_import" : "submit_reference_analysis" },
      referenceDifferenceOverlay(scan, compiled, plan));
  });
}
