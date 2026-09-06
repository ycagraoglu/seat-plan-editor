import { stripUnderlay } from "../src/core/plan.js";

/* ══════════════════════════════════════════════════════════════════════════
   CANLI GÖRÜNÜM — çizileni editöre yansıtmak

   Operatör iki ekran açıyor: birinde sohbet, birinde editör. LLM çizerken
   blokların editörde belirmesini istiyor (Blender'daki his). Bu dosya o
   yansıtmayı yapıyor: her değişiklikten sonra planı sunucuya yazıyor,
   editör de saniyede bir sorup güncelliyor.

   ÜÇ KARAR, üçü de bilinçli:

   1. TAMAMEN İSTEĞE BAĞLI. SEAT_EDITOR_API yoksa bu dosya hiçbir şey
      yapmıyor — ağ trafiği sıfır, davranış eskisiyle birebir aynı.
      Sunucusuz akış (export_plan → dosya) bozulmadı.

   2. BEKLEMİYORUZ ve AĞ HATASINI YUTUYORUZ. mutate() senkron kalıyor;
      yazma arka planda gidiyor. Sunucu kapalıysa çizim DEVAM ETMELİ:
      canlı görünüm bir GÖRÜNTÜLEME özelliği, onun yokluğu yüzünden
      add_block'un patlaması saçma olurdu. Yutulan tek şey ağ hatası —
      409 (operatör devraldı) yutulmuyor, oturuma bildiriliyor.

      Bedeli: KES'ten sonra LLM bir çağrı geç öğreniyor. O çağrının
      yazması da sunucuda 409 yediği için operatörün tuvaline hiç
      dokunulmuyor; yalnız haber bir tur gecikiyor.

   3. ANAHTAR AD ALANINA ALINIYOR ("ai-" ön eki). open_sample planı
      yerleşik salonun anahtarıyla tutuyor (gs, fener…); o anahtara canlı
      yazmak editörün "örnek salon değişmiş" çatallamasını tetikler ve
      yeniden yüklemede mergeSavedVenues onu SESSİZCE atar — yapay zekânın
      bütün işi kaybolurdu. Ön ek bunu kökten engelliyor; sunucu da ayrıca
      denetliyor.
   ══════════════════════════════════════════════════════════════════════════ */

export const ONEK = "ai-";

/** Canlı görünümde kullanılacak anahtar. Ön ek zaten varsa iki kez konmaz. */
export const canliAnahtar = (key) => {
  const k = String(key || "plan");
  return k.startsWith(ONEK) ? k : ONEK + k;
};

/** Planı canlı görünüme yansıtır. Söz DÖNDÜRMEZ — çağıran beklemiyor.
 *  409 gelirse onKesildi() çağrılır; başka hiçbir şey dışarı sızmaz. */
/* Son yazmanın sözü. mutate() bunu BEKLEMİYOR (bkz. yukarıda), ama her
   çağrıda YENİ BİR SÜREÇ kuran mcp/cli.mjs bekliyor: orada oturum dosyaya
   yazılıp süreç ölüyor, dolayısıyla "kesildim" bilgisi uçuşta kalırsa
   sonsuza dek kaybolur ve LLM boşluğa çizmeye devam eder — sunucu her
   yazmayı reddederken kendisi "eklendi" görür. Ölçtüm, öyle oluyordu. */
let bekleyen = null;
export const bekle = () => bekleyen || Promise.resolve();

export function canliYaz(plan, adim, yeni, onKesildi) {
  const taban = process.env.SEAT_EDITOR_API;
  if (!taban || !plan) return;
  const govde = JSON.stringify({
    plan: { ...stripUnderlay(plan), key: canliAnahtar(plan.key) },
    /* Operatörün paneline düşecek tek satır. Planla BİRLİKTE gidiyor ki
       "çizim ilerledi ama günlük geride kaldı" diye bir tutarsızlık
       olmasın — ikisi tek yazmada. */
    adim,
    /* YENİ ÇİZİM bildirimi: sunucu iptali anahtara bağlıyor, dolayısıyla
       KES'ten sonra AYNI adla yeniden çizmek de reddedilirdi. Bu bayrak
       "bu, devam değil, baştan başlama" diyor. */
    yeni: !!yeni,
  });
  bekleyen = fetch(`${taban.replace(/\/+$/, "")}/live`, {
    method: "PUT", headers: { "content-type": "application/json" }, body: govde,
  })
    .then((r) => { if (r.status === 409 && onKesildi) onKesildi(); })
    .catch(() => { /* sunucu kapalı/erişilemez — çizim devam etmeli */ });
}
