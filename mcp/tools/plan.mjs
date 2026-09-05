import { yeniPlan } from "../session.mjs";
import { BUILTINS } from "../../src/venues/index.js";

const metin = (t) => ({ content: [{ type: "text", text: t }] });
const json = (o) => ({ content: [{ type: "text", text: JSON.stringify(o, null, 2) }] });

/* Plan yaşam döngüsü: aç · oluştur · oku. */
export function registerPlanTools(server, session, z) {
  server.registerTool("create_plan", {
    title: "Yeni plan",
    description: [
      "Boş bir plan açar ve aktif hâle getirir. Ölçü birimi SANTİMETREDİR.",
      "Bloğu koltuk sayısından kurarsın; varsayılan ölçüler gerçektir",
      "(koltuk 41 cm, koltuk aralığı 50 cm, sıra aralığı 90 cm), yani sonuç",
      "kendiliğinden gerçek ölçüde çıkar — kaynaktan metre ölçmene gerek yok.",
    ].join(" "),
    inputSchema: {
      name: z.string().describe("Mekân adı, ör. \"Bursa Tayyare Kültür Merkezi\""),
      key: z.string().optional().describe("Kısa anahtar; verilmezse addan türetilir"),
    },
  }, async ({ name, key }) => {
    const k = key || name.toLocaleLowerCase("tr").replace(/[^a-z0-9]+/g, "-").slice(0, 24) || "plan";
    session.set(yeniPlan(k, name));
    return metin(session.summaryText("Yeni plan açıldı."));
  });

  server.registerTool("open_sample", {
    title: "Örnek salonu taban al",
    description: [
      "Depodaki gerçek salonlardan birini aktif plan yapar — benzer bir mekânı",
      "sıfırdan kurmak yerine ondan başlamak için. Örnekler salt okunur",
      "DEĞİLDİR; kopyası alınır, üstünde çalışırsın.",
    ].join(" "),
    inputSchema: {
      key: z.enum(Object.keys(BUILTINS)).describe("Salon anahtarı"),
    },
  }, async ({ key }) => {
    const v = BUILTINS[key];
    if (!v) throw new Error(`Böyle bir örnek yok: ${key}`);
    /* Derin kopya: örneği bozmadan üstünde çalışmak için. Salon nesneleri
       modül düzeyinde tek örnek, doğrudan mutasyon TÜM oturumu kirletirdi. */
    session.set(structuredClone(v));
    return metin(session.summaryText(`Örnek alındı: ${v.name}`));
  });

  server.registerTool("list_samples", {
    title: "Örnek salonlar",
    description: "Taban alınabilecek gerçek salonlar, anahtar ve kapasiteleriyle.",
    inputSchema: {},
  }, async () => json(Object.entries(BUILTINS).map(([k, v]) => ({
    key: k, name: v.name, blocks: (v.blocks || []).length,
  }))));

  server.registerTool("plan_summary", {
    title: "Planı oku",
    description: [
      "Aktif planın yapısal özeti: bloklar (kimlik, kat, tür, koltuk sayısı,",
      "sınır kutusu, kapıları), kat ağacı, şekiller ve kural bulguları.",
      "Çizdiğinin ne olduğunu görmek için bunu kullan.",
    ].join(" "),
    inputSchema: {},
  }, async () => json(session.summaryData()));
}
