/* ══════════════  SALON 6 · AYLAK BAR KADIKÖY  ══════════════
   Stand-up gecesi düzeni. Sıra yok, masa var: 2 ve 4 kişilik yuvarlak
   masalar, bar tezgâhı boyunca tabure, arkada ayakta alan.
   Tellalzade Sk. No:13, Caferağa — küçük bir bar, düzensiz plan.
   ═══════════════════════════════════════════════════════════ */

import { nid } from "../core/ids.js";
import { reLabel, DEF_NUM } from "../core/labels.js";
import { tbl, withAccessible } from "./builders.js";
import { autoGates } from "../core/gates.js";
import { buildMeta } from "../core/geometry.js";

export const AYLAK = {
  key: "aylak", name: "Aylak Bar Kadıköy · Stand-up düzeni", unit: "cm",
  home: { x: -900, y: -800, w: 1900, h: 1560 },
  idTemplate: "{block}-{seat}", underlay: null,
  shapes: [
    { id: nid("s"), kind: "rect", type: "wall", x: 130, y: -60, w: 1560, h: 1120, rot: 0,
      label: "", capacity: 0, fs: 40, blocks: [] },
    { id: nid("s"), kind: "rect", type: "stage", x: 0, y: -470, w: 420, h: 180, rot: 0,
      label: "SAHNE", capacity: 0, fs: 70, blocks: [] },
    { id: nid("s"), kind: "rect", type: "screen", x: -490, y: -25, w: 140, h: 550, rot: 0,
      label: "BAR TEZGÂHI", capacity: 0, fs: 52, blocks: [] },
    { id: nid("s"), kind: "rect", type: "standing", x: 150, y: 455, w: 900, h: 130, rot: 0,
      label: "Ayakta alan", capacity: 40, fs: 44, blocks: [] },
    ...[[1, -640, 250], [2, 640, 250]].map(([n, x, y]) => ({
      id: nid("s"), kind: "rect", type: "door", x, y, w: 90, h: 90, rot: 0,
      label: `KAPI ${n}`, capacity: 0, fs: 36, blocks: [] })),
    ...[["entrance", -545, 405, "Giriş"], ["wc", 555, 405, "WC"],
        ["aid", 555, -520, "İlk yardım"], ["cafe", -545, -520, "Bar"]]
      .map(([icon, x, y, label]) => ({ id: nid("s"), kind: "icon", type: "icon", icon,
        x, y, rot: 0, size: 32, w: 120, h: 120, label, capacity: 0, fs: 100, blocks: [] })),
  ],
  blocks: [
    /* Sahne önü — iki kişilik masalar */
    ...[-195, 35, 265, 495].map((x, i) => tbl(`M${i + 1}`, x, -250, 2, 65, 0, "#C2415A")),
    /* Salon — dört kişilik masalar, iki sıra */
    ...[-195, 35, 265, 495].map((x, i) => tbl(`M${i + 5}`, x, -20, 4, 90, 45, "#3E7FBF")),
    ...[-195, 35, 265, 495].map((x, i) => tbl(`M${i + 9}`, x, 210, 4, 90, 45, "#3E7FBF")),
    /* Bar tezgâhı taburesi — tek sıra, tezgâha dönük */
    reLabel({ id: nid(), kind: "grid", x: -370, y: -25, rot: -90,
      cols: 7, rows: 1, counts: "", align: "center", seatGap: 72, rowGap: 90,
      curve: 0, taper: 0, color: "#B79A32", pad: 30, level: "Bar", attr: "", ov: {},
      num: { ...DEF_NUM, rowScheme: "custom", rowCustom: "B", seatStart: 1 } }, "BAR"),
  ],
};

/* Erişilebilir masalar — girişe ve geçiş aksına yakın */
AYLAK.blocks = withAccessible(AYLAK.blocks, ["M1", "M4", "M9", "M12"], 1);
AYLAK.shapes = autoGates(AYLAK, AYLAK.blocks.map((b) => ({ b, m: buildMeta(b) })));
