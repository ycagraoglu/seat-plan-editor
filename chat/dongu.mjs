import Anthropic from "@anthropic-ai/sdk";
import { baglan, araclariCevir, aracCagir, INSTRUCTIONS } from "./kopru.mjs";

/* ══════════════════════════════════════════════════════════════════════════
   SOHBET DÖNGÜSÜ — model sunucuda, araçlar süreç-içi

   Operatör panele "Bursa Tayyare'yi çiz" yazıyor; model araçları çağırarak
   çiziyor; her çağrı canlı görünüme yansıdığı için operatör tuvalde
   oluşumu izliyor.

   TOOL RUNNER DEĞİL, ELLE DÖNGÜ. SDK'nın tool_runner'ı araçların dekoratörle
   tanımlanmasını bekliyor; bizimkiler MCP'den geliyor ve tanımlarının tek
   kaynakta kalması bu işin bel kemiği (bkz. kopru.mjs). Elle döngü o köprüyü
   mümkün kılan şey.

   ARAÇLAR SIRAYLA ÇALIŞIYOR. Anthropic aynı yanıtta birden çok tool_use
   gönderebiliyor ve genel tavsiye onları eşzamanlı yürütmek.

   ÖNCE "eşzamanlı çalıştırmak veri yarışı doğurur" diye yazmıştım — ÖLÇTÜM,
   DOĞRU DEĞİL: session.mutate baştan sona senkron ve JS tek iş parçacıklı,
   iki çağrı mutate'in içinde birbirine giremiyor. Promise.all ile bağımlı
   iki çağrıyı (add_block + onu güncelleyen update_block) denedim, ikisi de
   doğru sırada işlendi.

   O halde sıra neden korunuyor: (1) doğru sıra, taşıma katmanının işleme
   düzenine bağlı kalmasın diye — o bir uygulama ayrıntısı, sözleşme değil;
   (2) adım günlüğü operatöre sırayla akıyor, karışık sıra okunmaz bir
   günlük demek. Yani bu bir DETERMİNİZM tercihi, bir hata düzeltmesi değil.
   ══════════════════════════════════════════════════════════════════════════ */

export const MODEL = "claude-opus-5";

/* Bir turda izin verilen araç çağrısı. Kaçak bir döngü bir biletleme
   panelinde hem para hem çöp plan demek; sınır aşılınca durup SEBEBİNİ
   söylüyoruz — sessizce kesmiyoruz. */
export const ARAC_SINIRI = 40;

/** Sohbet oturumu: kendi MCP sunucusu, kendi planı, kendi geçmişi.
 *  Konuşma başına bir tane — iki operatör birbirinin planını ezmiyor. */
export async function oturumAc({ anthropic, model = MODEL } = {}) {
  const k = await baglan();
  const { tools } = await k.client.listTools();
  return {
    ...k,
    anthropic: anthropic || new Anthropic(),
    model,
    araclar: araclariCevir(tools),
    mesajlar: [],
  };
}

const metinBirlestir = (icerik) => icerik
  .filter((c) => c.type === "text").map((c) => c.text).join("\n").trim();

async function modelCagir(o) {
  /* stream + finalMessage: araç döngüsü dakikalarca sürebiliyor ve
     akışsız istek HTTP zaman aşımına takılır. Tek tek olayları
     dinlemiyoruz — ilerleme zaten araç adımlarından görünüyor. */
  const akis = await o.anthropic.messages.stream({
    model: o.model,
    max_tokens: 32000,
    system: INSTRUCTIONS,
    messages: o.mesajlar,
    tools: o.araclar,
    thinking: { type: "adaptive" },
    output_config: { effort: "high" },
  });
  return akis.finalMessage();
}

/** Bir tur: operatörün mesajı → (araçlar) → asistanın cevabı.
 *
 *  onOlay her araç çağrısından ÖNCE çağrılıyor; panel ilerlemeyi oradan
 *  yazıyor. Dönen değer turun sonucu.
 */
export async function tur(o, kullaniciMesaji, onOlay = () => {}) {
  o.mesajlar.push({ role: "user", content: kullaniciMesaji });
  let sayac = 0;

  for (;;) {
    const yanit = await modelCagir(o);
    /* content'in TAMAMI geri konuyor (yalnız metin değil): düşünme ve
       tool_use blokları sonraki turda modele lazım. */
    o.mesajlar.push({ role: "assistant", content: yanit.content });

    if (yanit.stop_reason === "refusal") {
      return { metin: "Model bu isteği yanıtlamayı reddetti.",
        durum: "red", ayrinti: yanit.stop_details?.category || null, arac: sayac };
    }
    if (yanit.stop_reason !== "tool_use") {
      return { metin: metinBirlestir(yanit.content), durum: "bitti", arac: sayac };
    }

    const cagrilar = yanit.content.filter((c) => c.type === "tool_use");
    if (sayac + cagrilar.length > ARAC_SINIRI) {
      /* Modele de söylüyoruz ki bir sonraki turda özet verebilsin. */
      o.mesajlar.push({ role: "user", content: [{ type: "text",
        text: `Araç sınırına ulaşıldı (${ARAC_SINIRI}). Durduruldu.` }] });
      return { metin: `Araç çağrısı sınırına ulaşıldı (${ARAC_SINIRI}) — çizim`
        + ` yarıda durduruldu. Plana bakıp devam etmemi isteyebilirsin.`,
        durum: "sinir", arac: sayac };
    }

    const sonuclar = [];
    for (const c of cagrilar) {                 /* sırayla — gerekçe dosya başında */
      onOlay({ ad: c.name, girdi: c.input });
      sonuclar.push(await aracCagir(o.client, c.id, c.name, c.input));
      sayac++;
    }
    /* Bütün tool_result'lar TEK user mesajında dönmeli; bölmek modeli
       paralel çağrı yapmamaya alıştırıyor. */
    o.mesajlar.push({ role: "user", content: sonuclar });
  }
}
