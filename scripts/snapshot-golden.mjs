#!/usr/bin/env node
/* A0 — altın dosya üretimi. 9 örnek salonu src/PlanEditor.jsx'ten (esbuild ile
   geçici bir modüle derleyip) yükler; her biri için plan.json + seats.json +
   render.svg yazar (üretim mantığı scripts/lib/golden-build.mjs'te). Yeniden
   yazım ilerledikçe check-golden.mjs bu dosyalarla karşılaştırıp davranış
   sapmasını yakalayacak.

   Determinizm: kaynak, blok/şekil id'lerini modül yüklenirken nid() sayacıyla
   (uid, her yüklemede 0'dan başlar) üretiyor. Aynı kaynak metni her seferinde
   aynı sırayla çalıştığı için id dizisi her yüklemede birebir tekrarlanıyor.
   Bu betik art arda iki kez çalıştırılıp çıktı diff'lenerek doğrulandı — bkz.
   görev raporu. */
import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { loadModule, root, VENUE_KEYS } from "./lib/load-module.mjs";
import { buildGolden } from "./lib/golden-build.mjs";

const outDir = path.join(root, "test/golden");
await mkdir(outDir, { recursive: true });

const mod = await loadModule();

for (const [key, exportName] of Object.entries(VENUE_KEYS)) {
  const venue = mod[exportName];
  if (!venue) throw new Error(`${exportName} src/PlanEditor.jsx içinden dışa aktarılmadı`);
  const { plan, seats, svg, seatCount } = buildGolden(venue, mod);
  await writeFile(path.join(outDir, `${key}.plan.json`), plan);
  await writeFile(path.join(outDir, `${key}.seats.json`), seats);
  await writeFile(path.join(outDir, `${key}.render.svg`), svg);
  console.log(`${key.padEnd(9)} ${String(venue.blocks.length).padStart(3)} blok · `
    + `${seatCount.toLocaleString("tr-TR").padStart(7)} koltuk → yazıldı`);
}

console.log(`\nSONUÇ: ${Object.keys(VENUE_KEYS).length} salon × 3 dosya → ${path.relative(root, outDir)}/`);
