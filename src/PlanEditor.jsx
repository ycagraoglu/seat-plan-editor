import React, { useState, useMemo, useRef, useCallback, useEffect } from "react";

/* ══════════════════════════════════════════════════════════════════════════
   OTURMA PLANI EDİTÖRÜ · v7
   --------------------------------------------------------------------------
   Kapsam: geometri + kimlik. Fiyat, etkinlik, müsaitlik YOK. Birim: cm.

   v7: plan.json içe aktarma · kalibrasyon · tuval tutamakları · doğrulama
   v8'de gelen:
   1. KOLTUK NİTELİKLERİ — tekerlekli sandalye, refakatçi, görüş kısıtlı,
      teknik/satışa kapalı. Blok seviyesinde varsayılan, koltuk seviyesinde
      istisna, "Nitelik boya" aracıyla toplu uygulama.
      Kategoriden bağımsızdır: kategori fiyat etiketi, nitelik koltuğun
      fiziksel gerçeği. Biletleme sistemi ikisini ayrı kullanır.
   2. DİZİ ÖNİZLEME — doğrusal ve radyal dizi, Uygula'dan önce hayalet
      dış hatlarla tuvalde gösteriliyor.
   v9'da gelen:
   1. KAPI–BLOK İLİŞKİSİ — kapı artık etiket değil, blok listesi taşıyan
      bir nesne. Biletin üstüne basılacak kapı bilgisi buradan çıkıyor.
   2. SÜRÜMLEME VE YAYIN — taslak/yayın ayrımı, sürüm geçmişi ve iki sürüm
      arası koltuk farkı. Kritik soru şu: bu değişiklik hangi koltuk
      kimliklerini yok ediyor? Satılmış biletin karşılığı odur.
   ══════════════════════════════════════════════════════════════════════════ */

const RAD = Math.PI / 180;
const DEF = { seatGap: 50, rowGap: 90, seatW: 41, seatH: 38 };
const SEAT_BUDGET = 3500;
/* cm ve derece için 4 ondalık yeter (0.0001° ~ birkaç mikron yay) — trig
   sonuçlarını (bowl/tier'daki aisle→açı çevrimi, radyal dizi) ekranda ve
   dışa aktarımda 15 haneli gürültüye dönüşmeden önce burada temizle. */
const R4 = (n) => Math.round(n * 10000) / 10000;

/* ─────────────────────────  YARDIMCILAR  ───────────────────────── */

function parseCounts(s) {
  const t = String(s || "").trim();
  if (!t) return null;
  const m = t.match(/^(\d+)\s*\.\.\s*(\d+)$/);
  if (m) return { from: +m[1], to: +m[2] };
  const list = t.split(",").map((x) => parseInt(x.trim(), 10)).filter((n) => n > 0);
  return list.length ? list : null;
}
function countAt(spec, r, rows, fb) {
  if (!spec) return fb;
  if (spec.from != null) {
    const t = rows <= 1 ? 0 : r / (rows - 1);
    return Math.max(1, Math.round(spec.from + (spec.to - spec.from) * t));
  }
  return spec[r] ?? spec[spec.length - 1];
}
const offsetFor = (align, maxN, n) =>
  align === "left" ? 0 : align === "right" ? maxN - n : Math.round((maxN - n) / 2);

/* ─────────────────────────  GEOMETRİ ÇEKİRDEĞİ  ───────────────────────── */

function prep(b) {
  if (b.kind === "table") {
    const n = Math.max(1, b.seats || 4);
    return { counts: [n], maxN: n, R0: 0, sgn: 1 };
  }
  if (b.kind === "free") return { counts: [b.pts.length], maxN: b.pts.length, R0: 0, sgn: 1 };
  const spec = parseCounts(b.counts);
  const counts = Array.from({ length: b.rows }, (_, r) => {
    const fb = b.kind === "fan"
      ? (b.mode === "pitch" ? 10
        : Math.round(((b.r0 + r * b.rowGap) * (b.aEnd - b.aStart) * RAD) / b.seatGap))
      : Math.max(1, b.cols + r * (b.taper || 0));
    return Math.max(1, countAt(spec, r, b.rows, fb));
  });
  const maxN = Math.max(...counts);
  let R0 = 0, sgn = 1;
  if (b.kind === "grid" && Math.abs(b.curve) > 1) {
    const W = Math.max(1, (maxN - 1) * b.seatGap);
    const h = Math.abs(b.curve);
    sgn = Math.sign(b.curve);
    R0 = (W * W) / (8 * h) + h / 2;
  }
  return { counts, maxN, R0, sgn };
}

function rowPts(b, r, P) {
  if (b.kind === "table") return tableCells(b)[0];
  if (b.kind === "free") return b.pts.map((p, i) => ({ x: p.x, y: p.y, a: p.rot || 0, ci: i }));
  const n = P.counts[r];
  const off = offsetFor(b.align, P.maxN, n);
  if (b.kind === "fan") {
    const R = b.r0 + r * b.rowGap;
    let angles;
    if (b.mode === "pitch") {
      const step = b.seatGap / R / RAD;
      const start = b.aCenter - (step * (n - 1)) / 2;
      angles = Array.from({ length: n }, (_, c) => start + c * step);
    } else {
      const step = (b.aEnd - b.aStart) / n;
      angles = Array.from({ length: n }, (_, c) => b.aStart + step / 2 + c * step);
    }
    return angles.map((a, c) => ({ x: R * Math.sin(a * RAD), y: -R * Math.cos(a * RAD), a, ci: off + c }));
  }
  if (P.R0 > 0) {
    const R = P.R0 + r * b.rowGap, step = b.seatGap / R;
    return Array.from({ length: n }, (_, c) => {
      const a = (off + c - (P.maxN - 1) / 2) * step;
      return { x: R * Math.sin(a), y: P.sgn * (R * Math.cos(a) - P.R0), a: (-a / RAD) * P.sgn, ci: off + c };
    });
  }
  return Array.from({ length: n }, (_, c) => ({
    x: (off + c - (P.maxN - 1) / 2) * b.seatGap, y: r * b.rowGap, a: 0, ci: off + c,
  }));
}
/** Bir sıranın yalnızca iki ucu — tüm sırayı üretmeden.
 *  Blok tabanının yan kenarları bununla çıkarılıyor; 96 bloklu bir
 *  stadyumda tüm koltukları üretmeden taban geometrisi elde ediliyor. */
function rowEnds(b, r, P) {
  if (b.kind === "table") { const c = tableCells(b)[0]; return [c[0], c[c.length - 1]]; }
  if (b.kind === "free") {
    const a = b.pts[0] || { x: 0, y: 0 }, z = b.pts[b.pts.length - 1] || a;
    return [{ x: a.x, y: a.y }, { x: z.x, y: z.y }];
  }
  const n = P.counts[r], off = offsetFor(b.align, P.maxN, n);
  if (b.kind === "fan") {
    const R = b.r0 + r * b.rowGap;
    let a0, a1;
    if (b.mode === "pitch") {
      const step = b.seatGap / R / RAD;
      a0 = b.aCenter - (step * (n - 1)) / 2; a1 = a0 + step * (n - 1);
    } else {
      const step = (b.aEnd - b.aStart) / n;
      a0 = b.aStart + step / 2; a1 = a0 + step * (n - 1);
    }
    return [a0, a1].map((a) => ({ x: R * Math.sin(a * RAD), y: -R * Math.cos(a * RAD) }));
  }
  if (P.R0 > 0) {
    const R = P.R0 + r * b.rowGap, step = b.seatGap / R;
    return [off, off + n - 1].map((c) => {
      const a = (c - (P.maxN - 1) / 2) * step;
      return { x: R * Math.sin(a), y: P.sgn * (R * Math.cos(a) - P.R0) };
    });
  }
  return [off, off + n - 1].map((c) => ({ x: (c - (P.maxN - 1) / 2) * b.seatGap, y: r * b.rowGap }));
}

/** Masa: koltuklar masanın çevresine dizilir, hepsi masaya döner.
 *  Bar, gala ve kabare düzeninde sıra diye bir şey yok; birim masadır. */
function tableCells(b) {
  const n = Math.max(1, b.seats || 4);
  const clear = (b.clear != null ? b.clear : 12) + DEF.seatH / 2;
  const out = [];
  if ((b.tShape || "round") === "round") {
    const R = (b.tW || 90) / 2 + clear;
    for (let i = 0; i < n; i++) {
      const a = (b.a0 || 0) + (360 * i) / n;
      out.push({ x: R * Math.sin(a * RAD), y: -R * Math.cos(a * RAD), a, ci: i });
    }
    return [out];
  }
  /* Dikdörtgen masa: koltuklar çevre boyunca eşit aralıkla, yüzleri içeri */
  const W = (b.tW || 160) + 2 * clear, H = (b.tH || 90) + 2 * clear;
  const per = 2 * (W + H), step = per / n;
  for (let i = 0; i < n; i++) {
    let d = (step / 2 + i * step + (b.a0 || 0) / 360 * per) % per;
    let x, y, a;
    if (d < W) { x = -W / 2 + d; y = -H / 2; a = 0; }
    else if (d < W + H) { x = W / 2; y = -H / 2 + (d - W); a = 90; }
    else if (d < 2 * W + H) { x = W / 2 - (d - W - H); y = H / 2; a = 180; }
    else { x = -W / 2; y = H / 2 - (d - 2 * W - H); a = 270; }
    out.push({ x, y, a, ci: i });
  }
  return [out];
}

/** Poligonu kendi dış normali boyunca büyütür.
 *  Önce payı ağırlık merkezinden dışa doğru veriyordum; uzun ve sığ
 *  bloklarda bu pay yanlış yöne gidip koltukları dışarıda bırakıyordu. */
function offsetPoly(ring, d) {
  const n = ring.length;
  if (n < 3 || d === 0) return ring;
  const area = (pts) => {
    let a = 0;
    for (let i = 0, j = pts.length - 1; i < pts.length; j = i++)
      a += pts[j].x * pts[i].y - pts[i].x * pts[j].y;
    return a / 2;
  };
  const sign = area(ring) > 0 ? 1 : -1;
  const nrm = (p, q) => {
    const dx = q.x - p.x, dy = q.y - p.y, L = Math.hypot(dx, dy) || 1;
    return { x: (dy / L) * sign, y: (-dx / L) * sign };
  };
  return ring.map((p, i) => {
    const a = nrm(ring[(i - 1 + n) % n], p), b = nrm(p, ring[(i + 1) % n]);
    let vx = a.x + b.x, vy = a.y + b.y;
    const L = Math.hypot(vx, vy) || 1;
    vx /= L; vy /= L;
    /* Sivri köşelerde gönye uzaması — kontrolsüz büyümesin diye sınırlı */
    const miter = Math.min(2.4, 1 / Math.max(0.42, (vx * a.x + vy * a.y)));
    return { x: p.x + vx * d * miter, y: p.y + vy * d * miter };
  });
}

const toWorld = (b, p, cos, sin) => ({ x: b.x + p.x * cos - p.y * sin, y: b.y + p.x * sin + p.y * cos });
const toLocal = (b, p) => {
  const a = -(b.rot || 0) * RAD, dx = p.x - b.x, dy = p.y - b.y;
  return { x: Math.round(dx * Math.cos(a) - dy * Math.sin(a)),
           y: Math.round(dx * Math.sin(a) + dy * Math.cos(a)) };
};
const polarPt = (r, a) => ({ x: r * Math.sin(a * RAD), y: -r * Math.cos(a * RAD) });

/* ─────────────────────────  NUMARALANDIRMA  ───────────────────────── */

const AZ = "ABCDEFGHIJKLMNOPQRSTUVWXYZ";
const AMBIG = new Set(["I", "O", "Q"]);
function letterLabel(i, skipAmbig) {
  const alpha = skipAmbig ? [...AZ].filter((c) => !AMBIG.has(c)) : [...AZ];
  let s = "", n = i;
  do { s = alpha[n % alpha.length] + s; n = Math.floor(n / alpha.length) - 1; } while (n >= 0);
  return s;
}
function rowLabel(num, i, total) {
  const idx = num.rowRev ? total - 1 - i : i;
  if (num.rowScheme === "custom") {
    const list = num.rowCustom.split(",").map((s) => s.trim()).filter(Boolean);
    return list[idx] ?? String(idx + 1);
  }
  if (num.rowScheme === "letter") return letterLabel(idx + (num.rowStart - 1), num.skipAmbig);
  return String(idx + num.rowStart);
}
const parseSkip = (s) =>
  new Set(String(s).split(",").map((x) => parseInt(x.trim(), 10)).filter((n) => !isNaN(n)));

function numberRow(flags, num, maxN) {
  const skip = parseSkip(num.skip);
  const out = {};
  const live = flags.map((f, i) => ({ ...f, i })).filter((f) => !f.rm);
  const step = num.seatScheme === "seq" ? 1 : 2;
  if (num.anchor === "column" && num.seatScheme !== "center") {
    live.forEach((f) => {
      if (f.gap) return;
      const k = num.seatDir === "rtl" ? maxN - 1 - f.ci : f.ci;
      out[f.i] = num.seatStart + step * k;
    });
    return out;
  }
  if (num.seatScheme === "center") {
    const mid = (live.length - 1) / 2;
    let odd = num.seatStart, even = num.seatStart + 1;
    const put = (f, v) => { if (!f.gap) out[f.i] = v; };
    for (let k = Math.ceil(mid); k < live.length; k++) { while (skip.has(odd)) odd += 2; put(live[k], odd); odd += 2; }
    for (let k = Math.floor(mid); k >= 0; k--) { while (skip.has(even)) even += 2; put(live[k], even); even += 2; }
    return out;
  }
  let v = num.seatScheme === "even" ? Math.max(2, num.seatStart) : num.seatStart;
  const order = num.seatDir === "rtl" ? [...live].reverse() : live;
  for (const f of order) {
    while (skip.has(v)) v += step;
    if (!f.gap) out[f.i] = v;
    v += step;
  }
  return out;
}

/* ─────────────────────────  META / KOLTUKLAR  ───────────────────────── */

function buildMeta(b) {
  const P = prep(b);
  const cos = Math.cos(b.rot * RAD), sin = Math.sin(b.rot * RAD);
  const rows = P.counts.length;
  let removed = 0, gaps = 0;
  Object.values(b.ov || {}).forEach((o) => { if (o.rm) removed++; else if (o.gap) gaps++; });
  const seatCount = P.counts.reduce((a, c) => a + c, 0) - removed - gaps;

  /* nitelik sayımı — blok varsayılanı + koltuk istisnaları */
  const attrs = {};
  const withAt = Object.values(b.ov || {}).filter((o) => !o.rm && !o.gap && o.at !== undefined);
  if (b.attr) attrs[b.attr] = Math.max(0, seatCount - withAt.length);
  withAt.forEach((o) => { if (o.at) attrs[o.at] = (attrs[o.at] || 0) + 1; });
  /* Blok tabanı: ön sıranın kavisi, iki yan kenar boyunca her sıranın ucu,
     arka sıranın kavisi. Koltukların dış hattı değil, platformun kendi
     şekli — daralan, genişleyen, oyuklu bloklar böyle okunuyor. */
  const sample = (r) => {
    const pts = rowPts(b, r, P);
    if (pts.length <= 14) return pts;
    const out = [];
    for (let i = 0; i < 14; i++) out.push(pts[Math.round((i * (pts.length - 1)) / 13)]);
    return out;
  };
  const W = (p) => toWorld(b, p, cos, sin);
  const front = sample(0).map(W);
  const back = sample(rows - 1).map(W).reverse();

  /* Yan kenarlar: koltuk sayısı tam sayı olmak zorunda olduğu için sıra
     uçları testere dişi gibi ileri geri sıçrıyor. Platform düz bir zemindir,
     bu sıçramayı taşımamalı — kenar yumuşatılıyor. Gerçek daralma korunur,
     yarım koltukluk gürültü silinir. */
  const le = [], re = [];
  for (let r = 0; r < rows; r++) {
    const [a, z] = rowEnds(b, r, P);
    le.push({ x: a.x, y: a.y }); re.push({ x: z.x, y: z.y });
  }
  const smooth = (arr) => arr.map((p, i, A) => {
    const q = A[Math.max(0, i - 1)], w = A[Math.min(A.length - 1, i + 1)];
    return { x: (q.x + 2 * p.x + w.x) / 4, y: (q.y + 2 * p.y + w.y) / 4 };
  });
  /* Yumuşatma yalnızca testere dişini silmeli. Sapma bir koltuk
     aralığını aşamaz; yoksa gerçek basamakları da yutup (Zorlu'nun
     oyuklu son sırası gibi) koltukları dışarıda bırakıyor. */
  const clamp = (sm, orig) => sm.map((p, i) => {
    const o = orig[i], dx = p.x - o.x, dy = p.y - o.y;
    const d = Math.hypot(dx, dy), lim = b.seatGap * 0.55;
    return d <= lim ? p : { x: o.x + (dx / d) * lim, y: o.y + (dy / d) * lim };
  });
  const ls = clamp(smooth(smooth(smooth(le))), le);
  const rs = clamp(smooth(smooth(smooth(re))), re);
  const rightEdge = [], leftEdge = [];
  for (let r = 1; r < rows - 1; r++) { rightEdge.push(W(rs[r])); leftEdge.push(W(ls[r])); }
  const ring = [...front, ...rightEdge, ...back, ...leftEdge.reverse()];

  /* Pay = kullanıcı payı + koltuğun yarısı + testere dişi genliği.
     Yumuşatma kenarı içeri çekebildiği için sıçrama payı da eklenmeli,
     yoksa koltuklar tabanın dışında kalıyor. */
  const pad = b.pad != null ? b.pad : 55;
  const auto = offsetPoly(ring, pad + Math.max(DEF.seatW, DEF.seatH) / 2 + b.seatGap / 2);

  /* Elle çizilmiş taban varsa o kazanır — sütun, merdiven boşluğu ve
     düzensiz kenarlar koltuklardan türetilemez. */
  if (b.kind === "table" && !(b.foot && b.foot.length >= 3)) {
    const pad2 = (b.pad != null ? b.pad : 18) + Math.hypot(DEF.seatW, DEF.seatH) / 2;
    const R = Math.max(...ring.map((p) => Math.hypot(p.x - b.x, p.y - b.y))) + pad2;
    const ol = Array.from({ length: 28 }, (_, i) => {
      const t = (i / 28) * Math.PI * 2;
      return { x: b.x + R * Math.sin(t), y: b.y + R * Math.cos(t) };
    });
    const xs2 = ol.map((p) => p.x), ys2 = ol.map((p) => p.y);
    return { P, seatCount, attrs, outline: ol, auto: ol, manual: false,
      cx: b.x, cy: b.y, rows,
      bbox: { x0: Math.min(...xs2), x1: Math.max(...xs2), y0: Math.min(...ys2), y1: Math.max(...ys2) } };
  }
  /* Tek sıralı blokta ön ve arka sıra aynı sıradır; dış hat çöküp
     tel gibi bir çizgiye dönüyordu. Kapsül olarak kuruluyor. */
  if (rows === 1 && b.kind !== "table" && !(b.foot && b.foot.length >= 3)) {
    const line = rowPts(b, 0, P);
    const a = line[0], z = line[line.length - 1];
    const hh = DEF.seatH / 2, hw = DEF.seatW / 2;
    const top = line.map((q) => W({ x: q.x, y: q.y - hh }));
    const bot = [...line].reverse().map((q) => W({ x: q.x, y: q.y + hh }));
    const ring1 = [...top, W({ x: z.x + hw, y: z.y }), ...bot, W({ x: a.x - hw, y: a.y })];
    const ol = offsetPoly(ring1, b.pad != null ? b.pad : 55);
    const xs1 = ol.map((p) => p.x), ys1 = ol.map((p) => p.y);
    return { P, seatCount, attrs, outline: ol, auto: ol, manual: false,
      cx: (Math.min(...xs1) + Math.max(...xs1)) / 2,
      cy: (Math.min(...ys1) + Math.max(...ys1)) / 2, rows,
      bbox: { x0: Math.min(...xs1), x1: Math.max(...xs1), y0: Math.min(...ys1), y1: Math.max(...ys1) } };
  }

  const manual = b.foot && b.foot.length >= 3;
  const outline = manual ? b.foot.map(W) : auto;
  const cx = outline.reduce((a, p) => a + p.x, 0) / outline.length;
  const cy = outline.reduce((a, p) => a + p.y, 0) / outline.length;
  const xs = outline.map((p) => p.x), ys = outline.map((p) => p.y);
  return { P, seatCount, attrs, outline, auto, manual, cx, cy, rows,
    bbox: { x0: Math.min(...xs), x1: Math.max(...xs), y0: Math.min(...ys), y1: Math.max(...ys) } };
}

function buildSeats(b, meta, tpl) {
  const P = meta.P;
  const cos = Math.cos(b.rot * RAD), sin = Math.sin(b.rot * RAD);
  const seats = [], labels = [];
  for (let r = 0; r < P.counts.length; r++) {
    const row = rowPts(b, r, P);
    const flags = row.map((p, c) => {
      const o = b.ov[`${r},${c}`] || {};
      return { rm: !!o.rm, gap: !!o.gap, ci: p.ci };
    });
    const nums = numberRow(flags, b.num, P.maxN);
    const rl = rowLabel(b.num, r, P.counts.length);
    row.forEach((p, c) => {
      const f = flags[c];
      if (f.rm) return;
      const o = b.ov[`${r},${c}`] || {};
      const w = toWorld(b, { x: p.x + (o.dx || 0), y: p.y + (o.dy || 0) }, cos, sin);
      const label = o.label != null && o.label !== "" ? o.label : nums[c] ?? "";
      const gen = formatId(tpl, { level: b.level || "", block: b.label, row: rl, seat: label });
      seats.push({ key: `${b.id}:${r},${c}`, id: o.id || gen, gen, adopted: !!o.id,
        block: b.label, level: b.level || "", row: rl, num: label,
        r, c, gap: f.gap, tweak: !!(o.dx || o.dy || o.rot || o.label || o.id),
        at: o.at !== undefined ? o.at : (b.attr || ""),
        x: w.x, y: w.y, rot: p.a + b.rot + (o.rot || 0), color: b.color });
    });
    if (b.kind !== "free" && b.kind !== "table" && row.length && P.counts.length > 1) {
      [[row[0], -1], [row[row.length - 1], 1]].forEach(([p, k], i) => {
        const w = toWorld(b, { x: p.x + k * b.seatGap * 1.15, y: p.y }, cos, sin);
        labels.push({ key: `${b.id}-${r}-${i}`, text: rl, x: w.x, y: w.y });
      });
    }
  }
  return { seats, labels };
}

/* ─────────────────────────  DİZİ DÖNÜŞÜMLERİ  ───────────────────────── */

let uid = 0;
const nid = (p = "b") => `${p}${++uid}`;

/** A→B, Z→AA, AA→AB. Salonlar bloklarını harfle adlandırır;
 *  dizi işlemi "A-2" değil "B" üretmeli. */
function bumpAlpha(s, n) {
  const up = s.toUpperCase();
  let v = 0;
  for (const c of up) v = v * 26 + (c.charCodeAt(0) - 64);
  v += n;
  let out = "";
  while (v > 0) { const r = (v - 1) % 26; out = String.fromCharCode(65 + r) + out; v = Math.floor((v - 1) / 26); }
  return s === up ? out : out.toLowerCase();
}

function incLabel(label, n) {
  const s = String(label ?? "");
  if (/^\d+$/.test(s)) return String(parseInt(s, 10) + n);
  const m = s.match(/^(.*?)(\d+)$/);
  if (m) return m[1] + String(parseInt(m[2], 10) + n);
  if (/^[A-Za-z]{1,3}$/.test(s)) return bumpAlpha(s, n);
  return `${s}-${n + 1}`;
}
const reLabel = (b, l) => {
  const nb = { ...b, label: l, name: b.level ? `${b.level} · ${l}` : l };
  for (const k of ["x", "y", "rot", "aStart", "aEnd", "aCenter"])
    if (typeof nb[k] === "number") nb[k] = R4(nb[k]);
  return nb;
};

/** reLabel'den farkı: bu YENİ blok üretmiyor, VAR OLAN bir bloğun
 *  "Kimlik ön eki" alanı elle değiştirildiğinde çağrılır. name'i sadece
 *  hâlâ otomatik türetilmiş haldeyse (kullanıcı özelleştirmediyse) takip
 *  ettirir — aksi halde elle girilmiş özel adı ezip kaybetmiş oluruz. */
function relabelPatch(b, label) {
  const autoName = b.level ? `${b.level} · ${b.label}` : b.label;
  const patch = { label };
  if (!b.name || b.name === autoName) patch.name = b.level ? `${b.level} · ${label}` : label;
  return patch;
}

function linearArray(blocks, { count, dx, dy }) {
  const out = [], step = blocks.length;
  for (let i = 1; i < count; i++)
    blocks.forEach((b) => out.push(reLabel(
      { ...b, id: nid(), x: b.x + dx * i, y: b.y + dy * i }, incLabel(b.label, step * i))));
  return out;
}
function radialArray(blocks, { count, cx, cy, step }) {
  const out = [], lstep = blocks.length;
  for (let i = 1; i < count; i++) {
    const t = step * i, c = Math.cos(t * RAD), s = Math.sin(t * RAD);
    blocks.forEach((b) => {
      const px = b.x - cx, py = b.y - cy;
      out.push(reLabel({ ...b, id: nid(),
        x: cx + px * c - py * s, y: cy + px * s + py * c, rot: b.rot + t },
        incLabel(b.label, lstep * i)));
    });
  }
  return out;
}

/* ── akıllı hizalama kılavuzları ───────────────────────────────
   Sürüklenen seçimin kutusunun merkezi ve kenarları, diğer blokların
   ve şekillerin merkez/kenarlarıyla eşleştiğinde o eksene yapışır ve
   kırmızı bir referans çizgisi gösterir. Eşik ekranda 7 piksel —
   yakınlaştıkça hassaslaşır, uzaklaştıkça yardımcı olur. */
function alignSetup(ids, metas, metaById, shapes) {
  const sel = ids.map((id) => metaById.get(id)).filter(Boolean);
  if (!sel.length) return null;
  const box = {
    x0: Math.min(...sel.map((m) => m.bbox.x0)), x1: Math.max(...sel.map((m) => m.bbox.x1)),
    y0: Math.min(...sel.map((m) => m.bbox.y0)), y1: Math.max(...sel.map((m) => m.bbox.y1)),
  };
  box.cx = (box.x0 + box.x1) / 2; box.cy = (box.y0 + box.y1) / 2;

  const tg = [];
  metas.forEach(({ b, m }) => { if (!ids.includes(b.id)) tg.push(m.bbox); });
  shapes.forEach((s) => {
    if (s.kind !== "rect" || s.w < 40) return;
    tg.push({ x0: s.x - s.w / 2, x1: s.x + s.w / 2, y0: s.y - s.h / 2, y1: s.y + s.h / 2 });
  });
  const xs = [], ys = [];
  tg.forEach((t) => {
    const cx = (t.x0 + t.x1) / 2, cy = (t.y0 + t.y1) / 2;
    xs.push({ v: cx, t }, { v: t.x0, t }, { v: t.x1, t });
    ys.push({ v: cy, t }, { v: t.y0, t }, { v: t.y1, t });
  });
  return { box, xs, ys };
}

/** Ham kaydırmayı hizaya oturtur; yakalanan eksenler için kılavuz döndürür. */
function alignDelta(d, dx, dy, tol) {
  const out = { dx, dy, g: [] };
  if (!d.box) return out;
  const b = d.box;
  const pick = (cands, list) => {
    let best = null;
    cands.forEach((c) => list.forEach((t) => {
      const diff = Math.abs(c - t.v);
      if (diff <= tol && (!best || diff < best.diff)) best = { diff, shift: t.v - c, v: t.v, t: t.t };
    }));
    return best;
  };
  const bx = pick([b.cx + dx, b.x0 + dx, b.x1 + dx], d.xs);
  if (bx) {
    out.dx = dx + bx.shift;
    out.g.push({ axis: "x", v: bx.v,
      a: Math.min(b.y0 + dy, bx.t.y0) - 120, z: Math.max(b.y1 + dy, bx.t.y1) + 120 });
  }
  const by = pick([b.cy + dy, b.y0 + dy, b.y1 + dy], d.ys);
  if (by) {
    out.dy = dy + by.shift;
    out.g.push({ axis: "y", v: by.v,
      a: Math.min(b.x0 + out.dx, by.t.x0) - 120, z: Math.max(b.x1 + out.dx, by.t.x1) + 120 });
  }
  return out;
}

/* ─────────────────────────  SABİTLER  ───────────────────────── */

/** Dizi önizlemesi — kimlik üretmez, sadece geometri döndürür. */
function arrayPreview(blocks, kind, o) {
  const out = [];
  const cap = Math.max(2, Math.ceil(260 / Math.max(1, blocks.length)));
  const n = Math.min(o.count, cap);
  for (let i = 1; i < n; i++) {
    if (kind === "lin") blocks.forEach((b) => out.push({ ...b, x: b.x + o.dx * i, y: b.y + o.dy * i }));
    else {
      const t = o.step * i, c = Math.cos(t * RAD), s = Math.sin(t * RAD);
      blocks.forEach((b) => {
        const px = b.x - o.cx, py = b.y - o.cy;
        out.push({ ...b, x: o.cx + px * c - py * s, y: o.cy + px * s + py * c, rot: b.rot + t });
      });
    }
  }
  return out;
}

/* ─────────────────────────  ARAÇ SİMGELERİ  ─────────────────────────
   16'lık ızgarada, 1.4 kalınlık, dolgusuz. Hepsi aynı elden çıksın diye
   tek bir çizim diliyle: köşeler keskin, uçlar açık.
   ─────────────────────────────────────────────────────────────────── */

const ICONS = {
  select: [{d:"M7.904 17.563a1.2 1.2 0 0 0 2.228 .308l2.09 -3.093l4.907 4.907a1.067 1.067 0 0 0 1.509 0l1.047 -1.047a1.067 1.067 0 0 0 0 -1.509l-4.907 -4.907l3.113 -2.09a1.2 1.2 0 0 0 -.309 -2.228l-13.582 -3.904l3.904 13.563"}],
  pan: [{d:"M18 9l3 3l-3 3"},{d:"M15 12h6"},{d:"M6 9l-3 3l3 3"},{d:"M3 12h6"},{d:"M9 18l3 3l3 -3"},{d:"M12 15v6"},{d:"M15 6l-3 -3l-3 3"},{d:"M12 3v6"}],
  grid: [{d:"M4 5a1 1 0 0 1 1 -1h4a1 1 0 0 1 1 1v4a1 1 0 0 1 -1 1h-4a1 1 0 0 1 -1 -1l0 -4"},{d:"M14 5a1 1 0 0 1 1 -1h4a1 1 0 0 1 1 1v4a1 1 0 0 1 -1 1h-4a1 1 0 0 1 -1 -1l0 -4"},{d:"M4 15a1 1 0 0 1 1 -1h4a1 1 0 0 1 1 1v4a1 1 0 0 1 -1 1h-4a1 1 0 0 1 -1 -1l0 -4"},{d:"M14 15a1 1 0 0 1 1 -1h4a1 1 0 0 1 1 1v4a1 1 0 0 1 -1 1h-4a1 1 0 0 1 -1 -1l0 -4"}],
  fan: [{d:"M11 12a1 1 0 1 0 2 0a1 1 0 1 0 -2 0"},{d:"M16.924 11.132a5 5 0 1 0 -4.056 5.792"},{d:"M3 12a9 9 0 1 0 9 -9"}],
  row: [{d:"M4 6a2 2 0 0 1 2 -2h12a2 2 0 0 1 2 2v12a2 2 0 0 1 -2 2h-12a2 2 0 0 1 -2 -2l0 -12"},{d:"M4 12l16 0"}],
  seat: [{d:"M5 11a2 2 0 0 1 2 2v2h10v-2a2 2 0 1 1 4 0v4a2 2 0 0 1 -2 2h-14a2 2 0 0 1 -2 -2v-4a2 2 0 0 1 2 -2"},{d:"M5 11v-5a3 3 0 0 1 3 -3h8a3 3 0 0 1 3 3v5"},{d:"M6 19v2"},{d:"M18 19v2"}],
  seatEd: [{d:"M7 7h-1a2 2 0 0 0 -2 2v9a2 2 0 0 0 2 2h9a2 2 0 0 0 2 -2v-1"},{d:"M20.385 6.585a2.1 2.1 0 0 0 -2.97 -2.97l-8.415 8.385v3h3l8.385 -8.415"},{d:"M16 5l3 3"}],
  brush: [{d:"M3 21v-4a4 4 0 1 1 4 4h-4"},{d:"M21 3a16 16 0 0 0 -12.8 10.2"},{d:"M21 3a16 16 0 0 1 -10.2 12.8"},{d:"M10.6 9a9 9 0 0 1 4.4 4.4"}],
  shape: [{d:"M3 5a2 2 0 0 1 2 -2h14a2 2 0 0 1 2 2v14a2 2 0 0 1 -2 2h-14a2 2 0 0 1 -2 -2v-14"}],
  poly: [{d:"M10 5a2 2 0 1 0 4 0a2 2 0 1 0 -4 0"},{d:"M17 8a2 2 0 1 0 4 0a2 2 0 1 0 -4 0"},{d:"M3 11a2 2 0 1 0 4 0a2 2 0 1 0 -4 0"},{d:"M13 19a2 2 0 1 0 4 0a2 2 0 1 0 -4 0"},{d:"M6.5 9.5l3.5 -3"},{d:"M14 5.5l3 1.5"},{d:"M18.5 10l-2.5 7"},{d:"M13.5 17.5l-7 -5"}],
  measure: [{d:"M17 3l4 4l-14 14l-4 -4l14 -14"},{d:"M16 7l-1.5 -1.5"},{d:"M13 10l-1.5 -1.5"},{d:"M10 13l-1.5 -1.5"},{d:"M7 16l-1.5 -1.5"}],
  cal: [{d:"M19.875 12c.621 0 1.125 .512 1.125 1.143v5.714c0 .631 -.504 1.143 -1.125 1.143h-15.875a1 1 0 0 1 -1 -1v-5.857c0 -.631 .504 -1.143 1.125 -1.143h15.75"},{d:"M9 12v2"},{d:"M6 12v3"},{d:"M12 12v3"},{d:"M18 12v3"},{d:"M15 12v2"},{d:"M3 3v4"},{d:"M3 5h18"},{d:"M21 3v4"}],
  image: [{d:"M15 8h.01"},{d:"M3 6a3 3 0 0 1 3 -3h12a3 3 0 0 1 3 3v12a3 3 0 0 1 -3 3h-12a3 3 0 0 1 -3 -3v-12"},{d:"M3 16l5 -5c.928 -.893 2.072 -.893 3 0l5 5"},{d:"M14 14l1 -1c.928 -.893 2.072 -.893 3 0l3 3"}],
  table: [{d:"M11 12a1 1 0 1 0 2 0a1 1 0 1 0 -2 0"},{d:"M3 12a9 9 0 1 0 18 0a9 9 0 1 0 -18 0"}],
  info: [{d:"M9 11a3 3 0 1 0 6 0a3 3 0 0 0 -6 0"},{d:"M17.657 16.657l-4.243 4.243a2 2 0 0 1 -2.827 0l-4.244 -4.243a8 8 0 1 1 11.314 0"}],
  undo: [{d:"M9 13l-4 -4l4 -4"},{d:"M5 9h7a4 4 0 1 1 0 8h-1"}],
  redo: [{d:"M15 13l4 -4l-4 -4"},{d:"M19 9h-7a4 4 0 1 0 0 8h1"}],
};

/* Tabler Icons (MIT) — 24'lük ızgara, 2 kalınlık, yuvarlak uçlar.
   Parça biçimleri: {d} düz yol · {c} daire · {d,s,dx,dy} ölçekli grup */
const IconParts = ({ parts }) => parts.map((x, i) => {
  const t = x.s ? `translate(${x.dx || 0} ${x.dy || 0}) scale(${x.s})` : undefined;
  return x.c
    ? <circle key={i} cx={x.c[0]} cy={x.c[1]} r={x.c[2]} transform={t} />
    : <path key={i} d={x.d} transform={t} />;
});

const Icon = ({ n }) => (
  <svg className="ic" viewBox="0 0 24 24" fill="none" aria-hidden="true">
    <IconParts parts={ICONS[n] || []} />
  </svg>
);

/* ─────────────────────────  MEKÂN İŞARETLERİ  ─────────────────────────
   24'lük ızgarada, dolgusuz, araç rayındaki simgelerle aynı çizgi dili.
   Salon planında yön bulmayı sağlayan öğeler: tuvalet, giriş, acil çıkış,
   merdiven, asansör, büfe, ilk yardım…
   ───────────────────────────────────────────────────────────────────── */

const POI = {
  wc: { label: "Tuvalet", p: [{d:"M10 16v5",s:0.62,dx:-3.4,dy:4.6},{d:"M14 16v5",s:0.62,dx:-3.4,dy:4.6},{d:"M9 9h6l-1 7h-4l-1 -7",s:0.62,dx:-3.4,dy:4.6},{d:"M5 11c1.333 -1.333 2.667 -2 4 -2",s:0.62,dx:-3.4,dy:4.6},{d:"M19 11c-1.333 -1.333 -2.667 -2 -4 -2",s:0.62,dx:-3.4,dy:4.6},{d:"M10 4a2 2 0 1 0 4 0a2 2 0 1 0 -4 0",s:0.62,dx:-3.4,dy:4.6},{d:"M10 16v5",s:0.62,dx:6.5,dy:4.6},{d:"M14 16v5",s:0.62,dx:6.5,dy:4.6},{d:"M8 16h8l-2 -7h-4l-2 7",s:0.62,dx:6.5,dy:4.6},{d:"M5 11c1.667 -1.333 3.333 -2 5 -2",s:0.62,dx:6.5,dy:4.6},{d:"M19 11c-1.667 -1.333 -3.333 -2 -5 -2",s:0.62,dx:6.5,dy:4.6},{d:"M10 4a2 2 0 1 0 4 0a2 2 0 1 0 -4 0",s:0.62,dx:6.5,dy:4.6}] },
  wcMen: { label: "Erkek WC", p: [{d:"M10 16v5"},{d:"M14 16v5"},{d:"M9 9h6l-1 7h-4l-1 -7"},{d:"M5 11c1.333 -1.333 2.667 -2 4 -2"},{d:"M19 11c-1.333 -1.333 -2.667 -2 -4 -2"},{d:"M10 4a2 2 0 1 0 4 0a2 2 0 1 0 -4 0"}] },
  wcWomen: { label: "Kadın WC", p: [{d:"M10 16v5"},{d:"M14 16v5"},{d:"M8 16h8l-2 -7h-4l-2 7"},{d:"M5 11c1.667 -1.333 3.333 -2 5 -2"},{d:"M19 11c-1.667 -1.333 -3.333 -2 -5 -2"},{d:"M10 4a2 2 0 1 0 4 0a2 2 0 1 0 -4 0"}] },
  entrance: { label: "Giriş", p: [{d:"M13 12v.01"},{d:"M3 21h18"},{d:"M5 21v-16a2 2 0 0 1 2 -2h6m4 10.5v7.5"},{d:"M21 7h-7m3 -3l-3 3l3 3"}] },
  exit: { label: "Acil çıkış", p: [{d:"M13 12v.01"},{d:"M3 21h18"},{d:"M5 21v-16a2 2 0 0 1 2 -2h7.5m2.5 10.5v7.5"},{d:"M14 7h7m-3 -3l3 3l-3 3"}] },
  stairs: { label: "Merdiven", p: [{d:"M22 5h-5v5h-5v5h-5v5h-5"}] },
  elevator: { label: "Asansör", p: [{d:"M5 5a1 1 0 0 1 1 -1h12a1 1 0 0 1 1 1v14a1 1 0 0 1 -1 1h-12a1 1 0 0 1 -1 -1l0 -14"},{d:"M10 10l2 -2l2 2"},{d:"M10 14l2 2l2 -2"}] },
  escal: { label: "Yürüyen merdiven", p: [{d:"M19.5 5h-2.672a2 2 0 0 0 -1.414 .586l-8.414 8.414h-2.5a2.5 2.5 0 1 0 0 5h3.672a2 2 0 0 0 1.414 -.586l8.414 -8.414h1.5a2.5 2.5 0 0 0 0 -5"}] },
  food: { label: "Restoran", p: [{d:"M19 3v12h-5c-.023 -3.681 .184 -7.406 5 -12m0 12v6h-1v-3m-10 -14v17m-3 -17v3a3 3 0 1 0 6 0v-3"}] },
  bar: { label: "Bar", p: [{d:"M8 21h8"},{d:"M12 15v6"},{d:"M5 5a7 2 0 1 0 14 0a7 2 0 1 0 -14 0"},{d:"M5 5v.388c0 .432 .126 .853 .362 1.206l5 7.509c.633 .951 1.88 1.183 2.785 .517c.191 -.141 .358 -.316 .491 -.517l5 -7.509c.236 -.353 .362 -.774 .362 -1.206v-.388"}] },
  beer: { label: "Büfe", p: [{d:"M9 21h6a1 1 0 0 0 1 -1v-3.625c0 -1.397 .29 -2.775 .845 -4.025l.31 -.7c.556 -1.25 .845 -2.253 .845 -3.65v-4a1 1 0 0 0 -1 -1h-10a1 1 0 0 0 -1 1v4c0 1.397 .29 2.4 .845 3.65l.31 .7a9.931 9.931 0 0 1 .845 4.025v3.625a1 1 0 0 0 1 1"},{d:"M6 8h12"}] },
  cafe: { label: "Kafe", p: [{d:"M3 14c.83 .642 2.077 1.017 3.5 1c1.423 .017 2.67 -.358 3.5 -1c.83 -.642 2.077 -1.017 3.5 -1c1.423 -.017 2.67 .358 3.5 1"},{d:"M8 3a2.4 2.4 0 0 0 -1 2a2.4 2.4 0 0 0 1 2"},{d:"M12 3a2.4 2.4 0 0 0 -1 2a2.4 2.4 0 0 0 1 2"},{d:"M3 10h14v5a6 6 0 0 1 -6 6h-2a6 6 0 0 1 -6 -6v-5"},{d:"M16.746 16.726a3 3 0 1 0 .252 -5.555"}] },
  shop: { label: "Satış", p: [{d:"M6.331 8h11.339a2 2 0 0 1 1.977 2.304l-1.255 8.152a3 3 0 0 1 -2.966 2.544h-6.852a3 3 0 0 1 -2.965 -2.544l-1.255 -8.152a2 2 0 0 1 1.977 -2.304"},{d:"M9 11v-5a3 3 0 0 1 6 0v5"}] },
  aid: { label: "İlk yardım", p: [{d:"M8 8v-2a2 2 0 0 1 2 -2h4a2 2 0 0 1 2 2v2"},{d:"M4 10a2 2 0 0 1 2 -2h12a2 2 0 0 1 2 2v8a2 2 0 0 1 -2 2h-12a2 2 0 0 1 -2 -2l0 -8"},{d:"M10 14h4"},{d:"M12 12v4"}] },
  access: { label: "Engelli erişimi", p: [{d:"M3 16a5 5 0 1 0 10 0a5 5 0 1 0 -10 0"},{d:"M17 19a2 2 0 1 0 4 0a2 2 0 1 0 -4 0"},{d:"M19 17a3 3 0 0 0 -3 -3h-3.4"},{d:"M3 3h1a2 2 0 0 1 2 2v6"},{d:"M6 8h11"},{d:"M15 8v6"}] },
  info: { label: "Danışma", p: [{d:"M3 12a9 9 0 1 0 18 0a9 9 0 0 0 -18 0"},{d:"M12 9h.01"},{d:"M11 12h1v4h1"}] },
  ticket: { label: "Bilet", p: [{d:"M15 5l0 2"},{d:"M15 11l0 2"},{d:"M15 17l0 2"},{d:"M5 5h14a2 2 0 0 1 2 2v3a2 2 0 0 0 0 4v3a2 2 0 0 1 -2 2h-14a2 2 0 0 1 -2 -2v-3a2 2 0 0 0 0 -4v-3a2 2 0 0 1 2 -2"}] },
  cloak: { label: "Vestiyer", p: [{d:"M14 6a2 2 0 1 0 -4 0c0 1.667 .67 3 2 4h-.008l7.971 4.428a2 2 0 0 1 1.029 1.749v.823a2 2 0 0 1 -2 2h-14a2 2 0 0 1 -2 -2v-.823a2 2 0 0 1 1.029 -1.749l7.971 -4.428"}] },
  warn: { label: "Uyarı", p: [{d:"M12 9v4"},{d:"M10.363 3.591l-8.106 13.534a1.914 1.914 0 0 0 1.636 2.871h16.214a1.914 1.914 0 0 0 1.636 -2.87l-8.106 -13.536a1.914 1.914 0 0 0 -3.274 0"},{d:"M12 16h.01"}] },
  spot: { label: "Işık", p: [{d:"M5 21h9"},{d:"M10 21l-7 -8l8.5 -5.5"},{d:"M13 14c-2.148 -2.148 -2.148 -5.852 0 -8c2.088 -2.088 5.842 -1.972 8 0l-8 8"},{d:"M11.742 7.574l-1.156 -1.156a2 2 0 0 1 2.828 -2.829l1.144 1.144"},{d:"M15.5 12l.208 .274a2.527 2.527 0 0 0 3.556 0c.939 -.933 .98 -2.42 .122 -3.4l-.366 -.369"}] },
  smoke: { label: "Sigara alanı", p: [{d:"M12 10.941c2.333 -3.308 .167 -7.823 -1 -8.941c0 3.395 -2.235 5.299 -3.667 6.706c-1.43 1.408 -2.333 3.294 -2.333 5.588c0 3.704 3.134 6.706 7 6.706c3.866 0 7 -3.002 7 -6.706c0 -1.712 -1.232 -4.403 -2.333 -5.588c-2.084 3.353 -3.257 3.353 -4.667 2.235"}] },
  parking: { label: "Otopark", p: [{d:"M3 5a2 2 0 0 1 2 -2h14a2 2 0 0 1 2 2v14a2 2 0 0 1 -2 2h-14a2 2 0 0 1 -2 -2v-14"},{d:"M10 16v-8h2.667c.736 0 1.333 .895 1.333 2s-.597 2 -1.333 2h-2.667"}] },
};

/* ─────────────────────────  KOLTUK NİTELİKLERİ  ─────────────────────────
   Kategoriden ayrı bir eksen. Kategori = fiyat etiketi (biletleme sistemi
   fiyatı ona bağlar). Nitelik = koltuğun fiziksel gerçeği.
   ───────────────────────────────────────────────────────────────────── */

const ATTRS = {
  wheel: { label: "Tekerlekli sandalye", short: "Tekerlekli", color: "#4EA8DE", glyph: "T", wide: true },
  comp:  { label: "Refakatçi",           short: "Refakatçi",  color: "#5F9142", glyph: "R" },
  obstr: { label: "Görüş kısıtlı",       short: "Görüş kıs.", color: "#E4B13E", glyph: "!" },
  tech:  { label: "Teknik / satışa kapalı", short: "Kapalı",  color: "#8B8F9E", glyph: "×" },
};

/* ══════════════════════════════════════════════════════════════════════════
   DEPOLAMA KATMANI
   Tek arayüz, değiştirilebilir sürücü. Kendi backend'inize bağlarken
   sadece aşağıdaki dört fonksiyonu değiştirin, editörün geri kalanı
   depolamayı bilmez.

     const Store = {
       async list()        { const r = await fetch("/api/plans"); ... }
       async load(key)     { ... }
       async save(key, p)  { ... }
       async remove(key)   { ... }
     }

   Altlık görseli kaydedilmez — base64 görsel plan verisini şişirir ve
   kaynağı zaten mekândan gelen bir dosyadır.
   ══════════════════════════════════════════════════════════════════════════ */

const SKEY = (k) => `plan:${k}`;

/* window.storage yoksa (ör. Vercel/Netlify/S3 gibi düz statik barındırma —
   bkz. README) localStorage gerçek tarayıcıda kalıcılığı sağlıyor; o da
   yoksa (gizli sekme, kota dolu) bellek-içi Map son çare. */
const hasLS = (() => {
  try { const k = "__ls_probe"; localStorage.setItem(k, "1"); localStorage.removeItem(k); return true; }
  catch { return false; }
})();

const Store = {
  driver: (typeof window !== "undefined" && window.storage) ? "kv" : hasLS ? "ls" : "memory",
  mem: new Map(),

  async list() {
    if (this.driver === "kv") {
      try { const r = await window.storage.list("plan:", false);
        return (r?.keys || []).map((k) => String(k).slice(5)).filter(Boolean); }
      catch { return []; }
    }
    if (this.driver === "ls") {
      const out = [];
      for (let i = 0; i < localStorage.length; i++) {
        const k = localStorage.key(i);
        if (k?.startsWith("plan:")) out.push(k.slice(5));
      }
      return out;
    }
    return [...this.mem.keys()];
  },
  async load(k) {
    if (this.driver === "kv") {
      try { const r = await window.storage.get(SKEY(k), false); return r ? JSON.parse(r.value) : null; }
      catch { return null; }
    }
    if (this.driver === "ls") {
      try { const v = localStorage.getItem(SKEY(k)); return v ? JSON.parse(v) : null; } catch { return null; }
    }
    return this.mem.get(k) || null;
  },
  async save(k, p) {
    const body = JSON.stringify({ ...p, underlay: null });
    if (this.driver === "kv") {
      try { await window.storage.set(SKEY(k), body, false); return true; } catch { return false; }
    }
    if (this.driver === "ls") {
      try { localStorage.setItem(SKEY(k), body); return true; } catch { return false; }
    }
    this.mem.set(k, JSON.parse(body));
    return true;
  },
  async remove(k) {
    if (this.driver === "kv") { try { await window.storage.delete(SKEY(k), false); } catch { /* yok */ } }
    else if (this.driver === "ls") { try { localStorage.removeItem(SKEY(k)); } catch { /* yok */ } }
    else this.mem.delete(k);
  },

  /** Küçük kullanıcı tercihleri (tema gibi). Değer verilmezse okur. */
  async pref(k, v) {
    const key = `pref:${k}`;
    if (this.driver === "kv") {
      try {
        if (v === undefined) { const r = await window.storage.get(key, false); return r ? r.value : null; }
        await window.storage.set(key, v, false); return v;
      } catch { return null; }
    }
    if (this.driver === "ls") {
      try {
        if (v === undefined) return localStorage.getItem(key);
        localStorage.setItem(key, v); return v;
      } catch { return null; }
    }
    if (v === undefined) return this.mem.get(key) ?? null;
    this.mem.set(key, v); return v;
  },
};

/** Kaydedilmiş plan yüklenirken kimlik sayacını ileri sarar — çakışma olmasın. */
function absorbIds(p) {
  const scan = (id) => { const m = String(id || "").match(/(\d+)$/); if (m) uid = Math.max(uid, +m[1]); };
  (p.blocks || []).forEach((b) => scan(b.id));
  (p.shapes || []).forEach((s) => scan(s.id));
  return p;
}

/* ══════════════════════════════════════════════════════════════════════════
   KOLTUK KİMLİĞİ
   Kimlik bu ürünün biletleme sistemiyle tek sözleşmesi. İki yol var:
   · Şablondan üret — yeni mekânlar için
   · Mevcut listeden benimse — hâlihazırda bilet satan mekânlar için.
     O sistemdeki kimlik değişemez, biz ona uyarız.
   ══════════════════════════════════════════════════════════════════════════ */

const DEF_TPL = "{block}-{row}-{seat}";

/** "{block}-{row}-{seat:3}" → "A-5-012" */
function formatId(tpl, p) {
  return String(tpl || DEF_TPL).replace(/\{(\w+)(?::(\d+))?\}/g, (_, k, pad) => {
    const v = String(p[k] ?? "");
    return pad ? v.padStart(+pad, "0") : v;
  });
}

const ID_TOKENS = ["{level}", "{block}", "{row}", "{seat}", "{seat:3}", "{row:2}"];

/* ── CSV ── */

function parseCSV(text) {
  const first = (text.split(/\r?\n/)[0] || "");
  const sep = (first.match(/;/g) || []).length > (first.match(/,/g) || []).length ? ";" : ",";
  return text.split(/\r?\n/).filter((l) => l.trim()).map((l) => {
    const out = []; let cur = "", q = false;
    for (let i = 0; i < l.length; i++) {
      const c = l[i];
      if (c === '"') { if (q && l[i + 1] === '"') { cur += '"'; i++; } else q = !q; }
      else if (c === sep && !q) { out.push(cur); cur = ""; }
      else cur += c;
    }
    out.push(cur);
    return out.map((s) => s.trim());
  });
}

const COLS = {
  id:    ["id", "kimlik", "seatid", "koltukid", "barkod", "kod"],
  level: ["kat", "level", "tribun", "kusak", "bolum"],
  block: ["blok", "block", "kisim", "section"],
  row:   ["sira", "row", "satir"],
  seat:  ["koltuk", "seat", "no", "numara", "koltukno", "seatno"],
};
const normHdr = (s) => s.toLocaleLowerCase("tr").replace(/[^a-z0-9çğıöşü]/g, "")
  .replace(/[çğıöşü]/g, (c) => ({ ç: "c", ğ: "g", ı: "i", ö: "o", ş: "s", ü: "u" }[c]));

function mapColumns(header) {
  const h = header.map(normHdr);
  const idx = {};
  Object.entries(COLS).forEach(([k, names]) => {
    let best = -1;
    h.forEach((cell, i) => {
      if (best >= 0) return;
      if (names.includes(cell)) best = i;
    });
    if (best < 0) h.forEach((cell, i) => {
      if (best >= 0) return;
      if (names.some((n) => cell.startsWith(n))) best = i;
    });
    if (best >= 0) idx[k] = best;
  });
  return idx;
}

/** Eşleştirme anahtarı: büyük harf, baştaki sıfırlar atılır, "A BLOK" → "A" */
const normPart = (v) => {
  let s = String(v ?? "").trim().toLocaleUpperCase("tr");
  s = s.replace(/\s*(BLOK|BLOCK|SIRA|ROW)\s*$/u, "").trim();
  return /^\d+$/.test(s) ? String(parseInt(s, 10)) : s;
};
const seatKey = (block, row, seat) => `${normPart(block)}|${normPart(row)}|${normPart(seat)}`;

/* ══════════════════════════════════════════════════════════════════════════
   SAHA KÜTÜPHANESİ
   Ölçüler santimetre ve federasyon nizamnamelerinden. Dış dikdörtgen
   değiştirilebilir (futbol sahaları 100–110 × 64–75 m arası değişir), ama
   iç işaretlemeler sabit metrik ölçüde kalır — gerçekte de öyledir.
   ══════════════════════════════════════════════════════════════════════════ */

const arc = (x1, y1, r, sw, x2, y2) =>
  `M ${x1.toFixed(1)} ${y1.toFixed(1)} A ${r} ${r} 0 0 ${sw} ${x2.toFixed(1)} ${y2.toFixed(1)}`;

const PITCHES = {
  football: {
    label: "Futbol sahası (FIFA)", w: 10500, h: 6800, surf: "#2B5236", surf2: "#316049", line: "#DCE8DD", lw: 12,
    note: "105 × 68 m · nizami",
    marks(w, h) {
      const L = w / 2, W = h / 2, m = [];
      m.push({ t: "line", x1: 0, y1: -W, x2: 0, y2: W });
      m.push({ t: "circle", cx: 0, cy: 0, r: 915 });
      m.push({ t: "dot", cx: 0, cy: 0, r: 18 });
      [-1, 1].forEach((s) => {
        const gx = s * L;
        m.push({ t: "rect", x: s > 0 ? gx - 1650 : gx, y: -2016, w: 1650, h: 4032 });   // ceza sahası
        m.push({ t: "rect", x: s > 0 ? gx - 550 : gx, y: -916, w: 550, h: 1832 });      // kale sahası
        const px = gx - s * 1100;                                                        // penaltı noktası
        m.push({ t: "dot", cx: px, cy: 0, r: 18 });
        const ex = gx - s * 1650, dy = Math.sqrt(915 * 915 - 550 * 550);
        m.push({ t: "path", d: arc(ex, -dy, 915, s > 0 ? 0 : 1, ex, dy) });              // ceza yayı
        [-1, 1].forEach((v) => {                                                         // korner yayları
          m.push({ t: "path", d: arc(gx - s * 100, v * W, 100, s * v > 0 ? 1 : 0, gx, v * W - v * 100) });
        });
        m.push({ t: "rect", x: s > 0 ? gx : gx - 200, y: -366, w: 200, h: 732, o: 0.55 }); // kale
      });
      return m;
    },
  },

  basket: {
    label: "Basketbol sahası (FIBA)", w: 2800, h: 1500, surf: "#8A5A32", surf2: "#8F6239",
    stripes: 21, line: "#F2E8DA", lw: 5, blw: 11, paint: "#1B4E75",
    note: "28 × 15 m · nizami",
    marks(w, h) {
      const L = w / 2, W = h / 2, m = [];
      m.push({ t: "circle", cx: 0, cy: 0, r: 180, fill: this.paint });
      m.push({ t: "line", x1: 0, y1: -W, x2: 0, y2: W, lw: 8 });
      [-1, 1].forEach((s) => {
        const gx = s * L, bx = gx - s * 157.5;                                    // pota merkezi
        m.push({ t: "rect", x: s > 0 ? gx - 580 : gx, y: -245, w: 580, h: 490, fill: this.paint }); // boyalı alan
        [90, 180, 290].forEach((off) => {                                          // ribaunt çizgileri
          const hx = gx - s * off;
          [-1, 1].forEach((v) => m.push({ t: "line", x1: hx, y1: v * 245, x2: hx, y2: v * 245 + v * 16, lw: 4 }));
        });
        m.push({ t: "circle", cx: gx - s * 580, cy: 0, r: 180 });                 // serbest atış çemberi
        const cy3 = W - 90, dx3 = Math.sqrt(675 * 675 - cy3 * cy3);               // üçlük
        const ax = bx - s * dx3;                                                  // yayın başladığı yer
        [-1, 1].forEach((v) => m.push({ t: "line", x1: gx, y1: v * cy3, x2: ax, y2: v * cy3 }));
        m.push({ t: "path", d: arc(ax, -cy3, 675, s > 0 ? 0 : 1, ax, cy3) });
        m.push({ t: "path", d: arc(bx, -125, 125, s > 0 ? 0 : 1, bx, 125) });     // yarım daire
        m.push({ t: "line", x1: gx - s * 120, y1: -90, x2: gx - s * 120, y2: 90, lw: 8 }); // panya
        m.push({ t: "circle", cx: bx, cy: 0, r: 22.5 });                          // çember
      });
      return m;
    },
  },

  volley: {
    label: "Voleybol sahası (FIVB)", w: 1800, h: 900, surf: "#2F5F92", line: "#F4F4F0", lw: 5,
    note: "18 × 9 m · nizami",
    marks(w, h) {
      const L = w / 2, W = h / 2, m = [];
      m.push({ t: "line", x1: 0, y1: -W, x2: 0, y2: W, lw: 8 });
      [-1, 1].forEach((s) => m.push({ t: "line", x1: s * 300, y1: -W, x2: s * 300, y2: W })); // hücum çizgileri
      m.push({ t: "line", x1: 0, y1: -W - 100, x2: 0, y2: W + 100, dash: "40 30", o: 0.8 });  // file
      return m;
    },
  },

  handball: {
    label: "Hentbol sahası (IHF)", w: 4000, h: 2000, surf: "#4A7C7E", line: "#F0F4F4", lw: 5,
    note: "40 × 20 m · nizami",
    marks(w, h) {
      const L = w / 2, W = h / 2, m = [];
      m.push({ t: "line", x1: 0, y1: -W, x2: 0, y2: W });
      [-1, 1].forEach((s) => {
        const gx = s * L;
        [[600, null], [900, "60 40"]].forEach(([R, dash]) => {
          m.push({ t: "line", x1: gx - s * R, y1: -150, x2: gx - s * R, y2: 150, dash });
          [-1, 1].forEach((v) => {
            /* 9 m yayı kale çizgisine varmadan kenar çizgisini keser — orada bitirilir */
            const full = 150 + R;
            const ex = full <= W ? gx : gx - s * Math.sqrt(R * R - (W - 150) * (W - 150));
            const ey = v * Math.min(full, W);
            m.push({ t: "path", dash, d: arc(gx - s * R, v * 150, R, s * v < 0 ? 1 : 0, ex, ey) });
          });
        });
        m.push({ t: "line", x1: gx - s * 700, y1: -50, x2: gx - s * 700, y2: 50 });   // 7 m
        m.push({ t: "line", x1: gx - s * 400, y1: -7.5, x2: gx - s * 400, y2: 7.5 }); // 4 m
        m.push({ t: "rect", x: s > 0 ? gx : gx - 100, y: -150, w: 100, h: 300, o: 0.55 });
      });
      return m;
    },
  },

  tennis: {
    label: "Tenis kortu (ITF)", w: 2377, h: 1097, surf: "#2E6DA4", line: "#F4F4F0", lw: 5,
    note: "23,77 × 10,97 m · çiftler",
    marks(w, h) {
      const L = w / 2, W = h / 2, sW = 411.5, m = [];
      [-1, 1].forEach((v) => m.push({ t: "line", x1: -L, y1: v * sW, x2: L, y2: v * sW })); // tekler
      [-1, 1].forEach((s) => {
        m.push({ t: "line", x1: s * 640, y1: -sW, x2: s * 640, y2: sW });                  // servis
        m.push({ t: "line", x1: s * L, y1: -10, x2: s * L - s * 10, y2: 10 });             // orta işaret
      });
      m.push({ t: "line", x1: -640, y1: 0, x2: 640, y2: 0 });                              // orta servis
      m.push({ t: "line", x1: 0, y1: -W - 91, x2: 0, y2: W + 91, dash: "40 30", lw: 8 });  // file
      return m;
    },
  },

  hockey: {
    label: "Buz hokeyi (IIHF)", w: 6000, h: 3000, surf: "#DCE6EC", line: "#B03A4A", lw: 8, rx: 850,
    note: "60 × 30 m · nizami",
    marks(w, h) {
      const L = w / 2, W = h / 2, m = [];
      m.push({ t: "line", x1: 0, y1: -W, x2: 0, y2: W, lw: 30 });                      // orta kırmızı
      m.push({ t: "circle", cx: 0, cy: 0, r: 450, c: "#2E5F9E" });
      [-1, 1].forEach((s) => {
        m.push({ t: "line", x1: s * 714, y1: -W, x2: s * 714, y2: W, lw: 30, c: "#2E5F9E" }); // mavi
        const gl = s * (L - 400);
        m.push({ t: "line", x1: gl, y1: -W + 260, x2: gl, y2: W - 260, lw: 5 });             // gol çizgisi
        m.push({ t: "path", d: arc(gl, -180, 180, s > 0 ? 0 : 1, gl, 180) });                // kale önü
        m.push({ t: "rect", x: s > 0 ? gl : gl - 110, y: -91.5, w: 110, h: 183, o: 0.5 });
        [-1, 1].forEach((v) => {
          m.push({ t: "circle", cx: s * 2000, cy: v * 700, r: 450 });
          m.push({ t: "dot", cx: s * 2000, cy: v * 700, r: 30 });
          m.push({ t: "dot", cx: s * 864, cy: v * 700, r: 30, c: "#2E5F9E" });
        });
      });
      return m;
    },
  },

  generic: { label: "Düz zemin", w: 3000, h: 2000, surf: "#22452C", line: "#3E6B4A", lw: 8,
    note: "işaretlemesiz", marks: () => [] },
};

/* ─────────────────────────  KAPI EŞLEME  ─────────────────────────
   Kapı, hizmet ettiği blokların kimliklerini taşır. Koltuk çıktısında
   her koltuğa girilecek kapı bu ilişkiden yazılır.
   ─────────────────────────────────────────────────────────────── */

function gateMap(plan) {
  const m = new Map();
  plan.shapes.filter((s) => s.type === "door").forEach((d) => {
    (d.blocks || []).forEach((bid) => {
      if (!m.has(bid)) m.set(bid, []);
      m.get(bid).push(d.label);
    });
  });
  return m;
}

/** Her bloğu en yakın kapıya, ayrıca ona yakın sayılabilecek diğer kapılara atar.
 *  Gerçekte bir blok genelde iki girişten beslenir; tek kapıya bağlamak hem
 *  yanlış hem de uzaktaki kapıları sahipsiz bırakıyordu. */
function autoGates(plan, metas) {
  const doors = plan.shapes.filter((s) => s.type === "door");
  if (!doors.length) return plan.shapes;
  const assign = new Map(doors.map((d) => [d.id, []]));
  metas.forEach(({ b, m }) => {
    const dist = doors.map((d) => ({ d, v: Math.hypot(d.x - m.cx, d.y - m.cy) }))
      .sort((p, q) => p.v - q.v);
    const near = dist[0].v;
    dist.filter((x, i) => i === 0 || x.v <= near * 1.6).slice(0, 3)
      .forEach((x) => assign.get(x.d.id).push(b.id));
  });
  return plan.shapes.map((s) => (s.type === "door" ? { ...s, blocks: assign.get(s.id) || [] } : s));
}

/* ─────────────────────────  SÜRÜM FARKI  ─────────────────────────
   İki plan arasındaki koltuk kimliği farkı. Kaldırılan kimlik = satılmış
   biletin karşılığının yok olması. Yayın öncesi görülmesi gereken tek şey bu.
   ─────────────────────────────────────────────────────────────── */

function planSeatMap(pl) {
  const m = new Map();
  pl.blocks.forEach((b) => {
    const meta = buildMeta(b);
    buildSeats(b, meta, pl.idTemplate).seats.forEach((s) => { if (!s.gap) m.set(s.id, s); });
  });
  return m;
}

function diffPlans(base, next) {
  const A = planSeatMap(base), B = planSeatMap(next);
  const removed = [], added = [], moved = [], changed = [];
  A.forEach((s, id) => {
    const t = B.get(id);
    if (!t) { removed.push(id); return; }
    if (Math.hypot(t.x - s.x, t.y - s.y) > 25) moved.push(id);
    if ((t.at || "") !== (s.at || "")) changed.push(id);
  });
  B.forEach((s, id) => { if (!A.has(id)) added.push(id); });
  return { removed, added, moved, changed, from: A.size, to: B.size };
}

const stripUnderlay = (p) => ({ ...p, underlay: null });
const planFingerprint = (p) =>
  JSON.stringify({ b: p.blocks, s: p.shapes.map(({ id, ...r }) => r), n: p.name });

/* Görünüm paleti. Bunlar sadece bloğu tuvalde ayırt etmek için —
   fiyat, kategori, satış hiçbiri bu uygulamanın konusu değil. */
/* Renkler tint dolgu + doygun kenar + rozet olarak kullanılıyor.
   Bu yüzden doygun seçiliyorlar; düz dolgu olarak kullanılsalardı bağırırlardı. */
const PALETTE = ["#C2415A", "#C1743C", "#B79A32", "#5F9142",
                 "#3E7FBF", "#6E7787", "#7C5BA8", "#3E9092"];
const LEVEL_COLORS = ["#3E7FBF", "#5F9142", "#C1743C", "#7C5BA8", "#3E9092", "#C2415A"];


/** Bir zemin renginin üstünde okunacak yazı rengi — parlaklığa göre.
 *  Temaya bağlamak yanlış olurdu: soluk sarı blok koyu temada da açık
 *  renktir, üstünde beyaz yazı iki temada da okunmaz. */
function onColor(hex) {
  const h = String(hex).replace("#", "");
  const r = parseInt(h.slice(0, 2), 16), g = parseInt(h.slice(2, 4), 16), b = parseInt(h.slice(4, 6), 16);
  return (0.299 * r + 0.587 * g + 0.114 * b) / 255 > 0.6 ? "#17160F" : "#FBFAF7";
}

/* ── rozet kontrastı ──────────────────────────────────────────────
   Blok rengi tint dolgu için doğru ama rozet zemini olarak beyaz yazıyı
   taşıyamıyor. Rozet, 4.5:1 oranını tutturana kadar koyulaştırılıyor.
   Ölçtüm: paletteki sekiz rengin altısı ham haliyle eşiğin altındaydı. */
const _lin = (c) => { c /= 255; return c <= 0.03928 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4); };
const _rl = (h) => {
  const s = h.replace("#", "");
  return 0.2126 * _lin(parseInt(s.slice(0, 2), 16))
       + 0.7152 * _lin(parseInt(s.slice(2, 4), 16))
       + 0.0722 * _lin(parseInt(s.slice(4, 6), 16));
};
const _hex = (n) => Math.max(0, Math.min(255, Math.round(n))).toString(16).padStart(2, "0");
const _badgeCache = new Map();

function badgeColor(hex) {
  if (_badgeCache.has(hex)) return _badgeCache.get(hex);
  const s = String(hex).replace("#", "");
  let r = parseInt(s.slice(0, 2), 16), g = parseInt(s.slice(2, 4), 16), b = parseInt(s.slice(4, 6), 16);
  let out = `#${_hex(r)}${_hex(g)}${_hex(b)}`;
  for (let i = 0; i < 14; i++) {
    if ((1.05) / (_rl(out) + 0.05) >= 4.5) break;
    r *= 0.9; g *= 0.9; b *= 0.9;
    out = `#${_hex(r)}${_hex(g)}${_hex(b)}`;
  }
  _badgeCache.set(hex, out);
  return out;
}

const SHAPES = {
  stage:    { label: "Sahne",       fill: "var(--shapefill)", stroke: "var(--shapeline)" },
  pitch:    { label: "Saha",        fill: "#22452C",          stroke: "#3E6B4A" },
  door:     { label: "Kapı",        fill: "var(--acc)",       stroke: "var(--acc)" },
  wall:     { label: "Duvar",       fill: "none",             stroke: "var(--shapeline)" },
  screen:   { label: "Perde",       fill: "var(--shapefill)", stroke: "var(--acc)" },
  standing: { label: "Ayakta alan", fill: "rgba(90,130,102,.16)", stroke: "#5B8266" },
  note:     { label: "Not",         fill: "none",             stroke: "var(--mut)" },
};
const DEF_NUM = {
  rowScheme: "number", rowStart: 1, rowRev: false, rowCustom: "", skipAmbig: true,
  seatScheme: "seq", seatDir: "ltr", seatStart: 1, skip: "", anchor: "order",
};

const newGrid = (x, y, cols, rows) => ({
  id: nid(), label: "A", name: "", level: "", kind: "grid", x, y, rot: 0,
  cols, rows, counts: "", align: "center", seatGap: DEF.seatGap, rowGap: DEF.rowGap,
  curve: 0, taper: 0, color: "#3E7FBF", attr: "", num: { ...DEF_NUM, rowScheme: "letter" }, ov: {},
});
const newFan = (x, y, r0) => ({
  id: nid(), label: "A", name: "", level: "", kind: "fan", x, y, rot: 0, mode: "span",
  r0, rowGap: DEF.rowGap, aStart: -40, aEnd: 40, aCenter: 0, rows: 8,
  seatGap: DEF.seatGap, counts: "", align: "center", color: "#3E7FBF", attr: "",
  num: { ...DEF_NUM }, ov: {},
});
const newTable = (x, y) => ({
  id: nid(), label: "M1", name: "", level: "", kind: "table", x, y, rot: 0,
  tShape: "round", tW: 90, tH: 90, seats: 4, a0: 0, clear: 12, pad: 40,
  seatGap: DEF.seatGap, rowGap: DEF.rowGap, counts: "", align: "center",
  cols: 1, rows: 1, curve: 0, taper: 0, color: "", attr: "",
  num: { ...DEF_NUM, rowScheme: "custom", rowCustom: "1" }, ov: {},
});
const newFree = (x, y) => ({
  id: nid(), label: "S", name: "", level: "", kind: "free", x, y, rot: 0, pts: [],
  seatGap: DEF.seatGap, counts: "", align: "center", color: "#3E7FBF", attr: "",
  num: { ...DEF_NUM, rowScheme: "custom", rowCustom: "1" }, ov: {},
});

/* ══════════════  SALON 1 · CSO ADA ANKARA  ══════════════ */

const fanB = (o) => ({
  id: nid(), kind: "fan", name: "", level: "Ana Salon", rot: 0, mode: "pitch",
  seatGap: 50, rowGap: 105, aStart: -40, aEnd: 40, aCenter: 0, counts: "",
  align: "center", color: "#3E7FBF", num: { ...DEF_NUM }, ov: {}, ...o,
});
const wallPts = Array.from({ length: 44 }, (_, i) => {
  const t = (i / 44) * Math.PI * 2;
  return { x: Math.round(3170 * Math.sin(t)), y: Math.round(4030 * Math.cos(t)) };
});
const csoBlocks = [
  fanB({ label: "A", x: 0, y: 6020, r0: 6545, rows: 12, rowGap: 105, aCenter: 0, counts: "39..48", color: "#3E7FBF" }),
  fanB({ label: "B", x: 0, y: 6020, r0: 8176, rows: 7, rowGap: 107, aCenter: 0, counts: "58..52", color: "#C1743C" }),
  fanB({ label: "C", x: 0, y: 6020, r0: 9016, rows: 9, rowGap: 105, aCenter: 0, counts: "34..26", color: "#3E9092" }),
  /* Sahne arkası koro balkonu — tamamı görüş kısıtlı */
  fanB({ label: "D", x: 0, y: -5180, r0: 6384, rows: 7, rowGap: 105, aCenter: 180, counts: "38..44", color: "#3E9092", attr: "obstr" }),
  fanB({ label: "J", x: 0, y: -980, r0: 2460, rows: 8, rowGap: 105, aCenter: -39, counts: "9..12", color: "#C1743C" }),
  fanB({ label: "G", x: 0, y: -980, r0: 1900, rows: 6, rowGap: 105, aCenter: -72, counts: "10..12", color: "#C1743C" }),
  /* Yan kanat son sırası — tekerlekli sandalye alanı + refakatçi */
  fanB({ label: "E", x: 0, y: -980, r0: 1300, rows: 13, rowGap: 105, aCenter: -112, counts: "8..12", color: "#3E9092",
  }),
  fanB({ label: "K", x: 0, y: -980, r0: 2460, rows: 8, rowGap: 105, aCenter: 39, counts: "9..12", color: "#C1743C" }),
  fanB({ label: "H", x: 0, y: -980, r0: 1900, rows: 6, rowGap: 105, aCenter: 72, counts: "10..12", color: "#C1743C" }),
  fanB({ label: "F", x: 0, y: -980, r0: 1300, rows: 13, rowGap: 105, aCenter: 112, counts: "8..12", color: "#3E9092",
  }),
];
const csoBlocksA = withAccessible(csoBlocks, ["E", "F"], 9);
const csoIds = (...labels) => csoBlocksA.filter((b) => labels.includes(b.label)).map((b) => b.id);

/* Plandaki lejant: KAPI 1-2 A · 3 D-F-H · 4-5 B · 6 D-E-G · 7 C-K · 8 C-J */
const CSO_DOORS = [
  [1, 1435, -1680, ["A"]], [2, -1365, -1645, ["A"]],
  [3, 2440, -945, ["D", "F", "H"]], [4, 1344, -2674, ["B"]],
  [5, -1295, -2646, ["B"]], [6, -2400, -980, ["D", "E", "G"]],
  [7, 980, -3400, ["C", "K"]], [8, -966, -3400, ["C", "J"]],
];

const CSO = {
  key: "cso", name: "CSO Ada Ankara · Ziraat Bankası Ana Salon", unit: "cm",
  home: { x: -2900, y: -4600, w: 5800, h: 7700 }, underlay: null,
  shapes: [
    { id: nid("s"), kind: "poly", type: "wall", x: 0, y: -700, rot: 0, pts: wallPts, label: "", capacity: 0, fs: 60, blocks: [] },
    { id: nid("s"), kind: "rect", type: "stage", x: 0, y: 250, w: 2150, h: 1200, rot: 0, label: "SAHNE", capacity: 0, fs: 240, blocks: [] },
    ...CSO_DOORS.map(([n, x, y, bl]) => ({
      id: nid("s"), kind: "rect", type: "door", x, y, w: 300, h: 300, rot: 0,
      label: `KAPI ${n}`, capacity: 0, fs: 95, blocks: csoIds(...bl),
    })),
  ],
  blocks: csoBlocksA,
};
CSO.shapes = [...CSO.shapes,
  ...[["wc", -2280, -1900, "WC"], ["wc", 2280, -1900, "WC"],
      ["bar", -2180, 380, "Fuaye Bar"], ["bar", 2180, 380, "Fuaye Bar"],
      ["cloak", -1750, 2450, "Vestiyer"], ["aid", 1750, 2450, "İlk yardım"],
      ["access", 0, 3050, "Engelli erişimi"]]
    .map(([icon, x, y, label]) => ({ id: nid("s"), kind: "icon", type: "icon", icon,
      x, y, rot: 0, size: 34, w: 200, h: 200, label, capacity: 0, fs: 100, blocks: [] }))];

/* ══════════════  SALON 2 · ZORLU PSM  ══════════════ */

const gr = (o) => ({
  id: nid(), kind: "grid", name: "", rot: 0, cols: 10, taper: 0, curve: 0,
  seatGap: 50, rowGap: 90, counts: "", align: "center", color: "#3E7FBF",
  num: { ...DEF_NUM }, ov: {}, ...o,
});
const nOrta = (rows) => ({ ...DEF_NUM, rowScheme: "custom", rowCustom: rows, seatScheme: "seq", seatDir: "rtl", seatStart: 1, anchor: "order" });
const nCift = (rows) => ({ ...DEF_NUM, rowScheme: "custom", rowCustom: rows, seatScheme: "even", seatDir: "rtl", seatStart: 102, anchor: "column" });
const nTek  = (rows) => ({ ...DEF_NUM, rowScheme: "custom", rowCustom: rows, seatScheme: "odd", seatDir: "ltr", seatStart: 101, anchor: "column" });
const ORK_MID = "CC,DD,EE,FF,GG,HH,A,B,C,D,E,F,G,H,I";
const ORK_BACK = "J,K,L,M,N,O,P,Q,R,S,T,U,V,W";
const ORK_SIDE = "J,K,L,M,N,O,P,Q,R,S,T,U,V,W,X,Y,Z";
const B1R = "A,B,C,D,E,F,G,H,I,J,K,L,M", B2R = "A,B,C,D,E,F,G,H,I";

const ZORLU = {
  key: "zorlu", name: "Zorlu PSM · Turkcell Sahnesi", unit: "cm",
  home: { x: -2950, y: -1500, w: 5900, h: 9200 }, underlay: null,
  shapes: [
    { id: nid("s"), kind: "rect", type: "stage", x: 0, y: -700, w: 2800, h: 900, rot: 0, label: "SAHNE", capacity: 0, fs: 220 },
    { id: nid("s"), kind: "rect", type: "note", x: -2130, y: 1700, w: 10, h: 10, rot: 0, label: "ORKESTRA", capacity: 0, fs: 108 },
    { id: nid("s"), kind: "rect", type: "note", x: -2130, y: 4780, w: 10, h: 10, rot: 0, label: "1. BALKON", capacity: 0, fs: 108 },
    { id: nid("s"), kind: "rect", type: "note", x: -2130, y: 6600, w: 10, h: 10, rot: 0, label: "2. BALKON", capacity: 0, fs: 108 },
    ...[[1, -1900, 1400], [2, 1900, 1400], [3, -1900, 4900], [4, 1900, 4900],
        [5, -1750, 6900], [6, 1750, 6900]].map(([n, x, y]) => ({
      id: nid("s"), kind: "rect", type: "door", x, y, w: 260, h: 260, rot: 0,
      label: `KAPI ${n}`, capacity: 0, fs: 90, blocks: [],
    })),
  ],
  blocks: [
    gr({ label: "ORK-O", name: "Orkestra Orta (ön)", level: "Orkestra", x: 0, y: 200, rows: 2, counts: "18..20", color: "#3E7FBF", num: nOrta("AA,BB") }),
    gr({ label: "ORK-O", name: "Orkestra Orta", level: "Orkestra", x: 0, y: 560, rows: 15, counts: "21..15", color: "#3E7FBF", num: nOrta(ORK_MID),
         ov: { "14,6": { rm: true }, "14,7": { rm: true }, "14,8": { rm: true } } }),
    gr({ label: "ORK-O", name: "Orkestra Orta (arka)", level: "Orkestra", x: 0, y: 2140, rows: 14, counts: "19..28", color: "#C1743C", num: nOrta(ORK_BACK),
    }),
    gr({ label: "ORK-C", name: "Orkestra Çift (ön)", level: "Orkestra", x: -1000, y: 290, rows: 2, counts: "5,5", color: "#3E7FBF", num: nCift("BB,CC") }),
    gr({ label: "ORK-C", name: "Orkestra Çift", level: "Orkestra", x: -1000, y: 650, rows: 3, counts: "5..6", color: "#3E7FBF", num: nCift("DD,EE,FF") }),
    gr({ label: "ORK-C", name: "Orkestra Çift (yan)", level: "Orkestra", x: -880, y: 1040, rows: 7, counts: "4..3", color: "#3E7FBF", num: nCift("A,B,C,D,E,F,G") }),
    gr({ label: "ORK-C", name: "Orkestra Çift (arka)", level: "Orkestra", x: -1300, y: 2140, rows: 17, counts: "17..11", color: "#C1743C", align: "left", num: nCift(ORK_SIDE) }),
    gr({ label: "ORK-T", name: "Orkestra Tek (ön)", level: "Orkestra", x: 1000, y: 290, rows: 2, counts: "5,5", color: "#3E7FBF", num: nTek("BB,CC") }),
    gr({ label: "ORK-T", name: "Orkestra Tek", level: "Orkestra", x: 1000, y: 650, rows: 3, counts: "5..6", color: "#3E7FBF", num: nTek("DD,EE,FF") }),
    gr({ label: "ORK-T", name: "Orkestra Tek (yan)", level: "Orkestra", x: 880, y: 1040, rows: 7, counts: "4..3", color: "#3E7FBF", num: nTek("A,B,C,D,E,F,G") }),
    gr({ label: "ORK-T", name: "Orkestra Tek (arka)", level: "Orkestra", x: 1300, y: 2140, rows: 17, counts: "17..11", color: "#C1743C", align: "right", num: nTek(ORK_SIDE) }),
    gr({ label: "B1-O", name: "1. Balkon Orta", level: "1. Balkon", x: 0, y: 4200, rows: 13,
         counts: "20,21,21,22,22,22,23,23,23,23,23,23,8", color: "#C1743C", num: nOrta(B1R),
         ov: { "12,2": { gap: true }, "12,3": { gap: true }, "12,4": { gap: true }, "12,5": { gap: true } } }),
    gr({ label: "B1-C", name: "1. Balkon Çift", level: "1. Balkon", x: -1200, y: 4200, rows: 12, counts: "19..5", color: "#3E9092", num: nCift(B1R) }),
    gr({ label: "B1-T", name: "1. Balkon Tek", level: "1. Balkon", x: 1200, y: 4200, rows: 12, counts: "19..5", color: "#3E9092", num: nTek(B1R) }),
    gr({ label: "B2-O", name: "2. Balkon Orta", level: "2. Balkon", x: 0, y: 6200, rows: 7, counts: "21..23", color: "#3E9092", num: nOrta("A,B,C,D,E,F,G") }),
    gr({ label: "B2-C", name: "2. Balkon Çift", level: "2. Balkon", x: -1150, y: 6200, rows: 9, counts: "17..5", color: "#5F9142", num: nCift(B2R) }),
    gr({ label: "B2-T", name: "2. Balkon Tek", level: "2. Balkon", x: 1150, y: 6200, rows: 9, counts: "17..5", color: "#5F9142", num: nTek(B2R) }),
  ],
};

/* ══════════════  SALON 3 · GALATASARAY STADYUMU  ══════════════ */

/* Koridor payları santimetre cinsinden veriliyor, açı cinsinden değil.
   Yarıçap büyüdükçe aynı açı metrelerce boşluk demek; oysa insanın
   geçmesi için gereken şey sabit bir genişlik. */
function bowl({ W, H, Rc, rows, rowGap, seatGap, nLong, nShort, nCorner,
                first, level, colors, aisle = 240, pad = 80 }) {
  const along = W - Rc, aside = H - Rc;
  const seg = (2 * along) / nLong, segS = (2 * aside) / nShort;
  const cStep = 90 / nCorner;
  const cAisle = (aisle / Rc) / RAD;              // koridorun açı karşılığı
  const base = { rot: 0, counts: "", align: "center", curve: 0, taper: 0,
    seatGap, rowGap, ov: {}, num: { ...DEF_NUM }, level, pad };
  const L = (k) => String(first + k);
  const seed = (o, l) => reLabel({ id: nid(), ...base, ...o }, l);
  /* Düz kenarda blok genişliği: dilim eksi koridor */
  const colsFor = (s) => Math.max(3, Math.floor((s - aisle) / seatGap));

  const c1 = seed({ kind: "fan", mode: "span", x: -along, y: aside, r0: Rc, rows,
    aStart: -90 - cStep + cAisle / 2, aEnd: -90 - cAisle / 2, color: colors.corner }, L(0));
  const g1 = [c1, ...radialArray([c1], { count: nCorner, cx: -along, cy: aside, step: -cStep })];

  const s1 = seed({ kind: "grid", x: -along + seg / 2, y: H, rows,
    cols: colsFor(seg), color: colors.long }, L(nCorner));
  const g2 = [s1, ...linearArray([s1], { count: nLong, dx: seg, dy: 0 })];

  const c2 = seed({ kind: "fan", mode: "span", x: along, y: aside, r0: Rc, rows,
    aStart: 180 - cStep + cAisle / 2, aEnd: 180 - cAisle / 2, color: colors.corner }, L(nCorner + nLong));
  const g3 = [c2, ...radialArray([c2], { count: nCorner, cx: along, cy: aside, step: -cStep })];

  const s2 = seed({ kind: "grid", x: W, y: aside - segS / 2, rot: -90, rows,
    cols: colsFor(segS), color: colors.short }, L(2 * nCorner + nLong));
  const g4 = [s2, ...linearArray([s2], { count: nShort, dx: 0, dy: -segS })];

  const half = [...g1, ...g2, ...g3, ...g4];
  return [...half, ...radialArray(half, { count: 2, cx: 0, cy: 0, step: 180 })];
}

/** Gerçek stadyumda vomitorium tribünün İÇİNE oyulur: o dikdörtgende koltuk
 *  YOKTUR, merdiven konkorstan oraya çıkar — sıralar tünelin iki yanından
 *  devam eder (bkz. kullanıcının Türk Telekom Stadyumu fotoğrafı). Kapıyı
 *  bloklar arasındaki koridora koymak bu yüzden yanlıştı: kapı, koltuk
 *  dizilimini fiilen bozan mimari bir boşluk olmalı.
 *
 *  Bu fonksiyon her bloğun ARKA sıralarından (sahadan uzak, konkorsun
 *  olduğu taraf) ortada bir dikdörtgen koltuk kümesini `ov.rm` ile siler ve
 *  tam o boşluğa, tünel yönüne hizalanmış kapı şeklini üretir.
 *
 *  Ölçüler bilerek boşluktan bir koltuk/sıra dar tutuluyor: kapı
 *  dikdörtgeninin kenarı ile kalan en yakın koltuğun merkezi arasında tam
 *  bir seatGap/rowGap kalıyor, yani kapı hiçbir koltuğa değmiyor. */
function cutVomitories(blocks, { depth = 3, width = 6 } = {}) {
  const doors = [];
  const cut = blocks.map((b) => {
    const P = prep(b);
    const nRows = P.counts.length;
    if (nRows < depth + 2) return b;            // sığ blokta tünel açılmaz
    const cos = Math.cos(b.rot * RAD), sin = Math.sin(b.rot * RAD);
    const ov = { ...(b.ov || {}) };
    const centers = [];
    /* Dar sıralarda kesim istenenden az koltuk olabiliyor; kapı boyutu
       İSTENEN değil GERÇEKLEŞEN en dar kesime göre hesaplanmalı, yoksa
       dikdörtgen kesilmemiş koltukların üstüne taşıyor. */
    let minCut = Infinity;
    for (let r = nRows - depth; r < nRows; r++) {
      const n = P.counts[r];
      const w = Math.min(width, n - 2);         // iki yanda en az birer koltuk kalsın
      if (w < 2) continue;
      minCut = Math.min(minCut, w);
      const c0 = Math.round((n - w) / 2);
      const pts = rowPts(b, r, P);
      const world = [];
      for (let c = c0; c < c0 + w; c++) {
        ov[`${r},${c}`] = { ...(ov[`${r},${c}`] || {}), rm: true };
        world.push(toWorld(b, pts[c], cos, sin));
      }
      centers.push({ x: world.reduce((a, p) => a + p.x, 0) / world.length,
                     y: world.reduce((a, p) => a + p.y, 0) / world.length });
    }
    if (centers.length < 2) return b;
    const inner = centers[0], outer = centers[centers.length - 1];
    doors.push({ id: nid("s"), kind: "rect", type: "door",
      x: Math.round((inner.x + outer.x) / 2), y: Math.round((inner.y + outer.y) / 2),
      w: Math.round((centers.length - 1) * b.rowGap), h: Math.round((minCut - 1) * b.seatGap),
      rot: Math.round((Math.atan2(outer.y - inner.y, outer.x - inner.x) * 180) / Math.PI),
      capacity: 0, fs: 120, blocks: [] });
    return { ...b, ov };
  });
  return [cut, doors];
}
const labelGates = (gates) => gates.map((d, i) => ({ ...d, label: `KAPI ${i + 1}` }));

/* Gerçek Türk Telekom Stadyumu'nda her tribün bloğunun kendi merdiven/tünel
   çıkışı (vomitorium) var ve bu tüneller tribünün İÇİNE oyulmuş: o
   dikdörtgende koltuk yok, sıralar tünelin iki yanından devam ediyor
   (bkz. kullanıcının paylaştığı saha fotoğrafı). Kapı bu yüzden bloklar
   arası koridora konan bir işaret değil, cutVomitories() ile her bloğun
   arka sıralarından koltuk silen mimari bir boşluk. Bloklar arası koridor
   (aisle) yine gerçek merdivendir ama kapıyı barındırmadığı için orijinal
   genişliğinde bırakıldı. Kapının hangi bloğu beslediği autoGates ile
   mesafeye göre çözülüyor. */
const [gsAlt, gsAltDoors] = cutVomitories(bowl({ W: 6600, H: 4600, Rc: 2200, rows: 21, rowGap: 85, seatGap: 50, nLong: 6, nShort: 4, nCorner: 3,
  first: 100, level: "Alt Tribün", aisle: 240, pad: 80,
  colors: { long: "#3E7FBF", short: "#3E9092", corner: "#7C5BA8" } }));
const [gsOrta, gsOrtaDoors] = cutVomitories(bowl({ W: 9200, H: 7200, Rc: 4800, rows: 13, rowGap: 85, seatGap: 50, nLong: 6, nShort: 4, nCorner: 3,
  first: 200, level: "Orta Tribün", aisle: 260, pad: 80,
  colors: { long: "#C1743C", short: "#6E7787", corner: "#5F9142" } }));
const [gsUst, gsUstDoors] = cutVomitories(bowl({ W: 10950, H: 8950, Rc: 6550, rows: 17, rowGap: 85, seatGap: 50, nLong: 6, nShort: 4, nCorner: 3,
  first: 400, level: "Üst Tribün", aisle: 280, pad: 80,
  colors: { long: "#5F9142", short: "#B79A32", corner: "#6E7787" } })
  .map((b) => (["402","404","406","408","410","412","414","416","418","420","422","424","426","428","430",
    "401","403","405","407","409","411","413","415","417","419","421","423","425","427","429"].includes(b.label)
    ? withAccessible([b], [b.label], 9)[0] : b)));

const GS = {
  key: "gs", name: "Galatasaray · Türk Telekom Stadyumu", unit: "cm",
  home: { x: -14000, y: -12000, w: 28000, h: 24000 }, underlay: null,
  shapes: [
    { id: nid("s"), kind: "rect", type: "pitch", sport: "football", x: 0, y: 0, w: 10500, h: 6800, rot: 0, label: "Futbol sahası", capacity: 0, fs: 300, blocks: [] },
    { id: nid("s"), kind: "rect", type: "note", x: 0, y: -11400, w: 10, h: 10, rot: 0, label: "DOĞU / EAST", capacity: 0, fs: 600 },
    { id: nid("s"), kind: "rect", type: "note", x: 0, y: 11600, w: 10, h: 10, rot: 0, label: "BATI / WEST", capacity: 0, fs: 600 },
    { id: nid("s"), kind: "rect", type: "note", x: -13100, y: 0, w: 10, h: 10, rot: 90, label: "KUZEY / NORTH", capacity: 0, fs: 600 },
    { id: nid("s"), kind: "rect", type: "note", x: 13100, y: 0, w: 10, h: 10, rot: -90, label: "GÜNEY / SOUTH", capacity: 0, fs: 600 },
    ...labelGates([...gsAltDoors, ...gsOrtaDoors, ...gsUstDoors]),
  ],
  blocks: [...gsAlt, ...gsOrta, ...gsUst],
};
GS.shapes = autoGates(GS, GS.blocks.map((b) => ({ b, m: buildMeta(b) })));

/* ══════  SALON 4 · ÜLKER SPOR VE ETKİNLİK SALONU (Fenerbahçe Beko)  ══════
   Gerçek mekân. Ataşehir/İstanbul, 2012 açılışlı, Ömerler Mimarlık.
   Doğrulanan veriler:
     · basketbol kapasitesi 13.500 (konserde 15.000)
     · iki kademeli kase — üst kademede 360° LED bant
     · iki kademe arasında 44 loca
     · alt kademe blokları 1xx numaralı; 118 ve 119 "pota arkası" bloklar
   FIBA sahası 28 × 15 m.

   Kase ölçüsü sahaya göre kuruldu: kenar çizgisine ~6,5 m, dip çizgisine
   ~8,5 m. Bu pay skorer masası, yedek kulübeleri, basın ve yürüme yolu
   içindir — önceki sahte "Örnek Arena"da bu 24-26 m'ye kadar açılmış,
   saha kocaman bir boşluğun ortasında kalmıştı.

   Loca katı 44 bloktan oluşuyor: bowl() blok sayısı
   2*(2*nCorner + nLong + nShort) olduğundan 2*(2*8 + 4 + 2) = 44 ile
   her blok bir locaya karşılık geliyor. Blokların çoğu köşelerde çünkü
   düz kenarlarda 44'ü paylaştırmak locaları birbirine geçirtiyordu
   (test "taban çakışma" ile yakaladı). İki sıralı ve geniş koltuk
   aralıklı — gerçek locada da iki sıra koltuk olur; ayrıca tek sıralı
   yelpaze blokta taban hesabı kavisi takip etmediğinden koltuklar
   tabanın dışında kalıyordu (test "koltuk-içerme" ile yakaladı).

   Kapılar GS'deki gibi cutVomitories() ile tribünün içine oyuluyor.
   Loca sığ olduğu için tünel açılmaz (fonksiyon sığ blokları atlar). */
const [ulkerAlt, ulkerAltDoors] = cutVomitories(bowl({ W: 2250, H: 1400, Rc: 900, rows: 20, rowGap: 85, seatGap: 50,
  nLong: 4, nShort: 2, nCorner: 2, first: 101, level: "Alt Tribün", aisle: 200, pad: 70,
  colors: { long: "#C1743C", short: "#3E9092", corner: "#7C5BA8" } }));
const ulkerLoca = bowl({ W: 4100, H: 3250, Rc: 2600, rows: 2, rowGap: 90, seatGap: 90,
  nLong: 4, nShort: 2, nCorner: 8, first: 1, level: "Loca", aisle: 250, pad: 60,
  colors: { long: "#B79A32", short: "#B79A32", corner: "#B79A32" } });
const [ulkerUst, ulkerUstDoors] = cutVomitories(withAccessible(bowl({ W: 4450, H: 3600, Rc: 2800, rows: 18, rowGap: 85, seatGap: 50,
  nLong: 5, nShort: 3, nCorner: 3, first: 201, level: "Üst Tribün", aisle: 220, pad: 70,
  colors: { long: "#5F9142", short: "#6E7787", corner: "#3E7FBF" } }),
  ["203", "205", "207", "209", "211", "213", "215", "217", "219", "221", "223", "225", "227"], 9));

const ULKER = {
  key: "ulker", name: "Ülker Spor ve Etkinlik Salonu · Fenerbahçe Beko", unit: "cm",
  home: { x: -6600, y: -5700, w: 13200, h: 11400 }, underlay: null,
  shapes: [
    { id: nid("s"), kind: "rect", type: "pitch", sport: "basket", x: 0, y: 0,
      w: 2800, h: 1500, rot: 0, label: "Basketbol sahası", capacity: 0, fs: 160, blocks: [] },
    ...labelGates([...ulkerAltDoors, ...ulkerUstDoors]),
  ],
  blocks: [
    /* Parket kenarı — sahaya paralel iki tek sıra (courtside) */
    { id: nid(), kind: "grid", label: "P1", name: "Parket Kenarı · P1", level: "Parket Kenarı",
      x: 0, y: 950, rot: 0, cols: 30, rows: 2, counts: "", align: "center",
      seatGap: 55, rowGap: 90, curve: 0, taper: 0, color: "#C2415A", attr: "",
      num: { ...DEF_NUM, rowScheme: "letter" }, ov: {} },
    { id: nid(), kind: "grid", label: "P2", name: "Parket Kenarı · P2", level: "Parket Kenarı",
      x: 0, y: -950, rot: 180, cols: 30, rows: 2, counts: "", align: "center",
      seatGap: 55, rowGap: 90, curve: 0, taper: 0, color: "#C2415A", attr: "",
      num: { ...DEF_NUM, rowScheme: "letter" }, ov: {} },

    ...ulkerAlt, ...ulkerLoca, ...ulkerUst,
  ],
};
ULKER.shapes = autoGates(ULKER, ULKER.blocks.map((b) => ({ b, m: buildMeta(b) })));

/* ══════════════  SALON 5 · HARBİYE CEMİL TOPUZLU AÇIKHAVA  ══════════════
   180°'lik amfi. Üç kademe, harfle adlandırılmış radyal bloklar,
   önde protokol locası, sahne ile seyirci arasında orkestra çukuru.
   Her kademe tek tohum blok + radyal diziyle kuruluyor.
   ═══════════════════════════════════════════════════════════════════════ */

/** Amfi kademesi: eşit açı adımlarıyla radyal dizi, soldan sağa harflenir. */
function tier({ r0, rows, rowGap, span, count, first, level, color, aisle = 160, pad = 60 }) {
  /* Koridor cm olarak verilir; ilk sıranın yarıçapında açıya çevrilir.
     Kademe geriye gittikçe koridor açısal olarak daralmaz, genişler —
     gerçekte de merdiven yukarı doğru açılır. */
  const aDeg = (aisle / r0) / RAD;
  const step = span;
  const start = (-step * (count - 1)) / 2;
  return Array.from({ length: count }, (_, i) => reLabel({
    id: nid(), kind: "fan", mode: "span", x: 0, y: 0, rot: start + step * i,
    r0, rows, rowGap, seatGap: 50, counts: "", align: "center",
    aStart: -(span - aDeg) / 2, aEnd: (span - aDeg) / 2, aCenter: 0,
    color, pad, level, ov: {}, num: { ...DEF_NUM },
  }, incLabel(first, i)));
}

/** Loca kanadı: paylaşılan odağa bakan küçük yelpaze kutular, iki yanda
 *  simetrik. Kutular ana bloğun (parter/balkon) kapladığı açısal aralığın
 *  DIŞINDA başlamalı — aynı yarıçapta aynı açıya konursa localar parterin
 *  üstüne biner, koltuklar birebir çakışır. fromDeg ana bloğun kenar açısı
 *  (+ pay), toDeg localarının gidebileceği en uç açı. */
function locaWing({ r0, rows, rowGap, seatGap, perRow, gap, countPerSide,
                    first, level, color, pad = 40, fromDeg, toDeg }) {
  /* Kutu genişliğini TAHMİN etmek güvenilmezdi: offsetPoly'nin köşe
     gönyesi ve koltuğun kendi fiziksel genişliği hesaba katılmayınca
     tahmin gerçek genişlikten dar çıkıyordu (ölçünce 11,6° vs tahmin
     9,1°) — komşu kutular birbirine giriyordu. Şimdi örnek bir kutu
     gerçekten inşa edilip dış hattından ÖLÇÜLÜYOR, tahmin yok. */
  const counts = Array.from({ length: rows }, () => perRow).join(",");
  const probe = { id: nid(), kind: "fan", mode: "pitch", x: 0, y: 0, rot: 0,
    r0, rows, rowGap, seatGap, counts, align: "center",
    aStart: -40, aEnd: 40, aCenter: 0, color, pad, level, ov: {}, num: { ...DEF_NUM } };
  const pm = buildMeta(probe);
  const measuredDeg = (Math.atan2((pm.bbox.x1 - pm.bbox.x0) / 2, r0) / RAD) * 2;
  const gapDeg = (gap / r0) / RAD;
  const step = measuredDeg + gapDeg;
  const fit = Math.floor((toDeg - fromDeg) / step);
  const n = Math.min(countPerSide, Math.max(1, fit));
  const seed = (a, i) => reLabel({ ...probe, id: nid(), rot: a, noAisle: true }, incLabel(first, i));
  const out = [];
  for (let i = 0; i < n; i++) {
    const a = fromDeg + step / 2 + step * i;
    out.push(seed(-a, i));
    out.push(seed(a, n + i));
  }
  return out;
}

const wallArc = [
  ...Array.from({ length: 40 }, (_, i) => {
    const a = (-96 + (192 * i) / 39) * RAD;
    return { x: Math.round(5750 * Math.sin(a)), y: Math.round(-5750 * Math.cos(a)) };
  }),
  { x: 3200, y: 2200 }, { x: -3200, y: 2200 },
];

ZORLU.blocks = withAccessible(ZORLU.blocks,
  (b) => ["Orkestra Orta (arka)", "1. Balkon Orta"].includes(b.name), 9);
ZORLU.shapes = autoGates(ZORLU, ZORLU.blocks.map((b) => ({ b, m: buildMeta(b) })));

const HARBIYE = {
  key: "harbiye", name: "Harbiye Cemil Topuzlu Açıkhava Tiyatrosu", unit: "cm",
  home: { x: -6400, y: -6400, w: 12800, h: 9600 }, underlay: null,
  shapes: [
    { id: nid("s"), kind: "poly", type: "wall", x: 0, y: 0, rot: 0, pts: wallArc,
      label: "", capacity: 0, fs: 80, blocks: [] },
    { id: nid("s"), kind: "rect", type: "stage", x: 0, y: 700, w: 2600, h: 1300, rot: 0,
      label: "SAHNE", capacity: 0, fs: 210, blocks: [] },
    { id: nid("s"), kind: "rect", type: "screen", x: 0, y: -180, w: 2200, h: 420, rot: 0,
      label: "ORKESTRA ÇUKURU", capacity: 0, fs: 105, blocks: [] },
    ...[[1, -3050, -2450], [2, 3050, -2450], [3, -4550, -1500], [4, 4550, -1500],
        [5, 0, -5980]].map(([n, x, y]) => ({
      id: nid("s"), kind: "rect", type: "door", x, y, w: 300, h: 300, rot: 0,
      label: `KAPI ${n}`, capacity: 0, fs: 100, blocks: [],
    })),
  ],
  blocks: [
    /* Protokol locası — sahnenin hemen önünde, iki sıra */
    reLabel({ id: nid(), kind: "fan", mode: "span", x: 0, y: 0, rot: 0,
      r0: 1150, rows: 2, rowGap: 95, seatGap: 50, counts: "15,15", align: "center",
      aStart: -20, aEnd: 20, aCenter: 0, color: "#B79A32", pad: 45,
      level: "Protokol", ov: {}, num: { ...DEF_NUM } }, "PR"),

    ...tier({ r0: 1500, rows: 11, rowGap: 95, span: 35, count: 5,
      first: "A", level: "Alt Kademe", color: "#3E7FBF", aisle: 150, pad: 60 }),
    ...tier({ r0: 2700, rows: 11, rowGap: 95, span: 30, count: 6,
      first: "F", level: "Orta Kademe", color: "#5F9142", aisle: 160, pad: 60 }),
    ...tier({ r0: 3900, rows: 6, rowGap: 95, span: 30, count: 5,
      first: "M", level: "Üst Kademe", color: "#C1743C", aisle: 180, pad: 60 }),

    /* Erişilebilir platformlar — üst kademenin arkasındaki düz alan.
       Tekerlekli sandalye ve refakatçi yerleri sırayla dizili. */
    ...[-1, 1].map((sd, k) => reLabel({
      id: nid(), kind: "fan", mode: "span", x: 0, y: 0, rot: sd * 52,
      r0: 4680, rows: 2, rowGap: 130, seatGap: 62, counts: "18,18", align: "center",
      aStart: -13, aEnd: 13, aCenter: 0, color: "#3E9092", pad: 60,
      level: "Erişilebilir Platform",
      ov: Object.fromEntries(Array.from({ length: 36 }, (_, i) =>
        [`${Math.floor(i / 18)},${i % 18}`, { at: i % 2 === 0 ? "wheel" : "comp" }])),
      num: { ...DEF_NUM },
    }, `E${k + 1}`)),
  ],
};

/* Kapılar en yakın bloklara atanıyor — editördeki düğmenin yaptığı işlem. */
HARBIYE.shapes = autoGates(HARBIYE, HARBIYE.blocks.map((b) => ({ b, m: buildMeta(b) })));
HARBIYE.shapes = [...HARBIYE.shapes,
  ...[["wc", -5150, -2350, "WC"], ["wc", 5150, -2350, "WC"],
      ["beer", -4300, -4100, "Büfe"], ["beer", 4300, -4100, "Büfe"],
      ["stairs", -2450, -5250, "Merdiven"], ["stairs", 2450, -5250, "Merdiven"],
      ["aid", 0, 1750, "İlk yardım"]]
    .map(([icon, x, y, label]) => ({ id: nid("s"), kind: "icon", type: "icon", icon,
      x, y, rot: 0, size: 34, w: 200, h: 200, label, capacity: 0, fs: 100, blocks: [] }))];

/** Son sıralardan başlayarak tekerlekli sandalye + refakatçi çiftleri açar.
 *  Çifti bölmez: sıra kısaysa bir öncekine taşar. Önceden sıranın sonuna
 *  denk gelen çiftin refakatçisi düşüyordu, sayılar tutmuyordu. */
function withAccessible(blocks, match, pairs = 2) {
  const hit = typeof match === "function" ? match : (b) => match.includes(b.label);
  return blocks.map((b) => {
    if (!hit(b)) return b;
    const P = prep(b);
    const ov = { ...b.ov };
    let placed = 0;
    for (let r = P.counts.length - 1; r >= 0 && placed < pairs; r--) {
      const n = P.counts[r];
      for (let i = 0; i + 1 < n && placed < pairs; i += 2) {
        ov[`${r},${i}`] = { at: "wheel" };
        ov[`${r},${i + 1}`] = { at: "comp" };
        placed++;
      }
    }
    return { ...b, ov };
  });
}

/* ══════════════  SALON 6 · AYLAK BAR KADIKÖY  ══════════════
   Stand-up gecesi düzeni. Sıra yok, masa var: 2 ve 4 kişilik yuvarlak
   masalar, bar tezgâhı boyunca tabure, arkada ayakta alan.
   Tellalzade Sk. No:13, Caferağa — küçük bir bar, düzensiz plan.
   ═══════════════════════════════════════════════════════════ */

const tbl = (label, x, y, seats, tW, a0, color) => reLabel({
  id: nid(), kind: "table", x, y, rot: 0, tShape: "round",
  tW, tH: tW, seats, a0, clear: 12, pad: 10, color, level: "Salon",
  cols: 1, rows: 1, counts: "", align: "center", curve: 0, taper: 0,
  seatGap: 50, rowGap: 90, attr: "", ov: {},
  num: { ...DEF_NUM, rowScheme: "custom", rowCustom: "1" },
}, label);

const AYLAK = {
  key: "aylak", name: "Aylak Bar Kadıköy · Stand-up düzeni", unit: "cm",
  home: { x: -900, y: -800, w: 1900, h: 1560 },
  idTemplate: "{block}-{seat}", underlay: null,
  shapes: [
    { id: nid("s"), kind: "rect", type: "wall", x: 130, y: -60, w: 1560, h: 1120, rot: 0,
      label: "", capacity: 0, fs: 40, blocks: [] },
    { id: nid("s"), kind: "rect", type: "stage", x: 0, y: -470, w: 420, h: 180, rot: 0,
      label: "SAHNE", capacity: 0, fs: 70, blocks: [] },
    { id: nid("s"), kind: "rect", type: "screen", x: -490, y: -25, w: 140, h: 550, rot: 0,
      label: "BAR TEZGÂHI", capacity: 0, fs: 52, blocks: [] },
    { id: nid("s"), kind: "rect", type: "standing", x: 150, y: 455, w: 900, h: 130, rot: 0,
      label: "Ayakta alan", capacity: 40, fs: 44, blocks: [] },
    ...[[1, -640, 250], [2, 640, 250]].map(([n, x, y]) => ({
      id: nid("s"), kind: "rect", type: "door", x, y, w: 90, h: 90, rot: 0,
      label: `KAPI ${n}`, capacity: 0, fs: 36, blocks: [] })),
    ...[["entrance", -545, 405, "Giriş"], ["wc", 555, 405, "WC"],
        ["aid", 555, -520, "İlk yardım"], ["cafe", -545, -520, "Bar"]]
      .map(([icon, x, y, label]) => ({ id: nid("s"), kind: "icon", type: "icon", icon,
        x, y, rot: 0, size: 32, w: 120, h: 120, label, capacity: 0, fs: 100, blocks: [] })),
  ],
  blocks: [
    /* Sahne önü — iki kişilik masalar */
    ...[-195, 35, 265, 495].map((x, i) => tbl(`M${i + 1}`, x, -250, 2, 65, 0, "#C2415A")),
    /* Salon — dört kişilik masalar, iki sıra */
    ...[-195, 35, 265, 495].map((x, i) => tbl(`M${i + 5}`, x, -20, 4, 90, 45, "#3E7FBF")),
    ...[-195, 35, 265, 495].map((x, i) => tbl(`M${i + 9}`, x, 210, 4, 90, 45, "#3E7FBF")),
    /* Bar tezgâhı taburesi — tek sıra, tezgâha dönük */
    reLabel({ id: nid(), kind: "grid", x: -370, y: -25, rot: -90,
      cols: 7, rows: 1, counts: "", align: "center", seatGap: 72, rowGap: 90,
      curve: 0, taper: 0, color: "#B79A32", pad: 30, level: "Bar", attr: "", ov: {},
      num: { ...DEF_NUM, rowScheme: "custom", rowCustom: "B", seatStart: 1 } }, "BAR"),
  ],
};
/* Erişilebilir masalar — girişe ve geçiş aksına yakın */
AYLAK.blocks = withAccessible(AYLAK.blocks, ["M1", "M4", "M9", "M12"], 1);
AYLAK.shapes = autoGates(AYLAK, AYLAK.blocks.map((b) => ({ b, m: buildMeta(b) })));

/* ══════════════  SALON 7 · SÜREYYA OPERASI (KADIKÖY)  ══════════════
   1927'de sinema olarak açılan, 2007'de operaya dönüştürülen tarihi bina.
   570 kişilik, at nalı (horseshoe) formda: parter + zemin loca + 1. kat
   (açık balkon + loca) + 2. kat (sadece loca). Odak sahnenin hemen önünde;
   localar paylaşılan bu odağa bakan küçük yelpaze kutular olarak kuruluyor.
   ═══════════════════════════════════════════════════════════════════ */

const SUREYYA = {
  key: "sureyya", name: "Süreyya Operası · Kadıköy", unit: "cm",
  home: { x: -1150, y: -900, w: 2300, h: 2000 }, underlay: null,
  shapes: [
    { id: nid("s"), kind: "rect", type: "stage", x: 0, y: 620, w: 1500, h: 750, rot: 0,
      label: "SAHNE", capacity: 0, fs: 90, blocks: [] },
    { id: nid("s"), kind: "rect", type: "screen", x: 0, y: 140, w: 950, h: 220, rot: 0,
      label: "ORKESTRA ÇUKURU", capacity: 0, fs: 46, blocks: [] },
    ...[["cloak", -980, 950, "Vestiyer"], ["wc", 980, 950, "WC"],
        ["entrance", 0, 980, "Giriş"], ["info", -980, -820, "Danışma"]]
      .map(([icon, x, y, label]) => ({ id: nid("s"), kind: "icon", type: "icon", icon,
        x, y, rot: 0, size: 30, w: 120, h: 120, label, capacity: 0, fs: 100, blocks: [] })),
    ...[[1, -700, 940], [2, 700, 940]].map(([n, x, y]) => ({
      id: nid("s"), kind: "rect", type: "door", x, y, w: 90, h: 90, rot: 0,
      label: `KAPI ${n}`, capacity: 0, fs: 34, blocks: [] })),
  ],
  blocks: [
    /* Parter — sahne önü, hafif açılan taban, sabit değil doğal taper */
    reLabel({ id: nid(), kind: "fan", mode: "span", x: 0, y: 0, rot: 0,
      r0: 320, rows: 7, rowGap: 82, seatGap: 47, counts: "", align: "center",
      aStart: -54, aEnd: 54, aCenter: 0, color: "#3E7FBF", pad: 45,
      level: "Parter", ov: {}, num: { ...DEF_NUM } }, "P"),

    /* Zemin kat locaları — parterin iki yanında, sahneye yakın kutular.
       6 sıra × 2'şer koltuk, ön sahneden başlayıp arkaya doğru sayılı. */
    ...locaWing({ r0: 460, rows: 2, rowGap: 78, seatGap: 46, perRow: 3, gap: 14,
      countPerSide: 8, first: "ZL1", level: "Zemin Loca", color: "#C2415A", pad: 26,
      fromDeg: 70, toDeg: 104 }),

    /* 1. kat — orta kesim açık balkon, yanlarda loca */
    reLabel({ id: nid(), kind: "fan", mode: "span", x: 0, y: 0, rot: 0,
      r0: 930, rows: 5, rowGap: 62, seatGap: 48, counts: "", align: "center",
      aStart: -34, aEnd: 34, aCenter: 0, color: "#5F9142", pad: 45,
      level: "1. Kat", ov: {}, num: { ...DEF_NUM, rowScheme: "letter" } }, "A"),
    ...locaWing({ r0: 930, rows: 2, rowGap: 78, seatGap: 46, perRow: 3, gap: 18,
      countPerSide: 5, first: "1L1", level: "1. Kat Loca", color: "#B79A32", pad: 26,
      fromDeg: 60, toDeg: 92 }),

    /* 2. kat — sadece loca, sahneyi görmek için öne eğilmek gerekiyor */
    ...locaWing({ r0: 1280, rows: 2, rowGap: 70, seatGap: 46, perRow: 3, gap: 14,
      countPerSide: 9, first: "2L1", level: "2. Kat Loca", color: "#7C5BA8", pad: 26,
      fromDeg: 40, toDeg: 100 }),
  ],
};
/* Erişilebilir yer — zemin kat locasının en uç, en kolay ulaşılan kutusu */
SUREYYA.blocks = withAccessible(SUREYYA.blocks, (b) => b.level === "Zemin Loca" || b.label === "P", 2);
SUREYYA.shapes = autoGates(SUREYYA, SUREYYA.blocks.map((b) => ({ b, m: buildMeta(b) })));

/* ══════════════  SALON 8 · AKM TÜRK TELEKOM OPERA SALONU  ══════════════
   Taksim, at nalı (horseshoe) formlu opera salonu — parter + 2 balkon,
   her biri ORTA/ÇİFT/TEK üçlüsü. Passo'nun yayınladığı gerçek oturma
   planından (akmistanbul.gov.tr / passo.com.tr) çıkarıldı: 2040 koltuk,
   85 kişilik orkestra çukuru, 3 kattan 16 kapı. Burada 1.829 koltuk ve
   6 kapıya sadeleştirildi — gerçek planın 4 derinlik-bandı (fiyat
   kategorisine göre) 2'ye indirildi, tam sayı hedeflenmedi.
   ─────────────────────────────────────────────────────────────────────
   Parter'ın iki bandı (ön/arka) ve 1./2. Balkon aynı yarıçapta DEĞİL —
   Süreyya'daki kat ilkesiyle aynı: her kat kendi halkasında oturur,
   halkalar yarıçapça çakışmaz. Fiziksel olarak balkon parterin üstünde
   çıkıntı yapar ama bu düzlemsel planda katları çakıştırırsak
   validate() "koltuk çifti üst üste biniyor" der — kat ayrımı yalnızca
   yürüme payı kontrolünde var, ham çakışma kontrolünde yok.
   ORTA ile ÇİFT/TEK arasındaki açı boşluğu (Parter'da 44°, balkonlarda
   ~6-8°) taban payının (~100cm) çakışmaması için — dar tutulursa
   Sutherland-Hodgman testi gizli bir taban çakışması buluyor (ilk
   denemede P.ORTA-2 ↔ ÇİFT-2/TEK-2 arasında ~5.500cm² çıkmıştı).
   ═══════════════════════════════════════════════════════════════════ */

const akmDoor = (n, x, y) => ({
  id: nid("s"), kind: "rect", type: "door", x, y, w: 200, h: 200, rot: 0,
  label: `KAPI ${n}`, capacity: 0, fs: 150, blocks: [],
});

const AKM = {
  key: "akm", name: "AKM · Türk Telekom Opera Salonu", unit: "cm",
  home: { x: -2700, y: -3350, w: 5400, h: 3600 }, underlay: null,
  shapes: [
    { id: nid("s"), kind: "rect", type: "stage", x: 0, y: -450, w: 1200, h: 350, rot: 0,
      label: "SAHNE", capacity: 0, fs: 100, blocks: [] },
    { id: nid("s"), kind: "rect", type: "wall", x: 0, y: -1550, w: 5200, h: 3400, rot: 0,
      label: "DUVAR", capacity: 0, fs: 100, blocks: [] },
    akmDoor(1, -1893, -166), akmDoor(2, 1893, -166),
    akmDoor(3, -1543, -1839), akmDoor(4, 1543, -1839),
    akmDoor(5, -2155, -1940), akmDoor(6, 2155, -1940),
  ],
  blocks: [
    /* Sahneye en yakın küçük ön bant — tek parça (ÇİFT/TEK ayrımı bu
       yarıçapta ≥26°'lik bir koridor açısı ister, gereksiz daralma). */
    fanB({ label: "P.ON", level: "Parter", mode: "span", x: 0, y: 0,
      r0: 200, rows: 5, rowGap: 85, aStart: -78, aEnd: 78, seatGap: 48, color: "#3E7FBF",
      ov: {
        "4,8": { at: "wheel" }, "4,9": { at: "wheel" }, "4,10": { at: "wheel" },
        "4,11": { at: "wheel" }, "4,12": { at: "wheel" }, "4,13": { at: "wheel" },
        "4,14": { at: "wheel" }, "4,15": { at: "wheel" }, "4,16": { at: "wheel" }, "4,17": { at: "wheel" },
        "3,8": { at: "comp" }, "3,9": { at: "comp" }, "3,10": { at: "comp" },
        "3,11": { at: "comp" }, "3,12": { at: "comp" }, "3,13": { at: "comp" },
        "3,14": { at: "comp" }, "3,15": { at: "comp" }, "3,16": { at: "comp" }, "3,17": { at: "comp" },
      } }),
    fanB({ label: "P.ORTA-2", level: "Parter", mode: "span", x: 0, y: 0,
      r0: 825, rows: 13, rowGap: 88, aStart: -22, aEnd: 22, seatGap: 50, color: "#3E7FBF" }),
    fanB({ label: "P.ÇİFT-2", level: "Parter", mode: "span", x: 0, y: 0,
      r0: 825, rows: 13, rowGap: 88, aStart: -86, aEnd: -37, seatGap: 50, color: "#3E7FBF" }),
    fanB({ label: "P.TEK-2", level: "Parter", mode: "span", x: 0, y: 0,
      r0: 825, rows: 13, rowGap: 88, aStart: 37, aEnd: 86, seatGap: 50, color: "#3E7FBF" }),
    fanB({ label: "1B.ORTA", level: "1. Balkon", mode: "span", x: 0, y: 0,
      r0: 2069, rows: 7, rowGap: 88, aStart: -16, aEnd: 16, seatGap: 52, color: "#3E7FBF",
      ov: {
        "6,8": { at: "wheel" }, "6,9": { at: "wheel" }, "6,10": { at: "wheel" }, "6,11": { at: "wheel" },
        "6,12": { at: "wheel" }, "6,13": { at: "wheel" }, "6,14": { at: "wheel" }, "6,15": { at: "wheel" },
        "5,8": { at: "comp" }, "5,9": { at: "comp" }, "5,10": { at: "comp" }, "5,11": { at: "comp" },
        "5,12": { at: "comp" }, "5,13": { at: "comp" }, "5,14": { at: "comp" }, "5,15": { at: "comp" },
      } }),
    fanB({ label: "1B.ÇİFT", level: "1. Balkon", mode: "span", x: 0, y: 0,
      r0: 2069, rows: 7, rowGap: 88, aStart: -43, aEnd: -22, seatGap: 52, color: "#3E7FBF" }),
    fanB({ label: "1B.TEK", level: "1. Balkon", mode: "span", x: 0, y: 0,
      r0: 2069, rows: 7, rowGap: 88, aStart: 22, aEnd: 43, seatGap: 52, color: "#3E7FBF" }),
    fanB({ label: "2B.ORTA", level: "2. Balkon", mode: "span", x: 0, y: 0,
      r0: 2697, rows: 5, rowGap: 88, aStart: -21, aEnd: 21, seatGap: 52, color: "#3E7FBF" }),
    fanB({ label: "2B.ÇİFT", level: "2. Balkon", mode: "span", x: 0, y: 0,
      r0: 2697, rows: 5, rowGap: 88, aStart: -52, aEnd: -27, seatGap: 52, color: "#3E7FBF" }),
    fanB({ label: "2B.TEK", level: "2. Balkon", mode: "span", x: 0, y: 0,
      r0: 2697, rows: 5, rowGap: 88, aStart: 27, aEnd: 52, seatGap: 52, color: "#3E7FBF" }),
  ],
};
AKM.shapes = autoGates(AKM, AKM.blocks.map((b) => ({ b, m: buildMeta(b) })));

/* ══════════════  SALON 9 · FESTIVAL PARK YENİKAPI  ══════════════
   Büyük ölçekli açık hava — koltuk yerine çoğunlukla ayakta alan
   (standing shape) modelledi. Sahneden uzaklaştıkça genişleyen üç
   ayakta bant (Sahne Önü A/B, Genel Giriş) + ayrı bir VIP cebi +
   tek gerçek oturan blok (LOCA, ızgara). Toplam 40.000 — Şebnem
   Ferah'ın buradaki konserinin gerçek rakamı; bant içi dağılım
   editöryel tahmin (kaynakta tek tek bilet kategorisi kırılımı yok).
   ══════════════════════════════════════════════════════════════ */

const YENIKAPI = {
  key: "yenikapi", name: "Festival Park Yenikapı · Ayakta Konser Alanı", unit: "cm",
  home: { x: -10500, y: -2200, w: 19000, h: 20400 }, underlay: null,
  shapes: [
    { id: nid("s"), kind: "rect", type: "stage", x: 0, y: -750, w: 4000, h: 1500, rot: 0,
      label: "SAHNE", capacity: 0, fs: 300, blocks: [] },
    { id: nid("s"), kind: "rect", type: "standing", x: 0, y: 1600, w: 5000, h: 3000, rot: 0,
      label: "Sahne Önü A", capacity: 7000, fs: 110, blocks: [] },
    { id: nid("s"), kind: "rect", type: "standing", x: 0, y: 5200, w: 8000, h: 4000, rot: 0,
      label: "Sahne Önü B", capacity: 11200, fs: 130, blocks: [] },
    { id: nid("s"), kind: "rect", type: "standing", x: 0, y: 11350, w: 13000, h: 8000, rot: 0,
      label: "Genel Giriş", capacity: 20100, fs: 160, blocks: [] },
    { id: nid("s"), kind: "rect", type: "standing", x: -7500, y: 4450, w: 3000, h: 2500, rot: 0,
      label: "VIP Alan", capacity: 1200, fs: 100, blocks: [] },
    { id: nid("s"), kind: "rect", type: "wall", x: -1250, y: 8000, w: 16500, h: 19600, rot: 0,
      label: "", capacity: 0, fs: 100, blocks: [] },
    ...[[1, -9500, 6000], [2, 7000, 6000], [3, -9500, 14000], [4, 7000, 14000],
        [5, -3000, 17600], [6, 2000, 17600]].map(([n, x, y]) => ({
      id: nid("s"), kind: "rect", type: "door", x, y, w: 400, h: 400, rot: 0,
      label: `KAPI ${n}`, capacity: 0, fs: 160, blocks: [],
    })),
  ],
  blocks: [
    { id: nid(), kind: "grid", label: "LOCA", name: "LOCA", level: "Loca",
      x: 0, y: 15650, rot: 0, cols: 25, rows: 20, counts: "", align: "center",
      seatGap: 50, rowGap: 90, curve: 0, taper: 0, color: "#3E7FBF", attr: "",
      num: { ...DEF_NUM },
      ov: {
        "19,0": { at: "wheel" }, "19,1": { at: "wheel" }, "19,2": { at: "wheel" },
        "19,3": { at: "wheel" }, "19,4": { at: "wheel" }, "19,5": { at: "wheel" },
        "19,6": { at: "comp" }, "19,7": { at: "comp" }, "19,8": { at: "comp" },
        "19,9": { at: "comp" }, "19,10": { at: "comp" }, "19,11": { at: "comp" },
      } },
  ],
};
YENIKAPI.shapes = autoGates(YENIKAPI, YENIKAPI.blocks.map((b) => ({ b, m: buildMeta(b) })));

const EMPTY = { key: "empty", name: "Yeni plan", unit: "cm",
  home: { x: -2000, y: -1500, w: 4000, h: 3000 }, underlay: null, blocks: [], shapes: [] };

/* ─────────────────────────  İÇE AKTARMA  ─────────────────────────
   Dış dosyadaki kimlikler oturumdaki sayaçla çakışabilir; hepsi
   yeniden atanır. Eksik alanlar varsayılanla tamamlanır.
   ─────────────────────────────────────────────────────────────── */

function adoptPlan(raw, key) {
  if (!raw || !Array.isArray(raw.blocks)) throw new Error("blocks dizisi yok");
  const blocks = raw.blocks.map((b) => ({
    kind: "grid", x: 0, y: 0, rot: 0, cols: 10, rows: 5, counts: "", align: "center",
    seatGap: DEF.seatGap, rowGap: DEF.rowGap, curve: 0, taper: 0, color: "#3E7FBF", attr: "",
    mode: "span", r0: 500, aStart: -40, aEnd: 40, aCenter: 0, pts: [],
    ...b, id: nid(), ov: b.ov || {}, num: { ...DEF_NUM, ...(b.num || {}) },
    label: String(b.label ?? "A"), level: b.level || "",
  }));
  const shapes = (raw.shapes || []).map((s) => ({ ...s, id: nid("s") }));
  let home = raw.home;
  if (!home) {
    const bb = blocks.map(buildMeta).map((m) => m.bbox);
    if (bb.length) {
      const x0 = Math.min(...bb.map((b) => b.x0)), x1 = Math.max(...bb.map((b) => b.x1));
      const y0 = Math.min(...bb.map((b) => b.y0)), y1 = Math.max(...bb.map((b) => b.y1));
      const pad = Math.max(x1 - x0, y1 - y0) * 0.1;
      home = { x: x0 - pad, y: y0 - pad, w: x1 - x0 + 2 * pad, h: y1 - y0 + 2 * pad };
    } else home = EMPTY.home;
  }
  return { key, name: raw.name || "İçe aktarılan plan", unit: "cm",
    home, underlay: null, blocks, shapes };
}

/* ─────────────────────────  SALON SINIRI  ─────────────────────────
   "Duvar" tipindeki şekiller salonun sınırıdır. Sınır dışına taşan
   koltuk fiziksel olarak var olamaz; bu bir çizim hatasıdır ve
   yayına gitmeden yakalanmalıdır.
   ───────────────────────────────────────────────────────────────── */

function boundaryPolys(plan) {
  const out = [];
  (plan.shapes || []).filter((s) => s.type === "wall").forEach((s) => {
    const cos = Math.cos((s.rot || 0) * RAD), sin = Math.sin((s.rot || 0) * RAD);
    const pts = s.kind === "poly" ? s.pts : [
      { x: -s.w / 2, y: -s.h / 2 }, { x: s.w / 2, y: -s.h / 2 },
      { x: s.w / 2, y: s.h / 2 }, { x: -s.w / 2, y: s.h / 2 },
    ];
    out.push(pts.map((p) => ({ x: s.x + p.x * cos - p.y * sin, y: s.y + p.x * sin + p.y * cos })));
  });
  return out;
}

/** Işın atma — poligon içinde mi? */
function inPoly(x, y, poly) {
  let hit = false;
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
    const a = poly[i], b = poly[j];
    if ((a.y > y) !== (b.y > y) && x < ((b.x - a.x) * (y - a.y)) / (b.y - a.y) + a.x) hit = !hit;
  }
  return hit;
}
/** Sınır tanımlı değilse her yer geçerli sayılır. */
const inBounds = (x, y, polys) => !polys.length || polys.some((p) => inPoly(x, y, p));

/* ───────────────  TABAN-TABAN ÇAKIŞMA (Sutherland-Hodgman)  ───────────────
   İki blok tabanı (m.outline) gerçekten kesişiyor mu? Görünürde bir
   boşluk olsa bile otomatik taban payı (offsetPoly'nin şişirdiği dış hat)
   yine de çakışabilir — ZORLU'da ve AKM'de tam bunu bulduk: dar açısal
   boşluk, geniş taban payını durduramadı, ama koltuklar güvendeydi. Bu
   yüzden bu kontrol koltuk merkezlerine değil, tabanın kendisine bakar.
   clip poligonu dışbükey olmasa da bbox ile önceden elenmiş komşu
   bloklar için doğru sonuç veriyor. */
function polySignedArea(poly) {
  let a = 0;
  for (let i = 0; i < poly.length; i++) {
    const p = poly[i], q = poly[(i + 1) % poly.length];
    a += p.x * q.y - q.x * p.y;
  }
  return a / 2;
}
const polyCCW = (poly) => (polySignedArea(poly) < 0 ? [...poly].reverse() : poly);
function segIntersect(p1, p2, p3, p4) {
  const d1x = p2.x - p1.x, d1y = p2.y - p1.y, d2x = p4.x - p3.x, d2y = p4.y - p3.y;
  const denom = d1x * d2y - d1y * d2x;
  const t = denom === 0 ? 0 : ((p3.x - p1.x) * d2y - (p3.y - p1.y) * d2x) / denom;
  return { x: p1.x + t * d1x, y: p1.y + t * d1y };
}
function clipPoly(subject, clip) {
  let out = subject;
  for (let i = 0; i < clip.length && out.length; i++) {
    const a = clip[i], b = clip[(i + 1) % clip.length];
    const inside = (p) => (b.x - a.x) * (p.y - a.y) - (b.y - a.y) * (p.x - a.x) >= 0;
    const inp = out; out = [];
    for (let j = 0; j < inp.length; j++) {
      const cur = inp[j], prev = inp[(j - 1 + inp.length) % inp.length];
      const curIn = inside(cur), prevIn = inside(prev);
      if (curIn) { if (!prevIn) out.push(segIntersect(prev, cur, a, b)); out.push(cur); }
      else if (prevIn) out.push(segIntersect(prev, cur, a, b));
    }
  }
  return out;
}
/** İki dış hattın kesişim alanı (cm²) — kesişmiyorsa 0. */
function outlineOverlapArea(polyA, polyB) {
  const xa = polyA.map((p) => p.x), ya = polyA.map((p) => p.y);
  const xb = polyB.map((p) => p.x), yb = polyB.map((p) => p.y);
  if (Math.max(...xa) < Math.min(...xb) || Math.max(...xb) < Math.min(...xa)) return 0;
  if (Math.max(...ya) < Math.min(...yb) || Math.max(...yb) < Math.min(...ya)) return 0;
  const result = clipPoly(polyCCW(polyA), polyCCW(polyB));
  return result.length < 3 ? 0 : Math.abs(polySignedArea(result));
}

/* ─────────────────────────  DOĞRULAMA  ───────────────────────── */

function validate(plan, metas, gates) {
  const out = [];
  const seen = new Map();
  const at = {};
  const polys = boundaryPolys(plan);
  const outside = {};
  const outsideIds = new Set();
  const pts = [];
  let outCount = 0, unlabeled = 0, total = 0;
  metas.forEach(({ b, m }) => {
    buildSeats(b, m, plan.idTemplate).seats.forEach((s) => {
      if (s.gap) return;
      total++;
      /* Yandan geçiş gerektirmeyen bloklar: masa (etrafı zaten bitişik
         oturma alanı) veya elle işaretlenmiş b.noAisle (loca gibi —
         erişim arkadan/koridordan, yandan değil; komşu kutular arasında
         sadece ince bir bölme olur). */
      pts.push({ x: s.x, y: s.y, b: s.block, bid: b.id, l: s.level, t: b.kind === "table" || !!b.noAisle });
      if (polys.length && !inBounds(s.x, s.y, polys)) {
        outCount++; outside[s.block] = (outside[s.block] || 0) + 1; outsideIds.add(b.id);
      }
      if (s.at) at[s.at] = (at[s.at] || 0) + 1;
      if (s.num === "" || s.num == null) unlabeled++;
      seen.set(s.id, (seen.get(s.id) || 0) + 1);
    });
  });

  /* Tuvaldeki canlı uyarı blok tabanına, doğrulama koltuklara bakıyordu;
     biri kırmızı çerçeve çizerken öteki "temiz" diyordu. İkisi de artık
     hem koltuğu hem tabanı ölçüyor. */
  const outBlocks = polys.length
    ? metas.filter(({ m }) => m.outline.some((q) => !inBounds(q.x, q.y, polys)))
    : [];
  if (outCount) out.push({ t: "err",
    m: `${outCount.toLocaleString("tr-TR")} koltuk salon sınırının dışında`,
    d: Object.entries(outside).map(([b, n]) => `${b}: ${n}`).join(" · "), ids: [...outsideIds] });
  if (outBlocks.length) out.push({ t: "err",
    m: `${outBlocks.length} bloğun tabanı salon sınırına taşıyor`,
    d: outBlocks.slice(0, 8).map(({ b }) => b.name || b.label).join(", "),
    ids: outBlocks.map(({ b }) => b.id) });
  if (polys.length && !outCount && !outBlocks.length)
    out.push({ t: "ok", m: "Tüm koltuklar ve blok tabanları salon sınırı içinde" });

  /* Taban-taban çakışma: aynı kattaki iki bloğun dış hattı (koltukların
     değil, platformun kendisi) örtüşüyor mu? Sadece aynı kat karşılaştırılır
     — farklı katlar fiziksel olarak üst üste, kesişmeleri anlamsız bir
     uyarı olurdu. Koltuklar güvende olsa da (yürüme payı ve çakışma
     kontrolleri ayrı geçse de) taban payı örtüşebilir — bu, koltuk
     merkezlerine bakan diğer kontrollerin kaçırdığı bir sınıf hata. */
  const footprintByLevel = new Map();
  metas.forEach((x) => {
    const key = x.b.level || "";
    if (!footprintByLevel.has(key)) footprintByLevel.set(key, []);
    footprintByLevel.get(key).push(x);
  });
  const footprintOverlaps = [];
  footprintByLevel.forEach((group) => {
    for (let i = 0; i < group.length; i++) {
      for (let j = i + 1; j < group.length; j++) {
        const area = outlineOverlapArea(group[i].m.outline, group[j].m.outline);
        if (area > 50) footprintOverlaps.push({
          a: group[i].b.name || group[i].b.label, b: group[j].b.name || group[j].b.label, area,
          ai: group[i].b.id, bi: group[j].b.id,
        });
      }
    }
  });
  if (footprintOverlaps.length) out.push({ t: "err",
    m: `${footprintOverlaps.length} blok tabanı başka bir bloğun tabanıyla çakışıyor`,
    d: footprintOverlaps.slice(0, 6).map((o) => `${o.a}↔${o.b} (${Math.round(o.area).toLocaleString("tr-TR")}cm²)`).join(" · "),
    ids: [...new Set(footprintOverlaps.flatMap((o) => [o.ai, o.bi]))] });

  /* Üst üste binen koltuk: merkezleri 30 cm'den yakın iki koltuk fiziksel
     olarak aynı yerde demektir. Izgara indeksiyle taranıyor. */
  const CELL = 200, grid = new Map();
  let clash = 0; const clashPairs = new Set(); const clashIds = new Set();
  pts.forEach((q, i) => {
    const k = `${Math.floor(q.x / CELL)}:${Math.floor(q.y / CELL)}`;
    if (!grid.has(k)) grid.set(k, []);
    grid.get(k).push(i);
  });
  const narrow = { min: Infinity, pair: "", ids: [] };
  pts.forEach((q, i) => {
    const cx = Math.floor(q.x / CELL), cy = Math.floor(q.y / CELL);
    for (let dx = -1; dx <= 1; dx++) for (let dy = -1; dy <= 1; dy++) {
      (grid.get(`${cx + dx}:${cy + dy}`) || []).forEach((j) => {
        if (j <= i) return;
        const w = pts[j];
        const d = Math.hypot(q.x - w.x, q.y - w.y);
        if (d < 30) { clash++; clashPairs.add(q.b === w.b ? q.b : `${q.b}↔${w.b}`); clashIds.add(q.bid).add(w.bid); }
        /* İki masa arasında koridor aranmaz — sandalye sırtları bitişik
           olabilir. Farklı katlardaki bloklar da aranmaz — aralarında
           zaten düşey bir ayrım (tavan/zemin) var, "80 cm boşluk yeter
           mi" sorusu anlamsız; kural yalnızca aynı kat içinde geçerli. */
        if (q.b !== w.b && q.l === w.l && !(q.t && w.t) && d < narrow.min) {
          narrow.min = d; narrow.pair = `${q.b} ↔ ${w.b}`; narrow.ids = [q.bid, w.bid];
        }
      });
    }
  });
  if (clash) out.push({ t: "err", m: `${clash.toLocaleString("tr-TR")} koltuk çifti üst üste biniyor`,
    d: [...clashPairs].slice(0, 6).join(" · "), ids: [...clashIds] });

  /* Farklı bloklar arasında insanın geçebileceği bir açıklık olmalı.
     90 cm altı geçit sayılmaz; iki blok pratikte tek blok gibi olur. */
  if (narrow.min < 90 && narrow.min < Infinity)
    out.push({ t: "err", m: `Bloklar arasında yürüme payı yok — en dar açıklık ${Math.round(narrow.min)} cm`,
      d: `${narrow.pair} · geçit için en az 90 cm gerekir`, ids: narrow.ids });
  else if (narrow.min < 120 && narrow.min < Infinity)
    out.push({ t: "warn", m: `Bloklar arası en dar açıklık ${Math.round(narrow.min)} cm`,
      d: `${narrow.pair} · rahat geçiş için 120 cm önerilir`, ids: narrow.ids });

  const sellable = total - (at.tech || 0);
  out.push({ t: "info", m: `${sellable.toLocaleString("tr-TR")} satılabilir koltuk`,
    d: at.tech ? `${at.tech} koltuk teknik/satışa kapalı` : null });

  /* Gerekli tekerlekli sandalye yeri sabit bir yüzde değil, kademeli:
     ilk 500 koltuk için 6, sonraki her 150 koltuk için 1, 5.000'in
     üstünde her 200 koltuk için 1. Küçük salonda oran yüksek, büyükte
     düşük olur — sabit yüzde iki uçta da yanlış sonuç veriyordu. */
  const need = total <= 25 ? 1 : total <= 50 ? 2 : total <= 150 ? 4
    : total <= 300 ? 5 : total <= 500 ? 6
    : total <= 5000 ? 6 + Math.ceil((total - 500) / 150)
    : 36 + Math.ceil((total - 5000) / 200);
  const wheel = at.wheel || 0;
  if (!wheel) out.push({ t: "err", m: `Tekerlekli sandalye alanı tanımlanmamış — en az ${need} gerekiyor` });
  else if (wheel < need) out.push({ t: "warn",
    m: `${wheel} tekerlekli sandalye alanı — bu kapasite için ${need} gerekiyor`,
    d: `${need - wheel} yer daha eklenmeli` });
  else out.push({ t: "ok", m: `${wheel} tekerlekli sandalye alanı · ${at.comp || 0} refakatçi`,
    d: `gereken ${need}` });
  if (wheel && (at.comp || 0) < wheel)
    out.push({ t: "warn", m: `Refakatçi koltuğu tekerlekli sandalye alanından az (${at.comp || 0} < ${wheel})` });
  if (at.obstr) out.push({ t: "info", m: `${at.obstr.toLocaleString("tr-TR")} görüş kısıtlı koltuk` });
  const dups = [...seen].filter(([, n]) => n > 1);
  if (dups.length) out.push({ t: "err",
    m: `${dups.length} yinelenen koltuk kimliği`, d: dups.slice(0, 6).map(([id, n]) => `${id} ×${n}`).join(", ") });
  if (unlabeled) out.push({ t: "err", m: `${unlabeled} etiketsiz koltuk` });

  const noLevel = plan.blocks.filter((b) => !b.level).length;
  if (noLevel) out.push({ t: "warn", m: `${noLevel} blok katsız` });

  const doors = plan.shapes.filter((s) => s.type === "door");
  if (!doors.length) out.push({ t: "warn", m: "Hiç kapı tanımlanmamış" });
  else {
    const orphan = plan.blocks.filter((b) => !gates || !gates.has(b.id));
    if (orphan.length) out.push({ t: "err", m: `${orphan.length} blok hiçbir kapıya bağlı değil`,
      d: orphan.slice(0, 8).map((b) => b.name || b.label).join(", "), ids: orphan.map((b) => b.id) });
    const emptyDoor = doors.filter((d) => !(d.blocks || []).length);
    if (emptyDoor.length) out.push({ t: "warn", m: `${emptyDoor.length} kapıya blok atanmamış`,
      d: emptyDoor.slice(0, 8).map((d) => d.label).join(", ") });
  }

  const lbl = new Map();
  plan.blocks.forEach((b) => lbl.set(b.label, (lbl.get(b.label) || 0) + 1));
  const dupL = [...lbl].filter(([, n]) => n > 1);
  if (dupL.length) {
    const dupLbls = new Set(dupL.map(([l]) => l));
    out.push({ t: "info",
      m: `${dupL.length} blok kimliği birden fazla blokta kullanılmış`,
      d: dupL.slice(0, 6).map(([l, n]) => `${l} ×${n}`).join(", "),
      ids: plan.blocks.filter((b) => dupLbls.has(b.label)).map((b) => b.id) });
  }

  const emptyBlocks = plan.blocks.filter((b, i) => metas[i].m.seatCount === 0);
  if (emptyBlocks.length) out.push({ t: "warn", m: `${emptyBlocks.length} boş blok`,
    ids: emptyBlocks.map((b) => b.id) });

  if (!out.some((o) => o.t === "err" || o.t === "warn"))
    out.push({ t: "ok", m: "Hata veya uyarı yok" });
  return { list: out, total };
}

/* ─────────────────────────  TUTAMAKLAR  ───────────────────────── */

function handlesFor(b, m) {
  if (b.foot && b.foot.length >= 3) {
    const cos = Math.cos(b.rot * RAD), sin = Math.sin(b.rot * RAD);
    return b.foot.map((p, i) => ({ k: `foot:${i}`, ...toWorld(b, p, cos, sin) }));
  }
  const cos = Math.cos(b.rot * RAD), sin = Math.sin(b.rot * RAD);
  const L = (p, k) => ({ k, ...toWorld(b, p, cos, sin) });
  if (b.kind === "grid") {
    const halfW = ((m.P.maxN - 1) / 2) * b.seatGap;
    return [
      L({ x: 0, y: -b.rowGap * 1.4 }, "rot"),
      L({ x: halfW + b.seatGap * 0.9, y: (b.rows - 1) * b.rowGap + b.rowGap * 0.5 }, "size"),
    ];
  }
  if (b.kind === "fan") {
    const span = (b.mode || "span") === "span";
    const am = span ? (b.aStart + b.aEnd) / 2 : b.aCenter;
    const rOut = b.r0 + (b.rows - 1) * b.rowGap;
    const hs = [
      L(polarPt(b.r0 - b.rowGap * 0.75, am), "r0"),
      L(polarPt(rOut + b.rowGap * 0.75, am), "rows"),
    ];
    if (span) {
      hs.push(L(polarPt(rOut, b.aStart), "aStart"));
      hs.push(L(polarPt(rOut, b.aEnd), "aEnd"));
    }
    return hs;
  }
  return [];
}

const HANDLE_HINT = {
  rot: "Döndür", size: "Sıra ve koltuk sayısı", r0: "İlk yarıçap",
  rows: "Sıra sayısı", aStart: "Başlangıç açısı", aEnd: "Bitiş açısı",
};

/* Salt-okunur örnek salonların kaynak (kod) sürümü. Kod değişince bunu
   artır — kullanıcının localStorage'ındaki ESKİ otomatik-kayıt kopyası
   kaynağı gölgelemesin. Yoksa bir kez açılan örnek salon sonsuza dek eski
   halinde takılı kalıyor, koddaki düzeltmeler kullanıcıya hiç ulaşmıyor. */
const SRC_VER = 8;
const BUILTINS = { sureyya: SUREYYA, aylak: AYLAK, harbiye: HARBIYE, gs: GS, ulker: ULKER, zorlu: ZORLU, cso: CSO, akm: AKM, yenikapi: YENIKAPI, empty: EMPTY };
/* Sürüm kapısı yalnızca şablonlara uygulanır; empty ve p-* anahtarları
   kullanıcının kendi işini tutar (örn. empty üstüne kurulan Aspendos), asla
   atılmaz. */
const SAMPLE_KEYS = new Set(["sureyya", "aylak", "harbiye", "gs", "ulker", "zorlu", "cso", "akm", "yenikapi"]);
const stampVer = (obj) => Object.fromEntries(Object.entries(obj).map(([k, v]) => [k, { ...v, srcVer: SRC_VER }]));

/* ─────────────────────────  ANA BİLEŞEN  ───────────────────────── */

export default function PlanEditor() {
  const [venues, setVenues] = useState(stampVer(BUILTINS));
  const [vk, setVk] = useState("gs");
  const plan = venues[vk];

  const [past, setPast] = useState([]);
  const [future, setFuture] = useState([]);
  const [tool, setTool] = useState("select");
  const [selIds, setSelIds] = useState([]);
  const [selShapeId, setSelShapeId] = useState(null);
  const [selSeat, setSelSeat] = useState(null);
  const [selSeats, setSelSeats] = useState(new Set());
  const [view, setView] = useState(GS.home);
  const [levelFilter, setLevelFilter] = useState("*");
  const [draft, setDraft] = useState(null);
  const [marq, setMarq] = useState(null);
  const [poly, setPoly] = useState(null);
  const [calib, setCalib] = useState(null);
  const [report, setReport] = useState(null);
  const [cursor, setCursor] = useState({ x: 0, y: 0 });
  const [snapOn, setSnapOn] = useState(true);
  const [gridStep, setGridStep] = useState(50);
  const [shapeType, setShapeType] = useState("stage");
  const [sport, setSport] = useState("football");
  const [brush, setBrush] = useState("wheel");
  const [lin, setLin] = useState({ count: 6, dx: 1500, dy: 0 });
  const [rad, setRad] = useState({ count: 3, cx: 0, cy: 0, step: -30 });
  const [arrPrev, setArrPrev] = useState(null);
  const [verOpen, setVerOpen] = useState(false);
  const [diff, setDiff] = useState(null);
  const [pubNote, setPubNote] = useState("");
  const [match, setMatch] = useState(null);
  const [rev, setRev] = useState(0);
  const [saveState, setSaveState] = useState("idle");
  const [saved, setSaved] = useState([]);
  const [canvasSize, setCanvasSize] = useState({ w: 1000, h: 700 });
  const [spaceDown, setSpaceDown] = useState(false);
  const [guides, setGuides] = useState([]);
  const [hoverId, setHoverId] = useState("");
  const [setOpen, setSetOpen] = useState(false);
  const [theme, setTheme] = useState("system");
  const [legend, setLegend] = useState(false);
  const [plates, setPlates] = useState(true);
  const [footDraft, setFootDraft] = useState(null);
  const [poiKind, setPoiKind] = useState("wc");
  const [wheelPref, setWheelPref] = useState("auto");
  const [q, setQ] = useState("");
  const [sysDark, setSysDark] = useState(true);
  const [msg, setMsgOk] = useState("");
  const [msgErr, setMsgErr] = useState(false);
  const setMsg = (text) => { setMsgOk(text); setMsgErr(false); };
  const setErr = (text) => { setMsgOk(text); setMsgErr(true); };

  const svgRef = useRef(null);
  const drag = useRef(null);
  const seatCache = useRef(new Map());
  const pointers = useRef(new Map());
  const pinch = useRef(null);

  const setPlan = useCallback((p) => setVenues((v) => ({ ...v, [vk]: p })), [vk]);
  const commit = useCallback((next) => {
    setPast((p) => [...p.slice(-39), plan]); setFuture([]); setPlan(next);
    setRev((r) => r + 1);
  }, [plan, setPlan]);
  /** commit()'in sürükleme-bitti sürümü: plan zaten onMove sırasında
   *  güncellendi, tek eksik checkpoint (geri-al + otomatik kayıt) — bunu
   *  tek yerden yapar ki her sürükleme modu (move/moveShape/seat/handle/
   *  paint) ayrı ayrı unutmasın. Gerçekten değişiklik yoksa (salt tıklama)
   *  no-op — geri-al/kayıt boş yere kirlenmesin. */
  const finalizeDrag = useCallback((snapshot) => {
    if (plan === snapshot) return;
    setPast((p) => [...p.slice(-39), snapshot]); setFuture([]); setRev((r) => r + 1);
  }, [plan]);
  /* Sıra/açı/koltuk-aralığı gibi alanlar sıra başına koltuk sayısını
     değiştirebilir; var olan koltuk düzeltmeleri/nitelikleri "r,c" anahtarıyla
     saklandığından, artık var olmayan bir sütuna işaret eden kayıtlar sessizce
     ölü veri olarak kalıyordu (bkz. Aspendos denemesi). Geometri gerçekten
     değişmeden önce kaç tanesinin geçersiz kalacağını uyar. */
  const GEOM_KEYS = ["rows", "counts", "r0", "rowGap", "aStart", "aEnd", "seatGap", "cols", "taper", "mode"];
  const patchBlock = (id, patch) => {
    const b = plan.blocks.find((x) => x.id === id);
    if (b?.ov && Object.keys(b.ov).length && GEOM_KEYS.some((k) => k in patch)) {
      const newCounts = prep({ ...b, ...patch }).counts;
      const orphaned = Object.keys(b.ov).filter((k) => {
        const [r, c] = k.split(",").map(Number);
        return r >= newCounts.length || c >= (newCounts[r] || 0);
      });
      if (orphaned.length) setErr(`${orphaned.length} koltuk düzeltmesi/niteliği artık geçersiz aralıkta kaldı`);
    }
    commit({ ...plan, blocks: plan.blocks.map((x) => (x.id === id ? { ...x, ...patch } : x)) });
  };
  const patchSelected = (patch) =>
    commit({ ...plan, blocks: plan.blocks.map((b) => (selIds.includes(b.id) ? { ...b, ...patch } : b)) });
  const patchShape = (id, patch) =>
    commit({ ...plan, shapes: plan.shapes.map((s) => (s.id === id ? { ...s, ...patch } : s)) });
  const undo = () => setPast((p) => {
    if (!p.length) return p;
    setFuture((f) => [plan, ...f]); setPlan(p[p.length - 1]); return p.slice(0, -1);
  });
  const redo = () => setFuture((f) => {
    if (!f.length) return f;
    setPast((p) => [...p, plan]); setPlan(f[0]); return f.slice(1);
  });
  const switchVenue = (k) => {
    setVk(k); setPast([]); setFuture([]); setSelIds([]); setSelShapeId(null);
    setSelSeat(null); setSelSeats(new Set()); setLevelFilter("*"); setView(venues[k].home);
    setReport(null); setCalib(null); setMatch(null);
  };

  const metas = useMemo(() => plan.blocks.map((b) => ({ b, m: buildMeta(b) })), [plan.blocks]);
  const metaById = useMemo(() => new Map(metas.map((x) => [x.b.id, x.m])), [metas]);
  const totalSeats = useMemo(() => metas.reduce((a, x) => a + x.m.seatCount, 0), [metas]);
  const levels = useMemo(() => {
    const s = [];
    plan.blocks.forEach((b) => { if (b.level && !s.includes(b.level)) s.push(b.level); });
    return s;
  }, [plan.blocks]);
  const levelCounts = useMemo(() => {
    const m = {};
    metas.forEach(({ b, m: mm }) => { m[b.level || "—"] = (m[b.level || "—"] || 0) + mm.seatCount; });
    return m;
  }, [metas]);

  const shown = useMemo(() => {
    const pad = view.w * 0.08;
    const vx0 = view.x - pad, vx1 = view.x + view.w + pad;
    const vy0 = view.y - pad, vy1 = view.y + view.h + pad;
    return metas.filter(({ b, m }) =>
      (levelFilter === "*" || (b.level || "") === levelFilter) &&
      m.bbox.x1 > vx0 && m.bbox.x0 < vx1 && m.bbox.y1 > vy0 && m.bbox.y0 < vy1);
  }, [metas, view, levelFilter]);
  /* Sadece kesişen değil, GERÇEKTEN görünen koltuk sayısı: yelpaze gibi
     büyük bloklarda ekranın köşesine değen tek bir blok bile tüm koltuk
     sayısını eklerse, o blok tek başına koltuk moduna geçişi bloklardı —
     salonun tamamına yakınlaştırılmış gibi davranırdı, oysa asıl görünen
     alan küçücüktü. Kesişim alanının bloğa oranı kadar say. */
  const shownSeats = useMemo(() => {
    const pad = view.w * 0.08;
    const vx0 = view.x - pad, vx1 = view.x + view.w + pad;
    const vy0 = view.y - pad, vy1 = view.y + view.h + pad;
    return shown.reduce((a, { m }) => {
      const ox = Math.max(0, Math.min(m.bbox.x1, vx1) - Math.max(m.bbox.x0, vx0));
      const oy = Math.max(0, Math.min(m.bbox.y1, vy1) - Math.max(m.bbox.y0, vy0));
      const areaB = (m.bbox.x1 - m.bbox.x0) * (m.bbox.y1 - m.bbox.y0);
      return a + m.seatCount * (areaB > 0 ? (ox * oy) / areaB : 1);
    }, 0);
  }, [shown, view]);
  const seatMode = shownSeats <= SEAT_BUDGET;

  /* Bir kat filtrelendiğinde diğer katlar tamamen kaybolmasın — koltuk
     sayısına değil, sadece dış hatta bakan soluk bir "gölge" olarak
     yerinde kalsın. Kullanıcı hangi katta olduğunu değil, o katın
     bina içindeki konumunu da görsün. Seçilemez/tıklanamaz: marquee
     seçimi ve diğer tüm etkileşimler zaten levelFilter'a göre süzülüyor. */
  const dimmedBlocks = useMemo(() => {
    if (levelFilter === "*") return [];
    const pad = view.w * 0.08;
    const vx0 = view.x - pad, vx1 = view.x + view.w + pad;
    const vy0 = view.y - pad, vy1 = view.y + view.h + pad;
    return metas.filter(({ b, m }) => (b.level || "") !== levelFilter &&
      m.bbox.x1 > vx0 && m.bbox.x0 < vx1 && m.bbox.y1 > vy0 && m.bbox.y0 < vy1);
  }, [metas, view, levelFilter]);

  const drawn = useMemo(() => {
    if (!seatMode) return [];
    return shown.map(({ b, m }) => {
      let hit = seatCache.current.get(b);
      if (!hit) { hit = buildSeats(b, m, plan.idTemplate); seatCache.current.set(b, hit); }
      if (seatCache.current.size > 300) seatCache.current.clear();
      return { b, m, ...hit };
    });
  }, [shown, seatMode]);

  const selSeatInfo = useMemo(() => {
    if (!selSeat) return null;
    const hit = drawn.find((d) => d.b.id === selSeat.bid);
    return hit ? hit.seats.find((x) => x.r === selSeat.r && x.c === selSeat.c) : null;
  }, [selSeat, drawn]);

  const selBlocks = useMemo(() => plan.blocks.filter((b) => selIds.includes(b.id)), [plan.blocks, selIds]);
  const selBlock = selBlocks.length === 1 ? selBlocks[0] : null;
  const selShape = plan.shapes.find((s) => s.id === selShapeId) || null;
  const handles = useMemo(() => {
    if (!selBlock || tool !== "select") return [];
    const m = metaById.get(selBlock.id);
    return m ? handlesFor(selBlock, m) : [];
  }, [selBlock, metaById, tool]);

  const ghosts = useMemo(() => {
    if (!arrPrev || !selBlocks.length) return [];
    const made = arrayPreview(selBlocks, arrPrev, arrPrev === "lin" ? lin : rad);
    return made.map((b) => buildMeta(b).outline);
  }, [arrPrev, selBlocks, lin, rad]);

  /* Blok rengi yoksa kat sırasına göre otomatik — sadece görünüm. */
  const cc = useCallback((b) => b.color || LEVEL_COLORS[
    Math.max(0, levels.indexOf(b.level || "")) % LEVEL_COLORS.length], [levels]);
  const gates = useMemo(() => gateMap(plan), [plan.shapes]);

  /* Sınır taşması canlı izleniyor: blok dış hattının bir noktası bile
     duvarın dışındaysa blok işaretlenir. Kesin koltuk sayısı Doğrula'da. */
  const bounds = useMemo(() => boundaryPolys(plan), [plan.shapes]);
  const breach = useMemo(() => {
    if (!bounds.length) return [];
    return metas.filter(({ m }) => m.outline.some((p) => !inBounds(p.x, p.y, bounds)))
      .map(({ b }) => b.id);
  }, [metas, bounds]);
  const breachSet = useMemo(() => new Set(breach), [breach]);

  const attrTotals = useMemo(() => {
    const t = {};
    metas.forEach(({ m }) => Object.entries(m.attrs || {})
      .forEach(([k, v]) => { t[k] = (t[k] || 0) + v; }));
    return t;
  }, [metas]);

  const toWorldPt = useCallback((cx, cy) => {
    const r = svgRef.current.getBoundingClientRect();
    const s = Math.min(r.width / view.w, r.height / view.h);
    return {
      x: view.x + (cx - r.left - (r.width - view.w * s) / 2) / s,
      y: view.y + (cy - r.top - (r.height - view.h * s) / 2) / s,
    };
  }, [view]);
  const snap = useCallback((p) => snapOn
    ? { x: Math.round(p.x / gridStep) * gridStep, y: Math.round(p.y / gridStep) * gridStep }
    : p, [snapOn, gridStep]);

  /* ── görünüm: zoom, pan, ölçek ────────────────────────────────── */
  const MINW = 200, MAXW = 90000;

  /** Ekrandaki bir noktayı sabit tutarak yakınlaştırır/uzaklaştırır. */
  const zoomAt = useCallback((cx, cy, k) => {
    setView((v) => {
      const r = svgRef.current.getBoundingClientRect();
      const s = Math.min(r.width / v.w, r.height / v.h);
      const wx = v.x + (cx - r.left - (r.width - v.w * s) / 2) / s;
      const wy = v.y + (cy - r.top - (r.height - v.h * s) / 2) / s;
      const nw = Math.min(MAXW, Math.max(MINW, v.w * k)), f = nw / v.w;
      return { x: wx - (wx - v.x) * f, y: wy - (wy - v.y) * f, w: nw, h: v.h * f };
    });
  }, []);
  const zoomCenter = (k) => {
    const r = svgRef.current?.getBoundingClientRect();
    if (r) zoomAt(r.left + r.width / 2, r.top + r.height / 2, k);
  };

  useEffect(() => {
    const el = svgRef.current;
    if (!el || typeof ResizeObserver === "undefined") return;
    const ro = new ResizeObserver(([e]) => {
      const r = e.contentRect;
      setCanvasSize({ w: r.width, h: r.height });
    });
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  /* ekrandaki 1 cm kaç piksel — ölçek çubuğu ve tutamak boyu için */
  const pxPerCm = Math.min(canvasSize.w / view.w, canvasSize.h / view.h);
  /* Koltuk numarası ancak koltuk ekranda okunacak kadar büyükse yazılır.
     Sabit bir zoom eşiği yerine gerçek piksel boyu ölçülüyor. */
  const seatNums = pxPerCm * DEF.seatW > 16;
  /* U = bir ekran pikselinin dünya karşılığı. Koltuk ve masa fiziksel
     nesne, santimetreyle çizilir. Etiket, rozet, işaret ise anotasyondur;
     ekranda sabit boyda durmalı. Stadyumda doğru görünen 6 metrelik yazı
     12 metrelik barda ekranı kaplıyordu — hata buradaydı. */
  const U = 1 / (pxPerCm || 0.01);
  const scaleBar = useMemo(() => {
    const steps = [10, 25, 50, 100, 200, 500, 1000, 2000, 5000, 10000, 20000, 50000];
    let best = steps[0];
    steps.forEach((v) => { if (Math.abs(v * pxPerCm - 110) < Math.abs(best * pxPerCm - 110)) best = v; });
    return { cm: best, px: best * pxPerCm,
      label: best >= 100 ? `${(best / 100).toLocaleString("tr-TR")} m` : `${best} cm` };
  }, [pxPerCm]);

  /* aspect: hedef yükseklik/genişlik oranı. view'in eski oranı yerine
     canvas'ın gerçek piksel oranını kullanır — pencere yeniden
     boyutlandığında view hemen düzelmez, eski oranla sığdırmak
     gereksiz boşluk (letterbox) bırakırdı. */
  const fitBBoxRect = (items, aspect) => {
    const x0 = Math.min(...items.map((m) => m.bbox.x0)), x1 = Math.max(...items.map((m) => m.bbox.x1));
    const y0 = Math.min(...items.map((m) => m.bbox.y0)), y1 = Math.max(...items.map((m) => m.bbox.y1));
    const pad = Math.max(x1 - x0, y1 - y0) * 0.12 + 100;
    const w = Math.max(MINW, (x1 - x0) + 2 * pad);
    const h = w * aspect;
    const need = ((y1 - y0) + 2 * pad) / h;
    const W = need > 1 ? w * need : w;
    return { x: (x0 + x1) / 2 - W / 2, y: (y0 + y1) / 2 - (W * aspect) / 2, w: W, h: W * aspect };
  };
  const zoomToBBox = (items) => {
    if (!items.length) return;
    setView(fitBBoxRect(items, canvasSize.h / canvasSize.w));
  };
  const zoomToSelection = () => zoomToBBox(selIds.length
    ? selIds.map((id) => metaById.get(id)).filter(Boolean)
    : metas.map((x) => x.m));
  /* Sığdır: plan.home sabit bir değer — bir oturumda büyüyen bloklar onun
     dışına taştığında sessizce ekran dışında kalıyordu. Gerçek içerik
     sınırını hesapla; plan boşsa (Yeni plan) home'a düş. */
  const zoomToAll = () => (metas.length ? zoomToBBox(metas.map((x) => x.m)) : setView(plan.home));
  /* Zum yüzdesi: mutlak bir px/cm oranı salon ölçeğine göre anlamsız
     olurdu (47 koltukluk bar ile 50.000 koltukluk stadyum aynı fiziksel
     birimi paylaşmıyor). %100 = Sığdır'ın ürettiği görünüm — Sığdır'a
     basınca bu yüzden her zaman tam %100 görünür. */
  const homeRect = metas.length
    ? fitBBoxRect(metas.map((x) => x.m), canvasSize.h / canvasSize.w)
    : plan.home;
  const homePxPerCm = Math.min(canvasSize.w / homeRect.w, canvasSize.h / homeRect.h);
  const zoomPct = Math.round((pxPerCm / homePxPerCm) * 100) || 100;

  const zoomTo = (m) => {
    const w = Math.max(900, (m.bbox.x1 - m.bbox.x0) * 1.6);
    const h = (w * view.h) / view.w;
    setView({ x: m.cx - w / 2, y: m.cy - h / 2, w, h });
  };

  const doLinear = () => {
    if (!selBlocks.length) return;
    const made = linearArray(selBlocks, lin);
    commit({ ...plan, blocks: [...plan.blocks, ...made] });
    setSelIds([...selIds, ...made.map((b) => b.id)]);
    setArrPrev(null);
    setMsg(`${made.length} blok üretildi`);
  };
  const doRadial = () => {
    if (!selBlocks.length) return;
    const made = radialArray(selBlocks, rad);
    commit({ ...plan, blocks: [...plan.blocks, ...made] });
    setSelIds([...selIds, ...made.map((b) => b.id)]);
    setArrPrev(null);
    setMsg(`${made.length} blok üretildi`);
  };
  const doRenumber = ({ start, cx, cy, from, cw, prefix }) => {
    if (!selBlocks.length) return;
    const sorted = selBlocks.map((b) => {
      const m = metaById.get(b.id);
      const a = Math.atan2(m.cy - cy, m.cx - cx) / RAD;
      return { b, rel: ((a - from) * (cw ? 1 : -1) + 3600) % 360 };
    }).sort((p, q) => p.rel - q.rel);
    const map = new Map();
    sorted.forEach(({ b }, i) => map.set(b.id, `${prefix}${start + i}`));
    commit({ ...plan, blocks: plan.blocks.map((b) => map.has(b.id) ? reLabel(b, map.get(b.id)) : b) });
    setMsg(`${sorted.length} blok yeniden numaralandı`);
  };
  const runValidate = () => {
    setMsg("doğrulanıyor…");
    setTimeout(() => { setReport(validate(plan, metas, gates)); setMsg(""); }, 10);
  };
  /* Doğrula rozeti son çalıştırmadan kalır — her düzenlemede yeniden
     hesaplamak büyük salonlarda (bkz. yukarıdaki 10ms'lik yield) fark
     edilir bir gecikme yaratırdı. "Son kontrolde şu vardı" göstermek,
     hiç göstermemekten iyi; tam canlı takip istenirse plan'a bağlı bir
     useMemo'ya çevrilebilir. */
  const reportErrN = report ? report.list.filter((x) => x.t === "err").length : 0;
  const reportWarnN = report ? report.list.filter((x) => x.t === "warn").length : 0;

  /* ── sürümleme ─────────────────────────────────────────────── */
  const versions = plan.versions || [];
  const published = versions.find((v) => v.v === plan.published) || null;
  const dirty = useMemo(
    () => (published ? planFingerprint(published.snapshot) !== planFingerprint(plan) : versions.length === 0),
    [published, plan, versions.length]);

  const doPublish = () => {
    const v = (versions.reduce((a, x) => Math.max(a, x.v), 0) || 0) + 1;
    const snapshot = JSON.parse(JSON.stringify(stripUnderlay(
      { ...plan, versions: undefined, published: undefined })));
    const entry = { v, at: new Date().toISOString(), note: pubNote.trim() || `Sürüm ${v}`,
      seats: totalSeats };
    entry.snapshot = snapshot;
    commit({ ...plan, versions: [...versions, entry], published: v });
    setPubNote(""); setDiff(null);
    setMsg(`v${v} yayınlandı`);
  };
  const doRestore = (entry) => {
    commit({ ...plan, ...entry.snapshot, versions, published: plan.published });
    setSelIds([]); setSelShapeId(null); setDiff(null);
    setMsg(`v${entry.v} taslağa geri yüklendi`);
  };
  const doDiff = (entry) => {
    setMsg("fark hesaplanıyor…");
    setTimeout(() => {
      setDiff({ v: entry.v, ...diffPlans(entry.snapshot, plan) });
      setMsg("");
    }, 10);
  };
  /* ── kalıcılık: açılışta yükle, düzenledikçe otomatik kaydet ──── */
  useEffect(() => {
    let dead = false;
    (async () => {
      const keys = await Store.list();
      if (dead || !keys.length) { setSaved(keys); return; }
      const loaded = {};
      for (const k of keys) {
        const p = await Store.load(k);
        if (!p?.blocks) continue;
        /* Şablonun kaynak sürümü değiştiyse eski kayıtlı kopyayı yükleme —
           koddaki düzeltme kazansın. Kullanıcı planlarına (empty, p-*)
           dokunulmaz. */
        if (SAMPLE_KEYS.has(k) && p.srcVer !== SRC_VER) continue;
        loaded[k] = absorbIds(p);
      }
      if (!dead && Object.keys(loaded).length) {
        setVenues((v) => ({ ...v, ...loaded }));
        setSaved(keys);
        setMsg(`${Object.keys(loaded).length} kayıtlı plan yüklendi`);
      }
    })();
    return () => { dead = true; };
  }, []);

  useEffect(() => {
    if (!rev) return;
    setSaveState("saving");
    const t = setTimeout(async () => {
      const ok = await Store.save(vk, plan);
      setSaveState(ok ? "saved" : "error");
      setSaved((s) => (s.includes(vk) ? s : [...s, vk]));
    }, 1000);
    return () => clearTimeout(t);
  }, [rev, plan, vk]);

  const newPlan = () => {
    const k = `p${Date.now().toString(36)}`;
    const p = { ...EMPTY, key: k, name: "Yeni plan", blocks: [], shapes: [], versions: [], published: null };
    setVenues((v) => ({ ...v, [k]: p }));
    switchVenue2(k, p);
    setRev((r) => r + 1);
  };
  const duplicatePlan = () => {
    const k = `p${Date.now().toString(36)}`;
    const copy = JSON.parse(JSON.stringify({ ...plan, underlay: null }));
    copy.key = k;
    copy.name = `${plan.name} (kopya)`;
    copy.blocks = copy.blocks.map((b) => ({ ...b, id: nid() }));
    const idm = new Map(plan.blocks.map((b, i) => [b.id, copy.blocks[i].id]));
    copy.shapes = copy.shapes.map((s) => ({ ...s, id: nid("s"),
      blocks: (s.blocks || []).map((x) => idm.get(x)).filter(Boolean) }));
    copy.versions = []; copy.published = null;
    setVenues((v) => ({ ...v, [k]: copy }));
    switchVenue2(k, copy);
    setRev((r) => r + 1);
  };
  const deletePlan = async (k) => {
    await Store.remove(k);
    setSaved((s) => s.filter((x) => x !== k));
    setVenues((v) => { const n = { ...v }; delete n[k]; return n; });
    if (k === vk) {
      const first = Object.keys(venues).find((x) => x !== k) || "empty";
      switchVenue(first);
    }
    setMsg("Plan silindi");
  };
  const switchVenue2 = (k, p) => {
    setVk(k); setPast([]); setFuture([]); setSelIds([]); setSelShapeId(null);
    setSelSeat(null); setSelSeats(new Set()); setLevelFilter("*"); setView(p.home);
    setReport(null); setMatch(null);
  };

  const exportSVG = () => {
    const svg = svgRef.current.cloneNode(true);
    svg.querySelectorAll(".hnd, .marq, .draft, .ghost, .cal, .mtxt").forEach((n) => n.remove());
    const NS = "http://www.w3.org/2000/svg";
    const bg = document.createElementNS(NS, "rect");
    bg.setAttribute("x", view.x); bg.setAttribute("y", view.y);
    bg.setAttribute("width", view.w); bg.setAttribute("height", view.h);
    bg.setAttribute("fill", dark ? "#0C0D13" : "#E9E6DF");
    svg.insertBefore(bg, svg.firstChild);
    const st = document.createElementNS(NS, "style");
    st.textContent = CSS;
    svg.insertBefore(st, svg.firstChild);
    svg.setAttribute("class", dark ? "ed dark" : "ed light");
    svg.setAttribute("width", 1800);
    svg.setAttribute("height", Math.round((1800 * view.h) / view.w));
    const blob = new Blob(['<?xml version="1.0" encoding="UTF-8"?>\n' + svg.outerHTML],
      { type: "image/svg+xml;charset=utf-8" });
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob); a.download = `${plan.key}-plan.svg`; a.click();
    URL.revokeObjectURL(a.href);
    setMsg("SVG indirildi");
  };

  /* ── hizala / eşit dağıt ──────────────────────────────────────── */

  const alignSel = (mode) => {
    const it = selBlocks.map((b) => ({ b, m: metaById.get(b.id) })).filter((x) => x.m);
    if (it.length < 2) return;
    const all = it.map((x) => x.m.bbox);
    const X0 = Math.min(...all.map((b) => b.x0)), X1 = Math.max(...all.map((b) => b.x1));
    const Y0 = Math.min(...all.map((b) => b.y0)), Y1 = Math.max(...all.map((b) => b.y1));
    const d = new Map();
    it.forEach(({ b, m }) => {
      const bb = m.bbox;
      if (mode === "l") d.set(b.id, [X0 - bb.x0, 0]);
      if (mode === "r") d.set(b.id, [X1 - bb.x1, 0]);
      if (mode === "cx") d.set(b.id, [(X0 + X1) / 2 - (bb.x0 + bb.x1) / 2, 0]);
      if (mode === "t") d.set(b.id, [0, Y0 - bb.y0]);
      if (mode === "b") d.set(b.id, [0, Y1 - bb.y1]);
      if (mode === "cy") d.set(b.id, [0, (Y0 + Y1) / 2 - (bb.y0 + bb.y1) / 2]);
    });
    commit({ ...plan, blocks: plan.blocks.map((b) => {
      const v = d.get(b.id);
      return v ? { ...b, x: Math.round(b.x + v[0]), y: Math.round(b.y + v[1]) } : b;
    }) });
    setMsg("Hizalandı");
  };

  /** Uç iki blok sabit kalır, aradakilerin merkezleri eşit aralıklanır. */
  const distributeSel = (axis) => {
    const it = selBlocks.map((b) => ({ b, m: metaById.get(b.id) })).filter((x) => x.m);
    if (it.length < 3) { setMsg("Eşit dağıtmak için en az 3 blok gerekir"); return; }
    const key = axis === "x" ? "cx" : "cy";
    it.sort((a, z) => a.m[key] - z.m[key]);
    const first = it[0].m[key], last = it[it.length - 1].m[key];
    const step = (last - first) / (it.length - 1);
    const d = new Map();
    it.forEach(({ b, m }, i) => {
      if (i === 0 || i === it.length - 1) return;
      d.set(b.id, first + step * i - m[key]);
    });
    commit({ ...plan, blocks: plan.blocks.map((b) => {
      const v = d.get(b.id);
      if (v == null) return b;
      return axis === "x" ? { ...b, x: Math.round(b.x + v) } : { ...b, y: Math.round(b.y + v) };
    }) });
    setMsg("Eşit dağıtıldı");
  };

  /* ── seçili koltuklara toplu işlem ────────────────────────────── */
  const seatOps = (fn) => {
    if (!selSeats.size) return;
    const byB = new Map();
    selSeats.forEach((k) => {
      const [bid, rc] = k.split("|");
      if (!byB.has(bid)) byB.set(bid, []);
      byB.get(bid).push(rc);
    });
    commit({ ...plan, blocks: plan.blocks.map((b) => {
      const list = byB.get(b.id);
      if (!list) return b;
      const ov = { ...b.ov };
      list.forEach((rc) => {
        const next = fn({ ...(ov[rc] || {}) });
        if (next && Object.keys(next).length) ov[rc] = next; else delete ov[rc];
      });
      return { ...b, ov };
    }) });
  };

  /* ── ok tuşlarıyla ince taşıma ────────────────────────────────── */
  const lastNudge = useRef(0);
  const nudge = (dx, dy) => {
    const fresh = Date.now() - lastNudge.current > 800;
    lastNudge.current = Date.now();
    const push = (next) => { if (fresh) setPast((p) => [...p.slice(-39), plan]); setPlan(next); setRev((r) => r + 1); };
    if (selSeats.size) {
      const byB = new Map();
      selSeats.forEach((k) => { const [bid, rc] = k.split("|");
        if (!byB.has(bid)) byB.set(bid, []); byB.get(bid).push(rc); });
      push({ ...plan, blocks: plan.blocks.map((b) => {
        const list = byB.get(b.id);
        if (!list) return b;
        const a = -b.rot * RAD;
        const lx = dx * Math.cos(a) - dy * Math.sin(a), ly = dx * Math.sin(a) + dy * Math.cos(a);
        const ov = { ...b.ov };
        list.forEach((rc) => { const o = ov[rc] || {};
          ov[rc] = { ...o, dx: Math.round((o.dx || 0) + lx), dy: Math.round((o.dy || 0) + ly) }; });
        return { ...b, ov };
      }) });
      return;
    }
    if (selIds.length) {
      push({ ...plan, blocks: plan.blocks.map((b) =>
        selIds.includes(b.id) ? { ...b, x: b.x + dx, y: b.y + dy } : b) });
      return;
    }
    if (selShapeId) {
      push({ ...plan, shapes: plan.shapes.map((s) =>
        s.id === selShapeId ? { ...s, x: s.x + dx, y: s.y + dy } : s) });
    }
  };

  /* ── blok tabanını elle çizme ─────────────────────────────────
     Koltuklardan türetilen taban sütunu, merdiven boşluğunu, düzensiz
     kenarı bilemez. Bunlar ancak elle çizilir. */
  const footStart = () => { if (!selBlock) return; setFootDraft([]); setTool("foot"); };
  const footFinish = () => {
    if (!selBlock || !footDraft || footDraft.length < 3) { setFootDraft(null); setTool("select"); return; }
    patchBlock(selBlock.id, { foot: footDraft.map((p) => toLocal(selBlock, p)) });
    setFootDraft(null); setTool("select");
    setMsg(`${footDraft.length} noktalı taban çizildi`);
  };
  const footSeed = () => {
    if (!selBlock) return;
    const m = metaById.get(selBlock.id);
    if (!m) return;
    patchBlock(selBlock.id, { foot: m.auto.map((p) => toLocal(selBlock, p)) });
    setMsg("Otomatik taban düzenlenebilir hale getirildi");
  };
  const footClear = () => { if (selBlock) patchBlock(selBlock.id, { foot: null }); };

  const doAutoGates = () => {
    const shapes = autoGates(plan, metas);
    commit({ ...plan, shapes });
    setMsg("Bloklar en yakın kapıya atandı");
  };

  /* ── mevcut koltuk listesini içe aktar ve eşleştir ────────────── */
  const importCSV = (e) => {
    const f = e.target.files?.[0];
    e.target.value = "";
    if (!f) return;
    const rd = new FileReader();
    rd.onload = () => {
      try {
        const rows = parseCSV(rd.result);
        if (rows.length < 2) throw new Error("satır yok");
        const cols = mapColumns(rows[0]);
        if (cols.id == null) throw new Error("kimlik sütunu bulunamadı (id / kimlik / kod)");
        if (cols.block == null || cols.row == null || cols.seat == null)
          throw new Error("blok / sıra / koltuk sütunları eksik");

        /* çizimdeki koltukları anahtara göre indeksle */
        const drawnMap = new Map();
        metas.forEach(({ b, m }) => buildSeats(b, m, plan.idTemplate).seats.forEach((s) => {
          if (!s.gap) drawnMap.set(seatKey(s.block, s.row, s.num), { s, bid: b.id });
        }));

        const hits = [], missing = [], dupes = [];
        const usedKeys = new Set();
        rows.slice(1).forEach((r) => {
          const key = seatKey(r[cols.block], r[cols.row], r[cols.seat]);
          const id = r[cols.id];
          if (!id) return;
          if (usedKeys.has(key)) { dupes.push(key); return; }
          const hit = drawnMap.get(key);
          if (hit) { usedKeys.add(key); hits.push({ ...hit, csvId: id, key }); }
          else missing.push({ key, id });
        });
        const extra = [...drawnMap.entries()].filter(([k]) => !usedKeys.has(k)).map(([, v]) => v.s);
        const changing = hits.filter((h) => h.csvId !== h.s.id);

        setMatch({ file: f.name, cols: Object.keys(cols), total: rows.length - 1,
          hits, missing, extra, dupes, changing });
        setVerOpen(false); setReport(null);
        setMsg(`${hits.length} koltuk eşleşti`);
      } catch (err) {
        console.error("CSV içe aktarma hatası:", err);
        const detail = (err instanceof TypeError || err instanceof RangeError)
          ? "dosya beklenen CSV biçiminde değil" : err.message;
        setErr(`CSV okunamadı: ${detail}`);
      }
    };
    rd.readAsText(f, "utf-8");
  };

  /** Eşleşen koltuklara listedeki kimliği yazar — çizim değil, kimlik uyarlanır. */
  const adoptIds = () => {
    if (!match) return;
    const byBlock = new Map();
    match.changing.forEach(({ bid, s, csvId }) => {
      if (!byBlock.has(bid)) byBlock.set(bid, {});
      byBlock.get(bid)[`${s.r},${s.c}`] = csvId;
    });
    commit({ ...plan, blocks: plan.blocks.map((b) => {
      const patch = byBlock.get(b.id);
      if (!patch) return b;
      const ov = { ...b.ov };
      Object.entries(patch).forEach(([k, id]) => { ov[k] = { ...(ov[k] || {}), id }; });
      return { ...b, ov };
    }) });
    setMsg(`${match.changing.length} koltuk kimliği benimsendi`);
    setMatch({ ...match, changing: [] });
  };

  const exportCSV = () => {
    const lines = ["id;kat;blok;sira;koltuk"];
    metas.forEach(({ b, m }) => buildSeats(b, m, plan.idTemplate).seats.forEach((s) => {
      if (!s.gap) lines.push([s.id, s.level, s.block, s.row, s.num].join(";"));
    }));
    const blob = new Blob(["\uFEFF" + lines.join("\n")], { type: "text/csv;charset=utf-8" });
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob); a.download = `${plan.key}-seats.csv`; a.click();
    URL.revokeObjectURL(a.href);
    setMsg("CSV indirildi");
  };

  /* ── pointer ──────────────────────────────────────────────────── */
  const onDown = (e) => {
    const raw = toWorldPt(e.clientX, e.clientY);
    const p = snap(raw);
    /* boyarken yakalama yapmıyoruz — sürüklerken altındaki koltuğu görmek gerek */
    if (tool !== "attr") e.currentTarget.setPointerCapture(e.pointerId);
    const t = e.target?.dataset;

    /* iki parmak → pinch ile yakınlaştır */
    pointers.current.set(e.pointerId, { x: e.clientX, y: e.clientY });
    if (pointers.current.size === 2) {
      const [a, b] = [...pointers.current.values()];
      pinch.current = { d: Math.hypot(a.x - b.x, a.y - b.y) };
      drag.current = null; setMarq(null); setDraft(null);
      return;
    }

    /* pan: Kaydır aracı · boşluk tuşu · orta tuş · sağ tuş · Shift */
    if (tool === "pan" || spaceDown || e.button === 1 || e.button === 2 ||
        (e.shiftKey && !t?.b && !t?.h)) {
      drag.current = { mode: "pan", sx: e.clientX, sy: e.clientY, view };
      return;
    }

    if (tool === "attr") {
      if (t?.b && t.r != null) { drag.current = { mode: "paint", snapshot: plan };
        paintSeat(t.b, +t.r, +t.c); }
      else { drag.current = { mode: "seatMarq", paint: true };
        setMarq({ x0: raw.x, y0: raw.y, x1: raw.x, y1: raw.y }); }
      return;
    }
    if (t?.h && selBlock) {
      drag.current = { mode: "handle", h: t.h, b: selBlock, snapshot: plan,
        startAng: Math.atan2(raw.y - selBlock.y, raw.x - selBlock.x) / RAD };
      return;
    }
    if (tool === "table") {
      const nb = newTable(p.x, p.y);
      nb.label = `M${plan.blocks.filter((b) => b.kind === "table").length + 1}`;
      nb.level = levelFilter === "*" ? (levels[0] || "") : levelFilter;
      nb.name = nb.label;
      commit({ ...plan, blocks: [...plan.blocks, nb] });
      setSelIds([nb.id]); setSelShapeId(null);
      return;
    }
    if (tool === "poi") {
      const sh = { id: nid("s"), kind: "icon", type: "icon", icon: poiKind,
        x: p.x, y: p.y, rot: 0, size: 34, w: 200, h: 200,
        label: POI[poiKind].label, capacity: 0, fs: 100, blocks: [] };
      commit({ ...plan, shapes: [...plan.shapes, sh] });
      setSelShapeId(sh.id); setSelIds([]);
      return;
    }
    if (tool === "foot") { setFootDraft((q) => [...(q || []), p]); return; }
    if (tool === "poly") { setPoly((q) => (q ? { ...q, pts: [...q.pts, p] } : { pts: [p] })); return; }
    if (tool === "seatAdd") {
      const b = selBlock?.kind === "free" ? selBlock : null;
      if (b) patchBlock(b.id, { pts: [...b.pts, { x: p.x - b.x, y: p.y - b.y, rot: 0 }] });
      else {
        const nb = newFree(p.x, p.y);
        nb.pts = [{ x: 0, y: 0, rot: 0 }];
        nb.label = `S${plan.blocks.length + 1}`;
        commit({ ...plan, blocks: [...plan.blocks, nb] });
        setSelIds([nb.id]);
      }
      return;
    }
    if (tool === "seat") {
      if (t?.b && t.r != null) {
        setSelSeat({ bid: t.b, r: +t.r, c: +t.c });
        setSelSeats(new Set([`${t.b}|${t.r},${t.c}`]));
        setSelIds([t.b]);
        const b = plan.blocks.find((x) => x.id === t.b);
        drag.current = { mode: "seat", bid: t.b, r: +t.r, c: +t.c, p: raw, ov: b.ov, blockRot: b.rot, snapshot: plan };
      } else {
        setSelSeat(null); setSelSeats(new Set());
        drag.current = { mode: "seatMarq", paint: false, add: e.shiftKey, base: selSeats };
        setMarq({ x0: raw.x, y0: raw.y, x1: raw.x, y1: raw.y });
      }
      return;
    }
    if (tool === "select") {
      if (t?.b) {
        setSelShapeId(null); setSelSeat(null);
        const next = e.shiftKey
          ? (selIds.includes(t.b) ? selIds.filter((i) => i !== t.b) : [...selIds, t.b])
          : (selIds.includes(t.b) ? selIds : [t.b]);
        setSelIds(next);
        drag.current = { mode: "move", ids: next, p: raw, snapshot: plan,
          ...alignSetup(next, metas, metaById, plan.shapes) };
      } else if (t?.s) {
        setSelIds([]); setSelShapeId(t.s); setSelSeat(null);
        drag.current = { mode: "moveShape", id: t.s, p: raw, snapshot: plan };
      } else {
        if (!e.shiftKey) { setSelIds([]); setSelShapeId(null); setSelSeat(null); }
        drag.current = { mode: "marq", p: raw, add: e.shiftKey, base: selIds };
        setMarq({ x0: raw.x, y0: raw.y, x1: raw.x, y1: raw.y });
      }
      return;
    }
    drag.current = { mode: "draw", p: tool === "cal" ? raw : p };
    setDraft({ x0: tool === "cal" ? raw.x : p.x, y0: tool === "cal" ? raw.y : p.y,
               x1: tool === "cal" ? raw.x : p.x, y1: tool === "cal" ? raw.y : p.y });
  };

  const onMove = (e) => {
    const raw = toWorldPt(e.clientX, e.clientY);
    setCursor(raw);

    if (pointers.current.has(e.pointerId))
      pointers.current.set(e.pointerId, { x: e.clientX, y: e.clientY });
    if (pinch.current && pointers.current.size === 2) {
      const [a, b] = [...pointers.current.values()];
      const d = Math.hypot(a.x - b.x, a.y - b.y);
      if (pinch.current.d > 0 && d > 0)
        zoomAt((a.x + b.x) / 2, (a.y + b.y) / 2, pinch.current.d / d);
      pinch.current.d = d;
      return;
    }

    const d = drag.current;
    if (!d) {
      /* İmleç altındaki koltuğun kimliği — tıklamadan görünsün. */
      if (seatMode) {
        const t = e.target?.dataset;
        if (t?.b && t.r != null) {
          const hit = drawn.find((x) => x.b.id === t.b);
          const st = hit && hit.seats.find((x) => x.r === +t.r && x.c === +t.c);
          const id = st ? st.id : "";
          if (id !== hoverId) setHoverId(id);
        } else if (hoverId) setHoverId("");
      } else if (hoverId) setHoverId("");
      return;
    }
    if (d.mode === "paint") {
      const t = e.target?.dataset;
      if (t?.b && t.r != null) paintSeat(t.b, +t.r, +t.c);
      return;
    }
    if (d.mode === "pan") {
      const r = svgRef.current.getBoundingClientRect();
      const s = Math.min(r.width / d.view.w, r.height / d.view.h);
      setView({ ...d.view, x: d.view.x - (e.clientX - d.sx) / s, y: d.view.y - (e.clientY - d.sy) / s });
      return;
    }
    if (d.mode === "handle") {
      const b0 = d.b;
      const a = -b0.rot * RAD;
      const gx = raw.x - b0.x, gy = raw.y - b0.y;
      const lx = gx * Math.cos(a) - gy * Math.sin(a);
      const ly = gx * Math.sin(a) + gy * Math.cos(a);
      const dist = Math.hypot(lx, ly);
      let patch = {};
      if (d.h.startsWith("foot:")) {
        const k = +d.h.slice(5);
        patch = { foot: (b0.foot || []).map((q, j) => j === k ? { x: Math.round(lx), y: Math.round(ly) } : q) };
        setPlan({ ...plan, blocks: plan.blocks.map((x) => (x.id === b0.id ? { ...x, ...patch } : x)) });
        return;
      }
      if (d.h === "rot") {
        const ang = Math.atan2(raw.y - b0.y, raw.x - b0.x) / RAD;
        patch = { rot: Math.round(b0.rot + (ang - d.startAng)) };
      } else if (d.h === "size") {
        patch = { cols: Math.max(1, Math.round((Math.abs(lx) * 2) / b0.seatGap)),
                  rows: Math.max(1, Math.round(ly / b0.rowGap) + 1) };
      } else if (d.h === "r0") {
        patch = { r0: Math.max(50, Math.round(dist / 10) * 10) };
      } else if (d.h === "rows") {
        patch = { rows: Math.max(1, Math.round((dist - b0.r0) / b0.rowGap) + 1) };
      } else if (d.h === "aStart" || d.h === "aEnd") {
        patch = { [d.h]: Math.round(Math.atan2(lx, -ly) / RAD) };
      }
      setPlan({ ...plan, blocks: plan.blocks.map((x) => (x.id === b0.id ? { ...x, ...patch } : x)) });
      return;
    }
    if (d.mode === "marq" || d.mode === "seatMarq") { setMarq((q) => ({ ...q, x1: raw.x, y1: raw.y })); return; }
    if (d.mode === "move") {
      const rdx = raw.x - d.p.x, rdy = raw.y - d.p.y;
      const tol = 7 / (pxPerCm || 0.01);
      const a = alignDelta(d, rdx, rdy, tol);
      /* hizaya oturmayan eksende ızgaraya yapış */
      const st = snapOn ? gridStep : 0;
      const dx = a.g.some((g) => g.axis === "x") ? a.dx : st ? Math.round(a.dx / st) * st : a.dx;
      const dy = a.g.some((g) => g.axis === "y") ? a.dy : st ? Math.round(a.dy / st) * st : a.dy;
      setGuides(a.g);
      setPlan({ ...plan, blocks: plan.blocks.map((b) => {
        if (!d.ids.includes(b.id)) return b;
        const src = d.snapshot.blocks.find((o) => o.id === b.id);
        return { ...b, x: Math.round(src.x + dx), y: Math.round(src.y + dy) };
      }) });
      return;
    }
    if (d.mode === "moveShape") {
      const dx = raw.x - d.p.x, dy = raw.y - d.p.y;
      const src = d.snapshot.shapes.find((o) => o.id === d.id);
      setPlan({ ...plan, shapes: plan.shapes.map((o) => o.id === d.id ? { ...o, ...snap({ x: src.x + dx, y: src.y + dy }) } : o) });
      return;
    }
    if (d.mode === "seat") {
      const a = -d.blockRot * RAD;
      const gx = raw.x - d.p.x, gy = raw.y - d.p.y;
      const dx = gx * Math.cos(a) - gy * Math.sin(a);
      const dy = gx * Math.sin(a) + gy * Math.cos(a);
      const k = `${d.r},${d.c}`, prev = d.ov[k] || {};
      const nv = { ...prev, dx: Math.round((prev.dx || 0) + dx), dy: Math.round((prev.dy || 0) + dy) };
      setPlan({ ...plan, blocks: plan.blocks.map((b) => b.id === d.bid ? { ...b, ov: { ...b.ov, [k]: nv } } : b) });
      d.p = raw; d.ov = { ...d.ov, [k]: nv };
      return;
    }
    if (d.mode === "draw") {
      const s = tool === "cal" ? raw : snap(raw);
      setDraft((q) => ({ ...q, x1: s.x, y1: s.y }));
    }
  };

  const onUp = (e) => {
    if (e?.pointerId != null) pointers.current.delete(e.pointerId);
    if (pointers.current.size < 2) pinch.current = null;
    const d = drag.current;
    drag.current = null;
    if (d?.mode === "handle" || d?.mode === "paint") {
      finalizeDrag(d.snapshot);
      return;
    }
    if (d?.mode === "seatMarq") {
      const q = marq; setMarq(null);
      if (!q) return;
      const x0 = Math.min(q.x0, q.x1), x1 = Math.max(q.x0, q.x1);
      const y0 = Math.min(q.y0, q.y1), y1 = Math.max(q.y0, q.y1);
      if (x1 - x0 < 20 && y1 - y0 < 20) return;
      const hits = [];
      drawn.forEach(({ b, seats }) => seats.forEach((s) => {
        if (s.x >= x0 && s.x <= x1 && s.y >= y0 && s.y <= y1) hits.push({ bid: b.id, s });
      }));
      if (!hits.length) { setMsg("Seçime koltuk girmedi"); return; }
      if (d.paint) {
        const byB = new Map();
        hits.forEach(({ bid, s }) => {
          if (!byB.has(bid)) byB.set(bid, []);
          byB.get(bid).push(`${s.r},${s.c}`);
        });
        commit({ ...plan, blocks: plan.blocks.map((b) => {
          const list = byB.get(b.id);
          if (!list) return b;
          const ov = { ...b.ov };
          list.forEach((rc) => {
            const cur = { ...(ov[rc] || {}) };
            if (brush === "" && !b.attr) delete cur.at; else cur.at = brush;
            Object.keys(cur).length ? (ov[rc] = cur) : delete ov[rc];
          });
          return { ...b, ov };
        }) });
        setMsg(`${hits.length} koltuk boyandı`);
      } else {
        const next = d.add ? new Set(d.base) : new Set();
        hits.forEach(({ bid, s }) => next.add(`${bid}|${s.r},${s.c}`));
        setSelSeats(next);
        setSelSeat(next.size === 1 ? (() => {
          const [bid, rc] = [...next][0].split("|");
          const [r, c] = rc.split(",");
          return { bid, r: +r, c: +c };
        })() : null);
        setMsg(`${next.size} koltuk seçildi`);
      }
      return;
    }
    if (d?.mode === "marq") {
      const q = marq; setMarq(null);
      if (!q || (Math.abs(q.x1 - q.x0) < 30 && Math.abs(q.y1 - q.y0) < 30)) return;
      const x0 = Math.min(q.x0, q.x1), x1 = Math.max(q.x0, q.x1);
      const y0 = Math.min(q.y0, q.y1), y1 = Math.max(q.y0, q.y1);
      const hit = metas.filter(({ b, m }) =>
        (levelFilter === "*" || (b.level || "") === levelFilter) &&
        m.bbox.x0 >= x0 && m.bbox.x1 <= x1 && m.bbox.y0 >= y0 && m.bbox.y1 <= y1).map((x) => x.b.id);
      setSelIds(d.add ? [...new Set([...d.base, ...hit])] : hit);
      return;
    }
    if (d?.mode === "move" || d?.mode === "moveShape" || d?.mode === "seat") {
      setGuides([]);
      finalizeDrag(d.snapshot);
      return;
    }
    if (d?.mode !== "draw" || !draft) { setDraft(null); return; }
    const { x0, y0, x1, y1 } = draft;
    setDraft(null);
    const w = Math.abs(x1 - x0), h = Math.abs(y1 - y0), len = Math.hypot(x1 - x0, y1 - y0);

    if (tool === "cal") {
      if (len < 20) return;
      if (!plan.underlay) { setMsg("Önce altlık yükleyin"); return; }
      setCalib({ x0, y0, x1, y1, px: len, meters: (len / 100).toFixed(2) });
      return;
    }
    if (tool === "measure") { setMsg(`Ölçü: ${(len / 100).toFixed(2)} m`); return; }
    if (tool === "shape") {
      const isPitch = shapeType === "pitch";
      if (!isPitch && (w < 20 || h < 20)) return;
      const P = PITCHES[sport];
      const sh = { id: nid("s"), kind: "rect", type: shapeType,
        x: isPitch ? x0 : (x0 + x1) / 2, y: isPitch ? y0 : (y0 + y1) / 2,
        w: isPitch ? P.w : w, h: isPitch ? P.h : h, rot: 0,
        sport: isPitch ? sport : undefined,
        label: isPitch ? P.label : SHAPES[shapeType].label,
        capacity: shapeType === "standing" ? 100 : 0, fs: 100, blocks: [] };
      commit({ ...plan, shapes: [...plan.shapes, sh] });
      setSelShapeId(sh.id); return;
    }
    let b = null;
    if (tool === "grid") {
      if (w < 30 || h < 30) return;
      b = newGrid((x0 + x1) / 2, Math.min(y0, y1),
        Math.max(1, Math.round(w / DEF.seatGap) + 1), Math.max(1, Math.round(h / DEF.rowGap) + 1));
    } else if (tool === "row") {
      if (len < 30) return;
      b = newGrid((x0 + x1) / 2, (y0 + y1) / 2, Math.max(1, Math.round(len / DEF.seatGap) + 1), 1);
      b.rot = Math.atan2(y1 - y0, x1 - x0) / RAD;
    } else if (tool === "fan") {
      b = newFan(x0, y0, Math.max(100, len));
    }
    if (!b) return;
    b.label = String(plan.blocks.length + 1);
    b.level = levelFilter === "*" ? (levels[0] || "") : levelFilter;
    b.name = b.level ? `${b.level} · ${b.label}` : b.label;
    commit({ ...plan, blocks: [...plan.blocks, b] });
    setSelIds([b.id]); setTool("select");
  };

  const applyCal = () => {
    const real = parseFloat(String(calib.meters).replace(",", ".")) * 100;
    if (!real || !plan.underlay) { setCalib(null); return; }
    const f = real / calib.px;
    const u = plan.underlay, ax = calib.x0, ay = calib.y0;
    commit({ ...plan, underlay: { ...u,
      x: ax + (u.x - ax) * f, y: ay + (u.y - ay) * f, w: u.w * f, h: u.h * f } });
    setCalib(null); setTool("select");
    setMsg(`Altlık ölçeklendi ×${f.toFixed(3)}`);
  };

  const finishPoly = () => {
    if (!poly || poly.pts.length < 3) { setPoly(null); return; }
    const xs = poly.pts.map((p) => p.x), ys = poly.pts.map((p) => p.y);
    const cx = (Math.min(...xs) + Math.max(...xs)) / 2, cy = (Math.min(...ys) + Math.max(...ys)) / 2;
    const sh = { id: nid("s"), kind: "poly", type: shapeType, x: cx, y: cy, rot: 0,
      pts: poly.pts.map((p) => ({ x: p.x - cx, y: p.y - cy })),
      label: SHAPES[shapeType].label, capacity: shapeType === "standing" ? 100 : 0, fs: 100 };
    commit({ ...plan, shapes: [...plan.shapes, sh] });
    setPoly(null); setSelShapeId(sh.id); setTool("select");
  };

  /* Tekerlek: macOS'ta pinch, ctrlKey işaretli bir wheel olayı olarak gelir.
     Normal iki parmak kaydırma ctrlKey taşımaz — onu gezinti saymak gerek.
     Ayırt etme: fare tekerleği satır modunda (deltaMode 1) ya da ~100'lük
     tam adımlarla gelir; trackpad küçük, kesirli ve yatay bileşenli gelir. */
  const wheelKind = useRef("mouse");
  const onWheel = (e) => {
    e.preventDefault();
    if (e.deltaMode === 1) wheelKind.current = "mouse";
    else if (e.ctrlKey || e.deltaX !== 0 || !Number.isInteger(e.deltaY) || Math.abs(e.deltaY) < 40)
      wheelKind.current = "trackpad";
    else if (Math.abs(e.deltaY) >= 100) wheelKind.current = "mouse";
    const mode = wheelPref === "auto" ? wheelKind.current : wheelPref;

    /* pinch her iki modda da yakınlaştırır */
    if (e.ctrlKey || e.metaKey) {
      zoomAt(e.clientX, e.clientY, Math.exp(e.deltaY * 0.01));
      return;
    }
    if (mode === "trackpad") {
      const s = pxPerCm || 1;
      setView((v) => ({ ...v, x: v.x + e.deltaX / s, y: v.y + e.deltaY / s }));
      return;
    }
    if (e.shiftKey) {
      const s = pxPerCm || 1;
      setView((v) => ({ ...v, x: v.x + e.deltaY / s }));
      return;
    }
    /* Büyük bir stadyumda tam salondan tek koltuk numarasının okunacağı
       yakınlığa gitmek fiziksel olarak yüzlerce kat zum ister (bkz.
       seatNums eşiği). Adım başına 1.18 ile bu onlarca tekerlek hareketi
       istiyordu; 1.3 aynı mesafeyi ~%35 daha az hareketle aldırıyor. */
    zoomAt(e.clientX, e.clientY, e.deltaY > 0 ? 1.3 : 1 / 1.3);
  };

  const toggleOv = ({ bid, r, c }, key) => {
    const b = plan.blocks.find((x) => x.id === bid);
    if (!b) return;
    const k = `${r},${c}`, cur = b.ov[k] || {}, ov = { ...b.ov };
    if (cur[key]) { const n = { ...cur }; delete n[key]; Object.keys(n).length ? (ov[k] = n) : delete ov[k]; }
    else ov[k] = { ...cur, [key]: true, ...(key === "rm" ? { gap: false } : { rm: false }) };
    patchBlock(bid, { ov });
  };
  const setOv = ({ bid, r, c }, patch) => {
    const b = plan.blocks.find((x) => x.id === bid);
    if (!b) return;
    patchBlock(bid, { ov: { ...b.ov, [`${r},${c}`]: { ...(b.ov[`${r},${c}`] || {}), ...patch } } });
  };

  /** Nitelik boyama — commit değil setPlan; geçmişe fırça bırakıldığında yazılır. */
  const paintSeat = (bid, r, c) => {
    setVenues((vs) => {
      const pl = vs[vk];
      const b = pl.blocks.find((x) => x.id === bid);
      if (!b) return vs;
      const k = `${r},${c}`, cur = b.ov[k] || {};
      if ((cur.at ?? (b.attr || "")) === brush) return vs;
      const nx = { ...cur };
      if (brush === "" && !b.attr) delete nx.at; else nx.at = brush;
      const ov = { ...b.ov };
      Object.keys(nx).length ? (ov[k] = nx) : delete ov[k];
      return { ...vs, [vk]: { ...pl, blocks: pl.blocks.map((x) => (x.id === bid ? { ...x, ov } : x)) } };
    });
  };

  useEffect(() => {
    const h = (e) => {
      if (["INPUT", "SELECT", "TEXTAREA"].includes(e.target.tagName)) return;
      const k = e.key.toLowerCase();
      if ((e.ctrlKey || e.metaKey) && k === "z") { e.preventDefault(); e.shiftKey ? redo() : undo(); return; }
      if ((e.ctrlKey || e.metaKey) && k === "a") {
        e.preventDefault();
        setSelIds(metas.filter(({ b }) => levelFilter === "*" || (b.level || "") === levelFilter).map((x) => x.b.id));
        return;
      }
      if (e.key === "Enter" && footDraft) { footFinish(); return; }
      if (e.key === "Enter" && poly) { finishPoly(); return; }
      if (e.key === "Escape") { setPoly(null); setDraft(null); setCalib(null); setReport(null); setSetOpen(false);
        if (footDraft) { setFootDraft(null); setTool("select"); return; }
        setSelIds([]); setSelShapeId(null); setSelSeat(null); setSelSeats(new Set()); return; }

      /* ok tuşları: varsayılan 1 cm, Shift 10×, Alt ızgara adımı */
      const ARR = { ArrowLeft: [-1, 0], ArrowRight: [1, 0], ArrowUp: [0, -1], ArrowDown: [0, 1] };
      if (ARR[e.key]) {
        if (!selIds.length && !selShapeId && !selSeats.size) return;
        e.preventDefault();
        const step = e.altKey ? gridStep : e.shiftKey ? 10 : 1;
        nudge(ARR[e.key][0] * step, ARR[e.key][1] * step);
        return;
      }
      const map = { v: "select", g: "grid", f: "fan", r: "row", t: "table", s: "seatAdd", e: "seat",
        n: "attr", d: "shape", p: "poly", i: "poi", m: "measure", k: "cal", h: "pan" };
      if (map[k]) setTool(map[k]);
      if (k === "y") setSnapOn((s) => !s);
      if (e.key === "Delete" || e.key === "Backspace") {
        if (selSeat) { toggleOv(selSeat, "rm"); return; }
        if (selIds.length) { commit({ ...plan, blocks: plan.blocks.filter((b) => !selIds.includes(b.id)) }); setSelIds([]); }
        else if (selShapeId) { commit({ ...plan, shapes: plan.shapes.filter((s) => s.id !== selShapeId) }); setSelShapeId(null); }
      }
    };
    window.addEventListener("keydown", h);
    return () => window.removeEventListener("keydown", h);
  });

  /* tema: sistem tercihini dinle, kullanıcı seçimi varsa onu uygula */
  useEffect(() => {
    if (typeof window === "undefined" || !window.matchMedia) return;
    const m = window.matchMedia("(prefers-color-scheme: dark)");
    const f = () => setSysDark(m.matches);
    f();
    m.addEventListener?.("change", f);
    return () => m.removeEventListener?.("change", f);
  }, []);
  useEffect(() => { (async () => {
    const t = await Store.pref("theme");
    if (t) setTheme(t);
    const w = await Store.pref("wheel");
    if (w) setWheelPref(w);
  })(); }, []);
  const setWheelPrefP = (w) => { setWheelPref(w); Store.pref("wheel", w); };
  const setThemePref = (t) => { setTheme(t); Store.pref("theme", t); };
  const dark = theme === "system" ? sysDark : theme === "dark";

  /* boşluk tuşu basılıyken geçici kaydırma modu */
  useEffect(() => {
    const down = (e) => {
      if (e.code === "Space" && !["INPUT", "SELECT", "TEXTAREA"].includes(e.target.tagName)) {
        e.preventDefault(); setSpaceDown(true);
      }
    };
    const up = (e) => { if (e.code === "Space") setSpaceDown(false); };
    const blur = () => setSpaceDown(false);
    window.addEventListener("keydown", down);
    window.addEventListener("keyup", up);
    window.addEventListener("blur", blur);
    return () => { window.removeEventListener("keydown", down);
      window.removeEventListener("keyup", up); window.removeEventListener("blur", blur); };
  }, []);

  const loadUnderlay = (e) => {
    const f = e.target.files?.[0];
    if (!f) return;
    const rd = new FileReader();
    rd.onload = () => {
      const img = new Image();
      img.onload = () => {
        const sc = (view.w * 0.8) / img.width;
        commit({ ...plan, underlay: { src: rd.result, x: -img.width * sc / 2,
          y: -img.height * sc / 2, w: img.width * sc, h: img.height * sc, opacity: 0.4 } });
        setMsg("Altlık yüklendi · şimdi Kalibre et (K)");
      };
      img.src = rd.result;
    };
    rd.readAsDataURL(f);
    e.target.value = "";
  };

  const importPlan = (e) => {
    const f = e.target.files?.[0];
    if (!f) return;
    const rd = new FileReader();
    rd.onload = () => {
      try {
        const raw = JSON.parse(rd.result);
        const key = `imp${Date.now().toString(36)}`;
        const p = adoptPlan(raw, key);
        setVenues((v) => ({ ...v, [key]: p }));
        setVk(key); setPast([]); setFuture([]); setSelIds([]); setSelShapeId(null);
        setLevelFilter("*"); setView(p.home); setReport(null);
        setMsg(`${p.blocks.length} blok içe aktarıldı`);
      } catch (err) {
        console.error("Plan içe aktarma hatası:", err);
        const detail = err instanceof SyntaxError ? "dosya geçerli bir JSON değil" : err.message;
        setErr(`İçe aktarılamadı: ${detail}`);
      }
    };
    rd.readAsText(f);
    e.target.value = "";
  };

  const download = (name, obj) => {
    const blob = new Blob([JSON.stringify(obj, null, 2)], { type: "application/json" });
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob); a.download = name; a.click();
    URL.revokeObjectURL(a.href); setMsg(`${name} indirildi`);
  };
  const exportSeats = () => {
    setMsg("koltuklar üretiliyor…");
    const all = [];
    const gm = gateMap(plan);
    const bid = new Map(plan.blocks.map((b) => [b.label, b.id]));
    metas.forEach(({ b, m }) => buildSeats(b, m, plan.idTemplate).seats.forEach((s) => {
      if (!s.gap) all.push({ ...s, gate: (gm.get(b.id) || [])[0] || null });
    }));
    const at = {};
    all.forEach((s) => { if (s.at) at[s.at] = (at[s.at] || 0) + 1; });
    download(`${plan.key}-seats.json`, {
      venue: plan.name, unit: "cm", version: plan.published || null,
      seatCount: all.length, sellableCount: all.length - (at.tech || 0),
      levels: levelCounts, attributes: at,
      gates: plan.shapes.filter((s) => s.type === "door")
        .map((d) => ({ label: d.label, blocks: (d.blocks || []).map((i) => plan.blocks.find((b) => b.id === i)?.label).filter(Boolean) })),
      seats: all.map((s) => ({ id: s.id, level: s.level, block: s.block, row: s.row, seat: s.num,
        gate: s.gate, x: +s.x.toFixed(1), y: +s.y.toFixed(1), rot: +s.rot.toFixed(1),
        attribute: s.at || null, sellable: s.at !== "tech" })),
    });
  };
  const exportPlan = () => download(`${plan.key}-plan.json`,
    { ...plan, underlay: plan.underlay ? { ...plan.underlay, src: null } : null });

  const mirror = () => {
    if (!selBlocks.length) return;
    const made = selBlocks.map((b) => {
      const cp = reLabel({ ...b, id: nid(), x: -b.x }, incLabel(b.label, selBlocks.length));
      if (b.kind === "fan") { cp.aCenter = -b.aCenter; cp.aStart = -b.aEnd; cp.aEnd = -b.aStart; }
      else if (b.kind === "free") cp.pts = b.pts.map((p) => ({ ...p, x: -p.x, rot: -(p.rot || 0) }));
      else { cp.rot = -b.rot; cp.align = b.align === "left" ? "right" : b.align === "right" ? "left" : "center"; }
      return cp;
    });
    commit({ ...plan, blocks: [...plan.blocks, ...made] });
    setSelIds(made.map((b) => b.id));
  };

  const gridLines = useMemo(() => {
    const px = 900 / view.w;
    let step = gridStep;
    while (step * px < 7) step *= 5;
    const out = { minor: [], major: [] };
    const x0 = Math.floor(view.x / step) * step, x1 = view.x + view.w;
    const y0 = Math.floor(view.y / step) * step, y1 = view.y + view.h;
    if ((x1 - x0) / step < 320) {
      for (let x = x0; x <= x1; x += step) (Math.round(x) % (step * 5) === 0 ? out.major : out.minor).push(["v", x]);
      for (let y = y0; y <= y1; y += step) (Math.round(y) % (step * 5) === 0 ? out.major : out.minor).push(["h", y]);
    }
    return out;
  }, [view, gridStep]);

  const TOOL_GROUPS = [
    ["", [["select", "Seç ve taşı", "V", "select"], ["pan", "Kaydır", "H", "pan"]]],
    ["Çiz", [["grid", "Izgara blok", "G", "grid"], ["fan", "Yelpaze blok", "F", "fan"],
             ["row", "Tek sıra", "R", "row"], ["table", "Masa", "T", "table"],
             ["seatAdd", "Tek koltuk", "S", "seat"]]],
    ["Koltuk", [["seat", "Koltuk düzenle", "E", "seatEd"], ["attr", "Nitelik boya", "N", "brush"]]],
    ["Ortam", [["shape", "Şekil", "D", "shape"], ["poly", "Poligon", "P", "poly"],
               ["poi", "İşaret", "I", "info"]]],
    ["Referans", [["cal", "Kalibre et", "K", "cal"], ["measure", "Ölç", "M", "measure"]]],
  ];
  const seatOv = selSeat
    ? plan.blocks.find((b) => b.id === selSeat.bid)?.ov[`${selSeat.r},${selSeat.c}`] || {} : null;
  const lodFont = 17 * U;
  const hSize = Math.max(24, 9 / (pxPerCm || 0.01));
  const arrProps = { lin, setLin, rad, setRad, onArrayL: doLinear, onArrayR: doRadial,
    prev: arrPrev, setPrev: setArrPrev };
  const selSeatTotal = selBlocks.reduce((a, b) => a + (metaById.get(b.id)?.seatCount || 0), 0);

  return (
    <div className={`ed ${dark ? "dark" : "light"}`}>
      <style>{CSS}</style>

      <div className="gate">
        <p>Bu editör geniş bir çalışma alanı gerektirir.
          <span>Lütfen masaüstü tarayıcıda veya en az 1024px genişliğinde bir pencerede açın.</span>
        </p>
      </div>

      <header className="top">
        <select className="venue" value={vk} onChange={(e) => switchVenue(e.target.value)}>
          {Object.entries(venues).map(([k, v]) => <option key={k} value={k}>{v.name}</option>)}
        </select>
        <span className={`sv ${saveState}`}>
          {saveState === "saving" ? "kaydediliyor" : saveState === "saved" ? "kaydedildi"
            : saveState === "error" ? "kaydedilemedi" : "otomatik kayıt"}
        </span>
        <span className="tsep" />
        <span className={dirty ? "pub dirty" : "pub"}>
          {published ? `v${published.v}` : "taslak"}{dirty ? " · değişiklik var" : " · yayında"}
        </span>

        <div className="grow" />

        <button className="ib" onClick={undo} disabled={!past.length} title="Geri al (⌘Z)"><Icon n="undo" /></button>
        <button className="ib" onClick={redo} disabled={!future.length} title="Yinele (⇧⌘Z)"><Icon n="redo" /></button>
        <span className="tsep" />
        <button className={setOpen ? "on" : ""} onClick={() => { setSetOpen(!setOpen); setVerOpen(false); }}>Ayarlar</button>
        <button className={verOpen ? "on" : ""} onClick={() => { setVerOpen(!verOpen); setSetOpen(false); }}>Sürümler</button>
        <button onClick={runValidate}>Doğrula
          {reportErrN > 0 && <span className="badge err">{reportErrN}</span>}
          {reportErrN === 0 && reportWarnN > 0 && <span className="badge warn">{reportWarnN}</span>}
        </button>
        <span className="tsep" />
        <label className="btn">Aç<input type="file" accept="application/json,.json" onChange={importPlan} hidden /></label>
        <button onClick={exportPlan}>plan.json</button>
        <button className="pri" onClick={exportSeats}>seats.json</button>
      </header>

      <div className="body">
        <nav className="tools">
          {TOOL_GROUPS.map(([g, list]) => (
            <div className="grp" key={g || "main"}>
              {g && <p className="glab">{g}</p>}
              {list.map(([id, label, key, icon]) => (
                <button key={id} className={tool === id ? "on" : ""}
                  onClick={() => { setTool(id); setPoly(null); }}>
                  <Icon n={icon} /><span>{label}</span><kbd>{key}</kbd>
                </button>
              ))}
            </div>
          ))}

          <div className="grp">
            <label className="tbtn">
              <Icon n="image" /><span>Altlık yükle</span>
              <input type="file" accept="image/*" onChange={loadUnderlay} hidden />
            </label>
          </div>

          {(tool === "shape" || tool === "poly") && (
            <select className="mini full" value={shapeType} onChange={(e) => setShapeType(e.target.value)}>
              {Object.entries(SHAPES).map(([k, v]) => <option key={k} value={k}>{v.label}</option>)}
            </select>
          )}
          {tool === "shape" && shapeType === "pitch" && (<>
            <select className="mini full" value={sport} onChange={(e) => setSport(e.target.value)}>
              {Object.entries(PITCHES).map(([k, v]) => <option key={k} value={k}>{v.label}</option>)}
            </select>
            <p className="mut sm">{PITCHES[sport].note} — tıkladığın yere nizami ölçüde yerleşir</p>
          </>)}
          {tool === "poi" && (
            <div className="poigrid">
              {Object.entries(POI).map(([k, v]) => (
                <button key={k} className={poiKind === k ? "on" : ""} title={v.label}
                  onClick={() => setPoiKind(k)}>
                  <svg viewBox="0 0 24 24" fill="none"><IconParts parts={v.p || []} /></svg>
                </button>
              ))}
            </div>
          )}

          {tool === "attr" && (
            <div className="brush">
              {Object.entries(ATTRS).map(([k, a]) => (
                <button key={k} className={brush === k ? "on" : ""} onClick={() => setBrush(k)}>
                  <i style={{ background: a.color }} />{a.short}
                </button>
              ))}
              <button className={brush === "" ? "on" : ""} onClick={() => setBrush("")}>
                <i style={{ background: "transparent", border: "1px solid #5A5F70" }} />Temizle
              </button>
            </div>
          )}
          {poly && <button className="pri sm" onClick={finishPoly}>Poligonu kapat ({poly.pts.length})</button>}

          {levels.length > 1 && (<>
            <div className="sep" />
            <p className="lab">Kat / kuşak</p>
            <select className="mini full" value={levelFilter} onChange={(e) => setLevelFilter(e.target.value)}>
              <option value="*">Tümü · {totalSeats.toLocaleString("tr-TR")}</option>
              {levels.map((l) => <option key={l} value={l}>{l} · {(levelCounts[l] || 0).toLocaleString("tr-TR")}</option>)}
            </select>
          </>)}

          <div className="sep" />
          <p className="lab">Bloklar ({metas.length})</p>
          <input className="find" value={q} placeholder="Blok ara…"
            onChange={(e) => setQ(e.target.value)} />
          <ul className="tree">
            {metas.filter(({ b }) => (levelFilter === "*" || (b.level || "") === levelFilter) &&
                (!q.trim() || `${b.name || ""} ${b.label}`.toLocaleLowerCase("tr").includes(q.toLocaleLowerCase("tr"))))
              .slice(0, 200).map(({ b, m }) => (
              <li key={b.id} className={selIds.includes(b.id) ? "on" : ""}
                onClick={(e) => setSelIds(e.shiftKey
                  ? (selIds.includes(b.id) ? selIds.filter((i) => i !== b.id) : [...selIds, b.id])
                  : [b.id])}
                onDoubleClick={() => zoomTo(m)}>
                <span className="nm">{b.name || b.label}</span>
                <i>{m.seatCount}</i>
              </li>
            ))}
            {plan.shapes.map((s) => (
              <li key={s.id} className={selShapeId === s.id ? "on" : ""}
                onClick={() => { setSelShapeId(s.id); setSelIds([]); }}>
                <span className="nm dim">{s.type === "icon" ? "◈" : "◇"} {s.label || SHAPES[s.type]?.label || POI[s.icon]?.label || "İşaret"}</span>
              </li>
            ))}
            {!plan.blocks.length && !plan.shapes.length && <li className="mut">Boş tuval</li>}
          </ul>
        </nav>

        <main className="canvas">
          <svg ref={svgRef} viewBox={`${view.x} ${view.y} ${view.w} ${view.h}`}
            preserveAspectRatio="xMidYMid meet" className={spaceDown ? "t-pan" : `t-${tool}`}
            onWheel={onWheel} onPointerDown={onDown} onPointerMove={onMove}
            onPointerUp={onUp} onPointerCancel={onUp}
            onContextMenu={(e) => e.preventDefault()}
            onDoubleClick={() => { if (footDraft) footFinish(); else if (poly) finishPoly(); }}
            onPointerLeave={() => { drag.current = null; setGuides([]); }}>

            {plan.underlay && plan.underlay.src && (
              <image href={plan.underlay.src} x={plan.underlay.x} y={plan.underlay.y}
                width={plan.underlay.w} height={plan.underlay.h}
                opacity={plan.underlay.opacity} style={{ pointerEvents: "none" }} />
            )}

            <g className="grid">
              {gridLines.minor.map(([d, v], i) => d === "v"
                ? <line key={`m${i}`} x1={v} y1={view.y} x2={v} y2={view.y + view.h} />
                : <line key={`m${i}`} x1={view.x} y1={v} x2={view.x + view.w} y2={v} />)}
            </g>
            <g className="grid maj">
              {gridLines.major.map(([d, v], i) => d === "v"
                ? <line key={`M${i}`} x1={v} y1={view.y} x2={v} y2={view.y + view.h} />
                : <line key={`M${i}`} x1={view.x} y1={v} x2={view.x + view.w} y2={v} />)}
            </g>

            {/* fill:none olan şekiller (duvar, not) SVG'de sadece kenardan
                tıklanır — görünmez ama tıklamayı yakalayan bir ikinci hedef
                gerekiyor. Bu hedef, asıl şekillerle AYNI geçişte, kendi
                sırasında çizilirse; bir duvar dizinin başka bir yerinde
                (kapsayıcı) ise üstüne gelen her şeklin (ör. ayakta alan)
                tıklamasını çalar — SVG'de tıklama en üstteki elemana gider.
                Bu yüzden görünmez hedefler HEP en altta, ayrı bir ön geçişte
                çizilir; üstlerine gelen gerçek şekiller tıklamayı önce onlar
                yakalar. */}
            {plan.shapes.map((s) => {
              const st = SHAPES[s.type];
              if (st?.fill !== "none") return null;
              return (
                <g key={`ht${s.id}`} transform={`translate(${s.x} ${s.y}) rotate(${s.rot})`}>
                  {s.kind === "rect"
                    ? <rect data-s={s.id} x={-s.w / 2} y={-s.h / 2} width={s.w} height={s.h}
                        fill="transparent" stroke="none" />
                    : <polygon data-s={s.id} points={s.pts.map((p) => `${p.x},${p.y}`).join(" ")}
                        fill="transparent" stroke="none" />}
                </g>
              );
            })}

            {plan.shapes.map((s) => {
              const st = SHAPES[s.type];
              if (s.type === "icon") return null;
              if (s.type === "pitch") return <Pitch key={s.id} s={s} selected={selShapeId === s.id} />;
              if (s.type === "door") {
                const on = selShapeId === s.id;
                const num = String(s.label).replace(/\D+/g, "") || "?";
                /* Kapı, gerçek bir vomitorium gibi DİKDÖRTGEN bir açıklık —
                   yuvarlak rozet değil. Tribüne oyulmuş tünel ağzını temsil
                   eder; rot ile tünelin radyal yönüne hizalanır. Numara dik
                   (döndürülmemiş) yazılır. */
                const fs = Math.min(s.fs || 95, Math.min(s.w, s.h) * 0.66);
                return (
                  <g key={s.id} className={on ? "dr on" : "dr"}>
                    {on && (s.blocks || []).map((bid) => {
                      const m = metaById.get(bid);
                      return m ? <line key={bid} x1={s.x} y1={s.y} x2={m.cx} y2={m.cy} /> : null;
                    })}
                    <g transform={`translate(${s.x} ${s.y}) rotate(${s.rot || 0})`}>
                      <rect data-s={s.id} x={-s.w / 2} y={-s.h / 2} width={s.w} height={s.h}
                        rx={14} fill={st.fill} stroke={st.stroke} strokeWidth={6} />
                    </g>
                    <text x={s.x} y={s.y + fs * 0.35} className="dv" style={{ fontSize: fs }}>{num}</text>
                  </g>
                );
              }
              return (
                <g key={s.id} className={selShapeId === s.id ? "shp on" : "shp"}
                  transform={`translate(${s.x} ${s.y}) rotate(${s.rot})`}>
                  {s.kind === "rect"
                    ? <rect data-s={s.id} x={-s.w / 2} y={-s.h / 2} width={s.w} height={s.h} rx={s.type === "pitch" ? 10 : 20}
                        fill={st.fill} stroke={s.type === "note" && s.w < 50 ? "none" : st.stroke}
                        strokeWidth={s.type === "pitch" ? 14 : 6}
                        strokeDasharray={s.type === "standing" ? "40 26" : ""} />
                    : <polygon data-s={s.id} points={s.pts.map((p) => `${p.x},${p.y}`).join(" ")}
                        fill={st.fill} stroke={st.stroke} strokeWidth={6}
                        strokeDasharray={s.type === "standing" ? "40 26" : ""} />}
                  {s.label && (() => {
                    const txt = s.label + (s.type === "standing" && s.capacity ? ` · ${s.capacity} kişi` : "");
                    const w = s.kind === "rect" ? s.w
                      : Math.max(...s.pts.map((p) => p.x)) - Math.min(...s.pts.map((p) => p.x));
                    const h = s.kind === "rect" ? s.h
                      : Math.max(...s.pts.map((p) => p.y)) - Math.min(...s.pts.map((p) => p.y));
                    /* Yazı şeklin içine sığar; ekranda 8 pikselin altına
                       inecekse hiç çizilmez — okunmayan etiket gürültüdür. */
                    const vert = h > w * 1.6;
                    const fit = Math.min(s.fs || 100,
                      (vert ? h : w) * 0.82 / (txt.length * 0.58),
                      (vert ? w : h) * 0.5);
                    if (fit / U < 8) return null;
                    return (
                      <text className="shl" y={vert ? 0 : fit * 0.34} style={{ fontSize: fit }}
                        transform={vert ? `rotate(-90)` : undefined}
                        dy={vert ? fit * 0.34 : 0}>{txt}</text>
                    );
                  })()}
                </g>
              );
            })}

            {dimmedBlocks.length > 0 && (
              <g className="dimmed">
                {dimmedBlocks.map(({ b, m }) => (
                  <polygon key={`dim${b.id}`} pointerEvents="none"
                    points={m.outline.map((p) => `${p.x.toFixed(0)},${p.y.toFixed(0)}`).join(" ")}
                    fill="var(--mut)" fillOpacity={dark ? 0.16 : 0.11}
                    stroke="var(--mut)" strokeOpacity={0.45}
                    strokeWidth={Math.max(3, 1.2 / (pxPerCm || 0.01))} />
                ))}
              </g>
            )}

            {!seatMode && shown.map(({ b, m }) => {
              const col = cc(b);
              const bw = lodFont * (String(b.label).length * 0.62 + 0.7);
              return (
                <g key={b.id} className={selIds.includes(b.id) ? "lod on" : "lod"}>
                  <polygon data-b={b.id}
                    points={m.outline.map((p) => `${p.x.toFixed(0)},${p.y.toFixed(0)}`).join(" ")}
                    fill={col} fillOpacity={dark ? 0.24 : 0.17}
                    stroke={col} strokeOpacity={0.95}
                    strokeWidth={Math.max(4, 1.6 / (pxPerCm || 0.01))} />
                  <rect className="badge" x={m.cx - bw / 2} y={m.cy - lodFont * 0.62}
                    width={bw} height={lodFont * 1.24} rx={lodFont * 0.34} fill={badgeColor(col)} />
                  <text x={m.cx} y={m.cy + lodFont * 0.36} fill="#FBFAF7"
                    style={{ fontSize: lodFont }}>{b.label}</text>
                </g>
              );
            })}

            {seatMode && drawn.filter(({ b }) => b.kind === "table").map(({ b }) => (
              <g key={`t${b.id}`} className="tbl"
                transform={`translate(${b.x} ${b.y}) rotate(${b.rot})`}>
                {(b.tShape || "round") === "round"
                  ? <circle r={(b.tW || 90) / 2} fill={cc(b)} stroke={cc(b)} />
                  : <rect x={-(b.tW || 160) / 2} y={-(b.tH || 90) / 2}
                      width={b.tW || 160} height={b.tH || 90} rx={12}
                      fill={cc(b)} stroke={cc(b)} />}
                {(() => {
                  const f = Math.min((b.tW || 90) * 0.42, 13 * U);
                  return f / U < 7 ? null : (
                    <text className="tlab" y={f * 0.35} style={{ fontSize: f }}
                      fill={onColor(cc(b))}>{b.label}</text>
                  );
                })()}
              </g>
            ))}

            {seatMode && plates && drawn.filter(({ b }) => b.kind !== "table").map(({ b, m }) => (
              <polygon key={`pl${b.id}`} className="plate"
                points={m.outline.map((p) => `${p.x.toFixed(0)},${p.y.toFixed(0)}`).join(" ")}
                fill={cc(b)} stroke={cc(b)}
                fillOpacity={dark ? 0.16 : 0.13} strokeOpacity={dark ? 0.5 : 0.6}
                strokeWidth={Math.max(2, 1.6 / (pxPerCm || 0.01))} />
            ))}

            {/* Blok kimliği yakınlaşınca kaybolmasın diye rozet ekranda
                sabit kalıyor — ama blok tamamen görünürken rozeti taban
                kenarına yapıştırmak koltukların üstüne oturtuyordu. Şimdi:
                blok tam görünüyorsa rozet tabanın biraz DIŞINA (üstüne)
                taşıyor; blok üstten kesilmişse ekran kenarına sabitleniyor. */}
            {seatMode && drawn.filter(({ b }) => b.kind !== "table").map(({ b, m }) => {
              const vx0 = Math.max(m.bbox.x0, view.x), vx1 = Math.min(m.bbox.x1, view.x + view.w);
              const vy0 = Math.max(m.bbox.y0, view.y), vy1 = Math.min(m.bbox.y1, view.y + view.h);
              if (vx1 <= vx0 || vy1 <= vy0) return null;
              const f = 15 * U;
              const bw = f * (String(b.label).length * 0.62 + 0.9);
              const clipped = view.y > m.bbox.y0 + 1;
              const by = clipped ? view.y + f * 0.35 : m.bbox.y0 - f * 1.5;
              return (
                <g key={`sb${b.id}`} className="stick">
                  <rect x={(vx0 + vx1) / 2 - bw / 2} y={by}
                    width={bw} height={f * 1.32} rx={f * 0.36} fill={badgeColor(cc(b))} />
                  <text x={(vx0 + vx1) / 2} y={by + f * 1.04}
                    style={{ fontSize: f }}>{b.label}</text>
                </g>
              );
            })}

            {seatMode && drawn.map(({ b, seats, labels }) => (
              <g key={b.id} className={selIds.includes(b.id) ? "blk on" : "blk"}>
                {seats.map((s) => {
                  const A = s.at ? ATTRS[s.at] : null;
                  const w = A?.wide ? 86 : DEF.seatW;
                  const isSel = selSeats.has(`${b.id}|${s.r},${s.c}`);
                  return (
                    <rect key={s.key} data-b={b.id} data-r={s.r} data-c={s.c}
                      x={-w / 2} y={-DEF.seatH / 2} width={w} height={DEF.seatH} rx={12}
                      className={isSel ? "sel" : ""}
                    style={selIds.includes(b.id) || isSel
                      ? { strokeWidth: (isSel ? 2.6 : 1.4) * U } : undefined}
                      transform={`translate(${s.x.toFixed(1)} ${s.y.toFixed(1)}) rotate(${s.rot.toFixed(1)})`}
                      fill={s.gap ? "none" : s.at === "tech" ? "var(--seatoff)"
                        : A?.wide ? "none" : cc(b)}
                      fillOpacity={A?.wide ? 0 : 1}
                      stroke={s.gap ? "var(--mut)" : A ? A.color : s.tweak ? "var(--acc)" : "none"}
                      strokeWidth={s.gap ? 1.1 * U : A ? 1.8 * U : 1.2 * U}
                      strokeDasharray={s.gap ? `${3 * U} ${2.4 * U}` : ""} />
                  );
                })}
                {seats.filter((s) => ATTRS[s.at]?.wide && !s.gap).map((s) => (
                  <rect key={`w${s.key}`} x={-43} y={-DEF.seatH / 2 - 3} width={86}
                    height={DEF.seatH + 6} rx={6} fill={ATTRS[s.at].color} fillOpacity={0.14}
                    transform={`translate(${s.x.toFixed(1)} ${s.y.toFixed(1)}) rotate(${s.rot.toFixed(1)})`}
                    pointerEvents="none" />
                ))}
                {seatNums && seats.filter((s) => s.at && !s.gap).map((s) => (
                  <text key={`a${s.key}`} className="atg" x={s.x} y={s.y + 3.4 * U}
                    style={{ fontSize: 9.5 * U }} fill={ATTRS[s.at].color}>{ATTRS[s.at].glyph}</text>
                ))}
                {seatNums && seats.filter((s) => !s.gap && !s.at &&
                  s.x > view.x && s.x < view.x + view.w && s.y > view.y && s.y < view.y + view.h)
                  .map((s) => (
                    <text key={`n${s.key}`} className="snum" fill={onColor(cc(b))}
                      x={s.x} y={s.y + 3.1 * U} style={{ fontSize: 8.6 * U }}>{s.num}</text>
                  ))}
                {pxPerCm * b.rowGap > 22 && labels.map((l) => (
                  <text key={l.key} className="rl" x={l.x} y={l.y + 3.6 * U}
                    style={{ fontSize: 10.5 * U }}>{l.text}</text>
                ))}
              </g>
            ))}

            {ghosts.map((g, i) => (
              <polygon key={`gh${i}`} className="ghost"
                points={g.map((p) => `${p.x.toFixed(0)},${p.y.toFixed(0)}`).join(" ")} />
            ))}

            {/* tutamaklar */}
            {handles.map((hd) => (
              <g key={hd.k} className="hnd">
                <circle data-h={hd.k} cx={hd.x} cy={hd.y} r={hSize} />
                {hd.k === "rot" && <text x={hd.x} y={hd.y + hSize * 0.4} style={{ fontSize: hSize * 1.2 }}>↻</text>}
              </g>
            ))}

            {breach.length > 0 && metas.filter(({ b }) => breachSet.has(b.id)).map(({ b, m }) => (
              <polygon key={`br${b.id}`} className="breach"
                points={m.outline.map((p) => `${p.x.toFixed(0)},${p.y.toFixed(0)}`).join(" ")}
                strokeWidth={Math.max(3, 2 / (pxPerCm || 0.01))} />
            ))}

            {plan.shapes.filter((s) => s.type === "icon").map((s) => (
              <Poi key={s.id} s={s} selected={selShapeId === s.id} U={U} />
            ))}

            {guides.map((g, i) => (
              <line key={i} className="guide"
                x1={g.axis === "x" ? g.v : g.a} y1={g.axis === "x" ? g.a : g.v}
                x2={g.axis === "x" ? g.v : g.z} y2={g.axis === "x" ? g.z : g.v}
                strokeWidth={Math.max(2, 1.4 / (pxPerCm || 0.01))} />
            ))}

            {marq && (
              <rect className="marq" x={Math.min(marq.x0, marq.x1)} y={Math.min(marq.y0, marq.y1)}
                width={Math.abs(marq.x1 - marq.x0)} height={Math.abs(marq.y1 - marq.y0)} />
            )}
            {calib && (
              <g className="cal">
                <line x1={calib.x0} y1={calib.y0} x2={calib.x1} y2={calib.y1} />
                <circle cx={calib.x0} cy={calib.y0} r={hSize * 0.7} />
                <circle cx={calib.x1} cy={calib.y1} r={hSize * 0.7} />
              </g>
            )}
            {draft && (tool === "grid" || tool === "shape") && (
              <rect className="draft" x={Math.min(draft.x0, draft.x1)} y={Math.min(draft.y0, draft.y1)}
                width={Math.abs(draft.x1 - draft.x0)} height={Math.abs(draft.y1 - draft.y0)} />
            )}
            {draft && ["row", "fan", "measure", "cal"].includes(tool) && (
              <>
                <line className="draft" x1={draft.x0} y1={draft.y0} x2={draft.x1} y2={draft.y1} />
                <text className="mtxt" x={(draft.x0 + draft.x1) / 2} y={(draft.y0 + draft.y1) / 2 - 40}
                  style={{ fontSize: Math.max(90, view.w / 40) }}>
                  {(Math.hypot(draft.x1 - draft.x0, draft.y1 - draft.y0) / 100).toFixed(2)} m
                </text>
              </>
            )}
            {poly && <polyline className="draft" fill="none" points={poly.pts.map((p) => `${p.x},${p.y}`).join(" ")} />}

            {footDraft && footDraft.length > 0 && (
              <g className="footd">
                <polyline points={[...footDraft, footDraft[0]].map((p) => `${p.x},${p.y}`).join(" ")}
                  strokeWidth={Math.max(3, 2 / (pxPerCm || 0.01))} />
                {footDraft.map((p, i) => (
                  <circle key={i} cx={p.x} cy={p.y} r={Math.max(6, 5 / (pxPerCm || 0.01))} />
                ))}
              </g>
            )}
          </svg>

          {!plan.blocks.length && !plan.shapes.length && (
            <div className="cempty">Sol menüden bir araç seçip çizmeye başlayın, ya da yukarıdan bir örnek salon açın.</div>
          )}

          {legend && (
            <div className="lgnd">
              <p>Katlar<button className="link" onClick={() => setLegend(false)}>gizle</button></p>
              {levels.map((l, i) => (
                <div key={l}>
                  <i style={{ background: LEVEL_COLORS[i % LEVEL_COLORS.length] }} />
                  <span>{l}</span>
                  <b className="n">{(levelCounts[l] || 0).toLocaleString("tr-TR")}</b>
                </div>
              ))}
              {Object.entries(attrTotals).filter(([k]) => ATTRS[k]).map(([k, v]) => (
                <div key={k} className="at">
                  <i style={{ background: "transparent", border: `2px solid ${ATTRS[k].color}` }} />
                  <span>{ATTRS[k].short}</span>
                  <b className="n">{v.toLocaleString("tr-TR")}</b>
                </div>
              ))}
            </div>
          )}

          <div className="status">
            <span className="n">{totalSeats.toLocaleString("tr-TR")}</span>&nbsp;koltuk
            <span className="tsep" />
            <span className="n">{metas.length}</span>&nbsp;blok
            {selIds.length > 0 && <><span className="tsep" />
              <span className="hi"><span className="n">{selIds.length}</span> blok ·{" "}
              <span className="n">{selSeatTotal.toLocaleString("tr-TR")}</span> koltuk seçili</span></>}
            {selSeats.size > 1 && <><span className="tsep" />
              <span className="hi"><span className="n">{selSeats.size}</span> koltuk seçili</span></>}
            <span className="tsep" />
            <span className={seatMode ? "ok" : "wr"}>
              {seatMode ? "koltuk görünümü" : "blok görünümü · yakınlaş"}
            </span>
            {breach.length > 0 && <><span className="tsep" />
              <button className="alert" onClick={() => { setSelIds(breach); setSelShapeId(null); }}>
                {breach.length} blok salon sınırı dışında
              </button></>}
            {msg && <><span className="tsep" />
              <span className={msgErr ? "hi err" : "hi"} title={msg}>{msg}</span></>}

            <div className="grow" />

            <label className="chk"><input type="checkbox" checked={snapOn}
              onChange={(e) => setSnapOn(e.target.checked)} />Yapış</label>
            <select className="mini" value={gridStep} onChange={(e) => setGridStep(+e.target.value)}>
              <option value={10}>10 cm</option><option value={25}>25 cm</option>
              <option value={50}>50 cm</option><option value={100}>1 m</option>
            </select>
            {hoverId && <><span className="tsep" />
              <span className="n hi">{hoverId}</span></>}
            <span className="tsep" />
            <span className="n coord">{(cursor.x / 100).toFixed(1)} · {(cursor.y / 100).toFixed(1)} m</span>
            <span className="tsep" />
            <div className="sbar" title="Ölçek">
              <div className="sline" style={{ width: `${Math.round(scaleBar.px)}px` }} />
              <span className="n">{scaleBar.label}</span>
            </div>
            <span className="tsep" />
            <button className={plates ? "on" : ""} onClick={() => setPlates(!plates)}>Taban</button>
            <button className={legend ? "on" : ""} onClick={() => setLegend(!legend)}>Lejant</button>
            <button className="ib" onClick={() => zoomCenter(1.35)} title="Uzaklaş">−</button>
            <span className="n zoompct" title="%100'e sıfırla" onClick={zoomToAll}>
              {zoomPct}%
            </span>
            <button className="ib" onClick={() => zoomCenter(1 / 1.35)} title="Yakınlaş">+</button>
            <button onClick={zoomToAll}>Sığdır</button>
            <button onClick={zoomToSelection}>{selIds.length ? "Seçime zumla" : "İçeriğe zumla"}</button>
          </div>

          {footDraft && (
            <div className="tip">
              Tabanın köşelerini tıkla · <b>Enter</b> veya çift tık ile kapat · <b>Esc</b> iptal
              {footDraft.length > 0 && ` · ${footDraft.length} nokta`}
            </div>
          )}

          {tool === "cal" && !calib && (
            <div className="tip">Altlıkta bilinen iki noktayı sürükleyerek işaretle</div>
          )}

          {calib && (
            <div className="calbar">
              <span>Ölçülen: <b>{(calib.px / 100).toFixed(2)} m</b> · gerçek mesafe:</span>
              <input autoFocus value={calib.meters}
                onChange={(e) => setCalib({ ...calib, meters: e.target.value })}
                onKeyDown={(e) => e.key === "Enter" && applyCal()} />
              <span>m</span>
              <button className="pri" onClick={applyCal}>Uygula</button>
              <button onClick={() => setCalib(null)}>İptal</button>
            </div>
          )}

          {plan.underlay && (
            <div className="ulbar">
              <span>Altlık</span>
              <input type="range" min="0" max="1" step="0.05" value={plan.underlay.opacity}
                onChange={(e) => setPlan({ ...plan, underlay: { ...plan.underlay, opacity: +e.target.value } })} />
              <button onClick={() => commit({ ...plan, underlay: null })}>Kaldır</button>
            </div>
          )}

          {setOpen && (
            <PlanSettings plan={plan} sample={metas[0]} onClose={() => setSetOpen(false)}
              onCsv={exportCSV} onSvg={exportSVG} onCsvImport={importCSV} saved={saved} venues={venues} vk={vk}
              theme={theme} onTheme={setThemePref} wheelPref={wheelPref} onWheelPref={setWheelPrefP}
              onNew={newPlan} onDup={duplicatePlan} onDel={deletePlan}
              onChange={(p) => commit({ ...plan, ...p })} />
          )}

          {verOpen && (
            <div className="ver">
              <p>Sürümler
                <button className="link" onClick={() => setVerOpen(false)}>kapat</button></p>

              {breach.length > 0 && (
                <p className="stop">
                  {breach.length} blok salon sınırının dışında. Yayınlamadan önce düzeltilmeli.
                </p>
              )}

              <div className="pubrow">
                <input value={pubNote} placeholder="Sürüm notu (ör. yan localar eklendi)"
                  onChange={(e) => setPubNote(e.target.value)}
                  onKeyDown={(e) => e.key === "Enter" && doPublish()} />
                <button className="pri" onClick={doPublish} disabled={breach.length > 0}>Yayınla</button>
              </div>

              {!versions.length && <p className="mut sm">Henüz sürüm yok. İlk yayın taban çizgisini kurar.</p>}

              <ul className="vlist">
                {[...versions].reverse().map((v) => (
                  <li key={v.v} className={v.v === plan.published ? "on" : ""}>
                    <div>
                      <strong>v{v.v}{v.v === plan.published && " · yayında"}</strong>
                      <span>{new Date(v.at).toLocaleString("tr-TR")} · {v.seats.toLocaleString("tr-TR")} koltuk</span>
                      <em>{v.note}</em>
                    </div>
                    <button onClick={() => doDiff(v)}>Fark</button>
                    <button onClick={() => doRestore(v)}>Geri yükle</button>
                  </li>
                ))}
              </ul>

              {diff && (
                <div className="diff">
                  <p className="lab">v{diff.v} → taslak ·
                    {" "}{diff.from.toLocaleString("tr-TR")} → {diff.to.toLocaleString("tr-TR")} koltuk</p>
                  <div className={diff.removed.length ? "err" : "ok"}>
                    {diff.removed.length
                      ? `${diff.removed.length} koltuk kimliği YOK OLUYOR — bu kimliklere satılmış bilet varsa karşılığı kalmaz`
                      : "Kaybolan koltuk kimliği yok"}
                    {diff.removed.length > 0 && <em>{diff.removed.slice(0, 6).join(", ")}{diff.removed.length > 6 ? " …" : ""}</em>}
                  </div>
                  {diff.added.length > 0 && <div className="info">{diff.added.length} yeni koltuk<em>{diff.added.slice(0, 5).join(", ")}</em></div>}
                  {diff.moved.length > 0 && <div className="warn">{diff.moved.length} koltuk yer değiştirdi (&gt;25 cm)</div>}
                  {diff.changed.length > 0 && <div className="warn">{diff.changed.length} koltuğun kategorisi veya niteliği değişti</div>}
                </div>
              )}
            </div>
          )}

          {match && (
            <div className="ver">
              <p>Koltuk listesi eşleştirme
                <button className="link" onClick={() => setMatch(null)}>kapat</button></p>
              <p className="mut sm">{match.file} · {match.total.toLocaleString("tr-TR")} satır ·
                bulunan sütunlar: {match.cols.join(", ")}</p>

              <div className="diff">
                <div className="ok">{match.hits.length.toLocaleString("tr-TR")} koltuk eşleşti</div>
                {match.changing.length > 0 && (
                  <div className="warn">{match.changing.length.toLocaleString("tr-TR")} koltuğun kimliği listedekinden farklı
                    <em>{match.changing.slice(0, 3).map((h) => `${h.s.id} → ${h.csvId}`).join(" · ")}</em></div>
                )}
                {match.missing.length > 0 && (
                  <div className="err">{match.missing.length.toLocaleString("tr-TR")} koltuk listede var, çizimde yok
                    <em>{match.missing.slice(0, 4).map((m) => m.key.replace(/\|/g, "-")).join(", ")}</em></div>
                )}
                {match.extra.length > 0 && (
                  <div className="err">{match.extra.length.toLocaleString("tr-TR")} koltuk çizimde var, listede yok
                    <em>{match.extra.slice(0, 4).map((s) => `${s.block}-${s.row}-${s.num}`).join(", ")}</em></div>
                )}
                {match.dupes.length > 0 && (
                  <div className="warn">{match.dupes.length} yinelenen satır atlandı</div>
                )}
              </div>

              {match.changing.length > 0 && (
                <button className="wide" onClick={adoptIds}>
                  {match.changing.length.toLocaleString("tr-TR")} kimliği benimse
                </button>
              )}
              <p className="mut sm">
                Benimseme çizimi değiştirmez; eşleşen koltuklara mevcut sistemdeki kimliği yazar.
                Eksik/fazla satırlar sıfırlanana kadar plan yayına verilmemeli.
              </p>
            </div>
          )}

          {report && (
            <div className="val">
              <p>Doğrulama · {report.total.toLocaleString("tr-TR")} koltuk tarandı
                <button className="link" onClick={() => setReport(null)}>kapat</button></p>
              {report.list.map((i, k) => (
                <div key={k} className={i.ids && i.ids.length ? `${i.t} go` : i.t}
                  onClick={i.ids && i.ids.length ? () => {
                    setSelIds(i.ids); setSelShapeId(null);
                    zoomToBBox(i.ids.map((id) => metaById.get(id)).filter(Boolean));
                  } : undefined}>
                  {i.m}{i.d && <em>{i.d}</em>}
                </div>
              ))}
            </div>
          )}
        </main>

        <aside className="props">
          {selSeats.size > 1 ? (
            <MultiSeatPanel n={selSeats.size} onOps={seatOps}
              onClear={() => { setSelSeats(new Set()); setSelSeat(null); }} />
          ) : selSeat && seatOv ? (
            <SeatPanel sel={selSeat} info={selSeatInfo} ov={seatOv} onToggle={(k) => toggleOv(selSeat, k)}
              onSet={(p) => setOv(selSeat, p)} onClose={() => setSelSeat(null)} />
          ) : selShape ? (
            <ShapePanel s={selShape} blocks={plan.blocks} metas={metaById} onAuto={doAutoGates}
              onChange={(p) => patchShape(selShape.id, p)}
              onDelete={() => { commit({ ...plan, shapes: plan.shapes.filter((x) => x.id !== selShape.id) }); setSelShapeId(null); }} />
          ) : selBlocks.length > 1 ? (
            <MultiPanel n={selBlocks.length} seats={selSeatTotal} levels={levels} arr={arrProps}
              onAlign={alignSel} onDist={distributeSel} onRenumber={doRenumber} onSet={patchSelected} onMirror={mirror}
              onDelete={() => { commit({ ...plan, blocks: plan.blocks.filter((b) => !selIds.includes(b.id)) }); setSelIds([]); }} />
          ) : selBlock ? (
            <BlockPanel b={selBlock} levels={levels} meta={metaById.get(selBlock.id)} arr={arrProps}
              doors={gates.get(selBlock.id)}
              onFootDraw={footStart} onFootSeed={footSeed} onFootClear={footClear}
              onZoom={() => zoomTo(metaById.get(selBlock.id))}
              onChange={(p) => patchBlock(selBlock.id, p)} onMirror={mirror}
              onDup={() => { const cp = { ...selBlock, id: nid(), x: selBlock.x + 300, y: selBlock.y + 300 }; commit({ ...plan, blocks: [...plan.blocks, cp] }); setSelIds([cp.id]); }}
              onDelete={() => { commit({ ...plan, blocks: plan.blocks.filter((x) => x.id !== selBlock.id) }); setSelIds([]); }} />
          ) : (
            <div className="empty">Bir blok, koltuk veya şekil seç</div>
          )}
        </aside>
      </div>
    </div>
  );
}

/* ─────────────────────────  PANELLER  ───────────────────────── */

const Row = ({ label, children }) => <label className="pr"><span>{label}</span>{children}</label>;

/** Dikdörtgen seçimle işaretlenmiş koltuklara toplu işlem. */
function MultiSeatPanel({ n, onOps, onClear }) {
  return (
    <div className="panel">
      <div className="phead">
        <span className="plabel wide">{n.toLocaleString("tr-TR")} koltuk seçili</span>
        <button className="link" onClick={onClear}>bırak</button>
      </div>

      <section>
        <p className="lab">Nitelik ata</p>
        <select className="full" defaultValue="_"
          onChange={(e) => { if (e.target.value === "_") return;
            const v = e.target.value === "-" ? "" : e.target.value;
            onOps((o) => { if (v) o.at = v; else delete o.at; return o; }); e.target.value = "_"; }}>
          <option value="_">seç…</option>
          <option value="-">Normal koltuk</option>
          {Object.entries(ATTRS).map(([k, a]) => <option key={k} value={k}>{a.label}</option>)}
        </select>
      </section>

      <section>
        <p className="lab">Varlık</p>
        <div className="acts">
          <button onClick={() => onOps((o) => { o.gap = true; delete o.rm; return o; })}>Boşluk yap</button>
          <button onClick={() => onOps((o) => { o.rm = true; delete o.gap; return o; })}>Sil</button>
          <button onClick={() => onOps((o) => { delete o.gap; delete o.rm; return o; })}>Geri getir</button>
        </div>
        <p className="mut sm">Boşluk koltuğu gizler ama numarayı tüketir; sil numarayı da geri verir.</p>
      </section>

      <section>
        <p className="lab">Düzeltmeleri sıfırla</p>
        <div className="acts">
          <button onClick={() => onOps((o) => { delete o.dx; delete o.dy; delete o.rot; return o; })}>Konum</button>
          <button onClick={() => onOps((o) => { delete o.label; return o; })}>Etiket</button>
          <button onClick={() => onOps((o) => { delete o.id; return o; })}>Kimlik</button>
        </div>
        <p className="mut sm">Ok tuşlarıyla seçili koltukları hep birlikte kaydırabilirsin.</p>
      </section>
    </div>
  );
}

/** Seçim yokken: plan seviyesindeki ayarlar. */
function PlanSettings({ plan, sample, onClose, onCsv, onSvg, onCsvImport, saved, venues, vk, theme, onTheme, wheelPref, onWheelPref, onNew, onDup, onDel, onChange }) {
  const tpl = plan.idTemplate || DEF_TPL;
  const s = sample ? buildSeats(sample.b, sample.m, tpl).seats.find((x) => !x.gap) : null;
  return (
    <div className="ver">
      <p>Plan ayarları<button className="link" onClick={onClose}>kapat</button></p>

      <input className="tplin name" value={plan.name}
        onChange={(e) => onChange({ name: e.target.value })} />

      <div className="sec">
        <p className="lab">Koltuk kimliği şablonu</p>
        <input className="tplin" value={tpl} onChange={(e) => onChange({ idTemplate: e.target.value })} />
        <div className="toks">
          {ID_TOKENS.map((t) => (
            <button key={t} onClick={() => onChange({ idTemplate: tpl + t })}>{t}</button>
          ))}
          <button onClick={() => onChange({ idTemplate: DEF_TPL })}>sıfırla</button>
        </div>
        {s && <p className="sample">Örnek: <b>{s.id}</b>{s.adopted && " (benimsenmiş)"}</p>}
        <p className="mut sm">
          Mekân zaten bilet satıyorsa kimlik onlarda. Listeyi yükle; blok, sıra ve koltuk
          üzerinden eşleştirip kimlikleri benimseriz.
        </p>
        <label className="wide asfile">
          Koltuk listesi yükle (CSV)
          <input type="file" accept=".csv,text/csv" onChange={onCsvImport} hidden />
        </label>
      </div>

      <div className="sec">
        <p className="lab">Planlar</p>
        <div className="acts">
          <button onClick={onNew}>Yeni</button>
          <button onClick={onDup}>Kopyala</button>
          <button className="dgr" disabled={!saved.includes(vk) || Object.keys(venues).length < 2}
            onClick={() => onDel(vk)}>Sil</button>
        </div>
        <p className="mut sm">
          Plan geçişi üstteki menüden. Düzenlemeler otomatik kaydediliyor; altlık görseli kaydedilmez.
        </p>
      </div>

      <div className="sec">
        <p className="lab">Görünüm</p>
        <div className="seg">
          {[["light", "Açık"], ["dark", "Koyu"], ["system", "Sistem"]].map(([k, l]) => (
            <button key={k} className={theme === k ? "on" : ""} onClick={() => onTheme(k)}>{l}</button>
          ))}
        </div>
        <p className="mut sm">Sistem seçiliyken işletim sisteminin tercihini izler.</p>

        <p className="lab" style={{ marginTop: 14 }}>Tekerlek davranışı</p>
        <div className="seg">
          {[["auto", "Otomatik"], ["trackpad", "Trackpad"], ["mouse", "Fare"]].map(([k, l]) => (
            <button key={k} className={wheelPref === k ? "on" : ""} onClick={() => onWheelPref(k)}>{l}</button>
          ))}
        </div>
        <p className="mut sm">
          <b>Trackpad</b>: iki parmak kaydırma gezinir, pinch yakınlaştırır.
          <b> Fare</b>: tekerlek yakınlaştırır, Shift ile yatay gezinir.
          Otomatik ilk kaydırmadan hangisi olduğunu anlar.
        </p>
      </div>

      <div className="sec">
        <p className="lab">Çıktılar</p>
        <div className="acts">
          <button onClick={onCsv}>CSV</button>
          <button onClick={onSvg}>SVG</button>
        </div>
        <p className="mut sm">SVG, görünen alanı mekâna onaya göndermek için verir.</p>
      </div>
    </div>
  );
}

/** Mekân işareti: yuvarlak plaka + simge + isteğe bağlı etiket.
 *  Ölçü santimetre; salon ölçeğinde okunur kalması için plaka ile birlikte
 *  büyüyor, çizgi kalınlığı da onunla ölçekleniyor. */
function Poi({ s, selected, U }) {
  const ic = POI[s.icon] || POI.info;
  /* İşaret bir harita imidir, fiziksel nesne değil: ekranda sabit boyda.
     Salonda 90 cm, stadyumda 3,4 m diye ayrı ayrı ayarlanması yanlıştı. */
  const R = (s.size || 34) * U * 0.5;
  const k = (R * 1.25) / 24;
  return (
    <g className={selected ? "poi on" : "poi"} transform={`translate(${s.x} ${s.y}) rotate(${s.rot || 0})`}>
      <circle data-s={s.id} r={R} strokeWidth={1.6 * U} />
      <g transform={`translate(${-12 * k} ${-12 * k}) scale(${k})`} strokeWidth={1.9}>
        <IconParts parts={ic.p || []} />
      </g>
      {s.label && <text y={R * 2.05} style={{ fontSize: R * 0.68 }}>{s.label}</text>}
    </g>
  );
}

/* Zemin dokusu: düz tek renk bir dikdörtgen oyuncak gibi durur — çimde
   biçme şeridi, parkede tahta şeridi gerçek bir zemin hissi verir.
   Sadece surf2 tanımlı sahalarda (P.stripes şerit sayısını belirler). */
function MowStripes({ w, h, surf2, n = 9 }) {
  const sw = w / n;
  return Array.from({ length: n }, (_, i) => i % 2 === 1 && (
    <rect key={i} x={-w / 2 + i * sw} y={-h / 2} width={sw} height={h} fill={surf2} />
  ));
}

/** Saha zemini + nizami çizgi işaretlemeleri. */
function Pitch({ s, selected }) {
  const P = PITCHES[s.sport] || PITCHES.generic;
  const marks = useMemo(() => P.marks(s.w, s.h), [P, s.w, s.h]);
  return (
    <g className={selected ? "pit on" : "pit"} transform={`translate(${s.x} ${s.y}) rotate(${s.rot})`}>
      <rect data-s={s.id} x={-s.w / 2} y={-s.h / 2} width={s.w} height={s.h}
        rx={P.rx || 0} fill={P.surf} stroke={P.line} strokeWidth={P.blw || P.lw} />
      {P.surf2 && <MowStripes w={s.w} h={s.h} surf2={P.surf2} n={P.stripes || 9} />}
      <g fill="none" strokeLinecap="butt" pointerEvents="none">
        {marks.map((k, i) => {
          const st = { stroke: k.c || P.line, strokeWidth: k.lw || P.lw,
            strokeDasharray: k.dash || undefined, opacity: k.o || 1, fill: k.fill || "none" };
          if (k.t === "line") return <line key={i} x1={k.x1} y1={k.y1} x2={k.x2} y2={k.y2} {...st} />;
          if (k.t === "rect") return <rect key={i} x={k.x} y={k.y} width={k.w} height={k.h} {...st} />;
          if (k.t === "circle") return <circle key={i} cx={k.cx} cy={k.cy} r={k.r} {...st} />;
          if (k.t === "dot") return <circle key={i} cx={k.cx} cy={k.cy} r={k.r}
            fill={k.c || P.line} stroke="none" />;
          return <path key={i} d={k.d} {...st} />;
        })}
      </g>
    </g>
  );
}

const Num = ({ v, on, step = 1, min }) => (
  <input type="number" value={v} step={step} min={min}
    onChange={(e) => on(e.target.value === "" ? 0 : +e.target.value)} />
);

function ArraySection({ lin, setLin, rad, setRad, onArrayL, onArrayR, prev, setPrev }) {
  return (
    <>
      <details className={`sec${prev === "lin" ? " prev" : ""}`}
        onToggle={(e) => setPrev(e.target.open ? "lin" : null)}>
        <summary className="lab">Doğrusal dizi{prev === "lin" && <em>önizleme açık</em>}</summary>
        <div className="g3">
          <Row label="Kopya"><Num v={lin.count} on={(v) => setLin({ ...lin, count: Math.max(2, v) })} min={2} /></Row>
          <Row label="ΔX (cm)"><Num v={lin.dx} on={(v) => setLin({ ...lin, dx: v })} step={50} /></Row>
          <Row label="ΔY (cm)"><Num v={lin.dy} on={(v) => setLin({ ...lin, dy: v })} step={50} /></Row>
        </div>
        <button className="wide" onClick={onArrayL}>Doğrusal çoğalt</button>
      </details>
      <details className={`sec${prev === "rad" ? " prev" : ""}`}
        onToggle={(e) => setPrev(e.target.open ? "rad" : null)}>
        <summary className="lab">Radyal dizi{prev === "rad" && <em>önizleme açık</em>}</summary>
        <div className="g2">
          <Row label="Merkez X"><Num v={rad.cx} on={(v) => setRad({ ...rad, cx: v })} step={100} /></Row>
          <Row label="Merkez Y"><Num v={rad.cy} on={(v) => setRad({ ...rad, cy: v })} step={100} /></Row>
          <Row label="Kopya"><Num v={rad.count} on={(v) => setRad({ ...rad, count: Math.max(2, v) })} min={2} /></Row>
          <Row label="Açı adımı °"><Num v={rad.step} on={(v) => setRad({ ...rad, step: v })} step={5} /></Row>
        </div>
        <button className="wide" onClick={onArrayR}>Radyal çoğalt</button>
      </details>
    </>
  );
}

function MultiPanel({ n, seats, levels, arr, onAlign, onDist, onRenumber, onSet, onMirror, onDelete }) {
  const [rn, setRn] = useState({ start: 100, cx: 0, cy: 0, from: 135, cw: true, prefix: "" });
  return (
    <div className="panel">
      <div className="phead"><span className="plabel wide">{n} blok seçili</span></div>
      <div className="cap"><b>{seats.toLocaleString("tr-TR")}</b> koltuk</div>

      <section>
        <p className="lab">Hizala</p>
        <div className="alg">
          <button onClick={() => onAlign("l")} title="Sola">⇤</button>
          <button onClick={() => onAlign("cx")} title="Yatay ortala">⇔</button>
          <button onClick={() => onAlign("r")} title="Sağa">⇥</button>
          <button onClick={() => onAlign("t")} title="Üste">⇡</button>
          <button onClick={() => onAlign("cy")} title="Dikey ortala">⇕</button>
          <button onClick={() => onAlign("b")} title="Alta">⇣</button>
        </div>
        <div className="acts" style={{ marginTop: 7 }}>
          <button onClick={() => onDist("x")}>Yatay eşit dağıt</button>
          <button onClick={() => onDist("y")}>Dikey eşit dağıt</button>
        </div>
        <p className="mut sm">Ok tuşları 1 cm kaydırır · Shift 10 cm · Alt ızgara adımı.</p>
      </section>

      <ArraySection {...arr} />
      <section>
        <p className="lab">Toplu yeniden numaralandırma</p>
        <div className="g2">
          <Row label="Başlangıç no"><Num v={rn.start} on={(v) => setRn({ ...rn, start: v })} /></Row>
          <Row label="Ön ek"><input value={rn.prefix} placeholder="boş" onChange={(e) => setRn({ ...rn, prefix: e.target.value })} /></Row>
          <Row label="Merkez X"><Num v={rn.cx} on={(v) => setRn({ ...rn, cx: v })} step={100} /></Row>
          <Row label="Merkez Y"><Num v={rn.cy} on={(v) => setRn({ ...rn, cy: v })} step={100} /></Row>
          <Row label="Başlangıç açısı °"><Num v={rn.from} on={(v) => setRn({ ...rn, from: v })} step={15} /></Row>
          <Row label="Yön">
            <select value={rn.cw ? "cw" : "ccw"} onChange={(e) => setRn({ ...rn, cw: e.target.value === "cw" })}>
              <option value="cw">Saat yönü</option><option value="ccw">Saat yönü tersi</option>
            </select>
          </Row>
        </div>
        <button className="wide" onClick={() => onRenumber(rn)}>Yeniden numarala</button>
      </section>
      <section>
        <p className="lab">Toplu değiştir</p>
        <div className="g2">
          <Row label="Görünüm rengi">
            <div className="sw">
              <button title="Kat rengini kullan" onClick={() => onSet({ color: "" })}>A</button>
              {PALETTE.map((c) => (
                <button key={c} title={c} style={{ background: c }} onClick={() => onSet({ color: c })} />
              ))}
            </div>
          </Row>
          <Row label="Kat / kuşak">
            <input list="lv2" placeholder="değiştirme" onBlur={(e) => e.target.value && onSet({ level: e.target.value })} />
            <datalist id="lv2">{levels.map((l) => <option key={l} value={l} />)}</datalist>
          </Row>
          <Row label="Taban payı (cm)">
            <input type="number" min="0" step="5" placeholder="değiştirme"
              onBlur={(e) => e.target.value !== "" && onSet({ pad: Math.max(0, +e.target.value) })} />
          </Row>
        </div>
        <Row label="Varsayılan nitelik">
          <select defaultValue="_" onChange={(e) => e.target.value !== "_" && onSet({ attr: e.target.value })}>
            <option value="_">değiştirme</option>
            <option value="">Normal koltuk</option>
            {Object.entries(ATTRS).map(([k, a]) => <option key={k} value={k}>{a.label}</option>)}
          </select>
        </Row>
      </section>
      <section className="acts">
        <button onClick={onMirror}>Aynala</button>
        <button className="dgr" onClick={onDelete}>Sil</button>
      </section>
    </div>
  );
}

function SeatPanel({ sel, info, ov, onToggle, onSet, onClose }) {
  return (
    <div className="panel">
      <div className="phead">
        <span className="plabel wide seatid">{info ? info.id : "Koltuk"}</span>
        <button className="link" onClick={onClose}>kapat</button>
      </div>
      {info && (
        <div className="cap">
          <b>{info.block}</b> blok · <b>{info.row}</b> sıra · <b>{info.num}</b>. koltuk
        </div>
      )}
      <section>
        <p className="lab">Konum düzeltmesi (cm)</p>
        <div className="g2">
          <Row label="X kaydır"><Num v={ov.dx || 0} on={(v) => onSet({ dx: v })} step={5} /></Row>
          <Row label="Y kaydır"><Num v={ov.dy || 0} on={(v) => onSet({ dy: v })} step={5} /></Row>
          <Row label="Döndür °"><Num v={ov.rot || 0} on={(v) => onSet({ rot: v })} step={5} /></Row>
          <Row label="Etiket"><input value={ov.label ?? ""} placeholder="otomatik" onChange={(e) => onSet({ label: e.target.value })} /></Row>
        </div>
      </section>
      <section>
        <p className="lab">Nitelik</p>
        <select className="full" value={ov.at ?? ""} onChange={(e) => onSet({ at: e.target.value })}>
          <option value="">Bloğun varsayılanı / normal</option>
          {Object.entries(ATTRS).map(([k, a]) => <option key={k} value={k}>{a.label}</option>)}
        </select>
      </section>
      <section className="acts">
        <button className={ov.gap ? "on" : ""} onClick={() => onToggle("gap")}>Boşluk</button>
        <button className={ov.rm ? "on" : ""} onClick={() => onToggle("rm")}>Sil</button>
        <button onClick={() => onSet({ dx: 0, dy: 0, rot: 0, label: "" })}>Sıfırla</button>
      </section>
      <p className="ovinfo">Boşluk koltuğu gizler ama numarayı tüketir. Sil numarayı da geri verir.</p>
    </div>
  );
}

function ShapePanel({ s, blocks, metas, onChange, onDelete, onAuto }) {
  const isDoor = s.type === "door";
  const set = new Set(s.blocks || []);
  const toggle = (id) => {
    const n = new Set(set);
    n.has(id) ? n.delete(id) : n.add(id);
    onChange({ blocks: [...n] });
  };
  const seats = (s.blocks || []).reduce((a, id) => a + (metas.get(id)?.seatCount || 0), 0);
  return (
    <div className="panel">
      <div className="phead">
        <input className="plabel wide" value={s.label} placeholder="Etiket" onChange={(e) => onChange({ label: e.target.value })} />
      </div>
      {isDoor && <div className="cap"><b>{set.size}</b> blok · {seats.toLocaleString("tr-TR")} koltuk</div>}
      {s.type === "icon" ? (
        <section>
          <p className="lab">İşaret</p>
          <div className="poigrid wide">
            {Object.entries(POI).map(([k, v]) => (
              <button key={k} className={s.icon === k ? "on" : ""} title={v.label}
                onClick={() => onChange({ icon: k, label: s.label === (POI[s.icon] || {}).label ? v.label : s.label })}>
                <svg viewBox="0 0 24 24" fill="none"><IconParts parts={v.p || []} /></svg>
              </button>
            ))}
          </div>
          <div className="g2" style={{ marginTop: 9 }}>
            <Row label="Boyut (px)">
              <Num v={s.size || 34} on={(v) => onChange({ size: Math.max(16, Math.min(80, v)) })} step={4} />
            </Row>
            <Row label="Döndür °"><Num v={s.rot} on={(v) => onChange({ rot: v })} step={15} /></Row>
            <Row label="X (cm)"><Num v={Math.round(s.x)} on={(v) => onChange({ x: v })} step={10} /></Row>
            <Row label="Y (cm)"><Num v={Math.round(s.y)} on={(v) => onChange({ y: v })} step={10} /></Row>
          </div>
          <p className="mut sm">Etiketi boş bırakırsan sadece simge görünür.</p>
        </section>
      ) : (
      <section>
        <div className="g2">
          <Row label="Tip">
            <select value={s.type} onChange={(e) => onChange({ type: e.target.value })}>
              {Object.entries(SHAPES).map(([k, v]) => <option key={k} value={k}>{v.label}</option>)}
            </select>
          </Row>
          <Row label="Döndür °"><Num v={s.rot} on={(v) => onChange({ rot: v })} step={5} /></Row>
          <Row label="X (cm)"><Num v={Math.round(s.x)} on={(v) => onChange({ x: v })} step={10} /></Row>
          <Row label="Y (cm)"><Num v={Math.round(s.y)} on={(v) => onChange({ y: v })} step={10} /></Row>
          {s.kind === "rect" && <>
            <Row label={isDoor ? "Çap" : "Genişlik"}><Num v={Math.round(s.w)} on={(v) => onChange({ w: Math.max(10, v) })} step={10} /></Row>
            {!isDoor && <Row label="Derinlik"><Num v={Math.round(s.h)} on={(v) => onChange({ h: Math.max(10, v) })} step={10} /></Row>}
          </>}
          <Row label="Yazı boyu"><Num v={s.fs || 100} on={(v) => onChange({ fs: Math.max(20, v) })} step={20} /></Row>
          {s.type === "standing" &&
            <Row label="Kapasite"><Num v={s.capacity} on={(v) => onChange({ capacity: Math.max(0, v) })} step={10} /></Row>}
        </div>
      </section>
      )}

      {isDoor && (
        <section>
          <p className="lab">Hizmet ettiği bloklar</p>
          <p className="mut sm">Biletin üstüne basılacak kapı bu listeden çıkar.</p>
          <ul className="picklist">
            {blocks.map((b) => (
              <li key={b.id} className={set.has(b.id) ? "on" : ""} onClick={() => toggle(b.id)}>
                <input type="checkbox" readOnly checked={set.has(b.id)} />
                <span>{b.name || b.label}</span>
                <i>{metas.get(b.id)?.seatCount ?? ""}</i>
              </li>
            ))}
          </ul>
          <button className="wide" onClick={onAuto}>Tüm blokları en yakın kapıya ata</button>
        </section>
      )}

      {s.type === "pitch" && (
        <section>
          <p className="lab">Saha tipi</p>
          <select className="full" value={s.sport || "generic"}
            onChange={(e) => { const P = PITCHES[e.target.value];
              onChange({ sport: e.target.value, w: P.w, h: P.h, label: P.label }); }}>
            {Object.entries(PITCHES).map(([k, v]) => <option key={k} value={k}>{v.label}</option>)}
          </select>
          <p className="mut sm">
            {PITCHES[s.sport]?.note} · şu an {(s.w / 100).toFixed(2)} × {(s.h / 100).toFixed(2)} m.
            Dış ölçüyü değiştirebilirsin; ceza sahası, çemberler ve yaylar nizami ölçüde kalır.
          </p>
          <button className="wide" onClick={() => { const P = PITCHES[s.sport] || PITCHES.generic;
            onChange({ w: P.w, h: P.h }); }}>Nizami ölçüye dön</button>
        </section>
      )}

      <section className="acts"><button className="dgr" onClick={onDelete}>Sil</button></section>
    </div>
  );
}

function BlockPanel({ b, levels, meta, arr, doors, onFootDraw, onFootSeed, onFootClear, onChange, onMirror, onDup, onDelete, onZoom }) {
  const n = b.num;
  const setNum = (p) => onChange({ num: { ...n, ...p } });
  const kindLabel = b.kind === "fan" ? "Yelpaze" : b.kind === "free" ? "Serbest"
    : b.kind === "table" ? "Masa" : "Izgara";
  return (
    <div className="panel">
      <div className="phead">
        <input className="plabel wide" value={b.name || ""} placeholder="Blok adı"
          onChange={(e) => onChange({ name: e.target.value })} />
        <span className="kind">{kindLabel}</span>
      </div>
      <div className="cap">
        <b>{meta ? meta.seatCount.toLocaleString("tr-TR") : "—"}</b> koltuk
        <button className="link" onClick={onZoom}>bloğa zumla</button>
      </div>
      <div className="chips">
        {doors && doors.length
          ? doors.map((d) => <span key={d}><i style={{ background: "#E4B13E" }} />{d}</span>)
          : <span className="warnc">Kapı atanmamış</span>}
      </div>
      <section>
        <div className="g2">
          <Row label="Kimlik ön eki"><input value={b.label} onChange={(e) => onChange(relabelPatch(b, e.target.value))} /></Row>
          <Row label="Kat / kuşak">
            <input value={b.level || ""} list="lv" placeholder="Alt Tribün" onChange={(e) => onChange({ level: e.target.value })} />
            <datalist id="lv">{levels.map((l) => <option key={l} value={l} />)}</datalist>
          </Row>
          <Row label="X (cm)"><Num v={Math.round(b.x)} on={(v) => onChange({ x: v })} step={10} /></Row>
          <Row label="Y (cm)"><Num v={Math.round(b.y)} on={(v) => onChange({ y: v })} step={10} /></Row>
          <Row label="Döndür °"><Num v={Math.round(b.rot)} on={(v) => onChange({ rot: v })} step={5} /></Row>
          <Row label="Yandan erişim">
            <label className="chk" style={{ height: 32 }}>
              <input type="checkbox" checked={!b.noAisle}
                onChange={(e) => onChange({ noAisle: !e.target.checked })} />
              {b.noAisle ? "Kapalı (loca gibi)" : "Gerekli"}
            </label>
          </Row>
          <Row label="Görünüm rengi">
            <div className="sw">
              <button className={!b.color ? "on" : ""} title="Kat rengini kullan"
                onClick={() => onChange({ color: "" })}>A</button>
              {PALETTE.map((c) => (
                <button key={c} title={c} style={{ background: c }} className={b.color === c ? "on" : ""}
                  onClick={() => onChange({ color: c })} />
              ))}
            </div>
          </Row>
          <Row label="Varsayılan nitelik">
            <select value={b.attr || ""} onChange={(e) => onChange({ attr: e.target.value })}>
              <option value="">Normal koltuk</option>
              {Object.entries(ATTRS).map(([k, a]) => <option key={k} value={k}>{a.label}</option>)}
            </select>
          </Row>
        </div>
        {meta && Object.keys(meta.attrs || {}).length > 0 && (
          <div className="chips">
            {Object.entries(meta.attrs).map(([k, v]) => ATTRS[k] && (
              <span key={k}><i style={{ background: ATTRS[k].color }} />{ATTRS[k].short} {v}</span>
            ))}
          </div>
        )}
      </section>

      {b.kind === "table" && (
        <section>
          <p className="lab">Masa</p>
          <div className="g2">
            <Row label="Biçim">
              <select value={b.tShape || "round"} onChange={(e) => onChange({ tShape: e.target.value })}>
                <option value="round">Yuvarlak</option>
                <option value="rect">Dikdörtgen</option>
              </select>
            </Row>
            <Row label="Kişi"><Num v={b.seats || 4} on={(v) => onChange({ seats: Math.max(1, v) })} min={1} /></Row>
            <Row label={(b.tShape || "round") === "round" ? "Çap (cm)" : "Genişlik (cm)"}>
              <Num v={b.tW || 90} on={(v) => onChange({ tW: Math.max(40, v) })} step={10} />
            </Row>
            {(b.tShape || "round") === "rect" && (
              <Row label="Derinlik (cm)"><Num v={b.tH || 90} on={(v) => onChange({ tH: Math.max(40, v) })} step={10} /></Row>
            )}
            <Row label="Başlangıç açısı °"><Num v={b.a0 || 0} on={(v) => onChange({ a0: v })} step={15} /></Row>
            <Row label="Sandalye payı"><Num v={b.clear != null ? b.clear : 12}
              on={(v) => onChange({ clear: Math.max(0, v) })} step={5} /></Row>
          </div>
          <p className="mut sm">
            {b.seats || 4} kişilik {(b.tShape || "round") === "round" ? "yuvarlak" : "dikdörtgen"} masa.
            Çoğaltmak için aşağıdaki dizi araçlarını kullan.
          </p>
        </section>
      )}

      {b.kind !== "free" && b.kind !== "table" && (
        <section>
          <p className="lab">Geometri (cm)</p>
          {b.kind === "grid" ? (
            <div className="g2">
              <Row label="Sıra"><Num v={b.rows} on={(v) => onChange({ rows: Math.max(1, v) })} min={1} /></Row>
              <Row label="Koltuk"><Num v={b.cols} on={(v) => onChange({ cols: Math.max(1, v) })} min={1} /></Row>
              <Row label="Koltuk aralığı"><Num v={b.seatGap} on={(v) => onChange({ seatGap: Math.max(20, v) })} step={5} /></Row>
              <Row label="Sıra aralığı"><Num v={b.rowGap} on={(v) => onChange({ rowGap: Math.max(20, v) })} step={5} /></Row>
              <Row label="Kavis"><Num v={b.curve} on={(v) => onChange({ curve: v })} step={10} /></Row>
              <Row label="Sıra başına ±"><Num v={b.taper} on={(v) => onChange({ taper: v })} /></Row>
            </div>
          ) : (
            <>
              <Row label="Mod">
                <select value={b.mode || "span"} onChange={(e) => onChange({ mode: e.target.value })}>
                  <option value="span">Sabit açı dilimi</option>
                  <option value="pitch">Sabit koltuk aralığı</option>
                </select>
              </Row>
              <div className="g2" style={{ marginTop: 8 }}>
                <Row label="Sıra"><Num v={b.rows} on={(v) => onChange({ rows: Math.max(1, v) })} min={1} /></Row>
                <Row label="İlk yarıçap"><Num v={Math.round(b.r0)} on={(v) => onChange({ r0: Math.max(50, v) })} step={10} /></Row>
                {(b.mode || "span") === "pitch" ? (
                  <Row label="Merkez açı °"><Num v={b.aCenter} on={(v) => onChange({ aCenter: v })} /></Row>
                ) : (<>
                  <Row label="Başlangıç °"><Num v={b.aStart} on={(v) => onChange({ aStart: v })} /></Row>
                  <Row label="Bitiş °"><Num v={b.aEnd} on={(v) => onChange({ aEnd: v })} /></Row>
                </>)}
                <Row label="Sıra aralığı"><Num v={b.rowGap} on={(v) => onChange({ rowGap: Math.max(20, v) })} step={5} /></Row>
                <Row label="Koltuk aralığı"><Num v={b.seatGap} on={(v) => onChange({ seatGap: Math.max(20, v) })} step={5} /></Row>
              </div>
            </>
          )}
          <div className="g2" style={{ marginTop: 8 }}>
            <Row label="Sıra başına koltuk">
              <input value={b.counts} placeholder='"21..15" veya "5,5,6"' onChange={(e) => onChange({ counts: e.target.value })} />
            </Row>
            <Row label="Hizalama">
              <select value={b.align || "center"} onChange={(e) => onChange({ align: e.target.value })}>
                <option value="center">Ortalı</option><option value="left">Sola dayalı</option><option value="right">Sağa dayalı</option>
              </select>
            </Row>
          </div>
        </section>
      )}

      {b.kind !== "free" && (
        <details className="sec">
          <summary className="lab">Taban{b.foot && b.foot.length >= 3 && <em>elle çizilmiş</em>}</summary>
          {b.foot && b.foot.length >= 3 ? (<>
            <p className="mut sm">
              {b.foot.length} nokta. Köşeleri tuvalde sürükleyerek düzeltebilirsin.
            </p>
            <div className="acts">
              <button onClick={onFootDraw}>Yeniden çiz</button>
              <button onClick={onFootClear}>Otomatiğe dön</button>
            </div>
          </>) : (<>
            <Row label="Taban payı (cm)">
              <Num v={b.pad != null ? b.pad : 55} on={(v) => onChange({ pad: Math.max(0, v) })} step={5} />
            </Row>
            <p className="mut sm">
              Taban koltuklardan türetiliyor. Sütun, merdiven boşluğu veya düzensiz
              kenar varsa elle çiz.
            </p>
            <div className="acts">
              <button onClick={onFootDraw}>Elle çiz</button>
              <button onClick={onFootSeed}>Otomatikten başla</button>
            </div>
          </>)}
        </details>
      )}

      <ArraySection {...arr} />

      <details className="sec">
        <summary className="lab">Sıra etiketi</summary>
        <div className="g2">
          <Row label="Şema">
            <select value={n.rowScheme} onChange={(e) => setNum({ rowScheme: e.target.value })}>
              <option value="number">Sayı (1, 2, 3)</option>
              <option value="letter">Harf (A, B, C)</option>
              <option value="custom">Özel liste</option>
            </select>
          </Row>
          <Row label="Başlangıç"><Num v={n.rowStart} on={(v) => setNum({ rowStart: v })} /></Row>
        </div>
        {n.rowScheme === "custom" && (
          <Row label="Liste"><input value={n.rowCustom} onChange={(e) => setNum({ rowCustom: e.target.value })} /></Row>
        )}
        <div className="checks">
          <label><input type="checkbox" checked={n.rowRev} onChange={(e) => setNum({ rowRev: e.target.checked })} />Ters sırala</label>
          {n.rowScheme === "letter" &&
            <label><input type="checkbox" checked={n.skipAmbig} onChange={(e) => setNum({ skipAmbig: e.target.checked })} />I, O, Q atla</label>}
        </div>
      </details>

      <details className="sec">
        <summary className="lab">Koltuk numarası</summary>
        <div className="g2">
          <Row label="Şema">
            <select value={n.seatScheme} onChange={(e) => setNum({ seatScheme: e.target.value })}>
              <option value="seq">Ardışık (1, 2, 3)</option>
              <option value="odd">Sadece tek (101, 103…)</option>
              <option value="even">Sadece çift (102, 104…)</option>
              <option value="center">Merkezden dışa · tek/çift</option>
            </select>
          </Row>
          <Row label="Yön">
            <select value={n.seatDir} disabled={n.seatScheme === "center"} onChange={(e) => setNum({ seatDir: e.target.value })}>
              <option value="ltr">Soldan sağa</option><option value="rtl">Sağdan sola</option>
            </select>
          </Row>
          <Row label="Başlangıç"><Num v={n.seatStart} on={(v) => setNum({ seatStart: v })} /></Row>
          <Row label="Atlanacak"><input value={n.skip} placeholder="13, 4" onChange={(e) => setNum({ skip: e.target.value })} /></Row>
        </div>
        <Row label="Numara bağlama">
          <select value={n.anchor || "order"} disabled={n.seatScheme === "center"} onChange={(e) => setNum({ anchor: e.target.value })}>
            <option value="order">Sıradaki koltuk sırasına göre</option>
            <option value="column">Bloktaki sütun konumuna göre</option>
          </select>
        </Row>
      </details>

      <section className="acts">
        <button onClick={onMirror}>Aynala</button>
        <button onClick={onDup}>Çoğalt</button>
        <button className="dgr" onClick={onDelete}>Sil</button>
      </section>
      <p className="ovinfo">
        {Object.keys(b.ov).length} koltuk düzeltmesi ·{" "}
        <button className="link" onClick={() => onChange({ ov: {} })}>sıfırla</button>
      </p>
    </div>
  );
}

/* ─────────────────────────  STİL  ───────────────────────── */

const CSS = `
/* ══════════════════════════════════════════════════════════════════════
   Tasarım dili: bir çizim aleti, bir uygulama değil.
   Grafit yüzey · mavikopya aksanı · saç teli çizgiler · rakamlar monospace.
   Aksan rengi yalnızca üç yerde: aktif araç, birincil eylem, seçim.
   ══════════════════════════════════════════════════════════════════════ */

.ed.dark{
  --ink:#0E1013; --panel:#14161A; --panel2:#1B1E24; --ovl:#14161AF5;
  --line:#23262D; --bone:#E7E8EA; --dim:#9096A0; --mut:#818896;
  --acc:#4FA8BD; --accrgb:79,168,189; --accline:#1D3A44; --onacc:#07242B;
  --canvas:#0B0D10; --grid:#15181D; --grid2:#1E222A; --rowlab:#6A7079;
  --sel:#FFFFFF; --marqfill:rgba(255,255,255,.05);
  --ok:#5FA37F; --okline:#25392F; --err:#D9646F; --warn:#C2903F;
  --shapefill:#191C22; --shapeline:#333842; --seatoff:#272B33;
}
.ed.light{
  --ink:#FFFFFF; --panel:#FFFFFF; --panel2:#F2F4F6; --ovl:#FFFFFFF7;
  --line:#E4E7EB; --bone:#15181C; --dim:#5C626C; --mut:#6A6F77;
  --acc:#0891B2; --accrgb:8,145,178; --accline:#CFEEF3; --onacc:#FFFFFF;
  --canvas:#F9FAFB; --grid:#EDEFF2; --grid2:#E1E4E9; --rowlab:#6B717A;
  --sel:#15181C; --marqfill:rgba(21,24,28,.06);
  --ok:#2E7A57; --okline:#CBE2D6; --err:#B23A46; --warn:#95661A;
  --shapefill:#E2E4E8; --shapeline:#AEB3BB; --seatoff:#CBCED4;
}

.ed{
  --mono:ui-monospace,"SF Mono",Menlo,Consolas,monospace;
  position:fixed; inset:0; display:flex; flex-direction:column;
  background:var(--ink); color:var(--bone);
  font:400 12px/1.45 ui-sans-serif,-apple-system,"Segoe UI",Inter,Roboto,sans-serif;
  -webkit-font-smoothing:antialiased;
}
.ed *{ box-sizing:border-box; }
.ed .n{ font-family:var(--mono); font-variant-numeric:tabular-nums; letter-spacing:-.01em; }
.grow{ flex:1; }
.tsep{ width:1px; height:16px; background:var(--line); flex:none; }

/* ── üst şerit ── */
.top{ display:flex; align-items:center; gap:6px; height:44px; padding:0 12px;
  border-bottom:1px solid var(--line); flex:none; }
.venue{ background:none; border:1px solid transparent; color:var(--bone); border-radius:6px;
  padding:5px 8px; font-size:12.5px; font-weight:600; max-width:300px; }
.venue:hover{ border-color:var(--line); background:var(--panel2); }
.top button, .btn{ display:inline-flex; align-items:center; gap:5px; background:none;
  border:1px solid transparent; color:var(--dim); border-radius:6px; height:28px; padding:0 9px;
  cursor:pointer; font-size:12px; white-space:nowrap; }
.top button:hover, .btn:hover{ background:var(--panel2); color:var(--bone); }
.top button.on{ background:var(--accline); color:var(--acc); }
.top button:disabled{ opacity:.3; cursor:default; }
.top .badge{ border-radius:999px; font-size:10px; font-weight:700; line-height:1; color:#fff;
  min-width:15px; height:15px; display:inline-flex; align-items:center; justify-content:center; padding:0 4px; }
.top .badge.err{ background:#E5484D; }
.top .badge.warn{ background:var(--warn); }
.top button:disabled:hover{ background:none; color:var(--dim); }
.top .ib{ width:28px; padding:0; justify-content:center; font-size:14px; }
.top .pri{ background:var(--acc); color:var(--onacc); font-weight:600; padding:0 12px; }
.top .pri:hover{ background:var(--acc); filter:brightness(1.08); color:var(--onacc); }
.sv{ font-size:11px; color:var(--mut); font-family:var(--mono); }
.sv.saving{ color:var(--acc); } .sv.saved{ color:var(--ok); } .sv.error{ color:var(--err); }
.pub{ font-size:11px; color:var(--dim); font-family:var(--mono); }
.pub.dirty{ color:var(--acc); }

.body{ flex:1; display:grid; grid-template-columns:190px 1fr 292px; min-height:0; }

.gate{ display:none; }
@media (max-width:1023px){
  .ed > .top, .ed > .body{ display:none; }
  .gate{ position:fixed; inset:0; display:flex; align-items:center; justify-content:center;
    background:var(--ink); padding:32px; text-align:center; }
  .gate p{ max-width:320px; color:var(--bone); font-size:14px; line-height:1.6; }
  .gate p span{ display:block; color:var(--mut); font-size:12px; margin-top:8px; }
}

/* ── araç rayı ── */
.tools{ border-right:1px solid var(--line); padding:8px; overflow:auto; }
.grp{ padding-bottom:6px; margin-bottom:6px; border-bottom:1px solid var(--line); }
.grp:last-of-type{ border-bottom:0; }
.glab{ font-size:9.5px; letter-spacing:.14em; text-transform:uppercase; color:var(--mut);
  margin:6px 0 4px 9px; }
.tools button, .tools .tbtn{ display:flex; align-items:center; gap:9px; width:100%;
  background:none; border:0; color:var(--dim); text-align:left; height:28px; padding:0 9px;
  border-radius:6px; cursor:pointer; font-size:12.5px; }
.tools button:hover, .tools .tbtn:hover{ background:var(--panel2); color:var(--bone); }
.tools button.on{ background:var(--accline); color:var(--acc); }
.tools button span, .tools .tbtn span{ flex:1; }
.ic{ width:17px; height:17px; flex:none; stroke:currentColor; stroke-width:1.7;
  stroke-linecap:round; stroke-linejoin:round; }
kbd{ font:10px var(--mono); color:var(--mut); }
.tools button.on kbd{ color:var(--acc); }

.sep{ height:1px; background:var(--line); margin:8px 0; }
.lab{ font-size:9.5px; letter-spacing:.14em; text-transform:uppercase; color:var(--mut); margin:0 0 6px; }
.tree{ list-style:none; margin:0; padding:0; }
.tree li{ display:flex; align-items:center; gap:8px; height:26px; padding:0 9px;
  border-radius:5px; cursor:pointer; font-size:12px; color:var(--dim); }
.tree li:hover{ background:var(--panel2); color:var(--bone); }
.tree li.on{ background:var(--accline); color:var(--acc); }
.tree .nm{ flex:1; overflow:hidden; text-overflow:ellipsis; white-space:nowrap; }
.tree .nm.dim{ color:var(--mut); }
.tree li i{ font-style:normal; color:var(--mut); font-size:11px;
  font-family:var(--mono); font-variant-numeric:tabular-nums; }
.tree li.mut{ color:var(--mut); cursor:default; }

/* ── tuval ── */
.canvas{ position:relative; min-width:0; min-height:0; display:flex; flex-direction:column; }
.canvas svg{ flex:1; width:100%; min-height:0; display:block; touch-action:none; background:var(--canvas); }
.cempty{ position:absolute; inset:0; display:flex; align-items:center; justify-content:center;
  pointer-events:none; color:var(--mut); font-size:12.5px; text-align:center; padding:0 40px; }
svg.t-select{ cursor:default; } svg.t-pan{ cursor:grab; } svg.t-seat{ cursor:pointer; }
svg.t-grid, svg.t-fan, svg.t-row, svg.t-shape, svg.t-poly, svg.t-measure,
svg.t-seatAdd, svg.t-cal, svg.t-attr, svg.t-table{ cursor:crosshair; }
.grid line{ stroke:var(--grid); stroke-width:1; }
.grid.maj line{ stroke:var(--grid2); }
.blk rect{ cursor:pointer; }
.blk.on rect{ stroke:var(--sel); }
.blk rect.sel{ stroke:var(--sel) !important; }
.lod polygon{ cursor:pointer; }
.lod text{ text-anchor:middle; font-weight:700; pointer-events:none;
  font-family:var(--mono); letter-spacing:-.02em; }
.lod .badge{ pointer-events:none; }
.lod.on polygon{ stroke:var(--sel); }
.hnd circle{ fill:var(--canvas); stroke:var(--acc); stroke-width:5; cursor:pointer; }
.hnd circle:hover{ fill:var(--acc); }
.hnd text{ fill:var(--acc); text-anchor:middle; pointer-events:none; }
.shp text.shl{ fill:var(--mut); text-anchor:middle; pointer-events:none; letter-spacing:.22em; }
.shp.on polygon, .shp.on rect{ stroke:var(--sel); }
.pit rect{ cursor:pointer; }
.pit.on > rect:first-child{ stroke:var(--sel); }
.dr rect{ cursor:pointer; stroke-width:6; }
.dr text{ fill:var(--onacc); opacity:.75; text-anchor:middle; pointer-events:none; letter-spacing:.1em; }
.dr .dv{ fill:var(--onacc); opacity:1; font-weight:700; letter-spacing:0; font-family:var(--mono); }
.dr line{ stroke:var(--acc); stroke-width:6; stroke-dasharray:26 20; opacity:.6; }
.dr.on circle{ stroke:var(--sel); }
.rl{ fill:var(--rowlab); text-anchor:middle; pointer-events:none; font-family:var(--mono); }
.snum{ text-anchor:middle; font-weight:600; pointer-events:none;
  font-family:var(--mono); opacity:.85; }
.stick rect{ pointer-events:none; }
.stick text{ fill:#FBFAF7; text-anchor:middle; font-weight:700; pointer-events:none;
  font-family:var(--mono); letter-spacing:-.02em; }
.atg{ text-anchor:middle; font-weight:700; pointer-events:none; font-family:var(--mono); }
.draft{ fill:rgba(var(--accrgb),.10); stroke:var(--acc); stroke-width:6; stroke-dasharray:30 22; }
.ghost{ fill:rgba(var(--accrgb),.08); stroke:var(--acc); stroke-width:5; stroke-dasharray:34 24; pointer-events:none; }
.footd polyline{ fill:rgba(var(--accrgb),.10); stroke:var(--acc); stroke-dasharray:26 18; }
.footd circle{ fill:var(--canvas); stroke:var(--acc); stroke-width:4; }
svg.t-foot{ cursor:crosshair; }
.plate{ pointer-events:none; }
.tbl{ pointer-events:none; }
.tbl circle, .tbl rect{ fill-opacity:.30; stroke-opacity:.85; stroke-width:2; }
.tbl text.tlab{ text-anchor:middle; font-weight:700; font-family:var(--mono); pointer-events:none; }
.poi circle:first-child{ fill:var(--panel); stroke:var(--shapeline); cursor:pointer; }
.poi > g{ stroke:var(--bone); fill:none; stroke-linecap:round; stroke-linejoin:round; pointer-events:none; }
.poi text{ fill:var(--dim); text-anchor:middle; pointer-events:none; }
.poi.on circle:first-child{ stroke:var(--sel); }
.poigrid{ display:grid; grid-template-columns:repeat(5,1fr); gap:3px; margin-top:6px; }
.poigrid.wide{ grid-template-columns:repeat(6,1fr); }
.poigrid button{ aspect-ratio:1; display:flex; align-items:center; justify-content:center;
  background:none; border:1px solid transparent; border-radius:5px; cursor:pointer; padding:0; }
.poigrid button:hover{ background:var(--panel2); }
.poigrid button.on{ background:var(--accline); border-color:var(--acc); }
.poigrid svg{ width:72%; height:72%; stroke:var(--dim); stroke-width:1.8;
  stroke-linecap:round; stroke-linejoin:round; }
.poigrid button.on svg{ stroke:var(--acc); }
.breach{ fill:rgba(229,72,77,.12); stroke:#E5484D; stroke-dasharray:26 18; pointer-events:none; }
.status .alert{ color:#E5484D; font-weight:600; }
.status .alert:hover{ background:rgba(229,72,77,.12); color:#E5484D; }
.stop{ margin:0 0 9px; padding:8px 10px; border:1px solid #E5484D; border-radius:7px;
  color:#E5484D; font-size:11.5px; line-height:1.5; }
.pubrow .pri:disabled{ opacity:.4; cursor:default; }
.guide{ stroke:#E5484D; stroke-linecap:round; pointer-events:none; }
.marq{ fill:var(--marqfill); stroke:var(--sel); stroke-width:5; stroke-dasharray:26 18; }
.cal line{ stroke:var(--acc); stroke-width:7; }
.cal circle{ fill:none; stroke:var(--acc); stroke-width:5; }
.mtxt{ fill:var(--acc); text-anchor:middle; font-family:var(--mono); }

/* ── alt ölçüm şeridi ── */
.status{ display:flex; align-items:center; gap:8px; height:32px; padding:0 10px; flex:none;
  border-top:1px solid var(--line); background:var(--panel); font-size:11px; color:var(--mut);
  min-width:0; overflow-x:auto; overflow-y:hidden; white-space:nowrap; }
.status .hi{ color:var(--bone); flex-shrink:0; overflow:hidden; text-overflow:ellipsis; white-space:nowrap; max-width:320px; }
.status .hi.err{ color:#E5484D; font-weight:600; }
.status .ok{ color:var(--ok); flex-shrink:0; } .status .wr{ color:var(--acc); flex-shrink:0; }
.status .n{ color:var(--bone); }
.status .coord{ min-width:112px; text-align:right; color:var(--dim); }
.status button{ background:none; border:0; color:var(--dim); border-radius:5px; height:24px;
  padding:0 8px; cursor:pointer; font-size:11px; }
.status button:hover{ background:var(--panel2); color:var(--bone); }
.status button.on{ color:var(--acc); }
.status .ib{ width:24px; padding:0; font-size:14px; }
.status .zoompct{ min-width:38px; text-align:center; cursor:pointer; user-select:none; }
.status .zoompct:hover{ color:var(--acc); }
.chk{ display:flex; align-items:center; gap:5px; font-size:11px; color:var(--mut); cursor:pointer; }
.chk input{ accent-color:var(--acc); }
.mini{ background:none; border:1px solid var(--line); color:var(--dim); border-radius:5px;
  padding:3px 5px; font-size:11px; font-family:var(--mono); }
.mini.full{ width:100%; margin-top:6px; padding:5px 7px; }
.sbar{ display:flex; flex-direction:column; align-items:center; gap:2px; padding:0 2px; }
.sline{ height:5px; border:1px solid var(--mut); border-top:0; }
.sbar span{ font-size:10px; color:var(--mut); }

/* ── tuval üstü kutular ── */
.lgnd{ position:absolute; left:12px; bottom:44px; background:var(--ovl);
  border:1px solid var(--line); border-radius:8px; padding:9px 11px; font-size:11.5px; min-width:170px; }
.lgnd > p{ margin:0 0 7px; color:var(--mut); font-size:9.5px; letter-spacing:.14em;
  text-transform:uppercase; display:flex; }
.lgnd > p .link{ margin-left:auto; }
.lgnd div{ display:flex; align-items:center; gap:8px; padding:2px 0; }
.lgnd i{ width:11px; height:11px; border-radius:2px; flex:none; }
.lgnd span{ flex:1; color:var(--bone); }
.lgnd b{ color:var(--mut); font-weight:400; }
.lgnd .at span{ color:var(--dim); }
.tip{ position:absolute; left:50%; top:12px; transform:translateX(-50%);
  background:var(--ovl); border:1px solid var(--acc); color:var(--acc);
  border-radius:7px; padding:6px 13px; font-size:11.5px; }
.calbar{ position:absolute; left:50%; bottom:52px; transform:translateX(-50%);
  display:flex; align-items:center; gap:9px; background:var(--ovl); border:1px solid var(--acc);
  border-radius:8px; padding:8px 11px; font-size:11.5px; }
.calbar b{ color:var(--acc); font-family:var(--mono); }
.calbar input{ width:76px; background:var(--panel2); border:1px solid var(--line); color:var(--bone);
  border-radius:5px; padding:4px 7px; font:12px var(--mono); }
.calbar button{ background:none; border:1px solid var(--line); color:var(--dim);
  border-radius:5px; padding:4px 10px; cursor:pointer; font-size:11.5px; }
.calbar .pri{ background:var(--acc); color:var(--onacc); border-color:var(--acc); font-weight:600; }
.ulbar{ position:absolute; left:12px; top:12px; display:flex; align-items:center; gap:8px;
  background:var(--ovl); border:1px solid var(--line); border-radius:8px; padding:5px 9px; font-size:11px; color:var(--mut); }
.ulbar button{ background:none; border:1px solid var(--line); color:var(--mut); border-radius:5px;
  padding:2px 7px; cursor:pointer; font-size:11px; }
.ulbar button:hover{ color:var(--bone); }
.ulbar input[type=range]{ width:74px; accent-color:var(--acc); }

.val{ position:absolute; right:12px; bottom:44px; width:320px; max-height:46%;
  overflow:auto; background:var(--ovl); border:1px solid var(--line); border-radius:8px;
  padding:10px 12px; font-size:11.5px; }
.val p{ margin:0 0 7px; color:var(--mut); font-size:9.5px; letter-spacing:.14em;
  text-transform:uppercase; display:flex; }
.val p .link{ margin-left:auto; }
.val div{ margin-bottom:6px; }
.val em{ display:block; color:var(--mut); font-style:normal; font-size:11px; margin-top:2px; }
.val .err{ color:var(--err); } .val .warn{ color:var(--warn); }
.val .info{ color:var(--dim); } .val .ok{ color:var(--ok); }
.val .go{ cursor:pointer; } .val .go:hover{ background:var(--panel2); }

.ver{ position:absolute; right:12px; top:12px; width:326px; max-height:calc(100% - 60px);
  overflow:auto; background:var(--ovl); border:1px solid var(--line); border-radius:8px;
  padding:11px 13px; font-size:12px; }
.ver > p:first-child{ margin:0 0 10px; color:var(--mut); font-size:9.5px; letter-spacing:.14em;
  text-transform:uppercase; display:flex; }
.ver > p:first-child .link{ margin-left:auto; }
.ver .sec{ border-top:1px solid var(--line); margin-top:12px; padding-top:11px; }
.ver .tplin.name{ margin-bottom:2px; color:var(--bone); font:600 13px ui-sans-serif,system-ui,sans-serif; }
.pubrow{ display:flex; gap:6px; margin-bottom:9px; }
.pubrow input{ flex:1; background:var(--panel2); border:1px solid var(--line); color:var(--bone);
  border-radius:6px; padding:6px 9px; font-size:12px; }
.pubrow .pri{ background:var(--acc); color:var(--onacc); border:0; border-radius:6px;
  padding:6px 13px; font-weight:600; cursor:pointer; font-size:12px; }
.vlist{ list-style:none; margin:0; padding:0; display:flex; flex-direction:column; gap:5px; }
.vlist li{ display:flex; align-items:center; gap:6px; background:var(--panel2);
  border:1px solid var(--line); border-radius:7px; padding:7px 9px; }
.vlist li.on{ border-color:var(--okline); }
.vlist li div{ flex:1; min-width:0; }
.vlist strong{ display:block; font-size:12px; }
.vlist span{ display:block; font-size:10.5px; color:var(--mut); font-family:var(--mono); }
.vlist em{ display:block; font-style:normal; font-size:11px; color:var(--dim); margin-top:2px; }
.vlist button{ background:none; border:1px solid var(--line); color:var(--mut);
  border-radius:5px; padding:3px 8px; font-size:11px; cursor:pointer; }
.vlist button:hover{ border-color:var(--acc); color:var(--acc); }
.diff{ margin-top:11px; border-top:1px solid var(--line); padding-top:10px; }
.diff div{ margin-bottom:6px; font-size:11.5px; }
.diff em{ display:block; font-style:normal; color:var(--mut); font-size:11px; margin-top:2px; font-family:var(--mono); }
.diff .err{ color:var(--err); } .diff .warn{ color:var(--warn); }
.diff .ok{ color:var(--ok); } .diff .info{ color:var(--dim); }

/* ── sağ panel ── */
.props{ border-left:1px solid var(--line); background:var(--panel); overflow:auto; }
.props .empty{ padding:28px 18px; color:var(--mut); font-size:11.5px; text-align:center; }
.panel{ padding:13px 15px 22px; }
.phead{ display:flex; align-items:center; gap:9px; margin-bottom:9px; }
.plabel{ background:var(--panel2); border:1px solid var(--line); color:var(--bone);
  border-radius:6px; padding:6px 9px; width:72px; font-weight:600; font-size:12.5px; }
.plabel.wide{ width:auto; flex:1; }
.plabel.seatid{ font-family:var(--mono); font-size:12px; color:var(--acc); }
.kind{ font-size:11px; color:var(--mut); }
.cap{ font-size:11.5px; color:var(--mut); display:flex; align-items:center; gap:7px; margin-bottom:5px; }
.cap b{ color:var(--bone); font-size:15px; font-family:var(--mono); font-variant-numeric:tabular-nums; }
.cap .link{ margin-left:auto; }
.panel section, .panel details.sec{ border-top:1px solid var(--line); padding:11px 0; }
.panel details.sec summary{ cursor:pointer; list-style-position:outside; }
.panel details.sec summary::marker{ color:var(--mut); font-size:9px; }
.panel details.sec[open] summary{ margin-bottom:9px; }
.g2{ display:grid; grid-template-columns:1fr 1fr; gap:7px; }
.g3{ display:grid; grid-template-columns:1fr 1fr 1fr; gap:7px; }
.pr{ display:flex; flex-direction:column; gap:3px; margin-top:7px; }
.g2 .pr, .g3 .pr{ margin-top:0; }
.pr span{ font-size:10px; color:var(--mut); }
.pr input, .pr select{ background:var(--panel2); border:1px solid var(--line); color:var(--bone);
  border-radius:5px; padding:5px 7px; font-size:12px; width:100%; }
.pr input[type=number]{ font-family:var(--mono); font-variant-numeric:tabular-nums; }
.pr input:focus, .pr select:focus{ border-color:var(--acc); outline:0; }
.pr select:disabled{ opacity:.4; }
label.asfile{ display:block; text-align:center; }
button.wide, label.wide{ width:100%; margin-top:8px; background:none; border:1px solid var(--line);
  color:var(--dim); border-radius:6px; padding:7px; cursor:pointer; font-size:12px; }
button.wide:hover{ border-color:var(--acc); color:var(--acc); }
.checks{ display:flex; gap:13px; margin-top:8px; font-size:11.5px; color:var(--mut); }
.checks label{ display:flex; align-items:center; gap:5px; cursor:pointer; }
.checks input{ accent-color:var(--acc); }
.acts{ display:flex; gap:6px; }
.acts button{ flex:1; background:none; border:1px solid var(--line); color:var(--dim);
  border-radius:6px; padding:7px; cursor:pointer; font-size:12px; }
.acts button:hover{ border-color:var(--acc); color:var(--acc); }
.acts button.on{ border-color:var(--acc); color:var(--acc); background:var(--accline); }
.acts button:disabled{ opacity:.35; cursor:default; }
.acts .dgr:hover{ border-color:var(--err); color:var(--err); }
.alg{ display:grid; grid-template-columns:repeat(6,1fr); gap:4px; }
.alg button{ background:none; border:1px solid var(--line); color:var(--dim);
  border-radius:5px; padding:6px 0; cursor:pointer; font-size:14px; line-height:1; }
.alg button:hover{ border-color:var(--acc); color:var(--acc); }
.sw{ display:flex; flex-wrap:wrap; gap:4px; }
.sw button{ width:21px; height:21px; border:1px solid var(--line); border-radius:4px;
  cursor:pointer; padding:0; background:none; color:var(--mut); font-size:9px; }
.sw button.on{ outline:2px solid var(--acc); outline-offset:1px; }
.seg{ display:flex; border:1px solid var(--line); border-radius:6px; overflow:hidden; }
.seg button{ flex:1; background:none; border:0; border-right:1px solid var(--line);
  color:var(--mut); padding:6px 0; cursor:pointer; font-size:11.5px; }
.seg button:last-child{ border-right:0; }
.seg button.on{ background:var(--accline); color:var(--acc); font-weight:600; }
.toks{ display:flex; flex-wrap:wrap; gap:4px; margin-top:6px; }
.toks button{ background:none; border:1px solid var(--line); color:var(--mut);
  border-radius:4px; padding:2px 6px; font:10.5px var(--mono); cursor:pointer; }
.toks button:hover{ border-color:var(--acc); color:var(--acc); }
.tplin{ width:100%; background:var(--panel2); border:1px solid var(--line); color:var(--acc);
  border-radius:6px; padding:7px 9px; font:12.5px var(--mono); }
.sample{ margin:8px 0 0; font-size:11.5px; color:var(--mut); }
.sample b{ color:var(--bone); font-family:var(--mono); }
.brush{ display:flex; flex-direction:column; gap:2px; margin-top:6px; }
.brush button{ display:flex; align-items:center; gap:7px; justify-content:flex-start !important;
  font-size:11.5px !important; height:26px !important; }
.brush i{ width:10px; height:10px; border-radius:2px; display:block; flex:none; }
.chips{ display:flex; flex-wrap:wrap; gap:5px 9px; margin-top:9px; font-size:11px; color:var(--mut); }
.chips span{ display:flex; align-items:center; gap:5px; }
.chips i{ width:8px; height:8px; border-radius:2px; }
.chips .warnc{ color:var(--acc); }
.picklist{ list-style:none; margin:0 0 4px; padding:0; max-height:210px; overflow:auto;
  border:1px solid var(--line); border-radius:7px; }
.picklist li{ display:flex; align-items:center; gap:7px; padding:5px 8px; cursor:pointer;
  font-size:11.5px; color:var(--dim); }
.picklist li:hover{ background:var(--panel2); color:var(--bone); }
.picklist li.on{ color:var(--acc); }
.picklist li span{ flex:1; overflow:hidden; text-overflow:ellipsis; white-space:nowrap; }
.picklist li i{ font-style:normal; color:var(--mut); font-size:11px; font-family:var(--mono); }
.picklist li b.x{ font-weight:400; color:var(--mut); cursor:pointer; padding:0 3px; }
.picklist li b.x:hover{ color:var(--err); }
.picklist input{ accent-color:var(--acc); }
.find{ width:100%; background:var(--panel2); border:1px solid var(--line); color:var(--bone);
  border-radius:6px; padding:5px 9px; font-size:11.5px; margin-bottom:5px; }
.find:focus{ border-color:var(--acc); outline:0; }
.ovinfo{ font-size:11px; color:var(--mut); margin:11px 0 0; }
.mut{ color:var(--mut); }
.mut.sm{ font-size:11px; margin:6px 0 8px; line-height:1.55; }
.link{ background:none; border:0; color:var(--acc); cursor:pointer; padding:0; font-size:11px; }
.link:hover{ text-decoration:underline; }
.panel section.prev, .panel details.sec.prev{ background:var(--panel2); margin:0 -15px; padding-left:15px; padding-right:15px; }
.lab em{ font-style:normal; color:var(--acc); margin-left:7px; letter-spacing:0; text-transform:none; }
select.full{ width:100%; background:var(--panel2); border:1px solid var(--line); color:var(--bone);
  border-radius:5px; padding:5px 7px; font-size:12px; }

button:focus-visible, input:focus-visible, select:focus-visible, label:focus-visible{
  outline:2px solid var(--acc); outline-offset:1px; }
@media (prefers-reduced-motion:reduce){ *{ transition:none !important; animation:none !important; } }
`;
