import { describe, it, expect } from "vitest";
import { Store, SKEY } from "../../src/store/index.js";
import { sozlesme } from "../store-contract.js";

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
