/* ══════════════════════════════════════════════════════════════════════════
   API SÜRÜCÜSÜ — depolama sözleşmesinin fetch karşılığı

   index.js'teki sözleşmenin aynısı, tarayıcı depolaması yerine sunucu.
   Editörün geri kalanı farkı görmez; değişen tek şey bu dosya.

   Sözleşmenin "throw etmez" maddesi burada ASIL önemli: ağ her zaman
   kopar. Kopunca editör çökmemeli — load null, save false döner, arayüz
   "kaydedilemedi" gösterir ve kullanıcı işini kaybetmediğini bilir.

   Tenant/oturum burada YOK: çerez ya da başlık, fetch katmanının işi.
   ══════════════════════════════════════════════════════════════════════════ */

export function apiStore(base = "/api", tenant = null) {
  const u = (p) => `${base}${p}`;
  /* Kiracı başlığı: canlıda editör login'in arkasında bir sayfa ve her
     istek kimin adına geldiğini taşımalı. Burada AUTH yok — ana uygulama
     kendi oturum katmanından dolduracak; verilmezse sunucu eski
     davranışını sürdürüyor. */
  const basliklar = tenant ? { "x-tenant-id": tenant } : {};
  const gonder = async (yol, opt) => {
    const r = await fetch(u(yol), { ...opt, headers: { ...basliklar, ...(opt?.headers || {}) } });
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

    /* Aynı sınıf ikinci yetenek: CANLI GÖRÜNÜM. MCP çizerken editörün
       izlemesi. localStorage'da karşılığı yok — iki ayrı süreç ancak
       sunucu üzerinden buluşabilir, o yüzden sözleşmede değil burada.

       liveGet saniyede bir çağrılıyor ve ağ her zaman kopar: sözleşmenin
       "throw etme" kuralına burada da uyuyor (null döner, editör canlı
       görünümü kapatır). Bir GÖRÜNTÜLEME özelliği yüzünden editör
       çökmemeli. liveStop ise KES: operatörün açık niyeti, sessizce
       yutulursa kilit açık kalır — o yüzden başarısızlığı söylüyor. */
    async liveGet() {
      try { return await gonder("/live"); } catch { return null; }
    },
    /* Panel içi sohbet — aynı sınıf yetenek. Anahtar sunucuda durur,
       tarayıcı yalnız "açık mı" öğrenir. */
    async sohbetDurum() {
      try { return await gonder("/chat/durum"); } catch { return { acik: false }; }
    },
    async sohbetGonder(id, mesaj) {
      try {
        return await gonder("/chat", { method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ id, mesaj }) });
      } catch { return null; }
    },
    async sohbetOku(id) {
      try { return await gonder(`/chat?id=${encodeURIComponent(id)}`); } catch { return null; }
    },

    async liveStop() {
      try { await gonder("/live", { method: "DELETE" }); return true; }
      catch { return false; }
    },
  };
}
