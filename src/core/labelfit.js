/* ══════════════════════════════════════════════════════════════════════════
   ETİKET SIĞDIRMA — tek kaynak

   Bir blok/şekil etiketi İÇİNE YAZILDIĞI ŞEKLE sığmalı. Sabit boy kullanmak
   iki ayrı yerde aynı hatayı üretti ve ayrı ayrı çözülmüştü:

   · mcp/render.mjs — 56 bloklu stadyumda üst üste binen okunmaz yazı
   · src/PlanEditor.jsx — dokuz loca yan yana (her biri 161 cm), "LOCA 9"
     rozetleri komşusunun üstüne biniyordu

   Kural burada birleşti; iki tüketici de bunu çağırıyor, ayrışamazlar.

   MERDİVEN — sırayla denenir, ilk tutan yazılır:
     1. tam etiket                      "MARATON ALT B"
     2. görünümdeki ORTAK ÖNEK atılmış  "ALT B"
     3. son kelime                      "B"
     4. hiç yazma (yakınlaşınca gelir)

   2. ve 3. basamak ancak AYIRT EDİCİYSE kullanılır. Ölçümle gelen kısıt:

   · Şükrü Saracoğlu, tüm plan: "KUZEY ALT A", "MARATON ÜST A"… → son
     kelimeler A, B, C ve her biri SEKİZ blokta tekrar ediyor. Sekiz bloğa
     "A" yazmak gizlemekten beter — o yüzden orada etiket saklanıyor.
   · Aynı stadyum, tek tribüne yakınlaşınca (18 blok): hepsi "MARATON " ile
     başlıyor, önek atılınca "ALT B"/"ÜST B" kalıyor — hem tekil hem
     okunur. Tam etiket 7,8 px'e düşüyordu (eşik 8), önekli hâli 17,5 px.
     Gerçek stadyum planları da böyle yapar: tribün adı bir kez, blok kodu
     bloğun üstünde.
   · Dokuz loca "LOCA 1…LOCA 9": ortak önek "LOCA", atılınca 1…9 kalıyor,
     hepsi tekil. 161 cm'lik kutuda tam etiket 6,5 px (okunmaz), "9" rahat.
   ══════════════════════════════════════════════════════════════════════════ */

/** Bu pikselin altındaki yazı okunmuyor — ekranda da, dışa aktarılan
 *  görselde de. */
export const TABAN_PX = 8;

/** Merge matching row ends facing each other across a shared aisle. */
export function mergeRowLabels(labels) {
  const used = new Set();
  const result = [];
  const groups = new Map();
  for (const l of labels) {
    const key = JSON.stringify([l.level, String(l.text)]);
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key).push(l);
  }
  for (const group of groups.values()) {
    for (const l of group) {
      if (used.has(l)) continue;
      let partner, nearest = Infinity;
      for (const other of group) {
        if (other === l || used.has(other) || other.blockId === l.blockId) continue;
        if (l.nx * other.nx + l.ny * other.ny > -0.99) continue;
        const dx = other.x - l.x, dy = other.y - l.y;
        const along = dx * l.nx + dy * l.ny;
        const across = Math.abs(dx * l.ny - dy * l.nx);
        const distance = Math.hypot(dx, dy);
        if (along >= 0 && across <= Math.min(l.reach, other.reach) * 0.1
          && distance <= l.reach + other.reach && distance < nearest) {
          partner = other;
          nearest = distance;
        }
      }
      used.add(l);
      if (partner) used.add(partner);
      result.push(partner ? { ...l, x: (l.x + partner.x) / 2, y: (l.y + partner.y) / 2 } : l);
    }
  }
  return result;
}

/** Yazının kapladığı genişliğin yazı boyuna oranı: ortalama karakter
 *  genişliği + rozet iç payı. Ölçüm değil yaklaşıklık — önemli olan iki
 *  tüketicide AYNI yaklaşıklığın kullanılması. */
export const oran = (metin) => String(metin).length * 0.62 + 0.9;

/** Bloğun dışındaki rozet için üstü, sonra altı dener; koltuk alanını kapatmaz. */
export function disEtiketYeri(bbox, width, height, engeller = [], gap = 0) {
  const cx = (bbox.x0 + bbox.x1) / 2;
  const adaylar = [bbox.y0 - height - gap, bbox.y1 + gap];
  for (const by of adaylar) {
    const kutu = { x0: cx - width / 2, x1: cx + width / 2, y0: by, y1: by + height };
    if (!engeller.some((e) => kutu.x0 < e.x1 && kutu.x1 > e.x0
      && kutu.y0 < e.y1 && kutu.y1 > e.y0)) return { cx, by, ...kutu };
  }
  return null;
}

/** Kelimelere böler. Tire BÖLÜNMEZ — "SALON-ARKA" tek addır. */
const temizMetin = (metin) => String(metin ?? "").replace(/\p{Cf}/gu, "").trim();
const kelimeler = (metin) => temizMetin(metin).split(/\s+/).filter(Boolean);

/** Son kelime. */
export const kisaAd = (metin) => kelimeler(metin).slice(-1)[0] || "";

/** Etiketlerin tamamının paylaştığı baştaki kelime sayısı. En az bir kelime
 *  HER ZAMAN kalır — yoksa geriye boş ad kalırdı. */
export function ortakOnek(etiketler) {
  const dizi = etiketler.map(kelimeler).filter((k) => k.length);
  if (dizi.length < 2) return 0;
  const enKisa = dizi.reduce((n, k) => Math.min(n, k.length), Infinity);
  let n = 0;
  while (n < enKisa - 1 && dizi.every((k) => k[n] === dizi[0][n])) n++;
  return n;
}

/**
 * Bir çizimdeki TÜM etiketleri bilen sığdırıcı üretir.
 *
 * @param {Iterable<string>} etiketler  o çizimde görünen etiketlerin tamamı
 * @param {number} taban                okunabilirlik tabanı (px)
 * @returns {(metin:string, enDunya:number, enBuyukBoy:number, pxPerDunya:number)
 *           => {metin:string, boy:number, oran:number}|null}   null = yazma
 */
export function etiketSigdirici(etiketler = [], taban = TABAN_PX) {
  const tum = [...etiketler].map(temizMetin).filter(Boolean);
  const kes = ortakOnek(tum);

  /* Bir etiketin denenecek kısaltmaları — uzundan kısaya. */
  const adaylar = (ad) => {
    const k = kelimeler(ad);
    const out = [ad];
    if (kes > 0 && k.length > kes) out.push(k.slice(kes).join(" "));
    if (k.length > 1) out.push(k[k.length - 1]);
    return [...new Set(out)];
  };

  /* Bir kısaltma ancak onu ÜRETEN tek etiket varsa yazılabilir; iki blok
     aynı kısaltmaya düşüyorsa yazmak yanlış bilgi vermektir. */
  const say = new Map();
  for (const ad of tum) {
    for (const a of adaylar(ad).slice(1)) say.set(a, (say.get(a) || 0) + 1);
  }

  return (metin, enDunya, enBuyukBoy, pxPerDunya) => {
    const ad = temizMetin(metin);
    if (!ad) return null;
    const liste = adaylar(ad);
    for (let i = 0; i < liste.length; i++) {
      const t = liste[i];
      if (i > 0 && (say.get(t) || 0) > 1) continue;      /* ayırt etmiyor */
      const o = oran(t);
      const boy = Math.min(enBuyukBoy, (enDunya * 1.02) / o);
      if (boy * pxPerDunya >= taban) return { metin: t, boy, oran: o };
    }
    return null;
  };
}
