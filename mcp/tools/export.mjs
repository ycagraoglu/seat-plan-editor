import { writeFile } from "node:fs/promises";
import path from "node:path";
import { buildSeatsPayload } from "../../src/core/export.js";
import { buildDbPayload } from "../../src/core/db-export.js";
import { buildMeta } from "../../src/core/geometry.js";
import { gateMap } from "../../src/core/gates.js";
import { stripUnderlay } from "../../src/core/plan.js";
import { selectLevelCounts } from "../../src/ui/state/selectors.js";

const metin = (t) => ({ content: [{ type: "text", text: t }] });
const tr = (n) => Number(n).toLocaleString("tr-TR");

/* ══════════════════════════════════════════════════════════════════════════
   ÇIKTI

   Üç biçim, üç ayrı iş:
   · plan  — editörün ÇALIŞMA BELGESİ (üretim tarifi). Operatör bunu
     editörde açıp gözden geçirir. Asıl teslim edilen şey budur.
   · seats — düzleştirilmiş koltuk listesi; okunur özet, karşılaştırma için.
   · db    — hedef şemanın TABLOLARI, yabancı anahtarlarıyla; karşı sistem
     doğrudan INSERT edebilir.

   YAYIM ARACI YOK. Çıktı taslaktır; yayına gönderme kararı operatörde
   kalır. Bilet satılan bir sistemde bu sınır bilinçlidir.
   ══════════════════════════════════════════════════════════════════════════ */

export function registerExportTools(server, session, z) {
  server.registerTool("export_plan", {
    title: "Dışa aktar",
    description: [
      "Aktif planı dosyaya yazar. Üç biçim:",
      "",
      "· plan  — editörün çalışma belgesi (.json). Operatör bunu editörde",
      "  açıp gözden geçirir; İŞİ TESLİM ETMEK bu dosyayı vermektir.",
      "· seats — düzleştirilmiş koltuk listesi: kimlik, kat, blok, sıra,",
      "  koltuk, kapı(lar), koordinat, tür, özellik.",
      "· db    — hedef şemanın tabloları (sections/rows/seats/shapes/...)",
      "  yabancı anahtarlarıyla; karşı sistem doğrudan INSERT edebilir.",
      "",
      "Yazmadan önce doğrulamayı kontrol et — hatalı planı teslim etme.",
    ].join("\n"),
    inputSchema: {
      format: z.enum(["plan", "seats", "db"]).describe("Çıktı biçimi"),
      path: z.string().describe("Yazılacak dosya yolu (.json)"),
    },
  }, async ({ format, path: dosya }) => {
    const plan = session.need();
    const metas = plan.blocks.map((b) => ({ b, m: buildMeta(b) }));
    const gates = gateMap(plan);

    let yuk, ozet;
    if (format === "plan") {
      /* Altlık dosyayı şişirir ve kaynağı zaten mekândan gelen bir
         görseldir — kaydedilmez (editörün kendi kaydı da böyle yapıyor). */
      yuk = stripUnderlay(plan);
      ozet = `${tr(plan.blocks.length)} blok · ${tr((plan.shapes || []).length)} şekil`;
    } else if (format === "seats") {
      yuk = buildSeatsPayload(plan, metas, selectLevelCounts(metas), gates);
      ozet = `${tr(yuk.seats.length)} koltuk`;
    } else {
      yuk = buildDbPayload(plan, metas, gates);
      ozet = ["sections", "rows", "seat_types", "seat_groups", "seats", "shapes",
        "entrances", "entrance_sections", "entrance_seats"]
        .map((k) => `${k} ${tr((yuk[k] || []).length)}`).join(" · ");
    }

    const govde = JSON.stringify(yuk, null, 2);
    await writeFile(dosya, govde, "utf8");

    const { findings } = session.derive();
    const hata = findings.filter((f) => f.t === "err").length;
    return metin([
      `${path.basename(dosya)} yazıldı · ${Math.round(govde.length / 1024)} KB`,
      ozet,
      hata
        ? `\nDİKKAT: doğrulamada ${hata} hata var — bu plan yayına hazır DEĞİL.`
          + ` validate ile bak, düzelt, tekrar yaz.`
        : "\nDoğrulama temiz. Operatör editörde açıp onaylayabilir.",
    ].join("\n"));
  });
}
