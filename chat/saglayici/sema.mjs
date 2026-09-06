/* ══════════════════════════════════════════════════════════════════════════
   ŞEMA TEMİZLEYİCİ

   MCP araç şemaları zod'dan üretiliyor ve JSON Schema 2020-12 biçiminde.
   Sağlayıcıların hepsi bunu olduğu gibi almıyor:

   · exclusiveMinimum SAYI olarak (2020-12) — OpenAPI 3.0 alt kümesini
     bekleyen tarafta reddediliyor. Ölçtüm: 19 yerde geçiyor.
   · type DİZİSİ (["number","string"]) — z.union'dan geliyor, üç araçta
     (create_bowl/add_tier/add_box_wing "first" alanı). Tip dizisini
     desteklemeyen tarafta tekleştirmek gerekiyor.
   · $schema, additionalProperties gibi meta alanlar — bazı taraflar
     bilinmeyen alanda hata veriyor.

   Bu dosya kaybı EN AZA indiriyor: kısıtı düşürürken bilgiyi açıklamaya
   taşıyor ("en az 1"), yoksa model sınırı hiç bilmeden çağırır.
   ══════════════════════════════════════════════════════════════════════════ */

const KOPYALANMAZ = new Set(["$schema", "$id", "additionalProperties", "not", "prefixItems"]);

/** Katı şema bekleyen sağlayıcılar için sadeleştirir. */
export function sadelestir(sema) {
  if (!sema || typeof sema !== "object") return sema;
  if (Array.isArray(sema)) return sema.map(sadelestir);

  const out = {};
  for (const [k, v] of Object.entries(sema)) {
    if (KOPYALANMAZ.has(k)) continue;

    /* exclusiveMinimum: 0 → minimum bilgisi açıklamaya taşınıyor.
       Sessizce atmak, modelin "rows: 0" göndermesine kapı açardı. */
    if (k === "exclusiveMinimum" || k === "exclusiveMaximum") continue;

    if (k === "type" && Array.isArray(v)) {
      /* Tip dizisi tekleştiriliyor. string tercih ediliyor çünkü sayıyı
         metin olarak göndermek her zaman çalışıyor (first: "101"), tersi
         çalışmıyor. */
      out.type = v.includes("string") ? "string" : v[0];
      continue;
    }
    out[k] = (v && typeof v === "object") ? sadelestir(v) : v;
  }

  /* Düşürülen kısıtı açıklamaya yaz — bilgi kaybolmasın. */
  const notlar = [];
  if (sema.exclusiveMinimum !== undefined) notlar.push(`${sema.exclusiveMinimum}'dan büyük olmalı`);
  if (sema.exclusiveMaximum !== undefined) notlar.push(`${sema.exclusiveMaximum}'dan küçük olmalı`);
  if (Array.isArray(sema.type) && sema.type.length > 1) {
    notlar.push(`sayı da yazılabilir (${sema.type.join(" ya da ")})`);
  }
  if (notlar.length) {
    out.description = [out.description, `(${notlar.join(", ")})`].filter(Boolean).join(" ");
  }
  return out;
}

/** Açıklama iki kaynaktan: başlık + açıklama. İkisi de modelin bilgisi. */
export const aciklama = (t) => [t.title, t.description].filter(Boolean).join(" — ");
