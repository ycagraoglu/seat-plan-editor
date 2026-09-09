/* ══════════════════════════════════════════════════════════════════════════
   API SÜRÜCÜSÜ — depolama sözleşmesinin fetch karşılığı

   index.js'teki sözleşmenin aynısı, tarayıcı depolaması yerine sunucu.
   Editörün geri kalanı farkı görmez; değişen tek şey bu dosya.

   Sözleşmenin "throw etmez" maddesi burada ASIL önemli: ağ her zaman
   kopar. Kopunca editör çökmemeli — load null, save false döner, arayüz
   "kaydedilemedi" gösterir ve kullanıcı işini kaybetmediğini bilir.

   Tenant/oturum burada YOK: çerez ya da başlık, fetch katmanının işi.
   ══════════════════════════════════════════════════════════════════════════ */

export function apiStore(base = "/api", tenant = null, opts = {}) {
  const u = (p) => `${base}${p}`;
  const authOpts = typeof tenant === "object" && tenant ? tenant : opts;
  const tenantId = typeof tenant === "string" ? tenant : authOpts.tenant;
  const tokenAl = authOpts.tokenProvider || authOpts.getToken || (authOpts.token ? () => authOpts.token : null);
  const basliklar = async (extra = {}) => {
    const token = tokenAl ? await tokenAl() : null;
    return {
      ...(tenantId ? { "x-tenant-id": tenantId } : {}),
      ...(token ? { authorization: `Bearer ${token}` } : {}),
      ...(authOpts.headers || {}),
      ...extra,
    };
  };
  const gonder = async (yol, opt) => {
    const r = await fetch(u(yol), { ...opt, headers: await basliklar(opt?.headers || {}) });
    if (!r.ok) throw new Error(`HTTP ${r.status}`);
    return r.status === 204 ? null : r.json();
  };
  const dosyaAdiBasligi = (file) => encodeURIComponent(String(file?.name || "kaynak"));
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
      const r = await fetch(u(`/plans/${encodeURIComponent(key)}/publish`), {
        method: "POST", headers: await basliklar(),
      });
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
    /* Eski sunucu sohbet rotalarının programatik istemci sözleşmesi.
       Editörde panel yok; bunlar yalnız geriye dönük API uyumluluğu. */
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
    async sohbetTemizle(id) {
      try {
        const r = await fetch(u(`/chat?id=${encodeURIComponent(id)}`), { method: "DELETE", headers: await basliklar() });
        return r.status === 204;
      } catch { return false; }
    },
    async sohbetDosya(file) {
      try {
        const r = await fetch(u("/chat/upload"), {
          method: "POST",
          headers: await basliklar({ "content-type": file.type || "application/octet-stream",
            "x-file-name": dosyaAdiBasligi(file) }),
          body: await file.arrayBuffer(),
        });
        return r.ok ? r.json() : null;
      } catch { return null; }
    },
    async importSource(file) {
      try {
        const r = await fetch(u("/imports"), {
          method: "POST",
          headers: await basliklar({ "content-type": file.type || "application/octet-stream",
            "x-file-name": dosyaAdiBasligi(file) }),
          body: await file.arrayBuffer(),
        });
        return r.ok ? r.json() : null;
      } catch { return null; }
    },
    async importStep(id, step, body = {}) {
      try {
        const r = await fetch(u(`/imports/${encodeURIComponent(id)}/${step}`), {
          method: "POST", headers: await basliklar({ "content-type": "application/json" }),
          body: JSON.stringify(body),
        });
        const json = await r.json().catch(() => null);
        if (!r.ok) throw new Error(json?.hata || json?.detay || `HTTP ${r.status}`);
        return json;
      } catch (e) { return { error: e.message }; }
    },
    importScan(id, body) { return this.importStep(id, "scan", body); },
    importAnalyze(id, body) { return this.importStep(id, "analysis", body); },
    importBuild(id) { return this.importStep(id, "build"); },
    importVerify(id) { return this.importStep(id, "verify"); },
    importAccept(id) { return this.importStep(id, "accept"); },
    importCancel(id) { return this.importStep(id, "cancel"); },
    async liveStop() {
      try { await gonder("/live", { method: "DELETE" }); return true; }
      catch { return false; }
    },
  };
}
