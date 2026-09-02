/* Bir salon için üç altın-dosya içeriğini üretir. snapshot-golden.mjs bunları
   DİSKE YAZAR, check-golden.mjs aynı fonksiyonlarla TAZE üretip diskle
   KARŞILAŞTIRIR — üretim mantığı tek yerde, ikisi asla birbirinden sapmaz. */
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";

function polyPts(poly) {
  return poly.map((p) => `${p.x.toFixed(2)},${p.y.toFixed(2)}`).join(" ");
}

/* seats.json — src/PlanEditor.jsx içindeki exportSeats() ("seats.json" düğmesi)
   ile AYNI veri şeklini üretir. exportSeats'i birebir çağıramıyoruz: PlanEditor
   bileşeninin kapanışı içinde tanımlı ve indirme için tarayıcıya özgü
   Blob/URL.createObjectURL/document.createElement kullanıyor — Node'da yok.
   Bu yüzden yalnızca veri-şekillendirme adımları, exportSeats ile BİREBİR AYNI
   sırayla ve aynı dışa-açılmış saf fonksiyonlarla (buildMeta/buildSeats/
   gateMap) kopyalandı. Tek girdi farkı: React state'indeki "plan" yerine ham
   salon sabiti kullanılıyor. Aradaki tek alan farkı runtime'da stampVer()'in
   eklediği "srcVer" — exportSeats o alanı hiç okumuyor, dolayısıyla çıktı
   birebir aynı kalıyor (bkz. görev raporu). */
function buildSeatsData(venue, mod) {
  const { buildMeta, buildSeats, gateMap } = mod;
  const metas = venue.blocks.map((b) => ({ b, m: buildMeta(b) }));
  const levelCounts = {};
  metas.forEach(({ b, m }) => {
    levelCounts[b.level || "—"] = (levelCounts[b.level || "—"] || 0) + m.seatCount;
  });
  const gm = gateMap(venue);
  const all = [];
  metas.forEach(({ b, m }) => buildSeats(b, m, venue.idTemplate).seats.forEach((s) => {
    if (!s.gap) all.push({ ...s, gate: (gm.get(b.id) || [])[0] || null });
  }));
  const at = {};
  all.forEach((s) => { if (s.at) at[s.at] = (at[s.at] || 0) + 1; });
  return {
    venue: venue.name, unit: "cm", version: venue.published || null,
    seatCount: all.length, sellableCount: all.length - (at.tech || 0),
    levels: levelCounts, attributes: at,
    gates: venue.shapes.filter((s) => s.type === "door").map((d) => ({
      label: d.label,
      blocks: (d.blocks || []).map((i) => venue.blocks.find((b) => b.id === i)?.label).filter(Boolean),
    })),
    seats: all.map((s) => ({
      id: s.id, level: s.level, block: s.block, row: s.row, seat: s.num,
      gate: s.gate, x: +s.x.toFixed(1), y: +s.y.toFixed(1), rot: +s.rot.toFixed(1),
      attribute: s.at || null, sellable: s.at !== "tech",
    })),
  };
}

/* render.svg — react-dom/server ile GERÇEKTEN başsız render edilir, ama tüm
   <PlanEditor/> ağacını mount etmek yerine küçük bir React ağacı kuruyoruz.
   Neden: <PlanEditor/> hiçbir salon prop'u almaz, iç state'iyle TEK bir
   salonu (vk="gs" varsayılanı) yansıtır; 9 salonu ayrı ayrı üretmenin dışarıya
   açık bir yolu yok. Onun yerine, uygulamanın da kullandığı aynı TÜRETİLMİŞ
   geometri fonksiyonlarını (boundaryPolys, buildMeta) çağırıp yalnızca salon
   sınırını ve blok tabanlarını çizen saf bir <svg> üretiyoruz. Tekil koltuk
   konumları zaten seats.json'da sayısal olarak birebir var; GS/Ülker gibi on
   binlerce koltuklu salonlarda koltuk başına <rect> çizmek dosyayı şişirmekten
   başka bir regresyon-yakalama değeri katmıyor, o yüzden burada tekrarlanmıyor. */
function buildRenderSvg(venue, mod) {
  const { buildMeta, boundaryPolys } = mod;
  const boundary = boundaryPolys(venue).map((poly, i) =>
    createElement("polygon", { key: `w${i}`, "data-role": "boundary", points: polyPts(poly) }));
  const blocks = venue.blocks.map((b) => {
    const m = buildMeta(b);
    return createElement("polygon", { key: b.id, "data-role": "block", "data-label": b.label,
      "data-id": b.id, "data-seats": m.seatCount, points: polyPts(m.outline) });
  });
  const viewBox = `${venue.home.x} ${venue.home.y} ${venue.home.w} ${venue.home.h}`;
  const svg = createElement("svg", { xmlns: "http://www.w3.org/2000/svg", viewBox },
    createElement("g", { "data-role": "boundaries" }, boundary),
    createElement("g", { "data-role": "blocks" }, blocks));
  const markup = renderToStaticMarkup(svg);
  const header = "<!-- render.svg: yalnızca türetilmiş geometri (salon sınırı + blok tabanları). "
    + "Koltukların kendisi seats.json'da birebir sayısal var, burada tekrarlanmıyor. -->\n";
  return header + markup.replace(/></g, ">\n<") + "\n";
}

export function buildGolden(venue, mod) {
  const seatsData = buildSeatsData(venue, mod);
  return {
    plan: JSON.stringify(venue, null, 2) + "\n",
    seats: JSON.stringify(seatsData, null, 2) + "\n",
    svg: buildRenderSvg(venue, mod),
    seatCount: seatsData.seatCount,
  };
}
