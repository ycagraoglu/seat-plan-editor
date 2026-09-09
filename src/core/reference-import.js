import { createCanvas } from "@napi-rs/canvas";
import { fanB, gr } from "../venues/builders.js";
import { DEF, buildMeta, buildSeats, prep, rowPts } from "./geometry.js";
import { DEF_NUM, reLabel } from "./labels.js";
import { nid } from "./ids.js";
import { buildCtx, runRules } from "./rules.js";
import { gateMap } from "./gates.js";
import { DELIVERY_BLOCKERS, markSourceVerified } from "./readiness.js";
import { extent, pointBounds } from "./bounds.js";

const median = (xs) => {
  const a = xs.filter(Number.isFinite).toSorted((x, y) => x - y);
  return a.length ? (a[(a.length - 1) >> 1] + a[a.length >> 1]) / 2 : 0;
};
const clean = (v) => String(v ?? "").replace(/\p{Cf}/gu, "").trim();
const rowCount = (analysis) => (analysis.groups || []).reduce((n, g) => n + g.rowIds.length, 0);
const hardFindings = (plan) => runRules(buildCtx(plan,
  (plan.blocks || []).map((b) => ({ b, m: buildMeta(b) })), gateMap(plan)))
  .filter((f) => f.t === "err" && DELIVERY_BLOCKERS.has(f.id) && !String(f.id).startsWith("source-"));

export function normalizeReferenceAnalysis(scan, input = {}) {
  if (!input.scanId || input.blocks || input.sourceSize) {
    throw new Error("Eski elle bbox/koltuk sayısı biçimi reddedildi; önce scan_reference çağır ve scanId/rowIds kullan.");
  }
  if (!scan || scan.scanId !== input.scanId) throw new Error("Geçerli tarama bulunamadı; scan_reference çağır.");
  const focalBox = input.focal?.bbox;
  if (focalBox) {
    const nums = [focalBox.x, focalBox.y, focalBox.w, focalBox.h];
    if (!nums.every(Number.isFinite) || focalBox.x < 0 || focalBox.y < 0
      || focalBox.w <= 0 || focalBox.h <= 0
      || focalBox.x + focalBox.w > scan.width || focalBox.y + focalBox.h > scan.height) {
      throw new Error("Focal bbox geçerli, pozitif ve kaynak görsel sınırları içinde olmalı.");
    }
  }
  const groups = input.groups || [], excluded = input.excludedRows || [];
  const all = new Set((scan.rows || []).map((r) => r.rowId)), used = new Set();
  for (const group of groups) for (const id of group.rowIds) {
    if (!all.has(id)) throw new Error("Bilinmeyen rowId: " + id);
    if (used.has(id)) throw new Error(id + " iki grupta kullanılamaz; her sıra tam bir kez bağlanmalı.");
    used.add(id);
  }
  for (const item of excluded) {
    if (!all.has(item.rowId)) throw new Error("Bilinmeyen rowId: " + item.rowId);
    if (used.has(item.rowId)) throw new Error(item.rowId + " hem grupta hem dışlananlarda.");
    used.add(item.rowId);
  }
  const missing = [...all].filter((id) => !used.has(id));
  if (missing.length) throw new Error("Her sıra bir gruba bağlanmalı veya gerekçeyle dışlanmalı: " + missing.join(", "));
  const reviewed = new Set(input.reviewedRowIds || []);
  const unresolved = (scan.rows || []).filter((r) => r.needsReview && !reviewed.has(r.rowId)
    && !excluded.some((x) => x.rowId === r.rowId)).map((r) => r.rowId);
  if (unresolved.length) throw new Error("Düşük güvenli sıralar kullanıcıyla çözülmeli: " + unresolved.join(", "));
  for (const item of excluded) {
    if (!String(item.reason || "").trim()) throw new Error(`${item.rowId} için dışlama nedeni gerekli.`);
  }
  const candidates = scan.focalCandidates || [];
  let focal = input.focal || null;
  const decision = input.focalDecision || (input.focalNone ? { type: "none" } : null);
  if (decision?.type === "none") focal = null;
  else if (decision?.candidateId) {
    const found = candidates.find((c) => c.id === decision.candidateId);
    if (!found) throw new Error("Bilinmeyen focal adayı: " + decision.candidateId);
    focal = { type: found.type, label: found.label || found.type, bbox: found.bbox };
  } else if (!focal && (candidates.length || scan.reviewRequired?.focal?.length)) {
    throw new Error("Odak kararı gerekli: aday seç veya kaynakta odak yok de.");
  }
  return structuredClone({ ...input, groups, excludedRows: excluded, focal,
    focalDecision: decision || (focal ? { type: "measured" } : { type: "none" }) });
}

export function compileReferenceLayout(active, scan, analysis) {
  const gaps = scan.rows.flatMap((r) => r.seats.slice(1).map((s, i) =>
    Math.hypot(s.x - r.seats[i].x, s.y - r.seats[i].y)).filter((n) => n > 0));
  const medianGap = median(gaps) || 10;
  const minGap = extent(gaps)?.min || medianGap;
  const scale = (Math.hypot(DEF.seatW, DEF.seatH) + 2) / Math.min(minGap, medianGap);
  const wx = (x) => (x - scan.width / 2) * scale;
  const wy = (y) => (y - scan.height / 2) * scale;
  const rowById = new Map(scan.rows.map((r) => [r.rowId, r]));
  const mapping = [];
  const blocks = analysis.groups.map((group, bi) => {
    let rows = group.rowIds.map((id) => rowById.get(id));
    const arcCenters = rows.filter((r) => r.arc).map((r) => r.arc);
    const arcX = extent(arcCenters, (a) => a.cx), arcY = extent(arcCenters, (a) => a.cy);
    const commonArc = arcCenters.length === rows.length && arcX && arcY
      && arcX.max - arcX.min <= 4 && arcY.max - arcY.min <= 4;
    if (commonArc) rows = [...rows].sort((a, b) => a.arc.r - b.arc.r);
    const angle = commonArc ? 0 : median(rows.map((r) => r.angle || 0));
    const rad = angle * Math.PI / 180, cos = Math.cos(rad), sin = Math.sin(rad);
    const centers = rows.map((r) => ({ x: median(r.seats.map((s) => wx(s.x))),
      y: median(r.seats.map((s) => wy(s.y))) }));
    const first = commonArc ? { x: wx(median(rows.map((r) => r.arc.cx))),
      y: wy(median(rows.map((r) => r.arc.cy))) } : centers[0];
    const distances = commonArc
      ? rows.slice(1).map((r, i) => (r.arc.r - rows[i].arc.r) * scale)
      : centers.slice(1).map((p, i) => Math.abs(-(p.x - centers[i].x) * sin + (p.y - centers[i].y) * cos));
    const visibleLabel = clean(group.label), label = visibleLabel || "REF-" + (bi + 1);
    const base = { label, hideLabel: !visibleLabel, name: clean(group.name) || label,
      level: group.level, x: first.x, y: first.y, rot: angle, rows: rows.length,
      counts: rows.map((r) => r.seats.length).join(","), seatGap: 50,
      rowGap: median(distances) || 90, pad: 0, align: "center",
      num: { ...DEF_NUM, rowScheme: "custom",
        rowCustom: rows.map((r) => clean(group.rowLabels?.[r.rowId]) || r.rowId).join(",") },
    };
    let block = commonArc ? fanB({ ...base, mode: "pitch", r0: rows[0].arc.r * scale,
      aCenter: 0, aStart: -45, aEnd: 45 }) : gr(base);
    const P = prep(block), ov = {}, local = [];
    rows.forEach((row, r) => {
      const generated = rowPts(block, r, P);
      row.seats.forEach((seat, c) => {
        const dx = wx(seat.x) - block.x, dy = wy(seat.y) - block.y;
        const target = { x: dx * cos + dy * sin, y: -dx * sin + dy * cos };
        ov[`${r},${c}`] = { dx: target.x - generated[c].x, dy: target.y - generated[c].y };
        local.push(target);
        mapping.push({ sourceSeatId: seat.id, blockIndex: bi, blockId: block.id, r, c,
          source: { x: seat.x, y: seat.y }, rowId: row.rowId, groupLabel: label, level: group.level });
      });
    });
    const mx = Math.hypot(DEF.seatW, DEF.seatH) / 2 + 2, my = mx;
    const bounds = pointBounds(local);
    const x0 = bounds.x0 - mx, x1 = bounds.x1 + mx;
    const y0 = bounds.y0 - my, y1 = bounds.y1 + my;
    block = reLabel({ ...block, ov, foot: [{ x: x0, y: y0 }, { x: x1, y: y0 },
      { x: x1, y: y1 }, { x: x0, y: y1 }] }, label);
    return block;
  });
  const shapes = analysis.focal ? [{
    id: nid("s"), kind: "rect", type: analysis.focal.type, label: analysis.focal.label,
    x: wx(analysis.focal.bbox.x + analysis.focal.bbox.w / 2),
    y: wy(analysis.focal.bbox.y + analysis.focal.bbox.h / 2),
    w: analysis.focal.bbox.w * scale, h: analysis.focal.bbox.h * scale,
    rot: 0, capacity: 0, fs: 120,
  }] : [];
  const underlayRect = { x: wx(0), y: wy(0), w: scan.width * scale, h: scan.height * scale };
  const plan = { ...active, blocks, shapes, underlayRect };
  const hard = hardFindings(plan);
  if (hard.length) throw new Error("Referans yerleşimi geri alındı; sert bulgu: "
    + hard.map((f) => `${f.id}${f.d ? ` (${f.d})` : ""}`).join(" · "));
  return { plan, compiled: { scale, mapping, medianGap } };
}

export function verifyReferenceLayout(plan, scan, analysis, compiled, { seal = false, sourceHash = null } = {}) {
  const seatsByKey = new Map();
  plan.blocks.forEach((block) => buildSeats(block, buildMeta(block), plan.idTemplate).seats
    .forEach((seat) => seatsByKey.set(seat.key, seat)));
  let matched = 0, close = 0;
  const differences = [];
  const tolerance = Math.max(1, (compiled.medianGap || 50) * compiled.scale * 0.35);
  for (const item of compiled.mapping) {
    const block = plan.blocks[item.blockIndex];
    const seat = seatsByKey.get((block?.id || "") + ":" + item.r + "," + item.c);
    if (!seat) { differences.push({ sourceSeatId: item.sourceSeatId, issue: "missing" }); continue; }
    matched++;
    const target = { x: (item.source.x - scan.width / 2) * compiled.scale,
      y: (item.source.y - scan.height / 2) * compiled.scale };
    const distance = Math.hypot(seat.x - target.x, seat.y - target.y);
    if (distance <= tolerance) close++;
    else differences.push({ sourceSeatId: item.sourceSeatId, issue: "position",
      distance: +distance.toFixed(2) });
    if (block.label !== item.groupLabel || block.level !== item.level) {
      differences.push({ sourceSeatId: item.sourceSeatId, issue: "identity" });
    }
  }
  const planSeats = seatsByKey.size, sourceSeats = compiled.mapping.length;
  const planRows = plan.blocks.reduce((n, b) => n + prep(b).counts.length, 0);
  const extras = Math.max(0, planSeats - matched);
  const hard = hardFindings(plan);
  const positionalMatch = sourceSeats ? close / sourceSeats : 0;
  const focalIoU = analysis.focal
    ? focalIou(analysis.focal.bbox, plan.shapes.find((s) => s.type === analysis.focal.type), scan, compiled.scale)
    : null;
  const inventedObjects = plan.shapes.filter((s) => !analysis.focal || s.type !== analysis.focal.type).length;
  const semanticIdentityOk = !differences.some((d) => d.issue === "identity");
  const sourceSeatById = new Map((scan.rows || []).flatMap((r) => r.seats || [])
    .map((s) => [s.id, s]));
  let identityEvidenceSeats = 0;
  let printedIdentityOk = true;
  for (const item of compiled.mapping) {
    const sourceSeat = sourceSeatById.get(item.sourceSeatId);
    const block = plan.blocks[item.blockIndex];
    const seat = seatsByKey.get((block?.id || "") + ":" + item.r + "," + item.c);
    if (!sourceSeat?.label || Number(sourceSeat.labelConfidence || 0) < 0.97) {
      printedIdentityOk = false;
      continue;
    }
    identityEvidenceSeats++;
    if (!seat || String(seat.num) !== String(sourceSeat.label)) printedIdentityOk = false;
  }
  const identityOk = semanticIdentityOk && printedIdentityOk && identityEvidenceSeats === sourceSeats;
  const verified = sourceSeats > 0 && matched === sourceSeats && planSeats === sourceSeats && extras === 0
    && rowCount(analysis) === planRows && semanticIdentityOk
    && positionalMatch >= 0.99 && (focalIoU == null || focalIoU >= 0.9)
    && hard.length === 0 && inventedObjects === 0;
  const metrics = { verified, sourceSeats, planSeats, matchedSeats: matched, extraSeats: extras,
    sourceRows: rowCount(analysis), planRows, positionalMatch: +positionalMatch.toFixed(4),
    focalIoU, hardFindings: hard.map((f) => f.id), inventedObjects,
    verifiedIdentity: identityOk, identityEvidenceSeats, differences: differences.slice(0, 100),
    unknown: ["Kaynakta işaretlenmeyen kapı ve erişilebilirlik bilgileri bilinmiyor."] };
  return { metrics, plan: verified && seal ? markSourceVerified(plan, {
    kind: "reference", scanId: scan.scanId, sourceHash, geometryVerified: true,
    identityVerified: identityOk, sourceVerified: true,
  }) : plan };
}

export function focalIou(box, shape, scan, scale) {
  if (!shape) return 0;
  const actual = { x: shape.x / scale + scan.width / 2 - shape.w / scale / 2,
    y: shape.y / scale + scan.height / 2 - shape.h / scale / 2,
    w: shape.w / scale, h: shape.h / scale };
  const iw = Math.max(0, Math.min(box.x + box.w, actual.x + actual.w) - Math.max(box.x, actual.x));
  const ih = Math.max(0, Math.min(box.y + box.h, actual.y + actual.h) - Math.max(box.y, actual.y));
  const intersection = iw * ih;
  return +(intersection / (box.w * box.h + actual.w * actual.h - intersection)).toFixed(4);
}

export function referenceDifferenceOverlay(scan, compiled, plan) {
  const seatsByKey = new Map();
  plan.blocks.forEach((block) => buildSeats(block, buildMeta(block), plan.idTemplate).seats
    .forEach((seat) => seatsByKey.set(seat.key, seat)));
  const canvas = createCanvas(scan.width, scan.height), ctx = canvas.getContext("2d");
  ctx.fillStyle = "#fff"; ctx.fillRect(0, 0, scan.width, scan.height);
  ctx.fillStyle = "#16a34a99";
  compiled.mapping.forEach((m) => { ctx.beginPath(); ctx.arc(m.source.x, m.source.y, 3, 0, Math.PI * 2); ctx.fill(); });
  ctx.strokeStyle = "#e11d48";
  compiled.mapping.forEach((m) => {
    const b = plan.blocks[m.blockIndex];
    const s = seatsByKey.get((b?.id || "") + ":" + m.r + "," + m.c);
    if (!s) return;
    ctx.beginPath(); ctx.arc(s.x / compiled.scale + scan.width / 2,
      s.y / compiled.scale + scan.height / 2, 4, 0, Math.PI * 2); ctx.stroke();
  });
  return canvas.toBuffer("image/png");
}
