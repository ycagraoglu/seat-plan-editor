import http from "node:http";
import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { openDb, createSchema, loadPayload } from "../db/load.mjs";
import { buildDbPayload } from "../src/core/db-export.js";
import { buildMeta } from "../src/core/geometry.js";
import { gateMap } from "../src/core/gates.js";
import { sohbetAcikMi, mesajGonder, akisOku } from "../chat/oturumlar.mjs";

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

/* Canlı görünümün iki sabiti. LIVE_ONEK bir AD ALANI: canlı çizim asla
   yerleşik bir örneğin anahtarına yazmasın diye ("gs" değil "ai-gs").
   Hiçbir yerleşik salon anahtarı bu ön ekle başlamıyor. */
const LIVE_KEY = "__live";
const LIVE_ONEK = "ai-";
const GUNLUK_SINIR = 60;

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
    "access-control-allow-headers": "content-type, x-tenant-id" });
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
export function publish(db, plan, key, tenant = TENANT) {
  const metas = (plan.blocks || []).map((b) => ({ b, m: buildMeta(b) }));
  const payload = buildDbPayload(plan, metas, gateMap(plan));
  const surum = (db.prepare(
    `SELECT COALESCE(MAX(version), 0) + 1 AS v FROM seating_seat_plan_versions
      WHERE tenant_id = ? AND seat_plan_id = ?`).get(tenant, `plan:${key}`) || {}).v || 1;
  payload.seat_plan_version = { version: surum, status: "published", unit: "cm" };
  /* Aynı mekân/plan zaten varsa yeniden eklenmesin — yalnız yeni SÜRÜM. */
  const varMi = db.prepare(
    `SELECT 1 FROM seating_seat_plans WHERE tenant_id = ? AND id = ?`).get(tenant, `plan:${key}`);
  const r = loadPayload(db, payload, { tenantId: tenant, planKey: key, skipHeader: !!varMi });
  db.prepare(`UPDATE seating_seat_plan_versions SET status = 'superseded', published_at = published_at
               WHERE tenant_id = ? AND seat_plan_id = ? AND id <> ? AND status = 'published'`)
    .run(tenant, `plan:${key}`, r.versionId);
  db.prepare(`UPDATE seating_seat_plan_versions SET published_at = ? WHERE tenant_id = ? AND id = ?`)
    .run(new Date().toISOString(), tenant, r.versionId);
  return { ...r, version: surum };
}

export function handler(db) {
  return async (req, res) => {
    const u = new URL(req.url, "http://x");
    /* KİMLİK DİKİŞİ — ana uygulamanın bağlanacağı yer.
       Bu depo tek operatörlük; canlıda editör login'in arkasında bir sayfa
       ve her isteğin kimin adına geldiği bilinmeli. Burada AUTH YAZMIYORUZ
       (o ana uygulamanın oturum katmanının işi) — yalnız sabiti değişkene
       çeviriyoruz ki bağlanacak yer hazır olsun. Dosya başındaki yorum
       zaten bunu vaat ediyordu.
       Başlık YOKSA eski davranış birebir sürüyor. */
    const tenant = String(req.headers["x-tenant-id"] || TENANT);
    const p = u.pathname.replace(/\/+$/, "");
    const m = req.method;
    if (m === "OPTIONS") return json(res, 204);

    try {
      /* ── taslak belgeler: depolama sözleşmesi ── */
      if (p === "/api/plans" && m === "GET") {
        const satir = db.prepare(
          "SELECT key, document, updated_at FROM editor_plans WHERE tenant_id = ? ORDER BY key").all(tenant);
        /* ?detay=1 SORGU PARAMETRESİ — yeni bir yol açmadım çünkü
           /api/plans/<şey> deseni her şeyi anahtar sanıyor ("ozet" bir plan
           anahtarı gibi görünürdü). Parametresiz çağrı, depolama
           sözleşmesinin beklediği düz anahtar dizisini aynen döndürüyor;
           list() hiç değişmedi (test/store-contract.js hakem). */
        if (u.searchParams.get("detay") !== "1")
          return json(res, 200, satir.map((r) => r.key));
        return json(res, 200, satir.map((r) => {
          let d = {}; try { d = JSON.parse(r.document); } catch { /* bozuk kayıt atlanmasın */ }
          return { key: r.key, name: d.name || r.key,
            blok: (d.blocks || []).length, guncelleme: r.updated_at };
        }));
      }

      let g;
      if ((g = p.match(/^\/api\/plans\/([^/]+)$/))) {
        const key = decodeURIComponent(g[1]);
        if (m === "GET") {
          const r = db.prepare(
            "SELECT document FROM editor_plans WHERE tenant_id = ? AND key = ?").get(tenant, key);
          return r ? json(res, 200, JSON.parse(r.document)) : json(res, 404, null);
        }
        if (m === "PUT") {
          const plan = await govde(req);
          if (!plan || typeof plan !== "object") return json(res, 400, { hata: "plan bekleniyor" });
          db.prepare(`INSERT INTO editor_plans (tenant_id,key,document,updated_at) VALUES (?,?,?,?)
                      ON CONFLICT (tenant_id,key) DO UPDATE SET document = excluded.document,
                        updated_at = excluded.updated_at`)
            .run(tenant, key, JSON.stringify({ ...plan, underlay: null }), new Date().toISOString());
          return json(res, 204);
        }
        if (m === "DELETE") {
          db.prepare("DELETE FROM editor_plans WHERE tenant_id = ? AND key = ?").run(tenant, key);
          return json(res, 204);
        }
      }

      if ((g = p.match(/^\/api\/prefs\/([^/]+)$/))) {
        const key = decodeURIComponent(g[1]);
        if (m === "GET") {
          const r = db.prepare(
            "SELECT value FROM editor_prefs WHERE tenant_id = ? AND key = ?").get(tenant, key);
          return json(res, 200, r ? r.value : null);
        }
        if (m === "PUT") {
          const b = await govde(req);
          db.prepare(`INSERT INTO editor_prefs (tenant_id,key,value) VALUES (?,?,?)
                      ON CONFLICT (tenant_id,key) DO UPDATE SET value = excluded.value`)
            .run(tenant, key, String(b?.value ?? ""));
          return json(res, 204);
        }
      }

      /* ── CANLI GÖRÜNÜM ─────────────────────────────────────────────
         Sözleşmenin ÜSTÜNDE, yalnız API sürücüsünde olan yetenek
         (publish() ile aynı sınıf): MCP çizerken editör izlesin diye.

         Yeni TABLO yok. Gerçekten yeni olan durum tek satırlık: hangi
         çizim canlı, ne zaman yazıldı, operatör devraldı mı. O da
         editor_prefs'te ayrılmış bir anahtar. Planın kendisi zaten
         editor_plans'a, MEVCUT upsert'le gidiyor — böylece underlay
         soyma ve updated_at bedava geliyor, Store.list() de onu görüyor.

         KİLİT SAHİBE DEĞİL, ÇİZİME BAĞLI. mcp/cli.mjs her çağrıda yeni
         bir Session kuruyor; oturuma bağlı bir kimlikle iptal etseydik
         bir sonraki çağrı yeni kimlikle kilidi geri alırdı ve KES hiçbir
         şey ifade etmezdi. Burada iptal EDİLEN ŞEY çizim: aynı anahtara
         yazmaya çalışan herkes 409 alır, BAŞKA bir anahtar gelince
         (create_plan/open_sample) yeni çizim sayılır ve iptal düşer.
         Doğru zihinsel model bu: "operatör bu çizimi devraldı; çizmek
         istiyorsan yenisine başla." */
      if (p === "/api/live") {
        const oku = () => {
          const r = db.prepare("SELECT value FROM editor_prefs WHERE tenant_id = ? AND key = ?")
            .get(tenant, LIVE_KEY);
          try { return r ? JSON.parse(r.value) : null; } catch { return null; }
        };
        const yaz = (v) => db.prepare(`INSERT INTO editor_prefs (tenant_id,key,value) VALUES (?,?,?)
                      ON CONFLICT (tenant_id,key) DO UPDATE SET value = excluded.value`)
          .run(tenant, LIVE_KEY, JSON.stringify(v));

        if (m === "GET") {
          const d = oku();
          if (!d || d.revoked) return json(res, 200, { aktif: false });
          /* Yaş SUNUCUDA hesaplanıyor: tarayıcı kendi saatiyle karşılaştırsa
             saat kayması yüzünden ya hep bayat ya hiç bayat görünürdü. */
          return json(res, 200, { aktif: true, key: d.key, name: d.name || d.key,
            at: d.at, yasSaniye: Math.max(0, Math.round((Date.now() - Date.parse(d.at)) / 1000)),
            gunluk: d.gunluk || [] });
        }
        if (m === "PUT") {
          const b = await govde(req);
          const plan = b?.plan;
          if (!plan || typeof plan !== "object" || !plan.key)
            return json(res, 400, { hata: "plan bekleniyor" });
          /* Derinlemesine savunma: canlı yazma ASLA yerleşik bir örneğin
             anahtarına düşmemeli (editörün sessiz çatallaması oradan
             tetikleniyor). Ön ek MCP tarafında konuyor, burada denetleniyor. */
          if (!String(plan.key).startsWith(LIVE_ONEK))
            return json(res, 400, { hata: `canlı anahtar "${LIVE_ONEK}" ile başlamalı` });
          const d = oku();
          /* b.yeni: LLM create_plan/open_sample çağırdı — bu bir DEVAM
             değil, baştan başlama. İptal düşer. Bayrak yoksa aynı çizime
             yazmaya çalışıyor demektir ve iptal geçerlidir. */
          if (d && d.revoked && d.key === plan.key && !b.yeni)
            return json(res, 409, { hata: "operatör devraldı" });
          db.prepare(`INSERT INTO editor_plans (tenant_id,key,document,updated_at) VALUES (?,?,?,?)
                      ON CONFLICT (tenant_id,key) DO UPDATE SET document = excluded.document,
                        updated_at = excluded.updated_at`)
            .run(tenant, plan.key, JSON.stringify({ ...plan, underlay: null }), new Date().toISOString());
          /* Adım günlüğü: operatörün "ne yapıldı" panelinde okuyacağı
             satırlar. YENİ BİR ÇİZİME geçilince sıfırlanıyor — önceki
             salonun adımları yeni salonun altında durmamalı.
             GUNLUK_SINIR: prefs bir metin sütunu, sınırsız büyüyemez;
             operatörün geriye dönüp bakacağı derinlik de bu kadar. */
          const oncekiGunluk = d && d.key === plan.key && !b.yeni ? (d.gunluk || []) : [];
          const gunluk = b.adim
            ? [...oncekiGunluk, b.adim].slice(-GUNLUK_SINIR) : oncekiGunluk;
          yaz({ key: plan.key, name: plan.name || plan.key,
            at: new Date().toISOString(), revoked: false, gunluk });
          return json(res, 204);
        }
        if (m === "DELETE") {                       /* KES */
          const d = oku();
          if (d) yaz({ ...d, revoked: true });
          return json(res, 204);
        }
      }

      /* ── PANEL İÇİ SOHBET ──────────────────────────────────────────
         Model SUNUCUDA çalışıyor; operatör hiçbir ayar yapmıyor, token
         görmüyor. ANTHROPIC_API_KEY sunucuda durur, tarayıcıya ASLA gitmez
         — panel yalnız "açık mı" cevabını alır.

         Tur arka planda koşuyor: POST hemen döner, panel /api/chat'i
         saniyede bir okur. Canlı görünümün yoklama kalıbının aynısı;
         sunucuya ilk durumlu bağlantı girmiyor. */
      if (p === "/api/chat/durum" && m === "GET")
        return json(res, 200, { acik: sohbetAcikMi() });

      if (p === "/api/chat") {
        if (m === "GET") {
          const id = u.searchParams.get("id");
          if (!id) return json(res, 400, { hata: "id gerekli" });
          return json(res, 200, await akisOku(id));
        }
        if (m === "POST") {
          const b = await govde(req);
          if (!b?.id || !b?.mesaj) return json(res, 400, { hata: "id ve mesaj gerekli" });
          if (!sohbetAcikMi()) return json(res, 503, { hata: "Sohbet kapalı: ANTHROPIC_API_KEY, OPENAI_API_KEY ya da GEMINI_API_KEY tanımlı değil" });
          return json(res, 202, await mesajGonder(b.id, String(b.mesaj)));
        }
      }

      /* ── SINIR: taslak → kanonik ── */
      if ((g = p.match(/^\/api\/plans\/([^/]+)\/publish$/)) && m === "POST") {
        const key = decodeURIComponent(g[1]);
        const r = db.prepare(
          "SELECT document FROM editor_plans WHERE tenant_id = ? AND key = ?").get(tenant, key);
        if (!r) return json(res, 404, { hata: "taslak yok" });
        try { return json(res, 200, publish(db, JSON.parse(r.document), key, tenant)); }
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
            WHERE v.tenant_id = ? ORDER BY sp.name, v.version`).all(tenant));

      if ((g = p.match(/^\/api\/versions\/([^/]+)\/sections$/)) && m === "GET")
        return json(res, 200, db.prepare(
          `SELECT id, parent_section_id, code, name, kind, geometry_kind,
                  (SELECT COUNT(*) FROM seating_rows r
                    WHERE r.tenant_id = s.tenant_id AND r.version_id = s.version_id
                      AND r.section_id = s.id) AS rows_count
             FROM seating_sections s WHERE tenant_id = ? AND version_id = ?
            ORDER BY code`).all(tenant, decodeURIComponent(g[1])));

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
          .all(tenant, vid, limit));
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
  /* PANEL İÇİ SOHBET DE CANLI YAZSIN.
     canliYaz() SEAT_EDITOR_API yoksa hiçbir şey yapmıyor (bilinçli: MCP
     sunucusuz da çalışsın). stdio yolunda operatör bunu elle veriyor, ama
     panel sohbeti SUNUCUNUN İÇİNDE koşuyor ve kimse vermiyordu: çizim
     ilerliyor, editörde hiçbir şey belirmiyor, adım günlüğü boş kalıyordu —
     panelin sohbetin çıplak araç satırlarını attığı düşünülünce operatör
     ekranda HİÇBİR adım göremiyordu. Ürünün asıl kullanım biçimi bu mod.
     Sunucu kendi adresini biliyor; iki yol da tek canlı-yazma kodunu
     kullansın diye burada veriliyor, ikinci bir kod yolu açılmıyor. */
  if (!process.env.SEAT_EDITOR_API) {
    process.env.SEAT_EDITOR_API = `http://127.0.0.1:${port}/api`;
  }
  createServer(db).listen(port, () => console.log(`sunucu http://localhost:${port}`));
}
