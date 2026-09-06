import OpenAI from "openai";
import { aciklama, sadelestir } from "./sema.mjs";

/* OpenAI adaptörü.
   Araç yanıtı yalnız METİN taşıyor; render'ın görseli AYRI BİR TUR olarak
   gönderiliyor (gorselEkle). Model yine kendi çizimine bakabiliyor, sadece
   bir mesaj fazla oluyor. */

export const ad = "openai";
export const varMi = () => !!process.env.OPENAI_API_KEY;
/* Hesaptan hesaba değişiyor — SOHBET_MODEL ile ez. */
export const VARSAYILAN_MODEL = process.env.SOHBET_MODEL || "gpt-4o";
export const istemciKur = () => new OpenAI();

export const araclariCevir = (tools) => tools.map((t) => ({
  type: "function",
  function: {
    name: t.name, description: aciklama(t),
    parameters: sadelestir(t.inputSchema || { type: "object", properties: {} }),
  },
}));

export const kullaniciEkle = (mesajlar, metin) => mesajlar.push({ role: "user", content: metin });

export const gorselEkle = (mesajlar, gorseller) => {
  if (!gorseller.length) return;
  mesajlar.push({ role: "user", content: [
    { type: "text", text: "İşte az önce ürettiğin çizim — kaynakla karşılaştır." },
    ...gorseller.map((g) => ({ type: "image_url",
      image_url: { url: `data:${g.mimeType};base64,${g.data}` } })),
  ] });
};

export async function cagir(istemci, { model, system, mesajlar, araclar }) {
  const r = await istemci.chat.completions.create({
    model, tools: araclar,
    messages: [{ role: "system", content: system }, ...mesajlar],
  });
  const m = r.choices?.[0]?.message || {};
  const cagrilar = (m.tool_calls || []).map((c) => ({
    id: c.id, ad: c.function.name,
    /* Argümanlar METİN geliyor; bozuksa modele hata olarak dönmeli,
       burada patlamamalı. */
    girdi: (() => { try { return JSON.parse(c.function.arguments || "{}"); } catch { return {}; } })(),
  }));
  return { dur: cagrilar.length ? "arac" : "bitti", metin: (m.content || "").trim(), cagrilar, ham: m };
}

export const asistanEkle = (mesajlar, ham) => mesajlar.push(ham);

export const sonucEkle = (mesajlar, sonuclar) => {
  /* Her çağrı için AYRI bir tool mesajı — OpenAI böyle istiyor. */
  for (const s of sonuclar) {
    mesajlar.push({ role: "tool", tool_call_id: s.id,
      content: s.hata ? `HATA: ${s.metin}` : s.metin });
  }
};
