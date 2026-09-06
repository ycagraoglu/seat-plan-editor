import { oturumAc, tur } from "./dongu.mjs";

/* ══════════════════════════════════════════════════════════════════════════
   KONUŞMALAR — sunucu belleğinde, konuşma başına bir oturum

   Panelin sohbet kutusu buraya konuşuyor. Her konuşmanın KENDİ MCP oturumu
   var (kendi planı, kendi geçmişi), yani iki operatör birbirinin çizimini
   ezmiyor.

   AKIŞ NEDEN BELLEKTE, VERİTABANINDA DEĞİL: bir sohbet turu dakikalar sürüyor
   ve saniyede bir okunuyor; her okumada diske gitmenin karşılığı yok. Kalıcı
   olması gereken şey PLAN, o zaten editor_plans'a yazılıyor (canlı görünüm
   yoluyla). Sohbet dökümü kaybolursa çizim kaybolmuyor.

   TUR ARKA PLANDA KOŞUYOR: POST hemen dönüyor, panel saniyede bir okuyor.
   Uzun bir turda tarayıcı bir HTTP isteğini dakikalarca açık tutmuyor ve
   sunucuya ilk durumlu bağlantı girmiyor — canlı görünümün kullandığı
   yoklama kalıbının aynısı.
   ══════════════════════════════════════════════════════════════════════════ */

const konusmalar = new Map();
const OMUR_MS = 30 * 60 * 1000;      /* boşta kalan konuşma bu süre sonra düşer */
const AKIS_SINIRI = 400;             /* bellekte tutulan satır */

export const sohbetAcikMi = () => !!process.env.ANTHROPIC_API_KEY;

const suzgec = () => {
  const simdi = Date.now();
  for (const [id, k] of konusmalar) {
    if (simdi - k.sonKullanim > OMUR_MS) { k.oturum?.kapat?.(); konusmalar.delete(id); }
  }
};

const ekle = (k, satir) => {
  k.akis.push({ t: new Date().toISOString(), ...satir });
  if (k.akis.length > AKIS_SINIRI) k.akis.splice(0, k.akis.length - AKIS_SINIRI);
};

async function konusma(id) {
  suzgec();
  let k = konusmalar.get(id);
  if (!k) {
    k = { oturum: await oturumAc(), akis: [], calisiyor: false, sonKullanim: Date.now() };
    konusmalar.set(id, k);
  }
  k.sonKullanim = Date.now();
  return k;
}

/** Turu BAŞLATIR ve hemen döner. Sonuç akışa düşer. */
export async function mesajGonder(id, mesaj) {
  if (!sohbetAcikMi()) throw new Error("Sohbet kapalı: ANTHROPIC_API_KEY tanımlı değil.");
  const k = await konusma(id);
  if (k.calisiyor) return { kabul: false, sebep: "Önceki tur sürüyor." };

  k.calisiyor = true;
  ekle(k, { rol: "kullanici", metin: mesaj });

  /* Bilerek beklenmiyor. Hata YUTULMUYOR — akışa düşüyor, yoksa operatör
     sonsuza dek "çalışıyor" görür ve neden durduğunu hiç öğrenemez. */
  tur(k.oturum, mesaj, (olay) => ekle(k, { rol: "arac", metin: olay.ad }))
    .then((r) => {
      if (r.durum === "bitti") ekle(k, { rol: "asistan", metin: r.metin });
      else ekle(k, { rol: "uyari", metin: r.metin, durum: r.durum });
    })
    .catch((e) => ekle(k, { rol: "hata", metin: String(e?.message || e) }))
    .finally(() => { k.calisiyor = false; k.sonKullanim = Date.now(); });

  return { kabul: true };
}

/** Panelin saniyede bir okuduğu şey. */
export async function akisOku(id) {
  const k = konusmalar.get(id);
  if (!k) return { calisiyor: false, akis: [] };
  k.sonKullanim = Date.now();
  return { calisiyor: k.calisiyor, akis: k.akis };
}

/** Testlerin ve kapanışın kullandığı temizlik. */
export async function hepsiniKapat() {
  for (const [id, k] of konusmalar) { await k.oturum?.kapat?.(); konusmalar.delete(id); }
}
