export function extent(items, value = (x) => x) {
  let min = Infinity, max = -Infinity, count = 0;
  for (const item of items || []) {
    const n = value(item);
    if (!Number.isFinite(n)) continue;
    if (n < min) min = n;
    if (n > max) max = n;
    count++;
  }
  return count ? { min, max } : null;
}

export function pointBounds(points) {
  const x = extent(points, (p) => p.x), y = extent(points, (p) => p.y);
  return x && y ? { x0: x.min, x1: x.max, y0: y.min, y1: y.max } : null;
}

export function bboxUnion(boxes) {
  let out = null;
  for (const b of boxes || []) {
    if (!b || !Number.isFinite(b.x0) || !Number.isFinite(b.y0)) continue;
    if (!out) out = { ...b };
    else {
      out.x0 = Math.min(out.x0, b.x0); out.x1 = Math.max(out.x1, b.x1);
      out.y0 = Math.min(out.y0, b.y0); out.y1 = Math.max(out.y1, b.y1);
    }
  }
  return out;
}
