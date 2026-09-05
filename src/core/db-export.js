import { buildSeats, resolvePlanSections, resolveBlockSectionId, sectionPath,
  resolvePlanGroups, DEFAULT_SEAT_KIND } from "./geometry.js";

/* ══════════════════════════════════════════════════════════════════════════
   TABLO BİÇİMİNDE DIŞA AKTARIM

   seats.json okunabilir bir ÖZETTİR (bir plan, iç içe diziler). Bu dosya ise
   hedef şemanın TABLOLARINI üretir — her tablo için satır listesi, yabancı
   anahtarlarıyla. Karşı taraf doğrudan INSERT edebilir.

   Şemanın hiyerarşisi:  sections → rows → seats
   Editörünki:           bölüm → BLOK → satır → koltuk

   Aradaki tek fark blok. Çözüm: her blok bir YAPRAK bölüm olarak çıkıyor,
   üstünde de kat yolundan gelen zincir. Yani "Batı Tribünü / Alt Kat" katına
   ait "H" bloğu şu üç bölümü üretir:

       Batı Tribünü          (kök)
       └── Alt Kat           (kind: floor)
           └── H             (kind: section, blok)
               └── satırlar → koltuklar

   Bu, raporun §5.1'deki örneğinin birebir kendisi ve blok adresini
   koruyor — koltuğun tam adresi bölüm zincirinden okunabiliyor.

   NE ÜRETİLMEZ: fiyat, kategori, satılabilirlik, müsaitlik. Bunlar başka
   sistemin işi (rapor §4.3) ve bu editörün kapsamı dışında.
   ══════════════════════════════════════════════════════════════════════════ */

/* Şekil tipi → (shape_kind, geometry_kind). Rapor §6.3 ikisini AYRI tutuyor:
   geometry_kind nasıl çizileceğini, shape_kind ne olduğunu söyler. */
const SHAPE_MAP = {
  stage:    "stage",
  screen:   "screen",
  pitch:    "field",
  door:     "entrance",
  wall:     "wall",
  standing: "standing_area",
  note:     "label",
};

const slug = (s) => String(s || "").trim().replace(/\s+/g, "_").toLocaleUpperCase("tr");

/* Bir şeklin geometrisi: çokgen çizilmişse polygon.v1, ikon nokta,
   gerisi dikdörtgen. Editör başka bir şey üretmiyor — ölçüldü. */
function shapeGeometry(s) {
  if (s.kind === "poly" && Array.isArray(s.pts)) {
    return { geometry_kind: "polygon.v1",
      geometry_data: { points: s.pts.map((p) => ({ x: +p.x.toFixed(1), y: +p.y.toFixed(1) })) } };
  }
  if (s.kind === "icon") {
    return { geometry_kind: "point.v1",
      geometry_data: { x: +s.x.toFixed(1), y: +s.y.toFixed(1), rotation: +(s.rot || 0).toFixed(1) } };
  }
  return { geometry_kind: "rect.v1",
    geometry_data: { x: +s.x.toFixed(1), y: +s.y.toFixed(1),
      width: +(s.w || 0).toFixed(1), height: +(s.h || 0).toFixed(1),
      rotation: +(s.rot || 0).toFixed(1) } };
}

export function buildDbPayload(plan, metas, gates) {
  /* ── bölümler: kat zinciri + blok başına yaprak ─────────────────── */
  const sections = resolvePlanSections(plan).map((s) => ({
    id: s.id, parent_id: s.parentId ?? null,
    code: s.code, name: s.name, kind: s.kind,
  }));
  const known = new Set(sections.map((s) => s.id));
  const blockSection = new Map();          // blok id → yaprak bölüm id

  metas.forEach(({ b }) => {
    const ust = resolveBlockSectionId(b);
    const id = `blk:${b.id}`;
    blockSection.set(b.id, id);
    if (known.has(id)) return;
    known.add(id);
    sections.push({ id, parent_id: ust, code: b.label,
      name: b.name || b.label, kind: "section" });
  });

  /* ── koltuk tipleri: kullanılan her tür bir satır ──────────────── */
  const seatTypeId = (kind) => `st:${kind}`;
  const usedKinds = new Set();

  /* ── satırlar + koltuklar ──────────────────────────────────────── */
  const rows = [];
  const rowSeen = new Map();               // "blok|satır" → row id
  const seats = [];

  metas.forEach(({ b, m }) => {
    const secId = blockSection.get(b.id);
    const gate = (gates.get(b.id) || [])[0] || null;
    buildSeats(b, m, plan.idTemplate).seats.forEach((s) => {
      if (s.gap) return;
      const rowKey = `${b.id}|${s.row}`;
      let rowId = rowSeen.get(rowKey);
      if (!rowId) {
        rowId = `row:${b.id}:${slug(s.row)}`;
        rowSeen.set(rowKey, rowId);
        rows.push({ id: rowId, section_id: secId, code: String(s.row),
          name: String(s.row), sort_order: rows.length });
      }
      const kind = s.seatKind || DEFAULT_SEAT_KIND;
      usedKinds.add(kind);
      seats.push({
        id: `seat:${s.id}`,
        code: s.id,                        /* kalıcı adres — dış sistem kendi kodunu
                                              benimsetecekse CSV içe aktarımı bunu ezer */
        row_id: rowId,
        seat_type_id: seatTypeId(kind),
        group_id: s.groupId ? `grp:${s.groupId}` : null,
        label: s.num == null ? "" : String(s.num),
        x: +s.x.toFixed(1), y: +s.y.toFixed(1), rotation: +s.rot.toFixed(1),
        features: s.seatFeatures || [],
        entrance_id: gate ? `ent:${slug(gate)}` : null,
      });
    });
  });

  const seat_types = [...usedKinds].sort().map((k) => ({
    id: seatTypeId(k), code: k, name: k, seat_kind: k,
  }));

  /* ── gruplar ───────────────────────────────────────────────────── */
  const seat_groups = resolvePlanGroups(plan).map((g) => ({
    id: `grp:${g.id}`, section_id: blockSection.get(g.id) ?? null,
    code: g.code, name: g.name, kind: g.kind,
  }));

  /* ── şekiller: satılabilir envanterden ayrı (rapor kararı 5) ───── */
  const shapes = (plan.shapes || []).map((s, i) => ({
    id: `shp:${s.id}`,
    shape_kind: SHAPE_MAP[s.type] || (s.kind === "icon" ? "amenity" : "decoration"),
    ...shapeGeometry(s),
    z_index: i,
    label: s.label || "",
  }));

  /* ── girişler: kapı şekilleri + hangi bölümlere hizmet ettiği ──── */
  const doors = (plan.shapes || []).filter((s) => s.type === "door");
  const entrances = doors.map((d) => ({
    id: `ent:${slug(d.label)}`, code: slug(d.label), name: d.label || "",
  }));
  const entrance_sections = [];
  doors.forEach((d) => (d.blocks || []).forEach((bid) => {
    const sec = blockSection.get(bid);
    if (sec) entrance_sections.push({ entrance_id: `ent:${slug(d.label)}`, section_id: sec });
  }));

  return {
    space: { code: slug(plan.key || plan.name), name: plan.name },
    seat_plan: { code: slug(plan.key || plan.name), name: plan.name },
    seat_plan_version: {
      version: plan.published ?? null,
      status: plan.published ? "published" : "draft",
      unit: "cm",
    },
    sections, rows, seat_types, seat_groups, seats, shapes,
    entrances, entrance_sections,
  };
}
