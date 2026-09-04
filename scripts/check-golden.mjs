#!/usr/bin/env node
/* Altın dosyaları TAZE üretir (scripts/lib/golden-build.mjs — snapshot-golden.mjs
   ile aynı üretim kodu, tek kaynak) ve test/golden/ altında kayıtlı halleriyle
   karşılaştırır. Fark varsa ilk farklı satırı okunur biçimde basar ve
   process.exitCode = 1 yapar. */
import { readFile } from "node:fs/promises";
import path from "node:path";
import { loadModule, root, VENUE_KEYS } from "./lib/load-module.mjs";
import { buildGolden } from "./lib/golden-build.mjs";

const goldenDir = path.join(root, "test/golden");

/* Tam bir diff kütüphanesi kurmaya gerek yok: golden dosyalar 2 boşluklu JSON
   ve satır-başına-bir-etiket SVG — yani gerçek bir regresyon neredeyse hep
   TEK satırı değiştirir. İlk farklı satırı + satır sayısı farkını basmak bu
   betiğin amacı için yeterince okunur; daha fazlası için dosyaların kendisi
   açılır. */
function reportDiff(expected, actual) {
  const a = expected.split("\n"), b = actual.split("\n");
  let i = 0;
  while (i < a.length && i < b.length && a[i] === b[i]) i++;
  const lines = [`      ilk fark: satır ${i + 1}`];
  if (a.length !== b.length) lines.push(`      satır sayısı: beklenen ${a.length}, üretilen ${b.length}`);
  if (i < a.length) lines.push(`      - ${a[i]}`);
  if (i < b.length) lines.push(`      + ${b[i]}`);
  return lines.join("\n");
}

const mod = await loadModule();
const keys = Object.entries(VENUE_KEYS);
let okCount = 0;

for (const [key, exportName] of keys) {
  const venue = mod[exportName];
  const fresh = buildGolden(venue, mod);
  const parts = [["plan.json", fresh.plan], ["seats.json", fresh.seats], ["render.svg", fresh.svg]];
  const problems = [];
  for (const [suffix, text] of parts) {
    const file = path.join(goldenDir, `${key}.${suffix}`);
    let expected;
    try {
      expected = await readFile(file, "utf8");
    } catch {
      problems.push(`  ${key}.${suffix}: DOSYA YOK — önce "npm run snapshot:golden" çalıştır`);
      continue;
    }
    if (expected !== text) problems.push(`  ${key}.${suffix}: FARKLI\n${reportDiff(expected, text)}`);
  }
  if (problems.length) {
    console.log(`── ${key} · FARK VAR ──`);
    problems.forEach((p) => console.log(p));
  } else {
    okCount++;
    console.log(`── ${key} · AYNI (${fresh.seatCount.toLocaleString("tr-TR")} koltuk) ──`);
  }
}

console.log("");
console.log(okCount === keys.length
  ? `SONUÇ: ${okCount}/${keys.length} AYNI.`
  : `SONUÇ: ${okCount}/${keys.length} aynı — ${keys.length - okCount} salonda fark var, yukarıya bak.`);
if (okCount !== keys.length) process.exitCode = 1;
