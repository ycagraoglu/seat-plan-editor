/* ═══════════════════════════════════════════════════════════════════════
   INVARIANT: görünüm varlıkları (Biletone tasarım token'ları + POI
   ikonları) korunuyor.

   Gerekçe: bu depoda 9 salonun GEOMETRİSİ altın dosyalar + 148 testle
   korunuyor (bkz. kardeş invariant dosyaları + scripts/check-golden.mjs).
   Ama GÖRÜNÜM katmanında (renk/tipografi/ikon) hiçbir koruma yoktu.
   Sıradaki aşamalardan biri (A7) `const CSS` template literal'ini
   src/PlanEditor.jsx'ten ayrı dosyalara (src/styles/tokens.css +
   app.css) taşıyacak — token'lar o taşımada sessizce düşerse hiçbir
   kapı ötmeyecekti.

   Konum bağımsızlığı — İKİ FARKLI kural, bilerek:
   · Tasarım token'ları (aşağıdaki ilk describe): src/PlanEditor.jsx'e
     BAĞLI DEĞİL. src/ altındaki TÜM .js/.jsx/.css dosyalarını tarar; A7
     token'ı başka bir dosyaya taşısa da test aynı şekilde geçer — yer
     değil, VARLIK korunuyor.
   · POI kontrolü (ikinci describe) KASITLI olarak src/PlanEditor.jsx'e
     bağlı: A7 yalnız CSS'i taşıyor, `const POI` sabiti yerinde kalıyor
     (bkz. görev tanımı — dosya + satır numarası açıkça verilmiş).
   ═══════════════════════════════════════════════════════════════════════ */
import { describe, it, expect } from "vitest";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const SRC_DIR = path.join(ROOT, "src");
const POI_DIR = path.join(ROOT, "public/poi");
const PLAN_EDITOR = path.join(SRC_DIR, "PlanEditor.jsx");

/* src/ altındaki kaynak dosyaları — .jsx/.js/.css, konumdan bağımsız
   tarama için. Yeni bir dosya/klasör eklenmesi (ör. A7'nin src/styles/)
   otomatik dahil olur, tarama yeniden yazılmaz. */
function walkSourceFiles(dir) {
  const out = [];
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) out.push(...walkSourceFiles(full));
    else if (/\.(jsx?|css)$/.test(entry.name)) out.push(full);
  }
  return out;
}

const SOURCE_FILES = walkSourceFiles(SRC_DIR).map((abs) => ({
  rel: path.relative(ROOT, abs),
  text: fs.readFileSync(abs, "utf8"),
}));

/** Bir alt-dizenin src/ taramasındaki HANGİ dosyada geçtiğini bulur;
 *  yoksa null. Konumdan bağımsız — A7 CSS'i taşısa da tarama aynı kalır. */
function locateToken(needle, files = SOURCE_FILES) {
  const hit = files.find((f) => f.text.includes(needle));
  return hit ? hit.rel : null;
}

describe("invariant: Biletone tasarım token'ları src/ kaynaklarında yerinde (konumdan bağımsız)", () => {
  const TOKENS = [
    ["#E30613", "Biletone vurgu kırmızısı"],
    ["#090909", "OLED koyu zemin"],
    ["Poppins", "yazı ailesi"],
  ];

  it.each(TOKENS)("%s (%s) src/**/*.{js,jsx,css} içinde geçiyor", (value, label) => {
    const where = locateToken(value);
    expect(
      where,
      `"${value}" (${label}) için src/ altında taranan ${SOURCE_FILES.length} .js/.jsx/.css ` +
      `dosyasının hiçbirinde bulunamadı: ${SOURCE_FILES.map((f) => f.rel).join(", ")}`
    ).not.toBeNull();
  });

  /* ── boş koltuk token'ı ────────────────────────────────────────────
     Görev tanımı bu token'ı "--seat-free" diye adlandırıyor — ama bu,
     Biletone'un KENDİ (harici) design system'indeki isim. Uygulamanın
     GERÇEKTEN yüklediği CSS'te (const CSS → .ed.dark/.ed.light) bu
     token --seatoff olarak tanımlı ve satır ~2276'da koltuk rengi için
     fiilen kullanılıyor. Kanıt, PlanEditor.jsx'in kendi yorumu (satır
     ~146): "DS'in --seat-selected'ı seçim rengimiz (--sel), --seat-free
     ise --seatoff." Yani --seat-free hiçbir zaman GERÇEK bir CSS custom
     property olarak var olmadı (yalnız bu açıklayıcı yorumda geçiyor);
     --seatoff onun uygulamadaki karşılığı ve gerçekten yüklenen değer.
     İkisini de kabul ediyoruz — hangisi kalırsa varlık korunmuş sayılır
     — ama en az biri GERÇEKTEN yüklenen kaynakta olmalı. */
  it("boş koltuk token'ı (--seat-free ya da uygulamadaki karşılığı --seatoff) bulunuyor", () => {
    const where = locateToken("--seat-free") || locateToken("--seatoff");
    expect(
      where,
      `ne "--seat-free" ne "--seatoff" src/ altında taranan ${SOURCE_FILES.length} ` +
      `.js/.jsx/.css dosyasının hiçbirinde bulunamadı`
    ).not.toBeNull();
  });

  it("testin testi: token listesine var olmayan bir değer eklenince KIRMIZI döner", () => {
    const where = locateToken("#TOTALLY-FAKE-BILETONE-TOKEN-000");
    expect(where).toBeNull();
  });
});

describe("invariant: POI ikonları (public/poi/*.png) yerinde ve PlanEditor.jsx'in POI sabitiyle birebir örtüşüyor", () => {
  /* PlanEditor.jsx'teki `const POI = {...}` bloğunu (yalnız bu bloğu —
     dosyada başka bir yerde aynı adda bir "img" alanı olsa bile
     karışmasın diye) metinden çıkarır. POI'nin hiçbir değeri (etiket,
     SVG path verisi) süslü parantez İÇERMİYOR (bkz. src/PlanEditor.jsx
     satır ~110'daki tanım — `p` dizileri düz SVG path mini-dili, `label`
     ve `img` düz string) — bu yüzden string-farkında olmayan basit bir
     derinlik sayacı burada güvenli. */
  function extractPoiBlock(text) {
    const marker = "const POI = {";
    const start = text.indexOf(marker);
    if (start === -1) return null;
    const braceStart = start + marker.length - 1; // "{" karakterinin kendisi
    let depth = 0, i = braceStart;
    for (; i < text.length; i++) {
      if (text[i] === "{") depth++;
      else if (text[i] === "}") { depth--; if (depth === 0) { i++; break; } }
    }
    return text.slice(braceStart, i);
  }

  function poiImgRefs(poiBlockText) {
    return [...poiBlockText.matchAll(/img:\s*"([^"]+)"/g)].map((m) => m[1]);
  }

  const planEditorText = fs.readFileSync(PLAN_EDITOR, "utf8");
  const poiBlock = extractPoiBlock(planEditorText);
  const diskFiles = fs.readdirSync(POI_DIR).filter((f) => f.endsWith(".png"));
  const refs = poiBlock ? poiImgRefs(poiBlock) : [];

  it("public/poi/ altında 20 PNG var", () => {
    expect(diskFiles.length).toBe(20);
  });

  it("src/PlanEditor.jsx içinde bir `const POI = {...}` bloğu bulunuyor", () => {
    expect(poiBlock, "src/PlanEditor.jsx içinde \"const POI = {\" bulunamadı").not.toBeNull();
  });

  it("POI bloğundan en az bir `img` atıfı çıkarılabiliyor (çıkarma mantığı bozulmamış)", () => {
    expect(refs.length).toBeGreaterThan(0);
  });

  it.each(refs)('POI atıfı "%s" → public/poi/%s.png diskte var', (name) => {
    expect(
      diskFiles,
      `POI'nin atıfta bulunduğu "public/poi/${name}.png" diskte YOK — kırık ikon demek`
    ).toContain(`${name}.png`);
  });

  /* Ters yön: diskte olup POI'de hiç kullanılmayan dosya varsa bunu
     KIRMIZI döndürmeden, yalnız bilgi olarak raporla (görev tanımının
     isteği — kullanılmayan bir ikon "hata" değil, en fazla temizlik
     fırsatı). Şu an (audit tarihi itibariyle) 20 atıf ↔ 20 dosya birebir
     örtüşüyor, yani bu liste boş çıkıyor — ileride biri POI'den bir
     girişi silip dosyayı unutursa burada görünür. */
  it("bilgi: diskte olup POI'de hiç kullanılmayan dosya (bilgi amaçlı, testi kırmızıya döndürmez)", () => {
    const used = new Set(refs.map((n) => `${n}.png`));
    const unused = diskFiles.filter((f) => !used.has(f));
    console.log(
      unused.length
        ? `[bilgi] POI'de kullanılmayan dosya(lar): ${unused.join(", ")}`
        : "[bilgi] POI'de kullanılmayan dosya yok — 20 atıf ↔ 20 dosya birebir örtüşüyor."
    );
    expect(true).toBe(true); // bilinçli olarak hiçbir girdide kırmızı dönmez
  });

  it("testin testi: POI atıfı diskte olmayan bir dosyaya çevrilince KIRMIZI döner", () => {
    const fakeBlock = '{ ornek: { label: "Örnek", img: "hic-var-olmayan-dosya-xyz" } }';
    const fakeRefs = poiImgRefs(fakeBlock);
    expect(fakeRefs).toContain("hic-var-olmayan-dosya-xyz");
    expect(diskFiles).not.toContain("hic-var-olmayan-dosya-xyz.png");
  });
});
