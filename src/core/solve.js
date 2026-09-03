/* ═══════════════════════════  KADEME ÇÖZÜCÜ  ═══════════════════════════
   Salon dosyalarında r0: 2150, W: 4750, Rc: 2800 gibi sayılar ELLE
   ayarlanıyordu — hem de görünmez bir sabite karşı: blok tabanı koltuklardan
   footprintPad(b) kadar (bkz. geometry.js, tipik ~100-125cm) dışarı taşıyor.
   Bu görünmezlik iki gerçek çakışmaya yol açtı (AKM 1./2. Balkon, Ülker Alt
   Tribün/Loca — bkz. commit cb64478). Her düzeltmede yarıçap elle açıldı,
   kapasite fırladı, satır sayısı elle geri çekildi — sonucun yazılması,
   niyetin değil.

   Bu modül tersini yapar: kademe NİYETTEN hesaplanır (satır sayısı +
   kademeler arası açıklık) → r0/W/H SONUÇTUR. footprintPad() üzerinden
   AYNI taban-payı formülünü kullanır (geometry.js'ten import, KOPYA değil)
   — yani "kademeler çakışamaz" artık bir kural değil, bir garanti: bir
   kademenin satır sayısı değişince sonraki kademe otomatik dışarı kayar,
   aradaki açıklık (gapFromPrev) hep aynı kalır.

   İki kademe biçimi var:
     · solveRadialTiers — radyal amfi (AKM, HARBİYE): merkezden yarıçapla
       (r0) büyüyen fan bloklar.
     · solveBowlTiers   — dikdörtgen kase (GS, ÜLKER): bowl()'un ürettiği
       yuvarlak köşeli tabanlar; W/H düz kenarların merkeze uzaklığı, Rc
       köşe yarıçapı.

   Rc SOLVE EDİLMEZ, olduğu gibi geçer. Sebep taklit değil ölçüm: cb64478
   Ülker'deki gerçek çakışmayı W/H büyüterek düzeltti (4100/3250→4300/3450,
   4450/3600→4750/3900), Rc'ye HİÇ dokunmadı. Köşenin kendi merkezi her
   kademede kaydığından (along/aside kademeden kademeye bağımsız birer
   tasarım seçimi) basit "Rc farkı" çıkarımı yanlış işaret verir — ölçünce
   (bkz. görev raporu) asıl dar boğaz hep düz kenarlarda (W/H) çıkıyor, köşe
   çoğu zaman zaten bol paylı. O yüzden köşe yuvarlaklığı burada bir GİRDİ
   (tasarım kararı), açıklık hesabına hiç girmiyor. */
import { footprintPad } from "./geometry.js";

/** Radyal kademe zinciri. `tiers[0]` kendi `r0`'ını verir (zincirden önce
 *  hiçbir taban yok, açıklık hesaplanacak bir "önceki" yok). Sonraki her
 *  kademe `gapFromPrev` verir: bir öncekinin taban payı bitince BU
 *  kademenin taban payı başlayana kadar bırakılan boşluk (cm).
 *  Her elemana çözülen `r0` eklenmiş halde, GİRDİYLE AYNI SIRADA döner. */
export function solveRadialTiers(tiers) {
  let prevOuter = 0, prevPad = 0;
  return tiers.map((t, i) => {
    const pad = footprintPad(t);
    let r0;
    if (i === 0) {
      if (t.r0 == null) throw new Error(`solveRadialTiers: ilk kademe ("${t.id}") r0 vermeli`);
      r0 = t.r0;
    } else {
      if (t.gapFromPrev == null) throw new Error(`solveRadialTiers: "${t.id}" gapFromPrev vermeli`);
      r0 = prevOuter + prevPad + pad + t.gapFromPrev;
    }
    prevOuter = r0 + (t.rows - 1) * t.rowGap;
    prevPad = pad;
    return { ...t, r0 };
  });
}

/** Dikdörtgen-kase kademe zinciri. `tiers[0]` kendi `W`/`H`'ini verir.
 *  Sonraki her kademe `gapFromPrev` verir — W VE H'ye AYNI ANDA uygulanır
 *  (ölçünce ikisi hep eşit çıkıyor, bkz. dosya başı ve görev raporu: kase
 *  merkezden dışa her yönde eşit büyüyor). `Rc` girdide olduğu gibi kalır,
 *  bu fonksiyon ona dokunmaz — çıktıya da aynen kopyalanır. */
export function solveBowlTiers(tiers) {
  let prevOuterW = 0, prevOuterH = 0, prevPad = 0;
  return tiers.map((t, i) => {
    const pad = footprintPad(t);
    let W, H;
    if (i === 0) {
      if (t.W == null || t.H == null) throw new Error(`solveBowlTiers: ilk kademe ("${t.id}") W ve H vermeli`);
      W = t.W; H = t.H;
    } else {
      if (t.gapFromPrev == null) throw new Error(`solveBowlTiers: "${t.id}" gapFromPrev vermeli`);
      W = prevOuterW + prevPad + pad + t.gapFromPrev;
      H = prevOuterH + prevPad + pad + t.gapFromPrev;
    }
    prevOuterW = W + (t.rows - 1) * t.rowGap;
    prevOuterH = H + (t.rows - 1) * t.rowGap;
    prevPad = pad;
    return { ...t, W, H };
  });
}
