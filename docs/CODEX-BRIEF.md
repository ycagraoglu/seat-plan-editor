# Codex brief — oturma planı editörünü ana uygulamaya taşımak

> Bu dosya bir **prompt**tur. Ana uygulamada çalışan yapay zekâ ajanına
> (Codex vb.) olduğu gibi verilir. Referans depo:
> **https://github.com/ycagraoglu/seat-plan-editor**

---

## 1 · Görev

Ana uygulamamızın içine, **veritabanı destekli** bir mekân oturma planı
editörü kuracaksın. Referans depoyu **kopyalamayacaksın** — orası
`localStorage` ile çalışan, tek dosyalık arayüzü olan bir *örnek*. Oradan
alacağın şey **alan bilgisi ve veri modeli**; kodu kendi mimarine göre
yeniden yazacaksın.

Referans depo çalışır durumdadır: `npm install && npm run dev`. On gerçek
Türk mekânı içinde kuruludur, hepsi test altındadır. Bir davranışın nasıl
olması gerektiğinden emin değilsen **çalıştır ve bak** — tahmin etme.

---

## 2 · KAPSAM SINIRI (en önemli madde)

Bu editörün konusu **geometri ve kimlik**tir. Aşağıdakiler **kapsam
dışıdır ve bilerek yoktur** — üretme, önerme, "ileride lazım olur" diye
alan açma:

```
fiyat · kategori · price zone · satılabilirlik · müsaitlik
bloke · hold · rezervasyon · envanter · seçim politikası (selection_policy)
```

Bunların sahibi Commerce/Pricing ve Inventory servisleridir. Fiziksel plan
tablosu bunları taşımaz. Referans depoda `db/schema.sql` bu sınırı bir
tablo eksikliğiyle değil, **bilinçli bir kararla** temsil eder ve
`test/invariants/db-schema.test.js` şemada fiyat/satış sütunu olmadığını
her koşuda sınar. Aynı sınırı sen de koru.

**Bir koltuğun o seanstaki durumu plan tablosunda DEĞİL**, `inventory`
tarafındadır. Plan sürümü yayımlandıktan sonra değişmez; envanter ona
*referans verir*.

---

## 3 · Veri modeli — hedef

Hiyerarşi (bizim `seating.*` şemamız):

```
venue.venues
└── venue.spaces
    └── seating.seat_plans
        └── seating.seat_plan_versions          (draft | published | superseded)
            ├── seating.sections                 parent_section_id ile N seviye
            │   ├── seating.rows
            │   │   └── seating.seats
            │   └── seating.seat_groups
            ├── seating.shapes                   satılabilir olmayan nesneler
            └── seating.entrances
                ├── seating.entrance_sections
                └── seating.entrance_seats
```

Çalıştırılabilir hâli: **`db/schema.sql`**. SQLite yazılmıştır; hedefimiz
PostgreSQL ve **üç ayrışma dosyada geçtiği yerde işaretlidir**
(`jsonb` ↔ `TEXT`, `UNIQUE NULLS NOT DISTINCT` ↔ `COALESCE`'lı tekil
indeks, `uuid` ↔ `TEXT`). Portu mekaniktir, sözlükler ve kısıtlar birebir
taşınır.

### Üç ayrı sorumluluk — karıştırma

Bu ayrım mimari raporun §5.4'ünden gelir ve **en sık yapılan hatadır**:

```
seat_kind   = Bu fiziksel olarak NE?        single · loveseat · wheelchair_space
                                             companion · stool
features    = Bu yerin erişim/görüş özelliği?   accessible · restrictedView   (0..N)
seat_group  = Hangi yerlerle BİRLİKTE tek birim?  table · box · loveseat
                                                   pod · companion_group
```

Örnek: pub masasındaki tabure → `seat_kind=stool`, `features=[]`,
`group=table_12`. Tekerlekli sandalye konumu → `seat_kind=wheelchair_space`,
`features=[accessible]`, `group=companion_group_01`.

**Masa ve loca koltuk türü DEĞİLDİR** — masa etrafındaki yerler `single`
veya `stool`, masanın kendisi `seat_group.kind=table`.

**`companion` koltuğu asla grupsuz bırakılmaz.** Hangi `wheelchair_space`
ile ilişkili olduğu `companion_group` üzerinden açıkça tanımlanmalıdır.
(Referansta bu grup *türetilir*: refakatçi, tekerlekli sandalye hücresinin
hemen sağındaki hücredir — `resolveSeatGroup` / `blockCompanionGroups`.)

### Bölüm ağacı — kritik kısıt

```sql
UNIQUE NULLS NOT DISTINCT (tenant_id, version_id, parent_section_id, code)
```

Kardeş bölümlerin kodu tekildir; **farklı üstler altında aynı kod
serbesttir**. "H Blok" hem Alt Kat'ta hem Üst Kat'ta olabilir — eski düz
modelde bu kod hilesi gerektiriyordu.

Yayım anında ayrıca doğrula: **döngü yok**, **derinlik ≤ 5**, her satır
bir **yaprak** bölüme bağlı.

### Geometri: `geometry_kind` ≠ `shape_kind`

`geometry_kind` nasıl çizileceğini, `shape_kind` ne olduğunu söyler.
İkisi ayrı kolondur ve **geometri türü sürümlüdür** (`rect.v1`) — `.v1`
eki sözleşmenin parçasıdır, atma.

```
shape_kind=stage          geometry_kind=rect.v1
shape_kind=stand          geometry_kind=arc.v1
shape_kind=standing_area  geometry_kind=polygon.v1
```

Türe göre değişen nokta/yarıçap verisi `geometry_data jsonb` içinde durur
ve **sahiplik, tenant, durum, envanter bilgisi taşımaz**.

Her yazımda ve yayımda doğrula: koordinatlar canvas içinde, sayılar sonlu,
poligon kapalı ve ≥3 farklı nokta, genişlik/yükseklik/yarıçap pozitif.

---

## 4 · Taslak ile kanonik veriyi AYIR

Bu, mimarinin en önemli kararıdır.

Editörün planı **bir üretim tarifidir**: "20 sıra, 21..15 koltuk, 8° kavis,
şu numaralandırma şeması". Koltuklar bundan **türetilir, saklanmaz**.
Tarifi satır satır ilişkiselleştirmek ne mümkün ne anlamlıdır — belge
olarak dursun (referansta `db/editor.sql`, şemanın **parçası değil**,
ayrı dosyada olması bu yüzden).

**Yayımlama sınırdır:** tarif çalıştırılır, sonucu `seating_*` tablolarına
yazılır, o sürüm dondurulur. Yeniden yayımlamak yeni sürüm açar, eskisi
`superseded` olur. Referansta `server/index.mjs` → `publish()`.

Bunun pratik sonucu: **geometri geri okunamaz.** `db.json` bölüm/satır/
koltuk taşır; koltuk konumlarından "ızgara mıydı yelpaze miydi, kavis kaç
dereceydi" diye tarifi geri çıkarmak tahmindir. Referansın geri okuması
sadece **kimliği** benimser (`dbSeatRows`) ve bu bilinçli bir sınırdır.

---

## 5 · Alan bilgisi — bunları kendin keşfedemezsin

On gerçek mekânı çizerken çıkan, kodda görünmeyen bilgi. Yeniden yazarken
**bunları taşı**, yoksa aynı hatalara tek tek çarparsın.

### 5.1 `footprintPad` — görünmez pay

```js
footprintPad(b) = (b.pad ?? 55) + max(seatW, seatH)/2 + b.seatGap/2   // ~100 cm
```

Bir bloğun koltuklarının **ötesinde** kapladığı alan. Bu payı bilmeyen her
kademe hesabı **sessizce çakışma üretir** — projenin en pahalı hata sınıfı
buydu. Kademe çözücü (`src/core/solve.js`) bu payı bildiği için kademe
çakışması matematiksel olarak oluşamaz.

Yarıçapları sihirli sayıyla verme; **bildirilen açıklıklardan hesapla**.

### 5.2 `cutVomitories` — tüneli tribünün İÇİNE oy

Gerçek stadyumda vomitorium tribünün üstüne konan bir işaret değil, içine
**oyulmuş bir boşluktur**: o dikdörtgende koltuk yoktur, sıralar tünelin
iki yanından devam eder. Kapıyı bloklar arası koridora koymak yanlıştır.

### 5.3 Numaralandırma — gerçek dünyanın kuralları

- Sıra harfleri **`I`, `O`, `Q`'yu atlar** (1 ve 0 ile karışır).
- **Koridor numara tüketmez**: `A-1 … A-5 | koridor | A-6 … A-10` kesintisiz akar.
- Çift/tek numaralandırma (`101, 103…` / `102, 104…`), merkezden dışa sayma,
  özel sıra listeleri gerçek salonlarda hepsi kullanılır.
- **Sıra numarası 1'den başlamak ZORUNDA DEĞİLDİR ve ters akabilir.**
  Şükrü Saracoğlu Maraton Alt'ta sıralar **4–25** ve **25 sahaya en
  yakındır**. `rowStart` + `rowRev` bunu karşılar; modelin bunu
  ifade edemiyorsa gerçek salonları çizemezsin.

### 5.4 Bir blok BİRDEN ÇOK kapıdan girilir

Maraton Üst A-B-C-D-E blokları **KAPI 26 *ve* 27**'den, F-G-H-I blokları
**32 *ve* 33**'ten girilir. Bu istisna değil, kuraldır: on mekânın
dokuzunda çok kapılı blok vardır (Ülker'de 42 blok, Harbiye ve AKM'de üç
kapılı bloklar).

`seat.entrance_id` gibi **tekil bir alan yeterli değildir** —
`entrance_seats` bağlantı tablosunu kullan. Referansta bu bir kez tekil
alandan beslenmişti ve **13.575 yönlendirme satırı sessizce
kayboluyordu**; AKM'de yarıdan fazlası. Biletin üstüne yanlış kapı basmak
demektir.

### 5.5 Kat/bölüm YOL olarak yazılır

`level = "Maraton / Üst"` → `Maraton` (kök) + `Maraton/Üst` (çocuk).
Arayüzde bunun üç sonucu var, üçünü de yap:

1. Kat listesi **ağaçtır**: ara düğümler de listelenir, yoksa dört ayrı
   "Alt" görünür ve hangisinin hangi tribün olduğu anlaşılmaz.
2. Üst bölüm seçmek **altındaki her şeyi** süzer ("Maraton" → Alt + Üst).
3. Üst bölümün koltuk sayacı **altındakilerin toplamıdır**.

### 5.6 Kural motoru — tek kaynak, üç tüketici

`src/core/rules.js`: **26 kural veri olarak tanımlı**, tek `runRules(ctx)`
girişi. Üç tüketici aynı kaynağı okur: canlı uyarı, "Doğrula" raporu, CI.

Bu mimarinin sebebi somut: kural üç ayrı yerde üç ayrı kodla yazılıydı ve
kapsamları farklıydı — *"testte var, uygulamada yok"* durumu yapısal
olarak mümkündü. Tek kaynakta bu imkânsızdır. **Aynı kuralı iki yere
yazma.**

Kural bulguları sadece "hata var" demez, **hedef değer** verir:
*"geçit için en az 90 cm gerekir"*, *"1 yer daha eklenmeli"*,
*"52.838 kapasite için 276 tekerlekli sandalye yeri gerekiyor"*.

Kural kimlikleri:

```
footprint-overlap-same-level · footprint-overlap-cross-level · seat-clash
seat-in-own-block · seats-outside-boundary · seat-corners-outside-boundary
blocks-outside-boundary · narrow-aisle · wheelchair-adequacy
companion-seat-shortfall · companion-orphan · companion-group-incomplete
obstructed-view-count · duplicate-seat-ids · duplicate-block-labels
unlabeled-seats · empty-blocks · empty-doors · no-doors · orphan-blocks
blocks-without-level · section-cycle · section-depth · section-sibling-code
seat-count · bounds-clean-ok
```

---

## 6 · Tuzaklar — bize çarpanlar, sana çarpmasın

| Tuzak | Ne oldu | Ne yap |
|---|---|---|
| **Aynı düzeltme her yerde uygulanmaz** | Aynı sorun 4 kez çıktı: renk (4 üretim noktası), seçim, `plan.home` (4 okuma noktası), salon listesi (5 kopya) | Bir kural varsa **tek fonksiyon**; çağıranları `grep`le, hepsini oraya yönlendir |
| **Eksik alan tüm uygulamayı öldürür** | `plan.home` yoksa `view.w` tanımsızda patlıyordu — beyaz ekran, sebep görünmez | Dışarıdan gelen her plan için **varsayılan türet**; ErrorBoundary koy ama ona güvenme |
| **Palet mod'lanınca yalan söyler** | 6 renk, `% 6` → 8 katlı planda iki tribün aynı renkte. Renk kanalının tek işi ayırt ettirmek | N kategori → **N ayrı renk** (paletten sonrası ton döndürerek) |
| **Denormalize alan yarım kalır** | `gate` alanı ilk kapıyı taşıyordu, bileti basan onu tek gerçek sandı | Denormalize edeceksen **tamamını** taşı, ya da hiç taşıma |
| **Test, hatanın etrafında yazılır** | Bir tutamaç testi sapmayı *kabul edecek* şekilde yazılmıştı, 272 tutamaç sessizce kayıyordu | Testi **kasten bozup kırmızıya döndüğünü gör**; dönmüyorsa test yok demektir |
| **Sözlük dışı değer sessizce geçer** | — | Sözlükleri **`CHECK` kısıtı** yap; veritabanı hakem olsun, kod değil |

---

## 7 · Neyi ALMA

- **`localStorage` kalıcılığı.** Tarayıcıya özgü; veritabanı destekli
  sürümde yeri yok. *Ama* `src/store/index.js`'in **sözleşmesini** al
  (§8).
- **Tek dosyalık arayüz.** `PlanEditor.jsx` ~4.000 satır. Saf çekirdek
  (`src/core/`) ve veri (`src/venues/`) dışarı çıkarılmıştır; arayüz
  bölünmedi. Sen kendi yapına göre kur.
- **Şablondan türetilen kimlik.** Editör koltuk kimliğini
  `{block}-{row}-{seat}` şablonundan üretir. **Veritabanında kalıcı bir
  `code` alanın varsa onu benimset** — blok adını değiştirmek şablon
  türevi kimlikleri değiştirir. Referansın CSV/`db.json` içe aktarımı
  (`parseCSV` / `mapColumns` / `dbSeatRows`) tam bunun içindir.
- **Tenant'ı editöre koyma.** Oturum bilgisi `fetch` katmanının (çerez,
  başlık) işidir.

---

## 8 · Depolama dikişi — değiştireceğin tek yer

Editörün dış dünyaya değdiği tek nokta beş fonksiyondur:

```
list()          → string[]        kayıtlı plan anahtarları
load(key)       → plan | null     yoksa null, HATA FIRLATMAZ
save(key, plan) → boolean         false ise arayüz "kaydedilemedi" gösterir
remove(key)     → void            yoksa da sessizce geçer
pref(k[, v])    → string | null   v yoksa okur, varsa yazar
```

Sözleşmenin parçası olan kurallar:

- **Hiçbiri `throw` etmez.** Ağ koparsa, kota dolarsa, gizli sekmedeyse
  `null`/`false` döner — editör çökmez, kullanıcı durumu görür.
- `save`/`load` simetriktir.
- Anahtar uzayları ayrıktır (`plan:` / `pref:`).
- Altlık görseli kaydedilmez (base64 plan verisini şişirir).

**Sözleşme test paketi hazırdır**: `test/store-contract.js`. Referansta üç
uygulamaya birden koşar (bellek sürücüsü, sahte API sürücüsü, gerçek
HTTP+SQLite sunucusu). **Kendi sürücünü yazınca paketi ona doğrult** —
geçiyorsa dikiş tuttu demektir.

Örnek API sürücüsü: `src/store/api.js`.

---

## 9 · Doğrulama — "bitti" ne demek

Referansta kapılar şunlar; kendi sürümünde karşılıklarını kur:

```bash
npm test                        # 633 test (birim + değişmez + geometri + etkileşim)
node scripts/check-golden.mjs   # 10 salonun veri denkliği — 10/10 AYNI
node scripts/db-build.mjs       # 10 salon gerçekten şemaya INSERT ediliyor
npm run build
```

**Altın dosyalar** (`test/golden/`, 10 salon × {plan.json, seats.json,
render.svg}) yeniden yazımın denklik güvencesidir. Geometriye dokunmadan
yapılan hiçbir değişiklik bunları oynatamaz — oynatıyorsa bir şey
kırılmıştır. Sen de bir denklik ölçütü kur: **taşımadan önce çıktıyı
dondur, taşıdıktan sonra karşılaştır.**

**Değişmez testleri** (`test/invariants/`) her salonda otomatik geçer:
koltuk kendi tabanının içinde · kapı/işaret hiçbir koltukla kesişmez ·
aynı katta çakışma yok · saha–ilk sıra açıklığı makul · kenar kırıklığı
yok · dışa aktarımın her yabancı anahtarı çözülüyor · şema sözlük dışı
değeri reddediyor.

Yeni bir mekân eklediğinde bu testler onu **kendiliğinden kapsar** —
referansta onuncu salon eklenince iki gerçek hata bu şekilde çıktı.

---

## 10 · Dosya haritası

```
src/core/            saf: React yok, DOM yok
  geometry.js  (673) prep · buildMeta · buildSeats · footprintPad · SEAT_KINDS
                     resolveSeatKind / resolveSeatGroup / resolvePlanSections
  rules.js     (589) 26 kural + runRules — TEK kaynak
  db-export.js (243) buildDbPayload → seating.* satırları · dbSeatRows (geri okuma)
  schema.js    (183) plan şeması + göç zinciri
  labels.js    (133) sıra/koltuk numaralandırma
  arrays.js    (111) doğrusal/radyal dizi, hizalama
  polygon.js    (85) kesişim, alan, Sutherland-Hodgman kırpma
  export.js     (83) seats.json veri şekli
  solve.js      (80) kademe çözücü (footprintPad'i bilir)
  identity.js   (74) kimlik şablonu, CSV eşleştirme
  plan.js       (68) diffPlans (sürümler arası kimlik farkı) · planHome
  gates.js      (53) gateMap · autoGates · boundaryPolys

src/venues/          10 gerçek mekân + builders + 2 şablon
src/store/           depolama dikişi (kv · localStorage · bellek · api)
db/schema.sql        HEDEF ŞEMA — raporun çalıştırılabilir hâli
db/editor.sql        editörün çalışma belgesi (şemanın parçası DEĞİL)
server/index.mjs     node:http + node:sqlite, sıfır bağımlılık
test/golden/         10 salon × 3 dosya — denklik güvencesi
```

### On gerçek mekân — neden bunlar

| Mekân | Koltuk | Ne sınıyor |
|---|---:|---|
| Fenerbahçe Şükrü Saracoğlu | 52.838 | **dört ayrı tribün**, yol yazılı `level`, çok kapılı blok |
| Galatasaray Türk Telekom | 48.600 | tek parça kâse, vomitorium, 96 kapı |
| Ülker Spor Salonu | 13.204 | 44 loca, çok kapılı blok yoğunluğu (42) |
| Harbiye Açıkhava | 4.295 | üç kapılı bloklar, düzensiz kenar |
| CSO Ada Ankara | 2.008 | yelpaze geometri |
| Zorlu PSM | 2.134 | tek bölümün birden çok bloğa bölünmesi (ORK-O ×3) |
| AKM Opera | 1.842 | kademe ayrımı, çok kapılı blok |
| Süreyya Operası | 386 | küçük salon, loca |
| Yenikapı | 500 | **çoklu ayakta alan** (39.500 kişilik 4 alan) |
| Aylak Bar | 47 | masa grubu, tabure, refakat grubu |

İkisi bilerek farklı yapıda: **GS tek kâse / Şükrü Saracoğlu dört tribün.**
Hiyerarşiye dokunan her şeyi ikincisi sınar.

---

## 11 · Sırayla ne yap

1. **`db/schema.sql`'i oku ve PostgreSQL'e port et.** Üç ayrışma işaretli.
   Sözlükleri `CHECK` olarak taşı — veritabanı hakem olsun.
2. **`src/core/` modüllerini kendi diline/yapına taşı.** Bunlar saf; React
   yok, DOM yok. Test edilebilirlikleri buradan gelir, o özelliği koru.
3. **Denklik ölçütü kur.** Referanstaki 10 salonu kendi tarafında üret,
   çıktıyı dondur. Taşıma bitince karşılaştır.
4. **Depolama sürücünü yaz**, `test/store-contract.js` paketini ona
   doğrult.
5. **Yayımlama akışını kur**: taslak belge → `buildDbPayload` → `seating.*`
   → sürüm dondur.
6. **Arayüzü kendi tasarım sistemine göre kur.** Referansın arayüzünü
   kopyalama; ama şunları koru: canlı kural uyarısı, tek renk kanalı,
   görünür mod şeridi (her "normal olmayan" durumun tek tıkla çıkışı),
   doğrudan tutamaçlar.

---

## 11.5 · MCP — editörü LLM'e açmak (varsa)

Bu depoda `mcp/` altında, editörü Blender gibi bir LLM'e açan bir MCP
sunucusu var: 27 tipli araç, saf çekirdeğin ince sarmalayıcısı. Ayrıntı
[`docs/MCP-KILAVUZU.md`](MCP-KILAVUZU.md).

Sizin için önemli olan iki karar:

· **Serbest kod çalıştırma yok.** Alan sınırlı olduğu için tipli araçlar
  yetiyor; `execute_code` riskini hiç doğurmuyor. Siz de öyle yapın.
· **Yayım aracı yok.** LLM taslak üretir; yayına gönderme kararı
  operatörde. Bilet satılan bir sistemde bu sınırı gevşetmeyin.

Bunun mümkün olmasının sebebi mimarinin kendisi: `src/core/**` saf olduğu
için araçlar onu doğrudan çağırabiliyor. Siz de çekirdeği saf tutarsanız
aynı kapı size de açık kalır.

---

## 12 · Sorman gerekenler

Emin olmadığın şeyi uydurma, sor:

- Kalıcı koltuk kodunun sahibi kim — biz mi, mekân mı? (Kimlik stratejisi
  buna bağlı.)
- `tech` koltuk türü: raporun sözlüğünde **yok**, editörde var (ızgarada
  yer kaplayan ama seyirci koltuğu olmayan konum — kamera platformu, ışık
  masası). Sözlüğe mi alınacak, yoksa o konumlar `shape` olarak mı
  modellenecek?
- Ayakta alan (GA) kapasitesi plan tarafında mı tutulacak, envanterde mi?
  (Rapor envanteri işaret ediyor.)
