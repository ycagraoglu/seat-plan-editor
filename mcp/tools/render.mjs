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
      underlayRect: plan.underlayRect || null,
    });
    const buf = await png(r.svg, r.width);
    const ozet = `${r.blocks} blok · ${r.seats.toLocaleString("tr-TR")} koltuk`
      + ` · koltuklar ${r.seatsDrawn ? "çizildi" : "çizilmedi (blok seviyesi)"}`
      + (r.labelsHidden ? ` · ${r.labelsHidden} etiket sığmadı, yakınlaşabilirsin` : "")
      /* Altlığın KONUMLU mu gerilmiş mi olduğu LLM için kritik: gerilmiş
         altlık çizimle hizalanmaz, ona bakıp "tutuyor" demek yanıltır. */
      + (r.underlayPlaced === null ? ""
        : r.underlayPlaced ? " · altlık bindirildi (konumlu)"
          : " · altlık bindirildi (GERİLMİŞ — hizalanmaz, karşılaştırma için x/y/width/height ver)");
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
      "HİZALAMA: x/y/width/height verirsen altlık DÜNYADA o dikdörtgene",
      "oturur ve çizimle karşılaştırılabilir. Vermezsen görüntü kutusuna",
      "gerilir — kaba bir referans olur, üst üste bindirme HİZALANMAZ.",
      "Ölçüyü bilmiyorsan: bir bloğu kur, plan_summary'den bbox'ını oku,",
      "altlığı ona göre yerleştir.",
      "",
      "Altlık dışa aktarılmaz (dosya boyutunu şişirmemek için), yalnız",
      "oturum boyunca karşılaştırma amacıyla tutulur.",
    ].join("\n"),
    inputSchema: {
      path: z.string().describe("Görselin yerel dosya yolu (png/jpg/webp)"),
      x: z.number().optional().describe("Dünyada sol kenar (cm)"),
      y: z.number().optional().describe("Dünyada üst kenar (cm)"),
      width: z.number().optional().describe("Dünyada genişlik (cm)"),
      height: z.number().optional().describe("Dünyada yükseklik (cm)"),
    },
  }, async ({ path: dosya, x, y, width, height }) => {
    const uzanti = path.extname(dosya).toLowerCase();
    const mime = MIME[uzanti];
    if (!mime) throw new Error(`Desteklenmeyen görsel: ${uzanti || "(uzantı yok)"}`);
    const buf = await readFile(dosya);
    const plan = session.need();
    const rect = [x, y, width, height].every((v) => v != null)
      ? { x, y, w: width, h: height } : null;
    session.set({ ...plan, underlay: `data:${mime};base64,${buf.toString("base64")}`,
      underlayRect: rect });
    return metin(`Altlık yüklendi: ${path.basename(dosya)} (${Math.round(buf.length / 1024)} KB)`
      + (rect ? `\nDünyada yeri: ${rect.w}×${rect.h} cm, sol üst (${rect.x}, ${rect.y}).`
        : `\nDünyadaki yeri VERİLMEDİ — görüntü kutusuna gerilecek, bindirme`
          + ` hizalanmaz. Karşılaştırma yapacaksan x/y/width/height ver.`));
  });
}
