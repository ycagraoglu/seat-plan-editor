/* ══════════════  SALON 9 · FESTIVAL PARK YENİKAPI  ══════════════
   Büyük ölçekli açık hava — koltuk yerine çoğunlukla ayakta alan
   (standing shape) modelledi. Sahneden uzaklaştıkça genişleyen üç
   ayakta bant (Sahne Önü A/B, Genel Giriş) + ayrı bir VIP cebi +
   tek gerçek oturan blok (LOCA, ızgara). Toplam 40.000 — Şebnem
   Ferah'ın buradaki konserinin gerçek rakamı; bant içi dağılım
   editöryel tahmin (kaynakta tek tek bilet kategorisi kırılımı yok).
   ══════════════════════════════════════════════════════════════ */

import { nid } from "../core/ids.js";
import { DEF_NUM } from "../core/labels.js";
import { autoGates } from "../core/gates.js";
import { buildMeta } from "../core/geometry.js";

export const YENIKAPI = {
  key: "yenikapi", name: "Festival Park Yenikapı · Ayakta Konser Alanı", unit: "cm",
  home: { x: -10500, y: -2200, w: 19000, h: 20400 }, underlay: null,
  shapes: [
    { id: nid("s"), kind: "rect", type: "stage", x: 0, y: -750, w: 4000, h: 1500, rot: 0,
      label: "SAHNE", capacity: 0, fs: 300, blocks: [] },
    { id: nid("s"), kind: "rect", type: "standing", x: 0, y: 1600, w: 5000, h: 3000, rot: 0,
      label: "Sahne Önü A", capacity: 7000, fs: 110, blocks: [] },
    { id: nid("s"), kind: "rect", type: "standing", x: 0, y: 5200, w: 8000, h: 4000, rot: 0,
      label: "Sahne Önü B", capacity: 11200, fs: 130, blocks: [] },
    { id: nid("s"), kind: "rect", type: "standing", x: 0, y: 11350, w: 13000, h: 8000, rot: 0,
      label: "Genel Giriş", capacity: 20100, fs: 160, blocks: [] },
    { id: nid("s"), kind: "rect", type: "standing", x: -7500, y: 4450, w: 3000, h: 2500, rot: 0,
      label: "VIP Alan", capacity: 1200, fs: 100, blocks: [] },
    { id: nid("s"), kind: "rect", type: "wall", x: -1250, y: 8000, w: 16500, h: 19600, rot: 0,
      label: "", capacity: 0, fs: 100, blocks: [] },
    ...[[1, -9500, 6000], [2, 7000, 6000], [3, -9500, 14000], [4, 7000, 14000],
        [5, -3000, 17600], [6, 2000, 17600]].map(([n, x, y]) => ({
      id: nid("s"), kind: "rect", type: "door", x, y, w: 400, h: 400, rot: 0,
      label: `KAPI ${n}`, capacity: 0, fs: 160, blocks: [],
    })),
  ],
  blocks: [
    { id: nid(), kind: "grid", label: "LOCA", name: "LOCA", level: "Loca",
      x: 0, y: 15650, rot: 0, cols: 25, rows: 20, counts: "", align: "center",
      seatGap: 50, rowGap: 90, curve: 0, taper: 0, color: "#3E7FBF", attr: "",
      num: { ...DEF_NUM },
      ov: {
        "19,0": { at: "wheel" }, "19,1": { at: "wheel" }, "19,2": { at: "wheel" },
        "19,3": { at: "wheel" }, "19,4": { at: "wheel" }, "19,5": { at: "wheel" },
        "19,6": { at: "comp" }, "19,7": { at: "comp" }, "19,8": { at: "comp" },
        "19,9": { at: "comp" }, "19,10": { at: "comp" }, "19,11": { at: "comp" },
      } },
  ],
};

YENIKAPI.shapes = autoGates(YENIKAPI, YENIKAPI.blocks.map((b) => ({ b, m: buildMeta(b) })));
