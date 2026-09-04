# Regresyon — v2 yeniden yazımı

Bu belge iki soruya cevap verir:

1. `main`'den bu yana ne değişti (dal özeti)?
2. Bu değişiklik boyunca **korunması gereken davranışlar** hangileri, her
   biri **gerçekten** bir testin altında mı, yoksa sadece "şu an böyle
   çalışıyor" mu?

İkinci kısım kendi kendine güvenmiyor: her satır depodaki gerçek dosyaya
işaret eder, dosyalar bu görev sırasında tek tek okunup doğrulandı.
Otomatik koruması **olmayan** davranışlar da ayrı bir bölümde, gizlenmeden
listeleniyor.

---

## 1. Dal özeti — `main` (`51a6e4c`) → `rewrite/v2` (15 commit)

Rakamlar bu görev sırasında ölçüldü, tahmin değil:

| Ölçü | main | şu an (`rewrite/v2`) |
|---|---|---|
| `src/PlanEditor.jsx` satır sayısı | 5.280 | **3.659** |
| Otomatik test sayısı (vitest `it()`) | 0 | **196** |
| `src/` altındaki dosya sayısı | 2 (`PlanEditor.jsx`, `main.jsx`) | 31 (+ `core/` 12, `venues/` 13, `ui/state/` 2, `styles/` 2) |
| `scripts/` altındaki dosya sayısı | 2 (`validate-venues.mjs`, `validate-interactions.mjs`) | 6 (+ `lib/`, altın-dosya betikleri) |
| `test/` dizini | yok | `golden/` (27 dosya) · `invariants/` (8 test dosyası + `helpers.js`, 121 vaka) · `unit/` (8 dosya, 75 vaka) |

`PlanEditor.jsx` doğrusal küçülmedi — A1-A3 çekirdeği dışarı çıkarırken
5.280 → 4.530 (A1) → 4.337 (A2) → 3.661'e (A3) indi, A6.2-A6.4'ün eklediği
yeni arayüz mantığıyla (tutamaçlar, kademeli panel, renk kanalı, mod
şeridi) 4.082'ye çıktı, A7 gömülü CSS'i `src/styles/`e çıkarınca 3.639'a
indi, A6.5'in üç şablon düğmesi birkaç satır ekleyip bugünkü **3.659**'da
bıraktı. Net etki: dosya küçülmedi ama *içeriği* değişti — geometri/kural/
veri `core/`+`venues/`'ta test edilebilir saf fonksiyonlar, görünüm
`src/styles/`te taşınabilir bir katman; `PlanEditor.jsx`'te kalan
neredeyse tamamı arayüz mantığı.

Test sayısı tek yönde arttı, hiç düşmedi: 0 → **128** (A5) → **148** (A6.1,
+reducer) → **178** (görünüm varlıkları, +design-assets) → **190** (A6.2
düzeltmesi, +handle-roundtrip) → 190 (A6.3, A6.4 — yeni test eklemedi,
davranış zaten var olan takımla korunuyordu) → 190 (A7 — mekanik CSS
taşıması, yeni test eklemedi) → **196** (A6.5, +template-plans). Her sayı
ilgili commit'in kendi ölçümü; 196 bu görevde `npm run test:unit` ile
bağımsızca da doğrulandı.

### Aşama aşama

| Aşama | Commit | Ne yaptı |
|---|---|---|
| **A0** | `0687628` | Altın dosya altyapısı: 9 salon × (plan.json, seats.json, render.svg) donduruldu (`test/golden/`, `scripts/check-golden.mjs`). Sonraki her aşamanın "davranış bozulmadı" iddiasının makineyle kanıtı. |
| **A1** | `cf6fd28` | `PlanEditor.jsx` içindeki saf fonksiyonlar (React/DOM yok) `src/core/` altına çıkarıldı: geometry, polygon, labels, arrays, identity, plan, gates, ids, export. Davranış değişmedi (8 modülün her satırı A0 kaynağıyla karşılaştırıldı). |
| **A2** | `0abf454` | "İki blok tabanı çakışamaz" kuralı `validate()`, CI betiği ve canlı tuval uyarısında **üç ayrı kopya** olarak yaşıyordu; kapsamları sapmıştı. Gerçek hata: **AKM'de 1. ve 2. Balkon tabanları %16 çakışıyordu**, üçü de "sadece aynı kat" baktığı için kaçırmıştı. Çözüm: `src/core/rules.js` — 21 kural, tek `runRules()`, üç tüketici de aynısını çağırıyor. |
| **A3** | `365f4e1` | 9 örnek salonun tanımı (~680 satır) `src/venues/` altına taşındı; `SRC_VER` hack'i gerçek bir şema-sürümü + göç zinciriyle (`src/core/schema.js`) değiştirildi. Gerçek hata: localStorage'daki eski bir kopya, koddaki örnek salonun üstüne biniyordu — kaynak koddaki düzeltme kullanıcı ekranına **hiç ulaşmıyordu**. Yeni model: örnekler salt okunur, kullanıcı düzenlemesi çatal (`p<zaman>`) olarak ayrı yaşar. |
| **A4** | `c9de8c0` | Salon dosyalarındaki kademe yarıçapları (r0/W/H) elle ayarlanmış, görünmez bir sabite (taban payı) karşı dengelenmiş "sihirli sayı"lardı. `src/core/solve.js` (solveRadialTiers, solveBowlTiers) kademeyi NİYETTEN hesaplıyor — taban payını `geometry.js`'ten import ederek. AKM ve Ülker'deki çakışmaların kök nedeni buydu; artık matematiksel olarak imkânsız. |
| **A5** | `1e35b0c` | vitest eklendi — ilk gerçek regresyon katmanı (birim + değişmez testler). **İlk koşuda**, kimse ekrana bakmadan, daha önce yalnız GS/Ülker'de düzeltilmiş iki hata sınıfının **3 başka salonda hâlâ canlı** olduğu bulundu: kapı/işaret koltuk üstünde (AKM 52 · CSO 17 · HARBİYE 38 koltuk), sahne koltuk üstünde (AKM 60 koltuk). Düzeltildi, golden bilerek yeniden üretildi. |
| **test** | `a75e5c6` | 9 salonun geometrisi altın dosyalarla korunuyordu ama **görünüm katmanının (renk/tipografi/ikon) hiçbir koruması yoktu** — sıradaki A7'nin CSS'i taşıması sessizce bir token düşürebilirdi. `test/invariants/design-assets.test.js` eklendi (konumdan bağımsız token taraması + POI dosya/atıf eşleşmesi). |
| **A6.1** | `63ad539` | 47 `useState` → 19 `useState` + 1 saf `useReducer` (`src/ui/state/reducer.js`). İki gerçek hata kapandı: (1) StrictMode'da çift-çağrılan updater geçmişe çift kayıt ekliyordu, (2) ok tuşuyla taşıma (nudge) `future`'ı temizlemiyordu — geri alınmış bir dal, taşımadan sonra "yinele" ile diriliyordu. |
| **A6.2** | `7f293fa` + `f83f36a` | Izgara/yelpaze bloklarına tuvalde doğrudan sürüklenen tutamaçlar (döndür/kavis/koltuk±/sıra± vb.) eklendi, yan paneller daraltılabilir yapıldı. Düzeltme commit'i kendi ilk turunun 3 hatasını kapattı: sistematik kayma (bırakınca no-op olmayan tutamaç), semantik olarak yanlış `cols` tutamacı (artık `counts`/`taper` varken gizleniyor), tıkla-bırak sıçraması (3 piksellik eşikle çözüldü). |
| **A6.3** | `4bb0c8d` | Blok paneli 38 alanlık bir duvardı; 32 alanın 10'u varsayılan görünür, kalanı beş katlanır bölümde (Gelişmiş · Dış hat · Doğrusal dizi · Radyal dizi · Numaralandırma). Üç anlamlı "Taban" terimi Dış hatlar/Dış hat/Dış hat payı olarak ayrıştırıldı (UI + `rules.js` mesajları). |
| **A6.4** | `a6f5c35` | Tuvalde aynı anda 7 renk kaynağı yarışıyordu; tek `Renklendir` kanalı (Kat/Nitelik/Kapı/Doğrulama) getirdi, seçim vurgusu ve canlı sınır-ihlali/çakışma kanaldan bağımsız kalmaya devam ediyor. Mod şeridi (kat süzgeci/dizi önizleme/poligon) eklendi. `Esc` artık altı "normal olmayan" durumun HEPSİNDEN çıkıyor — önceden üçü sessizce hayatta kalıyordu. |
| **A7** | `c618242` | `const CSS` template literal'i `src/PlanEditor.jsx`'ten çıkıp `src/styles/tokens.css` (63 satır, tasarım token'ları + `.ed.dark`/`.ed.light` tema blokları) ve `src/styles/app.css` (392 satır, bileşen stilleri) oldu. Gerekçe: editör ile Biletera'nın diğer projesi ayrı depoda yaşıyor, tasarım sistemi ortak — `tokens.css` tek başına taşınabilir olsun diye ayrıldı. `main.jsx` CSS'i hem normal import eder hem `?raw` ile okuyup `cssText` prop'uyla `PlanEditor`'a geçirir (ikincisi `exportSVG()` için — indirilen SVG dosyası sayfanın stylesheet'ine erişemez, stili kendi içinde taşımalı). Ölü kural `.picklist li b.x` silindi (markup hiç `<b>` basmıyor). 296 kuralın seçicisi/bildirimi/sırası korunarak taşındığı bağımsız bir script'le doğrulandı (296/296 birebir). |
| **A6.5** | `5051cbe` | "Yeni plan" üç seçeneğe çıktı: **boş** · **stadyum** (14 blok · 3.138 koltuk · 14 kapı, 252 koltuk `cutVomitories()` ile tribünün İÇİNE oyulmuş — kapı tribünün üstüne kondurulmuş bir işaret değil) · **salon** (6 blok · 618 koltuk · 2 kapı, `tier()` ile radyal kademeler + sahne). `src/venues/templates.js`, mevcut `builders.js` yapı taşlarıyla kuruldu; şablondan doğan plan örnek salon değil kullanıcı planı (`p<timestamp>`), örnek ad alanına sızmıyor. Gerçek sıra-bağımlılığı hatası bulundu ve düzeltildi: `cutVomitories()` `withAccessible()`'dan ÖNCE çağrılırsa erişilebilirlik etiketi tünel kesimini eziyordu (16 kapı-koltuk çakışması, ölçülünce çıktı). `test/invariants/template-plans.test.js` (6 test) iki şablonu da `runRules()`'tan geçirip hiç `err` bulgu olmadığını ve kapı/işaretin hiçbir koltukla kesişmediğini doğruluyor. |

---

## 2. Korunan davranışlar

Her satır: **ne** korunuyor, **nasıl** doğrulanıyor, **şu an durumu**
(bu görev sırasında çalıştırılarak ölçüldü — bkz. §4).

| Davranış | Nasıl doğrulanıyor | Durum |
|---|---|---|
| Kapı/işaret koltuk üstünde değil | `test/invariants/door-marker-seat-overlap.test.js` (12 vaka) — koltuğun GERÇEK dikdörtgeni (tekerlekli koltukta 86cm dahil) ile kapının gerçek dikdörtgeni / işaretin dairesel alanının kesişimini 9 salonda tarar, >1cm² eşik. 3 "testin testi" (kapı/işaret koltuğun tam üstüne konunca kırmızı, uzaktaki yanlış alarm üretmiyor) yöntemi kanıtlıyor. | 9/9 salon temiz |
| Kat-içi + kat-arası çakışma yok | `test/invariants/footprint-overlap.test.js` (20 vaka) — `core/rules.js`'teki `footprint-overlap-same-level` (err) ve `footprint-overlap-cross-level` (warn — üretimde balkon sarkması meşru olabilir, ama 9 örnek salonda HİÇ olmaması gerekir) kurallarını çalıştırır. | 9/9 salon temiz |
| Koltuk kendi dış hattının içinde | `test/invariants/seat-within-block.test.js` (10 vaka) — `seat-in-own-block` kuralını 9 salonda çalıştırır; elle çizilmiş (foot), koltuklardan kopuk bir dış hat senaryosuyla testin testi. | 9/9 salon temiz |
| Kenar kırıklığı sınırlı ("testere dişi" değil) | `test/invariants/edge-smoothness.test.js` (15 vaka) — `buildMeta`'nın `leftEdge`/`rightEdge` zincirindeki GERÇEK (≥1°) dönüş **sayısını** ölçer (en büyük açıyı değil — aksi halde Zorlu B1-O'nun tek meşru ~76° kesimi yanlış alarm verirdi), 9 salonun 523 kenarında tavan 3 kırık. | 9/9 salon temiz (en kötü: Zorlu ORK-C, 3 kırık) |
| Saha/sahne açıklığı makul | `test/invariants/pitch-stage-clearance.test.js` (16 vaka) — kademeli tribün (rows≥3) için saha kenar/dip açıklığı 4-12m, courtside/loca (rows<3) için ayrı gevşek 100cm taban; sahne için tek taraflı 30cm alt sınır. | GS/ULKER (pitch) + 7 salon (stage) temiz |
| Tutamaç round-trip (sürüklemeden bırakmak no-op) | `test/invariants/handle-roundtrip.test.js` (12 vaka) — `handlesFor()`'un ürettiği HER tutamacı kendi duruş noktasından `handlePatch()`'e geri besler; `rows`/`curve`/`cols` TAM (1e-9), `rot`/`r0`/`aStart`/`aEnd` TEK-KUANTUM (1°/10cm) toleransla. | 9 salon × her blok × her tutamaç temiz (bağımsız ölçüm: 1.157 tutamaç, kuantumu aşan 0 — bkz. `f83f36a`) |
| Şablon planları (stadyum/salon) kural motorundan hatasız | `test/invariants/template-plans.test.js` (6 vaka) — `buildStadiumTemplate()`/`buildHallTemplate()`'in ürettiği planı `runRules()`'tan geçirir (hiç `err` bulgu yok), kapı/işaretin hiçbir koltukla kesişmediğini `door-marker-seat-overlap.test.js`'le AYNI hesapla (paylaşılan `seatCorners`/`outlineOverlapArea`) sınar, koltuk sayısının makul aralıkta kaldığını (stadyum <6.000, salon <1.200) doğrular. | 2/2 şablon temiz |
| Tasarım token'ları + POI ikonları yerinde | `test/invariants/design-assets.test.js` (30 vaka) — Biletera kırmızısı (#E30613), OLED zemin (#090909), Poppins, koltuk-boş token'ı `src/**/*.{js,jsx,css}`'te konumdan bağımsız aranır; `PlanEditor.jsx`'teki 20 POI ikon atfının `public/poi/*.png`'de birebir karşılığı var mı kontrol edilir. | 30/30 temiz |
| 9 salonun veri denkliği | `node scripts/check-golden.mjs` — 9 salon × 3 dosya (plan/seats/render) `test/golden/`'daki dondurulmuş referansla bayt-bayt karşılaştırılır. | 9/9 AYNI |
| Kural motoru tek kaynak | `npm run test:geometry` (`scripts/validate-venues.mjs`) — `core/rules.js`'teki 21 kuralı (aynı `runRules()`; `validate()`, bu betik ve canlı tuval üçü de bunu çağırır) 9 salonda çalıştırır, ayrıca `<PlanEditor/>`'ı `react-dom/server` ile gerçekten mount eder (derleme geçse de çalışma-anı hatası kaçabilir). | 9 salon temiz + mount hatasız |
| Şema göçü, örnek salon gölgeleme | `npm run test:interactions` (`scripts/validate-interactions.mjs`) — `Store` sürücü seçimi/önceliği (kv>ls>memory), hizalama kılavuzu (NaN regresyonu), `relabelPatch`, `core/schema.js`'in `migrate()` zinciri VE `mergeSavedVenues`/`isProtectedSample`/`forkSample`'ı sentetik senaryolarla sınar. `migrate()` ayrıca `test/unit/schema.test.js`'te (3 vaka) vitest katmanında da AYNI sözleşmeyle tekrar edilir (CI betiği silinmedi, ikinci bir hızlı katman eklendi). | temiz |

**Ayrıca** (görev tanımındaki listede yok, ama bu depoda gerçek koruma
altında olduğu doğrulanan davranışlar):

- **Geri al/yinele tutarlılığı** (A6.1'in kendi konusu) —
  `test/unit/reducer.test.js` (20 vaka): saf reducer'ın aynı girdiden HER
  ZAMAN aynı tek-geçişlik sonucu ürettiğini (React StrictMode'un çift
  çağrısına karşı), ok tuşuyla taşımadan sonra `future`'ın temizlendiğini
  (asıl A6.1 hatası — "yinele" artık terk edilmiş dalı diriltmiyor) kilitler.
- **`core/*` saf fonksiyonlar** — `test/unit/{geometry,polygon,labels,
  arrays,identity,solve}.test.js` (toplam 52 vaka): `parseCounts`,
  `offsetPoly`, `letterLabel`, `linearArray`/`radialArray`,
  `solveRadialTiers`/`solveBowlTiers` gibi düşük seviyeli sözleşmeleri
  ayrı ayrı kilitler.

---

## 3. Otomatik koruması OLMAYAN davranışlar

Dürüst olmak gerekirse, aşağıdakiler şu an sadece "kodun bugün yaptığı
şey" — hiçbir test onları kırmızıya döndürmez. Görev tanımındaki dört
adayın hepsi doğrulandı (gerçekten korumasız), artı kod okurken bulunan
beş madde daha:

1. **"Sığdır = %100 zum"** — `zoomToAll()` (`src/PlanEditor.jsx`) tüm
   bloklara `zoomToBBox` ile oturur, ekrandaki `%100` etiketi TANIM
   GEREĞİ bu görünüme göre hesaplanır. `zoomToAll`/`zoompct` adları
   `test/` veya `scripts/` içinde hiç geçmiyor — bir regresyon "tüm
   bloklar" yerine yanlışlıkla "görünen/süzülmüş bloklar"ı fit etmeye
   başlasa hiçbir test bunu yakalamaz.
2. **LOD eşiği (blok görünümü ↔ koltuk görünümü)** — `seatMode = shownSeats
   <= SEAT_BUDGET` (`SEAT_BUDGET = 3500`, `src/PlanEditor.jsx`). Bu sabitin
   değişmesi ya da anahtarın tamamen kırılması (`test`/`scripts` içinde
   `SEAT_BUDGET`/`seatMode` hiç geçmiyor) test edilmez.
3. **POI ikonlarının iki temada da görünmesi** — `design-assets.test.js`
   token/POI'nin sadece VAR OLDUĞUNU doğruluyor (bkz. §2); A7 token'ları
   `src/styles/tokens.css`'e taşısa da bu sınır değişmedi. Simgelerin koyu
   temada kaybolmaması, tuvaldeki `#poiTint`/`#poiTintSel` SVG filtresine
   (`feFlood` rengini `var(--bone)`/`var(--sel)`'den alıp PNG'nin
   alfasıyla birleştirir, `src/PlanEditor.jsx` ~2309-2313 ve ~3098) bağlı
   — bu filtrenin var olduğunu, doğru elemente bağlandığını ya da iki
   temada da yeterli kontrast ürettiğini kontrol eden hiçbir test yok.
4. **Yayın kilidi** (breach/collide varken Yayınla kapalı) — buton
   `disabled={breach.length > 0 || collide.length > 0}` (`src/PlanEditor.jsx`
   ~2820). Altındaki VERİ (`footprint-overlap-same-level`,
   `blocks-outside-boundary`) invariant testleriyle korunuyor, ama bu
   veriden butonun `disabled` durumuna giden TELİ hiçbir test sınamıyor —
   `validate-venues.mjs`'in mount testi bileşeni varsayılan (boş) haliyle
   açıyor, breach/collide'lı bir senaryoda butonun gerçekten kilitlendiğini
   iddia etmiyor.
5. **`Esc`'in altı durumu tutarlı temizlemesi** — tam da A6.4'ün konusu
   olan düzeltme (`src/PlanEditor.jsx`'teki `keydown` `useEffect`'i saf bir
   fonksiyona çıkarılmadı, `handlePatch` gibi test edilebilir değil).
   Birileri ileride `arrPrev`/`levelFilter`/`match`'ten birini tekrar
   atlarsa (tam da bu commit'in düzelttiği hata sınıfı) hiçbir test kırmızı
   dönmez.
6. **`Renklendir` kanal eşlemesi** (`chanColor`, `src/PlanEditor.jsx`) —
   "Doğrulama" kanalının gerçekten sadece breach/collide'ı, "Nitelik"in
   sadece nitelik atanmış koltukları vurguladığı gibi davranışlar
   bileşenin içinde tanımlı, dışa açılmış/test edilen bir fonksiyon değil.
7. **Daraltılabilir paneller ve mod şeridi UI durumu** (`toolsOpen`,
   `propsOpen`, `modeChips`) — hiçbir testte adları geçmiyor.
8. **`core/plan.js` (`diffPlans`/`planFingerprint`/`planSeatMap`)** — Sürüm
   penceresindeki "Fark" hesabının (kaç koltuk kimliği yok olacak, kaç
   yeni eklenecek, kaç koltuk 25cm+ taşınacak) VE üst bardaki "· değişiklik
   var" göstergesinin ta kendisi. `test/unit/` altında bu üç fonksiyon için
   TEK bir dosya yok — A1'de çekirdeğe taşındıkları günden beri hiç
   dedike testi olmadı. Kılavuzun §13'te "en kritik uyarı" dediği tam da
   bu hesap.
9. **SVG dışa aktarımının kendi stil kopyası** (A7'nin yeni yüzeyi) —
   `main.jsx`, `tokens.css` + `app.css`'i `?raw` ile okuyup `cssText`
   prop'uyla `PlanEditor`'a geçiriyor; `exportSVG()` bunu indirilen
   dosyanın kendi `<style>`'ına gömüyor (indirilen SVG, sayfanın
   stylesheet'ine erişemediği için). `cssText` adı `test/` içinde hiç
   geçmiyor: `validate-venues.mjs`'in mount testi `createElement(mod.
   default)`'ı hiç prop vermeden çağırıyor — `cssText` boş string'e
   düşse (main.jsx'teki kablo kopsa) bile mount testi yeşil kalır;
   indirilen SVG'nin `<style>`'ının gerçekten dolu olduğunu doğrulayan
   hiçbir test yok.

---

## 4. Nasıl koşulur

```bash
npm test                        # vitest (196 vaka) + test:geometry + test:interactions, sırayla
node scripts/check-golden.mjs   # 9 salonu tazeden üretip test/golden/ ile bayt-bayt karşılaştırır
npm run build                   # vite production build
```

`npm test` (`package.json`) üç adımı `&&` ile zincirler — biri kırmızı
dönerse (çıkış kodu ≠ 0) zincir orada durur, sonrakiler hiç çalışmaz:

1. `vitest run` → `test/unit/*.test.js` + `test/invariants/*.test.js`
2. `node scripts/validate-venues.mjs` → kural motoru + gerçek render
3. `node scripts/validate-interactions.mjs` → Store/hizalama/şema/gölgeleme

Davranış BİLEREK değiştiyse (yeni bir salon eklendi, geometri kasıtlı
düzeltildi) altın dosyaları yeniden üretmek için: `npm run snapshot:golden`
— bu, `check-golden.mjs`'in karşılaştıracağı referansı günceller, dikkatli
kullanın.
