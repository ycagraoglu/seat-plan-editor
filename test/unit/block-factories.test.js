/* ═══════════════════════════════════════════════════════════════════════
   REGRESYON: yeni blok fabrikaları (operatörün TUVALE ÇİZDİĞİ bloklar)
   açık bir `color` yazmamalı — cc(b) = b.color || LEVEL_COLORS[...]
   (PlanEditor.jsx ~953) açık b.color'ı HER ZAMAN kat paletine tercih
   ediyor. 81966d5 örnek salonlardan/şablonlardan sabit rengi kaldırdı ama
   bu dört fabrika unutulmuştu: newTable hariç üçü hâlâ "#3E7FBF"
   basıyordu, yani operatör salonu şablondan değil ELLE kurarsa 81966d5'in
   kazanımı hiç görünmüyordu (ölçülen: elle kurulan salon + balkon → iki
   kata rağmen 171 koltuğun hepsi #3E7FBF, bkz. görev raporu, HATA 1).

   handle-roundtrip.test.js'in kanıtladığı gibi vite.config.js zaten
   react() eklentisini yüklüyor, vitest de onu kullanıyor — PlanEditor.jsx
   JSX içerse bile düz fonksiyonları doğrudan import edilebiliyor. Bu
   yüzden level-color.test.js'teki hand-copy yerine GERÇEK fabrikalar
   çağrılıyor: biri regressiona uğrarsa bu test onu kopyasız yakalar. */
import { describe, it, expect } from "vitest";
import { newGrid, newFan, newTable, newFree } from "../../src/PlanEditor.jsx";

describe("blok fabrikaları açık renk yazmaz, kat paletine bırakır", () => {
  it("newGrid → color boş", () => expect(newGrid(0, 0, 4, 4).color).toBe(""));
  it("newFan → color boş", () => expect(newFan(0, 0, 500).color).toBe(""));
  it("newFree → color boş", () => expect(newFree(0, 0).color).toBe(""));
  /* newTable zaten doğruydu (tek doğru olan) — regresyon bekçisi olarak burada. */
  it("newTable → color boş (regresyon bekçisi)", () => expect(newTable(0, 0).color).toBe(""));
});
