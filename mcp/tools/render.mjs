import { readFile } from "node:fs/promises";
import path from "node:path";
import { renderSvg } from "../render.mjs";

const metin = (t) => ({ content: [{ type: "text", text: t }] });

/* Yalnız gerçekten resim isteneceği zaman yüklenir — native modül, sunucu
   açılışını yavaşlatmasın. */
let Resvg = null;
async function png(svg, width) {
  if (!Resvg) ({ Resvg } = await import("@resvg/resvg-js"));
  return new Resvg(svg, { fitTo: { mode: "width", value: width } }).render().asPng();
}

const MIME = { ".png": "image/png", ".jpg": "image/jpeg", ".jpeg": "image/jpeg",
  ".webp": "image/webp", ".gif": "image/gif" };

/* ══════════════════════════════════════════════════════════════════════════
   GÖRME ARAÇLARI

   Blender'da LLM'in ekran görüntüsü alması neyse, bu da o. Farkı: bizde
   ALTLIK BİNDİRMESİ var — organizatörün gönderdiği plan arkada, çizim
   önde. LLM kendi işini kaynakla üst üste görebiliyor, ki doğrulamanın
   en güçlü biçimi budur.
   ══════════════════════════════════════════════════════════════════════════ */

export function registerRenderTools(server, session, z) {
  server.registerTool("render", {
    title: "Çizimi göster",
    description: [
      "Aktif planın resmini döndürür — çizdiğine BAK.",
      "",
      "scope ile yakınlaş: \"all\" tüm plan · blok kodu (\"MARATON ÜST A\") ·",
      "kat yolu (\"Maraton\" ya da \"Maraton / Üst\"). Yakınlaşınca koltuklar",
      "tek tek çizilir; tüm plan görünümünde 4.000'in üstünde koltuk varsa",
      "blok tabanları çizilir (o ölçekte koltuk zaten okunmaz).",
      "",
      "underlay ile organizatörün planını ARKAYA bindirir (önce set_underlay).",
      "Kendi çizimini kaynakla üst üste görmek en güvenilir doğrulamadır.",
      "",
      "Renkler kata göre; iki kat asla aynı renge düşmez.",
      "labelsHidden > 0 ise o ölçekte sığmayan etiket var, scope ile yakınlaş.",
    ].join("\n"),
    inputSchema: {
      scope: z.string().optional().describe("\"all\" (varsayılan) · blok kodu · kat yolu"),
      seats: z.enum(["auto", "on", "off"]).optional().describe("Koltuk çizimi, varsayılan auto"),
      withUnderlay: z.boolean().optional().describe("Altlığı arkaya bindir (varsa)"),
      width: z.number().int().min(400).max(2400).optional().describe("Piksel genişlik, varsayılan 1400"),
    },
  }, async ({ scope = "all", seats = "auto", withUnderlay = true, width = 1400 }) => {
    const plan = session.need();
    const r = renderSvg(plan, {
      scope, seats, width,
      underlay: withUnderlay ? plan.underlay || null : null,
    });
    const buf = await png(r.svg, r.width);
    const ozet = `${r.blocks} blok · ${r.seats.toLocaleString("tr-TR")} koltuk`
      + ` · koltuklar ${r.seatsDrawn ? "çizildi" : "çizilmedi (blok seviyesi)"}`
      + (r.labelsHidden ? ` · ${r.labelsHidden} etiket sığmadı, yakınlaşabilirsin` : "")
      + (plan.underlay && withUnderlay ? " · altlık bindirildi" : "");
    return {
      content: [
        { type: "text", text: ozet },
        { type: "image", data: buf.toString("base64"), mimeType: "image/png" },
      ],
    };
  });

  server.registerTool("set_underlay", {
    title: "Altlık yükle (organizatörün planı)",
    description: [
      "Organizatörden gelen plan görselini altlık olarak koyar. render ile",
      "arkaya bindirilir; blokları onun üstünden kurup karşılaştırırsın.",
      "",
      "Altlık ÖLÇEK vermez ve vermesine gerek yok: blokları koltuk SAYISINDAN",
      "kurduğun için sonuç zaten gerçek santimetrede çıkıyor. Altlıktan",
      "okuyacağın şey NE ve NEREDE — kaç blok, hangi adlar, nasıl dizilmiş.",
      "",
      "Altlık plana kaydedilmez (dosya boyutunu şişirmemek için), yalnız",
      "oturum boyunca karşılaştırma amacıyla tutulur.",
    ].join("\n"),
    inputSchema: {
      path: z.string().describe("Görselin yerel dosya yolu (png/jpg/webp)"),
    },
  }, async ({ path: dosya }) => {
    const uzanti = path.extname(dosya).toLowerCase();
    const mime = MIME[uzanti];
    if (!mime) throw new Error(`Desteklenmeyen görsel: ${uzanti || "(uzantı yok)"}`);
    const buf = await readFile(dosya);
    const plan = session.need();
    session.set({ ...plan, underlay: `data:${mime};base64,${buf.toString("base64")}` });
    return metin(`Altlık yüklendi: ${path.basename(dosya)} (${Math.round(buf.length / 1024)} KB)`
      + `\nrender ile arkaya bindirilecek. Blokları onun üstünden kur.`);
  });
}
