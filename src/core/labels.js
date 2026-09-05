/* cm ve derece için 4 ondalık yeter (0.0001° ~ birkaç mikron yay) — trig
   sonuçlarını (bowl/tier'daki aisle→açı çevrimi, radyal dizi) ekranda ve
   dışa aktarımda 15 haneli gürültüye dönüşmeden önce burada temizle. */
const R4 = (n) => Math.round(n * 10000) / 10000;

/* ─────────────────────────  NUMARALANDIRMA  ───────────────────────── */

/* numberRow/rowLabel'ın "num" parametresi için varsayılan şema. Salon
   üreteçleri (src/venues/builders.js) ve tuvale yeni blok ekleyen araçlar
   (src/PlanEditor.jsx) bunu `{ ...DEF_NUM, ... }` ile genişletir — A3
   öncesi PlanEditor.jsx içinde tanımlıydı, iki taraf da kullandığı için
   bu numaralandırma modülüne taşındı (venues/ core/'a bağımlı olmalı,
   tersi değil). */
export const DEF_NUM = {
  rowScheme: "number", rowStart: 1, rowRev: false, rowCustom: "", skipAmbig: true,
  seatScheme: "seq", seatDir: "ltr", seatStart: 1, skip: "", anchor: "order",
};

export const AZ = "ABCDEFGHIJKLMNOPQRSTUVWXYZ";
export const AMBIG = new Set(["I", "O", "Q"]);
export function letterLabel(i, skipAmbig) {
  const alpha = skipAmbig ? [...AZ].filter((c) => !AMBIG.has(c)) : [...AZ];
  let s = "", n = i;
  do { s = alpha[n % alpha.length] + s; n = Math.floor(n / alpha.length) - 1; } while (n >= 0);
  return s;
}
export function rowLabel(num, i, total) {
  const idx = num.rowRev ? total - 1 - i : i;
  if (num.rowScheme === "custom") {
    const list = num.rowCustom.split(",").map((s) => s.trim()).filter(Boolean);
    return list[idx] ?? String(idx + 1);
  }
  if (num.rowScheme === "letter") return letterLabel(idx + (num.rowStart - 1), num.skipAmbig);
  return String(idx + num.rowStart);
}
export const parseSkip = (s) =>
  new Set(String(s).split(",").map((x) => parseInt(x.trim(), 10)).filter((n) => !isNaN(n)));

export function numberRow(flags, num, maxN) {
  const skip = parseSkip(num.skip);
  const out = {};
  const live = flags.map((f, i) => ({ ...f, i })).filter((f) => !f.rm);
  const step = num.seatScheme === "seq" ? 1 : 2;
  if (num.anchor === "column" && num.seatScheme !== "center") {
    live.forEach((f) => {
      if (f.gap) return;
      const k = num.seatDir === "rtl" ? maxN - 1 - f.ci : f.ci;
      out[f.i] = num.seatStart + step * k;
    });
    return out;
  }
  /* Sıranın ortadan tek/çift bölündüğü iki AYRI gelenek var; ikisi de
     gerçek salonlarda kullanılıyor ve karıştırılırsa biletin koltuğu
     yanlış yeri gösterir:

       center     1 ve 2 MERKEZDE, numaralar duvarlara doğru büyür
                  →  18 16 14 … 2 | 3 5 … 17
       center-in  1 ve 2 DUVARLARDA, numaralar merkeze doğru büyür
                  →  2 4 6 … 18 | 15 13 … 1
                  (Ege Ü. AKM Tiyatro Salonu'nun resmî planı böyle) */
  if (num.seatScheme === "center" || num.seatScheme === "center-in") {
    const mid = (live.length - 1) / 2;
    let odd = num.seatStart, even = num.seatStart + 1;
    const put = (f, v) => { if (!f.gap) out[f.i] = v; };
    if (num.seatScheme === "center") {
      for (let k = Math.ceil(mid); k < live.length; k++) { while (skip.has(odd)) odd += 2; put(live[k], odd); odd += 2; }
      for (let k = Math.floor(mid); k >= 0; k--) { while (skip.has(even)) even += 2; put(live[k], even); even += 2; }
    } else {
      /* Duvardan içeri: sol uçtan merkeze çift, sağ uçtan merkeze tek. */
      for (let k = 0; k <= Math.floor(mid); k++) { while (skip.has(even)) even += 2; put(live[k], even); even += 2; }
      for (let k = live.length - 1; k > Math.floor(mid); k--) { while (skip.has(odd)) odd += 2; put(live[k], odd); odd += 2; }
    }
    return out;
  }
  let v = num.seatScheme === "even" ? Math.max(2, num.seatStart) : num.seatStart;
  const order = num.seatDir === "rtl" ? [...live].reverse() : live;
  for (const f of order) {
    while (skip.has(v)) v += step;
    if (!f.gap) out[f.i] = v;
    v += step;
  }
  return out;
}

/** A→B, Z→AA, AA→AB. Salonlar bloklarını harfle adlandırır;
 *  dizi işlemi "A-2" değil "B" üretmeli. */
export function bumpAlpha(s, n) {
  const up = s.toUpperCase();
  let v = 0;
  for (const c of up) v = v * 26 + (c.charCodeAt(0) - 64);
  v += n;
  let out = "";
  while (v > 0) { const r = (v - 1) % 26; out = String.fromCharCode(65 + r) + out; v = Math.floor((v - 1) / 26); }
  return s === up ? out : out.toLowerCase();
}

export function incLabel(label, n) {
  const s = String(label ?? "");
  if (/^\d+$/.test(s)) return String(parseInt(s, 10) + n);
  const m = s.match(/^(.*?)(\d+)$/);
  if (m) return m[1] + String(parseInt(m[2], 10) + n);
  if (/^[A-Za-z]{1,3}$/.test(s)) return bumpAlpha(s, n);
  return `${s}-${n + 1}`;
}

/** incLabel(label, n)'den başlar; sonuç `used` kümesinde ZATEN varsa (planda
 *  başka bir blok o ön eki taşıyorsa) boş bir tane bulana dek birer birer
 *  artırmaya devam eder. Çoğaltma/dizi/aynalama planda o an KULLANILMAYAN
 *  bir kimlik ön eki üretsin diye — Salon şablonunda D'yi çoğaltınca zaten
 *  var olan E/F'yi bir daha üretmemesi gerekiyordu (bkz. görev raporu). */
export function freeLabel(label, n, used) {
  let l = incLabel(label, n);
  while (used.has(l)) l = incLabel(l, 1);
  return l;
}

/** reLabel'den farkı: bu YENİ blok üretmiyor, VAR OLAN bir bloğun
 *  "Kimlik ön eki" alanı elle değiştirildiğinde çağrılır. name'i sadece
 *  hâlâ otomatik türetilmiş haldeyse (kullanıcı özelleştirmediyse) takip
 *  ettirir — aksi halde elle girilmiş özel adı ezip kaybetmiş oluruz. */
export function relabelPatch(b, label) {
  const autoName = b.level ? `${b.level} · ${b.label}` : b.label;
  const patch = { label };
  if (!b.name || b.name === autoName) patch.name = b.level ? `${b.level} · ${label}` : label;
  return patch;
}

/** relabelPatch'in KAT alanı için simetriği: "Kat / kuşak" elle
 *  değiştirildiğinde çağrılır, aynı korumayla — ad hâlâ otomatik
 *  türetilmişse (b.name === eski autoName) yeni kata göre günceller,
 *  kullanıcı özelleştirdiyse dokunmaz. */
export function relevelPatch(b, level) {
  const autoName = b.level ? `${b.level} · ${b.label}` : b.label;
  const patch = { level };
  if (!b.name || b.name === autoName) patch.name = level ? `${level} · ${b.label}` : b.label;
  return patch;
}

/** reLabel YENİ blok üretir (çoğaltma/dizi/aynalama): id/x/y/rot yenilenir,
 *  ama adlandırma kuralı relabelPatch'le AYNI olmalı — kaynak bloğun adı
 *  hâlâ otomatik türetilmişse yeni etikete göre güncellenir, kullanıcı
 *  özelleştirmişse (ör. "VIP Loca") kopya da onu miras alır, ezilmez. */
export const reLabel = (b, l) => {
  const nb = { ...b, ...relabelPatch(b, l) };
  for (const k of ["x", "y", "rot", "aStart", "aEnd", "aCenter"])
    if (typeof nb[k] === "number") nb[k] = R4(nb[k]);
  return nb;
};
