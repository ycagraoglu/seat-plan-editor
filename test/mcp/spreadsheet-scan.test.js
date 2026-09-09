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
  it("harf aralıklı sahneyi ve başlığa yazılmış kapasiteyi okur", async () => {
    const file = await workbookFile("xlsx", (wb) => {
      const ws = XLSX.utils.aoa_to_sheet([
        ["ÖRNEK SALON - KAPASİTE: 6"],
        ["A", 1, 2, 3],
        ["B", 1, 2, 3],
        ["S A H N E"],
      ]);
      ws["!merges"] = [XLSX.utils.decode_range("A4:D4")];
      XLSX.utils.book_append_sheet(wb, ws, "Plan");
    });

    const scan = await scanSpreadsheet(file);

    expect(scan.family).toBe("canvas-sheet-plan");
    expect(scan.focal).toMatchObject({ type: "stage", measured: true });
    expect(scan.seatCount).toBe(6);
    expect(scan.capacity).toEqual({ declared: 6, detected: 6, consistent: true });
  });

  it("kapasiteli balkon başlığını koltuk değil bölüm etiketi sayar", async () => {
    const file = await workbookFile("xlsx", (wb) => {
      const ws = XLSX.utils.aoa_to_sheet([
        [1, 2, 3],
        ["BALKON-3"],
        [1, 2, 3],
        ["ALT BLOK:3"],
        ["S A H N E"],
      ]);
      ws["!merges"] = [XLSX.utils.decode_range("A5:C5")];
      XLSX.utils.book_append_sheet(wb, ws, "Plan");
    });

    const scan = await scanSpreadsheet(file);

    expect(scan.seatCount).toBe(6);
    expect(scan.groups.flatMap((g) => g.rows.flatMap((r) => r.seats.map((s) => s.label)))).not.toContain("BALKON-3");
  });


  it("rejects workbooks with multiple visible sheets using an actionable Turkish message", async () => {
    const file = await workbookFile("xlsx", (wb) => {
      XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet([["A1", "A2", "A3"]]), "Oturma Planı");
      XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet([["TOPLAM", 3]]), "Fizibilite");
    });

    await expect(scanSpreadsheet(file)).rejects.toThrow(
      "Bu Excel'de 2 görünür sayfa var: Oturma Planı, Fizibilite. "
      + "Oturma planını tek bir görünür sayfada bırakıp dosyayı yeniden yükleyin.",
    );
  });

  it("assigns contiguous seat sequences as a whole and reports isolated price-like text", async () => {
    const file = await workbookFile("xlsx", (wb) => {
      const ws = XLSX.utils.aoa_to_sheet([
        ["SAHNE"], [],
        [null, null, null, "A BLOK", null, null, null, null, null, null, "B BLOK"],
        [null, null, 1, 2, 3, 4, 5, 6, null, 1, 2, 3, 4, 5, 6],
        [], [], [], ["VIP 3500"],
      ]);
      XLSX.utils.book_append_sheet(wb, ws, "Plan");
    });
    const scan = await scanSpreadsheet(file);
    expect(scan.groups.map((g) => [g.label, g.seatCount])).toEqual([["A BLOK", 6], ["B BLOK", 6]]);
    expect(scan.unresolvedCells).toEqual([{ sourceId: "Plan!A8", text: "VIP 3500", reason: "isolated-seat-like-text" }]);
  });

  it("reads explicit row-marker columns even when taper moves seats farther away", async () => {
    const file = await workbookFile("xlsx", (wb) => {
      const ws = XLSX.utils.aoa_to_sheet([
        ["SAHNE"], [null, null, null, "A BLOK"],
        ["AA", null, null, 1, 2, 3, 4, 5, 6],
        ["BB", null, null, null, 1, 2, 3, 4, 5],
        ["CC", null, null, null, null, null, null, 1, 2, 3],
      ]);
      XLSX.utils.book_append_sheet(wb, ws, "Plan");
    });
    const scan = await scanSpreadsheet(file);
    expect(scan.groups[0].rows.map((r) => [r.label, r.labelSource])).toEqual([
      ["AA", "explicit"], ["BB", "explicit"], ["CC", "explicit"],
    ]);
  });
  it("keeps an entire tier with its following header band", async () => {
    const file = await workbookFile("xlsx", (wb) => {
      const ws = XLSX.utils.aoa_to_sheet([
        ["SAHNE"], ["A1", "A2", "A3"], ["B1", "B2", "B3"], ["C BLOK"], [],
        ["C1", "C2", "C3"], ["D1", "D2", "D3"], ["E1", "E2", "E3"], ["B BLOK"],
      ]);
      ws["!merges"] = [XLSX.utils.decode_range("A1:C1")];
      XLSX.utils.book_append_sheet(wb, ws, "Plan");
    });
    const scan = await scanSpreadsheet(file);
    expect(scan.groups.map((g) => [g.label, g.seatCount])).toEqual([["C BLOK", 6], ["B BLOK", 9]]);
  });

  it("keeps one- and two-seat tails connected to a numeric seating row", async () => {
    const file = await workbookFile("xlsx", (wb) => {
      const ws = XLSX.utils.aoa_to_sheet([["SAHNE"], ["A BLOK"], [1, 2, 3], [1, 2], ["TOPLAM KAPASİTE", 5]]);
      ws["!merges"] = [XLSX.utils.decode_range("A1:C1")];
      XLSX.utils.book_append_sheet(wb, ws, "Plan");
    });
    const scan = await scanSpreadsheet(file);
    expect(scan.seatCount).toBe(5);
    expect(scan.groups[0].rows.map((r) => r.labelSource)).toEqual(["sheet-row", "sheet-row"]);
  });
  it("ignores a hidden support sheet and measures merges beyond the last filled cell", async () => {
    const file = await workbookFile("xlsx", (wb) => {
      for (const name of ["Original", "Copy"]) {
        const ws = XLSX.utils.aoa_to_sheet([["SAHNE"], [], ["A1", "A2", "A3"]]);
        ws["!merges"] = [XLSX.utils.decode_range("A1:Z1")];
        XLSX.utils.book_append_sheet(wb, ws, name);
      }
      wb.Workbook = { Sheets: [{ name: "Original", Hidden: 0 }, { name: "Copy", Hidden: 1 }] };
    });
    const scan = await scanSpreadsheet(file);
    expect(scan.seatCount).toBe(3);
    expect(scan.availableSheets).toEqual(["Original", "Copy"]);
    expect(scan.sheets).toEqual(["Original"]);
    expect(scan.conflicts.focal).toBeNull();
    expect(scan.focal.bbox.w).toBe(26 * 64);
  });

  it("reports overlapping named ranges instead of silently duplicating source seats", async () => {
    const file = await workbookFile("xlsx", (wb) => {
      XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet([["A1", "A2", "A3"]]), "Plan");
      wb.Workbook = { Names: [
        { Name: "BLOCK_A", Ref: "Plan!$A$1:$C$1" }, { Name: "BLOCK_B", Ref: "Plan!$B$1:$C$1" },
      ] };
    });
    expect((await scanSpreadsheet(file)).conflicts.duplicateSourceIds).toEqual(["Plan!B1", "Plan!C1"]);
  });
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

  it("döndürülmüş blokta koltuk ön eklerinden dikey sıraları çıkarır", async () => {
    const file = await workbookFile("xlsx", (wb) => {
      XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet([
        ["A4", "A4", "C4"],
        ["A3", "B3", "C3"],
        ["A2", "B2", "C2"],
        ["A1", "B1", "C1"],
      ]), "Plan");
      wb.Workbook = { Names: [{ Name: "BLOK001", Ref: "Plan!$A$1:$C$4" }] };
    });

    const scan = await scanSpreadsheet(file);

    expect(scan.groups[0].rows.map((r) => [r.label, r.axis, r.seats.map((s) => s.label)])).toEqual([
      ["A", "vertical", ["A4", "A3", "A2", "A1"]],
      ["B", "vertical", ["A4", "B3", "B2", "B1"]],
      ["C", "vertical", ["C4", "C3", "C2", "C1"]],
    ]);
  });

  it("eski xls dosyasında aynı etiketi iki fiziksel koltuk olarak tutar", async () => {
    const file = await workbookFile("xls", (wb) => {
      const ws = XLSX.utils.aoa_to_sheet([["SAHNE"], ["A BLOK"], ["A1", "A2", "A3"], ["H16", "H16", "H17"]]);
      ws["!merges"] = [XLSX.utils.decode_range("A1:C1")];
      XLSX.utils.book_append_sheet(wb, ws, "Plan");
    });

    const scan = await scanSpreadsheet(file);

    expect(scan.family).toBe("canvas-sheet-plan");
    expect(scan.seatCount).toBe(6);
    expect(scan.groups).toHaveLength(1);
    expect(scan.conflicts.duplicateLabels.some((x) => x.label === "H16")).toBe(true);
    expect(new Set(scan.groups.flatMap((g) => g.rows.flatMap((r) =>
      r.seats.map((s) => s.sourceId)))).size).toBe(6);
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
