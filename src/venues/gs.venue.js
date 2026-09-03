/* ══════════════  SALON 3 · GALATASARAY STADYUMU  ══════════════ */

import { nid } from "../core/ids.js";
import { bowl, cutVomitories, labelGates, withAccessible } from "./builders.js";
import { autoGates } from "../core/gates.js";
import { buildMeta } from "../core/geometry.js";

/* Gerçek Türk Telekom Stadyumu'nda her tribün bloğunun kendi merdiven/tünel
   çıkışı (vomitorium) var ve bu tüneller tribünün İÇİNE oyulmuş: o
   dikdörtgende koltuk yok, sıralar tünelin iki yanından devam ediyor
   (bkz. kullanıcının paylaştığı saha fotoğrafı). Kapı bu yüzden bloklar
   arası koridora konan bir işaret değil, cutVomitories() ile her bloğun
   arka sıralarından koltuk silen mimari bir boşluk. Bloklar arası koridor
   (aisle) yine gerçek merdivendir ama kapıyı barındırmadığı için orijinal
   genişliğinde bırakıldı. Kapının hangi bloğu beslediği autoGates ile
   mesafeye göre çözülüyor. */
const [gsAlt, gsAltDoors] = cutVomitories(bowl({ W: 6600, H: 4600, Rc: 2200, rows: 21, rowGap: 85, seatGap: 50, nLong: 6, nShort: 4, nCorner: 3,
  first: 100, level: "Alt Tribün", aisle: 240, pad: 80,
  colors: { long: "#3E7FBF", short: "#3E9092", corner: "#7C5BA8" } }));
const [gsOrta, gsOrtaDoors] = cutVomitories(bowl({ W: 9200, H: 7200, Rc: 4800, rows: 13, rowGap: 85, seatGap: 50, nLong: 6, nShort: 4, nCorner: 3,
  first: 200, level: "Orta Tribün", aisle: 260, pad: 80,
  colors: { long: "#C1743C", short: "#6E7787", corner: "#5F9142" } }));
const [gsUst, gsUstDoors] = cutVomitories(bowl({ W: 10950, H: 8950, Rc: 6550, rows: 17, rowGap: 85, seatGap: 50, nLong: 6, nShort: 4, nCorner: 3,
  first: 400, level: "Üst Tribün", aisle: 280, pad: 80,
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
