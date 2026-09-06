import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { InMemoryTransport } from "@modelcontextprotocol/sdk/inMemory.js";
import { createMcpServer, INSTRUCTIONS } from "../mcp/server.mjs";

/* ══════════════════════════════════════════════════════════════════════════
   KÖPRÜ — MCP araçları ↔ Anthropic Messages API

   Panelin sohbet kutusundaki model SUNUCUDA çalışıyor ve editörün araçlarını
   çağırıyor. Bu dosyanın TEK işi çeviri; burada alan bilgisi YOK.

   NEDEN KÖPRÜ, NEDEN İKİNCİ BİR ARAÇ TANIMI DEĞİL:
   27 aracın şeması, açıklaması ve doğrulaması mcp/tools/** içinde duruyor ve
   soğuk LLM testleriyle defalarca düzeltildi. Sohbet için ikinci bir tanım
   yazmak, o düzeltmelerin bir kopyasını daha bakmak demekti — "aynı kural iki
   yere yazılırsa ayrışma başlar". Onun yerine MCP sunucusuna SÜREÇ-İÇİ bir
   istemciyle bağlanıp listTools() ile şemayı OKUYORUZ. Bir araç değişince
   burada hiçbir şey yapılmıyor.

   Aynı sebeple sistem talimatı da mcp/server.mjs'ten geliyor (INSTRUCTIONS):
   stdio'dan bağlanan Claude Desktop ile panelin sohbeti AYNI talimatı okuyor.
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

/** MCP araç listesi → Anthropic `tools[]`.
 *  MCP'nin inputSchema'sı zaten JSON Schema; olduğu gibi geçiyor. */
export const araclariCevir = (tools) => tools.map((t) => ({
  name: t.name,
  /* Açıklama modelin TEK bilgi kaynağı — başlık varsa ikisi de verilir. */
  description: [t.title, t.description].filter(Boolean).join(" — "),
  input_schema: t.inputSchema || { type: "object", properties: {} },
}));

/* Bir araç sonucundaki görselin üst sınırı. render 2000px genişlikte
   ~100 KB base64 üretiyor; bu sınır kaçak bir devi kesmek için, normal
   kullanımda hiç devreye girmiyor. */
const GORSEL_SINIR = 4 * 1024 * 1024;

/** MCP çağrı sonucu → Anthropic tool_result içerik dizisi.
 *
 *  İki biçim ayrışıyor ve karıştırmak sessizce bozuk istek üretir:
 *    MCP      { type:"image", data:<base64>, mimeType:"image/png" }
 *    Anthropic{ type:"image", source:{ type:"base64", media_type, data } }
 */
export function icerigiCevir(content = []) {
  const out = [];
  for (const c of content) {
    if (c.type === "text") out.push({ type: "text", text: c.text });
    else if (c.type === "image" && c.data) {
      if (c.data.length > GORSEL_SINIR) {
        out.push({ type: "text", text: "[görsel çok büyük, atlandı]" });
      } else {
        out.push({ type: "image",
          source: { type: "base64", media_type: c.mimeType || "image/png", data: c.data } });
      }
    }
    /* Başka bir tür gelirse SESSİZCE DÜŞÜRMÜYORUZ: model sonucu eksik
       aldığını bilmeli, yoksa olmayan bir çıktıya göre karar verir. */
    else out.push({ type: "text", text: `[desteklenmeyen içerik: ${c.type}]` });
  }
  /* Anthropic boş tool_result kabul etmiyor. */
  if (!out.length) out.push({ type: "text", text: "(araç boş sonuç döndürdü)" });
  return out;
}

/** Aracı çağırır ve Anthropic'in beklediği tool_result bloğunu döndürür.
 *  Hata YUTULMUYOR: is_error ile modele veriliyor ki kendini düzeltsin —
 *  kural motorunun hedef değerli mesajları da bu yoldan geçiyor. */
export async function aracCagir(client, id, name, args) {
  try {
    const r = await client.callTool({ name, arguments: args || {} });
    return {
      type: "tool_result", tool_use_id: id,
      content: icerigiCevir(r.content),
      ...(r.isError ? { is_error: true } : {}),
    };
  } catch (e) {
    return {
      type: "tool_result", tool_use_id: id, is_error: true,
      content: [{ type: "text", text: String(e?.message || e) }],
    };
  }
}
