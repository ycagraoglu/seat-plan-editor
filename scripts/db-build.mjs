/* Dokuz örnek salonu db/schema.sql'e yükler ve sonucu bildirir.
   Şema hakem: rapor sözlüğü dışı bir değer, tekrarlanan kardeş kod ya da
   kırık referans varsa yükleme PATLAR. `npm run db:build`. */
import { openDb, createSchema, loadPayload } from "../db/load.mjs";
import { buildDbPayload } from "../src/core/db-export.js";
import { buildMeta } from "../src/core/geometry.js";
import { gateMap } from "../src/core/gates.js";
import * as V from "../src/venues/index.js";
import { rmSync } from "node:fs";

const NAMES = Object.keys(V).filter((k) => k !== "EMPTY" && k !== "BUILTINS" && V[k]?.blocks);
const file = process.argv[2] || "db/seating.db";
rmSync(file, { force: true });

const db = createSchema(openDb(file));
let toplam = { sections: 0, rows: 0, seats: 0, shapes: 0, entrances: 0 };
let hata = 0;

for (const k of NAMES) {
  const v = V[k];
  const payload = buildDbPayload(v, v.blocks.map((b) => ({ b, m: buildMeta(b) })), gateMap(v));
  try {
    const r = loadPayload(db, payload, { planKey: k });
    Object.keys(toplam).forEach((x) => { toplam[x] += r[x]; });
    console.log(`  ${k.padEnd(9)} bölüm ${String(r.sections).padStart(4)} · satır ${String(r.rows).padStart(4)}`
      + ` · koltuk ${String(r.seats).padStart(6)} · şekil ${String(r.shapes).padStart(3)} · kapı ${String(r.entrances).padStart(3)}`);
  } catch (e) {
    hata++;
    console.log(`  ${k.padEnd(9)} REDDEDİLDİ — ${e.message}`);
  }
}

/* Yükleme geçse bile şemanın kendi bütünlük taraması son söz. */
const kirik = db.prepare("PRAGMA foreign_key_check").all();
console.log(`\nTOPLAM  bölüm ${toplam.sections} · satır ${toplam.rows} · koltuk ${toplam.seats}`
  + ` · şekil ${toplam.shapes} · kapı ${toplam.entrances}`);
console.log(`kırık referans: ${kirik.length}`);
console.log(hata || kirik.length ? "\nSONUÇ: şema planı REDDETTİ." : `\nSONUÇ: ${NAMES.length} salon da şemaya oturdu.`);
process.exit(hata || kirik.length ? 1 : 0);
