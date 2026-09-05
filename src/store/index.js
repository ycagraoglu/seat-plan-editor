/* ══════════════════════════════════════════════════════════════════════════
   DEPOLAMA KATMANI — editörün TEK dış dünya dikişi

   Editörün geri kalanı depolamayı bilmez: çekirdek (src/core/**) saf,
   arayüz yalnız bu beş fonksiyonu çağırır. Kendi backend'inize bağlarken
   DEĞİŞTİRECEĞİNİZ TEK DOSYA burasıdır.

   SÖZLEŞME (test/unit/store.test.js bunu makineyle sınar):

     list()          → Promise<string[]>   kayıtlı plan anahtarları
     load(key)       → Promise<plan|null>  yoksa null, HATA FIRLATMAZ
     save(key, plan) → Promise<boolean>    başarı; false ise arayüz
                                           "kaydedilemedi" gösterir
     remove(key)     → Promise<void>       yoksa da sessizce geçer
     pref(k[, v])    → Promise<string|null> v verilmezse okur, verilirse yazar

   Kurallar sözleşmenin parçası:
   · Hiçbiri throw etmez. Depolama erişilemezse (gizli sekme, kota dolu,
     ağ yok) null/false döner — editör çökmez, kullanıcı durumu görür.
   · save/load simetrik: save(k,p) sonrası load(k) p'yi verir.
   · Anahtar uzayı ayrık: planlar "plan:", tercihler "pref:" önekli.
   · Altlık görseli kaydedilmez — base64 görsel plan verisini şişirir ve
     kaynağı zaten mekândan gelen bir dosyadır.

   API'ye bağlama (referans ekibin yapacağı iş):

     export export const LocalStore = {
       async list()        { return (await fetch("/api/plans")).json(); },
       async load(key)     { const r = await fetch(`/api/plans/${key}`);
                             return r.ok ? r.json() : null; },
       async save(key, p)  { return (await fetch(`/api/plans/${key}`,
                             { method: "PUT", body: JSON.stringify(p) })).ok; },
       async remove(key)   { await fetch(`/api/plans/${key}`, { method: "DELETE" }); },
       async pref(k, v)    { ... },
     };

   Tenant/kimlik burada YOK ve olmamalı: oturum bilgisi fetch katmanının
   (çerez, başlık) işi, editörün değil.
   ══════════════════════════════════════════════════════════════════════════ */

import { apiStore } from "./api.js";

export const SKEY = (k) => `plan:${k}`;

/* window.storage yoksa (ör. Vercel/Netlify/S3 gibi düz statik barındırma —
   bkz. README) localStorage gerçek tarayıcıda kalıcılığı sağlıyor; o da
   yoksa (gizli sekme, kota dolu) bellek-içi Map son çare. */
const hasLS = (() => {
  try { const k = "__ls_probe"; localStorage.setItem(k, "1"); localStorage.removeItem(k); return true; }
  catch { return false; }
})();

export const LocalStore = {
  driver: (typeof window !== "undefined" && window.storage) ? "kv" : hasLS ? "ls" : "memory",
  mem: new Map(),

  async list() {
    if (this.driver === "kv") {
      try { const r = await window.storage.list("plan:", false);
        return (r?.keys || []).map((k) => String(k).slice(5)).filter(Boolean); }
      catch { return []; }
    }
    if (this.driver === "ls") {
      const out = [];
      for (let i = 0; i < localStorage.length; i++) {
        const k = localStorage.key(i);
        if (k?.startsWith("plan:")) out.push(k.slice(5));
      }
      return out;
    }
    /* Üç sürücü de AYNI anahtar uzayını kullanır: planlar "plan:",
       tercihler "pref:". Bellek sürücüsü eskiden planları çıplak anahtarla
       yazıp list()'te Map'in tamamını döküyordu — tercihler plan sanılıyordu
       (bkz. test/unit/store.test.js "anahtar uzayları ayrık"). */
    return [...this.mem.keys()].filter((k) => k.startsWith("plan:")).map((k) => k.slice(5));
  },
  async load(k) {
    if (this.driver === "kv") {
      try { const r = await window.storage.get(SKEY(k), false); return r ? JSON.parse(r.value) : null; }
      catch { return null; }
    }
    if (this.driver === "ls") {
      try { const v = localStorage.getItem(SKEY(k)); return v ? JSON.parse(v) : null; } catch { return null; }
    }
    return this.mem.get(SKEY(k)) || null;
  },
  async save(k, p) {
    const body = JSON.stringify({ ...p, underlay: null });
    if (this.driver === "kv") {
      try { await window.storage.set(SKEY(k), body, false); return true; } catch { return false; }
    }
    if (this.driver === "ls") {
      try { localStorage.setItem(SKEY(k), body); return true; } catch { return false; }
    }
    this.mem.set(SKEY(k), JSON.parse(body));
    return true;
  },
  async remove(k) {
    if (this.driver === "kv") { try { await window.storage.delete(SKEY(k), false); } catch { /* yok */ } }
    else if (this.driver === "ls") { try { localStorage.removeItem(SKEY(k)); } catch { /* yok */ } }
    else this.mem.delete(SKEY(k));
  },

  /** Küçük kullanıcı tercihleri (tema gibi). Değer verilmezse okur. */
  async pref(k, v) {
    const key = `pref:${k}`;
    if (this.driver === "kv") {
      try {
        if (v === undefined) { const r = await window.storage.get(key, false); return r ? r.value : null; }
        await window.storage.set(key, v, false); return v;
      } catch { return null; }
    }
    if (this.driver === "ls") {
      try {
        if (v === undefined) return localStorage.getItem(key);
        localStorage.setItem(key, v); return v;
      } catch { return null; }
    }
    if (v === undefined) return this.mem.get(key) ?? null;
    this.mem.set(key, v); return v;
  },
};

/* Sunucu yapılandırılmışsa (VITE_API_BASE) API sürücüsü kazanır — editör
   farkı görmez, ikisi de aynı sözleşmeyi karşılıyor (test/store-contract.js).
   Yapılandırılmamışsa tarayıcı depolaması: bu depo bir referans proje,
   sunucusuz da açılıp çalışması gerekiyor. */
const API_BASE = (typeof import.meta !== "undefined" && import.meta.env?.VITE_API_BASE) || null;

export const Store = API_BASE ? apiStore(API_BASE) : LocalStore;
