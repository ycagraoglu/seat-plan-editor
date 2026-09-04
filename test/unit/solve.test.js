import { describe, it, expect } from "vitest";
import { solveRadialTiers, solveBowlTiers } from "../../src/core/solve.js";
import { footprintPad } from "../../src/core/geometry.js";

/* Bu iki fonksiyon A4'te salon dosyalarındaki elle-ayarlanmış r0/W/H'nin
   yerine geçti: kademe NİYETTEN (satır sayısı + gapFromPrev) hesaplanır,
   footprintPad() ÜZERİNDEN (kopya değil, geometry.js'ten import) aynı
   taban-payı formülünü kullanarak. Kademeler bu yüzden ASLA çakışamaz —
   bir kademenin satır sayısı değişince sonraki otomatik dışarı kayar. */
describe("solveRadialTiers — radyal kademe zinciri (AKM, HARBİYE)", () => {
  it("ilk kademe kendi r0'ını korur; sonraki r0 = önceki dış çap + iki taban payı + gapFromPrev", () => {
    const tiers = [
      { id: "a", rows: 3, rowGap: 100, r0: 500, pad: 50, seatGap: 50 },
      { id: "b", rows: 2, rowGap: 100, gapFromPrev: 80, pad: 60, seatGap: 50 },
    ];
    const [a, b] = solveRadialTiers(tiers);
    expect(a.r0).toBe(500);
    const prevOuter = 500 + (3 - 1) * 100; // 700 — ilk kademenin son sırasının yarıçapı
    const expectedR0 = prevOuter + footprintPad(tiers[0]) + footprintPad(tiers[1]) + 80;
    expect(b.r0).toBeCloseTo(expectedR0, 6);
  });

  it("ilk kademe r0 vermezse fırlatır", () => {
    expect(() => solveRadialTiers([{ id: "x", rows: 2, rowGap: 90, seatGap: 50, pad: 50 }]))
      .toThrowError(/"x".*r0/);
  });

  it("sonraki kademe gapFromPrev vermezse fırlatır", () => {
    expect(() => solveRadialTiers([
      { id: "a", rows: 2, rowGap: 90, seatGap: 50, pad: 50, r0: 100 },
      { id: "b", rows: 2, rowGap: 90, seatGap: 50, pad: 50 },
    ])).toThrowError(/"b".*gapFromPrev/);
  });
});

describe("solveBowlTiers — dikdörtgen-kase kademe zinciri (GS, ÜLKER)", () => {
  it("gapFromPrev W VE H'ye AYNI ANDA uygulanır (kase her yönde eşit büyür)", () => {
    const tiers = [
      { id: "a", rows: 3, rowGap: 100, W: 1000, H: 800, pad: 50, seatGap: 50 },
      { id: "b", rows: 2, rowGap: 100, gapFromPrev: 80, pad: 60, seatGap: 50 },
    ];
    const [a, b] = solveBowlTiers(tiers);
    expect(a).toMatchObject({ W: 1000, H: 800 });
    const padSum = footprintPad(tiers[0]) + footprintPad(tiers[1]) + 80;
    expect(b.W).toBeCloseTo(1000 + (3 - 1) * 100 + padSum, 6);
    expect(b.H).toBeCloseTo(800 + (3 - 1) * 100 + padSum, 6);
  });

  it("Rc (köşe yarıçapı) bu fonksiyonun kapsamı dışında — girdi neyse çıktı da o (bkz. dosya başı gerekçesi)", () => {
    // solveBowlTiers Rc'yi hiç okumaz/yazmaz; çağıran onu ayrıca taşır.
    // Burada doğrulanan şey: dönen nesnede W/H DIŞINDA hiçbir girdi alanı kaybolmuyor.
    const tiers = [{ id: "a", rows: 2, rowGap: 90, seatGap: 50, pad: 50, W: 500, H: 400, extra: "korunmalı" }];
    expect(solveBowlTiers(tiers)[0].extra).toBe("korunmalı");
  });

  it("ilk kademe W veya H vermezse fırlatır", () => {
    expect(() => solveBowlTiers([{ id: "x", rows: 2, rowGap: 90, seatGap: 50, pad: 50, W: 500 }]))
      .toThrowError(/"x".*W.*H/);
  });
});
