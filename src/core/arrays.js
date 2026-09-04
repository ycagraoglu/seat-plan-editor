import { RAD } from "./geometry.js";
import { reLabel, freeLabel } from "./labels.js";
import { nid } from "./ids.js";

/* `used`: planda o an kullanılan etiket kümesi — bu modül saf kalsın diye
   çağıran taraftan (PlanEditor.jsx) parametre olarak gelir, plan'a bağımlı
   hale gelmez. Salon üreteçleri (venues/builders.js) hiç çakışma olmayan
   taze bloklar kurduğundan bu parametreyi vermez; varsayılan boş küme o
   çağrılarda davranışı DEĞİŞTİRMEZ (bkz. arrays.test.js). Yerelde bir kopya
   (`taken`) tutulur ki hem çağıranın kümesi mutasyona uğramasın hem de AYNI
   çağrıda üretilen etiketler birbiriyle çakışmasın (kümülatif izleme). */
export function linearArray(blocks, { count, dx, dy }, used = new Set()) {
  const out = [], step = blocks.length, taken = new Set(used);
  for (let i = 1; i < count; i++)
    blocks.forEach((b) => {
      const label = freeLabel(b.label, step * i, taken);
      taken.add(label);
      out.push(reLabel({ ...b, id: nid(), x: b.x + dx * i, y: b.y + dy * i }, label));
    });
  return out;
}
export function radialArray(blocks, { count, cx, cy, step }, used = new Set()) {
  const out = [], lstep = blocks.length, taken = new Set(used);
  for (let i = 1; i < count; i++) {
    const t = step * i, c = Math.cos(t * RAD), s = Math.sin(t * RAD);
    blocks.forEach((b) => {
      const px = b.x - cx, py = b.y - cy;
      const label = freeLabel(b.label, lstep * i, taken);
      taken.add(label);
      out.push(reLabel({ ...b, id: nid(),
        x: cx + px * c - py * s, y: cy + px * s + py * c, rot: b.rot + t },
        label));
    });
  }
  return out;
}

/* ── akıllı hizalama kılavuzları ───────────────────────────────
   Sürüklenen seçimin kutusunun merkezi ve kenarları, diğer blokların
   ve şekillerin merkez/kenarlarıyla eşleştiğinde o eksene yapışır ve
   kırmızı bir referans çizgisi gösterir. Eşik ekranda 7 piksel —
   yakınlaştıkça hassaslaşır, uzaklaştıkça yardımcı olur. */
export function alignSetup(ids, metas, metaById, shapes) {
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
export function alignDelta(d, dx, dy, tol) {
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

/** Dizi önizlemesi — kimlik üretmez, sadece geometri döndürür. */
export function arrayPreview(blocks, kind, o) {
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
