/* ══════════════  SALON 5 · HARBİYE CEMİL TOPUZLU AÇIKHAVA  ══════════════
   180°'lik amfi. Üç kademe, harfle adlandırılmış radyal bloklar,
   önde protokol locası, sahne ile seyirci arasında orkestra çukuru.
   Her kademe tek tohum blok + radyal diziyle kuruluyor.
   ═══════════════════════════════════════════════════════════════════════ */

import { nid } from "../core/ids.js";
import { reLabel, DEF_NUM } from "../core/labels.js";
import { tier, locaWing, withAccessible } from "./builders.js";
import { autoGates } from "../core/gates.js";
import { RAD, buildMeta } from "../core/geometry.js";
import { solveRadialTiers } from "../core/solve.js";

/* Kademe zinciri: Protokol → Alt → Orta → Üst Kademe → Erişilebilir Platform,
   merkezden dışa beş bant. r0 artık ELLE değil bu zincirden geliyor — her
   bant bir öncekinin taban payı (footprintPad) bitince `gapFromPrev` kadar
   sonra başlar. Açıklıklar (59/39/39/88) bugünkü r0 değerlerinden
   (1150/1500/2700/3900/4680) BİR KEZ geriye türetildi (bkz. A4 görev
   raporu) — r0 SONUÇ, girdi rows/rowGap/seatGap + bu açıklıklar. */
const [T_PR, T_ALT, T_ORTA, T_UST, T_ERI] = solveRadialTiers([
  { id: "pr", rows: 2, rowGap: 95, seatGap: 50, pad: 45, r0: 1150 },
  { id: "alt", rows: 11, rowGap: 95, seatGap: 50, pad: 60, gapFromPrev: 59 },
  { id: "orta", rows: 11, rowGap: 95, seatGap: 50, pad: 60, gapFromPrev: 39 },
  { id: "ust", rows: 6, rowGap: 95, seatGap: 50, pad: 60, gapFromPrev: 39 },
  { id: "eri", rows: 2, rowGap: 130, seatGap: 62, pad: 60, gapFromPrev: 88 },
]);

const wallArc = [
  ...Array.from({ length: 40 }, (_, i) => {
    const a = (-96 + (192 * i) / 39) * RAD;
    return { x: Math.round(5750 * Math.sin(a)), y: Math.round(-5750 * Math.cos(a)) };
  }),
  { x: 3200, y: 2200 }, { x: -3200, y: 2200 },
];

export const HARBIYE = {
  key: "harbiye", name: "Harbiye Cemil Topuzlu Açıkhava Tiyatrosu", unit: "cm",
  home: { x: -6400, y: -6400, w: 12800, h: 9600 }, underlay: null,
  shapes: [
    { id: nid("s"), kind: "poly", type: "wall", x: 0, y: 0, rot: 0, pts: wallArc,
      label: "", capacity: 0, fs: 80, blocks: [] },
    { id: nid("s"), kind: "rect", type: "stage", x: 0, y: 700, w: 2600, h: 1300, rot: 0,
      label: "SAHNE", capacity: 0, fs: 210, blocks: [] },
    { id: nid("s"), kind: "rect", type: "screen", x: 0, y: -180, w: 2200, h: 420, rot: 0,
      label: "ORKESTRA ÇUKURU", capacity: 0, fs: 105, blocks: [] },
    ...[[1, -3050, -2450], [2, 3050, -2450], [3, -4550, -1500], [4, 4550, -1500],
        [5, 0, -5980]].map(([n, x, y]) => ({
      id: nid("s"), kind: "rect", type: "door", x, y, w: 300, h: 300, rot: 0,
      label: `KAPI ${n}`, capacity: 0, fs: 100, blocks: [],
    })),
  ],
  blocks: [
    /* Protokol locası — sahnenin hemen önünde, iki sıra */
    reLabel({ id: nid(), kind: "fan", mode: "span", x: 0, y: 0, rot: 0,
      r0: T_PR.r0, rows: T_PR.rows, rowGap: T_PR.rowGap, seatGap: T_PR.seatGap, counts: "15,15", align: "center",
      aStart: -20, aEnd: 20, aCenter: 0, color: "#B79A32", pad: T_PR.pad,
      level: "Protokol", ov: {}, num: { ...DEF_NUM } }, "PR"),

    ...tier({ r0: T_ALT.r0, rows: T_ALT.rows, rowGap: T_ALT.rowGap, span: 35, count: 5,
      first: "A", level: "Alt Kademe", color: "#3E7FBF", aisle: 150, pad: T_ALT.pad }),
    ...tier({ r0: T_ORTA.r0, rows: T_ORTA.rows, rowGap: T_ORTA.rowGap, span: 30, count: 6,
      first: "F", level: "Orta Kademe", color: "#5F9142", aisle: 160, pad: T_ORTA.pad }),
    ...tier({ r0: T_UST.r0, rows: T_UST.rows, rowGap: T_UST.rowGap, span: 30, count: 5,
      first: "M", level: "Üst Kademe", color: "#C1743C", aisle: 180, pad: T_UST.pad }),

    /* Erişilebilir platformlar — üst kademenin arkasındaki düz alan.
       Tekerlekli sandalye ve refakatçi yerleri sırayla dizili. */
    ...[-1, 1].map((sd, k) => reLabel({
      id: nid(), kind: "fan", mode: "span", x: 0, y: 0, rot: sd * 52,
      r0: T_ERI.r0, rows: T_ERI.rows, rowGap: T_ERI.rowGap, seatGap: T_ERI.seatGap, counts: "18,18", align: "center",
      aStart: -13, aEnd: 13, aCenter: 0, color: "#3E9092", pad: T_ERI.pad,
      level: "Erişilebilir Platform",
      ov: Object.fromEntries(Array.from({ length: 36 }, (_, i) =>
        [`${Math.floor(i / 18)},${i % 18}`, { at: i % 2 === 0 ? "wheel" : "comp" }])),
      num: { ...DEF_NUM },
    }, `E${k + 1}`)),
  ],
};

/* Kapılar en yakın bloklara atanıyor — editördeki düğmenin yaptığı işlem. */
HARBIYE.shapes = autoGates(HARBIYE, HARBIYE.blocks.map((b) => ({ b, m: buildMeta(b) })));
HARBIYE.shapes = [...HARBIYE.shapes,
  ...[["wc", -5150, -2350, "WC"], ["wc", 5150, -2350, "WC"],
      ["beer", -4300, -4100, "Büfe"], ["beer", 4300, -4100, "Büfe"],
      ["stairs", -2450, -5250, "Merdiven"], ["stairs", 2450, -5250, "Merdiven"],
      ["aid", 0, 1750, "İlk yardım"]]
    .map(([icon, x, y, label]) => ({ id: nid("s"), kind: "icon", type: "icon", icon,
      x, y, rot: 0, size: 34, w: 200, h: 200, label, capacity: 0, fs: 100, blocks: [] }))];
