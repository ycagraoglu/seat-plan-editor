import { describe, expect, it } from "vitest";
import {
  buildManualImageImportAnalysis,
  buildManualSpreadsheetImportAnalysis,
  canvasRenderState,
  deliveryExportState,
  livePollingAllowed,
  manualImageImportReady,
  manualSpreadsheetImportReady,
  adoptPlan,
  persistAcceptedImport,
  visibleCanvasPlan,
} from "../../src/PlanEditor.jsx";
import { markSourceVerified, planFingerprint } from "../../src/core/readiness.js";
import { LocalStore } from "../../src/store/index.js";

const scan = {
  scanId: "scan-ui",
  rows: [
    { rowId: "row-1", seats: [{}, {}, {}], confidence: 0.99, needsReview: false },
    { rowId: "row-2", seats: [{}, {}], confidence: 0.71, needsReview: true },
  ],
  focalCandidates: [{ id: "focal-1", type: "stage", label: "SAHNE", confidence: 0.8 }],
};

describe("manuel görsel import anlamlandırması", () => {
  it("satır ve odak kararı çözülmeden analiz üretmez", () => {
    const job = { kind: "image", scan, rowAssignments: {}, focalChoice: "" };
    expect(manualImageImportReady(job)).toMatchObject({ ok: false });
    expect(() => buildManualImageImportAnalysis(job)).toThrow(/blok etiketi|odak/i);
  });

  it("satır ataması, düşük güven onayı ve focal none kararını analiz gövdesine çevirir", () => {
    const job = {
      kind: "image",
      scan,
      rowAssignments: {
        "row-1": { action: "include", label: "A", level: "Parter" },
        "row-2": { action: "exclude", reason: "Kaynakta dekoratif satır", reviewed: true },
      },
      focalChoice: "none",
    };
    expect(manualImageImportReady(job)).toEqual({ ok: true });
    expect(buildManualImageImportAnalysis(job)).toMatchObject({
      scanId: "scan-ui",
      venueKind: "theater",
      groups: [{ label: "A", level: "Parter", rowIds: ["row-1"] }],
      excludedRows: [{ rowId: "row-2", reason: "Kaynakta dekoratif satır" }],
      reviewedRowIds: ["row-2"],
      focalDecision: { type: "none" },
    });
  });

  it("preview varsa canvas'ın tek görünür planı preview olur", () => {
    const active = { key: "active", blocks: [{ id: "old" }], shapes: [] };
    const preview = { key: "preview", blocks: [{ id: "new" }], shapes: [] };
    expect(visibleCanvasPlan(active, { previewPlan: preview })).toBe(preview);
    expect(visibleCanvasPlan(active, null)).toBe(active);
    expect(canvasRenderState(active, { previewPlan: preview })).toMatchObject({
      plan: preview,
      isImportPreview: true,
      interactive: false,
      levelFilter: "*",
      fitPlan: preview,
    });
    expect(canvasRenderState(active, null)).toMatchObject({
      plan: active,
      isImportPreview: false,
      interactive: true,
    });
  });

  it("önizleme kabul edilmeden CSV/SVG teslim kapısı açılmaz", () => {
    expect(deliveryExportState({ blocks: [], shapes: [] }, true)).toMatchObject({ ok: false });
  });

  it("manuel Excel kaynak yerleşimini varsayar ve yalnız semantik override üretir", () => {
    const job = { name: "Plan.xlsx", scan: { scanId: "s1", family: "named-range-plan",
      groups: [{ groupId: "g1", label: "A", level: "Parter", rows: [], seatCount: 3 }],
      unresolvedCells: [], conflicts: {} },
      groupAssignments: { g1: { action: "include", label: "B", level: "Üst",
        rows: [{ seats: [{ sourceId: "INVENTED" }] }], bbox: { x: -1 } } } };
    expect(manualSpreadsheetImportReady(job)).toEqual({ ok: true });
    expect(buildManualSpreadsheetImportAnalysis(job)).toEqual({ scanId: "s1", venueKind: "general",
      name: "Plan.xlsx", layout: "source", groupOverrides: [{ groupId: "g1", label: "B",
        name: "A", level: "Üst" }], excludedGroups: [], excludedCells: [] });
  });

  it("flat-list halka kararı ve belirsiz hücre nedeni olmadan ilerlemez", () => {
    const job = { scan: { scanId: "s", family: "flat-list", groups: [],
      unresolvedCells: [{ sourceId: "Plan!A1" }], conflicts: {} } };
    expect(manualSpreadsheetImportReady(job).ok).toBe(false);
  });

  it("JSON içe aktarma kaynak doğrulama damgasına güvenmez", () => {
    const raw = markSourceVerified({ key: "tmp", name: "Kaynak", blocks: [], shapes: [] }, {
      sourceHash: "sha", identityVerified: false });
    const adopted = adoptPlan(raw, "accepted");
    expect(adopted.importVerification).toMatchObject({ sourceVerified: false,
      geometryVerified: false, identityVerified: false, invalidationReason: "json-import-untrusted" });
    expect(deliveryExportState(adopted)).toMatchObject({ ok: false });
  });

  it("sourceVerified false JSON içe aktarma teslimata hazır olmaz", () => {
    const adopted = adoptPlan({ key: "tmp", blocks: [], shapes: [], importVerification: {
      sourceVerified: false, geometryVerified: true, identityVerified: true,
      fingerprint: "uydurma", sourceHash: "sha" } }, "accepted");
    expect(adopted.importVerification.sourceVerified).toBe(false);
    expect(deliveryExportState(adopted).ok).toBe(false);
  });

  it("taze kabul edilen import ilk autosave ile kalır ve refresh sonrası doğrulaması geçerlidir", async () => {
    LocalStore.mem.clear();
    const raw = markSourceVerified({ key: "tmp", name: "Kaynak", blocks: [], shapes: [] }, {
      sourceHash: "sha", identityVerified: false });
    const accepted = await persistAcceptedImport(raw, "accepted-reload", LocalStore);
    expect(accepted.saved).toBe(true);
    const loaded = await LocalStore.load(accepted.plan.key);
    expect(loaded.importVerification.fingerprint).toBe(planFingerprint(loaded));
    expect(loaded.importVerification.sourceHash).toBe("sha");
  });

  it("manuel önizleme açıkken canlı polling uygulanmaz, kapanınca sürer", () => {
    expect(livePollingAllowed({ previewPlan: { key: "preview" } })).toBe(false);
    expect(livePollingAllowed({ previewPlan: null })).toBe(true);
    expect(livePollingAllowed(null)).toBe(true);
  });
});
