import { buildSeats, resolvePlanSections, resolveBlockSectionId, sectionPath,
  resolvePlanGroups, DEFAULT_SEAT_KIND, SECTION_SEP } from "./geometry.js";

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

const r1 = (n) => +(+n).toFixed(1);
const pts = (ps) => ps.map((p) => ({ x: r1(p.x), y: r1(p.y) }));

/* Bölüm geometrisi — rapor §6.1: geometri SECTION üzerindedir ("mevcut
   uygulama section geometrisinde yalnızca rect.v1 destekliyor", §6.2 bunu
   dokuz türe açıyor). Editörün yaprak bölümü blok olduğu için geometri
   bloğun tabanından okunur:

     fan            → arc.v1      raporun "kavisli tribün" satırı, birebir
     yuvarlak masa  → ellipse.v1  raporun "yuvarlak masa" satırı, birebir
     diğer          → polygon.v1  taban çokgeni — kesin, yaklaşıklık yok

   rect.v1'e DÜŞÜRÜLMEZ: dönmüş bir bloğun dünya hizalı bbox'ı gerçek
   tabanı değildir; çokgen zaten kesin. Birden çok bloğun birleştiği
   bölümde (Zorlu ORK-*) tek bir taban yok — geometri null bırakılır,
   uydurulmuş bir birleşim çokgeni üretilmez. */
function sectionGeometry(b, m) {
  if (b.kind === "fan") {
    const derinlik = m.P.counts.length * b.rowGap;
    return { geometry_kind: "arc.v1", geometry_data: {
      cx: r1(b.x), cy: r1(b.y), r_inner: r1(b.r0), r_outer: r1(b.r0 + derinlik),
      a_start: r1(b.aStart), a_end: r1(b.aEnd), rotation: r1(b.rot || 0) } };
  }
  if (b.kind === "table" && b.tShape === "round") {
    const R = Math.max(...m.outline.map((p) => Math.hypot(p.x - m.cx, p.y - m.cy)));
    return { geometry_kind: "ellipse.v1", geometry_data: {
      cx: r1(m.cx), cy: r1(m.cy), rx: r1(R), ry: r1(R), rotation: 0 } };
  }
  return { geometry_kind: "polygon.v1", geometry_data: { points: pts(m.outline) } };
}

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

  /* Aynı kat altında aynı kodu taşıyan bloklar TEK bölümdür. Editor bir
     bölümü geometrisi değiştiği için birden çok bloğa böler (Zorlu'da
     "ORK-O" ön/orta/arka üç blok, ama salonda tek bir orkestra ortasıdır).
     Her bloğa ayrı bölüm açmak hem gerçeği bozar hem de raporun
     UNIQUE (parent_section_id, code) kısıtını çiğner. */
  const cokBloklu = new Set();
  metas.forEach(({ b, m }) => {
    const ust = resolveBlockSectionId(b);
    const id = `${ust}${SECTION_SEP}${b.label}`;
    blockSection.set(b.id, id);
    if (known.has(id)) { cokBloklu.add(id); return; }
    known.add(id);
    sections.push({ id, parent_id: ust, code: b.label,
      name: b.name || b.label, kind: "section", ...sectionGeometry(b, m) });
  });
  /* Birden çok bloğun birleştiği bölümün tek tabanı yok (yukarıdaki nota
     bakınız): ilk bloğunkini bölümün tamamıymış gibi bildirmek yanlış olur. */
  sections.forEach((s) => {
    if (!cokBloklu.has(s.id)) return;
    s.geometry_kind = null; s.geometry_data = null;
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
      const rowKey = `${secId}|${s.row}`;
      let rowId = rowSeen.get(rowKey);
      if (!rowId) {
        rowId = `row:${secId}:${slug(s.row)}`;
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
    id: `grp:${g.id}`, section_id: blockSection.get(g.blockId ?? g.id) ?? null,
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
  const esSeen = new Set();
  doors.forEach((d) => (d.blocks || []).forEach((bid) => {
    const sec = blockSection.get(bid);
    if (!sec) return;
    const ent = `ent:${slug(d.label)}`;
    const k = `${ent}\u0000${sec}`;
    if (esSeen.has(k)) return;               /* birleşen bloklar aynı kapıyı paylaşabilir */
    esSeen.add(k);
    entrance_sections.push({ entrance_id: ent, section_id: sec });
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

/* ══════════════════════════════════════════════════════════════════════════
   GERİ OKUMA

   Dışa aktarımın tersi DEĞİL — olamaz da: db.json bölüm/satır/koltuk taşır,
   editörün bloğu ise "20 sıra, 21..15 koltuk, 8° kavis, şu numaralandırma
   şeması" gibi bir ÜRETİM TARİFİDİR. Koltuk konumlarından o tarifi geri
   çıkarmak (ızgara mı yelpaze mi, kavis kaç derece) tahmindir; tahminle
   sessizce yanlış blok üretmektense hiç üretmemek doğrudur.

   Geri okunan şey KİMLİKTİR. Kalıcı koltuk kodunun sahibi karşı sistemdir
   (bkz. README "Kimlik üretimi"); editör kendi şablon-türevi kimliğini onun
   koduyla değiştirir. CSV içe aktarımının yaptığı işin aynısı, farklı
   okuyucuyla — o yüzden eşleştirici tektir, iki okuyucuyu birden besler.
   ══════════════════════════════════════════════════════════════════════════ */
export function dbSeatRows(payload) {
  const secCode = new Map((payload.sections || []).map((s) => [s.id, s.code]));
  const rowById = new Map((payload.rows || []).map((r) => [r.id, r]));
  return (payload.seats || []).map((s) => {
    const r = rowById.get(s.row_id);
    return {
      block: r ? String(secCode.get(r.section_id) ?? "") : "",
      row: r ? String(r.code ?? "") : "",
      seat: String(s.label ?? ""),
      id: String(s.code ?? ""),
    };
  });
}
