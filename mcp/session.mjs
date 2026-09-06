import { buildMeta, buildSeats } from "../src/core/geometry.js";
import { gateMap } from "../src/core/gates.js";
import { buildCtx, runRules } from "../src/core/rules.js";
import { absorbIds } from "../src/core/ids.js";
import { planHome } from "../src/core/plan.js";
import { selectLevels, selectLevelCounts } from "../src/ui/state/selectors.js";
import { EMPTY } from "../src/venues/empty.venue.js";
import { canliYaz } from "./live.mjs";

/* ══════════════════════════════════════════════════════════════════════════
   OTURUM — Blender'ın "sahne"sinin karşılığı

   MCP araçları durumsuz çağrılardır; aradaki planı bir yerin tutması gerek.
   Sunucu süreci boyunca TEK bir aktif plan burada duruyor.

   mutate() bu dosyanın asıl işi: her değişiklikten sonra metas/gates/kural
   raporunu yeniden hesaplayıp KISA BİR ÖZET döndürüyor. Amaç, LLM'in ayrı
   bir validate çağrısı yapmadan da her adımda geri bildirim alması — Blender'da
   olmayan şey tam olarak bu. Orada modelin tek geri bildirimi ekran
   görüntüsü; burada kural motoru ölçüyor ve HEDEF DEĞER veriyor.
   ══════════════════════════════════════════════════════════════════════════ */

const tr = (n) => Number(n).toLocaleString("tr-TR");

export class Session {
  constructor() { this.plan = null; this.kesildi = false; this.yeniCizim = false; }

  /** Aktif plan yoksa aracın anlamı yok — net hata, sessiz boş sonuç değil. */
  need() {
    /* KES: operatör canlı görünümde çizimi devraldı. Sunucu zaten aynı
       anahtara yazmayı 409'luyor (asıl otorite orası — mcp/cli.mjs her
       çağrıda yeni bir Session kurduğu için oturuma bağlı bir bayrak tek
       başına yetmez); bu bayrak yalnız HIZLI ve ANLAŞILIR başarısızlık
       için: LLM bir sonraki çağrıda ne olduğunu ve ne yapması gerektiğini
       okusun diye. */
    if (this.kesildi) {
      throw new Error("Operatör devraldı (KES) — bu çizim durduruldu."
        + " Devam etmek için create_plan ya da open_sample ile YENİ bir çizime başla.");
    }
    if (!this.plan) throw new Error("Aktif plan yok — önce create_plan ya da open_sample çağır.");
    return this.plan;
  }

  /** Planı değiştirir ama YENİ BİR ÇİZİM SAYILMAZ — set_underlay ve
   *  cli.mjs'in oturum geri yüklemesi bunu kullanıyor. Kesik bayrağına
   *  DOKUNMAZ: altlık yüklemek KES'i geri almamalı. */
  set(plan) {
    /* absorbIds: hazır bir salonu taban alırken id sayacını ileri sarar,
       sonradan eklenen bloklar mevcutlarla çakışmasın. */
    this.plan = absorbIds({ ...plan });
    return this.plan;
  }

  /** YENİ ÇİZİM: create_plan / open_sample. Temiz sayfa.
   *
   *  KES bir ÇİZİMİ durduruyor, oturumu değil — operatör devraldıktan
   *  sonra "şunu bırak, yeniden çiz" diyebilmeli. Sunucu iptali anahtara
   *  bağladığı için AYNI adla yeniden çizmek de 409 yiyordu ve bozuk
   *  görünüyordu (kullanırken çıktı); bu yüzden niyet ayrıca bildiriliyor:
   *  bir sonraki yazma "yeni çizim" bayrağını taşıyor ve iptali düşürüyor. */
  yeni(plan) {
    this.kesildi = false;
    this.yeniCizim = true;
    return this.set(plan);
  }

  /** Türetilmiş her şeyi tek yerden: metas · gates · kural raporu. */
  derive(plan = this.need()) {
    const metas = plan.blocks.map((b) => ({ b, m: buildMeta(b) }));
    const gates = gateMap(plan);
    const findings = runRules(buildCtx(plan, metas, gates));
    return { metas, gates, findings };
  }

  /** Planı değiştir, sonra ne olduğunu anlat. Tüm değiştirici araçlar bunu kullanır. */
  mutate(fn, baslik) {
    const plan = this.need();
    const next = fn(plan) || plan;
    this.plan = next;
    /* TEK derive: hem LLM'e dönen özet hem operatörün göreceği adım kaydı
       aynı hesaptan çıkıyor. İki kez türetmek 52.000 koltuklu planda her
       araç çağrısını iki katına çıkarırdı. */
    const d = this.derive(next);
    /* Canlı görünüme yansıt. Beklemiyoruz: SEAT_EDITOR_API yoksa hiç ağa
       çıkmıyor, varsa da sunucu kapalıysa çizim aksamıyor (bkz. live.mjs). */
    canliYaz(next, this.adim(baslik, d), this.yeniCizim, () => { this.kesildi = true; });
    this.yeniCizim = false;                 /* yalnız İLK yazmada bildirilir */
    return this.summaryText(baslik, d);
  }

  /** Operatörün Özellikler panelinde okuyacağı tek satırlık adım kaydı.
   *  LLM'e dönen özetten AYRI ve daha kısa: operatör "ne oldu, kaç koltuk
   *  oldu, bir sorun çıktı mı" bilmek istiyor; kural raporunun tamamını
   *  değil. Alan adları kısa çünkü bu kayıt sunucuda bir metin sütununda
   *  biriktiriliyor. */
  adim(ne, { metas, findings }) {
    const onemli = findings.filter((f) => f.t === "err" || f.t === "warn");
    return {
      t: new Date().toISOString(),
      n: ne || "değişiklik",
      k: metas.reduce((a, x) => a + x.m.seatCount, 0),
      b: metas.length,
      u: onemli.slice(0, 2).map((f) => `${f.t === "err" ? "✕" : "⚠"} ${f.m}${f.d ? ` — ${f.d}` : ""}`),
    };
  }

  /** LLM'in "sahneyi okuma" çıktısı. Kısa tut — her araç çağrısında dönüyor. */
  summaryText(baslik = null, turetilmis = null) {
    const plan = this.need();
    const { metas, gates, findings } = turetilmis || this.derive(plan);
    const koltuk = metas.reduce((a, x) => a + x.m.seatCount, 0);
    const sayac = selectLevelCounts(metas);
    const satir = [];

    if (baslik) satir.push(baslik);
    satir.push(`Plan: ${plan.name} · ${tr(koltuk)} koltuk · ${metas.length} blok`
      + ` · ${(plan.shapes || []).length} şekil`);

    const katlar = selectLevels(plan);
    if (katlar.length) {
      satir.push("Katlar: " + katlar.map((l) => `${l} ${tr(sayac[l] || 0)}`).join(" · "));
    }

    const cokKapili = [...gates.values()].filter((v) => v.length > 1).length;
    if (gates.size) {
      satir.push(`Kapı: ${(plan.shapes || []).filter((s) => s.type === "door").length}`
        + ` · kapısı olan blok ${gates.size}` + (cokKapili ? ` · çok kapılı ${cokKapili}` : ""));
    }

    /* Boş planda kural raporu gürültüdür: "tekerlekli sandalye alanı yok"
       daha hiç koltuk yokken doğru ama işe yaramaz bir uyarıdır ve LLM'i
       olmayan bir sorunun peşine takar. Blok girince rapor açılır. */
    const hata = metas.length ? findings.filter((f) => f.t === "err") : [];
    const uyari = metas.length ? findings.filter((f) => f.t === "warn") : [];
    if (hata.length || uyari.length) {
      satir.push(`\nDOĞRULAMA: ${hata.length} hata · ${uyari.length} uyarı`);
      /* Hedef değeri (f.d) mutlaka göster — LLM'in kendini düzeltmesini
         sağlayan şey "hata var" değil, "en az 90 cm gerekir". */
      [...hata, ...uyari].slice(0, 8).forEach((f) =>
        satir.push(`  [${f.t}] ${f.m}${f.d ? `  — ${f.d}` : ""}`));
      if (hata.length + uyari.length > 8) satir.push(`  … ${hata.length + uyari.length - 8} bulgu daha (validate ile tamamı)`);
    } else if (metas.length) {
      satir.push("\nDOĞRULAMA: temiz");
    }
    return satir.join("\n");
  }

  /** Yapısal özet — validate ve plan_summary araçlarının ham verisi. */
  summaryData() {
    const plan = this.need();
    const { metas, gates, findings } = this.derive(plan);
    return {
      name: plan.name, key: plan.key,
      home: planHome(plan),
      seatCount: metas.reduce((a, x) => a + x.m.seatCount, 0),
      levels: selectLevels(plan).map((l) => ({ level: l, seats: selectLevelCounts(metas)[l] || 0 })),
      blocks: metas.map(({ b, m }) => ({
        id: b.id, label: b.label, name: b.name || "", level: b.level || "", kind: b.kind,
        seats: m.seatCount, rows: m.rows,
        /* Sıra etiketleri: LLM'in numaralandırmayı DOĞRULAYABİLMESİ için.
           "22 sıra var" yetmez — "4'ten 25'e mi, 25'ten 4'e mi" sorusunun
           cevabı burada. Uzun listeler baş/son ile kısaltılıyor. */
        rowLabels: siraEtiketleri(b, m, plan.idTemplate),
        bbox: { x0: +m.bbox.x0.toFixed(0), y0: +m.bbox.y0.toFixed(0),
                x1: +m.bbox.x1.toFixed(0), y1: +m.bbox.y1.toFixed(0) },
        gates: gates.get(b.id) || [],
      })),
      shapes: (plan.shapes || []).map((s) => ({
        id: s.id, type: s.type, label: s.label || "",
        x: +Number(s.x).toFixed(0), y: +Number(s.y).toFixed(0),
        /* ÖLÇÜ de sahnenin parçası: 0×0 bir saha eklendiğinde özet bunu
           göstermediği için soğuk stadyum testindeki model sahanın hiç
           çizilmediğini fark edemedi — kural motoru da şekil ölçüsüne
           bakmıyor. Okunmayan şey doğrulanamıyor. */
        w: +Number(s.w || 0).toFixed(0), h: +Number(s.h || 0).toFixed(0),
        blocks: s.blocks || undefined,
      })),
      findings,
    };
  }
}

/** Bloğun sıra etiketleri; 8'den uzunsa baş 3 · … · son 3. */
function siraEtiketleri(b, m, tpl) {
  const gorulen = [];
  buildSeats(b, m, tpl).seats.forEach((s) => {
    if (!s.gap && !gorulen.includes(s.row)) gorulen.push(s.row);
  });
  return gorulen.length <= 8 ? gorulen
    : [...gorulen.slice(0, 3), `…${gorulen.length - 6} sıra…`, ...gorulen.slice(-3)];
}

/* home BİLEREK verilmiyor. EMPTY'nin çerçevesi 40×30 m'lik bir boş tuval;
   onu taşımak render'ı o pencereye kilitliyordu — LLM stadyum çizse bile
   görüntü küçük kalıyor, çizdiğine bakamıyordu. home yokken planHome()
   çerçeveyi blokların kapladığı alandan TÜRETİYOR (bkz. core/plan.js),
   yani plan büyüdükçe görüntü de büyüyor. */
export const yeniPlan = (key, name) => ({
  ...EMPTY, key, name, home: null, underlay: null, underlayRect: null,
  blocks: [], shapes: [], sections: [], groups: [],
  versions: [], published: null, schemaVersion: 4,
});
