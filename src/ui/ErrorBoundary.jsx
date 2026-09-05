import React from "react";

/* ══════════════════════════════════════════════════════════════════════════
   ÇÖKME KALKANI

   React'te bir render istisnası ağacın TAMAMINI söker: kullanıcı beyaz ekran
   görür, ne olduğunu bilmez, kaydedilmemiş işini kaybettiğini sanır.
   Gerçekte otomatik kayıt (1 sn gecikmeli) planı zaten localStorage'a
   yazmıştır — bu ekranın tek işi bunu SÖYLEMEK ve iki çıkış sunmak.

   İkinci düğme asıl kritik olan: planın kendisi çökmeye yol açıyorsa
   (bozuk göç, elle düzenlenmiş kayıt) her yeniden yükleme aynı beyaz ekranı
   verir — kullanıcı kilitlenir. "Kayıtları indir" o döngüden veriyi kurtarır,
   çünkü depolamayı okumak için React ağacına ihtiyaç yok.
   ══════════════════════════════════════════════════════════════════════════ */

export default class ErrorBoundary extends React.Component {
  state = { err: null };

  static getDerivedStateFromError(err) { return { err }; }

  componentDidCatch(err, info) {
    /* Konsol, hatayı bildirecek kullanıcının elindeki tek iz. */
    console.error("Editör çöktü:", err, info?.componentStack);
  }

  /* Depolamadaki tüm planları tek dosyaya döker. Store'a değil doğrudan
     localStorage'a bakıyor: Store PlanEditor modülünün içinde ve o modül
     çökmüş olabilir. */
  dumpPlans = () => {
    const out = {};
    try {
      for (let i = 0; i < localStorage.length; i++) {
        const k = localStorage.key(i);
        if (k?.startsWith("plan:")) out[k.slice(5)] = JSON.parse(localStorage.getItem(k));
      }
    } catch { /* okunamıyorsa elde ne varsa o iner */ }
    const url = URL.createObjectURL(
      new Blob([JSON.stringify(out, null, 2)], { type: "application/json" }));
    const a = document.createElement("a");
    a.href = url;
    a.download = `planlar-${new Date().toISOString().slice(0, 10)}.json`;
    a.click();
    URL.revokeObjectURL(url);
  };

  render() {
    if (!this.state.err) return this.props.children;
    return (
      <div className="crash">
        <h1>Editör beklenmedik bir hatayla durdu</h1>
        <p>
          Son otomatik kayıt duruyor — yeniden yüklediğinizde kaldığınız yerden
          devam edersiniz. Aynı hata tekrarlıyorsa planı indirip bize iletin.
        </p>
        <pre>{String(this.state.err?.message || this.state.err)}</pre>
        <div className="crash-actions">
          <button className="pri" onClick={() => location.reload()}>Yeniden yükle</button>
          <button onClick={this.dumpPlans}>Kayıtları indir</button>
        </div>
      </div>
    );
  }
}
