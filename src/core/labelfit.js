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

/** Yazının kapladığı genişliğin yazı boyuna oranı: ortalama karakter
 *  genişliği + rozet iç payı. Ölçüm değil yaklaşıklık — önemli olan iki
 *  tüketicide AYNI yaklaşıklığın kullanılması. */
export const oran = (metin) => String(metin).length * 0.62 + 0.9;

/** Kelimelere böler. Tire BÖLÜNMEZ — "SALON-ARKA" tek addır. */
const kelimeler = (metin) => String(metin ?? "").trim().split(/\s+/).filter(Boolean);

/** Son kelime. */
export const kisaAd = (metin) => kelimeler(metin).slice(-1)[0] || "";

/** Etiketlerin tamamının paylaştığı baştaki kelime sayısı. En az bir kelime
 *  HER ZAMAN kalır — yoksa geriye boş ad kalırdı. */
export function ortakOnek(etiketler) {
  const dizi = etiketler.map(kelimeler).filter((k) => k.length);
  if (dizi.length < 2) return 0;
  const enKisa = Math.min(...dizi.map((k) => k.length));
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
  const tum = [...etiketler].filter(Boolean).map(String);
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
    const ad = String(metin ?? "");
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
