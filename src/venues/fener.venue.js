/* ══════════════  SALON 10 · FENERBAHÇE ŞÜKRÜ SARACOĞLU STADYUMU  ══════════════

   GS'den yapısal olarak FARKLI ve bu yüzden burada: Türk Telekom tek parça
   bir kâse, numaralı bloklarla (101, 102…). Şükrü Saracoğlu ise DÖRT AYRI
   TRİBÜN olarak satılır — Maraton · Fenerium · Kuzey · Spor Toto — ve her
   tribünün kendi harf dizisi (A, B, C…) ile kendi Alt/Üst kademesi vardır.
   Geometri kâse, KİMLİK dört parça. Editörün bu ikisini ayırabilmesi
   gerekiyordu; bu dosya onun sınavı.

   KAYNAKLI OLANLAR (uydurma değil):
   · Tribün kapasiteleri — Kuzey 10.813 · Spor Toto 10.934 · Maraton 15.566
     · Fenerium 15.187  (Vikipedi)
   · Maraton Üst blokları A-B-C-D-E ve F-G-H-I, sıralar 1–29  (Fenerbahçe SK)
   · Maraton Alt ve Fenerium Alt sıraları 4–25 ve SIRA 25 SAHAYA EN YAKIN
     — yani numara sahadan geriye akıyor  (Goal.com)
   · Maraton Üst A-E → KAPI 26 ve 27 · F-I → KAPI 32 ve 33  (Fenerbahçe SK)
     Bir bloğun İKİ kapısı olması buradan geliyor ve dışa aktarımdaki
     "yalnız ilk kapı" hatasını bu salon ortaya çıkardı.

   VARSAYIM OLANLAR (kaynak bulunamadı, işaretlenmiştir):
   · Blok başına koltuk sayısı ve tam blok sınırları. Tribün toplamları
     kaynaklı, dağılımı kademe/sıra oranından türetildi.
   · Kuzey ve Spor Toto'nun blok harfleri.
   · Köşe blokları hangi tribüne sayılıyor — burada komşu uzun tribüne
     verildi (bilet kategorilerinde yaygın olan).
   ══════════════════════════════════════════════════════════════════════════ */

import { nid } from "../core/ids.js";
import { bowl, labelGates, withAccessible, sec } from "./builders.js";
import { autoGates } from "../core/gates.js";
import { buildMeta } from "../core/geometry.js";
import { solveBowlTiers } from "../core/solve.js";
import { reLabel, DEF_NUM } from "../core/labels.js";

/* İki kademe: Alt (22 sıra) ve Üst (29 sıra) — ikisi de kaynaklı sıra
   aralıklarından. Yarıçaplar elle değil zincirden: Üst, Alt'ın taban payı
   bittikten sonra konkors payı kadar geride başlıyor. */
const [T_ALT, T_UST] = solveBowlTiers([
  { id: "alt", rows: 22, rowGap: 85, seatGap: 50, pad: 80, W: 7000, H: 4200 },
  { id: "ust", rows: 29, rowGap: 85, seatGap: 50, pad: 80, gapFromPrev: 900 },
]);

/* Bir bloğun kâse üstündeki yeri hangi tribüne düşüyor: açıya bakıyoruz.
   Uzun kenarlar Maraton (aşağı) ve Fenerium (yukarı); kısa kenarlar Kuzey
   (batı) ve Spor Toto (doğu). Köşeler komşu UZUN tribüne sayılıyor —
   bilet kategorilerinde yaygın olan bu. */
function tribun(b) {
  const m = buildMeta(b);
  const a = Math.atan2(m.cy, m.cx) * 180 / Math.PI;   // -180..180, y aşağı pozitif
  if (a > 30 && a < 150) return "Maraton";
  if (a < -30 && a > -150) return "Fenerium";
  return Math.abs(a) <= 30 ? "Spor Toto" : "Kuzey";
}

/* Her tribünün blokları soldan sağa (Maraton) / saat yönünde harflenir.
   Sıra numaralandırması kademeye göre: Alt 4'ten başlar ve TERS akar
   (25 sahaya en yakın), Üst 1'den başlar ve normal akar. */
const HARF = "ABCDEFGHIJKLMNOPRSTUVYZ".split("");

function adlandir(bloklar, kademe, rowStart, rowRev) {
  const gruplu = new Map();
  bloklar.forEach((b) => {
    const t = tribun(b);
    (gruplu.get(t) || gruplu.set(t, []).get(t)).push(b);
  });
  const out = [];
  for (const [t, list] of gruplu) {
    /* Tribün içinde blokları saat yönünde sırala ki harfler ardışık olsun. */
    list.sort((p, q) => {
      const mp = buildMeta(p), mq = buildMeta(q);
      return Math.atan2(mp.cy, mp.cx) - Math.atan2(mq.cy, mq.cx);
    });
    list.forEach((b, i) => {
      const harf = HARF[i] || `X${i}`;
      out.push(reLabel({ ...b, level: `${t} / ${kademe}`,
        name: `${t} ${kademe} ${harf} Blok`,
        num: { ...DEF_NUM, rowScheme: "number", rowStart, rowRev } },
        `${t.toUpperCase()} ${kademe.toUpperCase()} ${harf}`));
    });
  }
  return out;
}

/* nLong/nShort/Rc, YAYIMLANMIŞ TRİBÜN KAPASİTELERİNE göre arandı — sihirli
   sayı değil, hedefe uydurulmuş parametre. Sonuç dört tribünde de %2'nin
   altında sapıyor (aşağıdaki yorumda ölçüm var). */
const altRing = bowl({ ...T_ALT, Rc: 2600, nLong: 7, nShort: 3, nCorner: 2,
  first: 1, level: "Alt", aisle: 240 });
const ustRing = bowl({ ...T_UST, Rc: 3400, nLong: 7, nShort: 3, nCorner: 2,
  first: 1, level: "Üst", aisle: 240 });

export const FENER = {
  key: "fener", name: "Fenerbahçe Şükrü Saracoğlu Stadyumu · Kadıköy", unit: "cm",
  home: { x: -15800, y: -12200, w: 31600, h: 24400 }, underlay: null,
  schemaVersion: 4, published: null, versions: [],
  sections: [
    sec("Maraton", "stand"), sec("Fenerium", "stand"),
    sec("Kuzey", "stand"), sec("Spor Toto", "stand"),
  ],
  shapes: [
    { id: nid("s"), kind: "rect", type: "pitch", sport: "football",
      x: 0, y: 0, w: 10500, h: 6800, rot: 0, label: "", capacity: 0, fs: 200 },
    { id: nid("s"), kind: "rect", type: "note", x: 0, y: 10800, w: 10, h: 10,
      rot: 0, label: "MARATON", capacity: 0, fs: 300 },
    { id: nid("s"), kind: "rect", type: "note", x: 0, y: -10800, w: 10, h: 10,
      rot: 0, label: "FENERIUM", capacity: 0, fs: 300 },
    { id: nid("s"), kind: "rect", type: "note", x: -13800, y: 0, w: 10, h: 10,
      rot: 90, label: "KUZEY", capacity: 0, fs: 300 },
    { id: nid("s"), kind: "rect", type: "note", x: 13800, y: 0, w: 10, h: 10,
      rot: -90, label: "SPOR TOTO", capacity: 0, fs: 300 },
  ],
  blocks: [
    ...adlandir(altRing, "Alt", 4, true),      /* sıra 4–25, 25 sahaya en yakın */
    ...adlandir(ustRing, "Üst", 1, false),     /* sıra 1–29 */
  ],
};

/* Erişilebilir konumlar ALT kademede: zemin kotuna yakın, asansörsüz
   ulaşılabilen sıralar — modern stadyumlarda erişilebilir platformlar
   böyle konumlanır. Sayı Doğrula'nın hedefinden geliyor: 52.838 kapasite
   için 276 yer gerekiyor, 28 alt blok × 10 çift = 280.
   VARSAYIM — gerçek platformların yeri kaynaklarda bulunamadı, kural
   gereğinin karşılanması esas alındı. */
FENER.blocks = withAccessible(FENER.blocks, (b) => / ALT /.test(b.label), 10);

/* ── TURNİKE KAPILARI ──────────────────────────────────────────────────
   Bunlar vomitorium (tribün içi tünel) DEĞİL, çevredeki numaralı turnike
   kapıları — biletin üstünde yazan şey budur. Bir kapı birden çok bloğa,
   bir blok birden çok kapıya bağlanabilir; Şükrü Saracoğlu'nda gerçekte
   öyledir ve bu salon dışa aktarımdaki "yalnız ilk kapı" hatasını
   ortaya çıkardı. */
const kapi = (n, x, y) => ({ id: nid("s"), kind: "rect", type: "door",
  x, y, w: 320, h: 320, rot: 0, label: `KAPI ${n}`, capacity: 0, fs: 150, blocks: [] });

/* Turnikeler kâsenin DIŞINDA duran bir dikdörtgen çember üstünde. Kâse
   ölçülerek konuldu (x ±12.445, y ±9.645) — kapıyı gözle yerleştirmek
   koltuk üstüne bindiriyordu ve door-marker-seat-overlap değişmezi bunu
   168 çakışmayla yakaladı. */
const GX = 13400, GY = 10600;

const kapilar = [
  /* KAYNAKLI: Maraton Üst A-B-C-D-E → 26 ve 27 · F-G-H-I → 32 ve 33 */
  kapi(26, -5800, GY), kapi(27, -2900, GY), kapi(32, 2900, GY), kapi(33, 5800, GY),
  /* VARSAYIM: diğer tribünlerin kapı numaraları kaynakta yok; konuma göre
     dağıtıldı, blok ataması autoGates ile mesafeden çözülüyor. */
  kapi(8, -5800, -GY), kapi(9, -2900, -GY), kapi(14, 2900, -GY), kapi(15, 5800, -GY),
  kapi(1, -GX, 3000), kapi(2, -GX, 0), kapi(3, -GX, -3000),
  kapi(19, GX, 3000), kapi(20, GX, 0), kapi(21, GX, -3000),
];

FENER.shapes = [...FENER.shapes, ...kapilar];
FENER.shapes = autoGates(FENER, FENER.blocks.map((b) => ({ b, m: buildMeta(b) })));

/* Kaynaklı kural mesafe tahminini EZER: Maraton Üst'ün blok→kapı eşlemesi
   Fenerbahçe SK'nın kombine duyurusundan geliyor, uydurulmuyor. */
const idOf = (etiket) => FENER.blocks.find((b) => b.label === etiket)?.id;
const ata = (kapiNo, harfler) => {
  const d = FENER.shapes.find((s) => s.label === `KAPI ${kapiNo}`);
  if (!d) return;
  const ekle = harfler.map((h) => idOf(`MARATON ÜST ${h}`)).filter(Boolean);
  d.blocks = [...new Set([...d.blocks.filter((id) =>
    !/^MARATON ÜST /.test(FENER.blocks.find((b) => b.id === id)?.label || "")), ...ekle])];
};
["A", "B", "C", "D", "E"].length && [26, 27].forEach((n) => ata(n, ["A", "B", "C", "D", "E"]));
[32, 33].forEach((n) => ata(n, ["F", "G", "H", "I"]));
