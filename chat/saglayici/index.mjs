import * as anthropic from "./anthropic.mjs";
import * as openai from "./openai.mjs";
import * as gemini from "./gemini.mjs";

/* ══════════════════════════════════════════════════════════════════════════
   SAĞLAYICI SEÇİMİ

   Üçü de destekleniyor çünkü sahada en çok bu üçü kullanılıyor ve hangi
   anahtarın elde olduğu operatörden operatöre değişiyor. Panel, rotalar,
   29 araç ve oturum katmanı sağlayıcıdan HABERSİZ — değişen tek şey
   chat/saglayici/*.mjs.

   SEÇİM: SOHBET_SAGLAYICI verilmişse o. Verilmemişse hangi anahtar
   tanımlıysa o (aşağıdaki sırayla). Hiçbiri yoksa sohbet KAPALI ve panel
   hiç görünmüyor — editör bugünkü gibi çalışıyor.

   Sıra bir tercih değil, sadece deterministik olsun diye sabit: birden çok
   anahtar tanımlıysa hangisinin seçildiği tahmin edilebilir olmalı ve
   SOHBET_SAGLAYICI ile açıkça ezilebilmeli.
   ══════════════════════════════════════════════════════════════════════════ */

export const HEPSI = [anthropic, openai, gemini];

/** Seçili sağlayıcı ya da null (hiçbir anahtar yoksa). */
export function sec(istek = process.env.SOHBET_SAGLAYICI) {
  if (istek) {
    const s = HEPSI.find((x) => x.ad === istek);
    if (!s) throw new Error(`Bilinmeyen sağlayıcı: ${istek}.`
      + ` Seçenekler: ${HEPSI.map((x) => x.ad).join(", ")}`);
    if (!s.varMi()) throw new Error(`${istek} seçildi ama anahtarı tanımlı değil.`);
    return s;
  }
  return HEPSI.find((x) => x.varMi()) || null;
}

/** Panelin "sohbet açık mı" sorusunun cevabı. */
export const acikMi = () => { try { return !!sec(); } catch { return false; } };
