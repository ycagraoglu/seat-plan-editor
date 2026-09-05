# Oturma Planı Editörü — referans uygulama

Mekân oturma planı çizen bir editör. **Bu depo bir referans projedir**: amacı
doğrudan entegre edilmek değil, aynı işi veritabanı destekli bir uygulamada
kuracak ekibe *çalışan bir örnek* sunmaktır.

Kapsam **geometri ve kimlik**tir. Fiyat, kategori, satış, müsaitlik, bloke —
hiçbiri bu uygulamanın konusu değildir ve bilerek yoktur.

```bash
npm install
npm run dev        # http://localhost:5173
npm test           # 415 test
```

---

## Neyi almaya değer

Bu depoda değerli olan React kodu değil. Değerli olan, dokuz gerçek Türk
mekânını çizerken ortaya çıkan **alan bilgisi**. Yeniden yazacak ekip bunları
almalı:

**Geometri**
- Yelpaze/kâse matematiği (`src/core/geometry.js`, `src/venues/builders.js`) —
  radyal kademe, yuvarlatılmış dikdörtgen tribün kuşağı, dışbükey zincirle
  kenar düzleştirme.
- `footprintPad()` — bir bloğun koltuklarının ötesinde kapladığı görünmez pay
  (`pad + koltuk/2 + aralık/2`, ~100 cm). Bu payı bilmeyen her kademe
  hesabı sessizce çakışma üretir; projede en pahalı hata sınıfı buydu.
- Kademe çözücü (`src/core/solve.js`) — yarıçapları sihirli sayıyla değil,
  bildirilen açıklıklardan hesaplar. Çözücü `footprintPad`'i bildiği için
  kademe çakışması matematiksel olarak oluşamaz.
- `cutVomitories()` — tribün kapılarını üstüne kondurmaz, **içine oyar**:
  koltukları siler, kapıyı gerçek boşluğa koyar. Gerçek stadyum mimarisi budur.

**Kurallar** (`src/core/rules.js`) — 21 kural, veri olarak tanımlı, tek
kaynaktan üç tüketiciye (canlı uyarı, Doğrula raporu, CI). Aralarında:
- kapı/işaret hiçbir koltukla kesişmez
- aynı kattaki bloklar birbirinin alanına giremez (farklı kat girebilir —
  balkon parterin üstünde durur)
- koltuk kendi bloğunun dış hattının içinde
- geçit genişliği, tekerlekli sandalye yeterliliği, yinelenen kimlik

Kural bulguları sadece "hata var" demez, **hedef değer** verir:
*"geçit için en az 90 cm gerekir"*, *"1 yer daha eklenmeli"*.

**Numaralandırma** (`src/core/labels.js`)
- Sıra harfleri `I`'yı atlar (1 ile karışır) — koltuk düzeninde standart.
- Koridor numara tüketmez: `A-1 … A-5 | koridor | A-6 … A-10` kesintisiz akar.
- Çift/tek numaralandırma, merkeze göre sayma, özel sıra adları.

**Dokuz gerçek mekân** (`src/venues/`) — çalışan örnek olarak, gerçek
kapasitelerle: Galatasaray Türk Telekom Stadyumu (48.600), Ülker Spor
Salonu (13.204), Harbiye Açıkhava (4.295), Zorlu PSM, CSO Ada Ankara, AKM
Opera Salonu, Süreyya Operası, Aylak Bar, Yenikapı. Her salon dosyası
neden öyle çizildiğini yorumlarında anlatır.

---

## Veri modeli

```
plan
├── blocks[]     koltuk üreten bloklar (grid | fan | table | free)
│   ├── level    bölüm YOLU → seating.sections zinciri
│   │             "Alt Tribün" tek düğüm · "Batı / Alt Kat" iki düğüm
│   ├── label    blok kodu — bölümün içindeki blok
│   ├── geometri kind'e göre: rect | arc | çokgen taban
│   ├── num      numaralandırma şeması → seating.rows
│   └── ov       koltuk başına istisna (tip, özellik, kaydırma, silme)
├── sections[]   bölüm ağacı (parentId ile) → seating.sections
├── groups[]     koltuk grupları → seating.seat_groups
│   masa (otomatik) · loca · love-seat · kapsül · refakatçi grubu
├── shapes[]     satılabilir olmayan nesneler → seating.shapes
│   sahne · perde · saha · kapı · duvar · ayakta alan · ikon · not
└── versions[]   sürümler + published → seating.seat_plan_versions
```

Koltuklar **saklanmaz, türetilir** — `buildSeats()` bloktan üretir. Dışa
aktarım (`seats.json`) bu türetimin düzleştirilmiş hâlidir:

```json
{
  "id": "112-1-1", "level": "Alt Tribün", "block": "112",
  "row": "1", "seat": 1, "gate": "KAPI 13",
  "x": 6600, "y": 2250, "rot": -90,
  "seat_kind": "single", "features": [], "group": null,
  "section": "Alt Tribün"
}
```

(Galatasaray planından gerçek bir kayıt — `test/golden/gs.seats.json`.)

Bunun yanında **`db.json`** düğmesi hedef şemanın **tablolarını** üretir —
doğrudan `INSERT` edilebilir satır listeleri, yabancı anahtarlarıyla:

```
space · seat_plan · seat_plan_version
sections · rows · seat_types · seat_groups · seats · shapes
entrances · entrance_sections
```

Editörün hiyerarşisi bölüm → **blok** → satır → koltuk; şemanınki
`sections → rows → seats`. Aradaki farkı dışa aktarım kapatıyor: **her blok
bir yaprak bölüm** olarak çıkıyor, üstünde kat yolundan gelen zincir. Yani
"Batı Tribünü / Alt Kat" katındaki "H" bloğu üç bölüm üretir — raporun
§5.1'deki örneğinin birebir kendisi, ve koltuğun tam adresi zincirden
okunabiliyor.

Referans bütünlüğü `test/invariants/db-export.test.js`'te dokuz salon
üstünde otomatik sınanıyor: her `parent_id`, `section_id`, `row_id`,
`seat_type_id`, `group_id` ve `entrance_id` var olan bir satıra çözülüyor.

`seat_kind` ve `features` mimari raporun §5.4'ündeki ayrımı izler:

| `seat_kind` | genişlik | anlam |
|---|---|---|
| `single` | 41 cm | standart tekli |
| `loveseat` | 74 cm | fiziksel birleşik ikili |
| `wheelchair_space` | 86 cm | tekerlekli sandalye konumu |
| `companion` | 41 cm | refakatçi |
| `stool` | 34 cm | tabure (bar, masa çevresi) |
| `tech` | 41 cm | **rapor sözlüğünde YOK** — editöre özgü uzantı: ızgarada yer kaplayan ama seyirci koltuğu olmayan konum (kamera platformu, ışık masası) |

`features` (0..N): `accessible`, `restrictedView`

---

## Neyi ALMAMALI

- **`localStorage` kalıcılığı** (`Store`, `src/PlanEditor.jsx`) — tarayıcıya
  özgü bir çözüm. Veritabanı destekli sürümde yeri yok.
- **Tek dosyalık arayüz.** `PlanEditor.jsx` hâlâ ~3.900 satır. Saf çekirdek
  (`src/core/`) ve veri (`src/venues/`) dışarı çıkarıldı, ama arayüz
  bölünmedi. Yeniden yazacak ekip bunu kendi yapısına göre kursun.
- **Kimlik üretimi.** Editör koltuk kimliğini `{block}-{row}-{seat}`
  şablonundan üretir. Veritabanınızda kalıcı bir `kod` alanı varsa **onu
  benimseyin** — editörün CSV içe aktarımı (`parseCSV`/`mapColumns`) tam
  bunun içindir. Blok adını değiştirmek şablon-türevi kimlikleri
  değiştirir; yayımlanmış sürümün değişmezliği bunu telafi eder, ama
  kimliğin kaynağı konusunda bilinçli olun.

---

## Bilinen boşluklar (mimari rapora göre)

Editörün veri modeli raporun hedefine hizalandı (§5.1 bölüm ağacı, §5.3 koltuk
grupları, §5.4 `seat_kind`/`features`). Kalan boşluklar:

| Rapor | Editörde |
|---|---|
| §6.2 — `rounded_rect.v1`, `line.v1`, `bezier_path.v1` | yok (arc, polygon, rect, point var) |

Raporun *"karşılanmıyor"* dediği üç şey ise editörde **var**: birden fazla
ayakta alan (Yenikapı'da 4 alan / 39.500 kişi), kavisli geometri (145
yelpaze blok), ve satılabilir envanterden ayrı şekiller (8 tip, 224 örnek).

---

## Yapı

```
src/
  core/        saf: React yok, DOM yok
    geometry   prep · buildMeta · buildSeats · footprintPad · SEAT_KINDS
    polygon    kesişim, alan, çokgen kırpma (Sutherland-Hodgman)
    rules      21 kural + runRules — tek kaynak
    solve      kademe çözücü
    labels     sıra/koltuk numaralandırma
    identity   kimlik şablonu, CSV eşleştirme
    plan       diffPlans — iki sürüm arası kimlik farkı
    schema     şema sürümü + göç zinciri
    export     seats.json veri şekli
  venues/      9 gerçek mekân + builders + 2 şablon (stadyum, salon)
  ui/state/    reducer + selector (saf, test edilebilir)
  styles/      tokens.css (tasarım sistemi) + app.css
  PlanEditor.jsx
test/
  unit/        saf fonksiyonlar
  invariants/  9 salonda otomatik geçen değişmezler
  golden/      9 salon × {plan.json, seats.json, render.svg}
```

## Doğrulama

```bash
npm test                        # birim + değişmez + geometri + etkileşim
node scripts/check-golden.mjs   # 9 salonun veri denkliği
npm run build
```

**Altın dosyalar** yeniden yazımın denklik güvencesidir: 9 mekânın plan ve
koltuk çıktısı dosyada sabittir, her değişiklikte karşılaştırılır. Geometriye
dokunmadan yapılan hiçbir değişiklik bunları oynatamaz — oynatıyorsa bir şey
kırılmıştır.

Ayrıntılı kullanım: [`docs/KULLANIM-KILAVUZU.md`](docs/KULLANIM-KILAVUZU.md) ·
korunan davranışlar ve koruması olmayanlar:
[`docs/REGRESYON.md`](docs/REGRESYON.md)
