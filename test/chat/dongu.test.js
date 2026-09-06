import { describe, it, expect } from "vitest";
import { oturumAc, tur, ARAC_SINIRI } from "../../chat/dongu.mjs";
import * as anthropic from "../../chat/saglayici/anthropic.mjs";
import * as openai from "../../chat/saglayici/openai.mjs";
import * as gemini from "../../chat/saglayici/gemini.mjs";

/* ══════════════════════════════════════════════════════════════════════════
   DÖNGÜ — ÜÇ SAĞLAYICI, TEK TEST PAKETİ

   Gerçek API çağrısı YOK: her sağlayıcı için kendi SDK'sının şeklinde sahte
   bir istemci var. Sınanan şey modelin zekâsı değil, SOYUTLAMANIN TUTMASI —
   aynı senaryo üçünde de aynı sonucu vermeli. Dördüncü bir sağlayıcı
   eklendiğinde buraya bir satır ekleniyor ve döngüye hiç dokunulmuyor.

   Araçlar GERÇEK (süreç-içi MCP), yani sonuçlar editörün çekirdeğinden
   geliyor — sahte olan yalnız model.
   ══════════════════════════════════════════════════════════════════════════ */

const KURULUM = [
  {
    s: anthropic, ad: "anthropic",
    metin: (t) => ({ stop_reason: "end_turn", content: [{ type: "text", text: t }] }),
    arac: (...c) => ({ stop_reason: "tool_use",
      content: c.map(([id, ad, girdi]) => ({ type: "tool_use", id, name: ad, input: girdi })) }),
    red: () => ({ stop_reason: "refusal", stop_details: { category: "cyber" }, content: [] }),
    sahte: (y) => { const istekler = []; let i = 0;
      return { istekler, messages: { stream: async (x) => {
        istekler.push(x); const r = y[Math.min(i++, y.length - 1)];
        return { finalMessage: async () => r };
      } } }; },
  },
  {
    s: openai, ad: "openai",
    metin: (t) => ({ role: "assistant", content: t }),
    arac: (...c) => ({ role: "assistant", content: null,
      tool_calls: c.map(([id, ad, girdi]) => ({ id, type: "function",
        function: { name: ad, arguments: JSON.stringify(girdi) } })) }),
    red: null,                                   /* ayrı bir red durumu yok */
    sahte: (y) => { const istekler = []; let i = 0;
      return { istekler, chat: { completions: { create: async (x) => {
        istekler.push(x);
        return { choices: [{ message: y[Math.min(i++, y.length - 1)] }] };
      } } } }; },
  },
  {
    s: gemini, ad: "gemini",
    metin: (t) => ({ role: "model", parts: [{ text: t }] }),
    arac: (...c) => ({ role: "model",
      parts: c.map(([id, ad, girdi]) => ({ functionCall: { id, name: ad, args: girdi } })) }),
    red: null,
    sahte: (y) => { const istekler = []; let i = 0;
      return { istekler, models: { generateContent: async (x) => {
        istekler.push(x);
        return { candidates: [{ content: y[Math.min(i++, y.length - 1)] }] };
      } } }; },
  },
];

for (const K of KURULUM) {
  describe(`sohbet döngüsü · ${K.ad}`, () => {
    const kur = (yanitlar) => {
      const istemci = K.sahte(yanitlar);
      return { istemci, ac: () => oturumAc({ saglayici: K.s, istemci, model: "test" }) };
    };

    it("araçsız tur: mesaj gidiyor, cevap dönüyor", async () => {
      const { ac } = kur([K.metin("Hangi salonu çizelim?")]);
      const o = await ac();
      const r = await tur(o, "selam");
      expect(r.durum).toBe("bitti");
      expect(r.metin).toBe("Hangi salonu çizelim?");
      expect(r.arac).toBe(0);
      await o.kapat();
    });

    it("istek MCP'den gelen araçları taşıyor", async () => {
      const { istemci, ac } = kur([K.metin("ok")]);
      const o = await ac();
      await tur(o, "selam");
      /* Araçların BİÇİMİ sağlayıcıya göre değişiyor, KAYNAĞI değişmiyor. */
      const g = JSON.stringify(istemci.istekler[0]);
      expect(g).toMatch(/create_bowl/);
      expect(g).toMatch(/cut_vomitories/);
      await o.kapat();
    });

    it("araç GERÇEKTEN çalışıyor, sonucu geçmişe giriyor", async () => {
      const { istemci, ac } = kur([
        K.arac(["t1", "create_plan", { name: "D", key: "d" }]),
        K.arac(["t2", "add_block", { kind: "grid", label: "A", level: "L", x: 0, y: 0, rows: 5, cols: 10 }]),
        K.metin("50 koltukluk blok kuruldu."),
      ]);
      const o = await ac();
      const gorulen = [];
      const r = await tur(o, "blok ekle", (e) => gorulen.push(e.ad));
      expect(gorulen).toEqual(["create_plan", "add_block"]);
      expect(r.arac).toBe(2);
      /* Sonuç uydurma değil, çekirdekten geliyor. */
      expect(JSON.stringify(o.mesajlar)).toMatch(/50 koltuk/);
      expect(istemci.istekler.length).toBe(3);
      await o.kapat();
    });

    it("aynı yanıttaki iki araç VERİLDİĞİ sırayla işleniyor", async () => {
      const { ac } = kur([
        K.arac(["t0", "create_plan", { name: "S", key: "sr" }]),
        K.arac(["a", "add_block", { kind: "grid", label: "A", level: "L", x: 0, y: 0, rows: 2, cols: 3 }],
          ["b", "update_block", { id: "A", rows: 5 }]),
        K.metin("tamam"),
      ]);
      const o = await ac();
      const gorulen = [];
      await tur(o, "kur ve güncelle", (e) => gorulen.push(e.ad));
      expect(gorulen).toEqual(["create_plan", "add_block", "update_block"]);
      expect(o.session.plan.blocks[0].rows).toBe(5);   /* bağımlı çağrı uygulandı */
      await o.kapat();
    });

    it("GÖRSEL modele ulaşıyor — 'çizdiğine bak' döngüsü üçünde de çalışıyor", async () => {
      /* Anthropic görseli araç yanıtının İÇİNDE taşıyor; öbür ikisi ayrı
         turda. Testin umurunda değil — görsel geçmişte GÖRÜNMELİ. */
      const { ac } = kur([
        K.arac(["t1", "create_plan", { name: "G", key: "g" }]),
        K.arac(["t2", "add_block", { kind: "grid", label: "A", level: "L", x: 0, y: 0, rows: 3, cols: 4 }]),
        K.arac(["t3", "render", { scope: "all", width: 400 }]),
        K.metin("çizime baktım"),
      ]);
      const o = await ac();
      await tur(o, "çiz ve bak");
      const g = JSON.stringify(o.mesajlar);
      expect(g).toMatch(/image\/png/);
      expect(g.length).toBeGreaterThan(5000);       /* base64 gerçekten orada */
      await o.kapat();
    }, 30_000);

    it("araç sınırı TUTUYOR ve sebebini söylüyor", async () => {
      const { ac } = kur([
        K.arac(["t0", "create_plan", { name: "S", key: "s" }]),
        K.arac(["t", "plan_summary", {}]),
      ]);
      const o = await ac();
      const r = await tur(o, "durmadan çağır");
      expect(r.durum).toBe("sinir");
      expect(r.arac).toBeLessThanOrEqual(ARAC_SINIRI);
      expect(r.metin).toMatch(/sınır/i);
      await o.kapat();
    }, 30_000);

    it("araç HATASI döngüyü düşürmüyor — modele gidiyor", async () => {
      const { ac } = kur([
        K.arac(["t1", "create_plan", { name: "H", key: "h" }]),
        K.arac(["t2", "add_block", { kind: "fan", label: "X", level: "L", x: 0, y: 0, rows: 5 }]),
        K.metin("r0 eksikmiş."),
      ]);
      const o = await ac();
      const r = await tur(o, "yelpaze ekle");
      expect(r.durum).toBe("bitti");
      expect(JSON.stringify(o.mesajlar)).toMatch(/r0/);
      await o.kapat();
    });

    if (K.red) {
      it("model REDDEDERSE döngü temiz duruyor", async () => {
        const { ac } = kur([K.red()]);
        const o = await ac();
        const r = await tur(o, "kötü bir şey");
        expect(r.durum).toBe("red");
        expect(r.ayrinti).toBe("cyber");
        await o.kapat();
      });
    }
  });
}
