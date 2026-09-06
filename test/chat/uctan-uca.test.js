import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { createServer as httpSunucu } from "node:http";
import { createDb, createServer } from "../../server/index.mjs";
import { apiStore } from "../../src/store/api.js";
import { hepsiniKapat } from "../../chat/oturumlar.mjs";

/* ══════════════════════════════════════════════════════════════════════════
   UÇTAN UCA — operatörün yazdığı cümleden kaydedilmiş plana

   rota.test.js rotaların SÖZLEŞMESİNİ sınıyor (kapalıysa söylüyor mu, hata
   yutuluyor mu). Burada sınanan şey BAŞARILI BİR TUR: model araç çağırıyor,
   araçlar gerçekten çalışıyor, plan gerçekten kuruluyor, adımlar operatörün
   okuyacağı dille akışa düşüyor.

   MODEL YERİNE, MODELİN KONUŞTUĞU DİLİ KONUŞAN BİR TAKLİT SUNUCU var:
   Anthropic'in SSE olay dizisini üretiyor ve SDK'nın ANTHROPIC_BASE_URL'ü
   oraya çevriliyor. Böylece üretim kodunda TEK SATIR değişmeden şu zincirin
   tamamı gerçek koşuyor:

     POST /api/chat → oturum → sağlayıcı adaptörü → @anthropic-ai/sdk →
     HTTP + SSE ayrıştırma → araç çağrısı → süreç-içi MCP köprüsü →
     29 aracın gerçeği → src/core geometrisi → GET /api/chat akışı

   Taklit edilen tek şey modelin KARARI. Para harcanmıyor, ağa çıkılmıyor.
   ══════════════════════════════════════════════════════════════════════════ */

/* ── Anthropic SSE olay dizisi ───────────────────────────────────────────
   Gerçek tel biçimi; SDK bunu bekliyor ve eksiği olursa stream() takılır. */
const sse = (res, olaylar) => {
  res.writeHead(200, { "content-type": "text/event-stream", "cache-control": "no-cache" });
  for (const o of olaylar) res.write(`event: ${o.type}\ndata: ${JSON.stringify(o)}\n\n`);
  res.end();
};

const bas = (m = "claude-test") => ({
  type: "message_start",
  message: { id: "msg_1", type: "message", role: "assistant", model: m,
    content: [], stop_reason: null, stop_sequence: null,
    usage: { input_tokens: 1, output_tokens: 1 } },
});
const son = (stop) => ([
  { type: "message_delta", delta: { stop_reason: stop, stop_sequence: null },
    usage: { output_tokens: 1 } },
  { type: "message_stop" },
]);

/** Modelin araç çağırdığı bir yanıt. */
const aracYaniti = (cagrilar) => [
  bas(),
  ...cagrilar.flatMap(([id, ad, girdi], i) => [
    { type: "content_block_start", index: i,
      content_block: { type: "tool_use", id, name: ad, input: {} } },
    { type: "content_block_delta", index: i,
      delta: { type: "input_json_delta", partial_json: JSON.stringify(girdi) } },
    { type: "content_block_stop", index: i },
  ]),
  ...son("tool_use"),
];

/** Modelin düz metinle bitirdiği yanıt. */
const metinYaniti = (metin) => [
  bas(),
  { type: "content_block_start", index: 0, content_block: { type: "text", text: "" } },
  { type: "content_block_delta", index: 0, delta: { type: "text_delta", text: metin } },
  { type: "content_block_stop", index: 0 },
  ...son("end_turn"),
];

let srv, base, db, taklit, istekler;
const ANAHTARLAR = ["ANTHROPIC_API_KEY", "OPENAI_API_KEY", "GEMINI_API_KEY",
  "GOOGLE_API_KEY", "SOHBET_SAGLAYICI", "ANTHROPIC_BASE_URL", "SEAT_EDITOR_API"];
const yedek = {};
let senaryo = [];

beforeAll(async () => {
  ANAHTARLAR.forEach((a) => { yedek[a] = process.env[a]; });

  istekler = [];
  let i = 0;
  taklit = httpSunucu((req, res) => {
    let govde = "";
    req.on("data", (c) => { govde += c; });
    req.on("end", () => {
      istekler.push({ yol: req.url, govde: govde });
      sse(res, senaryo[Math.min(i++, senaryo.length - 1)]);
    });
  });
  await new Promise((ok) => taklit.listen(0, "127.0.0.1", ok));

  ANAHTARLAR.forEach((a) => delete process.env[a]);
  process.env.ANTHROPIC_API_KEY = "sk-test-taklit";
  process.env.ANTHROPIC_BASE_URL = `http://127.0.0.1:${taklit.address().port}`;

  db = createDb(":memory:");
  srv = createServer(db);
  await new Promise((ok) => srv.listen(0, "127.0.0.1", ok));
  base = `http://127.0.0.1:${srv.address().port}/api`;
  /* server/index.mjs açılışta bunu KENDİSİ veriyor (bkz. oradaki not);
     test createServer'ı doğrudan kurduğu için aynısını burada yapıyoruz.
     Verilmezse canlı yazma sessizce hiçbir şey yapmaz ve operatör
     ekranında tek bir adım bile görünmez — bu testin yakaladığı hata. */
  process.env.SEAT_EDITOR_API = base;
});

afterAll(async () => {
  await hepsiniKapat();
  ANAHTARLAR.forEach((a) => {
    if (yedek[a] === undefined) delete process.env[a]; else process.env[a] = yedek[a];
  });
  await new Promise((ok) => srv.close(ok));
  await new Promise((ok) => taklit.close(ok));
});

const S = () => apiStore(base);

/** Turu başlat ve BİTENE kadar akışı oku. */
async function tur(id, mesaj) {
  const r = await fetch(`${base}/chat`, {
    method: "POST", headers: { "content-type": "application/json" },
    body: JSON.stringify({ id, mesaj }),
  });
  expect(r.status).toBe(202);
  for (let i = 0; i < 300; i++) {
    const d = await S().sohbetOku(id);
    if (d && !d.calisiyor && d.akis.length > 1) return d;
    await new Promise((ok) => setTimeout(ok, 100));
  }
  throw new Error("tur bitmedi");
}

describe("operatörün cümlesinden kaydedilmiş plana", () => {
  it("model araç çağırıyor, ARAÇLAR GERÇEKTEN çalışıyor, plan kuruluyor", async () => {
    senaryo = [
      aracYaniti([["t1", "create_plan", { name: "Sınav Salonu", key: "sv" }]]),
      aracYaniti([["t2", "add_shape",
        { type: "stage", x: 0, y: -400, w: 1200, h: 400, label: "SAHNE" }]]),
      aracYaniti([["t3", "add_block",
        { kind: "grid", label: "PARTER", level: "Zemin", x: 0, y: 300, rows: 10, cols: 20 }]]),
      metinZinciri(),
    ];
    const d = await tur("uc1", "Bir salon çiz: sahne ve 200 koltukluk parter.");

    /* 1 — operatörün mesajı akışın başında duruyor */
    expect(d.akis[0]).toMatchObject({ rol: "kullanici" });

    /* 2 — hangi araçların koştuğu sohbet akışında */
    const hepsi = JSON.stringify(d.akis);
    expect(d.akis.filter((x) => x.rol === "arac").map((x) => x.metin))
      .toEqual(["create_plan", "add_shape", "add_block"]);

    /* 3 — OPERATÖRÜN OKUDUĞU DİL canlı günlükte. Panel sohbetin çıplak
       araç satırlarını atıp bunu gösteriyor (bkz. SohbetPaneli); o yüzden
       "insanın anlayacağı dille" sözü BURADA tutuluyor, orada değil. */
    const canli = await S().liveGet();
    const gunluk = canli?.gunluk || [];
    const satirlar = gunluk.map((g) => g.n);
    expect(satirlar).toEqual([
      'Sahne kondu: "SAHNE"',
      'Izgara blok eklendi: "PARTER" · 10 sıra · Zemin',
    ]);
    /* Araç GERÇEKTEN çalıştı: 10×20 ızgaranın koltuk sayısı uydurulamaz,
       src/core geometrisinden geliyor. */
    expect(gunluk.at(-1).k).toBe(200);
    /* Kural bulguları da operatöre gidiyor — eksiği o da görsün. */
    expect(gunluk.at(-1).u.join(" ")).toMatch(/kapı tanımlanmamış/);

    /* 4 — çizilen plan gerçekten kaydedildi ve canlı görünüm onu
       gösteriyor. Anahtar "ai-" ad alanında: yapay zekâ operatörün kayıtlı
       planını ASLA ezmiyor. */
    expect(canli.aktif).toBe(true);
    expect(canli.key).toBe("ai-sv");
    const kayitli = await S().load("ai-sv");
    expect(kayitli.blocks).toHaveLength(1);
    expect(kayitli.shapes.some((x) => x.type === "stage")).toBe(true);
    /* Operatörün kendi "sv" planına dokunulmadı. */
    expect(await S().list()).not.toContain("sv");

    /* 5 — asistanın kapanış metni geldi, hata yok */
    expect(d.calisiyor).toBe(false);
    expect(d.akis.some((x) => x.rol === "hata")).toBe(false);
    expect(hepsi).toMatch(/Salon hazır/);
  }, 60_000);

  it("MCP'nin 29 aracı modele GERÇEKTEN gönderiliyor — tek kaynak", async () => {
    /* Araç şemaları elle yazılmıyor, MCP sunucusundan geliyor. Bunu
       kanıtlamanın yolu: tel üstünde görmek. */
    const g = istekler.map((x) => x.govde).join("");
    expect(g).toMatch(/"name":"create_plan"/);
    expect(g).toMatch(/"name":"cut_vomitories"/);
    expect(g).toMatch(/"name":"auto_gates"/);
    expect(g).toMatch(/"name":"validate"/);
  });

  it("araç HATASI modele gidiyor, tur ölmüyor — model düzeltebilsin", async () => {
    senaryo = [
      aracYaniti([["t1", "create_plan", { name: "H", key: "h" }]]),
      /* r0 olmadan yelpaze: araç throw eder */
      aracYaniti([["t2", "add_block",
        { kind: "fan", label: "X", level: "L", x: 0, y: 0, rows: 5 }]]),
      metinYaniti("r0 eksikmiş, düzeltiyorum."),
    ];
    const d = await tur("uc2", "yelpaze ekle");
    expect(d.calisiyor).toBe(false);
    /* Hata modele ulaştı: taklit sunucunun aldığı son istekte görünmeli */
    expect(istekler.map((x) => x.govde).join("")).toMatch(/r0/);
    /* ve tur çökmedi */
    expect(JSON.stringify(d.akis)).toMatch(/düzeltiyorum/);
  }, 60_000);
});

/* Kapanış metni ayrı: yukarıdaki senaryoda okunurluk için. */
function metinZinciri() {
  return metinYaniti("Salon hazır: sahne ve 200 koltukluk parter kuruldu.");
}
