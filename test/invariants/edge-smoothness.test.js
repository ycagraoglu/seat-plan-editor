/* ═══════════════════════════════════════════════════════════════════════
   INVARIANT: kenar düzgünlüğü — blok tabanının yan kenarı "testere dişi"
   olmaz: ÇOK SAYIDA küçük kırık göstermez.

   Gerçek hata: blok kenarları kırıktı — koltuk sayısı satır başına tam
   sayı olmak zorunda olduğu için sıra uçları ileri geri sıçrıyordu. A2/A3
   öncesi düzeltme (3 geçişli ortalama + 27,5cm sapma sınırı) Zorlu
   ORK-C'de bunu tam yutamıyordu: 16 parça, 9 gözle görülür kırık, en
   büyük 3,4°. Bugünkü DIŞBÜKEY ZİNCİR (chainEdge, buildMeta içinde) aynı
   kenarı 4 parçaya (3 kırık, en büyük ~10,5°) indiriyor.

   METRİK DÜZELTMESİ (v2): İlk sürüm "en büyük TEK dönüş açısı"nı
   ölçüyordu — ama bu YANLIŞ ölçüt olduğu ortaya çıktı. Zorlu B1-O'nun
   TEK, KASITLI bir kesimi (son sıra 23→8 koltuk, muhtemelen teknik
   kabin/ses masası) ~75-77°'lik BÜYÜK ama TEK bir dönüş üretiyor —
   maksimum-açı ölçütüyle bu, sawtooth'la aynı kefeye konup BULGU
   sayılıyordu, oysa asıl yakalanmak istenen şey "ÇOK SAYIDA küçük kırık"
   (eski yöntemin 9 kırığı), "tek büyük ama meşru bir oyuk" değil. Yeni
   yöntemin kendi başarısı da zaten SAYIDA: 16 parça→4 parça, 9 kırık→3
   kırık — büyüklükte değil (en büyük açı aslında 3,4°'den 10,5°'ye
   ÇIKTI). O yüzden metrik artık KIRIK SAYISI: bir kenardaki "gerçek"
   (gürültü olmayan) dönüş noktalarının sayısı belli bir tavanı aşmasın.
   Tek büyük bir oyuk bu sayıyı arttırmaz (hâlâ TEK nokta), sawtooth
   arttırır (HER zigzag bir nokta demek).

   Bu test buildMeta'nın leftEdge/rightEdge alanlarını (A5'te dışa açıldı)
   okur, kendi kenar hesabını YAZMAZ — aksi hâlde rules.js'in başında
   anlatılan "aynı geometri iki yerde iki kod" hatası tekrarlanır.

   KINK_MIN_DEG = 1°: 9 salonun TAMAMI tarandı (523 kenar). Pürüzsüz bir
   yayın (ör. Ülker'in fan köşe bloklarının 14 noktalı kenarı) HER
   noktası ≤0,1°'lik "sahte" bir dönüş üretiyor — bu kayan-nokta/örnekleme
   gürültüsü, gerçek bir kırık değil. En küçük GERÇEK kırık (ORK-C arka,
   görev tanımının referansı) 1,28°. Aradaki boşluk (0,1°→1,28°) temiz;
   1° tam ortasına oturuyor.

   MAX_KINKS = 3: aynı taramada BUGÜN görülen en yüksek kırık sayısı — hem
   "iyi" örneklerde (ORK-C/ORK-T arka, ORK-O: yumuşak çok basamaklı
   daralma, 3 kırık) HEM DE Zorlu B1-O'nun TEK büyük kesiminde (o da 3
   kırık — kesim büyük ama SAYI az) aynı tavana çıkıyor. 4+ kırık bugün
   HİÇBİR salonda yok — gerçek sawtooth'un (eski yöntem: 9 kırık) imzası
   bu aralıkta değil, çok daha yukarıda. */
import { describe, it, expect } from "vitest";
import { buildMeta, prep, rowEnds, toWorld, RAD } from "../../src/core/geometry.js";
import { DEF_NUM } from "../../src/core/labels.js";
import { VENUES } from "./helpers.js";

const KINK_MIN_DEG = 1;
const MAX_KINKS = 3;

function turnAngles(pts) {
  const out = [];
  for (let i = 1; i < pts.length - 1; i++) {
    const a = pts[i - 1], b = pts[i], c = pts[i + 1];
    const v1x = b.x - a.x, v1y = b.y - a.y, v2x = c.x - b.x, v2y = c.y - b.y;
    const l1 = Math.hypot(v1x, v1y) || 1, l2 = Math.hypot(v2x, v2y) || 1;
    const dot = (v1x * v2x + v1y * v2y) / (l1 * l2), cross = (v1x * v2y - v1y * v2x) / (l1 * l2);
    out.push(Math.abs((Math.atan2(cross, dot) * 180) / Math.PI));
  }
  return out;
}

/** Bir bloğun sağ ve sol kenarındaki TÜM dönüş açıları (derece) — ham,
 *  hiç filtrelenmemiş. Masa/kapsül (rows===1)/elle-çizilmiş-taban (foot)
 *  blokları kapsam dışı: onların "yan kenar zinciri" kavramı yok (bkz.
 *  buildMeta — bu bloklarda leftEdge/rightEdge hiç dönmez), ya da
 *  kasıtlı köşeli olabilirler (sütun/merdiven boşluğu). */
export function blockEdgeTurns(b) {
  const m = buildMeta(b);
  if (m.manual || !m.rightEdge || !m.leftEdge) return [];
  const P = prep(b);
  const rows = P.counts.length;
  if (rows < 2) return [];
  const cos = Math.cos(b.rot * RAD), sin = Math.sin(b.rot * RAD);
  const W = (p) => toWorld(b, p, cos, sin);
  const rightChain = [W(rowEnds(b, 0, P)[1]), ...m.rightEdge, W(rowEnds(b, rows - 1, P)[1])];
  const leftChain = [W(rowEnds(b, 0, P)[0]), ...m.leftEdge, W(rowEnds(b, rows - 1, P)[0])];
  return [
    ...turnAngles(rightChain).map((angle) => ({ angle, side: "right" })),
    ...turnAngles(leftChain).map((angle) => ({ angle, side: "left" })),
  ];
}

/** Bir kenardaki "gerçek" (KINK_MIN_DEG'i aşan) dönüş sayısı. */
const kinkCount = (turns) => turns.filter((t) => t.angle >= KINK_MIN_DEG).length;

function worstEdge(venue) {
  let worst = null;
  for (const b of venue.blocks) {
    const turns = blockEdgeTurns(b);
    for (const side of ["right", "left"]) {
      const n = kinkCount(turns.filter((t) => t.side === side));
      if (!worst || n > worst.kinks) worst = { kinks: n, block: b.label, name: b.name, side };
    }
  }
  return worst;
}

describe("invariant: blok tabanının yan kenarı testere dişi değil (kırık SAYISI sınırlı)", () => {
  it.each(VENUES)("%s", (_key, venue) => {
    const worst = worstEdge(venue);
    expect(!worst || worst.kinks <= MAX_KINKS,
      worst ? `en çok kırıklı kenar: ${worst.kinks} kırık — blok ${worst.block} (${worst.name}), ${worst.side} kenar` : "")
      .toBe(true);
  });

  it("referans ölçüm: Zorlu ORK-C (arka) sağ kenarı 4 parça / 3 kırık, en büyük dönüş ~10,5°", () => {
    const zorlu = VENUES.find(([k]) => k === "zorlu")[1];
    const orkCArka = zorlu.blocks.find((b) => b.name === "Orkestra Çift (arka)");
    const turns = blockEdgeTurns(orkCArka).filter((t) => t.side === "right");
    expect(turns).toHaveLength(3); // 4 parça = 5 nokta = 3 iç dönüş açısı
    expect(kinkCount(turns)).toBe(3); // üçü de gürültü değil, gerçek kırık
    expect(Math.max(...turns.map((t) => t.angle))).toBeCloseTo(10.49, 1);
  });

  it("Zorlu B1-O artık BULGU değil: TEK büyük (~75-77°) ama meşru kesim, kırık SAYISI tavanın altında", () => {
    const zorlu = VENUES.find(([k]) => k === "zorlu")[1];
    const b1o = zorlu.blocks.find((b) => b.name === "1. Balkon Orta");
    const turns = blockEdgeTurns(b1o);
    const maxAngle = Math.max(...turns.map((t) => t.angle));
    expect(maxAngle).toBeGreaterThan(70); // büyük dönüş hâlâ orada — silinmedi
    for (const side of ["right", "left"]) {
      expect(kinkCount(turns.filter((t) => t.side === side))).toBeLessThanOrEqual(MAX_KINKS);
    }
  });

  it("testin testi: pürüzsüz bir yayın çok-noktalı ama gürültüsüz kenarı yanlış alarm ÜRETMEZ", () => {
    /* Ülker'in fan köşe bloklarından biri: 14 iç nokta, ama hepsi ≤0,1° —
       raw nokta sayısı yüksek olsa da KIRIK sayısı sıfır olmalı. */
    const ulker = VENUES.find(([k]) => k === "ulker")[1];
    const corner = ulker.blocks.find((b) => b.label === "101");
    const turns = blockEdgeTurns(corner);
    expect(turns.length).toBeGreaterThan(10); // çok noktalı olduğunu doğrula
    expect(kinkCount(turns.filter((t) => t.side === "right"))).toBe(0);
    expect(kinkCount(turns.filter((t) => t.side === "left"))).toBe(0);
  });

  it("testin testi: TEK büyük kesim (20,20,20,3) artık KIRMIZI DEĞİL (sayı ölçütü onu haklı buluyor)", () => {
    const singleCut = {
      id: "j0", kind: "grid", label: "J0", name: "J0", level: "", rot: 0, x: 0, y: 0,
      cols: 20, rows: 4, taper: 0, curve: 0, seatGap: 50, rowGap: 90, counts: "20,20,20,3",
      align: "center", color: "#000", attr: "", num: { ...DEF_NUM }, ov: {},
    };
    const turns = blockEdgeTurns(singleCut);
    expect(Math.max(...turns.map((t) => t.angle))).toBeGreaterThan(MAX_KINKS * 10); // dönüş hâlâ büyük...
    for (const side of ["right", "left"]) {
      expect(kinkCount(turns.filter((t) => t.side === side))).toBeLessThanOrEqual(MAX_KINKS); // ...ama SAYI meşru
    }
  });

  it("testin testi: satır başına koltuk sayısı OSİLE ederse (gerçek sawtooth, 10,20,10,20,10,20) KIRMIZI döner", () => {
    /* Tek bir büyük kesimin aksine burada AYNI büyüklükte sıçrama ART
       ARDA ÜÇ KEZ tekrarlanıyor — tam da "ÇOK SAYIDA küçük kırık" deseni
       (eski yöntemin 9 kırığının temsili), tek meşru oyuk değil. */
    const sawtooth = {
      id: "j1", kind: "grid", label: "J1", name: "J1", level: "", rot: 0, x: 0, y: 0,
      cols: 10, rows: 6, taper: 0, curve: 0, seatGap: 50, rowGap: 90, counts: "10,20,10,20,10,20",
      align: "center", color: "#000", attr: "", num: { ...DEF_NUM }, ov: {},
    };
    const turns = blockEdgeTurns(sawtooth);
    for (const side of ["right", "left"]) {
      expect(kinkCount(turns.filter((t) => t.side === side))).toBeGreaterThan(MAX_KINKS);
    }
  });

  it("testin testi: düz bir dikdörtgen blokta (sabit sütun sayısı) hiç kırık yok (yanlış alarm yok)", () => {
    const straight = {
      id: "s1", kind: "grid", label: "S", name: "S", level: "", rot: 0, x: 0, y: 0,
      cols: 10, rows: 8, taper: 0, curve: 0, seatGap: 50, rowGap: 90, counts: "",
      align: "center", color: "#000", attr: "", num: { ...DEF_NUM }, ov: {},
    };
    expect(kinkCount(blockEdgeTurns(straight))).toBe(0);
  });
});
