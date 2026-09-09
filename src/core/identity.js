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


/* ══════════════════════════════════════════════════════════════════════════
   EŞLEŞTİRME — dış listedeki kimliği çizimdeki koltuğa bağlamak

   Mekân zaten bilet satıyorsa kimlik onlardadır ve DEĞİŞEMEZ; biz uyarız.
   Eşleştirme anahtarı blok|sıra|koltuk üçlüsü (normPart ile normalize:
   "A BLOK" → "A", baştaki sıfırlar atılır).

   Bu iki fonksiyon SAF ve TEK kaynaktır: arayüzün CSV/db.json içe aktarımı
   da, MCP'nin match_seat_list aracı da bunları çağırır. Eşleştirmeyi iki
   yere yazmak, "editörde şöyle eşleşti MCP'de böyle" ayrışmasına kapı
   açardı — bu projede o hata sınıfı kural motorunu doğuran şeydi.
   ══════════════════════════════════════════════════════════════════════════ */

/**
 * Dış listeyi çizimle karşılaştırır.
 * @param list   [{ block, row, seat, id }]
 * @param metas  [{ b, m }] — buildMeta çıktısıyla
 * @returns hits · missing (listede var çizimde yok) · extra (çizimde var
 *          listede yok) · dupes (listede tekrarlanan) · changing (kimliği
 *          farklı olanlar — benimsenecekler)
 */
export function matchSeats(list, metas, buildSeats, idTemplate) {
  const drawnMap = new Map();
  metas.forEach(({ b, m }) => buildSeats(b, m, idTemplate).seats.forEach((s) => {
    if (!s.gap) drawnMap.set(seatKey(s.block, s.row, s.num), { s, bid: b.id });
  }));

  const hits = [], missing = [], dupes = [];
  const usedKeys = new Set();
  list.forEach((r) => {
    const key = seatKey(r.block, r.row, r.seat);
    if (!r.id) return;
    if (usedKeys.has(key)) { dupes.push(key); return; }
    const hit = drawnMap.get(key);
    if (hit) { usedKeys.add(key); hits.push({ ...hit, csvId: r.id, key }); }
    else missing.push({ key, id: r.id });
  });
  /* extra'ya bloğun kimliği de konuyor: "çizimde var, listede yok" denen
     koltuğu KALDIRABİLMEK için hangi bloğa ait olduğu gerekiyor. Arayüz
     yalnız sayı ve etiket gösteriyor, ek alan onu bozmuyor. */
  const extra = [...drawnMap.entries()].filter(([k]) => !usedKeys.has(k))
    .map(([, v]) => ({ ...v.s, bid: v.bid }));
  const changing = hits.filter((h) => h.csvId !== h.s.id);
  return { hits, missing, extra, dupes, changing };
}

/** Benimsenen kimlikleri plana yazar — koltuk başına ov istisnası olarak. */
export function applyAdoptedIds(plan, changing) {
  const byBlock = new Map();
  changing.forEach(({ bid, s, csvId }) => {
    if (!byBlock.has(bid)) byBlock.set(bid, {});
    byBlock.get(bid)[`${s.r},${s.c}`] = csvId;
  });
  return { ...plan, blocks: plan.blocks.map((b) => {
    const patch = byBlock.get(b.id);
    if (!patch) return b;
    const ov = { ...b.ov };
    Object.entries(patch).forEach(([k, id]) => { ov[k] = { ...(ov[k] || {}), id }; });
    return { ...b, ov };
  }) };
}
