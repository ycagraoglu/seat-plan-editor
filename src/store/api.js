/* ══════════════════════════════════════════════════════════════════════════
   API SÜRÜCÜSÜ — depolama sözleşmesinin fetch karşılığı

   index.js'teki sözleşmenin aynısı, tarayıcı depolaması yerine sunucu.
   Editörün geri kalanı farkı görmez; değişen tek şey bu dosya.

   Sözleşmenin "throw etmez" maddesi burada ASIL önemli: ağ her zaman
   kopar. Kopunca editör çökmemeli — load null, save false döner, arayüz
   "kaydedilemedi" gösterir ve kullanıcı işini kaybetmediğini bilir.

   Tenant/oturum burada YOK: çerez ya da başlık, fetch katmanının işi.
   ══════════════════════════════════════════════════════════════════════════ */

export function apiStore(base = "/api") {
  const u = (p) => `${base}${p}`;
  const gonder = async (yol, opt) => {
    const r = await fetch(u(yol), opt);
    if (!r.ok) throw new Error(`HTTP ${r.status}`);
    return r.status === 204 ? null : r.json();
  };
  return {
    driver: "api",
    async list() { try { return await gonder("/plans"); } catch { return []; } },
    async load(key) {
      try { return await gonder(`/plans/${encodeURIComponent(key)}`); } catch { return null; }
    },
    async save(key, plan) {
      try {
        await gonder(`/plans/${encodeURIComponent(key)}`, {
          method: "PUT", headers: { "content-type": "application/json" },
          body: JSON.stringify({ ...plan, underlay: null }),
        });
        return true;
      } catch { return false; }
    },
    async remove(key) {
      try { await gonder(`/plans/${encodeURIComponent(key)}`, { method: "DELETE" }); }
      catch { /* yoksa da sessizce geçer — sözleşme */ }
    },
    async pref(k, v) {
      try {
        if (v === undefined) return await gonder(`/prefs/${encodeURIComponent(k)}`);
        await gonder(`/prefs/${encodeURIComponent(k)}`, {
          method: "PUT", headers: { "content-type": "application/json" },
          body: JSON.stringify({ value: v }),
        });
        return v;
      } catch { return null; }
    },

    /* Sözleşmenin ÜSTÜNDE, yalnız API sürücüsünde olan yetenek: taslağı
       kanonik veriye çevirip dondurma (rapor §5.4). localStorage'ın
       böyle bir karşılığı yok — yayımlama sunucunun işi. */
    async publish(key) {
      const r = await fetch(u(`/plans/${encodeURIComponent(key)}/publish`), { method: "POST" });
      const body = await r.json().catch(() => null);
      if (!r.ok) throw new Error(body?.detay || body?.hata || `HTTP ${r.status}`);
      return body;
    },
  };
}
