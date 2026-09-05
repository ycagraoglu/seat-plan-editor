/* ─────────────────────────  SALON ÜRETEÇLERİ  ─────────────────────────
   Birden çok salonun paylaştığı jeneratör fonksiyonlar. A3 öncesi bunlar
   src/PlanEditor.jsx içinde salon tanımlarıyla iç içeydi; gövdeleri
   DEĞİŞMEDEN buraya taşındı — her salon dosyası (src/venues/*.venue.js)
   kendi verisini kurarken bunları çağırır.

   ⚠ ÇAĞRI SIRASI ÖNEMLİ: bu dosyadaki fonksiyonların hiçbiri modül
   yüklenirken (top-level) nid() ÇAĞIRMAZ — hepsi salon dosyası onları
   ÇAĞIRDIĞINDA id üretir. Yani id sırasını belirleyen bu dosyanın kendi
   içeriği değil, src/venues/index.js'in salon dosyalarını import ETTİĞİ
   sıra (bkz. o dosyadaki uyarı). */

import { RAD, prep, rowPts, toWorld, buildMeta, syntheticSectionId } from "../core/geometry.js";
import { linearArray, radialArray } from "../core/arrays.js";
import { incLabel, reLabel, DEF_NUM } from "../core/labels.js";
import { nid } from "../core/ids.js";

/* Bu üreteçler bloklara artık SABİT `color` yazmıyor (fanB/gr/bowl/tier/tbl
   hepsinden kaldırıldı — templates.js'in bowl() için zaten yaptığı şeyin
   aynısı, kaynağında). PlanEditor.jsx'teki cc(b) = b.color || LEVEL_COLORS[...]
   açık b.color'ı HER ZAMAN kat paletine tercih ediyor; üreteç her bloğa
   kendi rengini basarsa "Kat rengini kullan" hiç devreye giremiyor ve kaç
   kat eklenirse eklensin tuval hep aynı sabit renklerde kalıyordu (bkz.
   görev raporu — GS/Ülker/Zorlu/Harbiye/AKM'de kat sayısı ile tuvaldeki
   renk sayısı hiç eşleşmiyordu, AKM'de üç kat tek renkti). locaWing()
   (yalnız Süreyya) bilerek İSTİSNA: orada kat başına zaten tek renk var,
   çelişki yok — dokunmadık (bkz. görev raporu). */

/* ══════════════  CSO  ══════════════ */

/* color: undefined (SİLİNMİYOR, `undefined`e düşürülüyor): CSO hâlâ HER
   çağrıda kendi color'ını veriyor (bilerek dokunulmadı, bkz. görev raporu)
   — o override `...o` ile buradaki anahtarın YERİNE değil ÜSTÜNE yazıldığı
   için anahtarı burada TAMAMEN silmek CSO'nun rengini değil golden
   dosyasındaki alan SIRASINI değiştirirdi (color en sona kayar). AKM ise
   artık hiç color vermiyor: JSON.stringify undefined alanı zaten atlar,
   yani onda anahtar fiilen hiç yokmuş gibi davranır. */
export const fanB = (o) => ({
  id: nid(), kind: "fan", name: "", level: "Ana Salon", rot: 0, mode: "pitch",
  seatGap: 50, rowGap: 105, aStart: -40, aEnd: 40, aCenter: 0, counts: "",
  align: "center", color: undefined, num: { ...DEF_NUM }, ov: {}, ...o,
});

/* ══════════════  ZORLU  ══════════════ */

export const gr = (o) => ({
  id: nid(), kind: "grid", name: "", rot: 0, cols: 10, taper: 0, curve: 0,
  seatGap: 50, rowGap: 90, counts: "", align: "center",
  num: { ...DEF_NUM }, ov: {}, ...o,
});

export const nOrta = (rows) => ({ ...DEF_NUM, rowScheme: "custom", rowCustom: rows, seatScheme: "seq", seatDir: "rtl", seatStart: 1, anchor: "order" });
export const nCift = (rows) => ({ ...DEF_NUM, rowScheme: "custom", rowCustom: rows, seatScheme: "even", seatDir: "rtl", seatStart: 102, anchor: "column" });
export const nTek  = (rows) => ({ ...DEF_NUM, rowScheme: "custom", rowCustom: rows, seatScheme: "odd", seatDir: "ltr", seatStart: 101, anchor: "column" });

/* ══════════════  GS  ══════════════ */

/* Koridor payları santimetre cinsinden veriliyor, açı cinsinden değil.
   Yarıçap büyüdükçe aynı açı metrelerce boşluk demek; oysa insanın
   geçmesi için gereken şey sabit bir genişlik. */
export function bowl({ W, H, Rc, rows, rowGap, seatGap, nLong, nShort, nCorner,
                first, level, aisle = 240, pad = 80 }) {
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
    aStart: -90 - cStep + cAisle / 2, aEnd: -90 - cAisle / 2 }, L(0));
  const g1 = [c1, ...radialArray([c1], { count: nCorner, cx: -along, cy: aside, step: -cStep })];

  const s1 = seed({ kind: "grid", x: -along + seg / 2, y: H, rows,
    cols: colsFor(seg) }, L(nCorner));
  const g2 = [s1, ...linearArray([s1], { count: nLong, dx: seg, dy: 0 })];

  const c2 = seed({ kind: "fan", mode: "span", x: along, y: aside, r0: Rc, rows,
    aStart: 180 - cStep + cAisle / 2, aEnd: 180 - cAisle / 2 }, L(nCorner + nLong));
  const g3 = [c2, ...radialArray([c2], { count: nCorner, cx: along, cy: aside, step: -cStep })];

  const s2 = seed({ kind: "grid", x: W, y: aside - segS / 2, rot: -90, rows,
    cols: colsFor(segS) }, L(2 * nCorner + nLong));
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
export function cutVomitories(blocks, { depth = 3, width = 6 } = {}) {
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

export const labelGates = (gates) => gates.map((d, i) => ({ ...d, label: `KAPI ${i + 1}` }));

/* ══════════════  HARBİYE  ══════════════ */

/** Amfi kademesi: eşit açı adımlarıyla radyal dizi, soldan sağa harflenir. */
export function tier({ r0, rows, rowGap, span, count, first, level, aisle = 160, pad = 60 }) {
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
    pad, level, ov: {}, num: { ...DEF_NUM },
  }, incLabel(first, i)));
}

/** Loca kanadı: paylaşılan odağa bakan küçük yelpaze kutular, iki yanda
 *  simetrik. Kutular ana bloğun (parter/balkon) kapladığı açısal aralığın
 *  DIŞINDA başlamalı — aynı yarıçapta aynı açıya konursa localar parterin
 *  üstüne biner, koltuklar birebir çakışır. fromDeg ana bloğun kenar açısı
 *  (+ pay), toDeg localarının gidebileceği en uç açı. */

/** Bir katın BÖLÜM TÜRÜNÜ bildirir (rapor §5.1 sözlüğü: floor · balcony ·
 *  stand · tier · section · box · table_area · general_admission_area).
 *  Bildirilmeyen kat "floor"a düşer — bu doğru varsayılan ama bir balkon
 *  için YANLIŞ bilgi; dışa aktarım o yanlışı olduğu gibi karşı tarafa
 *  taşır. Kimlik syntheticSectionId'den geliyor: kat dizesinden türeyen
 *  id ile BURADA bildirilen id aynı olmak zorunda, yoksa bildirim
 *  türetilmiş bölümü ezmez, yanına ikinci bir bölüm ekler. */
export const sec = (level, kind) =>
  ({ id: syntheticSectionId(level), code: level, name: level, kind, parentId: null });

export function locaWing({ r0, rows, rowGap, seatGap, perRow, gap, countPerSide,
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
  /* groupKind:"box" — locaWing'in ürettiği her blok BİR locadır (Ülker'de
     44, Süreyya'da 16; hepsi 6 koltuk). Rapor §5.3'ün seat_group türü:
     loca, masa gibi, birlikte durulan tek birim. Koltuk TÜRÜ yapılmıyor
     (§5.4: "masa veya loca da koltuk türü yapılmamalıdır") — locadaki
     koltuklar single kalır, birim ilişkiyi grup taşır. */
  const seed = (a, i) => reLabel({ ...probe, id: nid(), rot: a, noAisle: true, groupKind: "box" }, incLabel(first, i));
  const out = [];
  for (let i = 0; i < n; i++) {
    const a = fromDeg + step / 2 + step * i;
    out.push(seed(-a, i));
    out.push(seed(a, n + i));
  }
  return out;
}

/** Son sıralardan başlayarak tekerlekli sandalye + refakatçi çiftleri açar.
 *  Çifti bölmez: sıra kısaysa bir öncekine taşar. Önceden sıranın sonuna
 *  denk gelen çiftin refakatçisi düşüyordu, sayılar tutmuyordu. */
export function withAccessible(blocks, match, pairs = 2) {
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

/* ══════════════  AYLAK  ══════════════ */

export const tbl = (label, x, y, seats, tW, a0) => reLabel({
  id: nid(), kind: "table", x, y, rot: 0, tShape: "round",
  tW, tH: tW, seats, a0, clear: 12, pad: 10, level: "Salon",
  cols: 1, rows: 1, counts: "", align: "center", curve: 0, taper: 0,
  seatGap: 50, rowGap: 90, attr: "", ov: {},
  num: { ...DEF_NUM, rowScheme: "custom", rowCustom: "1" },
}, label);

/* ══════════════  AKM  ══════════════ */

export const akmDoor = (n, x, y) => ({
  id: nid("s"), kind: "rect", type: "door", x, y, w: 200, h: 200, rot: 0,
  label: `KAPI ${n}`, capacity: 0, fs: 150, blocks: [],
});
