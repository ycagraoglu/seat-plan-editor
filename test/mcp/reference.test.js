import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { createCanvas } from "@napi-rs/canvas";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { baglan } from "./harness.js";

describe("referans tarama → semantik → atomik plan → doğrulama", () => {
  let t, dir, file;
  beforeEach(async () => {
    delete process.env.SEAT_EDITOR_API;
    t = await baglan();
    dir = await mkdtemp(path.join(tmpdir(), "seat-reference-"));
    file = path.join(dir, "salon.png");
    const canvas = createCanvas(220, 140), ctx = canvas.getContext("2d");
    ctx.fillStyle = "white"; ctx.fillRect(0, 0, 220, 140);
    ctx.fillStyle = "#2463a5";
    for (const y of [35, 60, 100]) for (let x = 30; x <= (y === 100 ? 130 : 170); x += 20) ctx.fillRect(x, y, 10, 8);
    await writeFile(file, canvas.toBuffer("image/png"));
    await t.cagir("create_plan", { name: "Referans Salon" });
    await t.cagir("set_underlay", { path: file });
  });
  afterEach(async () => { await t.kapat(); await rm(dir, { recursive: true, force: true }); });

  it("scan_reference fiziksel ölçümü yapar ve durum makinesini ilerletir", async () => {
    expect((await t.jsonCagir("editor_capabilities")).session.phase).toBe("source-loaded");
    const scan = await t.jsonCagir("scan_reference", { path: file });
    expect(scan).toMatchObject({ width: 220, height: 140, seatCount: 22 });
    expect(scan.rows.map((r) => r.centers.length)).toEqual([8, 8, 6]);
    expect(scan.scanId).toMatch(/^scan-/);
    expect((await t.jsonCagir("editor_capabilities")).session.phase).toBe("scanned");
  });

  it("tarama satırlarını bir kez kullanıp birebir plan kurar ve doğrular", async () => {
    const scan = await t.jsonCagir("scan_reference", { path: file });
    await t.cagir("submit_reference_analysis", { scanId: scan.scanId, venueKind: "theater",
      focal: { type: "stage", label: "SAHNE", bbox: { x: 20, y: 5, w: 180, h: 15 } },
      groups: [
        { rowIds: scan.rows.slice(0, 2).map((r) => r.rowId), level: "Parter", label: "UST" },
        { rowIds: [scan.rows[2].rowId], level: "Parter", label: "ALT" },
      ] });
    expect((await t.jsonCagir("editor_capabilities")).session.phase).toBe("semantics-ready");
    const activeBeforeBuild = structuredClone(t.session.plan);
    const built = await t.jsonCagir("replace_layout");
    expect(built).toMatchObject({ built: true, sourceSeats: 22, planSeats: 22 });
    expect(t.session.plan).toEqual(activeBeforeBuild);
    expect(t.session.referencePreviewPlan.blocks).toHaveLength(2);
    expect(t.session.referencePreviewPlan.shapes).toHaveLength(1);
    expect((await t.jsonCagir("editor_capabilities")).session.phase).toBe("compiled");
    const verified = await t.jsonCagir("verify_reference");
    expect(verified).toMatchObject({ verified: true, sourceSeats: 22, planSeats: 22,
      matchedSeats: 22, positionalMatch: 1, extraSeats: 0, focalIoU: 1, inventedObjects: 0 });
    expect(t.session.plan).toEqual(activeBeforeBuild);
    expect((await t.jsonCagir("editor_capabilities")).session.phase).toBe("verified");
    await t.cagir("accept_import");
    expect(t.session.plan.blocks).toHaveLength(2);
    expect(t.session.plan.shapes).toHaveLength(1);
    expect(t.session.plan.importVerification.sourceVerified).toBe(true);
  });

  it("aynı rowId iki grupta kullanılırsa reddeder", async () => {
    const scan = await t.jsonCagir("scan_reference", { path: file }), rowId = scan.rows[0].rowId;
    await expect(t.cagir("submit_reference_analysis", { scanId: scan.scanId, venueKind: "theater",
      groups: [{ rowIds: [rowId], level: "P" }, { rowIds: [rowId], level: "B" }],
      excludedRows: scan.rows.slice(1).map((r) => ({ rowId: r.rowId, reason: "kaynakta oturma grubu değil" }))
    })).rejects.toThrow(/iki grupta|bir kez/i);
  });

  it("yüksek güvenli satır açıklamasız dışarıda bırakılamaz", async () => {
    const scan = await t.jsonCagir("scan_reference", { path: file });
    await expect(t.cagir("submit_reference_analysis", { scanId: scan.scanId, venueKind: "theater",
      groups: [{ rowIds: [scan.rows[0].rowId], level: "P" }] })).rejects.toThrow(/gruba|dışlan/i);
  });

  it("eski elle bbox ve koltuk sayısı sözleşmesini açıkça reddeder", async () => {
    await expect(t.cagir("submit_reference_analysis", { venueKind: "cinema",
      sourceSize: { width: 1000, height: 1000 }, blocks: [{ level: "Salon",
        bbox: { x: 10, y: 10, w: 100, h: 100 }, rows: [{ label: "A", seats: 10 }] }],
      observations: ["eski biçim"] })).rejects.toThrow(/scan_reference|eski/i);
  });

  it("derleme sert çakışma üretirse aktif planı değiştirmeden geri alır", async () => {
    const scan = await t.jsonCagir("scan_reference", { path: file });
    const before = structuredClone(t.session.plan);
    t.session.referenceScan.rows[2].seats = t.session.referenceScan.rows[0].seats
      .map((s, i) => ({ ...s, id: "forced-" + i }));
    await t.cagir("submit_reference_analysis", { scanId: scan.scanId, venueKind: "theater",
      groups: [{ rowIds: [scan.rows[0].rowId], level: "P", label: "A" },
        { rowIds: [scan.rows[2].rowId], level: "P", label: "B" }],
      excludedRows: [{ rowId: scan.rows[1].rowId, reason: "testte bilinçli dışlandı" }] });
    await expect(t.cagir("replace_layout")).rejects.toThrow(/geri alındı|çakış/i);
    expect(t.session.plan.blocks).toEqual(before.blocks);
    expect(t.session.referenceCompilation).toBeNull();
    expect(t.session.referencePreviewPlan).toBeNull();
  });

  it("ortak merkezli kavisli sıraları fan bloğa derler", async () => {
    const canvas = createCanvas(220, 180), ctx = canvas.getContext("2d");
    ctx.fillStyle = "white"; ctx.fillRect(0, 0, 220, 180); ctx.fillStyle = "#2463a5";
    for (const radius of [70, 95]) for (let i = 0; i < 9; i++) {
      const a = (-40 + i * 10) * Math.PI / 180;
      ctx.fillRect(Math.round(110 + radius * Math.sin(a)) - 4,
        Math.round(20 + radius * Math.cos(a)) - 3, 8, 6);
    }
    await writeFile(file, canvas.toBuffer("image/png"));
    const scan = await t.jsonCagir("scan_reference", { path: file });
    await t.cagir("submit_reference_analysis", { scanId: scan.scanId, venueKind: "theater",
      groups: [{ rowIds: scan.rows.map((r) => r.rowId), level: "Parter", label: "YAY" }],
      reviewedRowIds: scan.needsReview });
    await t.cagir("replace_layout");
    expect(t.session.referencePreviewPlan.blocks[0].kind).toBe("fan");
    expect((await t.jsonCagir("verify_reference")).verified).toBe(true);
    await t.cagir("accept_import");
    expect(t.session.plan.blocks[0].kind).toBe("fan");
  });
});
