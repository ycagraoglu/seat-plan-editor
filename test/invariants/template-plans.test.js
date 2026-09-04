/* ═══════════════════════════════════════════════════════════════════════
   INVARIANT: A6.5 şablonlarının (Stadyum, Salon — src/venues/templates.js)
   ürettiği plan kural motorundan TEMİZ geçer: hiç t:"err" bulgu yok ve
   hiçbir kapı/işaret bir koltuk dikdörtgeniyle kesişmiyor.

   Bu iki şablon 9 örnek salondan (VENUES, bkz. helpers.js) BİLEREK ayrı
   tutuluyor: onlar sabit salt-okunur örnekler, bunlar "Yeni plan" akışının
   HER ÇAĞRIDA yeni bir kullanıcı planı üreten fonksiyonları (bkz.
   templates.js başlığı) — BUILTINS'e hiç eklenmediler, bu yüzden VENUES'e
   de girmiyorlar ve check-golden'ın 9/9'unu etkilemezler.

   Kapı/işaret-koltuk çakışma hesabı: ÖNCE test/invariants/door-marker-seat-
   overlap.test.js'in dışa aktardığı findDoorMarkerSeatOverlaps() doğrudan
   import edilmeye çalışıldı, ama vitest her .test.js dosyasını kendi
   izole modül grafiğinde çalıştırıyor — o dosyayı import etmek onun
   top-level describe()/it.each(VENUES) bloğunu bu dosyanın İÇİNDE DE
   yeniden çalıştırdı (9 örnek salon + "testin testi"leriyle birlikte 12
   fazladan test, ölçüldü: 6 yerine 18 test raporlandı). O yüzden
   PAYLAŞILAN YARDIMCI kullanılıyor: o dosyanın findDoorMarkerSeatOverlaps'ı
   da zaten hangi ASIL kaynaklardan kuruluysa (rules.js'teki seatCorners,
   polygon.js'teki outlineOverlapArea/inPoly, helpers.js'teki venueSeats)
   aynılarından, aynı hesabı burada AYNEN çağırıyoruz.
   Tek tekrar eden şey o dosyanın da paylaşılan bir yerden almayıp yerel
   tanımladığı birkaç satırlık geometri yapıştırıcısı (dikdörtgen köşesi,
   nokta-segment mesafesi, daire-çokgen kesişimi) — geometrinin KENDİSİ
   (seatCorners/outlineOverlapArea/inPoly) iki ayrı kopya değil, TEK kaynak. */
import { describe, it, expect } from "vitest";
import { buildMeta } from "../../src/core/geometry.js";
import { gateMap } from "../../src/core/gates.js";
import { buildCtx, runRules, seatCorners } from "../../src/core/rules.js";
import { outlineOverlapArea, inPoly } from "../../src/core/polygon.js";
import { buildStadiumTemplate, buildHallTemplate } from "../../src/venues/templates.js";
import { venueSeats } from "./helpers.js";

const TEMPLATES = [
  ["stadyum", buildStadiumTemplate],
  ["salon", buildHallTemplate],
];

/* door-marker-seat-overlap.test.js'teki rectCorners/distPointToSeg/
   circleOverlapsPoly/findDoorMarkerSeatOverlaps ile BİREBİR aynı hesap —
   yukarıdaki dosya başı notuna bkz. */
function rectCorners(x, y, w, h, rotDeg) {
  const rad = (rotDeg * Math.PI) / 180, cos = Math.cos(rad), sin = Math.sin(rad);
  const hw = w / 2, hh = h / 2;
  return [[-hw, -hh], [hw, -hh], [hw, hh], [-hw, hh]].map(([lx, ly]) => ({
    x: x + lx * cos - ly * sin, y: y + lx * sin + ly * cos,
  }));
}
function distPointToSeg(px, py, ax, ay, bx, by) {
  const dx = bx - ax, dy = by - ay, len2 = dx * dx + dy * dy || 1;
  const t = Math.max(0, Math.min(1, ((px - ax) * dx + (py - ay) * dy) / len2));
  return Math.hypot(px - (ax + t * dx), py - (ay + t * dy));
}
function circleOverlapsPoly(cx, cy, r, poly) {
  if (inPoly(cx, cy, poly)) return true;
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++)
    if (distPointToSeg(cx, cy, poly[j].x, poly[j].y, poly[i].x, poly[i].y) < r) return true;
  return false;
}
const AREA_EPS = 1;
function findDoorMarkerSeatOverlaps(plan) {
  const { seats } = venueSeats(plan);
  const doors = (plan.shapes || []).filter((s) => s.type === "door");
  const icons = (plan.shapes || []).filter((s) => s.type === "icon");
  const violations = [];
  for (const s of seats) {
    const corners = seatCorners(s);
    for (const d of doors) {
      const area = outlineOverlapArea(corners, rectCorners(d.x, d.y, d.w, d.h, d.rot || 0));
      if (area > AREA_EPS) violations.push({ seat: s.id, shape: d.label || d.id, kind: "door", area: Math.round(area) });
    }
    for (const ic of icons) if (circleOverlapsPoly(ic.x, ic.y, (ic.size || 34) / 2, corners))
      violations.push({ seat: s.id, shape: ic.label || ic.id, kind: "icon" });
  }
  return violations;
}

function findingsFor(plan) {
  const metas = plan.blocks.map((b) => ({ b, m: buildMeta(b) }));
  const gates = gateMap(plan);
  const ctx = buildCtx(plan, metas, gates);
  return runRules(ctx);
}

describe("invariant: şablon planları kural motorundan hatasız geçer", () => {
  it.each(TEMPLATES)("%s şablonu hiç err bulgu üretmiyor", (_name, build) => {
    const findings = findingsFor(build());
    const errs = findings.filter((f) => f.t === "err");
    expect(errs, JSON.stringify(errs, null, 2)).toHaveLength(0);
  });

  it.each(TEMPLATES)("%s şablonunda kapı/işaret hiçbir koltukla kesişmiyor", (_name, build) => {
    const violations = findDoorMarkerSeatOverlaps(build());
    expect(violations, `${violations.length} çakışma:\n${JSON.stringify(violations.slice(0, 10), null, 2)}`)
      .toHaveLength(0);
  });

  /* Bu şablonların TEK var oluş nedeni operatörün üstüne kademe (kat)
     eklemesi (bkz. templates.js başlığı) — PlanEditor.jsx'teki
     cc(b) = b.color || LEVEL_COLORS[...] blok rengini üretirken açık
     b.color'ı HER ZAMAN kat paletine tercih eder. Şablon bir bloğa açık
     color yazarsa (bowl()'un colors.long/short/corner'ı veya tier()'ın
     color'ı üzerinden) o blok kaç kat eklenirse eklensin hep aynı sabit
     renkte kalır ve lejantın gösterdiği kat renkleriyle asla eşleşmez —
     bu görevin ölçtüğü hata (Bursa Merinos AKKM Osmangazi Salonu: dört
     kat, tuval 1.388 koltuğun hepsini tek renkte çiziyordu). Şablonlar bu
     yüzden bloklara HİÇ açık color yazmamalı: tek kademeliyken
     LEVEL_COLORS[0]'a düşsünler, operatör kademe ekleyince her yeni kat
     kendi LEVEL_COLORS girdisini alsın. */
  it.each(TEMPLATES)("%s şablonunda hiçbir blokta açık color alanı yok", (_name, build) => {
    const offenders = build().blocks.filter((b) => "color" in b);
    expect(offenders, JSON.stringify(offenders.map((b) => ({ label: b.label, color: b.color })), null, 2))
      .toHaveLength(0);
  });

  /* Görev tanımının boyut kısıtı ("stadyum birkaç bin koltuklu bir canavar
     olmasın, salon birkaç yüz-bin arası") bir tercih değil, kabul ölçütü —
     ileride biri parametreleri büyütüp bunu sessizce bozmasın diye alt/üst
     sınır burada da ölçülüyor. */
  it("stadyum birkaç bin koltukluk, GS/Ülker (10 binlerce) ölçeğinde bir canavar değil", () => {
    const metas = buildStadiumTemplate().blocks.map((b) => buildMeta(b));
    const total = metas.reduce((a, m) => a + m.seatCount, 0);
    expect(total).toBeGreaterThan(1000);
    expect(total).toBeLessThan(6000);
  });

  it("salon birkaç yüz ile bin arası koltuklu", () => {
    const metas = buildHallTemplate().blocks.map((b) => buildMeta(b));
    const total = metas.reduce((a, m) => a + m.seatCount, 0);
    expect(total).toBeGreaterThan(200);
    expect(total).toBeLessThan(1200);
  });
});
