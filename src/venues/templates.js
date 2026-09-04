/* ═══════════════════════════════════════════════════════════════════════
   ŞABLONLAR — "Yeni plan" için boş tuval yerine geçen iki başlangıç iskeleti.

   Bu dosya src/venues/*.venue.js'ten (9 örnek salon) BİLEREK ayrı: onlar
   sabit, salt-okunur örnekler ve BUILTINS'e (venues/index.js) kayıtlı;
   bunlar ise her çağrıldığında YENİ bir kullanıcı planı üreten
   FONKSİYONLAR. index.js'e hiç eklenmedi — modül üst seviyesinde nid()
   çağırmıyorlar (çağırsalardı 9 örnek salonun id sırasını — bkz.
   venues/index.js'in başındaki uyarı — bozarlardı). id üretimi yalnız
   PlanEditor.jsx bu fonksiyonları ÇAĞIRDIĞINDA olur, tıpkı duplicatePlan()
   gibi: çıktı örnek salon ad alanına değil, "Yeni plan"ın kendi p<timestamp>
   akışına girer.

   Kapsam bilerek KÜÇÜK: kullanıcı bunu düzenleyecek, örnek bir salon
   sergilemiyoruz. Stadyum birkaç bin, salon birkaç yüz-bin koltukluk
   okunabilir birer iskelet — GS/Harbiye'nin küçültülmüş taklidi değil,
   aynı üreteçlerin (bowl/tier) ölçülü parametrelerle tek-kademeli hali. */
import { nid } from "../core/ids.js";
import { bowl, cutVomitories, tier, labelGates, withAccessible } from "./builders.js";
import { autoGates } from "../core/gates.js";
import { buildMeta } from "../core/geometry.js";

/** STADYUM — sahayı çevreleyen kapalı tribün kuşağı.
 *  Tek kademe (gerçek GS/Ülker'deki 3 kademelik zincir değil): 14 blok,
 *  ~3.100 koltuk. Vomitoriumlar cutVomitories() ile tribünün İÇİNE oyulur
 *  (bkz. builders.js'teki fonksiyon yorumu) — kapı bloklar arası koridora
 *  kondurulmuş bir işaret DEĞİL, koltuk dizilimini fiilen bozan mimari bir
 *  boşluk; bu görevin çıkış noktası tam olarak buydu. */
export function buildStadiumTemplate() {
  const rows = 9, rowGap = 85, seatGap = 50, Rc = 1000, W = 3200, H = 2200;
  const raw = bowl({
    W, H, Rc, rows, rowGap, seatGap, nLong: 3, nShort: 2, nCorner: 1,
    first: 100, level: "Tribün", aisle: 200, pad: 70,
    colors: { long: "#3E7FBF", short: "#3E9092", corner: "#7C5BA8" },
  });
  /* withAccessible() cutVomitories'TEN ÖNCE uygulanmalı — sıra ÖNEMLİ.
     withAccessible bir koltuğun ov[r,c] girdisini {at:"wheel"} ile
     DEĞİŞTİRİR (üzerine yazar); cutVomitories ise aynı girdiye rm:true'yu
     var olanın üstüne EKLER (`{...(ov[r,c]||{}), rm:true}`, bkz.
     builders.js). Sıra ters olursa (önce kes, sonra erişilebilir koltuk
     ekle) wheel/comp etiketi tünelin rm:true'sunu SİLER ve koltuğu kapı
     boşluğunun ortasında diriltir — ölçülünce (bu görevin taslak
     script'inde) tam olarak bu çıktı: 16 kapı-koltuk çakışması. gs.venue.js
     Üst Tribün'de aynı sırayı (önce withAccessible, sonra cutVomitories)
     zaten kullanıyor; burada da aynısı. */
  const accLabels = new Set(["101", "103", "108", "110"]);
  const withAcc = raw.map((b) => (accLabels.has(b.label) ? withAccessible([b], [b.label], 10)[0] : b));
  const [blocks, doors] = cutVomitories(withAcc, { depth: 3, width: 6 });

  /* Saha: PITCHES.generic (düz zemin, işaretlemesiz) — sabit ölçülü bir
     spor sahası (ör. football: 105×68m) burada YANLIŞ olurdu, bu tuvale
     küçültülmeden sığmaz (bkz. PlanEditor.jsx'teki PITCHES.football.marks
     — mutlak cm sabitleriyle çizer, oranla ölçeklenmez). Boyut (2800×1800)
     merkezden en yakın blok dış hattına olan GERÇEK mesafe ölçülerek
     (~2085cm) seçildi, tahmin değil. */
  const pitch = { id: nid("s"), kind: "rect", type: "pitch", sport: "generic",
    x: 0, y: 0, w: 2800, h: 1800, rot: 0, label: "SAHA", capacity: 0, fs: 200, blocks: [] };

  const plan = { unit: "cm", home: { x: -4200, y: -3400, w: 8400, h: 6800 }, underlay: null,
    shapes: [pitch, ...labelGates(doors)], blocks };
  /* Kapıyı en yakın bloklara bağla — GS/Harbiye'nin yaptığı son adım,
     yoksa "orphan-blocks" kuralı her bloğu kapısız bulur. */
  plan.shapes = autoGates(plan, plan.blocks.map((b) => ({ b, m: buildMeta(b) })));
  return plan;
}

/** SALON — sahneye bakan radyal kademeler.
 *  Tek kademe (Harbiye'nin 5 kademelik zincirinin değil), 6 dilim,
 *  ~620 koltuk. tier() harfle adlandırılmış eşit-açılı radyal bloklar
 *  üretir; kapılar (2 adet) tüm bloğun dış kutusunun DIŞINA, ölçülmüş
 *  bbox'a göre konur — bir koltuğa değme ihtimali sıfır, çünkü bbox'ın
 *  dışında hiç blok yok. */
export function buildHallTemplate() {
  const r0 = 1000, rows = 10, rowGap = 95;
  const raw = tier({ r0, rows, rowGap, span: 30, count: 6, first: "A",
    level: "Salon", color: "#3E7FBF", aisle: 160, pad: 60 });
  const blocks = withAccessible(raw, ["A", "F"], 5);

  const metas0 = blocks.map((b) => buildMeta(b));
  const x0 = Math.min(...metas0.map((m) => m.bbox.x0)), x1 = Math.max(...metas0.map((m) => m.bbox.x1));
  const y0 = Math.min(...metas0.map((m) => m.bbox.y0)), y1 = Math.max(...metas0.map((m) => m.bbox.y1));

  /* Sahne, kademenin ön (izleyiciden uzak, y>0) tarafında — ölçülen bbox
     y'si en fazla ~6cm'e çıkıyor (bkz. görev script'i), sahne 450±400
     bandı hiçbir koltuğa değmez (outlineOverlapArea ile doğrulandı). */
  const stage = { id: nid("s"), kind: "rect", type: "stage", x: 0, y: 450, w: 1400, h: 800, rot: 0,
    label: "SAHNE", capacity: 0, fs: 130, blocks: [] };
  const doors = [
    { id: nid("s"), kind: "rect", type: "door", x: x0 - 300, y: (y0 + y1) / 2, w: 300, h: 300, rot: 0, capacity: 0, fs: 100, blocks: [] },
    { id: nid("s"), kind: "rect", type: "door", x: x1 + 300, y: (y0 + y1) / 2, w: 300, h: 300, rot: 0, capacity: 0, fs: 100, blocks: [] },
  ];

  const plan = { unit: "cm", home: { x: x0 - 800, y: y0 - 400, w: (x1 - x0) + 1600, h: (y1 - y0) + 1400 }, underlay: null,
    shapes: [stage, ...labelGates(doors)], blocks };
  plan.shapes = autoGates(plan, plan.blocks.map((b) => ({ b, m: buildMeta(b) })));
  return plan;
}
