/* Ortak yükleme yardımcısı — PlanEditor.jsx JSX içerdiği için Node onu doğrudan
   import edemez; esbuild ile geçici bir modüle derlenip iş bitince silinir.
   validate-venues.mjs, snapshot-golden.mjs ve check-golden.mjs aynı tekniği
   kullanır; teknik burada TEK yerde yaşıyor ki üçü birbirinden sapmasın. */
import { transform } from "esbuild";
import { readFile, writeFile, rm } from "node:fs/promises";
import { fileURLToPath, pathToFileURL } from "node:url";
import path from "node:path";

const here = path.dirname(fileURLToPath(import.meta.url));
export const root = path.resolve(here, "..", "..");
const srcPath = path.join(root, "src/PlanEditor.jsx");

/* Yalnız PlanEditor.jsx'e GERÇEKTEN özgü isimler: validate() ve ATTRS
   (görünüm sabiti), ikisi de orada tanımlı. Salon sabitleri A3'te
   src/venues/*.venue.js'e taşındı (bkz. aşağıda) — düz JS oldukları için
   esbuild'e hiç gerek yok. Geometri yardımcıları (buildMeta, gateMap,
   boundaryPolys, inPoly, buildSeats, ...) da PlanEditor.jsx'in kendisi
   src/core/*.js'ten import ediyor — o isimleri PlanEditor.jsx modülünden
   yeniden dışa aktarmaya gerek yok, ihtiyacı olan script core/'dan
   DOĞRUDAN import eder. Buraya PlanEditor.jsx'te artık import EDİLMEYEN
   bir isim eklersen esbuild "is not declared in this file" ile patlar. */
const EXTRA_EXPORTS = ["validate", "ATTRS"];

export async function loadModule() {
  const src = await readFile(srcPath, "utf8");
  const patched = `${src}\nexport { ${EXTRA_EXPORTS.join(", ")} };\n`;
  const { code } = await transform(patched, { loader: "jsx", format: "esm", target: "node18" });
  /* src/ içine yazılıyor: PlanEditor.jsx artık ./core/*.js'i relative import
     ediyor, o yüzden geçici dosya da PlanEditor.jsx ile AYNI dizinde olmalı
     (kök dizinde olsaydı ./core/... kökte aranırdı). */
  const tmpPath = path.join(root, "src", `.tmp-planeditor-test-${process.pid}.mjs`);
  await writeFile(tmpPath, code);
  let mod;
  try {
    mod = await import(pathToFileURL(tmpPath).href);
  } finally {
    await rm(tmpPath, { force: true });
  }
  /* Salon sabitleri (CSO, ZORLU, ...) artık src/venues/index.js'te — düz
     JS, esbuild'e gerek yok, doğrudan import edilir. Eskiyle AYNI mod.CSO /
     mod.GS / ... şekline erişilebilsin diye tek nesnede birleştiriliyor;
     böylece check-golden.mjs / snapshot-golden.mjs / validate-venues.mjs
     hiç değişmeden çalışmaya devam ediyor. Import SIRASI burada değil,
     venues/index.js'in kendi import satırlarında belirleniyor (bkz. o
     dosyadaki id-sırası uyarısı) — bu satır o modülü sadece BİR KEZ, zaten
     belirlenmiş sırayla değerlendirir. */
  const venuesUrl = pathToFileURL(path.join(root, "src/venues/index.js")).href;
  const venues = await import(venuesUrl);
  return { ...mod, ...venues };
}

/* 9 örnek salon: dosya-adı anahtarı → src/venues/index.js'teki export adı.
   snapshot-golden.mjs ve check-golden.mjs aynı listeyi, aynı sırayla kullanır. */
export const VENUE_KEYS = {
  cso: "CSO", zorlu: "ZORLU", gs: "GS", ulker: "ULKER", harbiye: "HARBIYE",
  aylak: "AYLAK", sureyya: "SUREYYA", akm: "AKM", yenikapi: "YENIKAPI",
  fener: "FENER",
};
