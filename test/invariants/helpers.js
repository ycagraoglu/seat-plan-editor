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

/* ATTRS.wheel.wide=true — src/PlanEditor.jsx'teki TEK "wide" (koltuğu 86cm
   genişleten) nitelik; koltuğun GERÇEK dikdörtgenini ölçen invariant'lar
   (kapı/işaret çakışması, kendi tabanı içinde kalma) bunu bilmek zorunda.
   scripts/lib/load-module.mjs, PlanEditor.jsx'i esbuild ile geçici TEK bir
   dosyaya (PID'e göre adlandırılmış) derleyip ATTRS'i oradan canlı okuyor
   — ama scripts/validate-venues.mjs gibi sıralı çalışan tek bir Node
   sürecinde güvenli olan bu teknik, vitest'in varsayılan paralel/thread'li
   test-dosyası çalıştırmasında GÜVENLİ DEĞİL: birden fazla invariant test
   dosyası aynı anda loadModule() çağırırsa aynı geçici yola yazıp
   birbirinin dosyasını silebilir (aynı OS sürecinin thread'leri arasında
   process.pid ortak).
   ponytail: o yüzden burada sabit bir kopya tutuluyor — tek "wide"
   nitelik olduğu için drift riski düşük. ATTRS'e yeni bir wide:true
   nitelik eklenirse bu satır da güncellenmeli (scripts/validate-venues.mjs
   ile karşılaştır). Tek-kaynak isteniyorsa yükseltme yolu: vitest'i
   `fileParallelism:false` ile çalıştırıp loadModule()'u buradan çağırmak. */
export const WIDE_ATTRS = new Set(["wheel"]);

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
