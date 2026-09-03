/* ═══════════════════════════════════════════════════════════════════════
   INVARIANT: tutamacın DURUŞ NOKTASI (handlesFor) ile onu okuyan SÜRÜKLEME
   FORMÜLÜ (handlePatch) birbirinin TAM TERSİ olmalı — bir tutamacı tıklayıp
   HİÇ sürüklemeden bırakmak NO-OP kalmalı: kendi duruş noktasından
   handlePatch'e geri verilince bloğun GÜNCEL alanını üretmeli.

   Bu dosyanın İLK sürümü (A6.2) beklenen değeri handlePatch'in AYNI
   hassasiyetiyle (derece / 10cm) yuvarlayıp öyle karşılaştırıyordu — kör
   bir nokta: sıçramanın büyüklüğünü değil, sıçramanın ETRAFINI ölçüyordu.
   Bir salon denetiminde (bkz. görev raporu) bu, 1157 tutamacın 272'sinin
   hâlâ değer kaydırdığını gizliyordu.

   O 272'nin İKİ AYRI kökeni var, ve ikisi AYNI şekilde ele alınmaz:

   1) cols (121 tutamaç, 17 kırık, en çok 18 koltuk) — SEMANTİK hata.
      counts/taper bir sırayı b.cols'tan FARKLI bir genişliğe taşıdığında
      "cols" tutamacı m.P.maxN'e göre duruyor, handlePatch b.cols'u
      yazıyor — ikisi ayrı BÜYÜKLÜK (bkz. ZORLU, counts="19..28" iken
      cols=10 kalıyor). Tutamaç orada ne gösterdiğini yazmıyor; yuvarlamayı
      gevşeterek düzelmez. Çözüm: handlesFor bunu ASLA sunmaz (bkz.
      GATED_HANDLES, src/PlanEditor.jsx) — bu alanlar TAM eşitlikte
      (1e-9) test edilir, çünkü formülleri inşaen kesin, EN UFAK bir sapma
      bile bir hata demektir.

   2) rot/r0/aStart/aEnd (255 tutamaç) — SEMANTİK olarak doğru, sadece
      KUANTALI. Kendi formüllerinde bilerek bir hassasiyete (derece /
      10cm) yuvarlıyorlar — gerçek bir sürüklemede kullanıcı temiz sayı
      ister. Alan zaten çözücünün ürettiği İNCE bir değerdeyse (SÜREYYA
      rot=84,9622, AKM r0=825) round-trip hiçbir zaman TAM olamaz, ama bu
      bir hata DEĞİL — bilgi kaybı yok, sadece kabalık. Bu tutamaçları
      gizlemek (ilk turda yaptığımız hata) aStart/aEnd'in %87'sini
      (çözücü-üretimi yelpazelerin neredeyse tamamı, bkz. SÜREYYA/HARBIYE/
      GS/ULKER) editörden silmek demekti — önlediği kusurdan çok daha
      pahalı bir çözüm. Asıl kusur (tıklayınca değer kayması) handlesFor
      SEVİYESİNDE değil, onMove'daki EKRAN-pikseli sürükleme eşiğiyle
      (HANDLE_DRAG_PX) çözülüyor — 3px hareket etmeden patch hiç
      uygulanmıyor. Bu alanlar burada TEK KUANTUM toleransıyla test edilir
      (rot/aStart/aEnd ≤ 1°, r0 ≤ 10cm): kural "SİSTEMATİK kayma
      olmayacak" — beklenen kabalığı (round() en fazla yarım kuantum
      kaydırır) geçer ama eski r0 kusuru gibi (60cm = 6 kuantum) çok
      kademeli bir formül hatasını YİNE yakalar.

   Neden ikisi ayrı muamele görüyor, kısaca: cols'un formülü "ne olması
   gerektiğini" tam biliyor (bir sıradaki koltuk sayısı tam sayıdır,
   yuvarlama YOK) — sapma varsa formül YANLIŞ. rot/r0/aStart/aEnd'in
   formülü KASITLI bir hassasiyet sınırına yuvarlıyor — sapma varsa (bir
   kuantuma kadar) bu TASARIM, aşarsa (bkz. testin testi) formül YANLIŞ.
   Altı ay sonra "niye gevşetilmiş?" diye sorulursa cevap bu.

   Bu dosya artık BEKLENEN değeri handlePatch'in yaptığı gibi yuvarlamıyor:
   handlesFor(b, buildMeta(b))'nin DÖNDÜRDÜĞÜ her tutamacı (foot: hariç)
   kendi konumundan handlePatch'e geri verip alana göre TAM (1e-9) ya da
   TEK-KUANTUM toleransıyla b[alan]'a yakın olduğunu arıyor.

   foot (elle çizilmiş taban köşesi) tutamacı bilerek DIŞARIDA: hiçbir
   örnek salon `foot` kullanmıyor (grep ile doğrulandı) ve formülü zaten
   saf bir döndürme tersi — kayma sınıfının örneği değil.
   ═══════════════════════════════════════════════════════════════════════ */
import { describe, it, expect } from "vitest";
import { buildMeta, RAD } from "../../src/core/geometry.js";
import { DEF_NUM } from "../../src/core/labels.js";
import { handlesFor, handlePatch } from "../../src/PlanEditor.jsx";
import { VENUES } from "./helpers.js";

/* EXACT: formül inşaen kesin (yuvarlama yok) — en ufak sapma hata.
   QUANTUM: formül bilerek bir ızgaraya yuvarlıyor — tolerans TAM OLARAK
   o ızgaranın adımı (yarısı değil): round() en fazla yarım adım kaydırır,
   burada tam adımı sınır koymak hem o beklenen kabalığı geçirir hem de
   "niye tam yarısı değil de biraz gevşek" tartışmasını gereksiz kılar —
   önemli olan sınırın ÇOK kademeli bir formül hatasını (eski r0 kusuru
   60cm = 6 kuantumdu) hâlâ kırmızıya çevirmesi. */
const QUANTUM = { rot: 1, aStart: 1, aEnd: 1, r0: 10 };

describe("invariant: tutamaç duruş noktası kendi formülünde no-op kalıyor", () => {
  it.each(VENUES)("%s", (key, venue) => {
    venue.blocks.forEach((b) => {
      const m = buildMeta(b);
      handlesFor(b, m).forEach((h) => {
        if (h.k.startsWith("foot:")) return; // bkz. dosya başı notu
        const startAng = Math.atan2(h.y - b.y, h.x - b.x) / RAD;
        const patch = handlePatch(b, h.k, { x: h.x, y: h.y }, startAng);
        Object.keys(patch).forEach((f) => {
          const diff = Math.abs(patch[f] - b[f]);
          const msg = `${key}/${b.id} (${b.kind}) → "${h.k}" tutamacı, "${f}" alanı: b.${f}=${b[f]} patch.${f}=${patch[f]}`;
          const tol = QUANTUM[h.k];
          if (tol == null) expect(diff, msg).toBeLessThan(1e-9);
          else expect(diff, msg).toBeLessThanOrEqual(tol);
        });
      });
    });
  });

  /* testin testi: A6.2'nin bu turda bulunan davranışları BİREBİR yeniden
     üretip sertleştirilmiş testin/handlesFor'un onları GERÇEKTEN
     ayırt ettiğini kanıtlıyor — "her zaman yeşil kalan bir test" ihtimaline
     karşı (bkz. seat-within-block.test.js / footprint-overlap.test.js'teki
     aynı isimli desen). */
  const base = { id: "b-test", label: "X", name: "X", level: "", rot: 0, x: 0, y: 0,
    seatGap: 50, rowGap: 85, counts: "", align: "center", color: "#000", attr: "",
    num: { ...DEF_NUM }, ov: {} };

  it("testin testi: counts b.cols'tan ayrışınca cols tutamacı sunulmamalı (GATED_HANDLES)", () => {
    const grid = { ...base, kind: "grid", cols: 10, rows: 3, taper: 0, curve: 0, counts: "19..28" };
    const m = buildMeta(grid);
    /* önkoşul: senaryo GERÇEKTEN ayrışıyor mu (yoksa aşağıki "not.toContain"
       hiçbir şey kanıtlamadan yeşil kalır) */
    expect(m.P.maxN, "senaryo kurulumu: maxN b.cols'tan ayrışmalı").not.toBe(grid.cols);
    const keys = handlesFor(grid, m).map((h) => h.k);
    expect(keys, "counts aktifken cols tutamacı yalan söyler, sunulmamalı").not.toContain("cols");
    /* aşırı-gizleme regresyonu: counts YALNIZCA cols'u etkiler, aynı bloğun
       diğer tutamaçları (round-trip yapabildikleri sürece) hâlâ sunulmalı */
    expect(keys).toEqual(expect.arrayContaining(["rot", "curve", "rows"]));
  });

  it("testin testi: yuvarlama hassasiyetinde olmayan rot/r0/aStart/aEnd YİNE DE sunulur", () => {
    /* İkinci turda yapılan hata BUYDU: bu alanları da GATED_HANDLES'a
       sokmuştuk. Koordinatör düzeltti — burada kalıcı olarak kilitleniyor:
       "kirli" (çözücü-üretimi, ızgarada olmayan) bir değer bu tutamaçları
       GİZLEMEMELİ, sadece kuantum toleransıyla ölçülmeli. */
    const fan = { ...base, kind: "fan", mode: "span", rot: 84.9622, r0: 825, rows: 5,
      aStart: -14.6352, aEnd: 14.6352, aCenter: 0 };
    const m = buildMeta(fan);
    const keys = handlesFor(fan, m).map((h) => h.k);
    expect(keys, "kirli değerler tutamacı gizlememeli").toEqual(
      expect.arrayContaining(["rot", "r0", "rows", "aStart", "aEnd"]));
    /* ve gerçekten kuantum toleransı içinde kalıyorlar — tam eşit DEĞİL
       (bu senaryonun bütün amacı bu), ama 1 kuantumu aşmıyor. */
    ["rot", "aStart", "aEnd"].forEach((k) => {
      const h = handlesFor(fan, m).find((x) => x.k === k);
      const startAng = k === "rot" ? Math.atan2(h.y - fan.y, h.x - fan.x) / RAD : undefined;
      const diff = Math.abs(handlePatch(fan, k, h, startAng)[k] - fan[k]);
      expect(diff).toBeGreaterThan(1e-9); // gerçekten kuantalı, sahte-yeşil değil
      expect(diff).toBeLessThanOrEqual(1);
    });
  });

  it("testin testi: sistematik bir formül kayması (eski r0 kusuru sınıfı) kuantum toleransını da aşar", () => {
    /* Eski r0 kusuru: duruş noktasındaki -0,75·rowGap payı formülde geri
       eklenmiyordu, sonuç 60cm (6 kuantum) sabit kayardı. Burada AYNI
       sınıftaki bir kaymayı elle üretip QUANTUM.r0'ın (10cm) bunu
       YAKALADIĞINI kanıtlıyoruz — tolerans gevşetilse bile bu kırmızı
       kalmalı, yoksa tolerans fazla geniş demektir. */
    const fan = { ...base, kind: "fan", mode: "span", rot: 0, r0: 2000, rows: 13,
      aStart: -40, aEnd: 40, aCenter: 0 };
    const m = buildMeta(fan);
    const hR0 = handlesFor(fan, m).find((h) => h.k === "r0");
    const buggyR0 = Math.max(50, Math.round(Math.hypot(hR0.x - fan.x, hR0.y - fan.y) / 10) * 10); // -0,75·rowGap payı YOK
    const diff = Math.abs(buggyR0 - fan.r0);
    /* -0,75·rowGap = 63,75cm'lik payın hiç geri eklenmemesi ~60cm'e
       (en yakın 10'a yuvarlanınca) kayar — tam sayısı önemli değil,
       QUANTUM.r0'ın (10cm) KESİNLİKLE altında kalmaması önemli. */
    expect(diff, "eski kusur simülasyonu birkaç kuantumluk bir kayma üretmeliydi").toBeGreaterThan(50);
    expect(diff, "QUANTUM.r0 (10cm) bu kaymayı yakalamalı").toBeGreaterThan(QUANTUM.r0);
  });

  /* eski grid cols/rows +1 ve fan rows +1 kusurları (bkz. handlesFor'daki
     stance sabitleri 0.8/0.9/0.75) artık YUKARIDAKİ ana tarama tarafından
     9 salonun GERÇEK verisi üzerinden (TAM eşitlikte, cols/rows EXACT
     grubunda) kapsanıyor — burada ayrıca sentetik olarak tekrar edilmiyor. */
});
