import { offsetPoly } from "./polygon.js";
import { numberRow, rowLabel } from "./labels.js";
import { formatId } from "./identity.js";

export const RAD = Math.PI / 180;
export const DEF = { seatGap: 50, rowGap: 90, seatW: 41, seatH: 38 };

/* ═══════════════════════════════════════════════════════════════════════
   KOLTUK TÜRÜ (seat_kind) + ÖZELLİK (features) SÖZLÜĞÜ
   Kaynak: Evrensel Mekân Yerleşim ve Koltuk Planı Değerlendirme Raporu §5.4,
   koltuk modelini üç ayrı sorumluluğa ayırıyor:
     seat_kind  = fiziksel oturma/yer birimi NEDİR (bu koltukta HER ZAMAN
                  bir değer var, "single" varsayılan) — burada, SEAT_KINDS.
     features   = bu yerin erişim/görüş özelliği (0..N) — sözlüğü (etiket/
                  renk) PlanEditor.jsx'teki FEATURES'ta, burası sadece
                  değerleri (legacyAtToKind) bilir.
     seat_group = hangi yerler birlikte TEK birim sayılır (masa, loca,
                  love-seat çifti, refakatçi grubu...) — bu dosyada AŞAĞIDA,
                  resolveSeatGroup/resolvePlanGroups, §5.3.
   width: koltuğun çizilen GENİŞLİĞİ (cm). Eskiden ATTRS[k].wide → sabit 86
   tek bir "geniş" bayrağıydı (bkz. eski v8 notu); artık her tür kendi
   ölçüsünü taşıyor — core/rules.js (seatCorners) ve PlanEditor.jsx (render)
   AYNI sözlükten okur, iki ayrı genişlik sabiti yaşamaz. */
export const SEAT_KINDS = {
  single:           { width: DEF.seatW },  // standart tek kişilik (varsayılan)
  loveseat:         { width: 74 },         // fiziksel birleşik ikili — tekliden belirgin geniş
  wheelchair_space: { width: 86 },         // DEĞİŞMEZ: mevcut 9 salonun geometrisi buna bağlı (bkz. görev tanımı)
  companion:        { width: DEF.seatW },  // refakatçi — normal tekli genişlik
  stool:            { width: 34 },         // tabure — tekliden küçük
  /* Raporun kontrollü sözlüğünde (single/loveseat/wheelchair_space/
     companion/stool) KARŞILIĞI YOK. Izgarada yer kaplayan ama seyirci
     koltuğu OLMAYAN bir konum (kamera platformu, ışık masası) — "erişim/
     görüş özelliği" (feature) de değil, bambaşka bir fiziksel gerçek.
     Editöre özgü bir UZANTI: bu referansı okuyup DB şemasına geçirecek
     ekip bunun raporun STANDART sözlüğünde olmadığını bilmeli. */
  tech:             { width: DEF.seatW },
};
export const DEFAULT_SEAT_KIND = "single";
export const seatKindWidth = (kind) => SEAT_KINDS[kind]?.width ?? DEF.seatW;

/* Eski tek-alan sözlüğü (v8'den kalma ATTRS/`at`) → yeni {seatKind,
   seatFeatures}. src/venues/** (DOKUNMA) hâlâ ham `attr`/`ov.at` yazıyor —
   builders.js'teki withAccessible() örneğin ov[k]={at:"wheel"} üretiyor,
   venue dosyaları hiçbir zaman core/schema.js'in migrate()'inden geçmiyor
   (bkz. o dosyanın başlık notu) — bu yüzden bu eşleme HEM burada (aşağıda,
   resolveSeatKind ile ham salon verisini OKUMA anında yorumlamak için) HEM
   core/schema.js'in kalıcı göçünde (kullanıcının KAYITLI planını dönüştürmek
   için) kullanılıyor. TEK kaynak: schema.js kendi kopyasını tutmaz, buradan
   import eder. */
export const LEGACY_AT_MAP = {
  "":      { seatKind: "single",           seatFeatures: [] },
  wheel:   { seatKind: "wheelchair_space", seatFeatures: ["accessible"] },
  comp:    { seatKind: "companion",        seatFeatures: ["accessible"] },
  obstr:   { seatKind: "single",           seatFeatures: ["restrictedView"] },
  tech:    { seatKind: "tech",             seatFeatures: [] },
};
export const legacyAtToKind = (at) => LEGACY_AT_MAP[at ?? ""] ?? LEGACY_AT_MAP[""];

/** Bir BLOĞUN kendi varsayılanı (koltuk istisnaları hariç). Önce yeni alanı
 *  (b.seatKind) dener, yoksa eski tek-alanı (b.attr, venue dosyaları) çözer.
 *  DİKKAT: b.kind blokun ŞEKLİDİR ("grid"/"fan"/"table"/"free") — bilerek
 *  AYRI adlandırıldı (b.seatKind), aksi hâlde bu ikisi çakışırdı. */
function blockSeatKind(b) {
  if (b.seatKind !== undefined) return { seatKind: b.seatKind, seatFeatures: b.seatFeatures || [] };
  if (b.attr) return legacyAtToKind(b.attr);
  return { seatKind: DEFAULT_SEAT_KIND, seatFeatures: [] };
}

/** Bir KOLTUĞUN etkin türü + özellik listesi. seatKind ve seatFeatures
 *  BİRBİRİNDEN BAĞIMSIZ override edilebilir (raporun "iki ayrı sorumluluk"
 *  ayrımı burada da geçerli: bir koltuğun türünü değiştirmeden sadece
 *  özelliğini eklemek/kaldırmak mümkün olmalı, bkz. MultiSeatPanel'in
 *  toplu özellik ekle/kaldır eylemi) — her biri KENDİ alanı tanımlıysa
 *  (`!== undefined`) o alanı kullanır, tanımlı DEĞİLSE aynı katmandaki
 *  DİĞER alana değil, bir alt katmana (blok varsayılanına) düşer.
 *  Eski tek-alan (`at`/`attr`) bu ayrımı yapamaz (ikisini AYNI ANDA verir)
 *  — legacyAtToKind onu SADECE o katmanda hiç yeni alan yoksa devreye
 *  girer (venue dosyaları / göçmemiş kayıtlar hâlâ bunu yazıyor,
 *  PlanEditor.jsx'in kendisi artık SADECE yeni alanları yazıyor, bkz.
 *  paintOv). Dönüş HER ZAMAN somut: seatKind hiçbir zaman boş/undefined
 *  değil (raporun modelinde her koltuğun bir seat_kind'i vardır),
 *  seatFeatures hiçbir zaman null değil (yoksa []). */
export function resolveSeatKind(b, o) {
  const legacy = o && o.at !== undefined ? legacyAtToKind(o.at) : null;
  const base = legacy || blockSeatKind(b);
  return {
    seatKind: o && o.seatKind !== undefined ? o.seatKind : base.seatKind,
    seatFeatures: o && o.seatFeatures !== undefined ? o.seatFeatures : base.seatFeatures,
  };
}

/* ═══════════════════════════════════════════════════════════════════════
   KOLTUK GRUBU (seat_group) — rapor §5.3. Üçüncü ve son sorumluluk:
   seat_kind ("bu ne") ve features ("bu ne özellikte") koltuğun KENDİ
   nitelikleri; seat_group koltuklar ARASI bir İLİŞKİ — "bu koltuk hangi
   diğer koltuklarla birlikte tek birim sayılır" (masa, loca, love-seat
   çifti, refakatçi grubu...). Tür sözlüğü: table · box · loveseat · pod ·
   companion_group.

   Grubun kendisi (id/code/name/kind) PLAN seviyesinde yaşar (plan.groups,
   şema v3, bkz. core/schema.js) — bir blok DEĞİL, bloklar arası/üstü bir
   varlık: bir refakatçi grubu iki AYRI bloktaki iki koltuğu eşleyebilir;
   bir box/loca birden fazla koltuk içerir ama kendi geometrik bloğu
   değildir. Koltuğun HANGİ gruba ait olduğu ise seat_kind/features ile
   AYNI mekanizmaya oturur: b.ov[key] istisnası — resolveSeatGroup,
   resolveSeatKind'in yanına, aynı imza (b, o), aynı öncelik kuralı (o
   tanımlıysa o kazanır, yoksa blok varsayılanına düşer). Yeni bir
   mekanizma AÇILMADI: rapor zaten üç sorumluluğu ayırıyor, taşıma
   mekanizmasını değil.

   TEK istisna — kind:"table": bir masa bloğu ZATEN fiziksel bir masadır,
   etrafındaki koltuklar TANIM GEREĞİ ona aittir (görev tanımı). Bunu
   kullanıcıya elle işaretletmek hem gereksiz hem hataya açık (bir koltuk
   unutulursa masa "yarım" gruplanır). O yüzden masa grubu HİÇ SAKLANMAZ:
   b.kind==="table" olan her blok için id/code/name/kind HER OKUMADA
   burada yeniden türetilir; src/venues/** (DOKUNMA) tek satır bile
   değişmedi, salon dosyaları bunun varlığından habersiz. Blok zaten kendi
   id'sini taşıdığı için grubun id'si de ONUN id'si (tableGroupId) — masa
   ile grubu arasında 1:1 bir ilişki var, ayrı bir kimlik uydurmak sahte
   bir ayrım eklerdi. */
export const tableGroupId = (b) => b.id;

/** Bir KOLTUĞUN ait olduğu grup — resolveSeatKind'in birebir eşi. Öncelik:
 *  ov istisnası (o.groupId, TANIMLIYSA — null dahil: "bu koltuğu
 *  varsayılan masa grubundan çıkar" demek, bkz. resolveSeatKind'deki aynı
 *  bağımsız-override deseni) > blok varsayılanı (yalnız masa bloklarında
 *  var) > hiç grup yok (null). */
export function resolveSeatGroup(b, o) {
  if (o && o.groupId !== undefined) return o.groupId;
  return b.kind === "table" ? tableGroupId(b) : null;
}

/** Bir planın TÜM gruplarının listesi: kayıtlı olanlar (plan.groups —
 *  kullanıcının/arayüzün box/loveseat/pod/companion_group için elle
 *  kuracağı liste, BU TURDA arayüzü yok, veri modeli hazır) + masa
 *  bloklarından türetilenler (asla saklanmaz, her çağrıda üretilir).
 *  export.js (seats.json) ve rules.js (companion_group doğrulaması) TEK
 *  bu fonksiyonu çağırır — ikisi ayrı ayrı "masayı grupla" mantığı YAZMAZ. */
export function resolvePlanGroups(plan) {
  const tableGroups = (plan.blocks || [])
    .filter((b) => b.kind === "table")
    .map((b) => ({ id: tableGroupId(b), code: b.label, name: b.name || b.label, kind: "table" }));
  return [...(plan.groups || []), ...tableGroups];
}

/* ─────────────────────────  YARDIMCILAR  ───────────────────────── */

export function parseCounts(s) {
  const t = String(s || "").trim();
  if (!t) return null;
  const m = t.match(/^(\d+)\s*\.\.\s*(\d+)$/);
  if (m) return { from: +m[1], to: +m[2] };
  const list = t.split(",").map((x) => parseInt(x.trim(), 10)).filter((n) => n > 0);
  return list.length ? list : null;
}
export function countAt(spec, r, rows, fb) {
  if (!spec) return fb;
  if (spec.from != null) {
    const t = rows <= 1 ? 0 : r / (rows - 1);
    return Math.max(1, Math.round(spec.from + (spec.to - spec.from) * t));
  }
  return spec[r] ?? spec[spec.length - 1];
}
export const offsetFor = (align, maxN, n) =>
  align === "left" ? 0 : align === "right" ? maxN - n : Math.round((maxN - n) / 2);

/** Blok tabanının koltuklardan ne kadar dışarı taştığı — kullanıcı payı +
 *  koltuğun yarısı + yarım koltuk aralığı (bkz. buildMeta içindeki uzun not).
 *  A4'ten önce bu toplam yalnız buildMeta'nın içinde yaşıyordu, salon
 *  dosyalarını yazanlar için GÖRÜNMEZDİ; kademeler arası açıklığı elle
 *  ayarlarken bu payı unutmak AKM ve Ülker'de gerçek çakışmaya yol açtı
 *  (bkz. src/core/solve.js). O yüzden buraya, PAYLAŞILAN bir fonksiyona
 *  çıkarıldı: buildMeta ve solve.js AYNI hesabı çağırır, kopya tutmaz. */
export function footprintPad(b) {
  const pad = b.pad != null ? b.pad : 55;
  return pad + Math.max(DEF.seatW, DEF.seatH) / 2 + b.seatGap / 2;
}

/* ─────────────────────────  GEOMETRİ ÇEKİRDEĞİ  ───────────────────────── */

export function prep(b) {
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

export function rowPts(b, r, P) {
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
export function rowEnds(b, r, P) {
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
export function tableCells(b) {
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

export const toWorld = (b, p, cos, sin) => ({ x: b.x + p.x * cos - p.y * sin, y: b.y + p.x * sin + p.y * cos });
export const toLocal = (b, p) => {
  const a = -(b.rot || 0) * RAD, dx = p.x - b.x, dy = p.y - b.y;
  return { x: Math.round(dx * Math.cos(a) - dy * Math.sin(a)),
           y: Math.round(dx * Math.sin(a) + dy * Math.cos(a)) };
};
export const polarPt = (r, a) => ({ x: r * Math.sin(a * RAD), y: -r * Math.cos(a * RAD) });

/* ─────────────────────────  META / KOLTUKLAR  ───────────────────────── */

export function buildMeta(b) {
  const P = prep(b);
  const cos = Math.cos(b.rot * RAD), sin = Math.sin(b.rot * RAD);
  const rows = P.counts.length;
  let removed = 0, gaps = 0;
  Object.values(b.ov || {}).forEach((o) => { if (o.rm) removed++; else if (o.gap) gaps++; });
  const seatCount = P.counts.reduce((a, c) => a + c, 0) - removed - gaps;

  /* tür + özellik sayımı — blok varsayılanı + koltuk istisnaları. "single"
     (varsayılan tür) sayılmaz — eski attrs'ın boş `at`'ı hiç saymaması ile
     aynı fikir, binlerce normal koltuğu chip'te göstermenin anlamı yok.
     features 0..N olduğu için (seat_kind'in aksine) bir koltuk BİRDEN
     FAZLA sayaca birden katkı yapabilir. */
  const kinds = {}, features = {};
  /* seatKind ve seatFeatures BAĞIMSIZ override edilebildiği için (bkz.
     resolveSeatKind'in dosya başı notu) üçünü de tek tek kontrol ediyoruz
     — sadece seatFeatures'ı değişmiş bir koltuk (kind blok varsayılanından
     miras) bu filtreyi KAÇIRIRSA baseCount'a yanlışlıkla dahil olur. */
  const withOverride = Object.values(b.ov || {})
    .filter((o) => !o.rm && !o.gap && (o.seatKind !== undefined || o.seatFeatures !== undefined || o.at !== undefined));
  const base = blockSeatKind(b);
  const baseCount = Math.max(0, seatCount - withOverride.length);
  if (baseCount > 0) {
    if (base.seatKind !== DEFAULT_SEAT_KIND) kinds[base.seatKind] = (kinds[base.seatKind] || 0) + baseCount;
    base.seatFeatures.forEach((f) => { features[f] = (features[f] || 0) + baseCount; });
  }
  withOverride.forEach((o) => {
    const eff = resolveSeatKind(b, o);
    if (eff.seatKind !== DEFAULT_SEAT_KIND) kinds[eff.seatKind] = (kinds[eff.seatKind] || 0) + 1;
    eff.seatFeatures.forEach((f) => { features[f] = (features[f] || 0) + 1; });
  });
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
  /* Eski çözüm 3 geçişli ortalama + sapma sınırıydı. Basamağı tam
     yutamadığı için kenar kırıklı kalıyordu (Zorlu ORK-C'de görüldü:
     sağ uç 50cm'lik basamaklarla iniyor, yumuşatma sınırı 27,5cm).
     Yerine DIŞBÜKEY ZİNCİR: bir nokta, komşularını birleştiren doğrunun
     içinde kalıyorsa atılır; dışında kalıyorsa korunur. Sonuç parça parça
     DÜZ bir kenar ve — kritik olan — hat hiçbir zaman içeri kesmez, yani
     koltuk taban dışında kalamaz. Ortalama alan eski yöntem içeri
     kesebiliyordu, sapma sınırı da tam bunun içindi.
     Yalnız testere dişi ölçeğindeki sapmalar atılır (≤ bir koltuk
     aralığı); gerçek daralma, oyuk ve kavis olduğu gibi korunur. */
  let ox = 0, oy = 0;
  for (let r = 0; r < rows; r++) { ox += re[r].x - le[r].x; oy += re[r].y - le[r].y; }
  const olen = Math.hypot(ox, oy) || 1;
  const outR = { x: ox / olen, y: oy / olen };
  const chainEdge = (pts, out) => {
    if (pts.length < 3) return pts;
    const st = [];
    for (const p of pts) {
      while (st.length >= 2) {
        const a = st[st.length - 2], q = st[st.length - 1];
        let nx = -(p.y - a.y), ny = p.x - a.x;
        const nl = Math.hypot(nx, ny) || 1;
        nx /= nl; ny /= nl;
        if (nx * out.x + ny * out.y < 0) { nx = -nx; ny = -ny; }
        const d = (q.x - a.x) * nx + (q.y - a.y) * ny;   // q'nun dışa sapması
        if (d > 0) break;                 // dışarı taşıyor → köşe gerçek, koru
        if (-d > b.seatGap) break;        // derin oyuk → gerçek geometri, koru
        st.pop();                         // testere dişi → at
      }
      st.push(p);
    }
    return st;
  };
  const rs = chainEdge(re, outR);
  const ls = chainEdge(le, { x: -outR.x, y: -outR.y });
  const rightEdge = rs.slice(1, -1).map(W);
  const leftEdge = ls.slice(1, -1).map(W);
  /* ring, sol kenarı halkanın dolaşım yönüne uydurmak için TERS sırada
     ister — ama Array.reverse() YERİNDE çalışır, leftEdge'i kalıcı
     tersine çevirir. Kopya üstünde tersliyoruz ki dışa aktarılan leftEdge
     rightEdge ile AYNI yönde (ön→arka sıra) kalsın — kenar düzgünlüğü
     testi (test/invariants) ikisini de bu ortak sırayla okuyor. */
  const ring = [...front, ...rightEdge, ...back, ...[...leftEdge].reverse()];

  /* Pay = kullanıcı payı + koltuğun yarısı + yarım koltuk aralığı.
     Son terim eskiden yumuşatmanın kenarı içeri çekmesini telafi ediyordu;
     dışbükey zincir artık içeri kesmediği için o gerekçe kalktı. Yine de
     duruyor: koltuk gövdesi ile komşu bloğun kenarı arasında nefes payı
     bırakıyor ve salonların taban aralıkları bu değere göre ayarlandı
     (GS/Ülker/AKM kademe boşlukları). Kaldırmak tüm salonların çakışma
     dengesini bozar — ayrı bir iş. */
  const auto = offsetPoly(ring, footprintPad(b));

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
    return { P, seatCount, kinds, features, outline: ol, auto: ol, manual: false,
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
    return { P, seatCount, kinds, features, outline: ol, auto: ol, manual: false,
      cx: (Math.min(...xs1) + Math.max(...xs1)) / 2,
      cy: (Math.min(...ys1) + Math.max(...ys1)) / 2, rows,
      bbox: { x0: Math.min(...xs1), x1: Math.max(...xs1), y0: Math.min(...ys1), y1: Math.max(...ys1) } };
  }

  const manual = b.foot && b.foot.length >= 3;
  const outline = manual ? b.foot.map(W) : auto;
  const cx = outline.reduce((a, p) => a + p.x, 0) / outline.length;
  const cy = outline.reduce((a, p) => a + p.y, 0) / outline.length;
  const xs = outline.map((p) => p.x), ys = outline.map((p) => p.y);
  /* leftEdge/rightEdge dışa aktarılıyor: A5'teki kenar-düzgünlüğü testi
     (test/invariants) bu ikisini OKUR, kendi kopyasını üretmez — dışbükey
     zincirin TEK kaynağı burası, yoksa test ile buildMeta'nın kenar
     hesabı zamanla birbirinden sapabilir (bkz. rules.js dosya başı notu:
     tam bu yüzden A2'de kural motoru tek kaynağa indirildi). `manual`
     true olduğunda (elle çizilmiş taban) bu ikisi koltuk sırasından
     türetilmiş ama KULLANILMAYAN yardımcı veridir — test bu durumda
     onları yok saymalı, çünkü gerçek dış hat b.foot'tur ve kasıtlı
     köşeli olabilir (sütun, merdiven boşluğu). */
  return { P, seatCount, kinds, features, outline, auto, manual, cx, cy, rows, leftEdge, rightEdge,
    bbox: { x0: Math.min(...xs), x1: Math.max(...xs), y0: Math.min(...ys), y1: Math.max(...ys) } };
}

export function buildSeats(b, meta, tpl) {
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
        ...resolveSeatKind(b, o), groupId: resolveSeatGroup(b, o),
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
