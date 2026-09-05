import { bowl, tier, locaWing, cutVomitories, withAccessible, labelGates, sec } from "../../src/venues/builders.js";
import { solveBowlTiers, solveRadialTiers } from "../../src/core/solve.js";
import { autoGates } from "../../src/core/gates.js";
import { buildMeta } from "../../src/core/geometry.js";
import { nid } from "../../src/core/ids.js";

const metin = (t) => ({ content: [{ type: "text", text: t }] });
const json = (o) => ({ content: [{ type: "text", text: JSON.stringify(o, null, 2) }] });

/* ══════════════════════════════════════════════════════════════════════════
   YÜKSEK SEVİYE KURGULAR — asıl alan bilgisi burada

   Bu araçların değeri "blok ekle"yi tekrarlamak değil; on gerçek mekânı
   çizerken çıkan ve kodu okuyarak bulunamayan bilgiyi taşımak:

   · solve_tiers  — kademe yarıçapları SİHİRLİ SAYIYLA değil, bildirilen
     açıklıklardan hesaplanır ve çözücü footprintPad'i (bloğun koltuklarının
     ötesinde kapladığı ~100 cm görünmez pay) BİLİR. Bu payı bilmeyen her
     kademe hesabı sessizce çakışma üretir — projenin en pahalı hata sınıfı.
   · create_bowl — tek çağrıda tam kâse: köşe yelpazeleri + uzun/kısa kenar,
     koridor payı cm olarak (açı olarak değil, çünkü yarıçap büyüdükçe aynı
     açı metrelerce boşluk demek; insanın geçmesi için gereken sabit genişlik).
   · cut_vomitories — tüneli tribünün üstüne KONDURMAZ, İÇİNE OYAR: koltukları
     siler, kapıyı gerçek boşluğa koyar. Gerçek stadyum mimarisi budur.
   · add_accessible — tekerlekli sandalye + refakatçi ÇİFT olarak, bitişik.
     Refakatçi asla grupsuz kalmaz (rapor §5.4).
   ══════════════════════════════════════════════════════════════════════════ */

export function registerVenueTools(server, session, z) {
  /* ── kademe çözücü ────────────────────────────────────────────────── */
  server.registerTool("solve_tiers", {
    title: "Kademe çözücü",
    description: [
      "Kademe yarıçaplarını NİYETTEN hesaplar — sihirli sayı yazma, bunu kullan.",
      "İlk kademe W/H verir; sonrakiler yalnız gapFromPrev (önceki kademenin",
      "bittiği yerden sonraki boşluk, cm) verir. Çözücü her bloğun görünmez",
      "taban payını (pad + koltuk/2 + aralık/2, ~100 cm) BİLDİĞİ için kademe",
      "çakışması matematiksel olarak oluşamaz.",
      "",
      "Dönen W/H değerlerini create_bowl'a verirsin.",
      "bowl = dikdörtgen kâse (stadyum) · radial = eşmerkezli daire (arena).",
    ].join("\n"),
    inputSchema: {
      mode: z.enum(["bowl", "radial"]).describe("bowl: dikdörtgen kâse · radial: dairesel"),
      tiers: z.array(z.object({
        id: z.string().describe("Kademe adı, ör. \"alt\""),
        rows: z.number().int().positive().describe("Sıra sayısı"),
        rowGap: z.number().describe("Sıra aralığı (cm), tipik 85–90"),
        seatGap: z.number().describe("Koltuk aralığı (cm), tipik 50"),
        pad: z.number().optional().describe("Taban payı (cm), varsayılan 55"),
        W: z.number().optional().describe("İLK kademe: ilk sıranın yarı-genişliği (cm)"),
        H: z.number().optional().describe("İLK kademe: ilk sıranın yarı-derinliği (cm)"),
        r0: z.number().optional().describe("radial İLK kademe: ilk sıra yarıçapı"),
        gapFromPrev: z.number().optional().describe("SONRAKİ kademeler: önceki bittikten sonra boşluk (cm)"),
      })).min(1),
    },
  }, async ({ mode, tiers }) =>
    json(mode === "bowl" ? solveBowlTiers(tiers) : solveRadialTiers(tiers)));

  /* ── kâse ─────────────────────────────────────────────────────────── */
  server.registerTool("create_bowl", {
    title: "Kâse kur (stadyum/arena)",
    description: [
      "Sahayı çepeçevre saran bir kademe kurar: köşelerde yelpaze bloklar,",
      "uzun ve kısa kenarlarda düz bloklar. TEK çağrıda onlarca blok üretir.",
      "",
      "W/H'yi solve_tiers'tan al. Rc köşe yuvarlaklığı (cm) — ayrı bir tasarım",
      "kararıdır, zincire girmez. aisle bloklar arası koridor payı, CM olarak",
      "(açı olarak değil).",
      "",
      "Blok sayısı: 2 × (2·nCorner + nLong + nShort) civarı. Kodlar first'ten",
      "başlayarak sayıyla ilerler (first: 101 → 101, 102, 103...).",
    ].join("\n"),
    inputSchema: {
      W: z.number().describe("İlk sıranın yarı-genişliği (cm) — solve_tiers'tan"),
      H: z.number().describe("İlk sıranın yarı-derinliği (cm) — solve_tiers'tan"),
      Rc: z.number().describe("Köşe yarıçapı (cm), tipik 2000–3500"),
      rows: z.number().int().positive().describe("Sıra sayısı"),
      rowGap: z.number().describe("Sıra aralığı (cm)"),
      seatGap: z.number().describe("Koltuk aralığı (cm)"),
      nLong: z.number().int().positive().describe("Uzun kenardaki blok bölmesi"),
      nShort: z.number().int().positive().describe("Kısa kenardaki blok bölmesi"),
      nCorner: z.number().int().positive().describe("Köşe başına yelpaze blok sayısı"),
      first: z.union([z.number(), z.string()]).describe("İlk blok kodu, ör. 101"),
      level: z.string().describe("Kat/bölüm yolu, ör. \"Alt Tribün\""),
      aisle: z.number().optional().describe("Bloklar arası koridor (cm), varsayılan 240"),
      pad: z.number().optional().describe("Taban payı (cm), varsayılan 80"),
    },
  }, async (a) => metin(session.mutate((plan) => {
    const yeni = bowl(a);
    return { ...plan, blocks: [...plan.blocks, ...yeni] };
  }, `Kâse kuruldu: ${a.level}`)));

  server.registerTool("add_tier", {
    title: "Radyal kademe",
    description: [
      "Bir merkez etrafında yay biçiminde kademe — arena, amfi, açıkhava",
      "tiyatrosu için. span toplam açı (derece), count kaç bloğa bölüneceği.",
      "aisle koridor payı CM olarak verilir; yarıçap büyüdükçe açıya çevrilir,",
      "böylece koridor her kademede aynı FİZİKSEL genişlikte kalır.",
    ].join(" "),
    inputSchema: {
      r0: z.number().describe("İlk sıra yarıçapı (cm)"),
      rows: z.number().int().positive(),
      rowGap: z.number(),
      span: z.number().describe("Toplam açı (derece), ör. 180"),
      count: z.number().int().positive().describe("Kaç bloğa bölünecek"),
      first: z.union([z.number(), z.string()]).describe("İlk blok kodu"),
      level: z.string(),
      aisle: z.number().optional().describe("Koridor (cm), varsayılan 160"),
      pad: z.number().optional(),
    },
  }, async (a) => metin(session.mutate((plan) => ({
    ...plan, blocks: [...plan.blocks, ...tier(a)],
  }), `Kademe eklendi: ${a.level}`)));

  server.registerTool("add_box_wing", {
    title: "Loca kanadı",
    description: [
      "İki kademe arasına ya da yan duvara loca dizisi. Her loca ayrı bir",
      "küçük blok; perRow loca başına koltuk, countPerSide her yanda kaç loca.",
      "Ülker'de iki kademe arasında 44 loca bu şekilde.",
    ].join(" "),
    inputSchema: {
      r0: z.number(), rows: z.number().int().positive(), rowGap: z.number(),
      seatGap: z.number(), perRow: z.number().int().positive().describe("Loca başına koltuk"),
      gap: z.number().describe("Localar arası boşluk (cm)"),
      countPerSide: z.number().int().positive()
        .describe("Her yanda EN FAZLA kaç loca — gerçek sayıyı yay (fromDeg/toDeg) belirler, sığdığı kadarı kurulur"),
      first: z.union([z.number(), z.string()]),
      level: z.string(),
      fromDeg: z.number().optional(), toDeg: z.number().optional(),
      pad: z.number().optional(), color: z.string().optional(),
    },
  }, async (a) => metin(session.mutate((plan) => ({
    ...plan, blocks: [...plan.blocks, ...locaWing(a)],
  }), `Loca kanadı eklendi: ${a.level}`)));

  /* ── mimari boşluklar ve erişilebilirlik ──────────────────────────── */
  server.registerTool("cut_vomitories", {
    title: "Vomitorium oy (tribün tüneli)",
    description: [
      "Gerçek stadyumda merdiven tüneli tribünün ÜSTÜNE konmaz, İÇİNE oyulur:",
      "o dikdörtgende koltuk yoktur, sıralar tünelin iki yanından devam eder.",
      "Bu araç seçilen blokların ARKA sıralarından koltuk siler ve tam o",
      "boşluğa kapıyı koyar. Kapıyı bloklar arası koridora koymak yanlıştır.",
      "",
      "Hangi bloklara uygulanacağı level ya da labels ile seçilir.",
    ].join("\n"),
    inputSchema: {
      level: z.string().optional().describe("Bu kattaki bloklara uygula"),
      labels: z.array(z.string()).optional().describe("Bu kodlu bloklara uygula"),
      depth: z.number().int().positive().optional().describe("Kaç sıra derinliğinde, varsayılan 3"),
      width: z.number().int().positive().optional().describe("Kaç koltuk genişliğinde, varsayılan 6"),
      labelGatesAs: z.boolean().optional().describe("Üretilen kapıları KAPI 1..N diye adlandır"),
    },
  }, async (a) => metin(session.mutate((plan) => {
    const secili = (b) => (a.labels ? a.labels.includes(b.label)
      : a.level ? b.level === a.level : true);
    const hedef = plan.blocks.filter(secili);
    if (!hedef.length) throw new Error("Eşleşen blok yok — level ya da labels'ı kontrol et.");
    const digerleri = plan.blocks.filter((b) => !secili(b));
    /* cutVomitories [bloklar, kapılar] DİZİSİ döndürür — gs.venue.js de böyle alıyor. */
    const [blocks, doors] = cutVomitories(hedef, { depth: a.depth, width: a.width });
    const kapilar = a.labelGatesAs ? labelGates(doors) : doors;
    return { ...plan, blocks: [...digerleri, ...blocks],
      shapes: [...(plan.shapes || []), ...kapilar] };
  }, "Vomitorium'lar oyuldu")));

  server.registerTool("add_accessible", {
    title: "Erişilebilir konum ekle",
    description: [
      "Tekerlekli sandalye konumu + refakatçi koltuğunu BİTİŞİK ÇİFT olarak",
      "yerleştirir (bloğun arka sıralarından başlayarak). Refakatçi asla",
      "grupsuz kalmaz — çift, companion_group olarak türetilir.",
      "",
      "KOLTUK EKLEMEZ, MEVCUT KOLTUĞU DÖNÜŞTÜRÜR. Toplam koltuk sayısı",
      "değişmez; bu yüzden organizatörün listesiyle eşleşmeyi bozmaz.",
      "",
      "pairs BLOK BAŞINA sayıdır, plan başına DEĞİL. Seçici üç bloğa",
      "uyuyorsa pairs:3 → 9 tekerlekli sandalye yeri. validate'in verdiği",
      "hedef ise PLAN çapındadır — bölerek ver. Kaç blok eşleştiğini",
      "aracın yanıtı söyler.",
    ].join("\n"),
    inputSchema: {
      level: z.string().optional().describe("Bu kattaki bloklara"),
      labels: z.array(z.string()).optional().describe("Bu kodlu bloklara"),
      labelPattern: z.string().optional().describe("Kod deseni (regex), ör. \"ÜST C$\""),
      pairs: z.number().int().positive().describe("Blok başına kaç ÇİFT"),
    },
  }, async (a) => {
    const re = a.labelPattern ? new RegExp(a.labelPattern) : null;
    const secici = (b) => (a.labels ? a.labels.includes(b.label)
      : re ? re.test(b.label)
      : a.level ? b.level === a.level : false);
    /* Sayım mutate'ten ÖNCE: mutate'in başlık metni geri çağrımdan önce
       hesaplanıyor, sonra atarsam başlıkta hep 0 görünüyordu. */
    const eslesenBlok = session.need().blocks.filter(secici).length;
    if (!eslesenBlok) throw new Error("Eşleşen blok yok — seçiciyi kontrol et.");
    return metin(session.mutate((plan) => {
    return { ...plan, blocks: withAccessible(plan.blocks, secici, a.pairs) };
  }, `Erişilebilir konumlar: ${eslesenBlok} blok × ${a.pairs} çift`
     + ` = ${eslesenBlok * a.pairs} tekerlekli sandalye yeri (koltuk EKLENMEDİ, dönüştürüldü)`)); });

  /* ── bölüm ağacı ──────────────────────────────────────────────────── */
  server.registerTool("define_section", {
    title: "Bölüm türü tanımla",
    description: [
      "Bir kat/bölüme TÜR verir. Blokların level yolu bölüm ağacını zaten",
      "kuruyor; bu araç o düğüme anlam ekler (bir tribün mü, balkon mı, loca mı).",
      "Tür sözlüğü mimari rapordan gelir ve veritabanı CHECK kısıtıdır —",
      "sözlük dışı değer yayımda reddedilir.",
    ].join(" "),
    inputSchema: {
      level: z.string().describe("Kat yolu, ör. \"Maraton\" ya da \"Maraton / Üst\""),
      kind: z.enum(["floor", "balcony", "stand", "tier", "section",
        "box", "table_area", "general_admission_area"]),
    },
  }, async ({ level, kind }) => metin(session.mutate((plan) => {
    const s = sec(level, kind);
    const digerleri = (plan.sections || []).filter((x) => x.id !== s.id);
    return { ...plan, sections: [...digerleri, s] };
  }, `Bölüm türü: ${level} → ${kind}`)));

  /* ── şekiller ve kapılar ──────────────────────────────────────────── */
  server.registerTool("add_shape", {
    title: "Şekil ekle (sahne, saha, kapı, duvar...)",
    description: [
      "Koltuk üretmeyen nesneler. Türler:",
      "· stage — sahne · screen — perde/ekran · pitch — spor sahası (nizami ölçü)",
      "· door — kapı/turnike · wall — salon sınırı (koltuk dışına taşamaz)",
      "· standing — ayakta alan (kapasitesi olur) · note — metin etiketi",
      "",
      "pitch verirsen sport zorunlu; ölçü nizamnameden gelir, w/h yok sayılır.",
      "wall şekilleri salonun SINIRIDIR — dışına taşan koltuk hata sayılır.",
    ].join("\n"),
    inputSchema: {
      type: z.enum(["stage", "screen", "pitch", "door", "wall", "standing", "note"]),
      x: z.number(), y: z.number(),
      w: z.number().optional().describe("Genişlik (cm) — pitch dışında zorunlu"),
      h: z.number().optional().describe("Yükseklik (cm) — pitch dışında zorunlu"),
      rot: z.number().optional(),
      label: z.string().optional().describe("Görünen metin, ör. \"SAHNE\", \"KAPI 26\""),
      sport: z.enum(["football", "basket", "volley", "handball", "tennis", "hockey", "generic"])
        .optional().describe("pitch için zorunlu"),
      capacity: z.number().int().optional().describe("standing için kişi kapasitesi"),
      fs: z.number().optional().describe("Yazı boyu (cm)"),
    },
  }, async (a) => metin(session.mutate((plan) => {
    if (a.type === "pitch" && !a.sport) throw new Error("pitch için sport zorunlu.");
    if (a.type !== "pitch" && (a.w == null || a.h == null)) {
      throw new Error(`${a.type} için w ve h zorunlu.`);
    }
    const s = {
      id: nid("s"), kind: "rect", type: a.type,
      x: a.x, y: a.y, w: a.w ?? 0, h: a.h ?? 0, rot: a.rot ?? 0,
      label: a.label ?? "", capacity: a.capacity ?? 0, fs: a.fs ?? 150,
      ...(a.sport ? { sport: a.sport } : {}),
      ...(a.type === "door" ? { blocks: [] } : {}),
    };
    return { ...plan, shapes: [...(plan.shapes || []), s] };
  }, `Şekil eklendi: ${a.type}${a.label ? ` "${a.label}"` : ""}`)));

  server.registerTool("assign_gate", {
    title: "Kapıya blok ata",
    description: [
      "Hangi blokların bu kapıdan girildiğini yazar. ÖNEMLİ: bir blok BİRDEN",
      "ÇOK kapıdan girilebilir ve gerçekte sık öyledir (Şükrü Saracoğlu Maraton",
      "Üst A-E blokları KAPI 26 VE 27'den girilir; on mekânın dokuzunda çok",
      "kapılı blok var). Aynı bloğu birden çok kapıya atamaktan çekinme.",
      "",
      "replace: false ise mevcut atamaya EKLER.",
    ].join("\n"),
    inputSchema: {
      gate: z.string().describe("Kapının ETİKETİ (şekil kimliği DEĞİL), ör. \"KAPI 26\""),
      blocks: z.array(z.string())
        .describe("Blok kodları ya da kimlikleri — DİZİ olarak, ör. [\"A\",\"B\"]."
          + " Virgüllü tek dize kabul edilmez."),
      replace: z.boolean().optional().describe("true: mevcut atamayı sil, varsayılan true"),
    },
  }, async (a) => metin(session.mutate((plan) => {
    const kapi = (plan.shapes || []).find((s) => s.type === "door" && s.label === a.gate);
    if (!kapi) throw new Error(`Kapı bulunamadı: ${a.gate}`);
    const idler = a.blocks.map((x) => {
      const b = plan.blocks.find((y) => y.id === x || y.label === x);
      if (!b) throw new Error(`Blok bulunamadı: ${x}`);
      return b.id;
    });
    const onceki = a.replace === false ? (kapi.blocks || []) : [];
    return {
      ...plan,
      shapes: plan.shapes.map((s) => (s.id === kapi.id
        ? { ...s, blocks: [...new Set([...onceki, ...idler])] } : s)),
    };
  }, `${a.gate} → ${a.blocks.length} blok`)));

  server.registerTool("auto_gates", {
    title: "Kapıları mesafeye göre ata",
    description: [
      "Her bloğu en yakın kapı(lar)a bağlar. Gerçek kapı-blok eşlemesi elinde",
      "varsa assign_gate ile YAZ — bu araç tahmindir, kaynak değil. Kaynak",
      "yoksa makul bir başlangıç verir.",
    ].join(" "),
    inputSchema: {},
  }, async () => metin(session.mutate((plan) => ({
    ...plan,
    shapes: autoGates(plan, plan.blocks.map((b) => ({ b, m: buildMeta(b) }))),
  }), "Kapılar mesafeye göre atandı")));
}
