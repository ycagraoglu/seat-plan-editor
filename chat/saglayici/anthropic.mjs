import Anthropic from "@anthropic-ai/sdk";
import { aciklama } from "./sema.mjs";

/* Anthropic adaptörü. Tek ayrıcalığı: araç sonucunun İÇİNDE görsel
   taşıyabiliyor, o yüzden render'ın çıktısı ayrı bir tura gerek kalmadan
   modele ulaşıyor (bkz. gorselEkle). */

export const ad = "anthropic";
export const varMi = () => !!process.env.ANTHROPIC_API_KEY;
export const VARSAYILAN_MODEL = "claude-opus-5";
export const istemciKur = () => new Anthropic();

export const araclariCevir = (tools) => tools.map((t) => ({
  name: t.name, description: aciklama(t),
  input_schema: t.inputSchema || { type: "object", properties: {} },
}));

export const kullaniciEkle = (mesajlar, metin) => mesajlar.push({ role: "user", content: metin });

/* Görsel araç sonucunun içinde gitti — ayrı tura gerek yok. */
export const gorselEkle = () => {};

export async function cagir(istemci, { model, system, mesajlar, araclar }) {
  const akis = await istemci.messages.stream({
    model, max_tokens: 32000, system, messages: mesajlar, tools: araclar,
    thinking: { type: "adaptive" }, output_config: { effort: "high" },
  });
  const ham = await akis.finalMessage();
  const metin = (ham.content || []).filter((c) => c.type === "text").map((c) => c.text).join("\n").trim();
  if (ham.stop_reason === "refusal") {
    return { dur: "red", metin, cagrilar: [], ham, sebep: ham.stop_details?.category || null };
  }
  const cagrilar = (ham.content || []).filter((c) => c.type === "tool_use")
    .map((c) => ({ id: c.id, ad: c.name, girdi: c.input }));
  return { dur: cagrilar.length ? "arac" : "bitti", metin, cagrilar, ham };
}

export const asistanEkle = (mesajlar, ham) =>
  mesajlar.push({ role: "assistant", content: ham.content });

export const sonucEkle = (mesajlar, sonuclar) => mesajlar.push({
  role: "user",
  content: sonuclar.map((s) => ({
    type: "tool_result", tool_use_id: s.id,
    content: [
      { type: "text", text: s.metin },
      ...s.gorseller.map((g) => ({ type: "image",
        source: { type: "base64", media_type: g.mimeType, data: g.data } })),
    ],
    ...(s.hata ? { is_error: true } : {}),
  })),
});
