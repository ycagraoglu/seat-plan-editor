/* ═══════════════════════════════════════════════════════════════════════
   A5 — invariant testlerinin ORTAK iskelesi.

   Bu dosya bir TEST DOSYASI değil (adı .test.js ile bitmiyor, vitest onu
   bir suit olarak çalıştırmaz) — test/invariants/*.test.js'in hepsinin
   çağırdığı küçük, saf yardımcılar burada. Üretim geometrisini
   (buildMeta/buildSeats/toLocal) TEKRAR YAZMAZ, sadece çağırır: bu
   projenin A2'den beri süregelen dersi tam olarak bu — aynı geometri iki
   ayrı yerde iki ayrı kodla yazılırsa ikisi sessizce sapabiliyor (bkz.
   src/core/rules.js'in başlık yorumu, AKM'deki %16 kat-arası çakışma
   örneği). Invariant testleri de bu kuralın dışında değil.
   ═══════════════════════════════════════════════════════════════════════ */
import { buildMeta, buildSeats } from "../../src/core/geometry.js";
import { BUILTINS } from "../../src/venues/index.js";

/* "empty" gerçek bir örnek salon değil, yeni-plan şablonu (bkz.
   core/schema.js'teki isProtectedSample istisnası) — boş planın ölçülecek
   bir geometrisi yok, 9 örnek salonun invariant taramasına girmez. */
export const VENUES = Object.entries(BUILTINS).filter(([key]) => key !== "empty");

/* WIDE_ATTRS burada eskiden yaşıyordu (Set(["wheel"]), ATTRS.wheel.wide=true'nun
   sabit kopyası — bkz. eski görev notu). seat_kind + features ayrımından
   sonra koltuğun genişliği artık kendi `seatKind` alanından, core/
   geometry.js'teki SEAT_KINDS'ten geliyor (bkz. rules.js'teki seatCorners) —
   dışarıdan bir "hangi değerler geniş" kümesi enjekte etmeye gerek kalmadı,
   invariant'lar seatCorners(s)'ı DOĞRUDAN çağırıyor (bkz. door-marker-
   seat-overlap.test.js / template-plans.test.js). */

/** Bir salonun TÜM bloklarının meta'sı (taban/outline) + boşluk (gap)
 *  OLMAYAN koltukları — rules.js'teki computeSeatScan ile AYNI süzme
 *  kuralı (gap'li koltuk satılmaz, fiziksel bir varlığı yok). Her koltuğa
 *  kendi bloğunun outline'ı (seat-within-block invariant'ı) VE sıra sayısı
 *  (`rows` — pitch-stage-clearance'ın kademe/courtside ayrımı) eklenir. */
export function venueSeats(venue) {
  const metas = venue.blocks.map((b) => ({ b, m: buildMeta(b) }));
  const seats = [];
  metas.forEach(({ b, m }) => {
    buildSeats(b, m, venue.idTemplate).seats.forEach((s) => {
      if (!s.gap) seats.push({ ...s, outline: m.outline, rows: m.rows });
    });
  });
  return { metas, seats };
}
