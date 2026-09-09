import http from "node:http";
import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { createRemoteJWKSet, jwtVerify } from "jose";
import { openDb, createSchema, loadPayload } from "../db/load.mjs";
import { buildDbPayload } from "../src/core/db-export.js";
import { buildMeta } from "../src/core/geometry.js";
import { gateMap } from "../src/core/gates.js";
import { assertDeliveryReady } from "../src/core/readiness.js";
import { sohbetAcikMi, sohbetBilgi, mesajGonder, akisOku, sohbetTemizle } from "../chat/oturumlar.mjs";
import { createImportService } from "./import-service.mjs";

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

   Üretimde JWT/JWKS doğrulaması açıksa tenant token claim'inden gelir.
   Devde auth kapalıysa eski tek kiracılı davranış korunur.
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

/** Canlı çizim süreç durumudur; sunucu yeniden başladıysa artık aktif değildir. */
export function clearLiveSessions(db) {
  db.prepare("DELETE FROM editor_prefs WHERE key = ?").run(LIVE_KEY);
}

const json = (res, code, body, extraHeaders = {}) => {
  const s = body === undefined ? "" : JSON.stringify(body);
  res.writeHead(code, { "content-type": "application/json; charset=utf-8",
    "access-control-allow-methods": "GET,PUT,POST,DELETE,OPTIONS",
    "access-control-allow-headers": "content-type, authorization, x-tenant-id, x-file-name",
    ...extraHeaders });
  res.end(s);
};

function corsHeaders(req, origins) {
  const origin = req.headers.origin;
  if (!origins?.length) return { "access-control-allow-origin": "*" };
  return origin && origins.includes(origin) ? { "access-control-allow-origin": origin, vary: "origin" } : {};
}

function localRequest(req) {
  const a = req.socket?.remoteAddress || "";
  return ["127.0.0.1", "::1", "::ffff:127.0.0.1"].includes(a);
}

function authConfig(opts = {}) {
  const a = opts.auth || {};
  const jwksUrl = a.jwksUrl || process.env.SEAT_EDITOR_JWKS_URL;
  return {
    jwksUrl,
    issuer: a.issuer || process.env.SEAT_EDITOR_JWT_ISSUER,
    audience: a.audience || process.env.SEAT_EDITOR_JWT_AUDIENCE,
    tenantClaim: a.tenantClaim || process.env.SEAT_EDITOR_TENANT_CLAIM || "tenant_id",
    devBypass: a.devBypass ?? process.env.SEAT_EDITOR_AUTH_DEV_BYPASS === "1",
  };
}

function corsConfig(opts = {}) {
  const raw = opts.corsOrigins ?? process.env.SEAT_EDITOR_CORS_ORIGINS;
  return Array.isArray(raw) ? raw : String(raw || "").split(",").map((x) => x.trim()).filter(Boolean);
}

function authenticator(opts = {}) {
  const cfg = authConfig(opts);
  const jwks = cfg.jwksUrl ? createRemoteJWKSet(new URL(cfg.jwksUrl)) : null;
  return async (req) => {
    if (!jwks && cfg.devBypass && localRequest(req)) {
      return String(req.headers["x-tenant-id"] || TENANT);
    }
    if (!jwks) throw Object.assign(new Error("JWT/JWKS yapılandırması eksik"), { statusCode: 503 });
    const token = String(req.headers.authorization || "").match(/^Bearer\s+(.+)$/i)?.[1];
    if (!token) throw Object.assign(new Error("Bearer token gerekli"), { statusCode: 401 });
    const verifyOpts = {};
    if (cfg.issuer) verifyOpts.issuer = cfg.issuer;
    if (cfg.audience) verifyOpts.audience = cfg.audience;
    const { payload } = await jwtVerify(token, jwks, verifyOpts);
    const tenant = payload[cfg.tenantClaim];
    if (!tenant || typeof tenant !== "string") {
      throw Object.assign(new Error(`JWT içinde ${cfg.tenantClaim} tenant claim'i yok`), { statusCode: 403 });
    }
    return tenant;
  };
}

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

const yuklemeAdi = (header) => {
  const encoded = Array.isArray(header) ? header[0] : String(header || "kaynak");
  try { return decodeURIComponent(encoded); }
  catch { return encoded; }
};

const hamGovde = (req) => new Promise((ok, no) => {
  const cs = []; let n = 0;
  req.on("data", (c) => {
    n += c.length;
    if (n > 32 * 1024 * 1024) { no(new Error("gövde çok büyük")); req.destroy(); return; }
    cs.push(c);
  });
  req.on("end", () => ok(Buffer.concat(cs)));
  req.on("error", no);
});

/** Yayımlama: taslak belgeden kanonik satırları üretip yazar. */
export function publish(db, plan, key, tenant = TENANT) {
  const metas = (plan.blocks || []).map((b) => ({ b, m: buildMeta(b) }));
  const gates = gateMap(plan);
  assertDeliveryReady(plan, metas, gates);
  const payload = buildDbPayload(plan, metas, gates);
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

export function handler(db, opts = {}) {
  const auth = authenticator(opts);
  const origins = corsConfig(opts);
  const importService = opts.importService || createImportService();
  return async (req, res) => {
    const u = new URL(req.url, "http://x");
    const reply = (code, body) => json(res, code, body, corsHeaders(req, origins));
    const p = u.pathname.replace(/\/+$/, "");
    const m = req.method;
    if (m === "OPTIONS") return reply(204);

    try {
      const tenant = await auth(req);
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
          return reply(200, satir.map((r) => r.key));
        return reply(200, satir.map((r) => {
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
          return r ? reply(200, JSON.parse(r.document)) : reply(404, null);
        }
        if (m === "PUT") {
          const plan = await govde(req);
          if (!plan || typeof plan !== "object") return reply(400, { hata: "plan bekleniyor" });
          db.prepare(`INSERT INTO editor_plans (tenant_id,key,document,updated_at) VALUES (?,?,?,?)
                      ON CONFLICT (tenant_id,key) DO UPDATE SET document = excluded.document,
                        updated_at = excluded.updated_at`)
            .run(tenant, key, JSON.stringify({ ...plan, underlay: null }), new Date().toISOString());
          return reply(204);
        }
        if (m === "DELETE") {
          db.prepare("DELETE FROM editor_plans WHERE tenant_id = ? AND key = ?").run(tenant, key);
          return reply(204);
        }
      }

      if ((g = p.match(/^\/api\/prefs\/([^/]+)$/))) {
        const key = decodeURIComponent(g[1]);
        if (m === "GET") {
          const r = db.prepare(
            "SELECT value FROM editor_prefs WHERE tenant_id = ? AND key = ?").get(tenant, key);
          return reply(200, r ? r.value : null);
        }
        if (m === "PUT") {
          const b = await govde(req);
          db.prepare(`INSERT INTO editor_prefs (tenant_id,key,value) VALUES (?,?,?)
                      ON CONFLICT (tenant_id,key) DO UPDATE SET value = excluded.value`)
            .run(tenant, key, String(b?.value ?? ""));
          return reply(204);
        }
      }

      if (p === "/api/imports" && m === "POST") {
        const item = await importService.save({
          tenant,
          name: yuklemeAdi(req.headers["x-file-name"]),
          bytes: await hamGovde(req),
        });
        return reply(200, importService.public(item));
      }

      if ((g = p.match(/^\/api\/imports\/([^/]+)$/)) && m === "GET") {
        try {
          const item = importService.get(tenant, decodeURIComponent(g[1]));
          return reply(200, importService.public(item));
        } catch { return reply(404, null); }
      }

      if ((g = p.match(/^\/api\/imports\/([^/]+)\/(scan|analysis|build|verify|accept|cancel)$/))) {
        const id = decodeURIComponent(g[1]), action = g[2];
        if (action === "scan" && m === "POST") return reply(200, await importService.scan(tenant, id, await govde(req).catch(() => ({}))));
        if (action === "analysis" && m === "POST") return reply(200, await importService.analyze(tenant, id, await govde(req)));
        if (action === "build" && m === "POST") return reply(200, await importService.build(tenant, id));
        if (action === "verify" && m === "POST") return reply(200, await importService.verify(tenant, id));
        if (action === "accept" && m === "POST") return reply(200, await importService.accept(tenant, id));
        if (action === "cancel" && m === "POST") return reply(200, await importService.cancel(tenant, id));
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
          if (!d || d.revoked) return reply(200, { aktif: false });
          /* Yaş SUNUCUDA hesaplanıyor: tarayıcı kendi saatiyle karşılaştırsa
             saat kayması yüzünden ya hep bayat ya hiç bayat görünürdü. */
          return reply(200, { aktif: true, key: d.key, name: d.name || d.key,
            at: d.at, yasSaniye: Math.max(0, Math.round((Date.now() - Date.parse(d.at)) / 1000)),
            gunluk: d.gunluk || [] });
        }
        if (m === "PUT") {
          const b = await govde(req);
          const plan = b?.plan;
          if (!plan || typeof plan !== "object" || !plan.key)
            return reply(400, { hata: "plan bekleniyor" });
          /* Derinlemesine savunma: canlı yazma ASLA yerleşik bir örneğin
             anahtarına düşmemeli (editörün sessiz çatallaması oradan
             tetikleniyor). Ön ek MCP tarafında konuyor, burada denetleniyor. */
          if (!String(plan.key).startsWith(LIVE_ONEK))
            return reply(400, { hata: `canlı anahtar "${LIVE_ONEK}" ile başlamalı` });
          const d = oku();
          /* b.yeni: LLM create_plan/open_sample çağırdı — bu bir DEVAM
             değil, baştan başlama. İptal düşer. Bayrak yoksa aynı çizime
             yazmaya çalışıyor demektir ve iptal geçerlidir. */
          if (d && d.revoked && d.key === plan.key && !b.yeni)
            return reply(409, { hata: "operatör devraldı" });
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
          return reply(204);
        }
        if (m === "DELETE") {                       /* KES */
          const d = oku();
          if (d) yaz({ ...d, revoked: true });
          return reply(204);
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
        return reply(200, sohbetBilgi());

      if (p === "/api/chat/upload" && m === "POST") {
        const item = await importService.save({
          tenant,
          name: yuklemeAdi(req.headers["x-file-name"]),
          bytes: await hamGovde(req),
        });
        return reply(200, { ...importService.public(item), path: item.path });
      }

      if (p === "/api/chat") {
        if (m === "GET") {
          const id = u.searchParams.get("id");
          if (!id) return reply(400, { hata: "id gerekli" });
          return reply(200, await akisOku(tenant, id));
        }
        if (m === "DELETE") {
          const id = u.searchParams.get("id");
          if (!id) return reply(400, { hata: "id gerekli" });
          const ok = await sohbetTemizle(tenant, id);
          const r = db.prepare("SELECT value FROM editor_prefs WHERE tenant_id = ? AND key = ?")
            .get(tenant, LIVE_KEY);
          if (r) {
            try {
              const d = JSON.parse(r.value);
              db.prepare(`INSERT INTO editor_prefs (tenant_id,key,value) VALUES (?,?,?)
                ON CONFLICT (tenant_id,key) DO UPDATE SET value = excluded.value`)
                .run(tenant, LIVE_KEY, JSON.stringify({ ...d, gunluk: [] }));
            } catch { /* bozuk günlük temizlenmez */ }
          }
          return reply(ok ? 204 : 409);
        }
        if (m === "POST") {
          const b = await govde(req);
          if (!b?.id || !b?.mesaj) return reply(400, { hata: "id ve mesaj gerekli" });
          if (!sohbetAcikMi()) return reply(503, { hata: "Sohbet kapalı: ANTHROPIC_API_KEY, OPENAI_API_KEY ya da GEMINI_API_KEY tanımlı değil" });
          const bearer = String(req.headers.authorization || "").match(/^Bearer\s+(.+)$/i)?.[1] || null;
          return reply(202, await mesajGonder(tenant, b.id, String(b.mesaj), {
            api: process.env.SEAT_EDITOR_API || null, tenant, token: bearer,
          }));
        }
      }

      /* ── SINIR: taslak → kanonik ── */
      if ((g = p.match(/^\/api\/plans\/([^/]+)\/publish$/)) && m === "POST") {
        const key = decodeURIComponent(g[1]);
        const r = db.prepare(
          "SELECT document FROM editor_plans WHERE tenant_id = ? AND key = ?").get(tenant, key);
        if (!r) return reply(404, { hata: "taslak yok" });
        try { return reply(200, publish(db, JSON.parse(r.document), key, tenant)); }
        catch (e) {
          /* Şema reddettiyse SEBEBİ görünsün — sessiz başarısızlık, bu
             projede en pahalı hata sınıfıydı. */
          return reply(422, { hata: "plan şemaya oturmadı", detay: String(e.message) });
        }
      }

      /* ── yayımlanmış kanonik veri: okuma ── */
      if (p === "/api/versions" && m === "GET")
        return reply(200, db.prepare(
          `SELECT v.id, v.seat_plan_id, v.version, v.status, v.published_at, sp.name,
                  (SELECT COUNT(*) FROM seating_seats s
                    WHERE s.tenant_id = v.tenant_id AND s.version_id = v.id) AS seats
             FROM seating_seat_plan_versions v
             JOIN seating_seat_plans sp ON sp.tenant_id = v.tenant_id AND sp.id = v.seat_plan_id
            WHERE v.tenant_id = ? ORDER BY sp.name, v.version`).all(tenant));

      if ((g = p.match(/^\/api\/versions\/([^/]+)\/sections$/)) && m === "GET")
        return reply(200, db.prepare(
          `SELECT id, parent_section_id, code, name, kind, geometry_kind,
                  (SELECT COUNT(*) FROM seating_rows r
                    WHERE r.tenant_id = s.tenant_id AND r.version_id = s.version_id
                      AND r.section_id = s.id) AS rows_count
             FROM seating_sections s WHERE tenant_id = ? AND version_id = ?
            ORDER BY code`).all(tenant, decodeURIComponent(g[1])));

      if ((g = p.match(/^\/api\/versions\/([^/]+)\/seats$/)) && m === "GET") {
        const vid = decodeURIComponent(g[1]);
        const limit = Math.min(Number(u.searchParams.get("limit")) || 500, 5000);
        return reply(200, db.prepare(
          `SELECT s.code, s.label, s.x, s.y, s.rotation, t.seat_kind, s.group_id,
                  r.code AS row_code, sec.code AS section_code
             FROM seating_seats s
             JOIN seating_rows r ON r.tenant_id = s.tenant_id AND r.version_id = s.version_id AND r.id = s.row_id
             JOIN seating_sections sec ON sec.tenant_id = s.tenant_id AND sec.version_id = s.version_id AND sec.id = r.section_id
             JOIN seating_seat_types t ON t.tenant_id = s.tenant_id AND t.version_id = s.version_id AND t.id = s.seat_type_id
            WHERE s.tenant_id = ? AND s.version_id = ? ORDER BY s.code LIMIT ?`)
          .all(tenant, vid, limit));
      }

      return reply(404, { hata: "yol yok" });
    } catch (e) {
      return reply(e.statusCode || 500, { hata: String(e.message) });
    }
  };
}

export function createServer(db, opts) { return http.createServer(handler(db, opts)); }

/* doğrudan çalıştırıldığında */
if (process.argv[1] && process.argv[1].endsWith("server/index.mjs")) {
  const port = Number(process.env.PORT) || 8787;
  const db = createDb(process.env.DB_FILE || "db/seating.db");
  clearLiveSessions(db);
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
