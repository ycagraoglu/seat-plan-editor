# Oturma Planı Editörü — referans uygulama

Mekân oturma planı çizen bir editör. **Bu depo bir referans projedir**: amacı
doğrudan entegre edilmek değil, aynı işi veritabanı destekli bir uygulamada
kuracak ekibe *çalışan bir örnek* sunmaktır.

Kapsam **geometri ve kimlik**tir. Fiyat, kategori, satış, müsaitlik, bloke —
hiçbiri bu uygulamanın konusu değildir ve bilerek yoktur.

```bash
npm install
npm run dev        # http://localhost:5173  (editör tek başına)
npm test           # tüm sınavlar
```

**Yapay zekâya salon çizdirmek istiyorsan** — panele düz Türkçe yazıp
çizimi canlı izlemek — tek komut ve kılavuz:

```bash
GEMINI_API_KEY=...  npm run live      # ya da ANTHROPIC_API_KEY / OPENAI_API_KEY
```

→ **[docs/NASIL-KULLANILIR.md](docs/NASIL-KULLANILIR.md)** — buradan başla.

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

**Kurallar** (`src/core/rules.js`) — 26 kural, veri olarak tanımlı, tek
kaynaktan üç tüketiciye (canlı uyarı, Doğrula raporu, CI). Aralarında:
- kapı/işaret hiçbir koltukla kesişmez
- refakatçi koltuğu grupsuz kalmaz; bölüm ağacında döngü/derinlik/kardeş kod
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

**On gerçek mekân** (`src/venues/`) — çalışan örnek olarak, gerçek
kapasitelerle: Galatasaray Türk Telekom Stadyumu (48.600), Fenerbahçe Şükrü
Saracoğlu (52.838), Ülker Spor Salonu (13.204), Harbiye Açıkhava (4.295),
Zorlu PSM, CSO Ada Ankara, AKM Opera Salonu, Süreyya Operası, Aylak Bar,
Yenikapı. Her salon dosyası neden öyle çizildiğini yorumlarında anlatır.

İki stadyum bilerek FARKLI yapıda: Türk Telekom tek parça bir kâse, numaralı
bloklarla (101, 102…); Şükrü Saracoğlu ise dört ayrı tribün olarak satılır
(Maraton · Fenerium · Kuzey · Spor Toto), her birinin kendi harf dizisi ve
Alt/Üst kademesi var. Geometri kâse, KİMLİK dört parça — yol yazılmış
`level` alanının (`"Maraton / Üst"`) gerçek karşılığı budur ve editörde
hiyerarşiye dokunan her şeyi bu salon sınadı.

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
│                 kind: floor · balcony · stand · tier · section · box ·
│                 table_area · general_admission_area
├── groups[]     koltuk grupları → seating.seat_groups
│   masa ve loca OTOMATİK: blok = grup (b.kind:"table" · b.groupKind:"box")
│   refakatçi grubu OTOMATİK: tekerlekli sandalye + en yakın refakatçi
├── shapes[]     satılabilir olmayan nesneler → seating.shapes
│   sahne · perde · saha · kapı · duvar · ayakta alan · ikon · not
└── versions[]   sürümler + published → seating.seat_plan_versions
```

Koltuklar **saklanmaz, türetilir** — `buildSeats()` bloktan üretir. Dışa
aktarım (`seats.json`) bu türetimin düzleştirilmiş hâlidir:

```json
{
  "id": "112-1-1", "level": "Alt Tribün", "block": "112",
  "row": "1", "seat": 1, "gate": "KAPI 13", "gates": ["KAPI 13"],
  "x": 6600, "y": 2250, "rot": -90,
  "seat_kind": "single", "features": [], "group": null,
  "section": "Alt Tribün"
}
```

(Galatasaray planından gerçek bir kayıt — `test/golden/gs.seats.json`.)

`gate` **birincil** kapıdır, `gates` hepsini taşır: gerçekte bir blok sık sık
birden çok kapıdan girilir (Ülker'de 42 blok, Harbiye ve AKM'de üç kapılı
bloklar). Bileti basan taraf `gate`'i tek gerçek sanarsa yönlendirmenin
büyük kısmı kaybolur — AKM'de koltukların %88'i çok kapılıdır.

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

Referans bütünlüğü `test/invariants/db-export.test.js`'te her örnek salon
üstünde otomatik sınanıyor: her `parent_id`, `section_id`, `row_id`,
`seat_type_id`, `group_id` ve `entrance_id` var olan bir satıra çözülüyor;
ayrıca şemanın benzersizlik kısıtları — kardeş bölüm kodu (§5.1'in
`UNIQUE NULLS NOT DISTINCT (tenant_id, version_id, parent_section_id, code)`),
bölüm içi satır kodu, kapı-bölüm çifti.

**Geri okuma** (`db.json` yükle) dışa aktarımın tersi *değil*: db.json
bölüm/satır/koltuk taşır, editörün bloğu ise bir üretim tarifidir ("20 sıra,
21..15 koltuk, 8° kavis"). Koltuk konumlarından o tarifi geri çıkarmak
tahmindir; tahminle sessizce yanlış blok üretmektense hiç üretmemek doğrudur.
Geri okunan şey **kimliktir** — kalıcı koltuk kodunun sahibi karşı sistemse
editör kendi şablon-türevi kimliğini onunkiyle değiştirir. CSV içe
aktarımıyla aynı eşleştiriciyi kullanır (tek kaynak, iki okuyucu); gidiş-dönüş
her salonda `test/invariants/db-import.test.js`'te kilitli.

`test/invariants/report-conformance.test.js` ise raporun **sözlüklerini**
tutuyor: `section.kind`, `seat_group.kind`, `seat_kind`, `features`,
`geometry_kind`, `shape_kind` — dışa aktarım hiçbirinin dışına çıkamıyor.
Aynı dosya §6.4'ün yazım doğrulamasını da uyguluyor (sonlu sayı, pozitif
ölçü, en az üç farklı noktalı poligon, sınırlı nokta sayısı) ve fiyat/satış/
envanter alanı sızmadığını makineyle kontrol ediyor.

**Bölüm geometrisi.** Raporun §6'sı geometriyi *section* üzerinde tanımlıyor
(§6.1: "mevcut uygulama section geometrisinde yalnızca `rect.v1`
destekliyor"). Yaprak bölüm geometrisini bloğun tabanından alır:

| blok | `geometry_kind` | neden |
|---|---|---|
| fan | `arc.v1` | raporun "kavisli tribün" satırı |
| yuvarlak masa | `ellipse.v1` | raporun "yuvarlak masa" satırı |
| gerisi | `polygon.v1` | taban çokgeni — kesin, yaklaşıklık yok |

`rect.v1`'e düşürülmez: dönmüş bir bloğun dünya hizalı bbox'ı gerçek taban
değildir, çokgen zaten kesin. Birden çok bloğun birleştiği bölümde tek bir
taban yoktur (Zorlu'nun orkestra blokları) — geometri `null` bırakılır,
uydurulmuş bir birleşim çokgeni üretilmez.

`seat_kind` ve `features` mimari raporun §5.4'ündeki ayrımı izler:

| `seat_kind` | genişlik | anlam |
|---|---|---|
| `single` | 41 cm | standart tekli |
| `loveseat` | 74 cm | fiziksel birleşik ikili |
| `wheelchair_space` | 86 cm | tekerlekli sandalye konumu |
| `companion` | 41 cm | refakatçi |
| `stool` | 34 cm | tabure (bar, masa çevresi) — Aylak'ın bar tezgâhı |
| `tech` | 41 cm | **rapor sözlüğünde YOK** — editöre özgü uzantı: ızgarada yer kaplayan ama seyirci koltuğu olmayan konum (kamera platformu, ışık masası) |

`features` (0..N): `accessible`, `restrictedView`

**Refakatçi grubu türetilir, saklanmaz.** Rapor §5.4 refakatçi koltuğunun
hangi tekerlekli sandalye konumuna ait olduğunun açıkça tanımlanmasını
şart koşuyor. İlişki fiziksel olduğu için yerleşimden okunuyor: hücre
uzayında en yakın komşuya, birebir. Örnek salonlarda ölçülen üç gerçek
düzenin üçünü de aynı kural karşılıyor — **yan yana** (GS, Ülker),
**önlü arkalı** (AKM: refakatçi bir ön sırada, aynı sütun), **blok blok**
(Yenikapı: 6 sandalye + 6 refakatçi). Eşsiz kalan refakatçiyi
`companion-orphan` kuralı bildirir.

Bir loca ya da masa söz konusuysa **birim grup kazanır**: o koltuklar
locanın/masanın grubuna düşer, ayrıca refakat grubu açılmaz. Rapor bu
durumu ayrıca ele almıyor; bir koltuğun tek bir `group_id`'si var ve
satılan birim locadır.

---

## Neyi ALMAMALI

- **`localStorage` sürücüsü** (`src/store/index.js`) — tarayıcıya özgü bir
  çözüm; veritabanı destekli sürümde yeri yok. (Kotanın dolması gerçek bir
  risk: GS planı 202 KB, Ülker 131 KB.) **Ama dosyanın kendisini alın** —
  aşağıdaki "Depolama dikişi"ne bakın. Aynı şekilde
  `ui/ErrorBoundary.jsx`'in "kayıtları indir" çıkışı da alınmaya değer:
  plan çökmeye yol açıyorsa her yeniden yükleme aynı beyaz ekranı verir,
  kullanıcının veriyi o döngüden kurtaracak bir yolu olmalı.
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

## Rapordaki sistem, çalışır hâlde

Editör artık yalnız çizmiyor; mimari raporun şemasına **yazıyor**.

```bash
npm run db:build     # 10 salonu şemaya yükle (db/seating.db)
npm run server       # http://localhost:8787
VITE_API_BASE=http://localhost:8787/api npm run dev

npm run live         # ikisi birden — sohbet + canlı görünüm (bkz. docs/NASIL-KULLANILIR.md)
```

**[`db/schema.sql`](db/schema.sql)** raporun §5–§7'sinin çalıştırılabilir
hâli. Sözlükler `CHECK`, §5.1'in kardeş-tekil kod kuralı `UNIQUE`, §5.4'ün
"başka sürümün tipine bağlanamaz" kuralı composite `FOREIGN KEY`. Fiyat,
satış, müsaitlik, envanter **yok** — rapor §4.3 onları başka sahiplere
veriyor ve şema bunu bir tablo eksikliğiyle değil, bilinçli bir sınırla
temsil ediyor.

Bunun anlamı şu: *"dışa aktarım rapora uygun"* artık benim iddiam değil,
**veritabanının reddedebileceği bir olgu**. On salon gerçekten `INSERT` ediliyor:

```
TOPLAM  bölüm 365 · satır 4554 · koltuk 125.854 · şekil 249 · kapı 193
kırık referans: 0
```

`test/invariants/db-schema.test.js` bunu her koşuda tekrarlıyor — ve
şemanın gerçekten *reddettiğini* de sınıyor: sözlük dışı `seat_kind`,
sürümsüz `geometry_kind`, tekrarlanan kardeş kod, çözülmeyen tip referansı,
tanınmayan `feature`. Reddedilen yükleme yarım kayıt bırakmıyor.

### Taslak ile kanonik veri ayrı

Editörün planı bir **üretim tarifi**dir ("20 sıra, 21..15 koltuk, 8° kavis");
koltuklar ondan türetilir. Tarifi satır satır ilişkiselleştirmek anlamsız —
belge olarak durur ([`db/editor.sql`](db/editor.sql), raporun şemasının
parçası **değil**, ayrı dosyada olması bu yüzden).

**Yayımlama** sınırdır: tarif çalıştırılır, sonucu `seating_*` tablolarına
yazılır, o sürüm dondurulur (rapor §5.4). Yeniden yayımlamak yeni sürüm
açar, eskisi `superseded` olur.

```
POST /api/plans/:key/publish → {"versionId":"ver:aylak:1","version":1,"seats":47}
GET  /api/versions/:id/seats → {"code":"BAR-1","section_code":"BAR",
                                "row_code":"B","label":"1","seat_kind":"stool"}
```

Şemaya oturmayan bir plan `422` ve **sebebiyle** döner — sessiz başarısızlık
bu projedeki en pahalı hata sınıfıydı.

Sunucu ([`server/index.mjs`](server/index.mjs)) `node:http` + `node:sqlite`,
**sıfır bağımlılık**. Tenant tek bir sabitte duruyor; gerçek kurulumda
oturum katmanından gelir, editörden değil.

---

## Depolama dikişi

Editörün dış dünyaya değdiği **tek** yer `src/store/index.js`. Çekirdek
(`src/core/**`) saf; arayüz yalnız beş fonksiyon çağırıyor:

```
list()          → string[]        kayıtlı plan anahtarları
load(key)       → plan | null     yoksa null, HATA FIRLATMAZ
save(key, plan) → boolean         false ise arayüz "kaydedilemedi" gösterir
remove(key)     → void            yoksa da sessizce geçer
pref(k[, v])    → string | null   v yoksa okur, varsa yazar
```

Kurallar sözleşmenin parçası: hiçbiri throw etmez (gizli sekme, kota dolu,
ağ yok → null/false), `save`/`load` simetriktir, anahtar uzayları ayrıktır
(`plan:` / `pref:`), altlık görseli kaydedilmez.

Sözleşme **makineyle sınanıyor** ve paket ([`test/store-contract.js`](test/store-contract.js))
üç uygulamaya birden koşuyor: bellek sürücüsü, sahte API sürücüsü ve
**gerçek HTTP + SQLite sunucusu** (`test/integration/store-api.test.js`).
Üçüncüsü belirleyici — "sürücü değiştirilebilir" cümlesi ancak çalışan bir
veritabanı uygulaması aynı paketi geçerse ölçülmüş bir olgu olur. Kendi
`fetch` sürücünüzü yazınca paketi ona doğrultun.

Bu paketin ilk koşusu gerçek bir hata buldu: bellek sürücüsü planları çıplak
anahtarla yazıp `list()`'te Map'in tamamını döküyordu, yani tercihler plan
sanılıyordu — üç sürücüden yalnız biri anahtar uzayı kuralını çiğniyordu.

Tenant/kimlik burada **yok ve olmamalı**: oturum bilgisi `fetch` katmanının
(çerez, başlık) işi, editörün değil.

---

## Bilinen boşluklar (mimari rapora göre)

Editörün veri modeli raporun hedefine hizalandı (§5.1 bölüm ağacı, §5.3 koltuk
grupları, §5.4 `seat_kind`/`features`). Kalan boşluklar:

| Rapor | Editörde | neden |
|---|---|---|
| §6.2 — `line.v1`, `polyline.v1` | yok | editörde açık uçlu çizgi/rota nesnesi yok; duvar ve bariyer dikdörtgen ya da çokgen çiziliyor |
| §6.2 — `rounded_rect.v1` | yok | yuvarlatılmış köşe ayrı bir tür değil, çokgen olarak çıkıyor |
| §6.2 — `bezier_path.v1` | yok | raporun kendisi ilk teslimat için zorunlu değil diyor |
| §6.3 — `court`, `goal`, `barrier`, `aisle`, `exit`, `restricted_area` | yok | editörde karşılığı olan şekil tipi yok |
| §5.4 `loveseat` · §5.3 `loveseat`, `pod` | model destekliyor | dokuz örnek salonda örneği yok — eksiklik veride, modelde değil |
| §7 — `venue.venues` | yok | editör mekân-alan ayrımı tutmuyor; `space` tek kayıt olarak çıkıyor |

Üretilen: `arc.v1` · `ellipse.v1` · `polygon.v1` · `point.v1` · `rect.v1`.

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
    rules      26 kural + runRules — tek kaynak
    solve      kademe çözücü
    labels     sıra/koltuk numaralandırma
    identity   kimlik şablonu, CSV eşleştirme
    plan       diffPlans — iki sürüm arası kimlik farkı
    schema     şema sürümü + göç zinciri
    export     seats.json veri şekli
  store/       depolama dikişi — kv · localStorage · bellek · api sürücüleri
  venues/      10 gerçek mekân + builders + 2 şablon (stadyum, salon)
  ui/          ErrorBoundary + state/ (reducer + selector, saf)
  styles/      tokens.css (tasarım sistemi) + app.css
  PlanEditor.jsx
db/          schema.sql (raporun şeması) · editor.sql · load.mjs
server/      node:http + node:sqlite, sıfır bağımlılık
test/
  unit/        saf fonksiyonlar
  integration/ gerçek sunucu + şema
  invariants/  her salonda otomatik geçen değişmezler
  golden/      10 salon × {plan.json, seats.json, render.svg}
```

## Doğrulama

```bash
npm test                        # birim + değişmez + geometri + etkileşim
node scripts/check-golden.mjs   # 10 salonun veri denkliği
npm run build
```

**Altın dosyalar** yeniden yazımın denklik güvencesidir: 10 mekânın plan ve
koltuk çıktısı dosyada sabittir, her değişiklikte karşılaştırılır. Geometriye
dokunmadan yapılan hiçbir değişiklik bunları oynatamaz — oynatıyorsa bir şey
kırılmıştır.

**Bu depoyu ana uygulamaya taşıyacak ekip / yapay zekâ ajanı için:**
[`docs/CODEX-BRIEF.md`](docs/CODEX-BRIEF.md) — kapsam sınırı, veri modeli,
kendi kendine keşfedilemeyecek alan bilgisi, çarptığımız tuzaklar ve
sırayla ne yapılacağı. Olduğu gibi prompt olarak verilebilir.

**Yapay zekâya çizdirmek** (panel içi sohbet, MCP, kurulum, 29 araç):
[`docs/NASIL-KULLANILIR.md`](docs/NASIL-KULLANILIR.md) — tasarım gerekçeleri
ve deneme raporları [`docs/MCP-KILAVUZU.md`](docs/MCP-KILAVUZU.md)'de.
Ana uygulamaya taşıyacak geliştirici/LLM için tam talimat:
[`docs/CODEX-BRIEF-YAPAY-ZEKA.md`](docs/CODEX-BRIEF-YAPAY-ZEKA.md).

Ayrıntılı kullanım: [`docs/KULLANIM-KILAVUZU.md`](docs/KULLANIM-KILAVUZU.md) ·
korunan davranışlar ve koruması olmayanlar:
[`docs/REGRESYON.md`](docs/REGRESYON.md)
