/* ══════════════════════════════════════════════════════════════════════════
   KOLTUK KİMLİĞİ
   Kimlik bu ürünün biletleme sistemiyle tek sözleşmesi. İki yol var:
   · Şablondan üret — yeni mekânlar için
   · Mevcut listeden benimse — hâlihazırda bilet satan mekânlar için.
     O sistemdeki kimlik değişemez, biz ona uyarız.
   ══════════════════════════════════════════════════════════════════════════ */

export const DEF_TPL = "{block}-{row}-{seat}";

/** "{block}-{row}-{seat:3}" → "A-5-012" */
export function formatId(tpl, p) {
  return String(tpl || DEF_TPL).replace(/\{(\w+)(?::(\d+))?\}/g, (_, k, pad) => {
    const v = String(p[k] ?? "");
    return pad ? v.padStart(+pad, "0") : v;
  });
}

export const ID_TOKENS = ["{level}", "{block}", "{row}", "{seat}", "{seat:3}", "{row:2}"];

/* ── CSV ── */

export function parseCSV(text) {
  const first = (text.split(/\r?\n/)[0] || "");
  const sep = (first.match(/;/g) || []).length > (first.match(/,/g) || []).length ? ";" : ",";
  return text.split(/\r?\n/).filter((l) => l.trim()).map((l) => {
    const out = []; let cur = "", q = false;
    for (let i = 0; i < l.length; i++) {
      const c = l[i];
      if (c === '"') { if (q && l[i + 1] === '"') { cur += '"'; i++; } else q = !q; }
      else if (c === sep && !q) { out.push(cur); cur = ""; }
      else cur += c;
    }
    out.push(cur);
    return out.map((s) => s.trim());
  });
}

export const COLS = {
  id:    ["id", "kimlik", "seatid", "koltukid", "barkod", "kod"],
  level: ["kat", "level", "tribun", "kusak", "bolum"],
  block: ["blok", "block", "kisim", "section"],
  row:   ["sira", "row", "satir"],
  seat:  ["koltuk", "seat", "no", "numara", "koltukno", "seatno"],
};
export const normHdr = (s) => s.toLocaleLowerCase("tr").replace(/[^a-z0-9çğıöşü]/g, "")
  .replace(/[çğıöşü]/g, (c) => ({ ç: "c", ğ: "g", ı: "i", ö: "o", ş: "s", ü: "u" }[c]));

export function mapColumns(header) {
  const h = header.map(normHdr);
  const idx = {};
  Object.entries(COLS).forEach(([k, names]) => {
    let best = -1;
    h.forEach((cell, i) => {
      if (best >= 0) return;
      if (names.includes(cell)) best = i;
    });
    if (best < 0) h.forEach((cell, i) => {
      if (best >= 0) return;
      if (names.some((n) => cell.startsWith(n))) best = i;
    });
    if (best >= 0) idx[k] = best;
  });
  return idx;
}

/** Eşleştirme anahtarı: büyük harf, baştaki sıfırlar atılır, "A BLOK" → "A" */
export const normPart = (v) => {
  let s = String(v ?? "").trim().toLocaleUpperCase("tr");
  s = s.replace(/\s*(BLOK|BLOCK|SIRA|ROW)\s*$/u, "").trim();
  return /^\d+$/.test(s) ? String(parseInt(s, 10)) : s;
};
export const seatKey = (block, row, seat) => `${normPart(block)}|${normPart(row)}|${normPart(seat)}`;

