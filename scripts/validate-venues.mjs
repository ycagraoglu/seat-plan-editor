#!/usr/bin/env node
/* Geometri doğrulama seti — 7 örnek salonun tümünde 5 test:
   1. koltuk-içerme (koltuk köşeleri kendi bloğunun tabanında mı)
   2. taban-taban çakışma (Sutherland-Hodgman, aynı kat, >50cm²)
   3. sınır (koltuk köşeleri + blok tabanı salon duvarı içinde mi)
   4. gerçek render (react-dom/server ile mount — derleme geçse de
      çalışma anı hatası kaçabiliyor)
   5. validate()'in kendi çıktısı (err/warn)

   PlanEditor.jsx JSX içerdiği için Node onu doğrudan import edemez;
   esbuild ile geçici bir modüle derlenip iş bitince silinir. */
import { transform } from "esbuild";
import { readFile, writeFile, rm } from "node:fs/promises";
import { fileURLToPath, pathToFileURL } from "node:url";
import path from "node:path";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";

const root = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const srcPath = path.join(root, "src/PlanEditor.jsx");
const tmpPath = path.join(root, `.tmp-planeditor-test-${process.pid}.mjs`);

const EXTRA_EXPORTS = ["CSO", "ZORLU", "GS", "ARENA", "HARBIYE", "AYLAK", "SUREYYA",
  "validate", "buildMeta", "buildSeats", "boundaryPolys", "gateMap", "inPoly", "ATTRS"];

async function loadModule() {
  const src = await readFile(srcPath, "utf8");
  const patched = `${src}\nexport { ${EXTRA_EXPORTS.join(", ")} };\n`;
  const { code } = await transform(patched, { loader: "jsx", format: "esm", target: "node18" });
  await writeFile(tmpPath, code);
  try {
    return await import(pathToFileURL(tmpPath).href);
  } finally {
    await rm(tmpPath, { force: true });
  }
}

function seatCorners(s, ATTRS) {
  const w = (ATTRS[s.at]?.wide ? 86 : 41) / 2, h = 38 / 2;
  const rad = ((s.rot || 0) * Math.PI) / 180;
  const cos = Math.cos(rad), sin = Math.sin(rad);
  return [[-w, -h], [w, -h], [w, h], [-w, h]].map(([lx, ly]) => ({
    x: s.x + lx * cos - ly * sin, y: s.y + lx * sin + ly * cos,
  }));
}

function signedArea(poly) {
  let a = 0;
  for (let i = 0; i < poly.length; i++) {
    const p = poly[i], q = poly[(i + 1) % poly.length];
    a += p.x * q.y - q.x * p.y;
  }
  return a / 2;
}
const ccw = (poly) => (signedArea(poly) < 0 ? [...poly].reverse() : poly);

function segIntersect(p1, p2, p3, p4) {
  const d1x = p2.x - p1.x, d1y = p2.y - p1.y, d2x = p4.x - p3.x, d2y = p4.y - p3.y;
  const denom = d1x * d2y - d1y * d2x;
  const t = denom === 0 ? 0 : ((p3.x - p1.x) * d2y - (p3.y - p1.y) * d2x) / denom;
  return { x: p1.x + t * d1x, y: p1.y + t * d1y };
}

/* Sutherland-Hodgman: clipPoly dışbükey olmasa da çoğu gerçek vakada
   (bbox ile önceden elenmiş, komşu bloklar) doğru sonuç veriyor —
   devir notundaki yöntem bu, CSO ve Aylak'ta gerçek hata bulmuştu. */
function clip(subject, clipPoly) {
  let out = subject;
  for (let i = 0; i < clipPoly.length && out.length; i++) {
    const a = clipPoly[i], b = clipPoly[(i + 1) % clipPoly.length];
    const inside = (p) => (b.x - a.x) * (p.y - a.y) - (b.y - a.y) * (p.x - a.x) >= 0;
    const inp = out; out = [];
    for (let j = 0; j < inp.length; j++) {
      const cur = inp[j], prev = inp[(j - 1 + inp.length) % inp.length];
      const curIn = inside(cur), prevIn = inside(prev);
      if (curIn) {
        if (!prevIn) out.push(segIntersect(prev, cur, a, b));
        out.push(cur);
      } else if (prevIn) out.push(segIntersect(prev, cur, a, b));
    }
  }
  return out;
}

function overlapArea(polyA, polyB) {
  const xa = polyA.map((p) => p.x), ya = polyA.map((p) => p.y);
  const xb = polyB.map((p) => p.x), yb = polyB.map((p) => p.y);
  if (Math.max(...xa) < Math.min(...xb) || Math.max(...xb) < Math.min(...xa)) return 0;
  if (Math.max(...ya) < Math.min(...yb) || Math.max(...yb) < Math.min(...ya)) return 0;
  const result = clip(ccw(polyA), ccw(polyB));
  return result.length < 3 ? 0 : Math.abs(signedArea(result));
}

const mod = await loadModule();
const { validate, buildMeta, buildSeats, boundaryPolys, gateMap, inPoly, ATTRS } = mod;
const VENUES = { CSO: mod.CSO, ZORLU: mod.ZORLU, GS: mod.GS, ARENA: mod.ARENA,
  HARBIYE: mod.HARBIYE, AYLAK: mod.AYLAK, SUREYYA: mod.SUREYYA };

console.log("── 4. Gerçek render testi ──");
try {
  renderToStaticMarkup(createElement(mod.default));
  console.log("OK — <PlanEditor/> sunucu tarafında hatasız mount oldu\n");
} catch (e) {
  console.log(`HATA — mount patladı: ${e.message}\n`);
  process.exitCode = 1;
}

let anyFail = false;
for (const [name, venue] of Object.entries(VENUES)) {
  const metas = venue.blocks.map((b) => ({ b, m: buildMeta(b) }));
  const gates = gateMap(venue);

  const allSeats = [];
  metas.forEach(({ b, m }) => {
    buildSeats(b, m, venue.idTemplate).seats.forEach((s) => {
      if (!s.gap) allSeats.push({ s, outline: m.outline });
    });
  });

  // 1. koltuk-içerme
  const t1blocks = new Set();
  for (const { s, outline } of allSeats)
    if (seatCorners(s, ATTRS).some((c) => !inPoly(c.x, c.y, outline))) t1blocks.add(s.block);

  // 2. taban-taban çakışma (yalnız aynı kat — farklı katlar fiziksel olarak üst üste)
  const byLevel = new Map();
  metas.forEach(({ b, m }) => {
    const key = b.level || "";
    if (!byLevel.has(key)) byLevel.set(key, []);
    byLevel.get(key).push({ b, m });
  });
  const overlaps = [];
  for (const group of byLevel.values())
    for (let i = 0; i < group.length; i++)
      for (let j = i + 1; j < group.length; j++) {
        const area = overlapArea(group[i].m.outline, group[j].m.outline);
        if (area > 50) {
          const na = group[i].b.name || group[i].b.label, nb = group[j].b.name || group[j].b.label;
          overlaps.push(`"${na}"↔"${nb}" (${Math.round(area)}cm²)`);
        }
      }

  // 3. sınır — koltuk köşeleri + blok tabanı duvar içinde mi
  const polys = boundaryPolys(venue);
  const inBounds = (x, y) => !polys.length || polys.some((p) => inPoly(x, y, p));
  let t3seat = 0;
  for (const { s } of allSeats) if (seatCorners(s, ATTRS).some((c) => !inBounds(c.x, c.y))) t3seat++;
  const t3blocks = metas.filter(({ m }) => m.outline.some((q) => !inBounds(q.x, q.y))).length;

  // 5. validate() çıktısı
  const report = validate(venue, metas, gates);
  const errs = report.list.filter((o) => o.t === "err");

  const pass = !t1blocks.size && !overlaps.length && !t3seat && !t3blocks && !errs.length;
  if (!pass) anyFail = true;

  console.log(`── ${name} · ${report.total.toLocaleString("tr-TR")} koltuk ──`);
  console.log(`  1. koltuk-içerme:  ${t1blocks.size ? `HATA — bloklar: ${[...t1blocks].join(", ")}` : "OK"}`);
  console.log(`  2. taban çakışma:  ${overlaps.length ? `HATA — ${overlaps.length}: ${overlaps.slice(0, 5).join(" · ")}` : "OK"}`);
  console.log(`  3. sınır:          ${t3seat || t3blocks ? `HATA — ${t3seat} koltuk, ${t3blocks} blok dışarıda` : "OK"}`);
  console.log(`  5. validate():     ${errs.length ? `HATA — ${errs.map((e) => e.m).join(" · ")}` : "OK"}`);
  console.log("");
}

console.log(anyFail ? "SONUÇ: en az bir salonda hata var — yukarıya bak." : "SONUÇ: 7 salon da temiz.");
if (anyFail) process.exitCode = 1;
