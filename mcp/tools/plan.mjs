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

  server.registerTool("validate", {
    title: "Doğrula",
    description: [
      "Planı 26 kurala göre denetler ve DÜZELTİLEBİLİR bilgi döndürür.",
      "",
      "Bulgular sadece 'hata var' demez, HEDEF DEĞER verir:",
      "  'geçit için en az 90 cm gerekir' · '1 yer daha eklenmeli'",
      "  '52.838 kapasite için 276 tekerlekli sandalye yeri gerekiyor'",
      "Bu hedeflere göre update_block / add_accessible ile düzelt, tekrar çağır.",
      "",
      "Her bulgu ilgili blokların kimliğini de verir (blocks alanı).",
      "severity ile süzebilirsin: err = düzeltilmeli, warn = bak ama olabilir.",
    ].join("\n"),
    inputSchema: {
      severity: z.enum(["err", "warn", "info", "all"]).optional()
        .describe("Süzgeç, varsayılan all"),
    },
  }, async ({ severity = "all" }) => {
    const { findings } = session.derive();
    const say = { err: 0, warn: 0, info: 0 };
    findings.forEach((f) => { say[f.t] = (say[f.t] || 0) + 1; });
    const suzulmus = severity === "all" ? findings : findings.filter((f) => f.t === severity);
    return json({
      ok: say.err === 0,
      /* Karar cümlesi: LLM'in "bitti mi" sorusuna tek bakışta cevap. */
      verdict: say.err === 0
        ? (say.warn ? `Hata yok, ${say.warn} uyarı var — gözden geçirilebilir.`
                    : "Temiz.")
        : `${say.err} hata var — düzeltilmeli.`,
      counts: say,
      findings: suzulmus.map((f) => ({
        rule: f.id, severity: f.t, message: f.m,
        target: f.d ?? null,             /* HEDEF DEĞER — düzeltmeyi mümkün kılan alan */
        blocks: f.ids ?? [],
      })),
    });
  });

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
