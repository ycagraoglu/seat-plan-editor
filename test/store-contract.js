import { describe, it, expect, beforeEach } from "vitest";

/* ══════════════════════════════════════════════════════════════════════════
   DEPOLAMA SÖZLEŞMESİ — paylaşılan test paketi

   Tek bir sürücüyü değil SÖZLEŞMEYİ sınar. sozlesme() herhangi bir Store
   uygulamasını alır; bugün üç uygulamaya birden koşuyor:

     test/unit/store.test.js         bellek sürücüsü · sahte API sürücüsü
     test/integration/store-api...   GERÇEK sunucu + SQLite

   Üçüncüsü belirleyici: "sürücü değiştirilebilir" cümlesi ancak gerçek bir
   HTTP+veritabanı uygulaması aynı paketi geçerse ölçülmüş bir olgu olur.
   Kendi fetch sürücünüzü yazınca paketi ona doğrultun.
   ══════════════════════════════════════════════════════════════════════════ */

export function sozlesme(ad, kur) {
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

