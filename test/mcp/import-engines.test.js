import { describe, expect, it } from "vitest";
import { createCanvas } from "@napi-rs/canvas";
import { mkdtemp, rm, readFile, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { createImportService } from "../../server/import-service.mjs";
import { baglan } from "./harness.js";
import XLSX from "@e965/xlsx";
import { deliveryReadiness } from "../../src/core/readiness.js";

async function tinyReference() {
  const dir = await mkdtemp(path.join(tmpdir(), "shared-import-"));
  const file = path.join(dir, "kaynak.png");
  const canvas = createCanvas(180, 90), ctx = canvas.getContext("2d");
  ctx.fillStyle = "#fff"; ctx.fillRect(0, 0, 180, 90);
  ctx.fillStyle = "#2563eb";
  for (const y of [30, 55]) for (let x = 30; x <= 110; x += 20) ctx.fillRect(x, y, 9, 7);
  await writeFile(file, canvas.toBuffer("image/png"));
  return { dir, file };
}

async function focalReference() {
  const dir = await mkdtemp(path.join(tmpdir(), "focal-import-"));
  const file = path.join(dir, "sahneli.png");
  const canvas = createCanvas(220, 120), ctx = canvas.getContext("2d");
  ctx.fillStyle = "#fff"; ctx.fillRect(0, 0, 220, 120);
  ctx.fillStyle = "#777"; ctx.fillRect(45, 10, 130, 14);
  ctx.fillStyle = "#2563eb";
  for (let x = 50; x <= 130; x += 20) ctx.fillRect(x, 70, 9, 7);
  await writeFile(file, canvas.toBuffer("image/png"));
  return { dir, file };
}

describe("MCP ve HTTP import aynı referans motorunu kullanır", () => {
  it("image ve spreadsheet akışları birbirinin eski durumunu temizler", async () => {
    const { dir, file: image } = await tinyReference();
    const spreadsheet = path.join(dir, "salon.xlsx");
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet([["A1", "A2", "A3"]]), "Plan");
    wb.Workbook = { Names: [{ Name: "BLOK_A", Ref: "Plan!$A$1:$C$1" }] };
    await writeFile(spreadsheet, XLSX.write(wb, { type: "buffer", bookType: "xlsx" }));
    const t = await baglan();
    try {
      await t.cagir("create_plan", { name: "Çapraz akış" });
      await t.cagir("set_underlay", { path: image });
      await t.cagir("scan_reference", { path: image });
      expect(t.session.referenceScan).not.toBeNull();

      await t.cagir("scan_spreadsheet", { path: spreadsheet });
      expect(t.session.importKind).toBe("spreadsheet");
      expect(t.session.referenceScan).toBeNull();
      t.session.referenceVerified = true;
      t.session.referencePreviewPlan = { key: "stale-reference", name: "Yanlış", blocks: [], shapes: [] };
      await expect(t.cagir("accept_import")).rejects.toThrow(/Excel|doğrulanmış|önizleme/i);

      await t.cagir("set_underlay", { path: image });
      expect(t.session.importKind).toBe("reference");
      expect(t.session.spreadsheetScan).toBeNull();
      expect(t.session.spreadsheetPreviewPlan).toBeNull();
      await t.cagir("scan_reference", { path: image });
      t.session.spreadsheetVerified = true;
      t.session.spreadsheetPreviewPlan = { key: "stale-sheet", name: "Yanlış Excel", blocks: [], shapes: [] };
      await expect(t.cagir("accept_import")).rejects.toThrow(/doğrulanmış|önizleme/i);
    } finally {
      await t.kapat();
      await rm(dir, { recursive: true, force: true });
    }
  });

  it("aynı fixture için mapping ve doğrulama metrikleri aynıdır", async () => {
    const { dir, file } = await tinyReference();
    const t = await baglan();
    try {
      await t.cagir("create_plan", { name: "Aynı Motor" });
      await t.cagir("set_underlay", { path: file });
      const mcpScan = await t.jsonCagir("scan_reference", { path: file });
      const groups = [{ rowIds: mcpScan.rows.map((r) => r.rowId), level: "P", label: "A" }];
      await t.cagir("submit_reference_analysis", { scanId: mcpScan.scanId, venueKind: "theater", groups });
      const mcpBuilt = await t.jsonCagir("replace_layout");
      const mcpVerify = await t.jsonCagir("verify_reference");

      const svc = createImportService(path.join(dir, "imports"));
      const uploaded = await svc.save({ tenant: "t", name: "kaynak.png", bytes: await readFile(file) });
      const httpScan = await svc.scan("t", uploaded.id);
      const httpGroups = [{ rowIds: httpScan.scan.rows.map((r) => r.rowId), level: "P", label: "A" }];
      await svc.analyze("t", uploaded.id, { scanId: httpScan.scan.scanId, venueKind: "theater", groups: httpGroups });
      const httpBuilt = await svc.build("t", uploaded.id);
      const httpVerify = await svc.verify("t", uploaded.id);

      expect(httpBuilt.preview.seats).toBe(mcpBuilt.previewSeats);
      expect(httpVerify.verification).toMatchObject({
        verified: mcpVerify.verified,
        sourceSeats: mcpVerify.sourceSeats,
        planSeats: mcpVerify.planSeats,
        positionalMatch: mcpVerify.positionalMatch,
        sourceRows: mcpVerify.sourceRows,
        planRows: mcpVerify.planRows,
        verifiedIdentity: false,
      });
      const accepted = await svc.accept("t", uploaded.id);
      expect(accepted.plan.importVerification).toMatchObject({
        sourceVerified: true, geometryVerified: true, identityVerified: false,
      });
      expect(deliveryReadiness(accepted.plan).ready).toBe(false);
    } finally {
      await t.kapat();
      await rm(dir, { recursive: true, force: true });
    }
  });

  it("aynı XLSX için HTTP ve MCP aynı spreadsheet metriklerini üretir", async () => {
    const dir = await mkdtemp(path.join(tmpdir(), "sheet-parity-"));
    const file = path.join(dir, "salon.xlsx");
    const wb = XLSX.utils.book_new();
    const ws = XLSX.utils.aoa_to_sheet([
      ["A1", "A2", "A3"],
      ["B1", "B2", "B3"],
    ]);
    XLSX.utils.book_append_sheet(wb, ws, "Plan");
    wb.Workbook = { Names: [{ Name: "BLOK_A", Ref: "Plan!$A$1:$C$2" }] };
    await writeFile(file, XLSX.write(wb, { type: "buffer", bookType: "xlsx" }));
    const t = await baglan();
    try {
      const mcpScan = await t.jsonCagir("scan_spreadsheet", { path: file });
      await t.cagir("submit_spreadsheet_analysis", { scanId: mcpScan.scanId, venueKind: "theater", layout: "source" });
      await t.cagir("build_spreadsheet_layout");
      const mcpVerify = await t.jsonCagir("verify_spreadsheet");

      const svc = createImportService(path.join(dir, "imports"));
      const uploaded = await svc.save({ tenant: "t", name: "salon.xlsx", bytes: await readFile(file) });
      const httpScan = await svc.scan("t", uploaded.id);
      await svc.analyze("t", uploaded.id, { scanId: httpScan.scan.scanId, venueKind: "theater", layout: "source" });
      await svc.build("t", uploaded.id);
      expect(svc.get("t", uploaded.id).compiled.transform.scaleX)
        .toBe(svc.get("t", uploaded.id).compiled.transform.scaleY);
      const httpVerify = await svc.verify("t", uploaded.id);

      expect(httpVerify.verification).toMatchObject({
        verified: mcpVerify.verified,
        sourceSeats: mcpVerify.sourceSeats,
        planSeats: mcpVerify.planSeats,
        sourceRows: mcpVerify.sourceRows,
        planRows: mcpVerify.planRows,
        positionalMatch: mcpVerify.positionalMatch,
        verifiedIdentity: mcpVerify.verifiedIdentity,
      });
      expect(httpVerify.previewPlan).toBeDefined();
    } finally {
      await t.kapat();
      await rm(dir, { recursive: true, force: true });
    }
  });

  it("HTTP Excel override kaynak satır/hücre/geometrisi icat edemez", async () => {
    const dir = await mkdtemp(path.join(tmpdir(), "sheet-override-"));
    const file = path.join(dir, "salon.xlsx");
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet([["A1", "A2", "A3"]]), "Plan");
    wb.Workbook = { Names: [{ Name: "BLOK_A", Ref: "Plan!$A$1:$C$1" }] };
    await writeFile(file, XLSX.write(wb, { type: "buffer", bookType: "xlsx" }));
    try {
      const svc = createImportService(path.join(dir, "imports"));
      const uploaded = await svc.save({ tenant: "t", name: "salon.xlsx", bytes: await readFile(file) });
      const scanned = await svc.scan("t", uploaded.id);
      const group = scanned.scan.groups[0];
      await svc.analyze("t", uploaded.id, { scanId: scanned.scan.scanId, venueKind: "theater",
        groupOverrides: [{ groupId: group.groupId, label: "B", level: "Üst",
          rows: [{ rowId: "invented", seats: [{ sheet: "X", address: "Z99" }] }],
          bbox: { x: -999, y: -999, w: 1, h: 1 } }] });
      expect(svc.get("t", uploaded.id).analysis.groups[0]).toMatchObject({ label: "B", level: "Üst" });
      expect(svc.get("t", uploaded.id).analysis.groups[0].rows).toHaveLength(group.rows.length);
      expect(svc.get("t", uploaded.id).analysis.groups[0].rows[0].seats).toHaveLength(3);
      await svc.build("t", uploaded.id);
      expect((await svc.verify("t", uploaded.id)).verification).toMatchObject({ verified: true, sourceSeats: 3 });
    } finally { await rm(dir, { recursive: true, force: true }); }
  });

  it("aynı sayıda ama kaydırılmış manuel preview verified olmaz", async () => {
    const { dir, file } = await tinyReference();
    try {
      const svc = createImportService(path.join(dir, "imports"));
      const uploaded = await svc.save({ tenant: "t", name: "kaynak.png", bytes: await readFile(file) });
      const scan = await svc.scan("t", uploaded.id);
      await svc.analyze("t", uploaded.id, {
        scanId: scan.scan.scanId,
        venueKind: "theater",
        groups: [{ rowIds: scan.scan.rows.map((r) => r.rowId), level: "P", label: "A" }],
      });
      await svc.build("t", uploaded.id);
      const item = svc.get("t", uploaded.id);
      item.previewPlan.blocks[0].x += 500;
      expect((await svc.verify("t", uploaded.id)).verification).toMatchObject({
        verified: false,
        sourceSeats: 10,
        planSeats: 10,
        positionalMatch: 0,
      });
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  });

  it("HTTP görsel import focal kararını zorunlu tutar ve kabul planına sourceHash damgalar", async () => {
    const { dir, file } = await focalReference();
    try {
      const svc = createImportService(path.join(dir, "imports"));
      const uploaded = await svc.save({ tenant: "t", name: "sahneli.png", bytes: await readFile(file) });
      const scanned = await svc.scan("t", uploaded.id);
      const groups = [{ rowIds: scanned.scan.rows.map((r) => r.rowId), level: "P", label: "A" }];
      await expect(svc.analyze("t", uploaded.id, {
        scanId: scanned.scan.scanId, venueKind: "theater", groups,
      })).rejects.toThrow();
      await svc.analyze("t", uploaded.id, {
        scanId: scanned.scan.scanId, venueKind: "theater", groups,
        focalDecision: { type: "none" },
      });
      await svc.build("t", uploaded.id);
      const verified = await svc.verify("t", uploaded.id);
      expect(verified.verification.verified).toBe(true);
      const accepted = await svc.accept("t", uploaded.id);
      expect(accepted.plan.importVerification.sourceHash).toBe(uploaded.sourceHash);
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  });
});
