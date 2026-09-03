/* ══════════════  SALON 2 · ZORLU PSM  ══════════════ */

import { nid } from "../core/ids.js";
import { gr, nOrta, nCift, nTek, withAccessible } from "./builders.js";
import { autoGates } from "../core/gates.js";
import { buildMeta } from "../core/geometry.js";

const ORK_MID = "CC,DD,EE,FF,GG,HH,A,B,C,D,E,F,G,H,I";
const ORK_BACK = "J,K,L,M,N,O,P,Q,R,S,T,U,V,W";
const ORK_SIDE = "J,K,L,M,N,O,P,Q,R,S,T,U,V,W,X,Y,Z";
const B1R = "A,B,C,D,E,F,G,H,I,J,K,L,M", B2R = "A,B,C,D,E,F,G,H,I";

export const ZORLU = {
  key: "zorlu", name: "Zorlu PSM · Turkcell Sahnesi", unit: "cm",
  home: { x: -2950, y: -1500, w: 5900, h: 9200 }, underlay: null,
  shapes: [
    { id: nid("s"), kind: "rect", type: "stage", x: 0, y: -700, w: 2800, h: 900, rot: 0, label: "SAHNE", capacity: 0, fs: 220 },
    { id: nid("s"), kind: "rect", type: "note", x: -2130, y: 1700, w: 10, h: 10, rot: 0, label: "ORKESTRA", capacity: 0, fs: 108 },
    { id: nid("s"), kind: "rect", type: "note", x: -2130, y: 4780, w: 10, h: 10, rot: 0, label: "1. BALKON", capacity: 0, fs: 108 },
    { id: nid("s"), kind: "rect", type: "note", x: -2130, y: 6600, w: 10, h: 10, rot: 0, label: "2. BALKON", capacity: 0, fs: 108 },
    ...[[1, -1900, 1400], [2, 1900, 1400], [3, -1900, 4900], [4, 1900, 4900],
        [5, -1750, 6900], [6, 1750, 6900]].map(([n, x, y]) => ({
      id: nid("s"), kind: "rect", type: "door", x, y, w: 260, h: 260, rot: 0,
      label: `KAPI ${n}`, capacity: 0, fs: 90, blocks: [],
    })),
  ],
  blocks: [
    gr({ label: "ORK-O", name: "Orkestra Orta (ön)", level: "Orkestra", x: 0, y: 200, rows: 2, counts: "18..20", color: "#3E7FBF", num: nOrta("AA,BB") }),
    gr({ label: "ORK-O", name: "Orkestra Orta", level: "Orkestra", x: 0, y: 560, rows: 15, counts: "21..15", color: "#3E7FBF", num: nOrta(ORK_MID),
         ov: { "14,6": { rm: true }, "14,7": { rm: true }, "14,8": { rm: true } } }),
    gr({ label: "ORK-O", name: "Orkestra Orta (arka)", level: "Orkestra", x: 0, y: 2140, rows: 14, counts: "19..28", color: "#C1743C", num: nOrta(ORK_BACK),
    }),
    gr({ label: "ORK-C", name: "Orkestra Çift (ön)", level: "Orkestra", x: -1000, y: 290, rows: 2, counts: "5,5", color: "#3E7FBF", num: nCift("BB,CC") }),
    gr({ label: "ORK-C", name: "Orkestra Çift", level: "Orkestra", x: -1000, y: 650, rows: 3, counts: "5..6", color: "#3E7FBF", num: nCift("DD,EE,FF") }),
    gr({ label: "ORK-C", name: "Orkestra Çift (yan)", level: "Orkestra", x: -880, y: 1040, rows: 7, counts: "4..3", color: "#3E7FBF", num: nCift("A,B,C,D,E,F,G") }),
    gr({ label: "ORK-C", name: "Orkestra Çift (arka)", level: "Orkestra", x: -1300, y: 2140, rows: 17, counts: "17..11", color: "#C1743C", align: "left", num: nCift(ORK_SIDE) }),
    gr({ label: "ORK-T", name: "Orkestra Tek (ön)", level: "Orkestra", x: 1000, y: 290, rows: 2, counts: "5,5", color: "#3E7FBF", num: nTek("BB,CC") }),
    gr({ label: "ORK-T", name: "Orkestra Tek", level: "Orkestra", x: 1000, y: 650, rows: 3, counts: "5..6", color: "#3E7FBF", num: nTek("DD,EE,FF") }),
    gr({ label: "ORK-T", name: "Orkestra Tek (yan)", level: "Orkestra", x: 880, y: 1040, rows: 7, counts: "4..3", color: "#3E7FBF", num: nTek("A,B,C,D,E,F,G") }),
    gr({ label: "ORK-T", name: "Orkestra Tek (arka)", level: "Orkestra", x: 1300, y: 2140, rows: 17, counts: "17..11", color: "#C1743C", align: "right", num: nTek(ORK_SIDE) }),
    gr({ label: "B1-O", name: "1. Balkon Orta", level: "1. Balkon", x: 0, y: 4200, rows: 13,
         counts: "20,21,21,22,22,22,23,23,23,23,23,23,8", color: "#C1743C", num: nOrta(B1R),
         ov: { "12,2": { gap: true }, "12,3": { gap: true }, "12,4": { gap: true }, "12,5": { gap: true } } }),
    gr({ label: "B1-C", name: "1. Balkon Çift", level: "1. Balkon", x: -1200, y: 4200, rows: 12, counts: "19..5", color: "#3E9092", num: nCift(B1R) }),
    gr({ label: "B1-T", name: "1. Balkon Tek", level: "1. Balkon", x: 1200, y: 4200, rows: 12, counts: "19..5", color: "#3E9092", num: nTek(B1R) }),
    gr({ label: "B2-O", name: "2. Balkon Orta", level: "2. Balkon", x: 0, y: 6200, rows: 7, counts: "21..23", color: "#3E9092", num: nOrta("A,B,C,D,E,F,G") }),
    gr({ label: "B2-C", name: "2. Balkon Çift", level: "2. Balkon", x: -1150, y: 6200, rows: 9, counts: "17..5", color: "#5F9142", num: nCift(B2R) }),
    gr({ label: "B2-T", name: "2. Balkon Tek", level: "2. Balkon", x: 1150, y: 6200, rows: 9, counts: "17..5", color: "#5F9142", num: nTek(B2R) }),
  ],
};

ZORLU.blocks = withAccessible(ZORLU.blocks,
  (b) => ["Orkestra Orta (arka)", "1. Balkon Orta"].includes(b.name), 9);
ZORLU.shapes = autoGates(ZORLU, ZORLU.blocks.map((b) => ({ b, m: buildMeta(b) })));
