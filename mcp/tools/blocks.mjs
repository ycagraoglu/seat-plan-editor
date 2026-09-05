import { gr, fanB, tbl } from "../../src/venues/builders.js";
import { reLabel, relevelPatch, DEF_NUM } from "../../src/core/labels.js";
import { linearArray, radialArray } from "../../src/core/arrays.js";
import { nid } from "../../src/core/ids.js";

const metin = (t) => ({ content: [{ type: "text", text: t }] });

/* Numaralandırmadan sonra sonucu GÖSTER. "ayarlandı" yazısı yanlış şema
   uygulandığında da çıkıyordu; etiketleri görmeden doğrulanamıyordu. */
function siraOzeti(session, id) {
  const b = session.summaryData().blocks.find((x) => x.id === id || x.label === id);
  return b ? `  sıralar: ${b.rowLabels.join(" · ")}` : "";
}

/* Blok araçları. Hepsi src/venues/builders.js'in ince sarmalayıcısı —
   burada yeni geometri kodu YOK, olmamalı da: aynı kural iki yere
   yazılırsa "editörde şöyle, MCP'de böyle" ayrışması başlar. */
export function registerBlockTools(server, session, z) {
  const bul = (plan, id) => {
    const b = plan.blocks.find((x) => x.id === id || x.label === id);
    if (!b) throw new Error(`Blok bulunamadı: ${id}`);
    return b;
  };

  server.registerTool("add_block", {
    title: "Blok ekle",
    description: [
      "Koltuk üreten bir blok ekler. Türler:",
      "· grid — düz ızgara (parter, balkon, tribün düzlüğü). rows + cols ya da counts.",
      "· fan  — yelpaze (kavisli tribün, opera parteri). rows + r0 + aStart/aEnd.",
      "· table — masa etrafı oturma (bar, gala). seats + tW.",
      "",
      "KAT YOLU ÖNEMLİ: level alanına \"Maraton / Üst\" gibi YOL yazarsan bölüm",
      "ağacı kurulur (üst bölüm + alt kademe). Düz yazarsan hiyerarşi oluşmaz.",
      "",
      "counts biçimi: \"20\" sabit · \"21..15\" azalan · \"5,5,6\" tek tek.",
      "Boş bırakırsan cols (grid) ya da yarıçaptan hesap (fan) kullanılır.",
    ].join("\n"),
    inputSchema: {
      kind: z.enum(["grid", "fan", "table"]).describe("Blok türü"),
      label: z.string().describe("Blok kodu — kat içinde tekil olmalı, ör. \"A\", \"112\""),
      level: z.string().describe("Kat/bölüm yolu, ör. \"Parter\" ya da \"Maraton / Üst\""),
      x: z.number().describe("Bloğun yatay MERKEZİ (cm)"),
      y: z.number().describe("İLK SIRANIN çizgisi (cm) — bloğun merkezi DEĞİL."
        + " Sıralar +y yönünde geriye doğru dizilir; blok y'den aşağı uzar."
        + " Gerçek yerini plan_summary'deki bbox'tan oku."),
      name: z.string().optional().describe("Okunur ad, ör. \"Maraton Üst A Blok\""),
      rot: z.number().optional().describe("Dönüş (derece)"),
      rows: z.number().int().positive().optional().describe("Sıra sayısı (grid/fan)"),
      cols: z.number().int().positive().optional().describe("Sıra başına koltuk (grid)"),
      counts: z.string().optional().describe("Sıra başına koltuk deseni"),
      seatGap: z.number().optional().describe("Koltuk aralığı, varsayılan 50 cm"),
      rowGap: z.number().optional().describe("Sıra aralığı, varsayılan 90 cm (fan 105)"),
      curve: z.number().optional().describe("Grid kavisi (cm sehim)"),
      taper: z.number().optional().describe("Sıra başına koltuk artışı (grid)"),
      r0: z.number().optional().describe("Fan: ilk sıra yarıçapı (cm)"),
      aStart: z.number().optional().describe("Fan: başlangıç açısı (derece)"),
      aEnd: z.number().optional().describe("Fan: bitiş açısı (derece)"),
      mode: z.enum(["pitch", "span"]).optional().describe("Fan: span = açı sabit"),
      seats: z.number().int().positive().optional().describe("Table: masa etrafı koltuk sayısı"),
      tW: z.number().optional().describe("Table: masa çapı (cm)"),
      align: z.enum(["center", "left", "right"]).optional(),
      pad: z.number().optional().describe("Taban payı (cm) — bloğun koltukların ötesinde kapladığı pay"),
      aCenter: z.number().optional().describe("Fan: yay merkezi açısı"),
      color: z.string().optional().describe("Blok rengi (#RRGGBB); verilmezse kata göre otomatik"),
    },
  }, async (a) => metin(session.mutate((plan) => {
    /* Türe göre ZORUNLU alanlar. Eksikse blok yine kurulurdu ama sessizce
       yanlış olurdu: rows'suz grid 0 koltuk üretip "Blok eklendi" diyordu,
       r0'suz fan geometrisi bozuk koltuklar üretiyordu. LLM ikisinde de
       çalıştı sanır. Sessiz başarısızlık bu projedeki en pahalı hata
       sınıfı — araç sınırında kesiliyor. */
    const eksik = [];
    if (a.kind === "table") {
      if (!a.seats) eksik.push("seats (masa etrafı koltuk sayısı)");
    } else {
      if (!a.rows) eksik.push("rows (sıra sayısı)");
      if (a.kind === "fan" && a.r0 == null) eksik.push("r0 (ilk sıra yarıçapı, cm)");
      if (a.kind === "grid" && !a.cols && !a.counts) {
        eksik.push("cols ya da counts (sıra başına koltuk)");
      }
    }
    if (eksik.length) {
      throw new Error(`${a.kind} bloğu için eksik alan: ${eksik.join(" · ")}.`
        + ` Verilmezse blok kurulur ama koltukları yanlış olur.`);
    }

    let b;
    if (a.kind === "table") {
      b = tbl(a.label, a.x, a.y, a.seats ?? 4, a.tW ?? 120, 0);
      b.level = a.level;
    } else {
      const ortak = { label: a.label, level: a.level, x: a.x, y: a.y };
      const opsiyonel = {};
      for (const k of ["name", "rot", "rows", "cols", "counts", "seatGap", "rowGap",
        "curve", "taper", "r0", "aStart", "aEnd", "mode", "align", "pad", "aCenter", "color"]) {
        if (a[k] !== undefined) opsiyonel[k] = a[k];
      }
      b = a.kind === "fan" ? fanB({ ...ortak, ...opsiyonel }) : gr({ ...ortak, ...opsiyonel });
      /* reLabel: kodu yazmakla kalmaz, sayısal alanları da yuvarlar —
         builders.js'in kendi seed'i de aynısını yapıyor. */
      b = reLabel(b, a.label);
    }
    return { ...plan, blocks: [...plan.blocks, b] };
  }, `Blok eklendi: ${a.label} (${a.kind})`)));

  server.registerTool("update_block", {
    title: "Blok değiştir",
    description: [
      "Var olan bloğun alanlarını değiştirir. Yalnız verdiğin alanlar değişir.",
      "Konum düzeltmek, sıra/koltuk sayısını ayarlamak, kat yolunu düzeltmek için.",
    ].join(" "),
    inputSchema: {
      id: z.string().describe("Blok kimliği ya da kodu"),
      label: z.string().optional(),
      level: z.string().optional(),
      name: z.string().optional(),
      x: z.number().optional(), y: z.number().optional(), rot: z.number().optional(),
      rows: z.number().int().positive().optional(),
      cols: z.number().int().positive().optional(),
      counts: z.string().optional(),
      seatGap: z.number().optional(), rowGap: z.number().optional(),
      curve: z.number().optional(), taper: z.number().optional(),
      r0: z.number().optional(), aStart: z.number().optional(), aEnd: z.number().optional(),
      align: z.enum(["center", "left", "right"]).optional(),
      pad: z.number().optional().describe("Taban payı (cm)"),
    },
  }, async ({ id, ...yama }) => metin(session.mutate((plan) => {
    const hedef = bul(plan, id);
    const temiz = Object.fromEntries(Object.entries(yama).filter(([, v]) => v !== undefined));
    return {
      ...plan,
      blocks: plan.blocks.map((b) => {
        if (b.id !== hedef.id) return b;
        let nb = { ...b, ...temiz };
        /* label ve level'ın kendi yama fonksiyonları var (koltuk kimlikleri
           ve bölüm bağı onlara bağlı) — düz atama yetmez. */
        if (temiz.label !== undefined) nb = reLabel(nb, temiz.label);
        if (temiz.level !== undefined) nb = { ...nb, ...relevelPatch(nb, temiz.level) };
        return nb;
      }),
    };
  }, `Blok güncellendi: ${id}`)));

  server.registerTool("delete_block", {
    title: "Blok sil",
    description: "Bloğu ve ürettiği koltukları kaldırır. Kapı atamalarından da düşer.",
    inputSchema: { id: z.string().describe("Blok kimliği ya da kodu") },
  }, async ({ id }) => metin(session.mutate((plan) => {
    const hedef = bul(plan, id);
    return {
      ...plan,
      blocks: plan.blocks.filter((b) => b.id !== hedef.id),
      /* Kapıların blocks[] dizisinden de düşür — yoksa çözülmeyen referans kalır. */
      shapes: (plan.shapes || []).map((s) => (s.blocks
        ? { ...s, blocks: s.blocks.filter((bid) => bid !== hedef.id) } : s)),
    };
  }, `Blok silindi: ${id}`)));

  server.registerTool("array_blocks", {
    title: "Blok dizisi",
    description: [
      "Bir bloğu çoğaltır: linear = aralıklı kopyalar (tribün boyunca bloklar),",
      "radial = merkez etrafında döndürerek (kâse dilimleri).",
      "Kodlar otomatik ilerler (A → B → C, 101 → 102 → 103).",
    ].join(" "),
    inputSchema: {
      id: z.string().describe("Çoğaltılacak blok"),
      mode: z.enum(["linear", "radial"]),
      count: z.number().int().min(2).describe("TOPLAM blok sayısı, asıl dahil (9 blok istiyorsan 9 yaz)"),
      dx: z.number().optional().describe("linear: X adımı (cm)"),
      dy: z.number().optional().describe("linear: Y adımı (cm)"),
      cx: z.number().optional().describe("radial: merkez X"),
      cy: z.number().optional().describe("radial: merkez Y"),
      step: z.number().optional().describe("radial: açı adımı (derece)"),
    },
  }, async (a) => metin(session.mutate((plan) => {
    const hedef = bul(plan, a.id);
    const yeni = a.mode === "linear"
      ? linearArray([hedef], { count: a.count, dx: a.dx ?? 0, dy: a.dy ?? 0 })
      : radialArray([hedef], { count: a.count, cx: a.cx ?? 0, cy: a.cy ?? 0, step: a.step ?? 30 });
    return { ...plan, blocks: [...plan.blocks, ...yeni.map((b) => ({ ...b, id: b.id || nid() }))] };
  }, `${a.count} bloğa çoğaltıldı (${a.mode})`)));

  server.registerTool("set_numbering", {
    title: "Numaralandırma",
    description: [
      "Bloğun sıra ve koltuk numaralandırmasını ayarlar. Gerçek salonlarda:",
      "· rowStart 1 olmak ZORUNDA DEĞİL (Şükrü Saracoğlu Maraton Alt: 4–25).",
      "· rowRev true ise numara sahadan GERİYE akar (sıra 25 sahaya en yakın).",
      "· skipAmbig harf şemasında I, O, Q'yu atlar (1 ve 0 ile karışır) — standart.",
      "· Sıra ortadan tek/çift bölünüyorsa (\"ÇİFT NUMARALAR / TEK NUMARALAR\")",
      "  iki gelenek var, plandaki sayılara bakıp seç:",
      "    center    → 18,16,…,2 | 3,5,…,17   (1 ve 2 MERKEZDE)",
      "    center-in → 2,4,…,18 | 15,13,…,1   (1 ve 2 DUVARLARDA)",
      "  seatDir bu ikisini AYNALAR — hangi yarının TEK olduğu salona göre",
      "  değişir, planda sol uçtaki sayıya bak:",
      "    ltr → sol yarı ÇİFT (Ege Ü. AKM:      2,4,…,20 | 17,…,1)",
      "    rtl → sol yarı TEK  (Bursa Tayyare:   1,3,…,19 | 18,…,2)",
      "  Tek sayıda koltukta ORTA KOLTUĞUN paritesini de bu belirler.",
      "  Sırayı iki bloğa BÖLME; bölersen aradaki koltuk aralığı sahte bir",
      "  \"dar geçit\" hatası doğurur. (Gerçek geçit varsa bölmek DOĞRUDUR:",
      "  o zaman iki yarıyı odd/even + seatDir ile numaralandır.)",
      "· seatScheme odd/even: tek/çift numaralandırma (101,103… / 102,104…).",
      "· rowCustom ile özel sıra listesi verilebilir: \"AA,BB,A,B,C\".",
      "",
      "DEĞERLER — rowScheme: number | letter | custom",
      "           seatScheme: seq | odd | even | center | center-in",
      "           seatDir: ltr | rtl · anchor: order | column",
      "",
      "Yanıt, sonuçtaki SIRA ETİKETLERİNİ geri verir — doğru şemayı",
      "uyguladığını oradan doğrula, \"ayarlandı\" yazısına güvenme.",
    ].join("\n"),
    inputSchema: {
      id: z.string().describe("Blok kimliği ya da kodu"),
      rowScheme: z.enum(["number", "letter", "custom"]).optional(),
      rowStart: z.number().int().optional().describe("İlk sıranın numarası"),
      rowRev: z.boolean().optional().describe("Sıra numarası ters aksın mı"),
      rowCustom: z.string().optional().describe("Özel sıra listesi, virgülle"),
      skipAmbig: z.boolean().optional().describe("Harf şemasında I/O/Q atla"),
      seatScheme: z.enum(["seq", "odd", "even", "center", "center-in"]).optional()
        .describe("seq: 1,2,3 · odd: 1,3,5 · even: 2,4,6 · "
          + "center: 1 ve 2 MERKEZDE, numara duvarlara doğru büyür "
          + "(18,16,…,2 | 3,5,…,17) · "
          + "center-in: 1 ve 2 DUVARLARDA, numara merkeze doğru büyür "
          + "(2,4,…,18 | 15,13,…,1). "
          + "\"ÇİFT NUMARALAR / TEK NUMARALAR\" yazan planlar bu ikisinden "
          + "birini ister — HANGİSİ olduğunu plandaki sayılara bakarak seç. "
          + "seatDir ikisini de AYNALAR: ltr sol yarıyı ÇİFT, rtl sol yarıyı "
          + "TEK yapar (tek sayıda koltukta orta koltuğun paritesi de değişir). "
          + "Sırayı iki bloğa BÖLME; bölersen aradaki koltuk aralığı sahte "
          + "bir \"dar geçit\" hatası doğurur."),
      seatDir: z.enum(["ltr", "rtl"]).optional(),
      seatStart: z.number().int().optional(),
      skip: z.string().optional().describe("Atlanacak koltuk numaraları"),
      anchor: z.enum(["order", "column"]).optional(),
    },
  }, async ({ id, ...num }) => metin(session.mutate((plan) => {
    const hedef = bul(plan, id);
    const temiz = Object.fromEntries(Object.entries(num).filter(([, v]) => v !== undefined));
    return {
      ...plan,
      blocks: plan.blocks.map((b) => (b.id === hedef.id
        ? { ...b, num: { ...DEF_NUM, ...b.num, ...temiz } } : b)),
    };
  }, `Numaralandırma: ${id}`) + "\n" + siraOzeti(session, id)));
}
