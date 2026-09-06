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
    session.yeni(yeniPlan(k, name));
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
    session.yeni(structuredClone(v));
    return metin(session.summaryText(`Örnek alındı: ${v.name}`));
  });

  /* ── OPERATÖRÜN KENDİ SALONLARI ───────────────────────────────────
     open_sample depodaki ON ÖRNEĞİ açıyor; bunlar operatörün KENDİ kayıtlı
     planlarını açıyor. Yönetim panelinde asıl ihtiyaç bu: salon bir kez
     çizilir, sonra "balkona iki sıra ekle" diye düzeltilir.

     Depoya SEAT_EDITOR_API üzerinden bakıyorlar (mcp/live.mjs'in emsali).
     Değişken yoksa NET HATA veriyorlar — boş liste dönüp "hiç planın yok"
     izlenimi vermek, olmayan bir gerçeği bildirmek olurdu. */
  const taban = () => {
    const t = process.env.SEAT_EDITOR_API;
    if (!t) {
      throw new Error("Kayıtlı planlara erişim yok: SEAT_EDITOR_API tanımlı değil."
        + " Bu araç ancak editör sunucusuna bağlıyken çalışır."
        + " Sıfırdan çizmek için create_plan ya da open_sample kullan.");
    }
    return t.replace(/\/+$/, "");
  };
  const getir = async (yol) => {
    const r = await fetch(`${taban()}${yol}`);
    if (!r.ok) throw new Error(`Depo yanıtı: HTTP ${r.status}`);
    return r.json();
  };

  server.registerTool("list_plans", {
    title: "Kayıtlı planlar",
    description: [
      "Operatörün KAYITLI planlarını listeler (örnek salonları değil —",
      "onlar için list_samples).",
      "",
      "Var olan bir salonu düzeltmen istendiğinde önce bunu çağır, doğru",
      "anahtarı bul, sonra open_plan ile aç. Ada göre tahmin yürütme.",
    ].join("\n"),
    inputSchema: {},
  }, async () => {
    const liste = await getir("/plans?detay=1");
    if (!liste.length) return metin("Kayıtlı plan yok. create_plan ile başlayabilirsin.");
    return json(liste);
  });

  server.registerTool("open_plan", {
    title: "Kayıtlı planı aç",
    description: [
      "Operatörün kayıtlı bir planını aktif hâle getirir — üstünde düzenleme",
      "yapmak için. Anahtarı list_plans'ten al.",
      "",
      "ÖNEMLİ: Orijinali EZMEZSİN. Çizim, canlı görünümde kendi ad alanına",
      "(\"ai-\" ön ekli) yazılır; operatörün planı olduğu gibi durur ve",
      "beğenirse üstüne kendisi geçer. Ürettiğin şey yine TASLAKTIR.",
    ].join("\n"),
    inputSchema: {
      key: z.string().describe("Plan anahtarı (list_plans'ten)"),
    },
  }, async ({ key }) => {
    const plan = await getir(`/plans/${encodeURIComponent(key)}`);
    if (!plan || typeof plan !== "object") throw new Error(`Böyle bir plan yok: ${key}`);
    session.yeni(plan);
    return metin(session.summaryText(`Kayıtlı plan açıldı: ${plan.name || key}`));
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
