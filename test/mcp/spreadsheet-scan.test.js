import { afterEach, describe, expect, it } from "vitest";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import XLSX from "@e965/xlsx";
import { scanSpreadsheet } from "../../mcp/spreadsheet-scan.mjs";

const dirs = [];

async function workbookFile(ext, build) {
  const dir = await mkdtemp(path.join(tmpdir(), "seat-sheet-"));
  dirs.push(dir);
  const wb = XLSX.utils.book_new();
  build(wb);
  const file = path.join(dir, `plan.${ext}`);
  await writeFile(file, XLSX.write(wb, { type: "buffer", bookType: ext === "xls" ? "biff8" : "xlsx" }));
  return file;
}

afterEach(async () => Promise.all(dirs.splice(0).map((d) => rm(d, { recursive: true, force: true }))));

describe("Excel oturma planı tarayıcı", () => {
  it("adlandırılmış blok alanındaki koltukları ve kaynak boşluğunu korur", async () => {
    const file = await workbookFile("xlsx", (wb) => {
      const ws = XLSX.utils.aoa_to_sheet([
        ["SAHNE"],
        [],
        ["A1", "A2", null, "A4"],
        ["B1", "B2", "B3", "B4"],
        ["TOPLAM KAPASİTE", 99],
      ]);
      ws["!merges"] = [XLSX.utils.decode_range("A1:D1")];
      XLSX.utils.book_append_sheet(wb, ws, "Salon");
      wb.Workbook = { Names: [{ Name: "BLOK001", Ref: "Salon!$A$3:$D$4" }] };
    });

    const scan = await scanSpreadsheet(file);

    expect(scan.family).toBe("named-range-plan");
    expect(scan.seatCount).toBe(7);
    expect(scan.groups).toHaveLength(1);
    expect(scan.groups[0].rows.map((r) => r.seats.map((s) => s.address))).toEqual([
      ["A3", "B3", "D3"], ["A4", "B4", "C4", "D4"],
    ]);
    expect(scan.focal).toMatchObject({ type: "stage", label: "SAHNE", measured: true });
    expect(scan.capacity).toMatchObject({ declared: 99, detected: 7, consistent: false });
    expect(scan.overlay).toBeInstanceOf(Buffer);
  });

  it("eski xls bölüm manifestosunda aynı etiketi iki fiziksel koltuk olarak tutar", async () => {
    const file = await workbookFile("xls", (wb) => {
      for (const name of ["Section 101", "Section 102"]) {
        const ws = XLSX.utils.aoa_to_sheet([["A1", "A2", "A3"], ["H16", "H16", "H17"]]);
        XLSX.utils.book_append_sheet(wb, ws, name);
      }
      XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet([
        ["Section", "Total Seats"], [101, 6], [102, 6], ["TOTAL", 12],
      ]), "Total Capacity");
    });

    const scan = await scanSpreadsheet(file);

    expect(scan.family).toBe("section-manifest");
    expect(scan.seatCount).toBe(12);
    expect(scan.groups).toHaveLength(2);
    expect(scan.conflicts.duplicateLabels.some((x) => x.label === "H16")).toBe(true);
    expect(scan.capacity).toMatchObject({ declared: 12, detected: 12, consistent: true });
    expect(new Set(scan.groups.flatMap((g) => g.rows.flatMap((r) =>
      r.seats.map((s) => s.sourceId)))).size).toBe(12);
  });

  it("tuval planında aynı koltuk stilindeki kısa sıra parçasını kaybetmez", async () => {
    const file = await workbookFile("xlsx", (wb) => {
      const ws = XLSX.utils.aoa_to_sheet([
        ["SAHNE"], [],
        [null, "A Blok"],
        [1, 2, 3, 4],
        [1, 2, 3],
        ["TOPLAM KAPASİTE", 7],
      ]);
      ws["!merges"] = [XLSX.utils.decode_range("A1:D1")];
      for (const a of ["A4", "B4", "C4", "D4", "A5", "B5", "C5"]) {
        ws[a].s = { fill: { patternType: "solid", fgColor: { rgb: "FFC000" } } };
      }
      XLSX.utils.book_append_sheet(wb, ws, "Plan");
    });

    const scan = await scanSpreadsheet(file);

    expect(scan.family).toBe("canvas-sheet-plan");
    expect(scan.seatCount).toBe(7);
    expect(scan.capacity).toMatchObject({ declared: 7, consistent: true });
  });

  it("birden fazla çelişen odak alanını karar gerektiren çatışma yapar", async () => {
    const file = await workbookFile("xlsx", (wb) => {
      const ws = XLSX.utils.aoa_to_sheet([["SAHNE"], [], ["A1", "A2", "A3"], [], ["PERDE"]]);
      ws["!merges"] = [XLSX.utils.decode_range("A1:C1"), XLSX.utils.decode_range("A5:C5")];
      XLSX.utils.book_append_sheet(wb, ws, "Salon");
      wb.Workbook = { Names: [{ Name: "BLOK001", Ref: "Salon!$A$3:$C$3" }] };
    });

    const scan = await scanSpreadsheet(file);

    expect(scan.conflicts.focal).toMatchObject({ candidates: 2 });
  });

  it("blok sıra koltuk sütunlarını düz liste olarak gruplar", async () => {
    const file = await workbookFile("xlsx", (wb) => {
      XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet([
        ["Blok", "Sıra", "Koltuk"],
        ["A", "A", 1], ["A", "A", 2], ["A", "B", 1],
        ["B", 1, 1], ["B", 1, 2], ["B", 1, 3],
      ]), "Liste");
    });

    const scan = await scanSpreadsheet(file);

    expect(scan.family).toBe("flat-list");
    expect(scan.seatCount).toBe(6);
    expect(scan.groups.map((g) => [g.label, g.rows.length, g.seatCount])).toEqual([
      ["A", 2, 3], ["B", 1, 3],
    ]);
  });

  it("gizli satırdaki hücreleri görünür plan koltuğu saymaz", async () => {
    const file = await workbookFile("xlsx", (wb) => {
      const ws = XLSX.utils.aoa_to_sheet([["A1", "A2", "A3"], ["B1", "B2", "B3"]]);
      ws["!rows"] = [{}, { hidden: true }];
      XLSX.utils.book_append_sheet(wb, ws, "Salon");
      wb.Workbook = { Names: [{ Name: "BLOK001", Ref: "Salon!$A$1:$C$2" }] };
    });

    expect((await scanSpreadsheet(file)).seatCount).toBe(3);
  });
});
