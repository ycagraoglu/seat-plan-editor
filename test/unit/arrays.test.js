import { describe, it, expect } from "vitest";
import { linearArray, radialArray } from "../../src/core/arrays.js";

/* ÖNEMLİ KONVANSİYON: `count` DİZİDEKİ TOPLAM öğe sayısıdır, orijinal blok
   DAHİL. linearArray/radialArray orijinali ÜRETMEZ (çağıran zaten elinde
   tutuyor) — sadece kalan (count-1) KOPYAYI döner. builders.js'teki her
   çağrı bu sözleşmeye göre `[seed, ...linearArray(seed, {count, ...})]`
   şeklinde birleştiriyor (bkz. bowl()). Bu test o sözleşmeyi sabitliyor. */
describe("linearArray/radialArray — count = TOPLAM öğe sayısı (orijinal dahil)", () => {
  it("linearArray(count=3) sadece 2 kopya üretir (orijinal hariç)", () => {
    const seed = [{ id: "seed", label: "A", x: 0, y: 0, rot: 0 }];
    const extra = linearArray(seed, { count: 3, dx: 100, dy: 0 });
    expect(extra).toHaveLength(2);
    expect(extra.map((b) => b.x)).toEqual([100, 200]);
    expect(extra.every((b) => b.y === 0 && b.rot === 0)).toBe(true);
  });

  it("linearArray(count=1) hiç kopya üretmez (dizideki TEK öğe zaten orijinal)", () => {
    const seed = [{ id: "seed", label: "A", x: 0, y: 0, rot: 0 }];
    expect(linearArray(seed, { count: 1, dx: 100, dy: 0 })).toHaveLength(0);
  });

  it("radialArray(count=4) sadece 3 kopya üretir, her biri step kadar döner", () => {
    const seed = [{ id: "seed", label: "A", x: 100, y: 0, rot: 0 }];
    const extra = radialArray(seed, { count: 4, cx: 0, cy: 0, step: 90 });
    expect(extra).toHaveLength(3);
    // (100,0) merkez etrafında 90° dönünce (0,100) olur; rot da 90 artar.
    expect(extra[0].x).toBeCloseTo(0, 6);
    expect(extra[0].y).toBeCloseTo(100, 6);
    expect(extra[0].rot).toBe(90);
    expect(extra[1].rot).toBe(180);
    expect(extra[2].rot).toBe(270);
  });

  it("çok bloklu bir tohum: her kopya TÜM bloklar için birden üretilir (step = blocks.length)", () => {
    const seed = [
      { id: "s1", label: "A", x: 0, y: 0, rot: 0 },
      { id: "s2", label: "B", x: 10, y: 0, rot: 0 },
    ];
    const extra = linearArray(seed, { count: 2, dx: 50, dy: 0 });
    expect(extra).toHaveLength(2); // 1 kopya × 2 blok
    expect(extra.map((b) => b.x)).toEqual([50, 60]);
  });
});

/* HATA 1: Salon şablonunda radyal çoğalt D'yi seçince yeni bloklar E/F
   alıyordu — parterde ZATEN kullanılan harfler (A..F önceden kurulmuştu).
   3. parametre (`used`) planda o an kullanılan etiketleri taşır; olmayan
   çağrılarda (venues/builders.js) varsayılan boş küme davranışı DEĞİŞTİRMEZ
   — üstteki testler hâlâ 3. argüman olmadan geçiyor. */
describe("linearArray/radialArray — used kümesi ZATEN kullanılan ön ekleri atlar", () => {
  it("linearArray: hedef etiket kullanımdaysa boş olana dek ilerler", () => {
    const seed = [{ id: "seed", label: "D", x: 0, y: 0, rot: 0 }];
    const used = new Set(["D", "E", "F"]); // Salon şablonu: A..F zaten var
    const extra = linearArray(seed, { count: 2, dx: 100, dy: 0 }, used);
    expect(extra.map((b) => b.label)).toEqual(["G"]);
  });

  it("radialArray: hedef etiket kullanımdaysa boş olana dek ilerler", () => {
    const seed = [{ id: "seed", label: "D", x: 100, y: 0, rot: 0 }];
    const used = new Set(["D", "E", "F"]);
    const extra = radialArray(seed, { count: 2, cx: 0, cy: 0, step: 90 }, used);
    expect(extra.map((b) => b.label)).toEqual(["G"]);
  });

  it("aynı çağrıda ÜRETİLEN etiketler de birbiriyle çakışmaz (kümülatif izleme)", () => {
    const seed = [{ id: "seed", label: "D", x: 0, y: 0, rot: 0 }];
    const used = new Set(["E", "F"]);
    // i=1: D+1=E(dolu)->F(dolu)->G(boş). i=2: D+2=F(dolu)->G(i=1'in ürettiği,
    // dolu)->H(boş). used'a bakıp kümülatif izlemeseydi ikisi de G'de çakışırdı.
    const extra = linearArray(seed, { count: 3, dx: 100, dy: 0 }, used);
    expect(extra.map((b) => b.label)).toEqual(["G", "H"]);
  });

  it("çağıranın used kümesi mutasyona uğramaz (saf kalır)", () => {
    const seed = [{ id: "seed", label: "A", x: 0, y: 0, rot: 0 }];
    const used = new Set(["B"]);
    linearArray(seed, { count: 2, dx: 100, dy: 0 }, used);
    expect(used).toEqual(new Set(["B"]));
  });

  it("used verilmezse (venues/builders.js çağrıları) davranış değişmez", () => {
    const seed = [{ id: "seed", label: "A", x: 0, y: 0, rot: 0 }];
    expect(linearArray(seed, { count: 2, dx: 100, dy: 0 }).map((b) => b.label)).toEqual(["B"]);
  });
});

/* ŞEMSİYE INVARIANT A (renk korunumu) — bkz. block-factories.test.js
   başlığı. linearArray/radialArray her ikisi de kopyayı reLabel({...b,
   id: nid(), ...}, label) ile üretiyor: spread b.color'ı (varsa/yoksa)
   olduğu gibi taşır, reLabel de ona hiç dokunmuyor (core/labels.js) —
   bu iki fonksiyon hiçbir zaman "#3E7FBF" sınıfı bir hataya düşmedi,
   ama bunu varsaymak yerine burada ÖLÇÜYORUZ; ileride biri reLabel'e
   veya buradaki spread'e dokunursa bu test kırmızıya döner. */
describe("linearArray/radialArray renk KORUNUMU", () => {
  it("linearArray: renksiz kaynak → renksiz kopyalar", () => {
    const seed = [{ id: "seed", label: "A", x: 0, y: 0, rot: 0 }];
    const extra = linearArray(seed, { count: 3, dx: 100, dy: 0 });
    expect(extra.every((b) => !b.color)).toBe(true);
  });

  it("linearArray: renkli kaynak (kullanıcının seçtiği renk) → kopyalar AYNI rengi taşır", () => {
    const seed = [{ id: "seed", label: "A", x: 0, y: 0, rot: 0, color: "#5F9142" }];
    const extra = linearArray(seed, { count: 3, dx: 100, dy: 0 });
    expect(extra.every((b) => b.color === "#5F9142")).toBe(true);
  });

  it("radialArray: renksiz kaynak → renksiz kopyalar", () => {
    const seed = [{ id: "seed", label: "A", x: 100, y: 0, rot: 0 }];
    const extra = radialArray(seed, { count: 3, cx: 0, cy: 0, step: 90 });
    expect(extra.every((b) => !b.color)).toBe(true);
  });

  it("radialArray: renkli kaynak (kullanıcının seçtiği renk) → kopyalar AYNI rengi taşır", () => {
    const seed = [{ id: "seed", label: "A", x: 100, y: 0, rot: 0, color: "#5F9142" }];
    const extra = radialArray(seed, { count: 3, cx: 0, cy: 0, step: 90 });
    expect(extra.every((b) => b.color === "#5F9142")).toBe(true);
  });
});
