import { buildMeta, buildSeats, DEF } from "../src/core/geometry.js";
import { boundaryPolys } from "../src/core/gates.js";
import { planHome } from "../src/core/plan.js";
import { selectBlockLevels, levelMatches } from "../src/ui/state/selectors.js";

/* ══════════════════════════════════════════════════════════════════════════
   GÖRME KATMANI — LLM'in kendi çizdiğine bakması için

   scripts/lib/golden-build.mjs'teki render.svg yalnız salon sınırı + blok
   tabanlarını çiziyor ve öyle kalmalı (altın dosyayı şişirmemek için, bkz.
   oradaki not). Burası ONDAN AYRI: amacı denklik değil, GÖRÜNÜRLÜK.

   Dört fark:
   1. LOD — koltuk sayısı eşiğin altındaysa koltuk başına nokta çizilir.
      GS 48.600, Şükrü Saracoğlu 52.838 koltuk; hepsini nokta çizmek hem
      dosyayı şişirir hem de o ölçekte zaten okunmaz. Yakınlaşınca (scope
      ile tek blok/kat) koltuklar görünür.
   2. Kat rengi — LLM tribünleri ayırt edebilsin. PlanEditor'ün levelColor
      mantığının aynısı: ilk altı küratörlü renk, fazlası altın açıyla ton
      döndürerek (iki kat ASLA aynı renge düşmez).
   3. Etiket — blok kodu, okunabilir boyda.
   4. ALTLIK BİNDİRMESİ — organizatörün planı arkada, çizim önde. LLM kendi
      işini kaynakla ÜST ÜSTE görür; doğrulamanın en güçlü biçimi bu.
   ══════════════════════════════════════════════════════════════════════════ */

const LEVEL_COLORS = ["#3E7FBF", "#5F9142", "#C1743C", "#7C5BA8", "#3E9092", "#C2415A"];
export const levelColor = (i) =>
  (i < LEVEL_COLORS.length ? LEVEL_COLORS[i] : `hsl(${(i * 137.508) % 360} 46% 46%)`);

/* Şekil türüne göre dolgu — sahayı yeşil, sahneyi koyu göstermek LLM'in
   "sahne neredeydi" sorusunu tek bakışta cevaplıyor. */
const SHAPE_FILL = {
  pitch: "#2F5D43", stage: "#2B2B33", screen: "#3A3A45", wall: "none",
  standing: "#8A7B4E", door: "#B4472F", note: "none",
};

const num = (v) => (Number.isFinite(v) ? +v.toFixed(1) : 0);
const pts = (poly) => poly.map((p) => `${num(p.x)},${num(p.y)}`).join(" ");
const esc = (s) => String(s ?? "").replace(/[<>&"]/g, (c) =>
  ({ "<": "&lt;", ">": "&gt;", "&": "&amp;", '"': "&quot;" }[c]));

/** Bir bloğun dünya koordinatlarındaki koltuk dikdörtgenleri. */
function seatRects(b, m, tpl, renk) {
  const w = DEF.seatW, h = DEF.seatH;
  return buildSeats(b, m, tpl).seats.filter((s) => !s.gap).map((s) =>
    `<rect x="${num(s.x - w / 2)}" y="${num(s.y - h / 2)}" width="${w}" height="${h}"`
    + ` rx="4" fill="${renk}" transform="rotate(${num(s.rot)} ${num(s.x)} ${num(s.y)})"/>`
  ).join("");
}

/**
 * Planı SVG'ye çizer.
 * @param scope   "all" | blok kimliği/kodu | kat yolu
 * @param seats   "auto" (LOD) | "on" | "off"
 * @param underlay data: URI — organizatörün planı, arkaya bindirilir
 */
export function renderSvg(plan, { scope = "all", seats = "auto", underlay = null,
  maxSeats = 4000, width = 1400 } = {}) {
  const tumMetas = plan.blocks.map((b) => ({ b, m: buildMeta(b) }));

  /* Kapsam: tek blok, tek kat ya da hepsi. Tek bloğa yakınlaşmak LOD'u da
     açar — asıl işe yarayan kullanım bu. */
  const secili = scope === "all" ? tumMetas
    : tumMetas.filter(({ b }) => b.id === scope || b.label === scope
      || levelMatches(b.level, scope));
  if (!secili.length) throw new Error(`Kapsamda blok yok: ${scope}`);

  const koltukSayisi = secili.reduce((a, x) => a + x.m.seatCount, 0);
  const koltukCiz = seats === "on" || (seats === "auto" && koltukSayisi <= maxSeats);

  /* Görüntü kutusu: kapsam "all" ise planın çerçevesi, değilse seçilenlerin
     sınırı + pay. */
  let vb;
  if (scope === "all") {
    vb = planHome(plan);
  } else {
    const bb = secili.map((x) => x.m.bbox);
    const x0 = Math.min(...bb.map((b) => b.x0)), x1 = Math.max(...bb.map((b) => b.x1));
    const y0 = Math.min(...bb.map((b) => b.y0)), y1 = Math.max(...bb.map((b) => b.y1));
    const pay = Math.max(x1 - x0, y1 - y0) * 0.08;
    vb = { x: x0 - pay, y: y0 - pay, w: x1 - x0 + 2 * pay, h: y1 - y0 + 2 * pay };
  }

  const renkKatlari = selectBlockLevels(plan);
  const cc = (b) => b.color || levelColor(Math.max(0, renkKatlari.indexOf(b.level || "")));
  const olcek = vb.w / width;                 /* dünya cm → piksel */
  const yaziBoy = Math.max(vb.w / 60, 120);

  /* Etiket, İÇİNE YAZILDIĞI ŞEKLE sığmalı. Sabit boy kullanınca 56 bloklu
     stadyumda "FENERIFENERIFENERI..." diye üst üste biniyordu — okunmaz bir
     görüntü, LLM için de gürültü. Sığmıyorsa küçültülür; okunabilirlik
     tabanının altına düşerse hiç yazılmaz (yakın plan için scope var). */
  const TABAN_PX = 7;                          /* bu pikselin altı okunmaz */
  const sigdir = (metin, en) => {
    if (!metin) return 0;
    const boy = Math.min(yaziBoy, (en * 0.92) / (String(metin).length * 0.58));
    return boy / olcek >= TABAN_PX ? boy : 0;  /* 0 = yazma */
  };

  const parca = [];

  /* 1 — altlık en arkada */
  if (underlay) {
    parca.push(`<image href="${underlay}" x="${num(vb.x)}" y="${num(vb.y)}"`
      + ` width="${num(vb.w)}" height="${num(vb.h)}" opacity="0.55"`
      + ` preserveAspectRatio="xMidYMid meet"/>`);
  }

  /* 2 — salon sınırı */
  boundaryPolys(plan).forEach((poly) => parca.push(
    `<polygon points="${pts(poly)}" fill="none" stroke="#8A8A94"`
    + ` stroke-width="${num(olcek * 2)}" stroke-dasharray="${num(olcek * 8)}"/>`));

  /* 3 — şekiller (bloğun altında: sahne/saha zemin) */
  (plan.shapes || []).forEach((s) => {
    const f = SHAPE_FILL[s.type] ?? "#6E7787";
    if (s.type === "note") {
      parca.push(`<text x="${num(s.x)}" y="${num(s.y)}" font-size="${num((s.fs || 150) * 1.2)}"`
        + ` fill="#6E7787" text-anchor="middle" font-family="sans-serif">${esc(s.label)}</text>`);
      return;
    }
    const w = s.w || 0, h = s.h || 0;
    parca.push(`<g transform="rotate(${num(s.rot || 0)} ${num(s.x)} ${num(s.y)})">`
      + `<rect x="${num(s.x - w / 2)}" y="${num(s.y - h / 2)}" width="${num(w)}" height="${num(h)}"`
      + ` fill="${f}" ${f === "none" ? `stroke="#8A8A94" stroke-width="${num(olcek * 2)}"` : ""}/>`
      + ((() => {
        const fs = sigdir(s.label, w);
        return fs ? `<text x="${num(s.x)}" y="${num(s.y + fs * 0.35)}"`
          + ` font-size="${num(fs)}" fill="#FFFFFF" text-anchor="middle"`
          + ` font-family="sans-serif">${esc(s.label)}</text>` : "";
      })())
      + `</g>`);
  });

  /* 4 — bloklar: taban + (LOD açıksa) koltuklar */
  secili.forEach(({ b, m }) => {
    const renk = cc(b);
    parca.push(`<polygon points="${pts(m.outline)}" fill="${renk}"`
      + ` fill-opacity="${koltukCiz ? 0.18 : 0.75}" stroke="${renk}"`
      + ` stroke-width="${num(olcek * 1.5)}"/>`);
    if (koltukCiz) parca.push(seatRects(b, m, plan.idTemplate, renk));
  });

  /* 5 — blok etiketleri en üstte, her biri kendi bloğuna sığacak boyda */
  let yazilmayan = 0;
  secili.forEach(({ b, m }) => {
    const fs = sigdir(b.label, m.bbox.x1 - m.bbox.x0);
    if (!fs) { yazilmayan++; return; }
    parca.push(`<text x="${num(m.cx)}" y="${num(m.cy + fs * 0.35)}" font-size="${num(fs)}"`
      + ` fill="#111" stroke="#FFF" stroke-width="${num(fs * 0.14)}"`
      + ` paint-order="stroke" text-anchor="middle" font-weight="700"`
      + ` font-family="sans-serif">${esc(b.label)}</text>`);
  });

  const yukseklik = Math.round(width * (vb.h / vb.w));
  return {
    svg: `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${yukseklik}"`
      + ` viewBox="${num(vb.x)} ${num(vb.y)} ${num(vb.w)} ${num(vb.h)}">`
      + `<rect x="${num(vb.x)}" y="${num(vb.y)}" width="${num(vb.w)}" height="${num(vb.h)}" fill="#E9E6DF"/>`
      + parca.join("") + `</svg>`,
    width, height: yukseklik,
    blocks: secili.length, seats: koltukSayisi, seatsDrawn: koltukCiz,
    /* Kaç etiket sığmadı — LLM "yakınlaşmam mı lazım" diye anlasın. */
    labelsHidden: yazilmayan,
  };
}
