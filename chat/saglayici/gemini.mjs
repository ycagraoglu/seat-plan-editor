import { GoogleGenAI } from "@google/genai";
import { aciklama, sadelestir } from "./sema.mjs";

/* Gemini adaptörü.
   İki fark: şema OpenAPI 3.0 alt kümesi (sadelestir şart — ölçtüm,
   exclusiveMinimum 19 yerde ve üç araçta tip dizisi var) ve araç yanıtı
   görsel taşımıyor, o yüzden render'ın çıktısı ayrı bir tur olarak
   gönderiliyor. */

export const ad = "gemini";
export const varMi = () => !!(process.env.GEMINI_API_KEY || process.env.GOOGLE_API_KEY);
export const VARSAYILAN_MODEL = process.env.SOHBET_MODEL || "gemini-2.0-flash";
export const istemciKur = () => new GoogleGenAI({
  apiKey: process.env.GEMINI_API_KEY || process.env.GOOGLE_API_KEY,
});

export const araclariCevir = (tools) => [{
  functionDeclarations: tools.map((t) => ({
    name: t.name, description: aciklama(t),
    parameters: sadelestir(t.inputSchema || { type: "object", properties: {} }),
  })),
}];

export const kullaniciEkle = (icerik, metin) =>
  icerik.push({ role: "user", parts: [{ text: metin }] });

export const gorselEkle = (icerik, gorseller) => {
  if (!gorseller.length) return;
  icerik.push({ role: "user", parts: [
    { text: "İşte az önce ürettiğin çizim — kaynakla karşılaştır." },
    ...gorseller.map((g) => ({ inlineData: { mimeType: g.mimeType, data: g.data } })),
  ] });
};

export async function cagir(istemci, { model, system, mesajlar, araclar }) {
  const r = await istemci.models.generateContent({
    model, contents: mesajlar,
    config: { systemInstruction: system, tools: araclar },
  });
  const parcalar = r.candidates?.[0]?.content?.parts || [];
  const metin = parcalar.filter((p) => p.text).map((p) => p.text).join("\n").trim();
  const cagrilar = parcalar.filter((p) => p.functionCall).map((p, i) => ({
    /* Gemini çağrıya kimlik vermiyor; sonucu ADLA eşleştiriyor. Sıra
       bozulmasın diye kendi kimliğimizi üretiyoruz. */
    id: p.functionCall.id || `${p.functionCall.name}-${i}`,
    ad: p.functionCall.name, girdi: p.functionCall.args || {},
  }));
  return { dur: cagrilar.length ? "arac" : "bitti", metin, cagrilar,
    ham: r.candidates?.[0]?.content || { role: "model", parts: parcalar } };
}

export const asistanEkle = (icerik, ham) => icerik.push(ham);

export const sonucEkle = (icerik, sonuclar) => icerik.push({
  role: "user",
  parts: sonuclar.map((s) => ({
    functionResponse: { name: s.ad,
      response: s.hata ? { hata: s.metin } : { sonuc: s.metin } },
  })),
});
