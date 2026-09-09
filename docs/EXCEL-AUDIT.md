# Excel Akışı İncelemesi — 2026-09-08

## Düzeltilen Sorunlar

- `scan_spreadsheet({path})` yalnız tek görünür çalışma sayfası kabul eder.
  Çok görünür sayfalı dosya planı değiştirilmeden, sayfa adlarını içeren Türkçe mesajla reddedilir; gizli destek sayfaları atlanır.
- Birleşik hücre sınırları boş sütunlara uzansa da doğru ölçülür.
- İngilizce/Türkçe düz liste başlıkları aynı ayrıştırıcıdan geçer;
  farklı sayfalardaki aynı adlı bloklar birleştirilmez.
- Adlandırılmış alanların ortak hücreleri raporlanır ve derleme engellenir.
- Tuvalde sıra parçaları tek tek hücrelerin başlığa yakınlığıyla bölünmez.
  Başlık bandı, birleşik başlık merkezi ve koltuk dizisinin sınırı birlikte kullanılır.
- Ayrı sıra işareti sütunları okunur. Yalnız Excel satır indeksinden türetilen
  etiketler gerçek sıra numarası gibi tuvalde gösterilmez.
- İzole koltuk benzeri metinler `unresolvedCells` olarak döner. Bunlar ancak
  `excludedCells: [{sourceId, reason}]` ile açıklanır; çözümlenmeden doğrulama geçmez.
- Sayısal sıraya bağlı kısa parçalar korunur; kapasite satırları dışlanır.
- Varsayılan `normalized` düzeninde medyan yatay aralık 50, sıra aralığı 90
  editör birimine dönüşür. Bunlar şematik varsayımlardır, salonun ölçümü değildir.
- Çakışma gidermek için tüm planı tekrar tekrar büyütme kaldırıldı. Normalleştirilmiş
  düzende dar geçitler yalnız ilgili blokları öteleyerek açılır; ötelemeler raporlanır.
- `source` sayfa oranını korur ve başarısız geometriyi değiştirmeden reddeder.
- Global konumsuz listelerde `ring` açıkça seçilir; manifestodaki sıra içi boşluklar korunur.
- Doğrulama kimlik, blok, kat, sıra, koltuk etiketi, konum, eksik/fazla koltuk,
  silinen sahne ve sert geometri hatalarını kontrol eder. Yinelenen kimlikler
  bir Map içinde kaybolmaz; türetilmiş planların konum kontrolü de atlanmaz.
- Komut satırı Excel durumunu plansız taramadan itibaren süreçler arasında saklar.

## Doğrulamanın Anlamı

`verified`, kabul edilen kaynak verisinin üretilen taslağa tutarlı aktarılmasıdır.
`architecturalGeometryVerified` her zaman false: sayfa ölçüleri mimari ölçü değildir.
`normalized` ve `ring` kaynak geometrisi diye işaretlenmez. Eksik kapasite toplamı
`capacityChecked: false` ile belirtilir. Kaynak uyarıları sonuçta korunur.

## Bornova Kontrolü

Özgün dosyanın BİLETİNİAL sayfasında 24 blok ve 216 sırada 5.236 koltuk saptandı.
Eski akışın 5.237'nci koltuğu DQ55 hücresindeki `VİP 3500` notuydu.
Sıra parçalarının ve gerçek sıra işaretlerinin okunmasıyla yinelenen koltuk
eşleşmeleri sıfırlandı. Sahne ve tüm kabul edilen hücre konumları dönüştürülmüş
yerleşimle eşleşti; sert geometri hatası kalmadı.

## Kalan Sınırlar

Başlık bandı ve dizi sınırıyla blok üyeliği çıkarımı hâlâ sezgiseldir; rastgele,
karışık yönlü veya düzensiz çalışma sayfaları için evrensel doğruluk kanıtı değildir.
Normalleştirme ortak eksen ölçeğini değiştirir; her aralığı bağımsız olarak eşitlemez.
Yerel geçit çözümü dikdörtgen zarflarla tutucudur; iç içe/kavisli bloklarda gereğinden
fazla boşluk bırakabilir. Çözülemeyen geometri atomik olarak reddedilir.
Kısa sayısal parçalar için komşu dolu sıra desteği gerekir. Tek başına duran belirsiz
bir koltuk metni inceleme gerektirir. Genel %99 otomasyon başarısı ölçülmüş değildir.

## Çalıştırılabilir Kontroller

`npx vitest run test/mcp/spreadsheet-scan.test.js test/mcp/spreadsheet.test.js test/mcp/spreadsheet-cli.test.js`

`npm test` ve `npm run build` genel regresyon ve üretim derlemesini kontrol eder.
