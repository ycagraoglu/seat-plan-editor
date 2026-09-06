import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { InMemoryTransport } from "@modelcontextprotocol/sdk/inMemory.js";
import { createMcpServer, INSTRUCTIONS } from "../mcp/server.mjs";

/* ══════════════════════════════════════════════════════════════════════════
   KÖPRÜ — MCP araçları ↔ sohbet katmanı

   Panelin sohbet kutusundaki model SUNUCUDA çalışıyor ve editörün araçlarını
   çağırıyor. Bu dosyanın tek işi MCP'ye bağlanmak ve sonucu NÖTR bir biçimde
   döndürmek.

   NEDEN KÖPRÜ: 29 aracın şeması, açıklaması ve doğrulaması mcp/tools/**
   içinde duruyor ve soğuk LLM testleriyle defalarca düzeltildi. Sohbet için
   ikinci bir tanım yazmak o düzeltmelerin bir kopyasını daha bakmak demekti.
   MCP sunucusuna SÜREÇ-İÇİ bağlanıp listTools() ile şemayı OKUYORUZ.

   NEDEN NÖTR: üç sağlayıcı (Anthropic, OpenAI, Gemini) araçları farklı
   biçimde istiyor ve sonucu farklı biçimde bekliyor. Burası hiçbirini
   bilmiyor — çeviri chat/saglayici/*.mjs'in işi. Böylece dördüncü bir
   sağlayıcı eklemek tek dosya demek.
   ══════════════════════════════════════════════════════════════════════════ */

export { INSTRUCTIONS };

/** Süreç-içi MCP istemcisi. mcp/cli.mjs ile aynı kalıp — ağ yok, taşıma yok. */
export async function baglan() {
  const { server, session } = createMcpServer();
  const [a, b] = InMemoryTransport.createLinkedPair();
  const client = new Client({ name: "panel-sohbet", version: "0" });
  await Promise.all([server.connect(b), client.connect(a)]);
  return {
    client, server, session,
    kapat: () => Promise.all([client.close(), server.close()]).catch(() => {}),
  };
}

/* Bir araç sonucundaki görselin üst sınırı. render 2000px genişlikte
   ~100 KB base64 üretiyor; bu sınır kaçak bir devi kesmek için. */
const GORSEL_SINIR = 4 * 1024 * 1024;

/** MCP çağrı sonucu → NÖTR sonuç.
 *
 *  { id, ad, metin, gorseller:[{data,mimeType}], hata }
 *
 *  Görsel METİNDEN AYRI duruyor çünkü üç sağlayıcının ikisinde araç yanıtı
 *  görsel taşıyamıyor — oralarda görsel AYRI BİR TUR olarak gönderiliyor.
 *  Bu ayrımı burada yapmak, her adaptörün aynı kararı yeniden vermesini
 *  önlüyor.
 */
export async function aracCagir(client, id, ad, girdi) {
  const nötr = (metin, gorseller = [], hata = false) => ({ id, ad, metin, gorseller, hata });
  try {
    const r = await client.callTool({ name: ad, arguments: girdi || {} });
    const yazi = [];
    const gorseller = [];
    for (const c of r.content || []) {
      if (c.type === "text") yazi.push(c.text);
      else if (c.type === "image" && c.data) {
        if (c.data.length > GORSEL_SINIR) yazi.push("[görsel çok büyük, atlandı]");
        else gorseller.push({ data: c.data, mimeType: c.mimeType || "image/png" });
      }
      /* Bilinmeyen tür SESSİZCE DÜŞMÜYOR: model sonucu eksik aldığını
         bilmeli, yoksa olmayan bir çıktıya göre karar verir. */
      else yazi.push(`[desteklenmeyen içerik: ${c.type}]`);
    }
    return nötr(yazi.join("\n") || "(araç boş sonuç döndürdü)", gorseller, !!r.isError);
  } catch (e) {
    /* Hata YUTULMUYOR — modele veriliyor ki kendini düzeltsin. Kural
       motorunun hedef değerli mesajları da bu yoldan geçiyor. */
    return nötr(String(e?.message || e), [], true);
  }
}
