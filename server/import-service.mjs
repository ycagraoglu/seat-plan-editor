import { mkdirSync, rmSync } from "node:fs";
import { writeFile } from "node:fs/promises";
import { randomUUID, createHash } from "node:crypto";
import { tmpdir } from "node:os";
import path from "node:path";
import { buildMeta } from "../src/core/geometry.js";
import { planHome } from "../src/core/plan.js";
import { deliveryReadiness } from "../src/core/readiness.js";
import { yeniPlan } from "../mcp/session.mjs";
import { scanReference } from "../mcp/reference-scan.mjs";
import { scanSpreadsheet } from "../mcp/spreadsheet-scan.mjs";
import {
  normalizeSpreadsheetAnalysis,
  compileSpreadsheetLayout,
  verifySpreadsheetLayout,
} from "../src/core/spreadsheet-import.js";
import {
  compileReferenceLayout,
  normalizeReferenceAnalysis,
  verifyReferenceLayout,
} from "../src/core/reference-import.js";

export const IMPORT_EXTENSIONS = [".png", ".jpg", ".jpeg", ".webp", ".pdf", ".csv", ".json", ".xls", ".xlsx"];
export const IMPORT_MAX_BYTES = 25 * 1024 * 1024;

export function importKind(name) {
  const ext = path.extname(name).toLowerCase();
  if (!IMPORT_EXTENSIONS.includes(ext)) return null;
  if ([".xls", ".xlsx"].includes(ext)) return "spreadsheet";
  if ([".csv", ".json"].includes(ext)) return "list";
  return "image";
}

const seatsOf = (plan) => (plan.blocks || []).reduce((n, b) => n + buildMeta(b).seatCount, 0);
const sourceHash = (bytes) => createHash("sha256").update(bytes).digest("hex");
function compileSpreadsheet(item) {
  const layout = item.analysis?.layout || "source";
  const analysis = { ...item.analysis, layout };
  return compileSpreadsheetLayout(item.scan, analysis, {
    makePlan: (blocks, shapes = []) => ({ ...yeniPlan("import-" + item.id.slice(-12), analysis.name), blocks, shapes }),
    hardFindings: (plan) => deliveryReadiness(plan).blockers.filter((f) => !String(f.id).startsWith("source-")),
  });
}

function summarizeScan(scan, kind) {
  if (kind === "spreadsheet") return {
    scanId: scan.scanId, family: scan.family, sheets: scan.sheets, availableSheets: scan.availableSheets,
    seatCount: scan.seatCount, rowCount: scan.rowCount, groups: scan.groups?.map((g) => ({
      groupId: g.groupId, label: g.label, level: g.level, seatCount: g.seatCount,
      rows: g.rows.map((r) => ({ rowId: r.rowId, label: r.label, labelSource: r.labelSource,
        axis: r.axis, seatCount: r.seats.length })),
    })), focal: scan.focal, capacity: scan.capacity, conflicts: scan.conflicts,
    unresolvedCells: scan.unresolvedCells, warnings: scan.warnings,
  };
  return {
    scanId: scan.scanId, width: scan.width, height: scan.height,
    seatCount: scan.seatCount, rowCount: scan.rows?.length || 0,
    rows: (scan.rows || []).map(({ rowId, seats, bbox, angle, geometry, arc, medianGap, confidence, needsReview }) =>
      ({ rowId, centers: seats.map((s) => [s.x, s.y]), bbox, angle, geometry,
        ...(arc ? { arc } : {}), medianGap, confidence, needsReview })),
    needsReview: scan.needsReview || [], ocr: scan.ocr || [],
    focalCandidates: scan.focalCandidates || [],
    reviewRequired: scan.reviewRequired || null,
  };
}

export function createImportService(root = path.join(tmpdir(), "seat-editor-imports")) {
  const imports = new Map();
  const requireItem = (tenant, id) => {
    const item = imports.get(id);
    if (!item || item.tenant !== tenant) throw Object.assign(new Error("import bulunamadı"), { statusCode: 404 });
    return item;
  };
  const conflict = (message) => Object.assign(new Error(message), { statusCode: 409 });
  const withItem = async (tenant, id, allowed, fn) => {
    const item = requireItem(tenant, id);
    if (!allowed.includes(item.status)) {
      throw conflict(`Bu işlem ${item.status} aşamasında yapılamaz; beklenen: ${allowed.join(", ")}`);
    }
    if (item.busy) throw conflict("Bu import üzerinde başka bir işlem devam ediyor.");
    item.busy = true;
    try { return await fn(item); }
    finally { item.busy = false; }
  };
  const publicItem = (item) => item && {
    id: item.id, name: item.name, kind: item.kind, status: item.status,
    phase: item.phase, bytes: item.bytes, createdAt: item.createdAt, updatedAt: item.updatedAt,
    scan: item.scan ? summarizeScan(item.scan, item.kind) : null,
    preview: item.previewPlan ? { name: item.previewPlan.name, key: item.previewPlan.key,
      blocks: item.previewPlan.blocks.length, shapes: item.previewPlan.shapes.length,
      seats: seatsOf(item.previewPlan) } : null,
    previewPlan: item.previewPlan || null,
    verification: item.verification || null,
  };
  const touch = (item, status, phase = status) => {
    item.status = status; item.phase = phase; item.updatedAt = new Date().toISOString();
    return item;
  };

  return {
    async save({ tenant, name, bytes }) {
      this.cleanup();
      const safeName = path.basename(String(name || "kaynak"));
      const kind = importKind(safeName);
      if (!kind) throw Object.assign(new Error("desteklenmeyen dosya türü"), { statusCode: 400 });
      mkdirSync(root, { recursive: true });
      if ((bytes?.length || 0) > IMPORT_MAX_BYTES) {
        throw Object.assign(new Error("Kaynak dosya 25 MB sınırını aşıyor."), { statusCode: 413 });
      }
      const ext = path.extname(safeName).toLowerCase();
      const id = "imp-" + randomUUID();
      const file = path.join(root, `${Date.now()}-${randomUUID()}${ext}`);
      await writeFile(file, bytes);
      const now = new Date().toISOString();
      const item = { id, tenant, name: safeName, kind, status: "uploaded", phase: "uploaded",
        path: file, bytes: bytes.length, sourceHash: sourceHash(bytes), createdAt: now, updatedAt: now };
      imports.set(id, item);
      return item;
    },
    get: requireItem,
    public: publicItem,
    async scan(tenant, id, opts = {}) {
      return withItem(tenant, id, ["uploaded", "scanned", "analysis-ready", "preview-ready", "verify-failed"], async (item) => {
      if (item.kind === "list") throw Object.assign(new Error("liste import taraması bu akışta desteklenmiyor"), { statusCode: 400 });
      const scan = item.kind === "spreadsheet"
        ? await scanSpreadsheet(item.path)
        : { ...(await scanReference(item.path, opts.page || 1)), scanId: "scan-" + randomUUID() };
      item.scan = { ...scan, overlay: undefined };
      item.analysis = null; item.compiled = null; item.previewPlan = null; item.verification = null;
      return publicItem(touch(item, "scanned"));
      });
    },
    analyze(tenant, id, analysis = {}) {
      return withItem(tenant, id, ["scanned", "analysis-ready", "preview-ready", "verify-failed"], async (item) => {
      if (!item.scan) throw Object.assign(new Error("önce tarama yapılmalı"), { statusCode: 409 });
      item.analysis = item.kind === "spreadsheet"
        ? normalizeSpreadsheetAnalysis(item.scan, { ...analysis, scanId: analysis.scanId || item.scan.scanId },
          { defaultName: analysis.name || item.name })
        : normalizeReferenceAnalysis(item.scan, { ...analysis, scanId: analysis.scanId || item.scan.scanId });
      item.compiled = null; item.previewPlan = null; item.verification = null;
      return publicItem(touch(item, "analysis-ready"));
      });
    },
    build(tenant, id) {
      return withItem(tenant, id, ["analysis-ready", "preview-ready", "verify-failed"], async (item) => {
      if (!item.analysis) throw conflict("önce analiz tamamlanmalı");
      const built = item.kind === "spreadsheet"
        ? compileSpreadsheet(item)
        : compileReferenceLayout(
          { ...yeniPlan("import-" + item.id.slice(-12), item.analysis?.name || item.name), sourceHash: item.sourceHash },
          item.scan, item.analysis);
      const plan = { ...built.plan, home: planHome({ ...built.plan, home: null }) };
      const ready = deliveryReadiness(plan);
      const hard = ready.blockers.filter((f) => !String(f.id).startsWith("source-"));
      if (hard.length) throw Object.assign(new Error("Önizleme üretildi ama sert geometri hatası var: "
        + hard.map((f) => f.id).join(", ")), { statusCode: 422 });
      item.compiled = built.compiled; item.previewPlan = plan; item.verification = null;
      return publicItem(touch(item, "preview-ready"));
      });
    },
    verify(tenant, id) {
      return withItem(tenant, id, ["preview-ready", "verify-failed", "verified"], async (item) => {
      if (!item.previewPlan) throw Object.assign(new Error("önce önizleme oluşturulmalı"), { statusCode: 409 });
      if (item.kind === "image") {
        const { metrics, plan } = verifyReferenceLayout(item.previewPlan, item.scan, item.analysis, item.compiled,
          { seal: true, sourceHash: item.sourceHash });
        item.verification = { ...metrics, sourceHash: item.sourceHash };
        if (metrics.verified) item.previewPlan = plan;
        return publicItem(touch(item, metrics.verified ? "verified" : "verify-failed"));
      }
      const { metrics, plan } = verifySpreadsheetLayout(item.previewPlan, item.scan, item.analysis, item.compiled, {
        hardFindings: (p) => deliveryReadiness(p).blockers,
        seal: true,
        sourceHash: item.sourceHash,
      });
      item.verification = metrics;
      if (metrics.verified) item.previewPlan = plan;
      return publicItem(touch(item, item.verification.verified ? "verified" : "verify-failed"));
      });
    },
    accept(tenant, id) {
      return withItem(tenant, id, ["verified"], async (item) => {
      if (!item.verification?.verified || !item.previewPlan?.importVerification) {
        throw Object.assign(new Error("doğrulanmış önizleme yok"), { statusCode: 409 });
      }
      touch(item, "accepted");
      return { ...publicItem(item), plan: item.previewPlan };
      });
    },
    cancel(tenant, id) {
      return withItem(tenant, id, ["uploaded", "scanned", "analysis-ready", "preview-ready", "verify-failed", "verified"], async (item) => {
      item.scan = null; item.analysis = null; item.compiled = null; item.previewPlan = null; item.verification = null;
      rmSync(item.path, { force: true });
      return publicItem(touch(item, "cancelled"));
      });
    },
    cleanup(maxAgeMs = 2 * 60 * 60 * 1000) {
      const now = Date.now();
      for (const [id, item] of imports) if (now - Date.parse(item.updatedAt) > maxAgeMs) {
        rmSync(item.path, { force: true }); imports.delete(id);
      }
    },
  };
}
