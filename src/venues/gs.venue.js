/* ══════════════  SALON 3 · GALATASARAY STADYUMU  ══════════════ */

import { nid } from "../core/ids.js";
import { bowl, cutVomitories, labelGates, withAccessible } from "./builders.js";
import { autoGates } from "../core/gates.js";
import { buildMeta } from "../core/geometry.js";
import { solveBowlTiers } from "../core/solve.js";

/* Kademe zinciri: Alt → Orta → Üst Tribün, sahadan dışa üç kase. W/H artık
   ELLE değil bu zincirden geliyor — her kase bir öncekinin taban payı
   (footprintPad) bitince `gapFromPrev` kadar sonra başlar (W ve H'ye AYNI
   ANDA uygulanır, bkz. src/core/solve.js). Rc (köşe yarıçapı) ayrı bir
   tasarım kararı, zincire girmiyor — olduğu gibi kalıyor. Açıklıklar
   (649/479) bugünkü W/H değerlerinden BİR KEZ geriye türetildi (bkz. A4
   görev raporu) — W/H SONUÇ, girdi rows/rowGap/seatGap + bu açıklıklar. */
const [T_ALT, T_ORTA, T_UST] = solveBowlTiers([
  { id: "alt", rows: 21, rowGap: 85, seatGap: 50, pad: 80, W: 6600, H: 4600 },
  { id: "orta", rows: 13, rowGap: 85, seatGap: 50, pad: 80, gapFromPrev: 649 },
  { id: "ust", rows: 17, rowGap: 85, seatGap: 50, pad: 80, gapFromPrev: 479 },
]);

/* Gerçek Türk Telekom Stadyumu'nda her tribün bloğunun kendi merdiven/tünel
   çıkışı (vomitorium) var ve bu tüneller tribünün İÇİNE oyulmuş: o
   dikdörtgende koltuk yok, sıralar tünelin iki yanından devam ediyor
   (bkz. kullanıcının paylaştığı saha fotoğrafı). Kapı bu yüzden bloklar
   arası koridora konan bir işaret değil, cutVomitories() ile her bloğun
   arka sıralarından koltuk silen mimari bir boşluk. Bloklar arası koridor
   (aisle) yine gerçek merdivendir ama kapıyı barındırmadığı için orijinal
   genişliğinde bırakıldı. Kapının hangi bloğu beslediği autoGates ile
   mesafeye göre çözülüyor. */
const [gsAlt, gsAltDoors] = cutVomitories(bowl({ W: T_ALT.W, H: T_ALT.H, Rc: 2200, rows: T_ALT.rows, rowGap: T_ALT.rowGap, seatGap: T_ALT.seatGap, nLong: 6, nShort: 4, nCorner: 3,
  first: 100, level: "Alt Tribün", aisle: 240, pad: T_ALT.pad,
  colors: { long: "#3E7FBF", short: "#3E9092", corner: "#7C5BA8" } }));
const [gsOrta, gsOrtaDoors] = cutVomitories(bowl({ W: T_ORTA.W, H: T_ORTA.H, Rc: 4800, rows: T_ORTA.rows, rowGap: T_ORTA.rowGap, seatGap: T_ORTA.seatGap, nLong: 6, nShort: 4, nCorner: 3,
  first: 200, level: "Orta Tribün", aisle: 260, pad: T_ORTA.pad,
  colors: { long: "#C1743C", short: "#6E7787", corner: "#5F9142" } }));
const [gsUst, gsUstDoors] = cutVomitories(bowl({ W: T_UST.W, H: T_UST.H, Rc: 6550, rows: T_UST.rows, rowGap: T_UST.rowGap, seatGap: T_UST.seatGap, nLong: 6, nShort: 4, nCorner: 3,
  first: 400, level: "Üst Tribün", aisle: 280, pad: T_UST.pad,
  colors: { long: "#5F9142", short: "#B79A32", corner: "#6E7787" } })
  .map((b) => (["402","404","406","408","410","412","414","416","418","420","422","424","426","428","430",
    "401","403","405","407","409","411","413","415","417","419","421","423","425","427","429"].includes(b.label)
    ? withAccessible([b], [b.label], 9)[0] : b)));

export const GS = {
  key: "gs", name: "Galatasaray · Türk Telekom Stadyumu", unit: "cm",
  home: { x: -14000, y: -12000, w: 28000, h: 24000 }, underlay: null,
  shapes: [
    { id: nid("s"), kind: "rect", type: "pitch", sport: "football", x: 0, y: 0, w: 10500, h: 6800, rot: 0, label: "Futbol sahası", capacity: 0, fs: 300, blocks: [] },
    { id: nid("s"), kind: "rect", type: "note", x: 0, y: -11400, w: 10, h: 10, rot: 0, label: "DOĞU / EAST", capacity: 0, fs: 600 },
    { id: nid("s"), kind: "rect", type: "note", x: 0, y: 11600, w: 10, h: 10, rot: 0, label: "BATI / WEST", capacity: 0, fs: 600 },
    { id: nid("s"), kind: "rect", type: "note", x: -13100, y: 0, w: 10, h: 10, rot: 90, label: "KUZEY / NORTH", capacity: 0, fs: 600 },
    { id: nid("s"), kind: "rect", type: "note", x: 13100, y: 0, w: 10, h: 10, rot: -90, label: "GÜNEY / SOUTH", capacity: 0, fs: 600 },
    ...labelGates([...gsAltDoors, ...gsOrtaDoors, ...gsUstDoors]),
  ],
  blocks: [...gsAlt, ...gsOrta, ...gsUst],
};

GS.shapes = autoGates(GS, GS.blocks.map((b) => ({ b, m: buildMeta(b) })));
