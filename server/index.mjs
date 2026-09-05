import http from "node:http";
import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { openDb, createSchema, loadPayload } from "../db/load.mjs";
import { buildDbPayload } from "../src/core/db-export.js";
import { buildMeta } from "../src/core/geometry.js";
import { gateMap } from "../src/core/gates.js";

const here = path.dirname(fileURLToPath(import.meta.url));

/* ══════════════════════════════════════════════════════════════════════════
   SUNUCU — editörün depolama sözleşmesi + yayımlama

   İki sorumluluk, bilerek ayrı:

   /api/plans/*      TASLAK belgeler. src/store/index.js'in sözleşmesinin
                     birebir karşılığı (list/load/save/remove/pref) — yani
                     tarayıcıdaki sürücü sadece fetch'e çevirir, editör
                     değişmez. Sözleşme test/unit/store.test.js'te.

   /api/plans/:k/publish   SINIR. Tarifi çalıştırıp (buildDbPayload)
                     sonucu seating_* tablolarına yazar ve o sürümü
                     dondurur. Rapor §5.4: published sürüm değiştirilemez.

   /api/versions/*   Yayımlanmış kanonik veri — okuma. Bilet/envanter
                     sistemlerinin göreceği yüzey bu.

   Bağımlılık yok: node:http + node:sqlite. Kimlik/tenant tek bir sabitte;
   gerçek kurulumda oturum katmanından gelir, editörden DEĞİL.
   ══════════════════════════════════════════════════════════════════════════ */

const TENANT = process.env.TENANT_ID || "t1";

export function createDb(file = ":memory:") {
  const db = createSchema(openDb(file));
  db.exec(readFileSync(path.join(here, "..", "db", "editor.sql"), "utf8"));
  return db;
}

const json = (res, code, body) => {
  const s = body === undefined ? "" : JSON.stringify(body);
  res.writeHead(code, { "content-type": "application/json; charset=utf-8",
    "access-control-allow-origin": "*",
    "access-control-allow-methods": "GET,PUT,POST,DELETE,OPTIONS",
    "access-control-allow-headers": "content-type" });
  res.end(s);
};

const govde = (req) => new Promise((ok, no) => {
  let b = ""; let n = 0;
  req.on("data", (c) => {
    n += c.length;
    if (n > 32 * 1024 * 1024) { no(new Error("gövde çok büyük")); req.destroy(); return; }
    b += c;
  });
  req.on("end", () => { try { ok(b ? JSON.parse(b) : null); } catch (e) { no(e); } });
  req.on("error", no);
});

/** Yayımlama: taslak belgeden kanonik satırları üretip yazar. */
export function publish(db, plan, key) {
  const metas = (plan.blocks || []).map((b) => ({ b, m: buildMeta(b) }));
  const payload = buildDbPayload(plan, metas, gateMap(plan));
  const surum = (db.prepare(
    `SELECT COALESCE(MAX(version), 0) + 1 AS v FROM seating_seat_plan_versions
      WHERE tenant_id = ? AND seat_plan_id = ?`).get(TENANT, `plan:${key}`) || {}).v || 1;
  payload.seat_plan_version = { version: surum, status: "published", unit: "cm" };
  /* Aynı mekân/plan zaten varsa yeniden eklenmesin — yalnız yeni SÜRÜM. */
  const varMi = db.prepare(
    `SELECT 1 FROM seating_seat_plans WHERE tenant_id = ? AND id = ?`).get(TENANT, `plan:${key}`);
  const r = loadPayload(db, payload, { tenantId: TENANT, planKey: key, skipHeader: !!varMi });
  db.prepare(`UPDATE seating_seat_plan_versions SET status = 'superseded', published_at = published_at
               WHERE tenant_id = ? AND seat_plan_id = ? AND id <> ? AND status = 'published'`)
    .run(TENANT, `plan:${key}`, r.versionId);
  db.prepare(`UPDATE seating_seat_plan_versions SET published_at = ? WHERE tenant_id = ? AND id = ?`)
    .run(new Date().toISOString(), TENANT, r.versionId);
  return { ...r, version: surum };
}

export function handler(db) {
  return async (req, res) => {
    const u = new URL(req.url, "http://x");
    const p = u.pathname.replace(/\/+$/, "");
    const m = req.method;
    if (m === "OPTIONS") return json(res, 204);

    try {
      /* ── taslak belgeler: depolama sözleşmesi ── */
      if (p === "/api/plans" && m === "GET")
        return json(res, 200, db.prepare(
          "SELECT key FROM editor_plans WHERE tenant_id = ? ORDER BY key").all(TENANT).map((r) => r.key));

      let g;
      if ((g = p.match(/^\/api\/plans\/([^/]+)$/))) {
        const key = decodeURIComponent(g[1]);
        if (m === "GET") {
          const r = db.prepare(
            "SELECT document FROM editor_plans WHERE tenant_id = ? AND key = ?").get(TENANT, key);
          return r ? json(res, 200, JSON.parse(r.document)) : json(res, 404, null);
        }
        if (m === "PUT") {
          const plan = await govde(req);
          if (!plan || typeof plan !== "object") return json(res, 400, { hata: "plan bekleniyor" });
          db.prepare(`INSERT INTO editor_plans (tenant_id,key,document,updated_at) VALUES (?,?,?,?)
                      ON CONFLICT (tenant_id,key) DO UPDATE SET document = excluded.document,
                        updated_at = excluded.updated_at`)
            .run(TENANT, key, JSON.stringify({ ...plan, underlay: null }), new Date().toISOString());
          return json(res, 204);
        }
        if (m === "DELETE") {
          db.prepare("DELETE FROM editor_plans WHERE tenant_id = ? AND key = ?").run(TENANT, key);
          return json(res, 204);
        }
      }

      if ((g = p.match(/^\/api\/prefs\/([^/]+)$/))) {
        const key = decodeURIComponent(g[1]);
        if (m === "GET") {
          const r = db.prepare(
            "SELECT value FROM editor_prefs WHERE tenant_id = ? AND key = ?").get(TENANT, key);
          return json(res, 200, r ? r.value : null);
        }
        if (m === "PUT") {
          const b = await govde(req);
          db.prepare(`INSERT INTO editor_prefs (tenant_id,key,value) VALUES (?,?,?)
                      ON CONFLICT (tenant_id,key) DO UPDATE SET value = excluded.value`)
            .run(TENANT, key, String(b?.value ?? ""));
          return json(res, 204);
        }
      }

      /* ── SINIR: taslak → kanonik ── */
      if ((g = p.match(/^\/api\/plans\/([^/]+)\/publish$/)) && m === "POST") {
        const key = decodeURIComponent(g[1]);
        const r = db.prepare(
          "SELECT document FROM editor_plans WHERE tenant_id = ? AND key = ?").get(TENANT, key);
        if (!r) return json(res, 404, { hata: "taslak yok" });
        try { return json(res, 200, publish(db, JSON.parse(r.document), key)); }
        catch (e) {
          /* Şema reddettiyse SEBEBİ görünsün — sessiz başarısızlık, bu
             projede en pahalı hata sınıfıydı. */
          return json(res, 422, { hata: "plan şemaya oturmadı", detay: String(e.message) });
        }
      }

      /* ── yayımlanmış kanonik veri: okuma ── */
      if (p === "/api/versions" && m === "GET")
        return json(res, 200, db.prepare(
          `SELECT v.id, v.seat_plan_id, v.version, v.status, v.published_at, sp.name,
                  (SELECT COUNT(*) FROM seating_seats s
                    WHERE s.tenant_id = v.tenant_id AND s.version_id = v.id) AS seats
             FROM seating_seat_plan_versions v
             JOIN seating_seat_plans sp ON sp.tenant_id = v.tenant_id AND sp.id = v.seat_plan_id
            WHERE v.tenant_id = ? ORDER BY sp.name, v.version`).all(TENANT));

      if ((g = p.match(/^\/api\/versions\/([^/]+)\/sections$/)) && m === "GET")
        return json(res, 200, db.prepare(
          `SELECT id, parent_section_id, code, name, kind, geometry_kind,
                  (SELECT COUNT(*) FROM seating_rows r
                    WHERE r.tenant_id = s.tenant_id AND r.version_id = s.version_id
                      AND r.section_id = s.id) AS rows_count
             FROM seating_sections s WHERE tenant_id = ? AND version_id = ?
            ORDER BY code`).all(TENANT, decodeURIComponent(g[1])));

      if ((g = p.match(/^\/api\/versions\/([^/]+)\/seats$/)) && m === "GET") {
        const vid = decodeURIComponent(g[1]);
        const limit = Math.min(Number(u.searchParams.get("limit")) || 500, 5000);
        return json(res, 200, db.prepare(
          `SELECT s.code, s.label, s.x, s.y, s.rotation, t.seat_kind, s.group_id,
                  r.code AS row_code, sec.code AS section_code
             FROM seating_seats s
             JOIN seating_rows r ON r.tenant_id = s.tenant_id AND r.version_id = s.version_id AND r.id = s.row_id
             JOIN seating_sections sec ON sec.tenant_id = s.tenant_id AND sec.version_id = s.version_id AND sec.id = r.section_id
             JOIN seating_seat_types t ON t.tenant_id = s.tenant_id AND t.version_id = s.version_id AND t.id = s.seat_type_id
            WHERE s.tenant_id = ? AND s.version_id = ? ORDER BY s.code LIMIT ?`)
          .all(TENANT, vid, limit));
      }

      return json(res, 404, { hata: "yol yok" });
    } catch (e) {
      return json(res, 500, { hata: String(e.message) });
    }
  };
}

export function createServer(db) { return http.createServer(handler(db)); }

/* doğrudan çalıştırıldığında */
if (process.argv[1] && process.argv[1].endsWith("server/index.mjs")) {
  const port = Number(process.env.PORT) || 8787;
  const db = createDb(process.env.DB_FILE || "db/seating.db");
  createServer(db).listen(port, () => console.log(`sunucu http://localhost:${port}`));
}
