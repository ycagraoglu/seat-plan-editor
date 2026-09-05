import { DatabaseSync } from "node:sqlite";
import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const here = path.dirname(fileURLToPath(import.meta.url));

/* ══════════════════════════════════════════════════════════════════════════
   PLAN → VERİTABANI

   buildDbPayload'ın ürettiği tablo satırlarını db/schema.sql'e yazar.
   Şema hakem: bir sözlük değeri raporun dışındaysa CHECK, kardeş kod
   tekrarlanıyorsa UNIQUE, kırık bir referans varsa FK reddeder. "Dışa
   aktarım rapora uygun" cümlesi böylece iddia olmaktan çıkıyor.

   Bölüm ekleme sırası ÖNEMLİ: çocuk, üstünden sonra gelmeli (kendine
   referanslı FK). resolvePlanSections zaten zinciri üstten üretiyor ama
   buna güvenmiyoruz — topolojik sıraya kendimiz sokuyoruz, çünkü
   "sıralı geliyor" varsayımı sessizce bozulabilecek türden bir varsayım.
   ══════════════════════════════════════════════════════════════════════════ */

export function openDb(file = ":memory:") {
  const db = new DatabaseSync(file);
  db.exec("PRAGMA foreign_keys = ON");
  return db;
}

export function createSchema(db) {
  db.exec(readFileSync(path.join(here, "schema.sql"), "utf8"));
  return db;
}

/** Bölümleri üst-önce sırasına sokar; döngü varsa kalanları sona atar
 *  (FK zaten reddeder — sessizce düşürmüyoruz, patlaması doğru). */
function topoSections(sections) {
  const kalan = new Map(sections.map((s) => [s.id, s]));
  const yerlesen = new Set();
  const out = [];
  let ilerledi = true;
  while (kalan.size && ilerledi) {
    ilerledi = false;
    for (const [id, s] of [...kalan]) {
      if (s.parent_id && !yerlesen.has(s.parent_id) && kalan.has(s.parent_id)) continue;
      out.push(s); yerlesen.add(id); kalan.delete(id); ilerledi = true;
    }
  }
  return [...out, ...kalan.values()];
}

const J = (v) => (v == null ? null : JSON.stringify(v));

/** Bir planın tablo yükünü tek işlemde yazar. Dönen: satır sayıları. */
export function loadPayload(db, payload, { tenantId = "t1", planKey, skipHeader = false } = {}) {
  const p = payload;
  const key = planKey || p.seat_plan.code;
  const venueId = `ven:${key}`, spaceId = `spc:${key}`;
  const planId = `plan:${key}`, verId = `ver:${key}:${p.seat_plan_version.version ?? 0}`;

  const ins = (sql) => db.prepare(sql);
  const q = {
    venue: ins(`INSERT INTO venue_venues (tenant_id,id,code,name) VALUES (?,?,?,?)`),
    space: ins(`INSERT INTO venue_spaces (tenant_id,id,venue_id,code,name) VALUES (?,?,?,?,?)`),
    plan:  ins(`INSERT INTO seating_seat_plans (tenant_id,id,space_id,code,name) VALUES (?,?,?,?,?)`),
    ver:   ins(`INSERT INTO seating_seat_plan_versions
                  (tenant_id,id,seat_plan_id,version,status,unit) VALUES (?,?,?,?,?,?)`),
    sec:   ins(`INSERT INTO seating_sections
                  (tenant_id,version_id,id,parent_section_id,code,name,kind,geometry_kind,geometry_data)
                  VALUES (?,?,?,?,?,?,?,?,?)`),
    row:   ins(`INSERT INTO seating_rows
                  (tenant_id,version_id,id,section_id,code,name,sort_order) VALUES (?,?,?,?,?,?,?)`),
    styp:  ins(`INSERT INTO seating_seat_types
                  (tenant_id,version_id,id,code,name,seat_kind) VALUES (?,?,?,?,?,?)`),
    grp:   ins(`INSERT INTO seating_seat_groups
                  (tenant_id,version_id,id,section_id,code,name,kind) VALUES (?,?,?,?,?,?,?)`),
    seat:  ins(`INSERT INTO seating_seats
                  (tenant_id,version_id,id,row_id,seat_type_id,group_id,code,label,x,y,rotation)
                  VALUES (?,?,?,?,?,?,?,?,?,?,?)`),
    feat:  ins(`INSERT INTO seating_seat_features (tenant_id,version_id,seat_id,feature) VALUES (?,?,?,?)`),
    shape: ins(`INSERT INTO seating_shapes
                  (tenant_id,version_id,id,shape_kind,geometry_kind,geometry_data,z_index,label)
                  VALUES (?,?,?,?,?,?,?,?)`),
    ent:   ins(`INSERT INTO seating_entrances (tenant_id,version_id,id,code,name) VALUES (?,?,?,?,?)`),
    entsec:ins(`INSERT INTO seating_entrance_sections
                  (tenant_id,version_id,entrance_id,section_id) VALUES (?,?,?,?)`),
    entst: ins(`INSERT INTO seating_entrance_seats
                  (tenant_id,version_id,entrance_id,seat_id) VALUES (?,?,?,?)`),
  };

  db.exec("BEGIN");
  try {
    /* Yeniden yayımlamada mekân/alan/plan zaten var; yalnız SÜRÜM eklenir.
       Kanonik verinin sürümlenmesi budur — eski sürüm yerinde kalır. */
    if (!skipHeader) {
      q.venue.run(tenantId, venueId, p.space.code, p.space.name);
      q.space.run(tenantId, spaceId, venueId, p.space.code, p.space.name);
      q.plan.run(tenantId, planId, spaceId, p.seat_plan.code, p.seat_plan.name);
    }
    q.ver.run(tenantId, verId, planId, p.seat_plan_version.version ?? 0,
      p.seat_plan_version.status, p.seat_plan_version.unit);

    topoSections(p.sections).forEach((s) =>
      q.sec.run(tenantId, verId, s.id, s.parent_id ?? null, s.code, s.name, s.kind,
        s.geometry_kind ?? null, J(s.geometry_data)));
    p.rows.forEach((r) => q.row.run(tenantId, verId, r.id, r.section_id, r.code, r.name, r.sort_order));
    p.seat_types.forEach((t) => q.styp.run(tenantId, verId, t.id, t.code, t.name, t.seat_kind));
    p.seat_groups.forEach((g) => q.grp.run(tenantId, verId, g.id, g.section_id ?? null, g.code, g.name, g.kind));
    p.seats.forEach((s) => {
      q.seat.run(tenantId, verId, s.id, s.row_id, s.seat_type_id, s.group_id ?? null,
        s.code, s.label, s.x, s.y, s.rotation);
      (s.features || []).forEach((f) => q.feat.run(tenantId, verId, s.id, f));
    });
    p.shapes.forEach((s) => q.shape.run(tenantId, verId, s.id, s.shape_kind, s.geometry_kind,
      J(s.geometry_data), s.z_index, s.label));
    p.entrances.forEach((e) => q.ent.run(tenantId, verId, e.id, e.code, e.name));
    p.entrance_sections.forEach((e) => q.entsec.run(tenantId, verId, e.entrance_id, e.section_id));
    /* Koltuk düzeyi yönlendirme (§5.5): koltuğun kapısı bölümünkinden
       türüyor ama ayrı tabloda duruyor — kapı bölüme değil KOLTUĞA
       atandığında (loca, engelli platformu) model bozulmasın diye. */
    p.seats.filter((s) => s.entrance_id)
      .forEach((s) => q.entst.run(tenantId, verId, s.entrance_id, s.id));
    db.exec("COMMIT");
  } catch (e) {
    db.exec("ROLLBACK");
    throw e;
  }
  return { versionId: verId, sections: p.sections.length, rows: p.rows.length,
    seats: p.seats.length, shapes: p.shapes.length, entrances: p.entrances.length };
}
