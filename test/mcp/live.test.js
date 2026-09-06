import { describe, it, expect, beforeAll, afterAll, beforeEach } from "vitest";
import { baglan } from "./harness.js";
import { createDb, createServer } from "../../server/index.mjs";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { rmSync } from "node:fs";

/* ══════════════════════════════════════════════════════════════════════════
   CANLI GÖRÜNÜM — MCP tarafı

   Burada sınanan şey, iki SÜRECİN dikişi: LLM çizerken editörün göreceği
   yere gerçekten yazılıyor mu, KES gerçekten durduruyor mu, ve — en
   önemlisi — sunucu YOKKEN çizim aksıyor mu.

   Bu son madde bu dosyanın var oluş nedeni: canlı görünüm bir GÖRÜNTÜLEME
   özelliği. Sunucu kapalı diye add_block'un patlaması, işe yarayan bir
   ürünü göstermelik bir özellik uğruna kırmak olurdu.
   ══════════════════════════════════════════════════════════════════════════ */

let srv, db, taban;

beforeAll(async () => {
  db = createDb(":memory:");
  srv = createServer(db);
  await new Promise((ok) => srv.listen(0, "127.0.0.1", ok));
  taban = `http://127.0.0.1:${srv.address().port}/api`;
});
afterAll(() => new Promise((ok) => srv.close(ok)));
beforeEach(() => { db.exec("DELETE FROM editor_prefs WHERE key = '__live'; DELETE FROM editor_plans;"); });

/* Yazma bilerek beklenmiyor (fire-and-forget). Test, sunucuda GÖRÜNENE
   bakarak bekliyor — sabit bir uyku değil, sonuca göre. */
const bekle = async (kosul, tur = 50) => {
  for (let i = 0; i < tur; i++) {
    const d = await kosul();
    if (d) return d;
    await new Promise((r) => setTimeout(r, 20));
  }
  return null;
};
const canli = () => fetch(`${taban}/live`).then((r) => r.json());

describe("SEAT_EDITOR_API verilmemişken", () => {
  it("hiç ağa çıkmıyor — plan sunucuda GÖRÜNMÜYOR", async () => {
    delete process.env.SEAT_EDITOR_API;
    const t = await baglan();
    await t.cagir("create_plan", { name: "Sessiz" });
    await t.cagir("add_block", { kind: "grid", label: "A", level: "L", x: 0, y: 0, rows: 5, cols: 10 });
    await new Promise((r) => setTimeout(r, 120));
    expect((await canli()).aktif).toBe(false);
    await t.kapat();
  });
});

describe("SEAT_EDITOR_API verilmişken", () => {
  beforeEach(() => { process.env.SEAT_EDITOR_API = taban; });
  afterAll(() => { delete process.env.SEAT_EDITOR_API; });

  it("her değişiklik canlı görünüme yansıyor", async () => {
    const t = await baglan();
    await t.cagir("create_plan", { name: "Canlı", key: "c1" });
    await t.cagir("add_block", { kind: "grid", label: "A", level: "L", x: 0, y: 0, rows: 5, cols: 10 });
    const d = await bekle(async () => { const x = await canli(); return x.aktif ? x : null; });
    expect(d).not.toBeNull();
    expect(d.key).toBe("ai-c1");
    const plan = await (await fetch(`${taban}/plans/ai-c1`)).json();
    expect(plan.blocks).toHaveLength(1);
  });

  it("yerleşik örneğin anahtarı EZİLMİYOR — ai- ad alanı", async () => {
    /* open_sample planı "gs" anahtarıyla tutuyor. O anahtara canlı yazmak
       editörün sessiz çatallamasını tetikler ve yeniden yüklemede plan
       kaybolurdu. */
    const t = await baglan();
    await t.cagir("open_sample", { key: "sureyya" });
    await t.cagir("add_block", { kind: "grid", label: "YENİ", level: "L", x: 9000, y: 0, rows: 2, cols: 4 });
    const d = await bekle(async () => { const x = await canli(); return x.aktif ? x : null; });
    expect(d.key).toBe("ai-sureyya");
    const liste = await (await fetch(`${taban}/plans`)).json();
    expect(liste).toContain("ai-sureyya");
    expect(liste).not.toContain("sureyya");
    await t.kapat();
  });

  it("KES'ten sonra araçlar ANLAMLI hatayla duruyor", async () => {
    const t = await baglan();
    await t.cagir("create_plan", { name: "Kesilecek", key: "k1" });
    await t.cagir("add_block", { kind: "grid", label: "A", level: "L", x: 0, y: 0, rows: 5, cols: 10 });
    await bekle(async () => ((await canli()).aktif ? true : null));

    await fetch(`${taban}/live`, { method: "DELETE" });                 /* KES */

    /* Bir çağrı gecikme bilinçli (bkz. mcp/live.mjs): o yazma da sunucuda
       409 yiyor, tuvale dokunulmuyor. */
    await t.cagir("add_block", { kind: "grid", label: "B", level: "L", x: 3000, y: 0, rows: 5, cols: 10 })
      .catch(() => {});
    await bekle(async () => (t.session.kesildi ? true : null));

    await expect(t.cagir("add_block", { kind: "grid", label: "C", level: "L", x: 6000, y: 0, rows: 5, cols: 10 }))
      .rejects.toThrow(/Operatör devraldı/i);
    /* Ne yapacağını da söylüyor. */
    await expect(t.cagir("plan_summary")).rejects.toThrow(/create_plan|open_sample/);
    await t.kapat();
  });

  it("KES bir ÇİZİMİ durduruyor, oturumu değil — yeni plan serbest", async () => {
    const t = await baglan();
    await t.cagir("create_plan", { name: "İlk", key: "y1" });
    await t.cagir("add_block", { kind: "grid", label: "A", level: "L", x: 0, y: 0, rows: 5, cols: 10 });
    await bekle(async () => ((await canli()).aktif ? true : null));
    await fetch(`${taban}/live`, { method: "DELETE" });
    await t.cagir("add_block", { kind: "grid", label: "B", level: "L", x: 3000, y: 0, rows: 2, cols: 2 }).catch(() => {});
    await bekle(async () => (t.session.kesildi ? true : null));

    await t.cagir("create_plan", { name: "İkinci", key: "y2" });        /* yeni çizim */
    await t.cagir("add_block", { kind: "grid", label: "A", level: "L", x: 0, y: 0, rows: 3, cols: 6 });
    const d = await bekle(async () => { const x = await canli(); return x.aktif && x.key === "ai-y2" ? x : null; });
    expect(d).not.toBeNull();
    await t.kapat();
  });

  it("KES'ten sonra AYNI adla yeniden çizmek serbest", async () => {
    /* Kullanırken çıktı: iptal anahtara bağlı olduğu için operatör
       devraldıktan sonra "Tayyare'yi yeniden çiz" demek 409 yiyordu ve
       sistem bozuk görünüyordu. create_plan/open_sample artık niyeti
       ayrıca bildiriyor: bu bir DEVAM değil, baştan başlama. */
    const t = await baglan();
    await t.cagir("create_plan", { name: "Tayyare", key: "ty" });
    await t.cagir("add_block", { kind: "grid", label: "A", level: "L", x: 0, y: 0, rows: 5, cols: 10 });
    await bekle(async () => ((await canli()).aktif ? true : null));
    await fetch(`${taban}/live`, { method: "DELETE" });                 /* KES */
    await t.cagir("add_block", { kind: "grid", label: "B", level: "L", x: 3000, y: 0, rows: 2, cols: 2 }).catch(() => {});
    await bekle(async () => (t.session.kesildi ? true : null));

    /* AYNI anahtar, yeni çizim. */
    await t.cagir("create_plan", { name: "Tayyare", key: "ty" });
    await t.cagir("add_block", { kind: "grid", label: "A", level: "L", x: 0, y: 0, rows: 4, cols: 5 });
    const d = await bekle(async () => {
      const x = await canli(); return x.aktif && x.key === "ai-ty" ? x : null;
    });
    expect(d).not.toBeNull();
    /* Günlük de sıfırlanmalı — önceki çizimin adımları altta durmamalı. */
    expect(d.gunluk.every((a) => !/"B"/.test(a.n))).toBe(true);
    await t.kapat();
  });

  it("adım günlüğü OPERATÖR DİLİNDE ve bulguları taşıyor", async () => {
    /* Panelin okuduğu şey bu. "grid" değil "Izgara", ham kural kimliği
       değil hedef değerli mesaj — operatör kod bilmek zorunda değil. */
    const t = await baglan();
    await t.cagir("create_plan", { name: "Günlük", key: "gl" });
    await t.cagir("add_block", { kind: "grid", label: "SALON", level: "Zemin",
      x: 0, y: 0, rows: 10, cols: 20 });
    const d = await bekle(async () => {
      const x = await canli(); return x.aktif && x.gunluk?.length ? x : null;
    });
    const son = d.gunluk[d.gunluk.length - 1];
    expect(son.n).toMatch(/Izgara blok eklendi: "SALON"/);
    expect(son.n).toMatch(/10 sıra/);
    expect(son.n).not.toMatch(/grid/);            /* şema dili sızmasın */
    expect(son.k).toBe(200);
    expect(son.b).toBe(1);
    /* Kural bulgusu HEDEF DEĞERİYLE görünmeli — operatör anında görsün. */
    expect(son.u.join(" ")).toMatch(/[Tt]ekerlekli sandalye/);
    await t.kapat();
  });

  it("çoğaltma satırı KOPYA değil BLOK sayısı diyor", async () => {
    /* count TOPLAM blok sayısı (asıl dahil): 9 verince 8 kopya çıkıyor.
       İlk çeviride "9 kopyaya çoğaltıldı" yazmıştım — paneli okuyunca
       yanlış olduğu görüldü. Sayının anlamı değişirse burası kırılsın. */
    const t = await baglan();
    await t.cagir("create_plan", { name: "Çoğalt", key: "cg" });
    await t.cagir("add_block", { kind: "grid", label: "L1", level: "Z", x: 0, y: 0, rows: 2, cols: 2 });
    await t.cagir("array_blocks", { id: "L1", mode: "linear", count: 9, dx: -170, dy: 0 });
    const d = await bekle(async () => {
      const x = await canli(); return x.gunluk?.length >= 2 ? x : null;
    });
    const son = d.gunluk[d.gunluk.length - 1];
    expect(son.n).toMatch(/9 bloğa çoğaltıldı/);
    expect(son.n).not.toMatch(/kopya/);
    expect(son.b).toBe(9);                        /* metin gerçeğe uyuyor */
    await t.kapat();
  });

  it("şekil satırında şema dili görünmüyor", async () => {
    const t = await baglan();
    await t.cagir("create_plan", { name: "Şekil", key: "sk" });
    await t.cagir("add_shape", { type: "stage", label: "SAHNE", x: 0, y: 0, w: 1000, h: 400 });
    const d = await bekle(async () => {
      const x = await canli(); return x.gunluk?.length ? x : null;
    });
    const son = d.gunluk[d.gunluk.length - 1];
    expect(son.n).toMatch(/Sahne kondu: "SAHNE"/);
    expect(son.n).not.toMatch(/stage/);
    await t.kapat();
  });

  it("SUNUCU KAPALIYKEN çizim aksamıyor — asıl koruma bu", async () => {
    /* İLK YAZDIĞIMDA BU TEST BOŞLUĞUN ETRAFINDAN GEÇİYORDU: live.mjs'teki
       .catch() kaldırılınca test YEŞİL kalıyordu, çünkü beklenmeyen bir
       söz reddi araç çağrısını düşürmüyor. Oysa gerçekte o reddi kimse
       yakalamazsa MCP sunucu SÜRECİ ölür — yani sınanması gereken şey
       "add_block döndü mü" değil, "ortada işlenmemiş red kaldı mı".
       Sabotajla ölçüldü: bu haliyle .catch()'i kaldırınca test kırılıyor. */
    const redler = [];
    const dinle = (e) => redler.push(e);
    process.on("unhandledRejection", dinle);
    try {
      process.env.SEAT_EDITOR_API = "http://127.0.0.1:1/api";
      const t = await baglan();
      await t.cagir("create_plan", { name: "Sunucusuz", key: "s1" });
      const r = await t.cagir("add_block", { kind: "grid", label: "A", level: "L", x: 0, y: 0, rows: 5, cols: 10 });
      expect(r).toMatch(/50 koltuk/);
      /* Ard arda da çalışmalı — hata birikip oturumu kilitlemesin. */
      await t.cagir("add_block", { kind: "grid", label: "B", level: "L", x: 3000, y: 0, rows: 5, cols: 10 });
      expect(await t.cagir("plan_summary")).toMatch(/"seatCount": 100/);
      await t.kapat();
      /* Reddin ortaya çıkması için bir tur bekle. */
      await new Promise((ok) => setTimeout(ok, 250));
      expect(redler).toEqual([]);
    } finally { process.off("unhandledRejection", dinle); }
  });
});

describe("KES, SÜREÇ SINIRINI aşıyor mu (mcp/cli.mjs yolu)", () => {
  /* Bunu tarayıcıda uçtan uca denerken buldum: cli.mjs her çağrıda YENİ
     bir Session kuruyor, dolayısıyla kesik bayrağı süreçle birlikte
     ölüyordu. Sunucu yazmaları reddetmeye devam ediyordu (operatörün
     tuvali güvendeydi) ama LLM her seferinde "Blok eklendi" görüyordu —
     boşluğa çiziyor ve haberi yok. Tam da bu projede kovaladığımız
     sessiz başarısızlık sınıfı, bu yüzden gerçek süreçle sınanıyor. */
  const calistir = promisify(execFile);
  const OTURUM = "/tmp/seat-live-test-session.json";

  const cli = async (...arg) => {
    try {
      const { stdout } = await calistir(process.execPath, ["mcp/cli.mjs", "call", ...arg],
        { env: { ...process.env, SEAT_EDITOR_API: taban, MCP_SESSION: OTURUM } });
      return stdout;
    } catch (e) { return (e.stdout || "") + (e.stderr || ""); }
  };

  it("ayrı süreçlerde bile yapay zekâ kesildiğini ÖĞRENİYOR", async () => {
    rmSync(OTURUM, { force: true });
    await fetch(`${taban}/live`, { method: "DELETE" });

    await cli("create_plan", '{"name":"Süreç","key":"sr"}');
    expect(await cli("add_block", '{"kind":"grid","label":"A","level":"L","x":0,"y":0,"rows":5,"cols":10}'))
      .toMatch(/blok eklendi/i);

    await fetch(`${taban}/live`, { method: "DELETE" });                 /* KES */

    await cli("add_block", '{"kind":"grid","label":"B","level":"L","x":3000,"y":0,"rows":5,"cols":10}');
    /* İkinci çağrıda öğrenmeli — bayrak dosyada taşınıyor. */
    expect(await cli("add_block", '{"kind":"grid","label":"C","level":"L","x":6000,"y":0,"rows":5,"cols":10}'))
      .toMatch(/Operatör devraldı/i);

    /* Ve yeni bir çizim serbest kalmalı — KES oturumu değil ÇİZİMİ durdurur. */
    expect(await cli("create_plan", '{"name":"Yeni","key":"yn"}')).toMatch(/Yeni plan açıldı/);
    rmSync(OTURUM, { force: true });
  }, 40_000);
});
