/* ═══════════════════════════════════════════════════════════════════════
   INVARIANT: saha/sahne ↔ ilk koltuk sırası açıklığı makul aralıkta.

   Gerçek hata (bkz. görev tanımı): Ülker'in basketbol sahası kocaman bir
   boşluğun ortasında minicikti — saha kenarı ↔ ilk sıra açıklığı 24,5 metre
   idi ("Örnek Arena" taslağı, bkz. ulker.venue.js'in kendi başlık yorumu).
   Açıklık için hiçbir sınır tanımlı DEĞİLDİ; koltuk sayıları hep doğruydu,
   resim yanlıştı.

   Ölçüm yöntemi: her koltuğun MERKEZİ, şeklin (pitch/stage) kendi yerel
   çerçevesine (core/geometry.js'teki toLocal — rot'lu şekiller için de
   doğru) taşınır; oradan şeklin dikdörtgenine olan mesafe hesaplanır
   (içerideyse 0). rules.js'teki narrow-aisle/seat-clash kuralları da
   açıklığı koltuk MERKEZİYLE ölçüyor (köşeyle değil) — burada da aynı
   ölçek (metre) için aynı konvansiyon izleniyor.

   type:"pitch" (spor sahası) için KENAR (uzun kenar/touchline) ve DİP
   ÇİZGİSİ (kısa kenar/goal-baseline) AYRI ölçülür: bir koltuk yalnız o
   kenarın dik izdüşüm bandında kalıyorsa (öbür eksende sahanın içinde
   kalıyorsa) o kenarın ölçümüne girer — köşedeki koltuklar ikisine de
   girmez, GS/ULKER'in köşe-yuvarlatılmış (Rc) kase geometrisiyle tutarlı.

   type:"stage" için tek bir ALT SINIR konur (görev tanımı: "benzer bir alt
   sınır koy") — sahne, saha gibi standart bir boyutu olmayan, salon
   başına değişen bir platform; İSTASYON tarzı intim mekanlarda (bar,
   opera locası) sahneye çok yakın oturma normaldir, bu yüzden ÜST sınır
   YOK, sadece "koltuk sahnenin üstünde değil + biraz nefes payı" kontrolü.

   ─────────────────────────────────────────────────────────────────────
   KAPSAM DÜZELTMESİ (v2): kademeli tribün (bowl/tier) ≠ courtside/zemin
   seviyesi oturma. Ülker'in "Parket Kenarı" (P1/P2) bloğu sahaya kasten
   ~2m mesafede — gerçek arenalarda courtside budur, 4-12m aralığı
   TRİBÜNE (kademeli, yükselen tabana) uygulanan bir kural, sahaya
   bitişik düz zemin sıralarına değil. Kase'nin kendisi zaten 6,50m'de,
   doğru.

   Ayrım salona özgü isim/etikete ("Parket Kenarı" string'i) DEĞİL, genel
   bir geometrik ölçüte dayanıyor: bir "kademe" (tier/rake) tanımı gereği
   BİRDEN ÇOK sıradan oluşan bir YÜKSELİŞ/GERİLEME gösterir — 2 nokta bir
   eğri temsil edemez, anlamlı bir rake için en az 3 sıra gerekir. 1-2
   sıralı düz bir bant (courtside, ya da Ülker'in "Loca" katı gibi sığ bir
   kutu — locaların da gerçekte rake'i yoktur) bu invariant'ın 4-12m
   aralığına tabi bir "tribün kademesi" SAYILMAZ. Bunun yerine bu düz
   bantlar için ayrı, GEVŞEK bir alt sınır (COURTSIDE_FLOOR_CM) uygulanır
   — saf "koltuk sahanın üstünde/içinde değil" sağlık kontrolü, gerçek
   yakınlığı (Ülker'in meşru 2,00m'si) yasaklamaz.

   Doğrulandı: bu filtre GS'yi hiç etkilemiyor (3 kademesi de 13-21 sıra,
   rows<3 blok yok). Ülker'de P1/P2 VE Loca'nın 44 bloğu (hepsi 2 sıra)
   elenip yalnız Alt/Üst Tribün (20/16 sıra) kalıyor; sonuç TAM 6,50m —
   venue dosyasının kendi "~6,5m" tasarım notuyla birebir örtüşüyor. */
import { describe, it, expect } from "vitest";
import { toLocal } from "../../src/core/geometry.js";
import { VENUES, venueSeats } from "./helpers.js";

/* Görev tanımının verdiği sınır: 4–12 metre — kademeli tribünün kendisi
   için. GS'de ölçülen kenar/dip açıklığı (~10,4m / ~11,2m) ve Ülker'in
   kase tasarımı (bowl() dokümantasyonunda "~6,5m/~8,5m" — courtside/Loca
   hariç tutulunca ÖLÇÜLEN kenar açıklığı TAM 6,50m) bu aralığın içinde —
   4m altı salonu boğar (eski "Örnek Arena" hatası ~24,5m'nin TERSİ), 12m
   üstü sahayı öksüz bırakır (asıl bug, 24,5m). */
const PITCH_MIN_CM = 400, PITCH_MAX_CM = 1200;

/* Bir bloğun "kademe" (tier) sayılması için gereken en az sıra sayısı —
   bkz. dosya başı gerekçesi. 3, "bir eğri/rake göstermek için en az 3
   nokta gerekir" ilkesinden gelir; 1-2 sıralı bloklar (courtside, loca)
   düz kabul edilir. */
const MIN_TIER_ROWS = 3;

/* rows<3 (courtside/loca) bloklar için ayrı, gevşek alt sınır: sadece
   "koltuk sahanın üstünde/içinde değil" sağlık kontrolü. Ülker'in
   GERÇEK courtside açıklığı 200cm — 100cm bunun rahatça altında kalıp
   yanlış alarm üretmez, ama gerçek bir çakışmayı (0cm'e yakın) yakalar. */
const COURTSIDE_FLOOR_CM = 100;

/* Sahne için tek alt sınır. 9 örnek salonda ölçülen EN SIKI meşru değer
   CSO'da 54cm (bkz. görev raporu) — 30cm bunun altında kalıp hiçbir
   meşru salonu yanlış alarma düşürmez, ama "koltuk sahnenin üstünde"
   (0cm) ile "gerçek bir nefes payı var" arasını ayıracak kadar sıkı. */
const STAGE_FLOOR_CM = 30;

export function distToShapeRect(shape, pt) {
  const p = toLocal(shape, pt);
  const dx = Math.max(Math.abs(p.x) - shape.w / 2, 0);
  const dy = Math.max(Math.abs(p.y) - shape.h / 2, 0);
  return { dist: Math.hypot(dx, dy), local: p };
}

/** type:"pitch" şekli için kenar (touchline) ve dip çizgisi (baseline)
 *  açıklığını (yalnız rows>=MIN_TIER_ROWS olan "kademe" koltuklarından,
 *  metre değil cm) ve courtside/loca (rows<MIN_TIER_ROWS) için ayrı bir
 *  alt-sınır mesafesini (courtsideMin, TÜM koltuklardan) döner. Hiç
 *  koltuk o bandın izdüşümüne girmiyorsa Infinity. `seats` her öğede
 *  `.rows` (koltuğun geldiği bloğun sıra sayısı) taşımalı — bkz.
 *  helpers.js'teki venueSeats. */
export function pitchClearances(pitch, seats) {
  const hw = pitch.w / 2, hh = pitch.h / 2;
  const tiered = seats.filter((s) => s.rows >= MIN_TIER_ROWS);
  let side = Infinity, end = Infinity, courtsideMin = Infinity;
  for (const s of tiered) {
    const { local } = distToShapeRect(pitch, s);
    if (Math.abs(local.x) <= hw) side = Math.min(side, Math.abs(local.y) - hh);
    if (Math.abs(local.y) <= hh) end = Math.min(end, Math.abs(local.x) - hw);
  }
  for (const s of seats) courtsideMin = Math.min(courtsideMin, distToShapeRect(pitch, s).dist);
  return { side, end, courtsideMin };
}

/** type:"stage" şekli için tüm koltuklara en yakın mesafe (cm). */
export function stageMinClearance(stage, seats) {
  let min = Infinity;
  for (const s of seats) min = Math.min(min, distToShapeRect(stage, s).dist);
  return min;
}

describe("invariant: saha (pitch) ↔ ilk sıra açıklığı 4-12m arasında (kademe) + courtside alt sınırı", () => {
  const withPitch = VENUES.filter(([, v]) => v.shapes.some((s) => s.type === "pitch"));

  it("test edecek en az bir 'pitch' salonu var (GS, ULKER)", () => {
    expect(withPitch.length).toBeGreaterThan(0);
  });

  it.each(withPitch)("%s", (_key, venue) => {
    const { seats } = venueSeats(venue);
    const pitch = venue.shapes.find((s) => s.type === "pitch");
    const { side, end, courtsideMin } = pitchClearances(pitch, seats);
    expect(side, `kademe kenar (touchline) açıklığı ${(side / 100).toFixed(2)}m`)
      .toBeGreaterThanOrEqual(PITCH_MIN_CM);
    expect(side, `kademe kenar (touchline) açıklığı ${(side / 100).toFixed(2)}m`)
      .toBeLessThanOrEqual(PITCH_MAX_CM);
    expect(end, `kademe dip çizgisi açıklığı ${(end / 100).toFixed(2)}m`)
      .toBeGreaterThanOrEqual(PITCH_MIN_CM);
    expect(end, `kademe dip çizgisi açıklığı ${(end / 100).toFixed(2)}m`)
      .toBeLessThanOrEqual(PITCH_MAX_CM);
    expect(courtsideMin, `courtside/loca en yakın koltuk ${(courtsideMin / 100).toFixed(2)}m`)
      .toBeGreaterThanOrEqual(COURTSIDE_FLOOR_CM);
  });

  it("testin testi: sahayı dev bir boşluğun ortasına küçültünce (asıl ULKER hatası) KIRMIZI döner", () => {
    const pitch = { x: 0, y: 0, w: 2800, h: 1500, rot: 0 };
    // İlk sıra sahadan 24,5m (2450cm) uzakta — tam da eski "Örnek Arena" hatası.
    // rows:20 -> gerçek bir tribün kademesini temsil ediyor, courtside değil.
    const seats = [{ x: 0, y: 750 + 2450, rot: 0, rows: 20 }];
    const { side } = pitchClearances(pitch, seats);
    expect(side).toBeGreaterThan(PITCH_MAX_CM);
  });

  it("testin testi: kademe koltuğu sahaya çok yakınsa (alt sınırın altı) KIRMIZI döner", () => {
    const pitch = { x: 0, y: 0, w: 2800, h: 1500, rot: 0 };
    const seats = [{ x: 0, y: 750 + 100, rot: 0, rows: 20 }]; // sadece 1m açıklık, ama rows>=3
    const { side } = pitchClearances(pitch, seats);
    expect(side).toBeLessThan(PITCH_MIN_CM);
  });

  it("testin testi: courtside (rows<3) koltuk sahaya 2m gibi meşru bir mesafede olabilir, 4-12m aralığına GİRMEZ", () => {
    const pitch = { x: 0, y: 0, w: 2800, h: 1500, rot: 0 };
    // Ülker'in P1/P2'sinin gerçek durumu: rows=2, ~2m açıklık.
    const seats = [{ x: 0, y: 750 + 200, rot: 0, rows: 2 }];
    const { side, courtsideMin } = pitchClearances(pitch, seats);
    expect(side).toBe(Infinity); // rows<3 olduğu için "kademe" ölçümüne hiç girmedi
    expect(courtsideMin).toBeGreaterThanOrEqual(COURTSIDE_FLOOR_CM); // ama gevşek tabanı geçiyor
  });

  it("testin testi: courtside (rows<3) koltuk GERÇEKTEN sahanın üstündeyse yine de KIRMIZI döner (kör nokta yok)", () => {
    const pitch = { x: 0, y: 0, w: 2800, h: 1500, rot: 0 };
    const seats = [{ x: 0, y: 0, rot: 0, rows: 2 }]; // sahanın tam merkezinde
    const { courtsideMin } = pitchClearances(pitch, seats);
    expect(courtsideMin).toBeLessThan(COURTSIDE_FLOOR_CM);
  });
});

describe("invariant: sahne (stage) ↔ ilk sıra için alt sınır", () => {
  const withStage = VENUES.filter(([, v]) => v.shapes.some((s) => s.type === "stage"));

  it("test edecek en az bir 'stage' salonu var", () => {
    expect(withStage.length).toBeGreaterThan(0);
  });

  it.each(withStage)("%s", (_key, venue) => {
    const { seats } = venueSeats(venue);
    const stage = venue.shapes.find((s) => s.type === "stage");
    const min = stageMinClearance(stage, seats);
    expect(min, `sahneye en yakın koltuk mesafesi ${(min / 100).toFixed(2)}m`)
      .toBeGreaterThanOrEqual(STAGE_FLOOR_CM);
  });

  it("testin testi: koltuğu sahnenin tam ortasına koyunca (0 mesafe) KIRMIZI döner", () => {
    const stage = { x: 0, y: -450, w: 1200, h: 350, rot: 0 };
    const seats = [{ x: stage.x, y: stage.y, rot: 0 }]; // sahnenin merkezinde
    expect(stageMinClearance(stage, seats)).toBeLessThan(STAGE_FLOOR_CM);
  });
});
