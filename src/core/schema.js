import { absorbIds } from "./ids.js";
import { DEF_NUM } from "./labels.js";
import { legacyAtToKind } from "./geometry.js";

/* ══════════════════════════════════════════════════════════════════════════
   ŞEMA SÜRÜMLEME
   A3 öncesindeki eski sürüm-damgası mekanizmasının yerini alır. O mekanizma
   TEK bayrakla iki ayrı soruyu birden çözmeye çalışıyordu ve bu yüzden hem
   gereğinden az hem gereğinden çok koruyordu:
     1. "Örnek salonun kod tanımı değişti mi?" — cevap artık burada değil,
        src/venues/index.js + isProtectedSample'da: örnek salonlar
        localStorage'dan HİÇBİR ZAMAN geri okunmaz, dolayısıyla "sürüm
        artırmayı unuttum" diye bir hata sınıfı artık yok.
     2. "Bu KAYDIN alan biçimi güncel mi?" — cevap burada: schemaVersion +
        migrations[]. Bu, örnek/kullanıcı ayrımından bağımsız, SAF bir
        veri-biçimi meselesi.
   İkisini ayırmak eski mekanizmanın asıl hatasını (bkz. görev raporu)
   ortadan kaldırıyor: kod düzeltmesi HER ZAMAN örneğe yansır (1), kullanıcının
   kendi planı (empty, p-önekli ya da çatallanmış bir örnek) ise hiç
   atılmadan, kendi hızında göç eder (2).
   ══════════════════════════════════════════════════════════════════════════ */

export const CURRENT_SCHEMA_VERSION = 3;

/* migrations[v] planı v sürümünden v+1'e taşır. Yeni alan/varsayılan
   eklendikçe buraya bir adım daha eklenir; var olanlar asla değişmez —
   eski bir kayıt hâlâ aynı adımlardan sırayla geçmeli. */
const migrations = [
  /* 0 → 1: adoptPlan() (plan.json içe aktarma) num'u hep DEF_NUM ile
     tamamlardı; düz Store.load() böyle bir tamamlama yapmıyordu. Böylece
     eski bir kayıtta num'un SONRADAN eklenen bir alanı (ör. anchor) veya
     attr eksik kalabilir — buradaki eksik/varsayılan farkı sessizce yanlış
     numaralandırmaya yol açar. adoptPlan'daki tamamlamayla aynı mantık. */
  (plan) => ({
    ...plan,
    blocks: (plan.blocks || []).map((b) => ({
      ...b, attr: b.attr ?? "", num: { ...DEF_NUM, ...(b.num || {}) },
    })),
  }),
  /* 1 → 2: seat_kind + features ayrımı (bkz. görev raporu — Evrensel
     Mekân Yerleşim ve Koltuk Planı Değerlendirme Raporu §5.4). Eskiden
     blok varsayılanı b.attr, koltuk istisnası ov[key].at TEK bir alanda
     "hangi erişim/görüş özelliği" ile "hangi fiziksel oturma birimi"
     sorularını karıştırıyordu — ör. "wheel" hem "bu bir tekerlekli
     sandalye yeri" (tür) hem "erişilebilir" (özellik) demekti, ikisi
     ayrılamıyordu. legacyAtToKind() (core/geometry.js, TEK kaynak — bu
     göç İLE venue dosyalarının (src/venues/**, hiçbir zaman migrate()'ten
     geçmez) çalışma anı okuması AYNI tabloyu kullanır, kopyası yok) her
     eski değeri {seatKind, seatFeatures}'e çevirip EKLER.

     attr/at alanları BİLEREK SİLİNMİYOR (eklemeli göç — sütun eklenir,
     eskisi düşürülmez): resolveSeatKind (core/geometry.js) seatKind/
     seatFeatures'ı HER ZAMAN attr/at'in ÖNÜNE koyduğu için (bkz. o
     fonksiyonun önceliği) geride kalan attr/at değeri bir daha hiç
     okunmaz, tamamen zararsız. Bunu silmek daha "temiz" görünürdü ama
     migrations[0]'ın kurduğu bir garantiyi (her kayıtta attr alanı VARDIR,
     eksikse "" ile tamamlanır) bu adımdan SONRA da geçerli tutmak
     gerekiyor — o garantiye güvenen bağımsız bir tüketici var (scripts/
     validate-interactions.mjs, DOKUNMA listesinde, "eksik attr boşla
     tamamlandı" kontrolü CURRENT_SCHEMA_VERSION'a göçmüş bir kaydı
     sınıyor). O script'i silmeden/değiştirmeden bu iki gerçeği (yeni alan
     EKLENSİN, eski alan hâlâ orada dursun) birlikte sağlamanın yolu buydu. */
  (plan) => ({
    ...plan,
    blocks: (plan.blocks || []).map((b) => {
      const base = legacyAtToKind(b.attr);
      const nextOv = {};
      Object.entries(b.ov || {}).forEach(([key, o]) => {
        if (o.at === undefined) { nextOv[key] = o; return; }
        const mapped = legacyAtToKind(o.at);
        nextOv[key] = { ...o, seatKind: mapped.seatKind, seatFeatures: mapped.seatFeatures };
      });
      return { ...b, seatKind: base.seatKind, seatFeatures: base.seatFeatures, ov: nextOv };
    }),
  }),
  /* 2 → 3: seat_group (bkz. görev raporu §5.3, core/geometry.js'teki
     resolveSeatGroup/resolvePlanGroups notu — TEK kaynak, kopyası yok).
     Yeni alan PLAN seviyesinde: plan.groups, eskiden hiç yoktu — bu adım
     yalnız EKLER, eksikse boş dizi ile tamamlar (migrations[0]'daki attr
     tamamlamasıyla aynı fikir). Koltuk-seviyesi atıf (ov[key].groupId)
     için AYRI bir dolgu adımı GEREKMEZ: ov zaten sparse bir sözlük
     (rm/gap/dx/label gibi tanımsız anahtarlar normaldir), groupId'si
     olmayan bir istisna "bu koltuğun blok varsayılanından farklı bir
     grubu yok" demektir — resolveSeatGroup bunu zaten doğru yorumlar,
     geriye dönük yazılacak bir "yok" değeri değildir. kind:"table"
     bloklarının örtük grubu da bu göçü İLGİLENDİRMEZ: hiç saklanmaz,
     resolvePlanGroups tarafından her okumada yeniden türetilir. */
  (plan) => ({ ...plan, groups: plan.groups || [] }),
];

/** Bir planı, hangi sürümden gelirse gelsin (schemaVersion yoksa 0 kabul
 *  edilir) CURRENT_SCHEMA_VERSION'a taşır. */
export function migrate(plan) {
  let p = plan;
  let v = p.schemaVersion || 0;
  while (v < CURRENT_SCHEMA_VERSION) { p = migrations[v](p); v++; }
  return { ...p, schemaVersion: CURRENT_SCHEMA_VERSION };
}

/** Kaydedilecek plana GÜNCEL şema sürümünü damgalar. Store'un kendisi
 *  şema anlamından bağımsız kalsın diye (bkz. core/plan.js stripUnderlay
 *  ile aynı gerekçe) damgalama Store.save ÇAĞRISINDAN önce, çağıran
 *  tarafta yapılır. */
export const stampSchema = (plan) => ({ ...plan, schemaVersion: CURRENT_SCHEMA_VERSION });

/* ══════════════════════════════════════════════════════════════════════════
   ÖRNEK SALON GÖLGELEME KORUMASI
   İki değişmez şart (bkz. görev tanımı):
     (a) koddaki düzeltmeler kullanıcıya HER ZAMAN ulaşır,
     (b) kullanıcının kendi emeği asla sessizce kaybolmaz.
   Çözüm: "cso/gs/ulker/…" gibi örnek anahtarlar localStorage'dan ASLA
   geri okunmaz — kod her zaman kazanır (a). Kullanıcı bir örneği
   düzenlerse PlanEditor bunu ayrı bir kullanıcı anahtarına ÇATALLAR
   (forkSample) ve o anahtar altında normal bir kullanıcı planı gibi
   yaşamaya devam eder (b) — bkz. PlanEditor.jsx'teki otomatik kayıt
   efekti ve raporundaki gerekçe.
   "empty" örnek DEĞİL: kullanıcının kendi planlarının (newPlan/duplicate)
   başlangıç şablonu, o yüzden korumaya girmez — eski mekanizmanın örnek-
   anahtar listesinde de bu istisna vardı.
   ══════════════════════════════════════════════════════════════════════════ */

export function isProtectedSample(key, builtins) {
  return key !== "empty" && Object.prototype.hasOwnProperty.call(builtins, key);
}

/** Kullanıcı salt-okunur bir örneği düzenlediğinde çağrılır: aynı içeriği
 *  (bloklar/şekiller, id'ler DAHİL) yeni bir kullanıcı anahtarına kopyalar.
 *  Id'ler bilinçli olarak DEĞİŞMEZ — çatallama, kullanıcı hâlâ düzenlerken
 *  otomatik kayıt sırasında arka planda olur; id değişseydi o anki
 *  seçim/sürükleme referansı kopardı (bkz. PlanEditor.jsx). */
export function forkSample(plan, key) {
  return { ...plan, key, name: `${plan.name} (düzenlendi)`, versions: [], published: null };
}

/** Store'dan okunan [anahtar, plan] çiftlerini süzer: örnek anahtarları
 *  YOK SAYAR (kod kazanır), geri kalanını göç ettirip id sayacını ileri
 *  sarar. React/Store'dan bağımsız SAF fonksiyon — DOM/mount gerekmeden
 *  test edilebilir (bkz. scripts/validate-interactions.mjs). */
export function mergeSavedVenues(builtins, entries) {
  const loaded = {};
  for (const [k, p] of entries) {
    if (!p || !Array.isArray(p.blocks)) continue;
    if (isProtectedSample(k, builtins)) continue;
    loaded[k] = absorbIds(migrate(p));
  }
  return loaded;
}
