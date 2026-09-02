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

/* Yalnız PlanEditor.jsx'e GERÇEKTEN özgü isimler: salon sabitleri, validate()
   (orada tanımlı), ATTRS (görünüm sabiti, orada tanımlı). Geometri
   yardımcıları (buildMeta, gateMap, boundaryPolys, inPoly, buildSeats, ...)
   artık PlanEditor.jsx'in kendisi de src/core/*.js'ten import ediyor — o
   isimleri PlanEditor.jsx modülünden yeniden dışa aktarmaya gerek yok,
   ihtiyacı olan script core/'dan DOĞRUDAN import eder (core/ düz JS,
   esbuild'e gerek duymaz). Buraya PlanEditor.jsx'te artık import EDİLMEYEN
   bir isim eklersen esbuild "is not declared in this file" ile patlar. */
const EXTRA_EXPORTS = ["CSO", "ZORLU", "GS", "ULKER", "HARBIYE", "AYLAK", "SUREYYA", "AKM", "YENIKAPI",
  "validate", "ATTRS"];

export async function loadModule() {
  const src = await readFile(srcPath, "utf8");
  const patched = `${src}\nexport { ${EXTRA_EXPORTS.join(", ")} };\n`;
  const { code } = await transform(patched, { loader: "jsx", format: "esm", target: "node18" });
  /* src/ içine yazılıyor: PlanEditor.jsx artık ./core/*.js'i relative import
     ediyor, o yüzden geçici dosya da PlanEditor.jsx ile AYNI dizinde olmalı
     (kök dizinde olsaydı ./core/... kökte aranırdı). */
  const tmpPath = path.join(root, "src", `.tmp-planeditor-test-${process.pid}.mjs`);
  await writeFile(tmpPath, code);
  try {
    return await import(pathToFileURL(tmpPath).href);
  } finally {
    await rm(tmpPath, { force: true });
  }
}

/* 9 örnek salon: dosya-adı anahtarı → src/PlanEditor.jsx'teki export adı.
   snapshot-golden.mjs ve check-golden.mjs aynı listeyi, aynı sırayla kullanır. */
export const VENUE_KEYS = {
  cso: "CSO", zorlu: "ZORLU", gs: "GS", ulker: "ULKER", harbiye: "HARBIYE",
  aylak: "AYLAK", sureyya: "SUREYYA", akm: "AKM", yenikapi: "YENIKAPI",
};
