/* ═══════════════════════════  KURAL MOTORU  ═══════════════════════════
   "İki blok tabanı çakışamaz" gibi kurallar üç ayrı yerde üç ayrı kodla
   yazılıydı: validate() (Doğrula raporu), scripts/validate-venues.mjs (CI)
   ve PlanEditor.jsx'teki breach/collide (canlı tuval uyarısı). Kapsamları
   birbirinden sapınca AKM'deki %16 kat-arası çakışma ÜÇÜNDE DE görünmedi.

   Bu dosya artık TEK kaynak: her kural burada bir kez tanımlanır, üç
   tüketici de aynı runRules()'u çağırır — biri "var" derken öteki "yok"
   diyemez, çünkü ikisi de aynı fonksiyonu çalıştırıyor.

   Bulgu şekli bugünkü validate() çıktısıyla UYUMLU: { t, m, d, ids } artı
   hangi kuralın ürettiğini söyleyen `id` (PlanEditor.jsx canlı uyarıda
   breach'i collide'dan bu alanla ayırıyor; var olan {t,m,d,ids} tüketicileri
   fazladan alanı yok sayar, bozulmaz). */
import { inPoly, outlineOverlapArea } from "./polygon.js";
import { boundaryPolys } from "./gates.js";
import { buildSeats, DEF, seatKindWidth, DEFAULT_SEAT_KIND, resolvePlanGroups, resolveBlockSectionId } from "./geometry.js";

export const inBounds = (x, y, polys) => !polys.length || polys.some((p) => inPoly(x, y, p));

/** Koltuk dikdörtgeninin dört köşesi (döndürülmüş). Taşma kontrolleri koltuk
 *  MERKEZİ değil gerçek dikdörtgeni kullanır: merkez tabanın içinde kalıp
 *  köşe dışarı taşabilir (geniş koltuklarda — tekerlekli sandalye, ikili —
 *  olduğu gibi). Genişlik artık koltuğun kendi seatKind'inden, core/
 *  geometry.js'teki SEAT_KINDS'ten geliyor — o da rules.js gibi bir ÇEKİRDEK
 *  dosya (fiziksel ölçü, görünüm/etiket DEĞİL), bu yüzden burada eskisi gibi
 *  ctx üzerinden enjekte edilmesine gerek kalmadı (bkz. eski wideAttrs/
 *  buildCtx notu — ATTRS UI dosyasında yaşarken bu dolaylama GEREKLİYDİ,
 *  SEAT_KINDS çekirdekte yaşadığı için artık gereksiz, doğrudan import).
 *  A5'te dışa açıldı: kapı/işaret-koltuk çakışma invariant'ı (test/invariants)
 *  koltuğun GERÇEK dikdörtgenine ihtiyaç duyuyor — ikinci bir kopyası
 *  yazılırsa tam da bu dosyanın başındaki notta anlatılan hata sınıfı
 *  (aynı geometri iki ayrı yerde iki ayrı kodla, sessizce sapabilir)
 *  tekrarlanır. */
export function seatCorners(s) {
  const w = seatKindWidth(s.seatKind) / 2, h = DEF.seatH / 2;
  const rad = (s.rot * Math.PI) / 180;
  const cos = Math.cos(rad), sin = Math.sin(rad);
  return [[-w, -h], [w, -h], [w, h], [-w, h]].map(([lx, ly]) => ({
    x: s.x + lx * cos - ly * sin, y: s.y + lx * sin + ly * cos,
  }));
}

/* Tüm koltukların TEK geçişte taranması. Bir düzine kural bunun bir
   parçasına ihtiyaç duyuyor (sınır, çakışma, yürüme payı, tekerlekli
   sandalye sayısı, yinelenen kimlik...) — hepsi burada bir kez üretilen
   `list`i okur, kendi buildSeats() döngüsünü açmaz. buildCtx() bunu LAZY
   (ctx.seats erişilene kadar hesaplanmaz) sunar: canlı (liveOnly) yol hiç
   dokunmaz, koltuk üretimi gibi pahalı bir işi sürükleme karesinde asla
   tetiklemez. */
function computeSeatScan(plan, metas) {
  const list = [];
  const kinds = {}, features = {}; const seen = new Map();
  /* groupId → { seatKind: count }: companion-group-incomplete kuralının
     tek girdisi. Burada, kinds/features'la AYNI tek geçişte toplanıyor —
     o kural kendi taramasını açmaz, computeSeatScan'in "tek kaynak"
     ilkesi (bkz. dosya başı notu) grup üyeliği için de geçerli. */
  const byGroup = new Map();
  let unlabeled = 0, total = 0;
  metas.forEach(({ b, m }) => {
    buildSeats(b, m, plan.idTemplate).seats.forEach((s) => {
      if (s.gap) return;
      total++;
      /* Yandan geçiş gerektirmeyen bloklar: masa (etrafı zaten bitişik
         oturma alanı) veya elle işaretlenmiş b.noAisle (loca gibi). */
      list.push({ id: s.id, seatKind: s.seatKind, seatFeatures: s.seatFeatures, groupId: s.groupId,
        x: s.x, y: s.y, rot: s.rot,
        block: b.label, bid: b.id, level: s.level, t: b.kind === "table" || !!b.noAisle,
        outline: m.outline });
      if (s.seatKind !== DEFAULT_SEAT_KIND) kinds[s.seatKind] = (kinds[s.seatKind] || 0) + 1;
      s.seatFeatures.forEach((f) => { features[f] = (features[f] || 0) + 1; });
      if (s.groupId) {
        if (!byGroup.has(s.groupId)) byGroup.set(s.groupId, {});
        const g = byGroup.get(s.groupId);
        g[s.seatKind] = (g[s.seatKind] || 0) + 1;
      }
      if (s.num === "" || s.num == null) unlabeled++;
      seen.set(s.id, (seen.get(s.id) || 0) + 1);
    });
  });

  /* Üst üste binen koltuk + dar açıklık: ızgara indeksiyle taranan TEK
     komşuluk taraması — ikisi de aynı çiftlere bakıyor, ayrı ayrı taramak
     iki katı iş olurdu. */
  const CELL = 200, grid = new Map();
  let clash = 0; const clashPairs = new Set(); const clashIds = new Set();
  list.forEach((q, i) => {
    const k = `${Math.floor(q.x / CELL)}:${Math.floor(q.y / CELL)}`;
    if (!grid.has(k)) grid.set(k, []);
    grid.get(k).push(i);
  });
  const narrow = { min: Infinity, pair: "", ids: [] };
  list.forEach((q, i) => {
    const cx = Math.floor(q.x / CELL), cy = Math.floor(q.y / CELL);
    for (let dx = -1; dx <= 1; dx++) for (let dy = -1; dy <= 1; dy++) {
      (grid.get(`${cx + dx}:${cy + dy}`) || []).forEach((j) => {
        if (j <= i) return;
        const w = list[j];
        const d = Math.hypot(q.x - w.x, q.y - w.y);
        if (d < 30) { clash++; clashPairs.add(q.block === w.block ? q.block : `${q.block}↔${w.block}`); clashIds.add(q.bid).add(w.bid); }
        /* İki masa arasında koridor aranmaz — sandalye sırtları bitişik
           olabilir. Farklı katlardaki bloklar da aranmaz. */
        if (q.block !== w.block && q.level === w.level && !(q.t && w.t) && d < narrow.min) {
          narrow.min = d; narrow.pair = `${q.block} ↔ ${w.block}`; narrow.ids = [q.bid, w.bid];
        }
      });
    }
  });

  return { list, kinds, features, byGroup, seen, unlabeled, total, clash, clashPairs, clashIds, narrow };
}

/** Kurallara ortak girdi. Her alan EN FAZLA bir kez hesaplanır — üç
 *  tüketici de (validate, validate-venues.mjs, canlı breach/collide) aynı
 *  buildCtx()'i çağırır, kimse kendi kopyasını üretmez.
 *  `seats` ve seat-köşesi tabanlı alanlar LAZY: yalnız gerçekten okunurlarsa
 *  hesaplanır, böylece canlı yol (liveOnly) koltuk üretimini asla tetiklemez.
 *  4. parametre (opts) artık YOK: tek kullanım alanı wideAttrs'tı (bkz.
 *  seatCorners'ın başındaki not), o da SEAT_KINDS'in doğrudan import
 *  edilmesiyle gereksizleşti. scripts/validate-venues.mjs (DOKUNMA) hâlâ
 *  4. argüman geçiyor — JS fazla argümanı sessizce yok sayar, çağrı
 *  BOZULMAZ, sadece artık okunmuyor. */
export function buildCtx(plan, metas, gates) {
  const bounds = boundaryPolys(plan);
  /* "Aynı kat" artık "bloğun ait olduğu aynı BÖLÜM" (rapor §5.1,
     core/geometry.js'teki resolveBlockSectionId). Göçmemiş bir planda
     (9 örnek salonun TAMAMI, src/venues/** hiç migrate() görmez) bu
     sentetik id b.level'ın SAF bir fonksiyonu — aynı level dizesi HER
     ZAMAN aynı id'yi ürettiği için bu gruplama eski "b.level || ''"
     anahtarıyla derinlik-1'de birebir örtüşür, davranış DEĞİŞMEZ. Fark
     yalnız göçmüş/elle kurulmuş bir planda ortaya çıkar: aynı level
     dizesini paylaşan iki blok FARKLI ebeveyne bağlıysa (bkz. görev
     tanımındaki Batı Tribünü → Alt Kat/Üst Kat → H Blok örneği) artık
     AYNI bölüm sayılmazlar — tam da bu ayrımı temsil edebilmek bu
     modelin var oluş nedeni. */
  const bySection = new Map();
  metas.forEach((x) => {
    const key = resolveBlockSectionId(x.b);
    if (!bySection.has(key)) bySection.set(key, []);
    bySection.get(key).push(x);
  });
  /* Blok taban hattı salon sınırının dışına taşıyor mu — bbox'sız, ucuz
     (blok sayısı × sınır köşe sayısı); canlı yolda her karede bunu
     yeniden hesaplamak sorun değil, pahalı olan koltuk üretimi. */
  const blockBreaches = bounds.length
    ? metas.filter(({ m }) => m.outline.some((q) => !inBounds(q.x, q.y, bounds)))
    : [];
  const doors = (plan.shapes || []).filter((s) => s.type === "door");

  const ctx = { plan, metas, gates, bounds, bySection, blockBreaches, doors };

  let seatsCache = null;
  Object.defineProperty(ctx, "seats", {
    get() {
      if (!seatsCache) seatsCache = computeSeatScan(plan, metas);
      return seatsCache;
    },
  });
  let seatBoundaryCache = null;
  Object.defineProperty(ctx, "seatBoundaryBreach", {
    get() {
      if (!seatBoundaryCache) {
        const outside = {}; const outsideIds = new Set(); let outCount = 0;
        if (bounds.length) {
          ctx.seats.list.forEach((s) => {
            if (!inBounds(s.x, s.y, bounds)) {
              outCount++; outside[s.block] = (outside[s.block] || 0) + 1; outsideIds.add(s.bid);
            }
          });
        }
        seatBoundaryCache = { outCount, outside, outsideIds };
      }
      return seatBoundaryCache;
    },
  });
  return ctx;
}

/* ─────────────────────────  KURALLAR  ─────────────────────────
   Sıra, eski validate()'teki out.push() sırasıyla AYNI (Doğrula raporunun
   satır sırası bu sıraya bağlı — bkz. görev raporundaki denklik kanıtı).
   `live: true` = PlanEditor.jsx tuvalinde her sürükleme karesinde koşar;
   bu ikisi (sınır taşması + aynı kat çakışma) bbox ön elemesi KORUYARAK
   yazıldı, aksi halde 96 bloklu bir stadyumda sürükleme kilitlenir. */
export const RULES = [
  {
    id: "seats-outside-boundary", severity: "err", live: false,
    check(ctx) {
      if (!ctx.bounds.length) return [];
      const { outCount, outside, outsideIds } = ctx.seatBoundaryBreach;
      if (!outCount) return [];
      return [{ t: "err", m: `${outCount.toLocaleString("tr-TR")} koltuk salon sınırının dışında`,
        d: Object.entries(outside).map(([b, n]) => `${b}: ${n}`).join(" · "), ids: [...outsideIds] }];
    },
  },
  /* Tuvaldeki canlı uyarı blok tabanına, doğrulama koltuklara bakıyordu;
     biri kırmızı çerçeve çizerken öteki "temiz" diyordu. İkisi de artık
     hem koltuğu hem tabanı ölçüyor (bu kural + üsttekı). */
  {
    id: "blocks-outside-boundary", severity: "err", live: true,
    check(ctx) {
      const outBlocks = ctx.blockBreaches;
      if (!outBlocks.length) return [];
      return [{ t: "err", m: `${outBlocks.length} bloğun dış hattı salon sınırına taşıyor`,
        d: outBlocks.slice(0, 8).map(({ b }) => b.name || b.label).join(", "),
        ids: outBlocks.map(({ b }) => b.id) }];
    },
  },
  {
    id: "bounds-clean-ok", severity: "ok", live: false,
    check(ctx) {
      if (!ctx.bounds.length) return [];
      if (ctx.blockBreaches.length || ctx.seatBoundaryBreach.outCount) return [];
      return [{ t: "ok", m: "Tüm koltuklar ve blok dış hatları salon sınırı içinde" }];
    },
  },
  /* Taban-taban çakışma: aynı kattaki iki bloğun dış hattı (koltukların
     değil, platformun kendisi) örtüşüyor mu? Koltuklar güvende olsa da
     taban payı örtüşebilir — koltuk merkezlerine bakan diğer kontrollerin
     kaçırdığı bir sınıf hata. bbox ön eleme yalnız HIZ içindir: bbox
     kesişmeyen iki çokgenin taban alanı da kesişemez, sonucu değiştirmez. */
  {
    id: "footprint-overlap-same-level", severity: "err", live: true,
    check(ctx) {
      const hit = new Set(); const pairs = [];
      for (const group of ctx.bySection.values())
        for (let i = 0; i < group.length; i++)
          for (let j = i + 1; j < group.length; j++) {
            const A = group[i].m, B = group[j].m;
            if (A.bbox.x1 < B.bbox.x0 || B.bbox.x1 < A.bbox.x0) continue;
            if (A.bbox.y1 < B.bbox.y0 || B.bbox.y1 < A.bbox.y0) continue;
            const area = outlineOverlapArea(A.outline, B.outline);
            if (area > 50) {
              hit.add(group[i].b.id); hit.add(group[j].b.id);
              pairs.push({ a: group[i].b.name || group[i].b.label, b: group[j].b.name || group[j].b.label,
                area, ai: group[i].b.id, bi: group[j].b.id });
            }
          }
      if (!pairs.length) return [];
      /* Mesaj BLOK sayısı versin (hit.size), çift sayısı (pairs.length) değil:
         zincir çakışmada (A↔B, B↔C) 3 blok ama 2 çift var — canlı durum
         çubuğu, tuvaldeki kırmızı dış hatlar ve ids alanı zaten bloğa
         dayalı, ikisi aynı sayıyı söylemeli (bkz. görev raporu). d detayı
         yine ÇİFT bazlı listelenir, o ayrı bir bilgi (hangi ikili çakışıyor).
         maxArea: canlı şeritte "en fazla ne kadar" göstermek için kuralın
         zaten hesapladığı en büyük örtüşme alanını taşır — yeni hesap yok. */
      return [{ t: "err", m: `${hit.size} blok dış hattı başka bir bloğun dış hattıyla çakışıyor`,
        d: pairs.slice(0, 6).map((o) => `${o.a}↔${o.b} (${Math.round(o.area).toLocaleString("tr-TR")}cm²)`).join(" · "),
        ids: [...hit], maxArea: Math.max(...pairs.map((o) => o.area)) }];
    },
  },
  /* Kat-arası taban çakışması. Gerçek bir salonda balkon partere sarkabilir,
     o yüzden bu HATA değil UYARI. (AKM'de 1. ve 2. Balkon tabanları %16
     biniyordu; yalnız-aynı-kat kontrolü bunu hiç görmemişti.) Bilerek
     `live: false`: balkon sarkması fiziksel olarak mümkün, sürüklerken
     kırmızıya boyanması yanlış alarm olur — Doğrula raporunda uyarı
     olarak kalmaya devam ediyor. */
  {
    id: "footprint-overlap-cross-level", severity: "warn", live: false,
    check(ctx) {
      const crossIds = new Set(); const crossPairs = [];
      const secKeys = [...ctx.bySection.keys()];
      for (let a = 0; a < secKeys.length; a++)
        for (let b2 = a + 1; b2 < secKeys.length; b2++)
          for (const A of ctx.bySection.get(secKeys[a]))
            for (const B of ctx.bySection.get(secKeys[b2])) {
              const area = outlineOverlapArea(A.m.outline, B.m.outline);
              if (area > 50) {
                crossPairs.push(`${A.b.name || A.b.label}↔${B.b.name || B.b.label}`);
                crossIds.add(A.b.id); crossIds.add(B.b.id);
              }
            }
      if (!crossPairs.length) return [];
      return [{ t: "warn", m: `${crossPairs.length} blok dış hattı farklı kattaki bir blokla çakışıyor`,
        d: `${crossPairs.slice(0, 6).join(" · ")} · balkon sarkması olabilir, ama planda üst üste binerler`,
        ids: [...crossIds] }];
    },
  },
  {
    id: "seat-clash", severity: "err", live: false,
    check(ctx) {
      const { clash, clashPairs, clashIds } = ctx.seats;
      if (!clash) return [];
      return [{ t: "err", m: `${clash.toLocaleString("tr-TR")} koltuk çifti üst üste biniyor`,
        d: [...clashPairs].slice(0, 6).join(" · "), ids: [...clashIds] }];
    },
  },
  /* Farklı bloklar arasında insanın geçebileceği bir açıklık olmalı.
     90 cm altı geçit sayılmaz. */
  {
    id: "narrow-aisle", severity: "err", live: false,
    check(ctx) {
      const { narrow } = ctx.seats;
      if (narrow.min === Infinity) return [];
      if (narrow.min < 90) return [{ t: "err",
        m: `Bloklar arasında yürüme payı yok — en dar açıklık ${Math.round(narrow.min)} cm`,
        d: `${narrow.pair} · geçit için en az 90 cm gerekir`, ids: narrow.ids }];
      if (narrow.min < 120) return [{ t: "warn",
        m: `Bloklar arası en dar açıklık ${Math.round(narrow.min)} cm`,
        d: `${narrow.pair} · rahat geçiş için 120 cm önerilir`, ids: narrow.ids }];
      return [];
    },
  },
  {
    id: "seat-count", severity: "info", live: false,
    check(ctx) {
      const { total } = ctx.seats;
      return [{ t: "info", m: `${total.toLocaleString("tr-TR")} koltuk` }];
    },
  },
  /* Gerekli tekerlekli sandalye yeri kademeli: ilk 500 koltuk için 6,
     sonraki her 150 koltuk için 1, 5.000'in üstünde her 200 koltuk için 1.
     seat_kind + features ayrımından sonra "tekerlekli" artık bir KIND
     (wheelchair_space), "refakatçi" de öyle (companion) — ikisi de
     ctx.seats.kinds'ten okunuyor (eski ctx.seats.at.wheel/at.comp). */
  {
    id: "wheelchair-adequacy", severity: "err", live: false,
    check(ctx) {
      const { total, kinds } = ctx.seats;
      const need = total <= 25 ? 1 : total <= 50 ? 2 : total <= 150 ? 4
        : total <= 300 ? 5 : total <= 500 ? 6
        : total <= 5000 ? 6 + Math.ceil((total - 500) / 150)
        : 36 + Math.ceil((total - 5000) / 200);
      const wheel = kinds.wheelchair_space || 0;
      if (!wheel) return [{ t: "err", m: `Tekerlekli sandalye alanı tanımlanmamış — en az ${need} gerekiyor` }];
      if (wheel < need) return [{ t: "warn",
        m: `${wheel} tekerlekli sandalye alanı — bu kapasite için ${need} gerekiyor`,
        d: `${need - wheel} yer daha eklenmeli` }];
      return [{ t: "ok", m: `${wheel} tekerlekli sandalye alanı · ${kinds.companion || 0} refakatçi`, d: `gereken ${need}` }];
    },
  },
  {
    id: "companion-seat-shortfall", severity: "warn", live: false,
    check(ctx) {
      const { kinds } = ctx.seats;
      const wheel = kinds.wheelchair_space || 0;
      if (!wheel || (kinds.companion || 0) >= wheel) return [];
      return [{ t: "warn", m: `Refakatçi koltuğu tekerlekli sandalye alanından az (${kinds.companion || 0} < ${wheel})` }];
    },
  },
  /* Rapor §5.4: bir refakatçinin hangi tekerlekli sandalye konumuyla
     ilişkili olduğu AÇIKÇA tanımlanmalı — yukarıdaki iki kural toplam
     SAYIYA bakıyor (kaç tane var), bu kural İLİŞKİYE bakıyor (hangileri
     birbirine bağlı). companion_group bu bağı taşır (bkz. core/geometry.js
     resolvePlanGroups): grup listesi kayıtlı (plan.groups) + masa-türevi
     grupları birleştirir, yalnız kind==="companion_group" olanlar burada
     ilgi konusu — masa grupları (kind:"table") bu kurala hiç girmez.
     Üyelik sayımı ctx.seats.byGroup'tan (computeSeatScan'in tek geçişi,
     kendi taraması AÇILMADI). BU TURDA hiçbir örnek salonda companion_group
     YOK (elle gruplama arayüzü ayrı iş) — bu yüzden 9 salonun hiçbirinde
     tetiklenmiyor, yalnız test/unit/rules.test.js'teki sentetik planda. */
  {
    id: "companion-group-incomplete", severity: "err", live: false,
    check(ctx) {
      const groups = resolvePlanGroups(ctx.plan).filter((g) => g.kind === "companion_group");
      if (!groups.length) return [];
      const { byGroup, list } = ctx.seats;
      const bad = groups.filter((g) => {
        const t = byGroup.get(g.id);
        return !t || !t.wheelchair_space || !t.companion;
      });
      if (!bad.length) return [];
      const ids = new Set();
      list.forEach((s) => { if (s.groupId && bad.some((g) => g.id === s.groupId)) ids.add(s.bid); });
      return [{ t: "err", m: `${bad.length} refakatçi grubu eksik — tekerlekli sandalye alanı ve refakatçi koltuğunun ikisi de gerekir`,
        d: bad.map((g) => {
          const t = byGroup.get(g.id) || {};
          const missing = [!t.wheelchair_space && "tekerlekli sandalye alanı", !t.companion && "refakatçi koltuğu"]
            .filter(Boolean).join(" ve ");
          return `${g.code || g.name}: ${missing} yok`;
        }).join(" · "),
        ids: [...ids] }];
    },
  },
  /* "Görüş kısıtlı" artık bir KIND değil bir FEATURE (restrictedView) —
     hangi seat_kind'te olursa olsun sayılır, ctx.seats.features'ten
     (eski ctx.seats.at.obstr). */
  {
    id: "obstructed-view-count", severity: "info", live: false,
    check(ctx) {
      const { features } = ctx.seats;
      if (!features.restrictedView) return [];
      return [{ t: "info", m: `${features.restrictedView.toLocaleString("tr-TR")} görüş kısıtlı koltuk` }];
    },
  },
  {
    id: "duplicate-seat-ids", severity: "err", live: false,
    check(ctx) {
      const dups = [...ctx.seats.seen].filter(([, n]) => n > 1);
      if (!dups.length) return [];
      return [{ t: "err", m: `${dups.length} yinelenen koltuk kimliği`,
        d: dups.slice(0, 6).map(([id, n]) => `${id} ×${n}`).join(", ") }];
    },
  },
  {
    id: "unlabeled-seats", severity: "err", live: false,
    check(ctx) {
      if (!ctx.seats.unlabeled) return [];
      return [{ t: "err", m: `${ctx.seats.unlabeled} etiketsiz koltuk` }];
    },
  },
  {
    id: "blocks-without-level", severity: "warn", live: false,
    check(ctx) {
      const noLevel = ctx.plan.blocks.filter((b) => !b.level).length;
      if (!noLevel) return [];
      return [{ t: "warn", m: `${noLevel} blok katsız` }];
    },
  },
  {
    id: "no-doors", severity: "warn", live: false,
    check(ctx) {
      if (ctx.doors.length) return [];
      return [{ t: "warn", m: "Hiç kapı tanımlanmamış" }];
    },
  },
  {
    id: "orphan-blocks", severity: "err", live: false,
    check(ctx) {
      if (!ctx.doors.length) return [];
      const orphan = ctx.plan.blocks.filter((b) => !ctx.gates || !ctx.gates.has(b.id));
      if (!orphan.length) return [];
      return [{ t: "err", m: `${orphan.length} blok hiçbir kapıya bağlı değil`,
        d: orphan.slice(0, 8).map((b) => b.name || b.label).join(", "), ids: orphan.map((b) => b.id) }];
    },
  },
  {
    id: "empty-doors", severity: "warn", live: false,
    check(ctx) {
      if (!ctx.doors.length) return [];
      const emptyDoor = ctx.doors.filter((d) => !(d.blocks || []).length);
      if (!emptyDoor.length) return [];
      return [{ t: "warn", m: `${emptyDoor.length} kapıya blok atanmamış`,
        d: emptyDoor.slice(0, 8).map((d) => d.label).join(", ") }];
    },
  },
  {
    id: "duplicate-block-labels", severity: "info", live: false,
    check(ctx) {
      const lbl = new Map();
      ctx.plan.blocks.forEach((b) => lbl.set(b.label, (lbl.get(b.label) || 0) + 1));
      const dupL = [...lbl].filter(([, n]) => n > 1);
      if (!dupL.length) return [];
      const dupLbls = new Set(dupL.map(([l]) => l));
      return [{ t: "info", m: `${dupL.length} blok kimliği birden fazla blokta kullanılmış`,
        d: dupL.slice(0, 6).map(([l, n]) => `${l} ×${n}`).join(", "),
        ids: ctx.plan.blocks.filter((b) => dupLbls.has(b.label)).map((b) => b.id) }];
    },
  },
  {
    id: "empty-blocks", severity: "warn", live: false,
    check(ctx) {
      const emptyBlocks = ctx.metas.filter(({ m }) => m.seatCount === 0);
      if (!emptyBlocks.length) return [];
      return [{ t: "warn", m: `${emptyBlocks.length} boş blok`, ids: emptyBlocks.map(({ b }) => b.id) }];
    },
  },
  /* Aşağıdaki iki kural validate()'te YOKTU — yalnız scripts/validate-venues.mjs
     kendi elle yazdığı seatCorners() ile kontrol ediyordu (koltuk MERKEZİ
     değil gerçek dikdörtgeni). O dosyanın kendi kopyasını tutmaması için
     buraya taşındı; runRules() tek giriş noktası olduğundan validate() da
     bunları otomatik kazanıyor — 9 örnek salonun hiçbirinde tetiklenmiyor
     (bkz. görev raporu), o yüzden Doğrula çıktısını değiştirmiyor. */
  {
    id: "seat-in-own-block", severity: "err", live: false,
    check(ctx) {
      const bad = new Set();
      ctx.seats.list.forEach((s) => {
        const corners = seatCorners(s);
        if (corners.some((c) => !inPoly(c.x, c.y, s.outline))) bad.add(s.bid);
      });
      if (!bad.size) return [];
      return [{ t: "err", m: `${bad.size} bloğun koltuğu kendi dış hattının dışına taşıyor`, ids: [...bad] }];
    },
  },
  {
    id: "seat-corners-outside-boundary", severity: "err", live: false,
    check(ctx) {
      if (!ctx.bounds.length) return [];
      let count = 0; const ids = new Set();
      ctx.seats.list.forEach((s) => {
        const corners = seatCorners(s);
        if (corners.some((c) => !inBounds(c.x, c.y, ctx.bounds))) { count++; ids.add(s.bid); }
      });
      if (!count) return [];
      return [{ t: "err", m: `${count} koltuğun köşesi salon sınırının dışına taşıyor`, ids: [...ids] }];
    },
  },
];

/** Tek giriş noktası. `liveOnly: true` yalnız `live: true` kuralları
 *  çalıştırır (canvas'ın her sürükleme karesinde çağırdığı yol) —
 *  koltuk üretimi gibi pahalı işlere ASLA dokunmaz, çünkü o kurallar
 *  ctx.seats'e hiç erişmez ve ctx.seats lazy'dir. */
export function runRules(ctx, { liveOnly = false } = {}) {
  const out = [];
  for (const rule of RULES) {
    if (liveOnly && !rule.live) continue;
    for (const f of rule.check(ctx)) out.push({ id: rule.id, ...f });
  }
  return out;
}
