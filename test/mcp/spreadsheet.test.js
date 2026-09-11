import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import XLSX from "@e965/xlsx";
import { baglan } from "./harness.js";

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
      scanId: scan.scanId, venueKind: "theater", name: "Excel Salon",
      groupOverrides: [{ groupId: scan.groups[0].groupId, label: "PARTER", level: "Parter" }],
    });
    expect((await t.jsonCagir("editor_capabilities")).session.phase).toBe("spreadsheet-semantics-ready");
    const built = await t.jsonCagir("build_spreadsheet_layout");
    expect(built).toMatchObject({ built: true, sourceSeats: 7, planSeats: 7 });
    expect(t.session.plan.name).toBe("Excel Salon");
    expect((await t.jsonCagir("editor_capabilities")).session.phase).toBe("spreadsheet-compiled");

    const verified = await t.jsonCagir("verify_spreadsheet");
    expect(verified).toMatchObject({ verified: true, sourceSeats: 7, planSeats: 7,
      sourceRows: 2, planRows: 2, positionalMatch: 1, focalIoU: 1,
      verifiedSourceGeometry: true, capacityConsistent: true });
    expect((await t.jsonCagir("editor_capabilities")).session.phase).toBe("spreadsheet-verified");
  });

  it("Excel aktarımı beklerken düşük seviyeli blok eklemeyi reddeder", async () => {
    await t.cagir("scan_spreadsheet", { path: file });
    await t.cagir("create_plan", { name: "Yeni" });
    await t.cagir("scan_spreadsheet", { path: file });
    await expect(t.cagir("add_block", { kind: "grid", label: "A", level: "Parter", rows: 2, cols: 3,
      x: 0, y: 0 })).rejects.toThrow(/Excel|elektronik tablo/i);
  });
});
