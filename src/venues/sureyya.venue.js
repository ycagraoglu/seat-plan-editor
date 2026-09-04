/* ══════════════  SALON 7 · SÜREYYA OPERASI (KADIKÖY)  ══════════════
   1927'de sinema olarak açılan, 2007'de operaya dönüştürülen tarihi bina.
   570 kişilik, at nalı (horseshoe) formda: parter + zemin loca + 1. kat
   (açık balkon + loca) + 2. kat (sadece loca). Odak sahnenin hemen önünde;
   localar paylaşılan bu odağa bakan küçük yelpaze kutular olarak kuruluyor.
   ═══════════════════════════════════════════════════════════════════ */


import { nid } from "../core/ids.js";
import { reLabel, DEF_NUM } from "../core/labels.js";
import { locaWing, withAccessible } from "./builders.js";
import { autoGates } from "../core/gates.js";
import { buildMeta } from "../core/geometry.js";

export const SUREYYA = {
  key: "sureyya", name: "Süreyya Operası · Kadıköy", unit: "cm",
  home: { x: -1150, y: -900, w: 2300, h: 2000 }, underlay: null,
  shapes: [
    { id: nid("s"), kind: "rect", type: "stage", x: 0, y: 620, w: 1500, h: 750, rot: 0,
      label: "SAHNE", capacity: 0, fs: 90, blocks: [] },
    { id: nid("s"), kind: "rect", type: "screen", x: 0, y: 140, w: 950, h: 220, rot: 0,
      label: "ORKESTRA ÇUKURU", capacity: 0, fs: 46, blocks: [] },
    ...[["cloak", -980, 950, "Vestiyer"], ["wc", 980, 950, "WC"],
        ["entrance", 0, 980, "Giriş"], ["info", -980, -820, "Danışma"]]
      .map(([icon, x, y, label]) => ({ id: nid("s"), kind: "icon", type: "icon", icon,
        x, y, rot: 0, size: 30, w: 120, h: 120, label, capacity: 0, fs: 100, blocks: [] })),
    ...[[1, -700, 940], [2, 700, 940]].map(([n, x, y]) => ({
      id: nid("s"), kind: "rect", type: "door", x, y, w: 90, h: 90, rot: 0,
      label: `KAPI ${n}`, capacity: 0, fs: 34, blocks: [] })),
  ],
  blocks: [
    /* Parter — sahne önü, hafif açılan taban, sabit değil doğal taper */
    reLabel({ id: nid(), kind: "fan", mode: "span", x: 0, y: 0, rot: 0,
      r0: 320, rows: 7, rowGap: 82, seatGap: 47, counts: "", align: "center",
      aStart: -54, aEnd: 54, aCenter: 0, color: "#3E7FBF", pad: 45,
      level: "Parter", ov: {}, num: { ...DEF_NUM } }, "P"),

    /* Zemin kat locaları — parterin iki yanında, sahneye yakın kutular.
       6 sıra × 2'şer koltuk, ön sahneden başlayıp arkaya doğru sayılı. */
    ...locaWing({ r0: 460, rows: 2, rowGap: 78, seatGap: 46, perRow: 3, gap: 14,
      countPerSide: 8, first: "ZL1", level: "Zemin Loca", color: "#C2415A", pad: 26,
      fromDeg: 70, toDeg: 104 }),

    /* 1. kat — orta kesim açık balkon, yanlarda loca */
    reLabel({ id: nid(), kind: "fan", mode: "span", x: 0, y: 0, rot: 0,
      r0: 930, rows: 5, rowGap: 62, seatGap: 48, counts: "", align: "center",
      aStart: -34, aEnd: 34, aCenter: 0, color: "#5F9142", pad: 45,
      level: "1. Kat", ov: {}, num: { ...DEF_NUM, rowScheme: "letter" } }, "A"),
    ...locaWing({ r0: 930, rows: 2, rowGap: 78, seatGap: 46, perRow: 3, gap: 18,
      countPerSide: 5, first: "1L1", level: "1. Kat Loca", color: "#B79A32", pad: 26,
      fromDeg: 60, toDeg: 92 }),

    /* 2. kat — sadece loca, sahneyi görmek için öne eğilmek gerekiyor */
    ...locaWing({ r0: 1280, rows: 2, rowGap: 70, seatGap: 46, perRow: 3, gap: 14,
      countPerSide: 9, first: "2L1", level: "2. Kat Loca", color: "#7C5BA8", pad: 26,
      fromDeg: 40, toDeg: 100 }),
  ],
};

/* Erişilebilir yer — zemin kat locasının en uç, en kolay ulaşılan kutusu */
SUREYYA.blocks = withAccessible(SUREYYA.blocks, (b) => b.level === "Zemin Loca" || b.label === "P", 2);
SUREYYA.shapes = autoGates(SUREYYA, SUREYYA.blocks.map((b) => ({ b, m: buildMeta(b) })));
