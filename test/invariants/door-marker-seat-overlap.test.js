/* ═══════════════════════════════════════════════════════════════════════
   INVARIANT: hiçbir kapı/işaret bir koltuk dikdörtgeniyle kesişmez.

   Gerçek hata (bkz. görev tanımı): kapı işaretleri koltukların üstüne
   biniyordu ve bunu bulmak KULLANICI EKRANA BAKARAK dört tur sürdü —
   böyle bir kontrol hiç yoktu. Sayılar (koltuk sayısı, kapasite) hep
   doğruydu; resim yanlıştı.

   Koltuğun GERÇEK dikdörtgenini kullanıyoruz (SEAT_KINDS'teki genişlik
   dahil — tekerlekli sandalye koltuğu 86cm, normal 41cm, bkz.
   src/core/rules.js'teki seatCorners, artık koltuğun kendi `seatKind`
   alanından okuyor) ve şeklin GERÇEK biçimini:
     · kapı (`type:"door"`)  → dikdörtgen, x/y/w/h/rot'lu (bkz. venue
       dosyalarındaki gerçek santimetre ölçüleri, ör. cutVomitories()'in
       ürettiği tünel kapıları).
     · işaret (`type:"icon"`, WC/Bar/Vestiyer/İlk yardım/Giriş/…) → dairesel
       (bkz. PlanEditor.jsx'teki <Poi> bileşeni: "yuvarlak plaka + simge").
       İşaretin ekran boyutu zoom'a göre sabit tutulur (U ile ölçeklenir,
       fiziksel bir nesne değil — bkz. Poi'nin kendi yorumu); bu test
       zoom'dan bağımsız bir DÜNYA yarıçapı gerekiyor, o yüzden ekranda
       kullanılan tek somut sayıyı — şeklin kendi `size` alanını (öntanımlı
       34) — cm yarıçapı olarak kullanır (yarıçap = size/2).
       ponytail: bu, işaretin gerçek fiziksel boyutu için elde tek veri
       noktası; zoom-duyarlı bir render simülasyonu bu testin kapsamı
       dışında.
   ═══════════════════════════════════════════════════════════════════════ */
import { describe, it, expect } from "vitest";
import { seatCorners } from "../../src/core/rules.js";
import { outlineOverlapArea, inPoly } from "../../src/core/polygon.js";
import { VENUES, venueSeats } from "./helpers.js";

/** Rastgele döndürülmüş bir dikdörtgenin dört köşesi — seatCorners'ın
 *  koltuğa özel genişlik sabitleri OLMADAN genel hâli (kapı ölçüleri
 *  venue verisinden gelir, sabit değildir). */
function rectCorners(x, y, w, h, rotDeg) {
  const rad = (rotDeg * Math.PI) / 180, cos = Math.cos(rad), sin = Math.sin(rad);
  const hw = w / 2, hh = h / 2;
  return [[-hw, -hh], [hw, -hh], [hw, hh], [-hw, hh]].map(([lx, ly]) => ({
    x: x + lx * cos - ly * sin, y: y + lx * sin + ly * cos,
  }));
}

function distPointToSeg(px, py, ax, ay, bx, by) {
  const dx = bx - ax, dy = by - ay, len2 = dx * dx + dy * dy || 1;
  const t = Math.max(0, Math.min(1, ((px - ax) * dx + (py - ay) * dy) / len2));
  return Math.hypot(px - (ax + t * dx), py - (ay + t * dy));
}

/** Dairenin (dışbükey olması gerekmeyen) bir çokgenle kesişimi: merkez
 *  içerideyse, ya da merkezin herhangi bir kenara mesafesi yarıçaptan
 *  azsa kesişir. */
function circleOverlapsPoly(cx, cy, r, poly) {
  if (inPoly(cx, cy, poly)) return true;
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
    if (distPointToSeg(cx, cy, poly[j].x, poly[j].y, poly[i].x, poly[i].y) < r) return true;
  }
  return false;
}

/* 1cm² eşiği: offsetPoly'nin gönye yuvarlaması gibi kayan-nokta gürültüsünü
   eler, gerçek her çakışmayı yakalar — burada konu edilen şekiller
   onlarca-yüzlerce cm² ölçeğinde (bir koltuk 1.558cm²'dir), 1cm² asla
   gerçek bir çakışmayı gizleyemez. */
const AREA_EPS = 1;

export function findDoorMarkerSeatOverlaps(venue) {
  const { seats } = venueSeats(venue);
  const doors = (venue.shapes || []).filter((s) => s.type === "door");
  const icons = (venue.shapes || []).filter((s) => s.type === "icon");
  const violations = [];
  for (const s of seats) {
    const corners = seatCorners(s);
    for (const d of doors) {
      const area = outlineOverlapArea(corners, rectCorners(d.x, d.y, d.w, d.h, d.rot || 0));
      if (area > AREA_EPS) violations.push({ seat: s.id, shape: d.label || d.id, kind: "door", area: Math.round(area) });
    }
    for (const ic of icons) {
      if (circleOverlapsPoly(ic.x, ic.y, (ic.size || 34) / 2, corners))
        violations.push({ seat: s.id, shape: ic.label || ic.id, kind: "icon" });
    }
  }
  return violations;
}

describe("invariant: kapı/işaret hiçbir koltukla kesişmez", () => {
  it.each(VENUES)("%s salonunda kapı/işaret koltuğa binmiyor", (_key, venue) => {
    const violations = findDoorMarkerSeatOverlaps(venue);
    expect(violations, `${violations.length} çakışma:\n${JSON.stringify(violations.slice(0, 10), null, 2)}`)
      .toHaveLength(0);
  });

  it("testin testi: koltuğun tam üstüne bir kapı koyunca KIRMIZI döner", () => {
    const [, real] = VENUES[0];
    const { seats } = venueSeats(real);
    const victim = seats[Math.floor(seats.length / 2)];
    const broken = { ...real, shapes: [...real.shapes,
      { id: "kirilan-kapi", type: "door", x: victim.x, y: victim.y, w: 200, h: 200, rot: 0 }] };
    const violations = findDoorMarkerSeatOverlaps(broken);
    expect(violations.length).toBeGreaterThan(0);
    expect(violations.some((v) => v.seat === victim.id && v.kind === "door")).toBe(true);
  });

  it("testin testi: koltuğun tam üstüne bir işaret (icon) koyunca KIRMIZI döner", () => {
    const [, real] = VENUES[0];
    const { seats } = venueSeats(real);
    const victim = seats[Math.floor(seats.length / 2)];
    const broken = { ...real, shapes: [...real.shapes,
      { id: "kirilan-isaret", type: "icon", icon: "wc", x: victim.x, y: victim.y, size: 60, rot: 0 }] };
    const violations = findDoorMarkerSeatOverlaps(broken);
    expect(violations.length).toBeGreaterThan(0);
    expect(violations.some((v) => v.seat === victim.id && v.kind === "icon")).toBe(true);
  });

  it("testin testi: uzaktaki bir kapı/işaret bulgu ÜRETMEZ (yanlış alarm yok)", () => {
    const [, real] = VENUES[0];
    const farAway = { ...real, shapes: [...real.shapes,
      { id: "uzak-kapi", type: "door", x: 999999, y: 999999, w: 200, h: 200, rot: 0 },
      { id: "uzak-isaret", type: "icon", icon: "wc", x: 999999, y: -999999, size: 60, rot: 0 }] };
    const violations = findDoorMarkerSeatOverlaps(farAway);
    expect(violations).toHaveLength(0);
  });
});
