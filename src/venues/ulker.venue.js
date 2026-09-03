/* ══════  SALON 4 · ÜLKER SPOR VE ETKİNLİK SALONU (Fenerbahçe Beko)  ══════
   Gerçek mekân. Ataşehir/İstanbul, 2012 açılışlı, Ömerler Mimarlık.
   Doğrulanan veriler:
     · basketbol kapasitesi 13.500 (konserde 15.000)
     · iki kademeli kase — üst kademede 360° LED bant
     · iki kademe arasında 44 loca
     · alt kademe blokları 1xx numaralı; 118 ve 119 "pota arkası" bloklar
   FIBA sahası 28 × 15 m.

   Kase ölçüsü sahaya göre kuruldu: kenar çizgisine ~6,5 m, dip çizgisine
   ~8,5 m. Bu pay skorer masası, yedek kulübeleri, basın ve yürüme yolu
   içindir — önceki sahte "Örnek Arena"da bu 24-26 m'ye kadar açılmış,
   saha kocaman bir boşluğun ortasında kalmıştı.

   Loca katı 44 bloktan oluşuyor: bowl() blok sayısı
   2*(2*nCorner + nLong + nShort) olduğundan 2*(2*8 + 4 + 2) = 44 ile
   her blok bir locaya karşılık geliyor. Blokların çoğu köşelerde çünkü
   düz kenarlarda 44'ü paylaştırmak locaları birbirine geçirtiyordu
   (test "taban çakışma" ile yakaladı). İki sıralı ve geniş koltuk
   aralıklı — gerçek locada da iki sıra koltuk olur; ayrıca tek sıralı
   yelpaze blokta taban hesabı kavisi takip etmediğinden koltuklar
   tabanın dışında kalıyordu (test "koltuk-içerme" ile yakaladı).

   Kapılar GS'deki gibi cutVomitories() ile tribünün içine oyuluyor.
   Loca sığ olduğu için tünel açılmaz (fonksiyon sığ blokları atlar). */

import { nid } from "../core/ids.js";
import { DEF_NUM } from "../core/labels.js";
import { bowl, cutVomitories, labelGates, withAccessible } from "./builders.js";
import { autoGates } from "../core/gates.js";
import { buildMeta } from "../core/geometry.js";

const [ulkerAlt, ulkerAltDoors] = cutVomitories(bowl({ W: 2250, H: 1400, Rc: 900, rows: 20, rowGap: 85, seatGap: 50,
  nLong: 4, nShort: 2, nCorner: 2, first: 101, level: "Alt Tribün", aisle: 200, pad: 70,
  colors: { long: "#C1743C", short: "#3E9092", corner: "#7C5BA8" } }));
const ulkerLoca = bowl({ W: 4300, H: 3450, Rc: 2600, rows: 2, rowGap: 90, seatGap: 90,
  nLong: 4, nShort: 2, nCorner: 8, first: 1, level: "Loca", aisle: 250, pad: 60,
  colors: { long: "#B79A32", short: "#B79A32", corner: "#B79A32" } });
const [ulkerUst, ulkerUstDoors] = cutVomitories(withAccessible(bowl({ W: 4750, H: 3900, Rc: 2800, rows: 16, rowGap: 85, seatGap: 50,
  nLong: 5, nShort: 3, nCorner: 3, first: 201, level: "Üst Tribün", aisle: 220, pad: 70,
  colors: { long: "#5F9142", short: "#6E7787", corner: "#3E7FBF" } }),
  ["203", "205", "207", "209", "211", "213", "215", "217", "219", "221", "223", "225", "227"], 9));

export const ULKER = {
  key: "ulker", name: "Ülker Spor ve Etkinlik Salonu · Fenerbahçe Beko", unit: "cm",
  home: { x: -6600, y: -5700, w: 13200, h: 11400 }, underlay: null,
  shapes: [
    { id: nid("s"), kind: "rect", type: "pitch", sport: "basket", x: 0, y: 0,
      w: 2800, h: 1500, rot: 0, label: "Basketbol sahası", capacity: 0, fs: 160, blocks: [] },
    ...labelGates([...ulkerAltDoors, ...ulkerUstDoors]),
  ],
  blocks: [
    /* Parket kenarı — sahaya paralel iki tek sıra (courtside) */
    { id: nid(), kind: "grid", label: "P1", name: "Parket Kenarı · P1", level: "Parket Kenarı",
      x: 0, y: 950, rot: 0, cols: 30, rows: 2, counts: "", align: "center",
      seatGap: 55, rowGap: 90, curve: 0, taper: 0, color: "#C2415A", attr: "",
      num: { ...DEF_NUM, rowScheme: "letter" }, ov: {} },
    { id: nid(), kind: "grid", label: "P2", name: "Parket Kenarı · P2", level: "Parket Kenarı",
      x: 0, y: -950, rot: 180, cols: 30, rows: 2, counts: "", align: "center",
      seatGap: 55, rowGap: 90, curve: 0, taper: 0, color: "#C2415A", attr: "",
      num: { ...DEF_NUM, rowScheme: "letter" }, ov: {} },

    ...ulkerAlt, ...ulkerLoca, ...ulkerUst,
  ],
};

ULKER.shapes = autoGates(ULKER, ULKER.blocks.map((b) => ({ b, m: buildMeta(b) })));
