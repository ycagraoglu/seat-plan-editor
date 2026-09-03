/* ══════════════  SALON 8 · AKM TÜRK TELEKOM OPERA SALONU  ══════════════
   Taksim, at nalı (horseshoe) formlu opera salonu — parter + 2 balkon,
   her biri ORTA/ÇİFT/TEK üçlüsü. Passo'nun yayınladığı gerçek oturma
   planından (akmistanbul.gov.tr / passo.com.tr) çıkarıldı: 2040 koltuk,
   85 kişilik orkestra çukuru, 3 kattan 16 kapı. Burada 1.829 koltuk ve
   6 kapıya sadeleştirildi — gerçek planın 4 derinlik-bandı (fiyat
   kategorisine göre) 2'ye indirildi, tam sayı hedeflenmedi.
   ─────────────────────────────────────────────────────────────────────
   Parter'ın iki bandı (ön/arka) ve 1./2. Balkon aynı yarıçapta DEĞİL —
   Süreyya'daki kat ilkesiyle aynı: her kat kendi halkasında oturur,
   halkalar yarıçapça çakışmaz. Fiziksel olarak balkon parterin üstünde
   çıkıntı yapar ama bu düzlemsel planda katları çakıştırırsak
   validate() "koltuk çifti üst üste biniyor" der — kat ayrımı yalnızca
   yürüme payı kontrolünde var, ham çakışma kontrolünde yok.
   ORTA ile ÇİFT/TEK arasındaki açı boşluğu (Parter'da 44°, balkonlarda
   ~6-8°) taban payının (~100cm) çakışmaması için — dar tutulursa
   Sutherland-Hodgman testi gizli bir taban çakışması buluyor (ilk
   denemede P.ORTA-2 ↔ ÇİFT-2/TEK-2 arasında ~5.500cm² çıkmıştı).
   ─────────────────────────────────────────────────────────────────────
   A5 KAPI/SAHNE DÜZELTMESİ (yeni invariant testlerinin bulduğu gerçek
   hatalar — bkz. görev raporu):

   · SAHNE: y:-450,h:350 iken P.ON'un tüm satırları merkez sütununda
     y=-R*cos(0)=-R veriyor (R=200..540) — yani P.ON'un ARKA satırları
     sahnenin TAM İÇİNE giriyordu (60 koltuk, en derini 174cm). Kökü:
     sahne YANLIŞ TARAFA konmuştu — bu salonun fan formülünde artan
     yarıçap hep -y'ye gider, yani SEYİRCİ -y'de büyür; sahne, seyircinin
     BAŞLADIĞI yer olan orijine YAKIN ama KARŞI (pozitif y) tarafta
     olmalıydı, orijinin "arkasında" (negatif y, P.ON'un içinde) değil.
     Düzeltme: sahne pozitif y'ye taşındı (y:120) VE derinliği 350'den
     280'e daraltıldı — TÜM AKM koltukları (P.ON dahil, y aralığı
     -3302..-65,4) negatif y'de, DUVAR'ın üst sınırı ise +300'de; 280
     derinlik bu ikisi arasına (seyirciye 45cm, duvara 40cm pay
     bırakarak) TAM oturuyor. 350 kalsaydı iki sınırdan biri MUTLAKA
     ihlal edilirdi (ölçüldü — bkz. görev raporu). Sahne boyu (1200,
     genişlik) DOKUNULMADI, sadece derinlik ve konum.

   · KAPI 1/2 (Parter arkası, P.ÇİFT-2/P.TEK-2'nin son 2 sırası): bu iki
     kapı GERÇEKTEN boş bir aralığa (Parter'ın taban payı bitip 1.Balkon
     başlamadan önceki 85cm'lik boşluğa) taşınabiliyordu — koltuk
     SİLİNMEDİ, kapı sadece aynı açıda ~120cm dışarı kaydırıldı (ölçülen
     ilk temiz yarıçap 2004cm, 2020'ye yuvarlandı — pay bırakır).

   · KAPI 3-6 (1./2. Balkon'un ÇİFT/TEK yan girişleri): bu dört kapı
     merkeze göre bulunduğu açıda İKİ kademe arasına da (67-69cm boşluk,
     200cm'lik kapı için yetersiz) sığmıyor — hangi yöne kaydırılırsa
     kaydırılsın ya bir önceki ya bir sonraki kademenin koltuklarına
     giriyor (ölçüldü, bkz. görev raporu). Kapı KONUMU değiştirilmedi
     (gerçek referans plandaki yeriyle uyumlu kalsın diye); bunun yerine
     tam kapının altına denk gelen koltuklar (1B.ÇİFT/1B.TEK'te 13'er,
     2B.ÇİFT/2B.TEK'te 7'şer) `ov.rm` ile silindi — GS/Ülker'deki
     cutVomitories()'in yaptığı ŞEYİN AYNISI (tribüne oyulmuş gerçek bir
     boşluk), ama bu dört kapı tek bir simetrik dizi elemanı olmadığından
     (aksine bağımsız fanB() çağrıları, ikisi aynı bloğun İKİ FARKLI
     kapıyla eşleşmesi gerekiyor — CSO'daki gibi) fonksiyon yerine hedefe
     özel `ov` kullanıldı.
   ═══════════════════════════════════════════════════════════════════ */

import { nid } from "../core/ids.js";
import { fanB, akmDoor } from "./builders.js";
import { autoGates } from "../core/gates.js";
import { buildMeta } from "../core/geometry.js";
import { solveRadialTiers } from "../core/solve.js";

/* Kademe zinciri: P.ON → Parter(825) → 1. Balkon → 2. Balkon, merkezden dışa
   dört bant. r0 artık ELLE değil bu zincirden geliyor — her bant bir
   öncekinin taban payı (footprintPad) bitince `gapFromPrev` kadar sonra
   başlar. Açıklıklar (85/67/69) bugünkü r0 değerlerinden (200/825/2150/2950)
   BİR KEZ geriye türetildi (bkz. A4 görev raporu); commit cb64478'te elle
   2069→2150 ve 2697→2950 diye deneme-yanılmayla bulunan sayılar artık
   burada değil — r0 SONUÇ, girdi rows/rowGap/seatGap + bu açıklıklar. Bir
   bandın rows'u değişirse sonraki bant otomatik dışarı kayar, çakışma
   sessizce oluşamaz. */
const [T_ON, T_PARTER, T_B1, T_B2] = solveRadialTiers([
  { id: "on", rows: 5, rowGap: 85, seatGap: 48, pad: 55, r0: 200 },
  { id: "parter", rows: 13, rowGap: 88, seatGap: 50, pad: 55, gapFromPrev: 85 },
  { id: "b1", rows: 7, rowGap: 88, seatGap: 52, pad: 55, gapFromPrev: 67 },
  { id: "b2", rows: 5, rowGap: 88, seatGap: 52, pad: 55, gapFromPrev: 69 },
]);

export const AKM = {
  key: "akm", name: "AKM · Türk Telekom Opera Salonu", unit: "cm",
  home: { x: -2950, y: -3550, w: 5900, h: 3900 }, underlay: null,
  shapes: [
    { id: nid("s"), kind: "rect", type: "stage", x: 0, y: 120, w: 1200, h: 280, rot: 0,
      label: "SAHNE", capacity: 0, fs: 100, blocks: [] },
    { id: nid("s"), kind: "rect", type: "wall", x: 0, y: -1600, w: 5700, h: 3800, rot: 0,
      label: "DUVAR", capacity: 0, fs: 100, blocks: [] },
    akmDoor(1, -2012, -177), akmDoor(2, 2012, -177),
    akmDoor(3, -1543, -1839), akmDoor(4, 1543, -1839),
    akmDoor(5, -2155, -1940), akmDoor(6, 2155, -1940),
  ],
  blocks: [
    /* Sahneye en yakın küçük ön bant — tek parça (ÇİFT/TEK ayrımı bu
       yarıçapta ≥26°'lik bir koridor açısı ister, gereksiz daralma). */
    fanB({ label: "P.ON", level: "Parter", mode: "span", x: 0, y: 0,
      r0: T_ON.r0, rows: T_ON.rows, rowGap: T_ON.rowGap, aStart: -78, aEnd: 78, seatGap: T_ON.seatGap, color: "#3E7FBF",
      ov: {
        "4,8": { at: "wheel" }, "4,9": { at: "wheel" }, "4,10": { at: "wheel" },
        "4,11": { at: "wheel" }, "4,12": { at: "wheel" }, "4,13": { at: "wheel" },
        "4,14": { at: "wheel" }, "4,15": { at: "wheel" }, "4,16": { at: "wheel" }, "4,17": { at: "wheel" },
        "3,8": { at: "comp" }, "3,9": { at: "comp" }, "3,10": { at: "comp" },
        "3,11": { at: "comp" }, "3,12": { at: "comp" }, "3,13": { at: "comp" },
        "3,14": { at: "comp" }, "3,15": { at: "comp" }, "3,16": { at: "comp" }, "3,17": { at: "comp" },
      } }),
    fanB({ label: "P.ORTA-2", level: "Parter", mode: "span", x: 0, y: 0,
      r0: T_PARTER.r0, rows: T_PARTER.rows, rowGap: T_PARTER.rowGap, aStart: -22, aEnd: 22, seatGap: T_PARTER.seatGap, color: "#3E7FBF" }),
    fanB({ label: "P.ÇİFT-2", level: "Parter", mode: "span", x: 0, y: 0,
      r0: T_PARTER.r0, rows: T_PARTER.rows, rowGap: T_PARTER.rowGap, aStart: -86, aEnd: -37, seatGap: T_PARTER.seatGap, color: "#3E7FBF" }),
    fanB({ label: "P.TEK-2", level: "Parter", mode: "span", x: 0, y: 0,
      r0: T_PARTER.r0, rows: T_PARTER.rows, rowGap: T_PARTER.rowGap, aStart: 37, aEnd: 86, seatGap: T_PARTER.seatGap, color: "#3E7FBF" }),
    fanB({ label: "1B.ORTA", level: "1. Balkon", mode: "span", x: 0, y: 0,
      r0: T_B1.r0, rows: T_B1.rows, rowGap: T_B1.rowGap, aStart: -16, aEnd: 16, seatGap: T_B1.seatGap, color: "#3E7FBF",
      ov: {
        "6,8": { at: "wheel" }, "6,9": { at: "wheel" }, "6,10": { at: "wheel" }, "6,11": { at: "wheel" },
        "6,12": { at: "wheel" }, "6,13": { at: "wheel" }, "6,14": { at: "wheel" }, "6,15": { at: "wheel" },
        "5,8": { at: "comp" }, "5,9": { at: "comp" }, "5,10": { at: "comp" }, "5,11": { at: "comp" },
        "5,12": { at: "comp" }, "5,13": { at: "comp" }, "5,14": { at: "comp" }, "5,15": { at: "comp" },
      } }),
    /* KAPI 3 tam bu bloğun r=2,3,4 satırlarının altına düşüyor (67cm'lik
       kademe-arası boşluğa 200cm'lik kapı sığmıyor, bkz. dosya başı A5
       notu) — o 13 koltuk kapı için oyuluyor. */
    fanB({ label: "1B.ÇİFT", level: "1. Balkon", mode: "span", x: 0, y: 0,
      r0: T_B1.r0, rows: T_B1.rows, rowGap: T_B1.rowGap, aStart: -43, aEnd: -22, seatGap: T_B1.seatGap, color: "#3E7FBF",
      ov: {
        "2,0": { rm: true }, "2,1": { rm: true }, "2,2": { rm: true }, "2,3": { rm: true },
        "3,0": { rm: true }, "3,1": { rm: true }, "3,2": { rm: true }, "3,3": { rm: true }, "3,4": { rm: true }, "3,5": { rm: true },
        "4,1": { rm: true }, "4,2": { rm: true }, "4,3": { rm: true },
      } }),
    /* KAPI 4 — 1B.ÇİFT'in aynası, aynı gerekçe. */
    fanB({ label: "1B.TEK", level: "1. Balkon", mode: "span", x: 0, y: 0,
      r0: T_B1.r0, rows: T_B1.rows, rowGap: T_B1.rowGap, aStart: 22, aEnd: 43, seatGap: T_B1.seatGap, color: "#3E7FBF",
      ov: {
        "2,12": { rm: true }, "2,13": { rm: true }, "2,14": { rm: true }, "2,15": { rm: true },
        "3,11": { rm: true }, "3,12": { rm: true }, "3,13": { rm: true }, "3,14": { rm: true }, "3,15": { rm: true }, "3,16": { rm: true },
        "4,14": { rm: true }, "4,15": { rm: true }, "4,16": { rm: true },
      } }),
    fanB({ label: "2B.ORTA", level: "2. Balkon", mode: "span", x: 0, y: 0,
      r0: T_B2.r0, rows: T_B2.rows, rowGap: T_B2.rowGap, aStart: -21, aEnd: 21, seatGap: T_B2.seatGap, color: "#3E7FBF" }),
    /* KAPI 5 tam bu bloğun ÖN (r=0,1) satırlarının altına düşüyor (1.
       Balkon ↔ 2. Balkon arası 69cm boşluk, 200cm'lik kapıya dar — bkz.
       dosya başı A5 notu) — o 7 koltuk kapı için oyuluyor. */
    fanB({ label: "2B.ÇİFT", level: "2. Balkon", mode: "span", x: 0, y: 0,
      r0: T_B2.r0, rows: T_B2.rows, rowGap: T_B2.rowGap, aStart: -52, aEnd: -27, seatGap: T_B2.seatGap, color: "#3E7FBF",
      ov: {
        "0,1": { rm: true }, "0,2": { rm: true }, "0,3": { rm: true }, "0,4": { rm: true }, "0,5": { rm: true },
        "1,3": { rm: true }, "1,4": { rm: true },
      } }),
    /* KAPI 6 — 2B.ÇİFT'in aynası, aynı gerekçe. */
    fanB({ label: "2B.TEK", level: "2. Balkon", mode: "span", x: 0, y: 0,
      r0: T_B2.r0, rows: T_B2.rows, rowGap: T_B2.rowGap, aStart: 27, aEnd: 52, seatGap: T_B2.seatGap, color: "#3E7FBF",
      ov: {
        "0,19": { rm: true }, "0,20": { rm: true }, "0,21": { rm: true }, "0,22": { rm: true }, "0,23": { rm: true },
        "1,20": { rm: true }, "1,21": { rm: true },
      } }),
  ],
};

AKM.shapes = autoGates(AKM, AKM.blocks.map((b) => ({ b, m: buildMeta(b) })));
