/** Poligonu kendi dış normali boyunca büyütür.
 *  Önce payı ağırlık merkezinden dışa doğru veriyordum; uzun ve sığ
 *  bloklarda bu pay yanlış yöne gidip koltukları dışarıda bırakıyordu. */
export function offsetPoly(ring, d) {
  const n = ring.length;
  if (n < 3 || d === 0) return ring;
  const area = (pts) => {
    let a = 0;
    for (let i = 0, j = pts.length - 1; i < pts.length; j = i++)
      a += pts[j].x * pts[i].y - pts[i].x * pts[j].y;
    return a / 2;
  };
  const sign = area(ring) > 0 ? 1 : -1;
  const nrm = (p, q) => {
    const dx = q.x - p.x, dy = q.y - p.y, L = Math.hypot(dx, dy) || 1;
    return { x: (dy / L) * sign, y: (-dx / L) * sign };
  };
  return ring.map((p, i) => {
    const a = nrm(ring[(i - 1 + n) % n], p), b = nrm(p, ring[(i + 1) % n]);
    let vx = a.x + b.x, vy = a.y + b.y;
    const L = Math.hypot(vx, vy) || 1;
    vx /= L; vy /= L;
    /* Sivri köşelerde gönye uzaması — kontrolsüz büyümesin diye sınırlı */
    const miter = Math.min(2.4, 1 / Math.max(0.42, (vx * a.x + vy * a.y)));
    return { x: p.x + vx * d * miter, y: p.y + vy * d * miter };
  });
}

/** Işın atma — poligon içinde mi? */
export function inPoly(x, y, poly) {
  let hit = false;
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
    const a = poly[i], b = poly[j];
    if ((a.y > y) !== (b.y > y) && x < ((b.x - a.x) * (y - a.y)) / (b.y - a.y) + a.x) hit = !hit;
  }
  return hit;
}

/* ───────────────  TABAN-TABAN ÇAKIŞMA (Sutherland-Hodgman)  ───────────────
   İki blok tabanı (m.outline) gerçekten kesişiyor mu? Görünürde bir
   boşluk olsa bile otomatik taban payı (offsetPoly'nin şişirdiği dış hat)
   yine de çakışabilir — ZORLU'da ve AKM'de tam bunu bulduk: dar açısal
   boşluk, geniş taban payını durduramadı, ama koltuklar güvendeydi. Bu
   yüzden bu kontrol koltuk merkezlerine değil, tabanın kendisine bakar.
   clip poligonu dışbükey olmasa da bbox ile önceden elenmiş komşu
   bloklar için doğru sonuç veriyor. */
export function polySignedArea(poly) {
  let a = 0;
  for (let i = 0; i < poly.length; i++) {
    const p = poly[i], q = poly[(i + 1) % poly.length];
    a += p.x * q.y - q.x * p.y;
  }
  return a / 2;
}
export const polyCCW = (poly) => (polySignedArea(poly) < 0 ? [...poly].reverse() : poly);
export function segIntersect(p1, p2, p3, p4) {
  const d1x = p2.x - p1.x, d1y = p2.y - p1.y, d2x = p4.x - p3.x, d2y = p4.y - p3.y;
  const denom = d1x * d2y - d1y * d2x;
  const t = denom === 0 ? 0 : ((p3.x - p1.x) * d2y - (p3.y - p1.y) * d2x) / denom;
  return { x: p1.x + t * d1x, y: p1.y + t * d1y };
}
export function clipPoly(subject, clip) {
  let out = subject;
  for (let i = 0; i < clip.length && out.length; i++) {
    const a = clip[i], b = clip[(i + 1) % clip.length];
    const inside = (p) => (b.x - a.x) * (p.y - a.y) - (b.y - a.y) * (p.x - a.x) >= 0;
    const inp = out; out = [];
    for (let j = 0; j < inp.length; j++) {
      const cur = inp[j], prev = inp[(j - 1 + inp.length) % inp.length];
      const curIn = inside(cur), prevIn = inside(prev);
      if (curIn) { if (!prevIn) out.push(segIntersect(prev, cur, a, b)); out.push(cur); }
      else if (prevIn) out.push(segIntersect(prev, cur, a, b));
    }
  }
  return out;
}
/** İki dış hattın kesişim alanı (cm²) — kesişmiyorsa 0. */
export function outlineOverlapArea(polyA, polyB) {
  const xa = polyA.map((p) => p.x), ya = polyA.map((p) => p.y);
  const xb = polyB.map((p) => p.x), yb = polyB.map((p) => p.y);
  if (Math.max(...xa) < Math.min(...xb) || Math.max(...xb) < Math.min(...xa)) return 0;
  if (Math.max(...ya) < Math.min(...yb) || Math.max(...yb) < Math.min(...ya)) return 0;
  const result = clipPoly(polyCCW(polyA), polyCCW(polyB));
  return result.length < 3 ? 0 : Math.abs(polySignedArea(result));
}
