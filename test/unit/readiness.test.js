import { describe, it, expect } from "vitest";
import { deliveryReadiness, markSourceVerified, planFingerprint } from "../../src/core/readiness.js";
import { AYLAK } from "../../src/venues/index.js";

describe("deliveryReadiness", () => {
  it("temiz örnek plan teslim edilebilir", () => {
    expect(deliveryReadiness(AYLAK).ready).toBe(true);
  });

  it("sert geometri hatasını teslim kapısında engeller", () => {
    const plan = { ...AYLAK, blocks: [AYLAK.blocks[0], { ...AYLAK.blocks[0], id: "overlap", label: "X" }],
      sections: [], groups: [], shapes: [] };
    const r = deliveryReadiness(plan);
    expect(r.ready).toBe(false);
    expect(r.blockers.map((f) => f.id)).toContain("footprint-overlap-same-level");
  });

  it("kaynak doğrulaması fingerprint'e bağlıdır; sonradan değişen plan teslim edilmez", () => {
    const verified = markSourceVerified(AYLAK, { kind: "spreadsheet",
      geometryVerified: true, identityVerified: true, sourceVerified: true });
    expect(deliveryReadiness(verified).ready).toBe(true);
    expect(verified.importVerification.fingerprint).toBe(planFingerprint(verified));

    const changed = { ...verified, blocks: verified.blocks.map((b, i) =>
      i === 0 ? { ...b, x: b.x + 10 } : b) };
    const r = deliveryReadiness(changed);
    expect(r.ready).toBe(false);
    expect(r.blockers.map((f) => f.id)).toContain("source-fingerprint-mismatch");
  });

  it("transport metadata fingerprint'i bozmaz; geometri ve kimlik bozar", () => {
    const verified = markSourceVerified(AYLAK, { kind: "spreadsheet", sourceHash: "abc" });
    const transported = { ...verified, key: "ai-yeni", name: "Kayıt adı", schemaVersion: 999,
      home: { x: 1, y: 2, w: 3, h: 4 }, versions: [{ v: 1 }], published: 1 };
    expect(planFingerprint(transported)).toBe(verified.importVerification.fingerprint);
    expect(deliveryReadiness(transported).ready).toBe(true);
    expect(planFingerprint({ ...transported, blocks: transported.blocks.map((b, i) =>
      i ? b : { ...b, x: b.x + 1 }) })).not.toBe(verified.importVerification.fingerprint);
    expect(planFingerprint({ ...transported, idTemplate: "X-{seat}" }))
      .not.toBe(verified.importVerification.fingerprint);
  });

  it("geometrisi doğrulanmış ama kimliği çözülmemiş kaynak taslağı teslim edilmez", () => {
    const draft = markSourceVerified(AYLAK, { sourceVerified: true,
      geometryVerified: true, identityVerified: false });
    const r = deliveryReadiness(draft);
    expect(r.ready).toBe(false);
    expect(r.blockers.map((f) => f.id)).toContain("source-identity-unresolved");
  });
});
