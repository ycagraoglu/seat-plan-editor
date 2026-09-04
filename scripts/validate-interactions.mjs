#!/usr/bin/env node
/* Etkileşim/kayıt katmanı doğrulama seti.

   validate-venues.mjs sadece statik salon verisini (geometri) kontrol
   eder — React state'e, pointer olaylarına ya da kayıt katmanına hiç
   dokunmaz. Bu script, bu oturumda tam da o yüzden gözden kaçan üç
   hatanın regresyon testidir; her biri saf, dışa aktarılabilir bir
   fonksiyona çıkarıldığı için DOM/React render'ı gerekmeden test edilir:

   1. Store — window.storage yoksa localStorage'a, o da yoksa bellek-içi
      Map'e düşüyor mu; kaydet/yükle/listele/sil döngüsü ve öncelik sırası
      (kv > ls > memory) doğru mu.
   2. alignSetup/alignDelta — hizalama kılavuzu hesaplaması NaN üretmeden
      doğru snap ve kılavuz koordinatı veriyor mu (pick() içindeki t/t.t
      gölgelemesinin regresyon testi).
   3. relabelPatch — blok etiketi değişince ad, özelleştirilmemişse
      otomatik takip ediyor mu; özelleştirilmişse eziliyor mu.
   4. core/schema.js migrate() — schemaVersion'sız (A3 öncesi) bir kayıt
      yüklenince migrations[] zincirinden sırayla geçip güncel sürüme
      çıkıyor mu, eksik alanlar tamamlanırken var olanlar korunuyor mu.
   5. core/schema.js mergeSavedVenues()/isProtectedSample() — bir örnek
      salonun (ör. "gs") localStorage'daki eski/bozuk kopyası, KOD
      tanımını gölgeleyebiliyor mu (gölgelemiyor olması gerekir — A3'ün
      SRC_VER yerine koyduğu asıl garanti bu).

   PlanEditor.jsx JSX içerdiği için Node onu doğrudan import edemez;
   esbuild ile geçici bir modüle derlenip iş bitince silinir — aynı
   yöntem validate-venues.mjs'de de kullanılıyor. core/schema.js düz JS
   olduğu için (React/DOM'a bağımlı değil) doğrudan import ediliyor. */
import { transform } from "esbuild";
import { readFile, writeFile, rm } from "node:fs/promises";
import { fileURLToPath, pathToFileURL } from "node:url";
import path from "node:path";
import { migrate, CURRENT_SCHEMA_VERSION, mergeSavedVenues, isProtectedSample, forkSample } from "../src/core/schema.js";

const root = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const srcPath = path.join(root, "src/PlanEditor.jsx");

const EXTRA_EXPORTS = ["Store", "alignSetup", "alignDelta", "relabelPatch"];

/* Her çağrı ayrı bir geçici dosyaya derler — driver seçimi modül yüklenirken
   bir kere karara bağlandığı için (top-level const), üç farklı global
   ortamı (kv / ls / memory) test etmek için üç ayrı, gerçekten taze
   import gerekiyor. Aynı dosya yolu Node'un modül önbelleğine takılırdı. */
async function loadModule(tag) {
  const src = await readFile(srcPath, "utf8");
  const patched = `${src}\nexport { ${EXTRA_EXPORTS.join(", ")} };\n`;
  const { code } = await transform(patched, { loader: "jsx", format: "esm", target: "node18" });
  /* src/ içine yazılıyor: PlanEditor.jsx artık ./core/*.js'i relative import
     ediyor, o yüzden geçici dosya da PlanEditor.jsx ile AYNI dizinde olmalı. */
  const tmpPath = path.join(root, "src", `.tmp-planeditor-itest-${process.pid}-${tag}.mjs`);
  await writeFile(tmpPath, code);
  try {
    return await import(pathToFileURL(tmpPath).href);
  } finally {
    await rm(tmpPath, { force: true });
  }
}

let anyFail = false;
function check(name, cond, detail = "") {
  console.log(`  ${cond ? "OK" : "HATA"} — ${name}${detail ? ` (${detail})` : ""}`);
  if (!cond) anyFail = true;
}

function fakeLocalStorage() {
  const mem = new Map();
  return {
    getItem: (k) => (mem.has(k) ? mem.get(k) : null),
    setItem: (k, v) => { mem.set(k, String(v)); },
    removeItem: (k) => { mem.delete(k); },
    get length() { return mem.size; },
    key: (i) => [...mem.keys()][i] ?? null,
  };
}

console.log("── Store · localStorage sürücüsü (window.storage yok) ──");
{
  delete global.window;
  global.localStorage = fakeLocalStorage();
  const { Store } = await loadModule("ls");
  check("driver seçimi", Store.driver === "ls", `driver=${Store.driver}`);

  const plan = { blocks: [{ id: "b1" }], shapes: [], underlay: "data:should-be-stripped" };
  check("save() true döner", (await Store.save("t1", plan)) === true);
  const loaded = await Store.load("t1");
  check("load() underlay'i temizler", loaded?.underlay === null);
  check("load() diğer alanları korur", loaded?.blocks?.[0]?.id === "b1");
  check("list() kaydı görür", (await Store.list()).includes("t1"));
  await Store.remove("t1");
  check("remove() sonrası load() null döner", (await Store.load("t1")) === null);
  check("remove() sonrası list()'te yok", !(await Store.list()).includes("t1"));

  delete global.localStorage;
}

console.log("── Store · bellek-içi son çare (ne kv ne localStorage) ──");
{
  delete global.window;
  delete global.localStorage;
  const { Store } = await loadModule("mem");
  check("driver seçimi", Store.driver === "memory", `driver=${Store.driver}`);
  await Store.save("t2", { blocks: [], shapes: [] });
  check("bellek sürücüsünde de kaydet/yükle çalışır", (await Store.load("t2")) !== null);
}

console.log("── Store · öncelik sırası (kv, localStorage varken bile kazanır) ──");
{
  global.localStorage = fakeLocalStorage();
  const kvMem = new Map();
  global.window = {
    storage: {
      async get(k) { return kvMem.has(k) ? { value: kvMem.get(k) } : null; },
      async set(k, v) { kvMem.set(k, v); },
      async delete(k) { kvMem.delete(k); },
      async list(prefix) { return { keys: [...kvMem.keys()].filter((k) => k.startsWith(prefix)) }; },
    },
  };
  const { Store } = await loadModule("kv");
  check("window.storage + localStorage birlikte varken kv kazanır", Store.driver === "kv", `driver=${Store.driver}`);
  delete global.window;
  delete global.localStorage;
}

console.log("── Hizalama kılavuzu (alignSetup + alignDelta) ──");
{
  const { alignSetup, alignDelta } = await loadModule("align");
  const dragged = { b: { id: "A" }, m: { bbox: { x0: 0, y0: 0, x1: 200, y1: 100 } } };
  const target = { b: { id: "B" }, m: { bbox: { x0: 1000, y0: 3, x1: 1200, y1: 103 } } };
  const metas = [dragged, target];
  const metaById = new Map(metas.map((x) => [x.b.id, x.m]));

  const setup = alignSetup(["A"], metas, metaById, []);
  check("alignSetup null dönmez", setup !== null);
  check("kutu merkezi doğru", setup.box.cx === 100 && setup.box.cy === 50);

  /* A'yı sağa 805 sürüklüyoruz: sağ kenarı (x1=200+805=1005) B'nin sol
     kenarına (x0=1000) tam oturmuyor, 5cm kısa kalıyor — eşik 7cm içinde,
     yani snap devreye girip dx'i 805'ten 800'e (tam oturan değere)
     çekmeli. dy=3 zaten üst kenarları (y0+dy=3=B.y0) tam eşleştiriyor. */
  const hit = alignDelta(setup, 805, 3, 7);
  check("x kılavuzu NaN değil", Number.isFinite(hit.g.find((g) => g.axis === "x")?.v));
  check("y kılavuzu NaN değil", Number.isFinite(hit.g.find((g) => g.axis === "y")?.v));
  check("kılavuz span'leri (a/z) NaN değil",
    hit.g.length > 0 && hit.g.every((g) => Number.isFinite(g.a) && Number.isFinite(g.z)));
  check("x kenar eşleşmesi 805'i tam oturan 800'e çekti", hit.dx === 800, `dx=${hit.dx}`);
  check("y ekseni zaten tam eşleşmişti, değişmedi", hit.dy === 3, `dy=${hit.dy}`);

  const miss = alignDelta(setup, 5000, 5000, 7);
  check("eşik dışında kılavuz oluşmaz", miss.g.length === 0);
  check("eşik dışında dx/dy ham kalır", miss.dx === 5000 && miss.dy === 5000);
}

console.log("── relabelPatch (ad/etiket senkronu) ──");
{
  const { relabelPatch } = await loadModule("relabel");
  const untouched = { label: "218", level: "Orta Tribün", name: "Orta Tribün · 218" };
  const p1 = relabelPatch(untouched, "218X");
  check("özelleştirilmemiş ad yeni etiketi takip eder", p1.name === "Orta Tribün · 218X", JSON.stringify(p1));

  const customized = { label: "218", level: "Orta Tribün", name: "VIP Loca" };
  const p2 = relabelPatch(customized, "218Y");
  check("özel ad korunur (ezilmez)", p2.name === undefined, JSON.stringify(p2));
  check("etiket yine de değişir", p2.label === "218Y");
}

console.log("── Şema göçü (core/schema.js migrate) ──");
{
  /* A3 öncesi bir kayıt taklidi: schemaVersion hiç yok, num'un SONRADAN
     eklenen bir alanı (anchor) ve attr eksik — tam da migrations[0]'ın
     düzelttiği eksiklik. rowScheme gibi VAR OLAN bir alan da bilerek
     DEF_NUM'dan farklı bırakıldı, migrate'in onu EZMEDİĞİNİ kanıtlamak için. */
  const legacy = {
    key: "p1", name: "Eski kayıt", unit: "cm", home: { x: 0, y: 0, w: 100, h: 100 },
    blocks: [{ id: "b1", kind: "grid", label: "A", num: { rowScheme: "letter", seatStart: 5 } }],
    shapes: [],
  };
  const migrated = migrate(legacy);
  check("schemaVersion güncel sürüme çıktı", migrated.schemaVersion === CURRENT_SCHEMA_VERSION,
    `schemaVersion=${migrated.schemaVersion}`);
  check("num'un eksik alanı (anchor) DEF_NUM ile tamamlandı", migrated.blocks[0].num.anchor === "order");
  check("num'un VAR OLAN alanı korundu (ezilmedi)",
    migrated.blocks[0].num.rowScheme === "letter" && migrated.blocks[0].num.seatStart === 5);
  check("eksik attr boşla tamamlandı", migrated.blocks[0].attr === "");
  check("blok kimliği ve diğer alanlar bozulmadı",
    migrated.blocks[0].id === "b1" && migrated.name === "Eski kayıt" && migrated.key === "p1");

  /* Zincir sadece EKSİK adımları çalıştırmalı: zaten güncel bir kayıt
     (schemaVersion === CURRENT) migrate'ten değişmeden çıkmalı. */
  const fresh = { ...migrated };
  check("güncel kayıt migrate'ten değişmeden çıkar", JSON.stringify(migrate(fresh)) === JSON.stringify(fresh));
}

console.log("── Örnek salon gölgeleme koruması (core/schema.js) ──");
{
  /* Gerçek BUILTINS'i taklit eden küçük bir sözlük — testin amacı
     venues/index.js'in içeriğini değil, koruma MANTIĞINI doğrulamak. */
  const BUILTINS = {
    gs: { key: "gs", name: "Galatasaray · Türk Telekom Stadyumu", blocks: [{ id: "orig" }], home: {} },
    empty: { key: "empty", name: "Yeni plan", blocks: [], home: {} },
  };
  check("örnek anahtar korumalı", isProtectedSample("gs", BUILTINS));
  check("\"empty\" korumasız (kullanıcı planlarının başlangıcı)", !isProtectedSample("empty", BUILTINS));
  check("bilinmeyen (kullanıcı) anahtar korumasız", !isProtectedSample("p123", BUILTINS));

  /* Asıl senaryo: localStorage'da "gs" adına ESKİ/BOZUK bir kopya var —
     SRC_VER'in çözmeye çalıştığı, bazen çözemediği durum. */
  const staleGs = { key: "gs", name: "BOZUK ESKİ GS", blocks: [{ id: "corrupt" }], home: {} };
  const userPlan = { key: "p1", name: "Kullanıcının kendi planı", blocks: [{ id: "y" }], home: {} };
  const entries = [["gs", staleGs], ["p1", userPlan], ["bos-kayit", null], ["p2", { key: "p2" }]];
  const merged = mergeSavedVenues(BUILTINS, entries);

  check("örnek salonun localStorage kopyası YOK SAYILDI (koddaki kazanır)", !("gs" in merged));
  check("kullanıcının kendi planı normal yüklendi", merged.p1?.name === "Kullanıcının kendi planı");
  check("blocks alanı olmayan/null kayıt sessizce atlandı",
    !("bos-kayit" in merged) && !("p2" in merged));
  check("yüklenen kullanıcı planı da migrate edildi (schemaVersion damgalı)",
    merged.p1?.schemaVersion === CURRENT_SCHEMA_VERSION);

  /* forkSample: kullanıcı bir örneği düzenlediğinde emeğin gittiği yer.
     Id'ler bilerek DEĞİŞMEMELİ (aktif seçim/sürükleme kopmasın), sadece
     anahtar/ad/yayın geçmişi yeni bir kullanıcı planı gibi sıfırlanmalı. */
  const editedGs = { key: "gs", name: "Galatasaray · Türk Telekom Stadyumu",
    blocks: [{ id: "b42", color: "#FF0000" }], home: {}, published: { v: 3 } };
  const forked = forkSample(editedGs, "pforked1");
  check("çatal yeni anahtarı taşır", forked.key === "pforked1");
  check("çatal adı düzenlendiğini belli eder", forked.name.includes("düzenlendi"));
  check("çatalda BLOK İÇERİĞİ (id dahil) DEĞİŞMEDİ", forked.blocks[0].id === "b42" && forked.blocks[0].color === "#FF0000");
  check("çatal kendi yayın geçmişiyle başlar", forked.published === null && Array.isArray(forked.versions) && forked.versions.length === 0);
}

console.log("");
console.log(anyFail ? "SONUÇ: en az bir testte hata var — yukarıya bak." : "SONUÇ: etkileşim/kayıt katmanı temiz.");
if (anyFail) process.exitCode = 1;
