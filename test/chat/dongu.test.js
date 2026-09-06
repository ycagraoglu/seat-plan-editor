import { describe, it, expect } from "vitest";
import { oturumAc, tur, ARAC_SINIRI } from "../../chat/dongu.mjs";

/* ══════════════════════════════════════════════════════════════════════════
   DÖNGÜ — gerçek API çağrısı OLMADAN

   Model istemcisi dışarıdan veriliyor, o yüzden burada sahte bir model
   kullanıyoruz: para harcamadan, ağa çıkmadan, deterministik. Sınanan şey
   modelin zekâsı değil DÖNGÜNÜN DOĞRULUĞU — araç sırası, geçmişin şekli,
   sınırın tutması, reddin ele alınması.

   Araçlar GERÇEK (süreç-içi MCP), yani tool_result'lar gerçekten editörün
   çekirdeğinden geliyor.
   ══════════════════════════════════════════════════════════════════════════ */

/** Sırayla verilen yanıtları döndüren sahte model. */
const sahteModel = (yanitlar) => {
  const istekler = [];
  let i = 0;
  return {
    istekler,
    messages: {
      stream: async (istek) => {
        istekler.push(istek);
        const y = yanitlar[Math.min(i++, yanitlar.length - 1)];
        return { finalMessage: async () => y };
      },
    },
  };
};

const metin = (t) => ({ stop_reason: "end_turn", content: [{ type: "text", text: t }] });
const aracCagrisi = (id, name, input) => ({
  stop_reason: "tool_use",
  content: [{ type: "tool_use", id, name, input }],
});

describe("sohbet döngüsü", () => {
  it("araçsız tur: mesaj gidiyor, cevap dönüyor", async () => {
    const m = sahteModel([metin("Merhaba, hangi salonu çizelim?")]);
    const o = await oturumAc({ anthropic: m });
    const r = await tur(o, "selam");
    expect(r.durum).toBe("bitti");
    expect(r.metin).toBe("Merhaba, hangi salonu çizelim?");
    expect(r.arac).toBe(0);
    await o.kapat();
  });

  it("istek MCP'den gelen araçları ve sistem talimatını taşıyor", async () => {
    const m = sahteModel([metin("ok")]);
    const o = await oturumAc({ anthropic: m });
    await tur(o, "selam");
    const istek = m.istekler[0];
    expect(istek.tools.length).toBeGreaterThanOrEqual(27);
    expect(istek.tools.some((t) => t.name === "create_bowl")).toBe(true);
    expect(istek.system).toMatch(/SANTİMETREDİR/);
    expect(istek.model).toBe("claude-opus-5");
    await o.kapat();
  });

  it("araç çağrısı GERÇEKTEN çalışıyor ve sonucu modele dönüyor", async () => {
    const m = sahteModel([
      aracCagrisi("t1", "create_plan", { name: "Deneme", key: "d" }),
      aracCagrisi("t2", "add_block", { kind: "grid", label: "A", level: "L", x: 0, y: 0, rows: 5, cols: 10 }),
      metin("50 koltukluk bir blok kurdum."),
    ]);
    const o = await oturumAc({ anthropic: m });
    const gorulen = [];
    const r = await tur(o, "bir blok ekle", (e) => gorulen.push(e.ad));
    expect(gorulen).toEqual(["create_plan", "add_block"]);
    expect(r.arac).toBe(2);
    /* Sonuç uydurma değil — çekirdekten geliyor. */
    const sonIstek = m.istekler[m.istekler.length - 1];
    const sonuclar = sonIstek.messages.filter((x) => Array.isArray(x.content)
      && x.content.some((c) => c.type === "tool_result"));
    expect(JSON.stringify(sonuclar)).toMatch(/50 koltuk/);
    await o.kapat();
  });

  it("geçmiş DOĞRU şekilde birikiyor — content'in tamamı geri konuyor", async () => {
    const m = sahteModel([
      aracCagrisi("t1", "create_plan", { name: "G", key: "g" }),
      metin("kuruldu"),
    ]);
    const o = await oturumAc({ anthropic: m });
    await tur(o, "kur");
    /* user → assistant(tool_use) → user(tool_result) → assistant(text) */
    expect(o.mesajlar.map((x) => x.role)).toEqual(["user", "assistant", "user", "assistant"]);
    const asistan = o.mesajlar[1];
    expect(asistan.content[0].type).toBe("tool_use");   /* metin değil, blok */
    await o.kapat();
  });

  it("araç sınırı TUTUYOR ve sebebini söylüyor", async () => {
    /* Sahte model hep araç çağırıyor — kaçak döngü taklidi. */
    const m = sahteModel([aracCagrisi("t", "plan_summary", {})]);
    const o = await oturumAc({ anthropic: m });
    await o.client.callTool({ name: "create_plan", arguments: { name: "S", key: "s" } });
    const r = await tur(o, "durmadan çağır");
    expect(r.durum).toBe("sinir");
    expect(r.arac).toBeLessThanOrEqual(ARAC_SINIRI);
    expect(r.metin).toMatch(/sınır/i);
    await o.kapat();
  }, 30_000);

  it("aynı yanıttaki birden çok araç, VERİLDİĞİ sırayla işleniyor", async () => {
    /* BU TESTİ ÖNCE YANLIŞ GEREKÇEYLE YAZMIŞTIM: "paralel çalışırsa biri
       diğerini ezer" diyordum ve sabotaj yakalamıyordu. Ölçünce sebebi
       çıktı — mutate senkron, yarış YOK; Promise.all ile bile sıra
       bozulmuyor. Yani burada sınanan şey veri bütünlüğü değil, SIRA:
       hem sonuçlar hem operatörün gördüğü günlük modelin verdiği düzende
       olmalı, taşıma katmanının keyfine kalmamalı. */
    const m = sahteModel([
      aracCagrisi("t0", "create_plan", { name: "Sıra", key: "sr" }),
      { stop_reason: "tool_use", content: [
        { type: "tool_use", id: "a", name: "add_block",
          input: { kind: "grid", label: "A", level: "L", x: 0, y: 0, rows: 2, cols: 3 } },
        { type: "tool_use", id: "b", name: "update_block", input: { id: "A", rows: 5 } },
      ] },
      metin("kuruldu ve güncellendi"),
    ]);
    const o = await oturumAc({ anthropic: m });
    const gorulen = [];
    await tur(o, "kur ve güncelle", (e) => gorulen.push(e.ad));
    expect(gorulen).toEqual(["create_plan", "add_block", "update_block"]);
    /* Bağımlı çağrı gerçekten uygulanmış: güncelleme bloğu bulmuş. */
    expect(o.session.plan.blocks[0].rows).toBe(5);
    /* NOT: sahte model isteği REFERANSLA saklıyor ve o.mesajlar sonradan
       büyüyor, o yüzden "son mesaj" demek yanıltıyor — çok araçlı
       tool_result mesajını arayarak bul. */
    const cok = o.mesajlar.find((x) => Array.isArray(x.content)
      && x.content.filter((c) => c.type === "tool_result").length > 1);
    expect(cok.content.map((c) => c.tool_use_id)).toEqual(["a", "b"]);
    await o.kapat();
  });

  it("model REDDEDERSE döngü temiz duruyor", async () => {
    const m = sahteModel([{ stop_reason: "refusal", stop_details: { category: "cyber" }, content: [] }]);
    const o = await oturumAc({ anthropic: m });
    const r = await tur(o, "kötü bir şey");
    expect(r.durum).toBe("red");
    expect(r.ayrinti).toBe("cyber");
    await o.kapat();
  });

  it("araç HATASI döngüyü düşürmüyor — modele gidiyor", async () => {
    const m = sahteModel([
      aracCagrisi("t1", "create_plan", { name: "H", key: "h" }),
      aracCagrisi("t2", "add_block", { kind: "fan", label: "X", level: "L", x: 0, y: 0, rows: 5 }),
      metin("r0 eksikmiş, düzelttim."),
    ]);
    const o = await oturumAc({ anthropic: m });
    const r = await tur(o, "yelpaze ekle");
    expect(r.durum).toBe("bitti");
    const son = m.istekler[m.istekler.length - 1];
    expect(JSON.stringify(son.messages)).toMatch(/is_error/);
    expect(JSON.stringify(son.messages)).toMatch(/r0/);
    await o.kapat();
  });
});
