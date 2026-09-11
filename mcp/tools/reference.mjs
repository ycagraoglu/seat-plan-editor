import crypto from "node:crypto";
import { createCanvas } from "@napi-rs/canvas";
import { fanB, gr } from "../../src/venues/builders.js";
import { DEF, buildMeta, buildSeats, prep, rowPts } from "../../src/core/geometry.js";
import { DEF_NUM, reLabel } from "../../src/core/labels.js";
import { nid } from "../../src/core/ids.js";
import { MUTATION_BLOCKERS } from "../session.mjs";
import { REFERENCE_LIMITS, scanReference } from "../reference-scan.mjs";

const json = (o, image) => ({ content: [
  { type: "text", text: JSON.stringify(o, null, 2) },
  ...(image ? [{ type: "image", data: image.toString("base64"), mimeType: "image/png" }] : []),
] });
const median = (xs) => {
  const a = [...xs].sort((x, y) => x - y);
  return a.length ? (a[(a.length - 1) >> 1] + a[a.length >> 1]) / 2 : 0;
};
const clean = (v) => String(v ?? "").replace(/\p{Cf}/gu, "").trim();
const rowCount = (analysis) => analysis.groups.reduce((n, g) => n + g.rowIds.length, 0);

export function registerReferenceTools(server, session, z) {
  const bbox = z.object({ x: z.number().min(0), y: z.number().min(0),
    w: z.number().positive(), h: z.number().positive() });

  server.registerTool("scan_reference", {
    title: "Referans görselini yerel olarak tara",
    description: "PNG/JPEG/WebP veya PDF içindeki tekrarlanan koltukları ölçer, sıra kimlikleri ve kontrol görseli döndürür. Koltuk sayısını veya koordinatlarını kendin üretme.",
    inputSchema: {
      path: z.string().min(1).describe("Yerel PNG/JPEG/WebP/PDF dosya yolu"),
      page: z.number().int().min(1).max(REFERENCE_LIMITS.maxPdfPage).optional(),
    },
  }, async ({ path, page = 1 }) => {
    session.need();
    if (!session.referenceMode) throw new Error("Önce set_underlay ile kaynak yükle.");
    if (session.referenceSource?.path && session.referenceSource.path !== path) {
      throw new Error("scan_reference yolu set_underlay ile yüklenen kaynakla aynı olmalı.");
    }
    session.notify("Referans taranıyor");
    const result = await scanReference(path, page);
    const scanId = "scan-" + crypto.randomUUID();
    session.referenceScan = { ...result, scanId, path, page };
    session.referenceAnalysis = null;
    session.referenceCompilation = null;
    session.referenceVerified = false;
    session.notify("Tarama tamamlandı: " + result.rows.length + " sıra · " + result.seatCount + " koltuk");
    const rows = result.rows.map(({ rowId, seats, bbox, angle, geometry, arc, medianGap, confidence, needsReview }) =>
      ({ rowId, centers: seats.map((s) => [s.x, s.y]), bbox, angle, geometry,
        ...(arc ? { arc } : {}), medianGap, confidence, needsReview }));
    return json({ scanId, width: result.width, height: result.height,
      seatCount: result.seatCount, rowCount: result.rows.length, rows,
      needsReview: result.needsReview, limits: REFERENCE_LIMITS }, result.overlay);
  });

  server.registerTool("submit_reference_analysis", {
    title: "Tarama satırlarını anlamlı gruplara bağla",
    description: "scan_reference rowId değerlerine yalnız blok/kat/etiket anlamı ekler. Piksel bbox veya koltuk sayısı kabul edilmez.",
    inputSchema: {
      scanId: z.string().optional(),
      venueKind: z.enum(["cinema", "theater", "stadium", "arena", "general"]),
      groups: z.array(z.object({
        rowIds: z.array(z.string()).min(1), level: z.string().min(1),
        label: z.string().optional(), name: z.string().optional(),
        rowLabels: z.record(z.string(), z.string()).optional(),
      })).optional(),
      focal: z.object({ type: z.enum(["screen", "stage", "pitch"]), label: z.string().min(1), bbox }).optional(),
      excludedRows: z.array(z.object({ rowId: z.string(), reason: z.string().min(3) })).optional(),
      reviewedRowIds: z.array(z.string()).optional(),
      sourceSize: z.unknown().optional(), blocks: z.unknown().optional(), observations: z.unknown().optional(),
    },
  }, async (a) => {
    if (!a.scanId || a.blocks || a.sourceSize) {
      throw new Error("Eski elle bbox/koltuk sayısı biçimi reddedildi; önce scan_reference çağır ve scanId/rowIds kullan.");
    }
    const scan = session.referenceScan;
    if (!scan || scan.scanId !== a.scanId) throw new Error("Geçerli tarama bulunamadı; scan_reference çağır.");
    if (a.focal && (a.focal.bbox.x + a.focal.bbox.w > scan.width
      || a.focal.bbox.y + a.focal.bbox.h > scan.height)) {
      throw new Error("Focal bbox kaynak görsel sınırlarının dışında.");
    }
    const groups = a.groups || [], excluded = a.excludedRows || [];
    const all = new Set(scan.rows.map((r) => r.rowId)), used = new Set();
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
    const reviewed = new Set(a.reviewedRowIds || []);
    const unresolved = scan.rows.filter((r) => r.needsReview && !reviewed.has(r.rowId)
      && !excluded.some((x) => x.rowId === r.rowId)).map((r) => r.rowId);
    if (unresolved.length) throw new Error("Düşük güvenli sıralar kullanıcıyla çözülmeli: " + unresolved.join(", "));
    session.referenceAnalysis = structuredClone({ ...a, groups, excludedRows: excluded });
    session.referenceCompilation = null;
    session.referenceVerified = false;
    session.notify("Kaynak anlamlandırıldı: " + groups.length + " grup");
    const accepted = groups.flatMap((g) => g.rowIds);
    const totalSeats = scan.rows.filter((r) => accepted.includes(r.rowId))
      .reduce((n, r) => n + r.seats.length, 0);
    return json({ accepted: true, groups: groups.length, acceptedRows: accepted.length,
      excludedRows: excluded.length, totalSeats, next: "replace_layout" });
  });

  server.registerTool("replace_layout", {
    title: "Taranmış yerleşimi atomik olarak derle",
    description: "Kaydedilmiş scanId/rowId analizini mevcut grid ve koltuk ov düzeltmeleriyle birebir kurar. Başarısız doğrulamada canlı plan değişmez.",
    inputSchema: {},
  }, async () => {
    const scan = session.referenceScan, analysis = session.referenceAnalysis;
    if (!scan) throw new Error("Önce scan_reference çağır.");
    if (!analysis) throw new Error("Önce submit_reference_analysis çağır.");
    const scale = 50 / (median(scan.rows.map((r) => r.medianGap).filter((n) => n > 0)) || 10);
    const wx = (x) => (x - scan.width / 2) * scale;
    const wy = (y) => (y - scan.height / 2) * scale;
    const rowById = new Map(scan.rows.map((r) => [r.rowId, r]));
    const mapping = [];
    const blocks = analysis.groups.map((group, bi) => {
      let rows = group.rowIds.map((id) => rowById.get(id));
      const arcCenters = rows.filter((r) => r.arc).map((r) => r.arc);
      const commonArc = arcCenters.length === rows.length
        && Math.max(...arcCenters.map((a) => a.cx)) - Math.min(...arcCenters.map((a) => a.cx)) <= 4
        && Math.max(...arcCenters.map((a) => a.cy)) - Math.min(...arcCenters.map((a) => a.cy)) <= 4;
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
          ov[r + "," + c] = { dx: target.x - generated[c].x, dy: target.y - generated[c].y };
          local.push(target);
          mapping.push({ sourceSeatId: seat.id, blockIndex: bi, r, c,
            source: { x: seat.x, y: seat.y } });
        });
      });
      const mx = Math.hypot(DEF.seatW, DEF.seatH) / 2 + 2, my = mx;
      const x0 = Math.min(...local.map((p) => p.x)) - mx, x1 = Math.max(...local.map((p) => p.x)) + mx;
      const y0 = Math.min(...local.map((p) => p.y)) - my, y1 = Math.max(...local.map((p) => p.y)) + my;
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
    const summary = session.mutate((plan) => ({ ...plan, blocks, shapes, underlayRect }),
      "Referanstan atomik yerleşim: " + blocks.length + " blok",
      { reference: true, guard: true, requireClean: true });
    session.referenceCompilation = { scale, mapping };
    session.referenceVerified = false;
    return json({ built: true, sourceSeats: mapping.length, planSeats: session.summaryData().seatCount,
      blocks: blocks.length, scale: +scale.toFixed(4), summary });
  });

  server.registerTool("verify_reference", {
    title: "Planı kaynak taramasıyla birebir doğrula",
    description: "Kaynak koltuklarını plan koltuklarıyla birebir eşler; sayı, konum, focal ve sert geometri bulguları geçmeden başarı vermez.",
    inputSchema: {},
  }, async () => {
    const scan = session.referenceScan, compiled = session.referenceCompilation;
    if (!scan || !compiled) throw new Error("Önce replace_layout ile referans yerleşimini derle.");
    const plan = session.need(), seatsByKey = new Map();
    session.notify("Kaynak eşleşmesi doğrulanıyor");
    plan.blocks.forEach((block) => buildSeats(block, buildMeta(block), plan.idTemplate).seats
      .forEach((seat) => seatsByKey.set(seat.key, seat)));
    let matched = 0, close = 0;
    const differences = [];
    for (const item of compiled.mapping) {
      const block = plan.blocks[item.blockIndex];
      const seat = seatsByKey.get((block?.id || "") + ":" + item.r + "," + item.c);
      if (!seat) { differences.push({ sourceSeatId: item.sourceSeatId, issue: "missing" }); continue; }
      matched++;
      const target = { x: (item.source.x - scan.width / 2) * compiled.scale,
        y: (item.source.y - scan.height / 2) * compiled.scale };
      const distance = Math.hypot(seat.x - target.x, seat.y - target.y);
      if (distance <= 17.5) close++;
      else differences.push({ sourceSeatId: item.sourceSeatId, issue: "position",
        distance: +distance.toFixed(2) });
    }
    const planSeats = seatsByKey.size, sourceSeats = compiled.mapping.length;
    const planRows = plan.blocks.reduce((n, b) => n + prep(b).counts.length, 0);
    const extras = Math.max(0, planSeats - matched);
    const hard = session.derive(plan).findings.filter((f) => MUTATION_BLOCKERS.has(f.id) && f.t === "err");
    const positionalMatch = sourceSeats ? close / sourceSeats : 0;
    const focalIoU = session.referenceAnalysis.focal
      ? focalIou(session.referenceAnalysis.focal.bbox,
        plan.shapes.find((s) => s.type === session.referenceAnalysis.focal.type), scan, compiled.scale)
      : null;
    const inventedObjects = plan.shapes.filter((s) => !session.referenceAnalysis.focal
      || s.type !== session.referenceAnalysis.focal.type).length;
    const verified = matched === sourceSeats && planSeats === sourceSeats && extras === 0
      && rowCount(session.referenceAnalysis) === planRows
      && positionalMatch >= 0.99 && (focalIoU == null || focalIoU >= 0.9)
      && hard.length === 0 && inventedObjects === 0;
    session.referenceVerified = verified;
    session.notify(verified ? "Kaynak doğrulaması geçti" : "Kaynak doğrulaması başarısız");
    return json({ verified, sourceSeats, planSeats, matchedSeats: matched, extraSeats: extras,
      sourceRows: rowCount(session.referenceAnalysis), planRows,
      positionalMatch: +positionalMatch.toFixed(4), focalIoU,
      hardFindings: hard.map((f) => f.id), inventedObjects,
      differences: differences.slice(0, 100),
      unknown: ["Kaynakta işaretlenmeyen kapı ve erişilebilirlik bilgileri bilinmiyor."] },
    differenceOverlay(scan, compiled, seatsByKey, plan));
  });
}

function focalIou(box, shape, scan, scale) {
  if (!shape) return 0;
  const actual = { x: shape.x / scale + scan.width / 2 - shape.w / scale / 2,
    y: shape.y / scale + scan.height / 2 - shape.h / scale / 2,
    w: shape.w / scale, h: shape.h / scale };
  const iw = Math.max(0, Math.min(box.x + box.w, actual.x + actual.w) - Math.max(box.x, actual.x));
  const ih = Math.max(0, Math.min(box.y + box.h, actual.y + actual.h) - Math.max(box.y, actual.y));
  const intersection = iw * ih;
  return +(intersection / (box.w * box.h + actual.w * actual.h - intersection)).toFixed(4);
}

function differenceOverlay(scan, compiled, seatsByKey, plan) {
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
