import { baglan, aracCagir, INSTRUCTIONS } from "./kopru.mjs";
import { sec } from "./saglayici/index.mjs";

/* ══════════════════════════════════════════════════════════════════════════
   SOHBET DÖNGÜSÜ — sağlayıcıdan BAĞIMSIZ

   Operatör panele "Bursa Tayyare'yi çiz" yazıyor; model araçları çağırarak
   çiziyor; her çağrı canlı görünüme yansıdığı için operatör tuvalde
   oluşumu izliyor.

   Bu dosya hangi sağlayıcının kullanıldığını BİLMİYOR. Anthropic, OpenAI ve
   Gemini'nin araç biçimleri, mesaj geçmişi şekilleri ve görsel taşıma
   yetenekleri farklı — hepsi chat/saglayici/*.mjs'te. Dördüncü bir
   sağlayıcı eklemek buraya dokunmayı gerektirmiyor.

   HAZIR RUNNER DEĞİL, ELLE DÖNGÜ. Her SDK'nın kendi araç koşucusu var ama
   hepsi araçların o SDK'nın biçiminde tanımlanmasını bekliyor; bizimkiler
   MCP'den geliyor ve tek kaynakta kalmaları bu işin bel kemiği.

   ARAÇLAR SIRAYLA ÇALIŞIYOR. Önce "eşzamanlı çalıştırmak veri yarışı
   doğurur" diye yazmıştım — ÖLÇTÜM, DOĞRU DEĞİL: session.mutate baştan sona
   senkron ve JS tek iş parçacıklı. Sıra yine korunuyor ama gerçek
   gerekçeyle: (1) doğruluk taşıma katmanının işleme düzenine bağlı
   kalmasın, (2) adım günlüğü operatöre sırayla aksın. Determinizm tercihi.

   GÖRSEL: render'ın çıktısı üç sağlayıcının yalnız birinde (Anthropic)
   araç yanıtının İÇİNDE taşınabiliyor. Diğer ikisinde AYRI BİR TUR olarak
   gönderiliyor — bir mesaj fazla, ama "çiz → kendi çizimine bak → düzelt"
   döngüsü üçünde de çalışıyor. Bu kararı adaptörler değil döngü veriyor ki
   her adaptör aynı şeyi yeniden düşünmesin.
   ══════════════════════════════════════════════════════════════════════════ */

/* Bir turda izin verilen araç çağrısı. Kaçak bir döngü bir biletleme
   panelinde hem para hem çöp plan demek; sınır aşılınca durup SEBEBİNİ
   söylüyoruz — sessizce kesmiyoruz. */
export const ARAC_SINIRI = 40;

/** Sohbet oturumu: kendi MCP sunucusu, kendi planı, kendi geçmişi.
 *  Konuşma başına bir tane — iki operatör birbirinin planını ezmiyor. */
export async function oturumAc({ saglayici, istemci, model } = {}) {
  const s = saglayici || sec();
  if (!s) {
    throw new Error("Sohbet kapalı: hiçbir sağlayıcı anahtarı tanımlı değil"
      + " (ANTHROPIC_API_KEY, OPENAI_API_KEY ya da GEMINI_API_KEY).");
  }
  const k = await baglan();
  const { tools } = await k.client.listTools();
  return {
    ...k, s,
    istemci: istemci || s.istemciKur(),
    model: model || s.VARSAYILAN_MODEL,
    araclar: s.araclariCevir(tools),
    mesajlar: [],
  };
}

/** Bir tur: operatörün mesajı → (araçlar) → asistanın cevabı.
 *  onOlay her araç çağrısından ÖNCE çağrılıyor; panel ilerlemeyi oradan yazıyor. */
export async function tur(o, kullaniciMesaji, onOlay = () => {}) {
  o.s.kullaniciEkle(o.mesajlar, kullaniciMesaji);
  let sayac = 0;

  for (;;) {
    const y = await o.s.cagir(o.istemci, {
      model: o.model, system: INSTRUCTIONS, mesajlar: o.mesajlar, araclar: o.araclar,
    });
    /* Ham yanıt geri konuyor: düşünme ve araç blokları sonraki turda lazım. */
    o.s.asistanEkle(o.mesajlar, y.ham);

    if (y.dur === "red") {
      return { metin: y.metin || "Model bu isteği yanıtlamayı reddetti.",
        durum: "red", ayrinti: y.sebep || null, arac: sayac };
    }
    if (y.dur === "bitti") return { metin: y.metin, durum: "bitti", arac: sayac };

    if (sayac + y.cagrilar.length > ARAC_SINIRI) {
      o.s.kullaniciEkle(o.mesajlar, `Araç sınırına ulaşıldı (${ARAC_SINIRI}). Durduruldu.`);
      return { metin: `Araç çağrısı sınırına ulaşıldı (${ARAC_SINIRI}) — çizim`
        + ` yarıda durduruldu. Plana bakıp devam etmemi isteyebilirsin.`,
        durum: "sinir", arac: sayac };
    }

    const sonuclar = [];
    for (const c of y.cagrilar) {              /* sırayla — gerekçe dosya başında */
      onOlay({ ad: c.ad, girdi: c.girdi });
      sonuclar.push(await aracCagir(o.client, c.id, c.ad, c.girdi));
      sayac++;
    }
    o.s.sonucEkle(o.mesajlar, sonuclar);
    /* Görselleri taşıyamayan sağlayıcılarda ayrı tur; Anthropic'te no-op. */
    o.s.gorselEkle(o.mesajlar, sonuclar.flatMap((s) => s.gorseller));
  }
}
