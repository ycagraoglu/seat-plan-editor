import { describe, it, expect } from "vitest";
import { buildDbPayload } from "../../src/core/db-export.js";
import { buildMeta } from "../../src/core/geometry.js";
import { gateMap } from "../../src/core/gates.js";
import * as V from "../../src/venues/index.js";
import { VENUE_NAMES } from "./helpers.js";

/* ══════════════════════════════════════════════════════════════════════════
   INVARIANT: dışa aktarım mimari raporun SÖZLÜKLERİNİN dışına çıkmaz.

   Rapor kontrollü sözlükler tanımlıyor ve karşı taraf bunları CHECK kısıtı
   olarak kuracak (§5.4 örneği: CHECK (seat_kind IN (...))). Sözlük dışı tek
   bir değer, karşı tarafta INSERT anında patlar — burada yakalanmalı.
   Sözlükler raporun kendi metninden BİREBİR alındı; kopyalanan tek şey bu
   listeler, kuralın mantığı değil.

   KAPSAM DIŞI (kullanıcının açık talimatı): fiyat, satış, müsaitlik, bloke,
   envanter, seçim politikası. Rapor §4.3 bunları zaten başka sisteme
   veriyor; bu editör yalnız çizim ve kimlik üretir.
   ══════════════════════════════════════════════════════════════════════════ */

const SECTION_KIND = ["floor", "balcony", "stand", "tier", "section", "box",
  "table_area", "general_admission_area"];                              // §5.1
const GROUP_KIND = ["table", "box", "loveseat", "pod", "companion_group"]; // §5.3
const SEAT_KIND = ["single", "loveseat", "wheelchair_space", "companion", "stool"]; // §5.4
const FEATURE = ["accessible", "restrictedView"];                        // §5.4
const GEOMETRY_KIND = ["point.v1", "line.v1", "polyline.v1", "rect.v1",  // §6.2
  "rounded_rect.v1", "ellipse.v1", "arc.v1", "polygon.v1", "bezier_path.v1"];
const SHAPE_KIND = ["stage", "screen", "field", "court", "goal", "table", // §6.3
  "bar", "wall", "barrier", "aisle", "entrance", "exit", "amenity", "label",
  "restricted_area", "standing_area", "decoration"];

/* seat_kind sözlüğünde OLMAYAN, editöre özgü tek uzantı: ızgarada yer
   kaplayan ama seyirci koltuğu olmayan konum (kamera platformu, ışık
   masası). Karşı tarafın CHECK kısıtına eklenmesi gerekir — bilerek burada
   listeleniyor ki sessizce kaçmasın. */
const EDITOR_UZANTISI = ["tech"];

const VENUES = VENUE_NAMES;
const payload = (k) => {
  const v = V[k];
  return buildDbPayload(v, v.blocks.map((b) => ({ b, m: buildMeta(b) })), gateMap(v));
};
const ALL = VENUES.map((k) => [k, payload(k)]);
const topla = (f) => {
  const s = new Set();
  ALL.forEach(([, p]) => f(p).forEach((x) => x != null && s.add(x)));
  return [...s].sort();
};
const sozlukDisi = (got, dict) => got.filter((x) => !dict.includes(x));

describe("rapor sözlükleri — dışa aktarım hiçbirinin dışına çıkmaz", () => {
  it("§5.1 section.kind", () => {
    expect(sozlukDisi(topla((p) => p.sections.map((s) => s.kind)), SECTION_KIND)).toEqual([]);
  });
  it("§5.3 seat_group.kind", () => {
    expect(sozlukDisi(topla((p) => p.seat_groups.map((g) => g.kind)), GROUP_KIND)).toEqual([]);
  });
  it("§5.4 seat_kind", () => {
    const got = topla((p) => p.seat_types.map((t) => t.seat_kind));
    expect(sozlukDisi(got, [...SEAT_KIND, ...EDITOR_UZANTISI])).toEqual([]);
  });
  it("§5.4 features", () => {
    expect(sozlukDisi(topla((p) => p.seats.flatMap((s) => s.features || [])), FEATURE)).toEqual([]);
  });
  it("§6.2 geometry_kind — şekillerde VE bölümlerde", () => {
    const got = topla((p) => [...p.shapes, ...p.sections].map((s) => s.geometry_kind));
    expect(sozlukDisi(got, GEOMETRY_KIND)).toEqual([]);
  });
  it("§6.3 shape_kind", () => {
    expect(sozlukDisi(topla((p) => p.shapes.map((s) => s.shape_kind)), SHAPE_KIND)).toEqual([]);
  });
});

/* Raporun §6.4'teki yazım/yayım doğrulaması — "her geometri yazımında ve
   plan yayımında" saydığı maddeler, madde madde. */
describe.each(VENUES)("%s · §6.4 geometri doğrulaması", (k) => {
  const p = payload(k);
  const geolu = [...p.shapes, ...p.sections].filter((g) => g.geometry_kind);

  it("sayılar sonlu (NaN/Infinity yok)", () => {
    const bozuk = [];
    geolu.forEach((g) => {
      const gez = (v, yol) => {
        if (typeof v === "number" && !Number.isFinite(v)) bozuk.push(`${g.id}.${yol}`);
        else if (v && typeof v === "object") Object.entries(v).forEach(([a, b]) => gez(b, `${yol}.${a}`));
      };
      gez(g.geometry_data, "geometry_data");
    });
    expect(bozuk).toEqual([]);
  });
  it("genişlik, yükseklik ve yarıçaplar pozitif", () => {
    const bozuk = geolu.filter((g) => ["width", "height", "rx", "ry", "r_outer"]
      .some((f) => g.geometry_data[f] != null && g.geometry_data[f] <= 0));
    expect(bozuk.map((g) => g.id)).toEqual([]);
  });
  it("poligon en az ÜÇ FARKLI noktaya sahip", () => {
    const bozuk = geolu.filter((g) => g.geometry_data.points
      && new Set(g.geometry_data.points.map((q) => `${q.x},${q.y}`)).size < 3);
    expect(bozuk.map((g) => g.id)).toEqual([]);
  });
  it("nokta sayısı sınırlı (payload şişmiyor)", () => {
    const enBuyuk = Math.max(0, ...geolu.map((g) => g.geometry_data.points?.length || 0));
    expect(enBuyuk).toBeLessThanOrEqual(256);
  });
});

/* Kapsam sınırı — kullanıcının iki kez tekrarladığı talimat. Bu test
   "unutup eklemedim" demenin makineyle kontrol edilen hâli. */
it("dışa aktarımda fiyat/satış/envanter alanı YOK", () => {
  const yasak = /^(price|amount|currency|fee|sellable|available|availability|blocked|hold|held|reserved|inventory|stock|category|price_zone|selection_policy)$/i;
  const bulunan = new Set();
  const gez = (v) => {
    if (Array.isArray(v)) v.forEach(gez);
    else if (v && typeof v === "object") Object.entries(v).forEach(([k, x]) => {
      if (yasak.test(k)) bulunan.add(k);
      gez(x);
    });
  };
  ALL.forEach(([, p]) => gez(p));
  expect([...bulunan]).toEqual([]);
});
