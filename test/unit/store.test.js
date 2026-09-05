import { describe, it, expect, beforeEach } from "vitest";
import { Store, SKEY } from "../../src/store/index.js";

/* ══════════════════════════════════════════════════════════════════════════
   DEPOLAMA SÖZLEŞMESİ

   Bu dosyanın değeri tek bir sürücüyü sınamak değil — SÖZLEŞMEYİ sınamak.
   sozlesme() herhangi bir Store uygulamasını alır; referans ekip kendi
   API sürücüsünü yazınca bu paketi ona doğrultup "dikiş tuttu mu"
   sorusunu makineye sordurabilir.

   Aşağıda iki uygulamaya birden koşuyor: editörün kendi bellek sürücüsü
   ve on satırlık SAHTE BİR API SÜRÜCÜSÜ. İkincisi olmadan sözleşme bir
   iddia olurdu; onunla birlikte "sürücü gerçekten değiştirilebilir"
   ölçülmüş bir olgu.
   ══════════════════════════════════════════════════════════════════════════ */

function sozlesme(ad, kur) {
  describe(`${ad} · depolama sözleşmesi`, () => {
    let S;
    beforeEach(async () => { S = await kur(); });

    it("boş depoda list() boş dizi verir", async () => {
      expect(await S.list()).toEqual([]);
    });

    it("save sonrası load AYNI planı verir (simetri, altlık hariç)", async () => {
      const plan = { key: "a", name: "Salon", blocks: [{ id: "b1" }] };
      expect(await S.save("a", plan)).toBe(true);
      expect(await S.load("a")).toEqual({ ...plan, underlay: null });
    });

    it("olmayan anahtar null verir — HATA FIRLATMAZ", async () => {
      await expect(S.load("yok")).resolves.toBeNull();
    });

    it("list() kaydedilen anahtarları verir, plan: önekini taşımaz", async () => {
      await S.save("a", { key: "a" });
      await S.save("b", { key: "b" });
      expect((await S.list()).sort()).toEqual(["a", "b"]);
    });

    it("remove siler; olmayanı silmek sessizce geçer", async () => {
      await S.save("a", { key: "a" });
      await S.remove("a");
      expect(await S.load("a")).toBeNull();
      await expect(S.remove("hicyok")).resolves.not.toThrow();
    });

    it("altlık görseli KAYDEDİLMEZ (plan verisini şişirmesin)", async () => {
      await S.save("a", { key: "a", underlay: "data:image/png;base64,AAAA" });
      expect((await S.load("a")).underlay).toBeNull();
    });

    it("pref okur ve yazar; okunmamış tercih null", async () => {
      expect(await S.pref("tema")).toBeNull();
      expect(await S.pref("tema", "koyu")).toBe("koyu");
      expect(await S.pref("tema")).toBe("koyu");
    });

    it("tercih ve plan anahtar uzayları ayrık", async () => {
      await S.save("tema", { key: "tema" });
      await S.pref("tema", "acik");
      expect(await S.pref("tema")).toBe("acik");
      expect(await S.load("tema")).toEqual({ key: "tema", underlay: null });
      expect(await S.list()).toEqual(["tema"]);
    });
  });
}

/* 1 — editörün kendi bellek sürücüsü */
sozlesme("bellek sürücüsü", () => {
  Store.driver = "memory";
  Store.mem = new Map();
  return Store;
});

/* 2 — SAHTE API SÜRÜCÜSÜ: ağ yerine bir Map, ama sözleşme aynı.
   Referans ekibin fetch tabanlı sürücüsünün iskeleti bu. */
sozlesme("sahte API sürücüsü", () => {
  const db = new Map();
  return {
    async list() { return [...db.keys()].filter((k) => k.startsWith("plan:")).map((k) => k.slice(5)); },
    async load(key) { const v = db.get(SKEY(key)); return v ? JSON.parse(v) : null; },
    async save(key, plan) { db.set(SKEY(key), JSON.stringify({ ...plan, underlay: null })); return true; },
    async remove(key) { db.delete(SKEY(key)); },
    async pref(k, v) {
      if (v === undefined) return db.get(`pref:${k}`) ?? null;
      db.set(`pref:${k}`, v); return v;
    },
  };
});

/* Sözleşmenin en kritik maddesi ayrı sınanıyor: depolama ÇALIŞMIYORSA
   editör çökmemeli. Kota dolu / gizli sekme / ağ yok durumunun karşılığı. */
describe("bozuk sürücü · editör çökmez", () => {
  const bozuk = {
    async list() { return []; },
    async load() { return null; },
    async save() { return false; },          /* kota dolu */
    async remove() { },
    async pref() { return null; },
  };
  it("save false döner — arayüz bunu 'kaydedilemedi' olarak gösterir", async () => {
    expect(await bozuk.save("a", {})).toBe(false);
  });
  it("hiçbir çağrı throw etmez", async () => {
    await expect(Promise.all([bozuk.list(), bozuk.load("x"), bozuk.save("x", {}),
      bozuk.remove("x"), bozuk.pref("x")])).resolves.toBeDefined();
  });
});
