import { gr } from "../../src/venues/builders.js";
import { DEF_NUM, reLabel } from "../../src/core/labels.js";
import { nid } from "../../src/core/ids.js";

const json = (o) => ({ content: [{ type: "text", text: JSON.stringify(o, null, 2) }] });
const SEAT_GAP = 50;
const ROW_GAP = 90;
const temizMetin = (v) => String(v ?? "").replace(/\p{Cf}/gu, "").trim();

/* Referans görseli önce zorunlu, denetlenebilir bir ara gösterime çevirir;
   çizim bu veriden tek seferde üretilir. */
export function registerReferenceTools(server, session, z) {
  const kutu = z.object({
    x: z.number().min(0).max(1000).describe("Referansta sol kenar, 0..1000"),
    y: z.number().min(0).max(1000).describe("Referansta üst kenar, 0..1000"),
    w: z.number().positive().max(1000).describe("Referanstaki genişlik, 0..1000"),
    h: z.number().positive().max(1000).describe("Referanstaki yükseklik, 0..1000"),
  });
  const satir = z.object({
    label: z.string().min(1).describe("Görselde yazan sıra etiketi"),
    seats: z.number().int().positive().describe("Bu segmentte görülen koltuk sayısı"),
  });
  const analiz = z.object({
    venueKind: z.enum(["cinema", "theater", "stadium", "arena", "general"]),
    focal: z.object({
      type: z.enum(["screen", "stage", "pitch"]),
      label: z.string().min(1),
      bbox: kutu,
    }).optional().describe("Görseldeki perde, sahne veya saha"),
    boundary: kutu.optional().describe("Görülüyorsa salon dış sınırı"),
    blocks: z.array(z.object({
      label: z.string().optional().describe("Yalnız kaynakta görünür blok etiketi varsa"),
      name: z.string().optional(),
      level: z.string().min(1).describe("Kat veya bölüm adı"),
      bbox: kutu.describe("Bu oturma grubunun referanstaki kutusu"),
      rows: z.array(satir).min(1).describe("Görselde üstten alta sıralar"),
      align: z.enum(["left", "center", "right"]).optional(),
    })).min(1),
    observations: z.array(z.string()).min(1)
      .describe("Koridorlar, boşluklar, yön ve belirsizlikler"),
  });

  server.registerTool("submit_reference_analysis", {
    title: "Referans analizini kaydet",
    description: [
      "Yüklenen görselden gördüğün yapıyı çizimden ÖNCE zorunlu JSON olarak kaydeder.",
      "Aynı hizada ardışık duran ve aralarında gerçek yatay koridor olmayan sıraları tek",
      "oturma grubunda birleştir. Yalnız kaynaktaki fiziksel boşluk grubu bölüyorsa ayır.",
      "Kaynakta blok adı yoksa label verme. bbox değerleri görselin 0..1000 ölçeğindedir.",
      "Sıra etiketini ve o segmentte gerçekten görülen koltuk sayısını tek tek yaz.",
      "Tahmin ettiğin veya göremediğin şeyi gerçekmiş gibi ekleme.",
    ].join("\n"),
    inputSchema: analiz.shape,
  }, async (a) => {
    if (["cinema", "theater", "stadium", "arena"].includes(a.venueKind) && !a.focal) {
      throw new Error("Bu mekân türünde perde/sahne/saha (focal) zorunlu.");
    }
    const kodlar = a.blocks.map((b) => temizMetin(b.label)).filter(Boolean);
    if (new Set(kodlar).size !== kodlar.length) throw new Error("Blok kodları tekil olmalı.");
    session.referenceAnalysis = structuredClone(a);
    return json({
      accepted: true,
      blocks: a.blocks.map((b, i) => ({ label: temizMetin(b.label) || `(etiketsiz ${i + 1})`, rows: b.rows.length,
        rowLabels: b.rows.map((r) => r.label), seats: b.rows.reduce((n, r) => n + r.seats, 0) })),
      totalSeats: a.blocks.flatMap((b) => b.rows).reduce((n, r) => n + r.seats, 0),
      instruction: "Özet kaynakla uyuşuyorsa replace_layout çağır; uyuşmuyorsa analizi düzeltip yeniden gönder.",
    });
  });

  server.registerTool("replace_layout", {
    title: "Yerleşimi referans analiziyle değiştir",
    description: [
      "submit_reference_analysis ile kaydedilen doğrulanmış analizi tek işlemde plana çevirir.",
      "Mevcut blok ve şekilleri değiştirir; tek tek add_block/update_block çağırma.",
      "Sonra render ile kaynak üstünde karşılaştır; analiz yanlışsa onu yeniden gönderip tekrar kur.",
    ].join(" "),
    inputSchema: {},
  }, async () => {
    const a = session.referenceAnalysis;
    if (!a) throw new Error("Önce submit_reference_analysis çağır.");

    const sx = Math.max(1, ...a.blocks.map((b) =>
      (Math.max(...b.rows.map((r) => r.seats)) * SEAT_GAP) / b.bbox.w));
    const sy = Math.max(1, ...a.blocks.map((b) =>
      (b.rows.length * ROW_GAP) / b.bbox.h));
    const wx = (v) => (v - 500) * sx;
    const wy = (v) => (v - 500) * sy;

    const blocks = a.blocks.map((b) => {
      const label = temizMetin(b.label);
      const block = gr({
      label,
      name: temizMetin(b.name) || label,
      level: b.level,
      x: wx(b.bbox.x + b.bbox.w / 2),
      y: wy(b.bbox.y),
      rows: b.rows.length,
      counts: b.rows.map((r) => r.seats).join(","),
      seatGap: SEAT_GAP,
      rowGap: ROW_GAP,
      align: b.align || "center",
      num: { ...DEF_NUM, rowScheme: "custom",
        rowCustom: b.rows.map((r) => r.label).join(",") },
      });
      return label ? reLabel(block, label) : block;
    });

    const sekil = (type, label, b) => ({
      id: nid("s"), kind: "rect", type, label,
      x: wx(b.x + b.w / 2), y: wy(b.y + b.h / 2),
      w: Math.max(type === "wall" ? 200 : 100, b.w * sx),
      h: Math.max(type === "wall" ? 200 : 40, b.h * sy),
      rot: 0, capacity: 0, fs: 150,
    });
    const shapes = [
      ...(a.boundary ? [sekil("wall", "SALON SINIRI", a.boundary)] : []),
      ...(a.focal ? [sekil(a.focal.type, a.focal.label, a.focal.bbox)] : []),
    ];

    const underlayRect = { x: wx(0), y: wy(0), w: 1000 * sx, h: 1000 * sy };
    const metin = session.mutate((plan) => ({ ...plan, blocks, shapes,
      underlayRect: plan.underlay ? underlayRect : plan.underlayRect }),
      `Referans analizi çizildi: ${blocks.length} blok`, { reference: true });
    return json({ built: true, summary: metin, underlayAligned: !!session.plan.underlay,
      scale: { x: +sx.toFixed(3), y: +sy.toFixed(3) } });
  });
}
