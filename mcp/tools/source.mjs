import { readFile } from "node:fs/promises";
import path from "node:path";
import { parseCSV, mapColumns, matchSeats, applyAdoptedIds } from "../../src/core/identity.js";
import { dbSeatRows } from "../../src/core/db-export.js";
import { buildMeta, buildSeats } from "../../src/core/geometry.js";

const metin = (t) => ({ content: [{ type: "text", text: t }] });

/* ══════════════════════════════════════════════════════════════════════════
   KAYNAK DOSYA — organizatörün gönderdiği liste

   Görsel NEREDE'yi verir, liste KAÇ TANE'yi. İkisi ayrı yarıdır ve tek
   başına ikisi de yetmez:
     görsel tek başına → yerleşim doğru, sayılar tahmin
     liste  tek başına → koltuklar doğru, yerleşim uydurma
   Editör ikisini birbirine denetletir; "386 koltuk eşleşti · 0 eksik ·
   0 fazla" cümlesi, olmayan koltuğu satma riskini kapatan şeydir.

   Eşleştirme mantığı core/identity.js'te (matchSeats) — arayüzün CSV içe
   aktarımı da aynı fonksiyonu çağırıyor, iki yerde ayrışmasın diye.
   ══════════════════════════════════════════════════════════════════════════ */

/** Dosyayı {block,row,seat,id} satırlarına indirger. CSV ya da db.json. */
async function satirlariOku(dosya) {
  const metinIcerik = await readFile(dosya, "utf8");
  const uzanti = path.extname(dosya).toLowerCase();

  if (uzanti === ".json") {
    const yuk = JSON.parse(metinIcerik);
    if (!Array.isArray(yuk?.seats) || !Array.isArray(yuk?.rows)) {
      throw new Error("db.json bekleniyordu: seats / rows tabloları bulunamadı.");
    }
    return { rows: dbSeatRows(yuk), cols: ["sections.code", "rows.code", "seats.label", "seats.code"] };
  }

  const satirlar = parseCSV(metinIcerik);
  if (satirlar.length < 2) throw new Error("CSV'de veri satırı yok.");
  const cols = mapColumns(satirlar[0]);
  const eksik = ["block", "row", "seat"].filter((k) => cols[k] == null);
  if (eksik.length) {
    throw new Error(`CSV sütunları eksik: ${eksik.join(", ")}.`
      + ` Tanınan başlıklar — blok/block/kısım · sıra/row/satır · koltuk/seat/no`
      + ` · kimlik/id/kod (kimlik yoksa yalnız SAYIM karşılaştırması yapılır).`);
  }
  return {
    rows: satirlar.slice(1).map((r) => ({
      block: r[cols.block], row: r[cols.row], seat: r[cols.seat],
      /* Kimlik sütunu yoksa satırın kendisini anahtar yap: eşleşme sayılır
         ama "benimsenecek kimlik" çıkmaz — sayım denetimi yine yapılır. */
      id: cols.id != null ? r[cols.id] : `${r[cols.block]}-${r[cols.row]}-${r[cols.seat]}`,
    })),
    cols: Object.keys(cols),
    kimlikVar: cols.id != null,
  };
}

export function registerSourceTools(server, session, z) {
  server.registerTool("match_seat_list", {
    title: "Koltuk listesiyle karşılaştır",
    description: [
      "Organizatörün listesini (CSV ya da db.json) çizimle karşılaştırır.",
      "GÖRSEL nerede olduğunu, LİSTE kaç tane olduğunu söyler — ikisi ayrı",
      "yarıdır, plan ancak ikisi tutunca güvenilirdir.",
      "",
      "Sonuç dört sayı:",
      "  eşleşti — hem listede hem çizimde",
      "  eksik   — LİSTEDE VAR, ÇİZİMDE YOK → o koltukları çizmedin",
      "  fazla   — ÇİZİMDE VAR, LİSTEDE YOK → fazladan çizdin",
      "  tekrar  — listede aynı koltuk iki kez",
      "Eksik ya da fazla varsa plan HENÜZ DOĞRU DEĞİL; bloğun sıra/koltuk",
      "sayısını düzelt ve tekrar karşılaştır.",
      "",
      "Tanınan CSV başlıkları: blok/block · sıra/row · koltuk/seat/no ·",
      "kimlik/id/kod · kat/tribün. \"A BLOK\" → \"A\" gibi temizlemeler otomatik.",
    ].join("\n"),
    inputSchema: {
      path: z.string().describe("CSV ya da db.json dosya yolu"),
      samples: z.number().int().min(0).max(50).optional()
        .describe("Örnek gösterilecek uyuşmazlık sayısı, varsayılan 8"),
    },
  }, async ({ path: dosya, samples = 8 }) => {
    const plan = session.need();
    const { rows, cols, kimlikVar = true } = await satirlariOku(dosya);
    if (!rows.length) throw new Error("Dosyada koltuk satırı yok.");

    const metas = plan.blocks.map((b) => ({ b, m: buildMeta(b) }));
    const r = matchSeats(rows, metas, buildSeats, plan.idTemplate);
    session.match = { ...r, file: path.basename(dosya), kimlikVar };

    const cizim = metas.reduce((a, x) => a + x.m.seatCount, 0);
    const sat = [
      `${path.basename(dosya)} · ${rows.length.toLocaleString("tr-TR")} satır`
      + ` · sütunlar: ${cols.join(", ")}`,
      `çizimde ${cizim.toLocaleString("tr-TR")} koltuk`,
      "",
      `EŞLEŞTİ  ${r.hits.length.toLocaleString("tr-TR")}`,
      `EKSİK    ${r.missing.length.toLocaleString("tr-TR")}  (listede var, çizimde yok)`,
      `FAZLA    ${r.extra.length.toLocaleString("tr-TR")}  (çizimde var, listede yok)`,
      `TEKRAR   ${r.dupes.length.toLocaleString("tr-TR")}`,
    ];
    if (r.missing.length) {
      sat.push("", "eksik örnekleri: "
        + r.missing.slice(0, samples).map((x) => x.key).join(" · "));
    }
    if (r.extra.length) {
      sat.push("fazla örnekleri: "
        + r.extra.slice(0, samples).map((s) => `${s.block}|${s.row}|${s.num}`).join(" · "));
    }
    sat.push("", r.missing.length || r.extra.length
      ? "SONUÇ: plan listeyle TUTMUYOR — blok sıra/koltuk sayılarını düzelt."
      : "SONUÇ: liste ile çizim BİREBİR tutuyor.");
    if (kimlikVar && r.changing.length) {
      sat.push(`${r.changing.length.toLocaleString("tr-TR")} koltuğun kimliği listedekinden farklı`
        + ` — adopt_ids ile listedeki kimliği benimseyebilirsin.`);
    }
    return metin(sat.join("\n"));
  });

  server.registerTool("remove_extra_seats", {
    title: "Listede olmayan koltukları kaldır",
    description: [
      "match_seat_list'in FAZLA dediği koltukları kaldırır — yani çizimde",
      "olup organizatörün listesinde olmayanları.",
      "",
      "Gerçek salonlarda bu fazlalık genelde MİMARİ bir boşluktur: kapı,",
      "merdiven, tekerlekli sandalye platformu. Bir tribünün ortasından",
      "geçen tünel için cut_vomitories daha doğrudur; bu araç dağınık,",
      "tek tek koltuklar için.",
      "",
      "Koltuk plandan silinmez, KAPALI işaretlenir — geri alınabilir ve",
      "kalan koltukların kimliği bozulmaz.",
      "",
      "Önce match_seat_list çağır.",
    ].join("\n"),
    inputSchema: {
      limit: z.number().int().positive().optional()
        .describe("En fazla kaç koltuk kaldırılsın (güvenlik freni)"),
    },
  }, async ({ limit }) => {
    if (!session.match) throw new Error("Önce match_seat_list çağır.");
    const fazla = session.match.extra || [];
    if (!fazla.length) return metin("Fazla koltuk yok — çizim listeyle örtüşüyor.");
    if (limit && fazla.length > limit) {
      throw new Error(`${fazla.length} fazla koltuk var, limit ${limit}. `
        + `Bu kadar çok fazlalık genelde blok sıra/koltuk sayısının yanlış `
        + `olduğunu gösterir — önce onu düzeltmeyi düşün. Yine de kaldırmak `
        + `istiyorsan limit'i yükselt.`);
    }
    const byB = new Map();
    fazla.forEach((s) => {
      if (!s.bid) return;
      if (!byB.has(s.bid)) byB.set(s.bid, []);
      byB.get(s.bid).push(`${s.r},${s.c}`);
    });
    const ozet = session.mutate((plan) => ({
      ...plan,
      blocks: plan.blocks.map((b) => {
        const list = byB.get(b.id);
        if (!list) return b;
        const ov = { ...b.ov };
        list.forEach((rc) => { ov[rc] = { ...(ov[rc] || {}), rm: true, gap: false }; });
        return { ...b, ov };
      }),
    }), `${fazla.length} fazla koltuk kaldırıldı`);
    session.match = { ...session.match, extra: [] };
    return metin(ozet);
  });

  server.registerTool("adopt_ids", {
    title: "Listedeki kimliği benimse",
    description: [
      "Eşleşen koltuklara LİSTEDEKİ kimliği yazar. Çizimi DEĞİŞTİRMEZ,",
      "yalnız kimlik uyarlanır.",
      "",
      "Mekân zaten bilet satıyorsa kalıcı koltuk kodu ONLARDADIR ve",
      "değişemez — biz ona uyarız. Önce match_seat_list çağır.",
    ].join("\n"),
    inputSchema: {},
  }, async () => {
    if (!session.match) throw new Error("Önce match_seat_list çağır.");
    if (!session.match.kimlikVar) {
      throw new Error("Listede kimlik sütunu yok — benimsenecek kimlik de yok.");
    }
    const n = session.match.changing.length;
    if (!n) return metin("Benimsenecek fark yok — kimlikler zaten listedekiyle aynı.");
    const ozet = session.mutate((plan) => applyAdoptedIds(plan, session.match.changing),
      `${n.toLocaleString("tr-TR")} koltuk kimliği benimsendi`);
    session.match = { ...session.match, changing: [] };
    return metin(ozet);
  });
}
