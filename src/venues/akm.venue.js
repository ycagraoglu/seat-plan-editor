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
   ═══════════════════════════════════════════════════════════════════ */

import { nid } from "../core/ids.js";
import { fanB, akmDoor } from "./builders.js";
import { autoGates } from "../core/gates.js";
import { buildMeta } from "../core/geometry.js";

export const AKM = {
  key: "akm", name: "AKM · Türk Telekom Opera Salonu", unit: "cm",
  home: { x: -2950, y: -3550, w: 5900, h: 3900 }, underlay: null,
  shapes: [
    { id: nid("s"), kind: "rect", type: "stage", x: 0, y: -450, w: 1200, h: 350, rot: 0,
      label: "SAHNE", capacity: 0, fs: 100, blocks: [] },
    { id: nid("s"), kind: "rect", type: "wall", x: 0, y: -1600, w: 5700, h: 3800, rot: 0,
      label: "DUVAR", capacity: 0, fs: 100, blocks: [] },
    akmDoor(1, -1893, -166), akmDoor(2, 1893, -166),
    akmDoor(3, -1543, -1839), akmDoor(4, 1543, -1839),
    akmDoor(5, -2155, -1940), akmDoor(6, 2155, -1940),
  ],
  blocks: [
    /* Sahneye en yakın küçük ön bant — tek parça (ÇİFT/TEK ayrımı bu
       yarıçapta ≥26°'lik bir koridor açısı ister, gereksiz daralma). */
    fanB({ label: "P.ON", level: "Parter", mode: "span", x: 0, y: 0,
      r0: 200, rows: 5, rowGap: 85, aStart: -78, aEnd: 78, seatGap: 48, color: "#3E7FBF",
      ov: {
        "4,8": { at: "wheel" }, "4,9": { at: "wheel" }, "4,10": { at: "wheel" },
        "4,11": { at: "wheel" }, "4,12": { at: "wheel" }, "4,13": { at: "wheel" },
        "4,14": { at: "wheel" }, "4,15": { at: "wheel" }, "4,16": { at: "wheel" }, "4,17": { at: "wheel" },
        "3,8": { at: "comp" }, "3,9": { at: "comp" }, "3,10": { at: "comp" },
        "3,11": { at: "comp" }, "3,12": { at: "comp" }, "3,13": { at: "comp" },
        "3,14": { at: "comp" }, "3,15": { at: "comp" }, "3,16": { at: "comp" }, "3,17": { at: "comp" },
      } }),
    fanB({ label: "P.ORTA-2", level: "Parter", mode: "span", x: 0, y: 0,
      r0: 825, rows: 13, rowGap: 88, aStart: -22, aEnd: 22, seatGap: 50, color: "#3E7FBF" }),
    fanB({ label: "P.ÇİFT-2", level: "Parter", mode: "span", x: 0, y: 0,
      r0: 825, rows: 13, rowGap: 88, aStart: -86, aEnd: -37, seatGap: 50, color: "#3E7FBF" }),
    fanB({ label: "P.TEK-2", level: "Parter", mode: "span", x: 0, y: 0,
      r0: 825, rows: 13, rowGap: 88, aStart: 37, aEnd: 86, seatGap: 50, color: "#3E7FBF" }),
    fanB({ label: "1B.ORTA", level: "1. Balkon", mode: "span", x: 0, y: 0,
      r0: 2150, rows: 7, rowGap: 88, aStart: -16, aEnd: 16, seatGap: 52, color: "#3E7FBF",
      ov: {
        "6,8": { at: "wheel" }, "6,9": { at: "wheel" }, "6,10": { at: "wheel" }, "6,11": { at: "wheel" },
        "6,12": { at: "wheel" }, "6,13": { at: "wheel" }, "6,14": { at: "wheel" }, "6,15": { at: "wheel" },
        "5,8": { at: "comp" }, "5,9": { at: "comp" }, "5,10": { at: "comp" }, "5,11": { at: "comp" },
        "5,12": { at: "comp" }, "5,13": { at: "comp" }, "5,14": { at: "comp" }, "5,15": { at: "comp" },
      } }),
    fanB({ label: "1B.ÇİFT", level: "1. Balkon", mode: "span", x: 0, y: 0,
      r0: 2150, rows: 7, rowGap: 88, aStart: -43, aEnd: -22, seatGap: 52, color: "#3E7FBF" }),
    fanB({ label: "1B.TEK", level: "1. Balkon", mode: "span", x: 0, y: 0,
      r0: 2150, rows: 7, rowGap: 88, aStart: 22, aEnd: 43, seatGap: 52, color: "#3E7FBF" }),
    fanB({ label: "2B.ORTA", level: "2. Balkon", mode: "span", x: 0, y: 0,
      r0: 2950, rows: 5, rowGap: 88, aStart: -21, aEnd: 21, seatGap: 52, color: "#3E7FBF" }),
    fanB({ label: "2B.ÇİFT", level: "2. Balkon", mode: "span", x: 0, y: 0,
      r0: 2950, rows: 5, rowGap: 88, aStart: -52, aEnd: -27, seatGap: 52, color: "#3E7FBF" }),
    fanB({ label: "2B.TEK", level: "2. Balkon", mode: "span", x: 0, y: 0,
      r0: 2950, rows: 5, rowGap: 88, aStart: 27, aEnd: 52, seatGap: 52, color: "#3E7FBF" }),
  ],
};

AKM.shapes = autoGates(AKM, AKM.blocks.map((b) => ({ b, m: buildMeta(b) })));
