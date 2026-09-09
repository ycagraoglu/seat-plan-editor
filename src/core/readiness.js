import { buildMeta } from "./geometry.js";
import { gateMap } from "./gates.js";
import { buildCtx, runRules } from "./rules.js";

export const DELIVERY_BLOCKERS = new Set(["seats-outside-boundary", "blocks-outside-boundary",
  "footprint-overlap-same-level", "seat-clash", "narrow-aisle", "seat-in-own-block",
  "seat-corners-outside-boundary", "duplicate-seat-ids", "unlabeled-seats", "orphan-blocks",
  "section-cycle", "section-depth", "section-sibling-code",
  "source-not-verified", "source-fingerprint-mismatch", "source-identity-unresolved",
  "source-geometry-unverified"]);

function stable(value) {
  if (Array.isArray(value)) return value.map(stable);
  if (!value || typeof value !== "object") return value;
  return Object.fromEntries(Object.entries(value)
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([k, v]) => [k, stable(v)]));
}

export function planFingerprint(plan) {
  const { key, name, unit, home, schemaVersion, versions, published, underlay,
    importVerification, ...sourceRelevant } = plan || {};
  return JSON.stringify(stable(sourceRelevant));
}

export function markSourceVerified(plan, meta = {}) {
  const next = { ...plan };
  next.importVerification = {
    kind: meta.kind || "source",
    scanId: meta.scanId || null,
    sourceHash: meta.sourceHash || null,
    sourceVerified: meta.sourceVerified !== false,
    geometryVerified: meta.geometryVerified !== false,
    identityVerified: meta.identityVerified !== false,
    verifiedAt: meta.verifiedAt || new Date().toISOString(),
    notes: meta.notes || [],
  };
  next.importVerification.fingerprint = planFingerprint(next);
  return next;
}

export function invalidateSourceVerification(plan, reason = "manual-change") {
  if (!plan?.importVerification) return plan;
  return { ...plan, importVerification: { ...plan.importVerification,
    sourceVerified: false, geometryVerified: false, identityVerified: false,
    deliveryReady: false, invalidatedAt: new Date().toISOString(), invalidationReason: reason } };
}

function sourceBlockers(plan) {
  const v = plan?.importVerification;
  if (!v) return [];
  const out = [];
  if (!v.sourceVerified) out.push({ id: "source-not-verified", t: "err",
    m: "Kaynak doğrulaması yok veya son değişiklikle geçersiz kaldı" });
  if (!v.geometryVerified) out.push({ id: "source-geometry-unverified", t: "err",
    m: "Kaynak geometrisi doğrulanmadan yayın/dışa aktarım yapılamaz" });
  if (!v.identityVerified) out.push({ id: "source-identity-unresolved", t: "err",
    m: "Koltuk kimliği/sıra/blok eşleşmesi çözülmeden yayın/dışa aktarım yapılamaz" });
  if (v.sourceVerified && v.fingerprint !== planFingerprint(plan)) {
    out.push({ id: "source-fingerprint-mismatch", t: "err",
      m: "Plan doğrulandıktan sonra değişmiş; kaynağa göre tekrar doğrulanmalı" });
  }
  return out;
}

export function deliveryReadiness(plan, metas = null, gates = null) {
  const ms = metas || (plan.blocks || []).map((b) => ({ b, m: buildMeta(b) }));
  const gs = gates || gateMap(plan);
  const findings = runRules(buildCtx(plan, ms, gs));
  const blockers = [
    ...findings.filter((f) => f.t === "err" && DELIVERY_BLOCKERS.has(f.id)),
    ...sourceBlockers(plan),
  ];
  return {
    ready: blockers.length === 0,
    geometryVerified: !findings.some((f) => f.t === "err" && DELIVERY_BLOCKERS.has(f.id)),
    sourceVerified: !sourceBlockers(plan).some((f) => f.id === "source-not-verified"
      || f.id === "source-fingerprint-mismatch"),
    identityVerified: !sourceBlockers(plan).some((f) => f.id === "source-identity-unresolved"),
    deliveryReady: blockers.length === 0,
    findings, blockers,
  };
}

export function assertDeliveryReady(plan, metas = null, gates = null) {
  const r = deliveryReadiness(plan, metas, gates);
  if (!r.ready) {
    throw new Error("Plan yayına hazır değil: " + [...new Set(r.blockers.map((f) => f.id))].join(", "));
  }
  return r;
}
