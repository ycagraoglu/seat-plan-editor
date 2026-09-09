import { it, expect } from "vitest";
import { mkdtempSync, writeFileSync, rmSync } from "node:fs";
import { execFileSync } from "node:child_process";
import { tmpdir } from "node:os";
import path from "node:path";
import XLSX from "@e965/xlsx";

it("persists the Excel workflow across separate CLI processes, starting without a plan", () => {
  const dir = mkdtempSync(path.join(tmpdir(), "seat-excel-cli-"));
  try {
    const file = path.join(dir, "source.xlsx");
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet([["A1", "A2", "A3"]]), "Plan");
    wb.Workbook = { Names: [{ Name: "BLOCK_A", Ref: "Plan!$A$1:$C$1" }] };
    writeFileSync(file, XLSX.write(wb, { type: "buffer", bookType: "xlsx" }));
    const call = (tool, args = {}) => execFileSync(process.execPath,
      [path.resolve("mcp/cli.mjs"), "call", tool, JSON.stringify(args)], {
        cwd: dir, encoding: "utf8", timeout: 15000,
        env: { ...process.env, SEAT_EDITOR_API: "", MCP_SESSION: path.join(dir, "session.json") },
      });
    const scan = call("scan_spreadsheet", { path: file });
    const scanId = scan.match(/"scanId":\s*"([^"]+)"/)[1];
    expect(call("editor_capabilities")).toContain("spreadsheet-scanned");
    call("submit_spreadsheet_analysis", { scanId, venueKind: "theater" });
    expect(call("build_spreadsheet_layout")).toContain('"built": true');
    expect(call("verify_spreadsheet")).toContain('"verified": true');
    expect(call("editor_capabilities")).toContain("spreadsheet-verified");
  } finally { rmSync(dir, { recursive: true, force: true }); }
}, 20000);
