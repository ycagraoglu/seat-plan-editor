import { DEF, SEAT_KINDS } from "../../src/core/geometry.js";
import { RULES } from "../../src/core/rules.js";

const json = (o) => ({ content: [{ type: "text", text: JSON.stringify(o, null, 2) }] });

function sessionState(session) {
  if (session.spreadsheetScan && !session.spreadsheetAnalysis) {
    return { phase: "spreadsheet-scanned", next: ["submit_spreadsheet_analysis"] };
  }
  if (session.spreadsheetAnalysis && !session.spreadsheetCompilation) {
    return { phase: "spreadsheet-semantics-ready", next: ["build_spreadsheet_layout"] };
  }
  if (session.spreadsheetCompilation && !session.spreadsheetVerified) {
    return { phase: "spreadsheet-compiled", next: ["verify_spreadsheet"] };
  }
  if (session.spreadsheetVerified) {
    return { phase: "spreadsheet-verified", next: ["render", "plan_summary", "export_plan"] };
  }
  if (!session.plan) {
    return { phase: "no-plan", next: ["scan_spreadsheet", "create_plan", "open_plan", "open_sample"] };
  }
  if (session.referenceMode && !session.referenceScan) {
    return { phase: "source-loaded", next: ["scan_reference"] };
  }
  if (session.referenceScan && !session.referenceAnalysis) {
    return { phase: "scanned", next: ["submit_reference_analysis"] };
  }
  if (session.referenceAnalysis && !session.referenceCompilation) {
    return { phase: "semantics-ready", next: ["replace_layout"] };
  }
  if (session.referenceCompilation && !session.referenceVerified) {
    return { phase: "compiled", next: ["verify_reference"] };
  }
  if (session.referenceVerified) {
    return { phase: "verified", next: ["render", "plan_summary", "export_plan"] };
  }
  return {
    phase: session.plan.blocks.length ? "editable-plan" : "blank-plan",
    next: session.plan.blocks.length
      ? ["plan_summary", "render", "validate"]
      : ["add_block", "add_shape", "set_underlay"],
  };
}

export function registerCapabilityTools(server, session) {
  server.registerTool("editor_capabilities", {
    title: "Editör yetenekleri ve çalışma bağlamı",
    description: [
      "Bir çizime başlamadan önce çağır. Editörün desteklediği geometriyi, koordinat",
      "anlamlarını, doğrulama sınırlarını, referans iş akışını, bilinen temsil",
      "sınırlarını ve mevcut oturumda sıradaki uygun araçları makine-okunur verir.",
      "Tahmin etmek yerine bu sözleşmeye göre araç seç.",
    ].join(" "),
    inputSchema: {},
  }, async () => json({
    unit: "cm",
    coordinateSystem: {
      axes: "x sağa, y aşağı doğru artar; rotasyon derecedir",
      grid: {
        x: "koltuk sırasının yatay merkezi",
        y: "ilk sıra çizgisi; sonraki sıralar +y yönünde rowGap kadar ilerler",
      },
      fan: {
        origin: "x/y yay merkezi; ilk sıra merkezden r0 uzaklıktadır",
        angles: "aStart/aEnd derece aralığı; satırlar r0 + sıra*rowGap yarıçapındadır",
      },
      table: { origin: "x/y masa merkezi" },
    },
    defaults: {
      seatWidth: DEF.seatW, seatHeight: DEF.seatH,
      seatGap: DEF.seatGap, rowGap: DEF.rowGap,
    },
    blocks: [
      { kind: "grid", useFor: "düz veya hafif kavisli sıralar",
        supports: ["değişken sıra koltuk sayısı", "taper", "curve", "rotation", "tek tip sıra hizası"] },
      { kind: "fan", useFor: "ortak merkezli kavisli parter veya tribün",
        supports: ["açı aralığı", "sabit açıklık veya sabit yay", "artan yarıçap"] },
      { kind: "table", useFor: "yuvarlak veya dikdörtgen masa çevresi" },
    ],
    seatKinds: Object.keys(SEAT_KINDS),
    numbering: {
      rows: ["number", "letter", "custom"],
      seats: ["seq", "odd", "even", "center", "center-in"],
      note: "Kaynakta basılı numara yoksa numaralandırmayı gerçek veri diye sunma.",
    },
    reference: {
      workflow: ["create_plan", "set_underlay", "scan_reference", "submit_reference_analysis",
        "replace_layout", "verify_reference"],
      supports: ["yerel piksel tarama", "otomatik koltuk merkezi ve sıra segmenti",
        "grid + ov ile birebir yerleşim", "PNG/JPEG/WebP/PDF", "perde/sahne/saha"],
      limits: { fileBytes: 25 * 1024 * 1024, rasterPixels: 40_000_000,
        pdfPage: 20, confidence: 0.97, positionalMatch: 0.99, focalIoU: 0.90 },
      limitations: [
        "İlk sürüm temiz dijital planlar içindir; salon fotoğrafı, el çizimi ve perspektif görüntü kapsam dışıdır.",
        "Metin anlamı/OCR tarayıcıdan değil Codex tarafından rowId gruplarına eklenir.",
        "Görselde okunmayan kapasite, kapı, koridor veya erişilebilirlik verisi tahmin edilmemelidir.",
      ],
    },
    spreadsheet: {
      workflow: ["scan_spreadsheet", "submit_spreadsheet_analysis",
        "build_spreadsheet_layout", "verify_spreadsheet"],
      extensions: [".xls", ".xlsx"],
      families: ["named-range-plan", "canvas-sheet-plan", "section-manifest", "flat-list"],
      limits: { fileBytes: 25 * 1024 * 1024, sheets: 200,
        filledCells: 1_000_000, seats: 100_000 },
      rules: [
        "Tek tek koltuk hücreleri kapasite özetinden üstündür.",
        "Formüller çalıştırılmaz; yalnız kayıtlı sonuç ve formül metni okunur.",
        "Kaynakta olmayan kapı, duvar, erişilebilir alan veya fiziksel şekil üretilmez.",
        "Bölüm manifestosunun saat yönlü halka yerleşimi türetilmiş geometridir.",
      ],
    },
    validation: {
      hardErrors: RULES.filter((r) => r.severity === "err").map((r) => r.id),
      warnings: RULES.filter((r) => r.severity === "warn").map((r) => r.id),
      geometryMustBeZero: ["seats-outside-boundary", "blocks-outside-boundary",
        "footprint-overlap-same-level", "seat-clash", "narrow-aisle", "seat-in-own-block",
        "seat-corners-outside-boundary"],
      dataIntegrityMustBeZero: ["duplicate-seat-ids", "unlabeled-seats", "orphan-blocks",
        "section-cycle", "section-depth", "section-sibling-code"],
      sourceDependent: ["wheelchair-adequacy", "companion-group-incomplete", "companion-orphan",
        "companion-seat-shortfall", "no-doors", "empty-doors"],
      note: "Yeni veya kötüleşen sert geometri/veri bulgusu mutasyonu geri alır. Kaynağa bağlı eksik veri uydurulmaz.",
    },
    session: sessionState(session),
  }));
}
