/* ═════════════════════════  NİZAMİ SAHA ÖLÇÜLERİ  ═════════════════════════
   Spor sahalarının resmî ölçüleri (cm). Yalnız ÖLÇÜ burada; çizim işaretleri
   (orta yuvarlak, ceza sahası, korner yayı) ve renkler PlanEditor.jsx'teki
   PITCHES'te kalıyor — onlar SVG işi, çekirdeğe girmemeli.

   Neden ayrıldı: MCP'nin add_shape aracı "pitch verirsen ölçü nizamnameden
   gelir, w/h yok sayılır" diye SÖZ VERİYORDU ama sözlük React dosyasında
   olduğu için ona hiç bakamıyordu — sonuç 0×0 bir saha ve render'da hiç
   görünmeyen bir şekil. Üstelik açıklama "w/h yok sayılır" dediği için
   dikkatli bir kullanıcı onları BİLEREK vermiyor, yani metin doğrudan
   hataya yönlendiriyordu. Soğuk stadyum testinin çizdiği Beşiktaş planında
   saha böyle kayboldu.

   Ölçüler tek yerde durmalı: UI de MCP de buradan okur.
   ═════════════════════════════════════════════════════════════════════════ */

export const PITCH_DIMS = {
  football: { label: "Futbol sahası (FIFA)", w: 10500, h: 6800, note: "105 × 68 m · nizami" },
  basket: { label: "Basketbol sahası (FIBA)", w: 2800, h: 1500, note: "28 × 15 m · nizami" },
  volley: { label: "Voleybol sahası (FIVB)", w: 1800, h: 900, note: "18 × 9 m · nizami" },
  handball: { label: "Hentbol sahası (IHF)", w: 4000, h: 2000, note: "40 × 20 m · nizami" },
  tennis: { label: "Tenis kortu (ITF)", w: 2377, h: 1097, note: "23,77 × 10,97 m · çiftler" },
  hockey: { label: "Buz hokeyi (IIHF)", w: 6000, h: 3000, note: "60 × 30 m · nizami" },
  generic: { label: "Düz zemin", w: 3000, h: 2000, note: "işaretlemesiz" },
};

/** Sporun nizami ölçüsü. Bilinmeyen spor `generic`e düşer — çağıran taraf
 *  zaten enum ile sınırlı, bu yalnız son çare. */
export const pitchDims = (sport) => PITCH_DIMS[sport] || PITCH_DIMS.generic;
