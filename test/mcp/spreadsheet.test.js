import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import XLSX from "@e965/xlsx";
import { baglan } from "./harness.js";
import { buildMeta, buildSeats } from "../../src/core/geometry.js";

describe("Excel tara → anlamlandır → atomik plan → doğrula", () => {
  let t, dir, file;
  beforeEach(async () => {
    delete process.env.SEAT_EDITOR_API;
    t = await baglan();
    dir = await mkdtemp(path.join(tmpdir(), "seat-sheet-mcp-"));
    file = path.join(dir, "salon.xlsx");
    const wb = XLSX.utils.book_new();
    const ws = XLSX.utils.aoa_to_sheet([
      ["SAHNE"], [],
      ["A1", "A2", "A3", "A4"],
      ["B1", "B2", null, "B4"],
    ]);
    ws["!merges"] = [XLSX.utils.decode_range("A1:D1")];
    XLSX.utils.book_append_sheet(wb, ws, "Salon");
    wb.Workbook = { Names: [{ Name: "BLOK001", Ref: "Salon!$A$3:$D$4" }] };
    await writeFile(file, XLSX.write(wb, { type: "buffer", bookType: "xlsx" }));
  });
  afterEach(async () => { await t.kapat(); await rm(dir, { recursive: true, force: true }); });

  it("aktif plan olmadan tarar, planı tek seferde kurar ve hücrelerle doğrular", async () => {
    expect((await t.jsonCagir("editor_capabilities")).session.phase).toBe("no-plan");
    const scan = await t.jsonCagir("scan_spreadsheet", { path: file });
    expect(scan).toMatchObject({ family: "named-range-plan", seatCount: 7 });
    expect(t.session.plan).toBeNull();
    expect((await t.jsonCagir("editor_capabilities")).session.phase).toBe("spreadsheet-scanned");

    await t.cagir("submit_spreadsheet_analysis", {
      scanId: scan.scanId, venueKind: "theater", name: "Excel Salon", layout: "source",
      groupOverrides: [{ groupId: scan.groups[0].groupId, label: "PARTER", level: "Parter" }],
    });
    expect((await t.jsonCagir("editor_capabilities")).session.phase).toBe("spreadsheet-semantics-ready");
    const built = await t.jsonCagir("build_spreadsheet_layout");
    expect(built).toMatchObject({ built: true, sourceSeats: 7, planSeats: 7 });
    expect(t.session.plan).toBeNull();
    expect(t.session.spreadsheetPreviewPlan.name).toBe("Excel Salon");
    expect((await t.jsonCagir("editor_capabilities")).session.phase).toBe("spreadsheet-compiled");

    const verified = await t.jsonCagir("verify_spreadsheet");
    expect(verified).toMatchObject({ verified: true, sourceSeats: 7, planSeats: 7,
      sourceRows: 2, planRows: 2, positionalMatch: 1, focalIoU: 1,
      verifiedSourceGeometry: true, capacityConsistent: true });
    expect(t.session.plan).toBeNull();
    expect((await t.jsonCagir("editor_capabilities")).session.phase).toBe("spreadsheet-verified");
    await t.cagir("accept_import");
    expect(t.session.plan.name).toBe("Excel Salon");
    expect(t.session.plan.importVerification.sourceVerified).toBe(true);
  });

  it("çok görünür sayfalı Excel'i reddederken açık planı değiştirmez", async () => {
    await compile(undefined, { accept: true });
    const plan = t.session.plan;
    const scan = t.session.spreadsheetScan;
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet([["A1", "A2", "A3"]]), "Plan");
    XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet([["TOPLAM", 3]]), "Özet");
    await writeFile(file, XLSX.write(wb, { type: "buffer", bookType: "xlsx" }));

    await expect(t.cagir("scan_spreadsheet", { path: file })).rejects.toThrow(
      /2 görünür sayfa var: Plan, Özet.*tek bir görünür sayfada/,
    );
    expect(t.session.plan).toBe(plan);
    expect(t.session.spreadsheetScan).toBe(scan);
  });

  it("başarısız yeni tarama eski doğrulanmış Excel önizlemesini kabul edilebilir bırakmaz", async () => {
    await compile();
    await t.cagir("verify_spreadsheet");
    const oldPreview = t.session.spreadsheetPreviewPlan;
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet([["A1", "A2", "A3"]]), "Plan");
    XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet([["Özet"]]), "Özet");
    await writeFile(file, XLSX.write(wb, { type: "buffer", bookType: "xlsx" }));
    await expect(t.cagir("scan_spreadsheet", { path: file })).rejects.toThrow(/görünür sayfa/);
    expect(t.session.spreadsheetPreviewPlan).toBe(oldPreview);
    expect(t.session.importKind).toBeNull();
    await expect(t.cagir("accept_import")).rejects.toThrow(/doğrulanmış önizleme/);
  });

  it("Excel aktarımı beklerken düşük seviyeli blok eklemeyi reddeder", async () => {
    await t.cagir("scan_spreadsheet", { path: file });
    await t.cagir("create_plan", { name: "Yeni" });
    await t.cagir("scan_spreadsheet", { path: file });
    await expect(t.cagir("add_block", { kind: "grid", label: "A", level: "Parter", rows: 2, cols: 3,
      x: 0, y: 0 })).rejects.toThrow(/Excel|elektronik tablo/i);
  });

  it("accept sonrası Excel import state'i kilit bırakmaz; iki mutasyon çalışır ve kaynak damgası geçersizleşir", async () => {
    await compile("source", { accept: true });
    await t.cagir("update_block", { id: t.session.plan.blocks[0].id, x: t.session.plan.blocks[0].x + 500 });
    await t.cagir("update_block", { id: t.session.plan.blocks[0].id, y: t.session.plan.blocks[0].y + 500 });
    expect(t.session.spreadsheetScan).toBeNull();
    expect(t.session.plan.importVerification.sourceVerified).toBe(false);
    await expect(t.cagir("export_plan", { format: "plan", path: path.join(dir, "out.json") }))
      .rejects.toThrow(/source|kaynak|hazır değil|doğrulaması/i);
  });

  async function compile(layout, { accept = false } = {}) {
    const scan = await t.jsonCagir("scan_spreadsheet", { path: file });
    await t.cagir("submit_spreadsheet_analysis", { scanId: scan.scanId, venueKind: "theater", ...(layout ? { layout } : {}) });
    const built = await t.jsonCagir("build_spreadsheet_layout");
    if (accept) {
      const verified = await t.jsonCagir("verify_spreadsheet");
      if (verified.verified) await t.cagir("accept_import");
    }
    return built;
  }

  it("normalizes spreadsheet aspect ratio while preserving a missing seat gap", async () => {
    const built = await compile("normalized", { accept: false });
    expect(built).toMatchObject({ layout: "normalized", inferredLayout: true, scaleMultiplier: 1 });
    expect(await t.jsonCagir("verify_spreadsheet")).toMatchObject({ verified: true,
      verifiedSourceGeometry: false, verifiedInferredLayout: true, architecturalGeometryVerified: false });
    await t.cagir("accept_import");
    const b = t.session.plan.blocks[0];
    const { seats } = buildSeats(b, buildMeta(b));
    expect(seats[1].x - seats[0].x).toBeCloseTo(50);
    expect(seats[4].y - seats[0].y).toBeCloseTo(90);
    expect(seats[6].x - seats[5].x).toBeCloseTo(100);
    expect(t.session.plan.importVerification.geometryVerified).toBe(true);
  });

  it("değişken Excel sütun genişliklerinde hiçbir koltuk aralığını 50 cm altına sıkıştırmaz", async () => {
    const wb = XLSX.utils.book_new();
    const ws = XLSX.utils.aoa_to_sheet([["A1", "A2", "A3", "A4"]]);
    ws["!cols"] = [{ wpx: 8 }, { wpx: 8 }, { wpx: 16 }, { wpx: 8 }];
    XLSX.utils.book_append_sheet(wb, ws, "Plan");
    wb.Workbook = { Names: [{ Name: "BLOK_A", Ref: "Plan!$A$1:$D$1" }] };
    await writeFile(file, XLSX.write(wb, { type: "buffer", bookType: "xlsx" }));

    await compile("normalized");
    expect((await t.jsonCagir("verify_spreadsheet")).verified).toBe(true);
    await t.cagir("accept_import");
    const b = t.session.plan.blocks[0];
    const xs = buildSeats(b, buildMeta(b)).seats.map((s) => s.x).toSorted((a, c) => a - c);
    expect(xs.slice(1).map((x, i) => x - xs[i])).toEqual([50, 50, 50]);
  });

  it("döndürülmüş Excel sıralarını 90 derece blok olarak derler", async () => {
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet([
      ["A4", "B4", "C4"],
      ["A3", "B3", "C3"],
      ["A2", "B2", "C2"],
      ["A1", "B1", "C1"],
    ]), "Plan");
    wb.Workbook = { Names: [{ Name: "BLOK001", Ref: "Plan!$A$1:$C$4" }] };
    await writeFile(file, XLSX.write(wb, { type: "buffer", bookType: "xlsx" }));

    await compile("source");
    expect(await t.jsonCagir("verify_spreadsheet")).toMatchObject({ verified: true, positionalMatch: 1 });
    await t.cagir("accept_import");

    expect(t.session.plan.blocks[0].rot).toBe(90);
    const rows = buildSeats(t.session.plan.blocks[0], buildMeta(t.session.plan.blocks[0])).seats;
    const a = rows.filter((s) => s.row === "A");
    expect(new Set(a.map((s) => Math.round(s.x))).size).toBe(1);
    expect(new Set(a.map((s) => Math.round(s.y))).size).toBe(4);
  });

  it("identity edits remain draft-verifiable, while missing stage and displaced seats fail geometry", async () => {
    await compile();
    const saved = structuredClone(t.session.spreadsheetPreviewPlan);
    const identityCorruptions = [
      (p) => { p.blocks[0].ov["0,0"].label = "999"; },
      (p) => { p.blocks[0].num.rowCustom = "X,Y"; },
    ];
    for (const corrupt of identityCorruptions) {
      t.session.spreadsheetPreviewPlan = structuredClone(saved);
      corrupt(t.session.spreadsheetPreviewPlan);
      expect(await t.jsonCagir("verify_spreadsheet")).toMatchObject({ verified: true, verifiedIdentity: false });
    }
    const geometryCorruptions = [
      (p) => { p.blocks[0].ov["0,0"].id = p.blocks[0].ov["0,1"].id; },
      (p) => { p.shapes = []; },
      (p) => { p.blocks[0].x += 200; },
    ];
    for (const corrupt of geometryCorruptions) {
      t.session.spreadsheetPreviewPlan = structuredClone(saved);
      corrupt(t.session.spreadsheetPreviewPlan);
      expect((await t.jsonCagir("verify_spreadsheet")).verified).toBe(false);
    }
  });

  it("verifies coordinates against source cells, not mutable compilation targets", async () => {
    await compile();
    t.session.spreadsheetPreviewPlan.blocks[0].x += 200;
    t.session.spreadsheetCompilation.mapping.forEach((m) => { m.target.x += 200; });
    expect((await t.jsonCagir("verify_spreadsheet")).positionalMatch).toBe(0);
  });

  it("does not inflate an invalid source layout and preserves the active plan atomically", async () => {
    await compile();
    const before = t.session.plan;
    const g = t.session.spreadsheetAnalysis.groups[0];
    t.session.spreadsheetAnalysis.layout = "source";
    g.rows[0].seats[1].x = g.rows[0].seats[0].x;
    await expect(t.cagir("build_spreadsheet_layout")).rejects.toThrow(/geri alındı/);
    expect(t.session.plan).toBe(before);
  });

  it("requires explicit ring selection for a list without global geometry", async () => {
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet([
      ["Block", "Row", "Seat"], ["A", "A", 1], ["A", "A", 2], ["A", "A", 3],
    ]), "Seats");
    await writeFile(file, XLSX.write(wb, { type: "buffer", bookType: "xlsx" }));
    const scan = await t.jsonCagir("scan_spreadsheet", { path: file });
    await expect(t.cagir("submit_spreadsheet_analysis", { scanId: scan.scanId, venueKind: "theater" })).rejects.toThrow(/açıkça/);
    await t.cagir("submit_spreadsheet_analysis", { scanId: scan.scanId, venueKind: "theater", layout: "ring" });
    await t.cagir("build_spreadsheet_layout");
    expect((await t.jsonCagir("verify_spreadsheet")).verified).toBe(true);
    await t.cagir("accept_import");
    t.session.plan.blocks[0].x += 100;
    await expect(t.cagir("export_plan", { format: "plan", path: path.join(dir, "ring.json") }))
      .rejects.toThrow(/kaynak|hazır değil|doğrulaması/i);
  });

  it("opens only the affected aisle and preserves seat pitch and tier alignment", async () => {
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet([
      ["A1", "A2", "A3", "A1", "A2", "A3"],
      ["B1", "B2", "B3", "B1", "B2", "B3"],
    ]), "Plan");
    wb.Workbook = { Names: [
      { Name: "BLOCK_A", Ref: "Plan!$A$1:$C$2" }, { Name: "BLOCK_B", Ref: "Plan!$D$1:$F$2" },
    ] };
    await writeFile(file, XLSX.write(wb, { type: "buffer", bookType: "xlsx" }));
    const built = await compile("normalized");
    expect(built.adjustedBlocks).toHaveLength(1);
    expect(built.adjustedBlocks[0]).toMatchObject({ block: "BLOCK_B", y: 0 });
    expect((await t.jsonCagir("verify_spreadsheet")).verified).toBe(true);
    await t.cagir("accept_import");
    expect(t.session.plan.blocks[0].y).toBe(t.session.plan.blocks[1].y);
    for (const b of t.session.plan.blocks) {
      const { seats } = buildSeats(b, buildMeta(b));
      expect(seats[1].x - seats[0].x).toBeCloseTo(50);
    }
  });

  it("does not certify duplicate seat identities even when counts and positions match", async () => {
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet([["A1", "A1", "A3"]]), "Plan");
    wb.Workbook = { Names: [{ Name: "BLOCK_A", Ref: "Plan!$A$1:$C$1" }] };
    await writeFile(file, XLSX.write(wb, { type: "buffer", bookType: "xlsx" }));
    await compile();
    expect(await t.jsonCagir("verify_spreadsheet")).toMatchObject({ verified: true, verifiedIdentity: false,
      positionalMatch: 1, duplicateLabels: [{ sourceIds: ["Plan!A1", "Plan!B1"] }] });
    await t.cagir("accept_import");
    expect(t.session.plan.importVerification).toMatchObject({ sourceVerified: true,
      geometryVerified: true, identityVerified: false });
    await expect(t.cagir("export_plan", { format: "plan", path: path.join(dir, "duplicate.json") }))
      .rejects.toThrow(/kimlik|identity|hazır değil/i);
  });

  it("requires a reasoned decision for unresolved text and cannot exclude a detected seat", async () => {
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet([
      ["SAHNE"], ["A BLOK"], [1, 2, 3], [], [], [], ["VIP 3500"],
    ]), "Plan");
    await writeFile(file, XLSX.write(wb, { type: "buffer", bookType: "xlsx" }));
    await compile();
    expect((await t.jsonCagir("verify_spreadsheet")).verified).toBe(false);
    const scanId = t.session.spreadsheetScan.scanId;
    await expect(t.cagir("submit_spreadsheet_analysis", { scanId, venueKind: "theater",
      excludedCells: [{ sourceId: "Plan!A3", reason: "Cannot discard a detected seat" }] })).rejects.toThrow(/belirsiz/);
    await t.cagir("submit_spreadsheet_analysis", { scanId, venueKind: "theater",
      excludedCells: [{ sourceId: "Plan!A7", reason: "Isolated price annotation" }] });
    await t.cagir("build_spreadsheet_layout");
    expect(await t.jsonCagir("verify_spreadsheet")).toMatchObject({ verified: true, unresolvedCells: [] });
  });

  it("çelişen Excel odağında MCP candidate veya none kararını iletir", async () => {
    const scan = await t.jsonCagir("scan_spreadsheet", { path: file });
    const candidates = [
      { id: "focal-a", type: "stage", label: "SAHNE A", measured: true,
        bbox: { x: 0, y: 0, w: 100, h: 20 } },
      { id: "focal-b", type: "stage", label: "SAHNE B", measured: true,
        bbox: { x: 0, y: 30, w: 100, h: 20 } },
    ];
    t.session.spreadsheetScan.focal = null;
    t.session.spreadsheetScan.conflicts.focal = { focals: candidates };
    await t.cagir("submit_spreadsheet_analysis", { scanId: scan.scanId, venueKind: "theater",
      layout: "source", focalDecision: { candidateId: "focal-b" } });
    expect(t.session.spreadsheetAnalysis.focal.id).toBe("focal-b");
    await t.cagir("submit_spreadsheet_analysis", { scanId: scan.scanId, venueKind: "theater",
      layout: "source", focalDecision: { type: "none" } });
    expect(t.session.spreadsheetAnalysis.focal).toBeNull();
  });
});
