/* ══════════════  SALON 1 · CSO ADA ANKARA  ══════════════ */

import { nid } from "../core/ids.js";
import { withAccessible, fanB } from "./builders.js";

const wallPts = Array.from({ length: 44 }, (_, i) => {
  const t = (i / 44) * Math.PI * 2;
  return { x: Math.round(3170 * Math.sin(t)), y: Math.round(4030 * Math.cos(t)) };
});

const csoBlocks = [
  fanB({ label: "A", x: 0, y: 6020, r0: 6545, rows: 12, rowGap: 105, aCenter: 0, counts: "39..48", color: "#3E7FBF" }),
  fanB({ label: "B", x: 0, y: 6020, r0: 8176, rows: 7, rowGap: 107, aCenter: 0, counts: "58..52", color: "#C1743C" }),
  fanB({ label: "C", x: 0, y: 6020, r0: 9016, rows: 9, rowGap: 105, aCenter: 0, counts: "34..26", color: "#3E9092" }),
  /* Sahne arkası koro balkonu — tamamı görüş kısıtlı */
  fanB({ label: "D", x: 0, y: -5180, r0: 6384, rows: 7, rowGap: 105, aCenter: 180, counts: "38..44", color: "#3E9092", attr: "obstr" }),
  fanB({ label: "J", x: 0, y: -980, r0: 2460, rows: 8, rowGap: 105, aCenter: -39, counts: "9..12", color: "#C1743C" }),
  fanB({ label: "G", x: 0, y: -980, r0: 1900, rows: 6, rowGap: 105, aCenter: -72, counts: "10..12", color: "#C1743C" }),
  /* Yan kanat son sırası — tekerlekli sandalye alanı + refakatçi */
  fanB({ label: "E", x: 0, y: -980, r0: 1300, rows: 13, rowGap: 105, aCenter: -112, counts: "8..12", color: "#3E9092",
  }),
  fanB({ label: "K", x: 0, y: -980, r0: 2460, rows: 8, rowGap: 105, aCenter: 39, counts: "9..12", color: "#C1743C" }),
  fanB({ label: "H", x: 0, y: -980, r0: 1900, rows: 6, rowGap: 105, aCenter: 72, counts: "10..12", color: "#C1743C" }),
  fanB({ label: "F", x: 0, y: -980, r0: 1300, rows: 13, rowGap: 105, aCenter: 112, counts: "8..12", color: "#3E9092",
  }),
];

const csoBlocksA = withAccessible(csoBlocks, ["E", "F"], 9);
const csoIds = (...labels) => csoBlocksA.filter((b) => labels.includes(b.label)).map((b) => b.id);

/* Plandaki lejant: KAPI 1-2 A · 3 D-F-H · 4-5 B · 6 D-E-G · 7 C-K · 8 C-J */
const CSO_DOORS = [
  [1, 1435, -1680, ["A"]], [2, -1365, -1645, ["A"]],
  [3, 2440, -945, ["D", "F", "H"]], [4, 1344, -2674, ["B"]],
  [5, -1295, -2646, ["B"]], [6, -2400, -980, ["D", "E", "G"]],
  [7, 980, -3400, ["C", "K"]], [8, -966, -3400, ["C", "J"]],
];

export const CSO = {
  key: "cso", name: "CSO Ada Ankara · Ziraat Bankası Ana Salon", unit: "cm",
  home: { x: -2900, y: -4600, w: 5800, h: 7700 }, underlay: null,
  shapes: [
    { id: nid("s"), kind: "poly", type: "wall", x: 0, y: -700, rot: 0, pts: wallPts, label: "", capacity: 0, fs: 60, blocks: [] },
    { id: nid("s"), kind: "rect", type: "stage", x: 0, y: 250, w: 2150, h: 1200, rot: 0, label: "SAHNE", capacity: 0, fs: 240, blocks: [] },
    ...CSO_DOORS.map(([n, x, y, bl]) => ({
      id: nid("s"), kind: "rect", type: "door", x, y, w: 300, h: 300, rot: 0,
      label: `KAPI ${n}`, capacity: 0, fs: 95, blocks: csoIds(...bl),
    })),
  ],
  blocks: csoBlocksA,
};

CSO.shapes = [...CSO.shapes,
  ...[["wc", -2280, -1900, "WC"], ["wc", 2280, -1900, "WC"],
      ["bar", -2180, 380, "Fuaye Bar"], ["bar", 2180, 380, "Fuaye Bar"],
      ["cloak", -1750, 2450, "Vestiyer"], ["aid", 1750, 2450, "İlk yardım"],
      ["access", 0, 3050, "Engelli erişimi"]]
    .map(([icon, x, y, label]) => ({ id: nid("s"), kind: "icon", type: "icon", icon,
      x, y, rot: 0, size: 34, w: 200, h: 200, label, capacity: 0, fs: 100, blocks: [] }))];
