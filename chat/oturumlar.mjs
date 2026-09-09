import { oturumAc, tur } from "./dongu.mjs";
import { acikMi, sec } from "./saglayici/index.mjs";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { tmpdir } from "node:os";

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
const GORSEL_MIME = { ".png": "image/png", ".jpg": "image/jpeg", ".jpeg": "image/jpeg",
  ".webp": "image/webp", ".gif": "image/gif" };

/* Kaynak ilk model kararında DOĞRUDAN görülsün. Yalnız kendi upload
   klasörümüz okunur; sohbet metni keyfî bir sunucu dosyasını açamaz. */
const kaynakGorselleri = async (mesaj) => {
  const eslesme = String(mesaj).match(/\n\nKaynak görsel: ([^\n]+)\n/);
  if (!eslesme) return [];
  const kok = path.resolve(tmpdir(), "seat-editor-chat") + path.sep;
  const dosya = path.resolve(eslesme[1]);
  const mimeType = GORSEL_MIME[path.extname(dosya).toLowerCase()];
  if (!dosya.startsWith(kok) || !mimeType) return [];
  try {
    const buf = await readFile(dosya);
    return buf.length <= 4 * 1024 * 1024 ? [{ mimeType, data: buf.toString("base64") }] : [];
  } catch { return []; }
};

/* Üç sağlayıcıdan HANGİSİ varsa sohbet açık. Panel yalnız bu cevabı
   görüyor — anahtarın kendisi tarayıcıya hiç gitmiyor. */
export const sohbetAcikMi = () => acikMi();
export const sohbetBilgi = () => {
  try {
    const s = sec();
    return s ? { acik: true, saglayici: s.ad, model: s.VARSAYILAN_MODEL } : { acik: false };
  } catch { return { acik: false }; }
};

/* Ham SDK hatası operatöre gösterilecek metin değil:
   `401 {"type":"error","error":{"type":"authentication_error",...}}`
   Onun okuması gereken şey ne olduğu ve ne yapacağı. Tanımadığımız hatayı
   YUTMUYORUZ — kısaltıp geçiriyoruz ki en azından bir ipucu kalsın. */
const anlasilirHata = (e) => {
  const m = String(e?.message || e);
  if (/authentication|invalid x-api-key|401/i.test(m)) {
    return "Yapay zekâ servisine bağlanılamadı: API anahtarı geçersiz."
      + " Sunucudaki ANTHROPIC_API_KEY doğru mu?";
  }
  if (/rate.?limit|429/i.test(m)) return "Servis şu an yoğun (kota). Biraz sonra tekrar dene.";
  if (/overloaded|529|5\d\d/i.test(m)) return "Yapay zekâ servisi geçici olarak yanıt vermiyor. Tekrar dene.";
  if (/ECONNREFUSED|fetch failed|network/i.test(m)) return "Ağ hatası: servise ulaşılamadı.";
  return `Beklenmeyen hata: ${m.slice(0, 200)}`;
};

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

const konusmaAnahtari = (tenant, id) => JSON.stringify([String(tenant), String(id)]);

async function konusma(tenant, id, mcpContext = null) {
  suzgec();
  const anahtar = konusmaAnahtari(tenant, id);
  let k = konusmalar.get(anahtar);
  if (!k) {
    k = { oturum: await oturumAc({ mcpContext }), akis: [], calisiyor: false, sonKullanim: Date.now() };
    konusmalar.set(anahtar, k);
  } else if (mcpContext) k.oturum.session.setContext(mcpContext);
  k.sonKullanim = Date.now();
  return k;
}

/** Turu BAŞLATIR ve hemen döner. Sonuç akışa düşer. */
export async function mesajGonder(tenant, id, mesaj, mcpContext = null) {
  if (!sohbetAcikMi()) throw new Error("Sohbet kapalı: hiçbir sağlayıcı anahtarı tanımlı değil.");
  const k = await konusma(tenant, id, mcpContext);
  if (k.calisiyor) return { kabul: false, sebep: "Önceki tur sürüyor." };

  k.calisiyor = true;
  ekle(k, { rol: "kullanici", metin: mesaj });
  const gorseller = await kaynakGorselleri(mesaj);

  /* Bilerek beklenmiyor. Hata YUTULMUYOR — akışa düşüyor, yoksa operatör
     sonsuza dek "çalışıyor" görür ve neden durduğunu hiç öğrenemez. */
  tur(k.oturum, mesaj, (olay) => ekle(k, { rol: "arac", metin: olay.ad }), gorseller)
    .then((r) => {
      if (r.durum === "bitti") ekle(k, { rol: "asistan", metin: r.metin });
      else ekle(k, { rol: "uyari", metin: r.metin, durum: r.durum });
    })
    .catch((e) => ekle(k, { rol: "hata", metin: anlasilirHata(e) }))
    .finally(() => { k.calisiyor = false; k.sonKullanim = Date.now(); });

  return { kabul: true };
}

/** Panelin saniyede bir okuduğu şey. */
export async function akisOku(tenant, id) {
  const k = konusmalar.get(konusmaAnahtari(tenant, id));
  if (!k) return { calisiyor: false, akis: [] };
  k.sonKullanim = Date.now();
  return { calisiyor: k.calisiyor, akis: k.akis };
}

export async function sohbetTemizle(tenant, id) {
  const anahtar = konusmaAnahtari(tenant, id);
  const k = konusmalar.get(anahtar);
  if (!k) return true;
  if (k.calisiyor) return false;
  await k.oturum?.kapat?.();
  konusmalar.delete(anahtar);
  return true;
}

/** Testlerin ve kapanışın kullandığı temizlik. */
export async function hepsiniKapat() {
  for (const [id, k] of konusmalar) { await k.oturum?.kapat?.(); konusmalar.delete(id); }
}
