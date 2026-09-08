# Excel Referans İçe Aktarma Tasarımı

## Amaç

Codex'in müşterilerden gelen `.xls` ve `.xlsx` oturma manifestolarını ek
bir görsel API kullanmadan seat-plan-editor içinde düzenlenebilir taslaklara
dönüştürmesini sağlamak. Excel'den kesin olarak belirlenebilen her koltuğu,
sırayı, bloğu, boşluğu, etiketi ve toplamı korumak. Excel'de çizilmeyip yalnız
numaralandırmadan çıkarılan geometriler açıkça "türetilmiş" olarak bildirilecek.

## Desteklenen Excel Türleri

Tarayıcı, geometri üretmeden önce çalışma kitabını aşağıdaki türlerden biri
olarak sınıflandırır:

1. **Adlandırılmış alanlı plan**: Bir veya daha fazla sayfa mekânsal plan
   içerir; `BLOK001` gibi Excel adları blok hücre aralıklarını tanımlar.
   Adlandırılmış alanlar blok üyeliğinde, hücre konumları ise yerel geometride
   asıl kaynaktır.
2. **Tuval sayfası planı**: Yoğun bir çalışma sayfasında konumlandırılmış
   koltuk değerleri, blok etiketleri, birleşik başlıklar, dolgular, kenarlıklar
   ve boş koridorlar bulunur. Etiketler ile aynı stile bağlı koltuk bölgeleri
   blokları; hücre konumları geometriyi belirler.
3. **Bölüm manifestosu**: Her sayfa tek bir bölümü ve o bölümün yerel
   sıra/koltuk matrisini içerir; ancak genel konumları gösteren bir sayfa
   yoktur. Yerel geometri hücrelerden alınır. Sayısal bölüm kodları, en küçük
   kod üst ortadan başlayacak şekilde saat yönünde oval bir halkaya dizilir.
4. **Düz liste**: Bir sayfada blok, sıra ve koltuk sütunları bulunur; fakat
   mekânsal hücre düzeni yoktur. Bu dosya doğrulama kaynağı olarak kullanılır.
   Kullanıcı türetilmiş halka düzenini açıkça seçmedikçe tek başına geometri
   oluşturmaz.

Sınıflandırma deterministiktir ve incelemesi için Codex'e döndürülür. İki tür
aynı derecede olasıysa sistem sessizce seçim yapmaz; `needsReview` ile durur.

## Odak Noktası Ve Yön

Genel yerleşim sayfasındaki `SAHNE`, `PERDE`, `FUTBOL SAHASI`, `BASKETBOL
SAHASI`, `OYUN ALANI` veya eş anlamlı açık etiketler planın odak noktasıdır.
Etiket birleşik, dolgulu veya kenarlıklı bir hücre bölgesindeyse bu bölgenin
sınırları odak şeklinin kaynak geometrisi kabul edilir. Yalnız tek hücrelik bir
etiket varsa hücre merkezi yön referansı olur; kanıtlanmış bir genişlik ve
yükseklik bulunmadığı için fiziksel şekil üretilmez.

Blokların konumu ve dönüşü odak noktasına göre değil, kaynak hücre
koordinatlarından ölçülür; odak noktası bu koordinatların yönünü ve anlamını
doğrular. Böylece sahnenin solundaki blok solda, karşısındaki blok karşıda kalır
ve bütün plan kaynak sayfadaki göreli yerleşimini korur. Birden fazla bağımsız
odak adayı varsa veya etiket ile çizili alan çelişiyorsa derleme başlamadan
`needsReview` döner.

## Ayrıştırma Ve Sınırlar

Eski OLE `.xls` ve OOXML `.xlsx` dosyaları için `@e965/xlsx` kullanılacak.
Ayrıştırma tamamen yerelde yapılır; makrolar ve dış bağlantılar çalıştırılmaz.

Sınırlar:

- En fazla dosya boyutu: 25 MB.
- En fazla çalışma sayfası: 200.
- En fazla dolu hücre: 1.000.000.
- En fazla üretilecek koltuk: 100.000.
- Parolalı, makroya bağımlı veya okunamayan dosyalar plan oluşturulmadan ya da
  mevcut plan değiştirilmeden açık bir hatayla reddedilir.

Hücre koordinatları, varsa gerçek sütun genişlikleri ve satır yükseklikleriyle;
yoksa Excel varsayılanlarıyla hesaplanır. Gizli satır ve sütunlar normalde yok
sayılır. Ancak bir blok alanı gizli fakat dolu hücreleri açıkça kapsıyorsa bu
hücreler inceleme gerektiren veri olarak raporlanır.

## Kaynak Önceliği

Kanıtlar şu sırayla değerlendirilir:

1. Adı normalize edildiğinde blok/bölüm anlamı taşıyan Excel adlandırılmış
   alanları.
2. Açık blok etiketleri, birleşik etiketler ve koltuk bölgelerine başvuran özet
   formülleri.
3. Stil, düzenli aralık ve bağlı sıra segmentleriyle gruplanan tekrar eden
   koltuk hücreleri.
4. Çalışma sayfası adları ve sayısal bölüm sırası.

Üst sıradaki kanıt, alt sıradaki bileşenleri bölebilir veya etiketleyebilir;
ancak kaynakta dolu bir hücresi olmayan koltuk üretemez. Dekoratif toplamlar,
başlıklar, sıra sayaçları ve özet tablolar; formül başvuruları, stil sıklığı ve
koltuk bölgelerinden uzaklıkları kullanılarak dışlanır.

Koltuk adayı değerler sayısal etiketleri ve `A12` gibi harf-rakam değerlerini
kapsar. Tarayıcı sıra ve koltuk parçalarını yalnız desen kesin olduğunda ayırır.
Aksi halde özgün değeri kaynak kimliği olarak korur ve sırayı inceleme için
işaretler.

## Excel Tarama Sözleşmesi

Yeni `scan_spreadsheet({ path })` aracı aşağıdaki yapıda geçici bir tarama
oluşturup oturumda saklar:

```json
{
  "scanId": "sheet-scan-...",
  "family": "named-range-plan",
  "workbook": "manifest.xlsx",
  "seatCount": 4134,
  "focal": {
    "type": "stage",
    "label": "SAHNE",
    "bbox": { "x": 900, "y": 20, "w": 600, "h": 160 },
    "confidence": 1
  },
  "groups": [
    {
      "groupId": "group-1",
      "sheet": "Plan",
      "suggestedLabel": "BLOK 201",
      "source": "named-range",
      "rows": [
        {
          "rowId": "row-1",
          "suggestedLabel": "A",
          "seatIds": ["A1", "A2"],
          "centers": [[120.5, 80.0], [150.5, 80.0]],
          "confidence": 1,
          "needsReview": false
        }
      ]
    }
  ],
  "totals": [{ "label": "TOPLAM KAPASITE", "value": 4134 }],
  "conflicts": [],
  "needsReview": []
}
```

Ham dosya yolu kullanıcıya gösterilen çıktılarda tekrar edilmez. Tarama yalnız
MCP oturumunda yaşar ve kalıcı plan şemasına yazılmaz.

## Anlamsal Onay

Yeni `submit_spreadsheet_analysis({ scanId, venueKind, groups?, layout? })`
aracı eklenecek. Codex etiket ve kat adlarını düzeltebilir; bulunan koltuk
hücrelerini veya yerel konumlarını değiştiremez.

`layout` seçenekleri:

- `source`: Adlandırılmış alanlı ve tuval sayfası planlarında zorunludur;
  çalışma sayfasındaki koordinatları korur.
- `ring`: Bölüm manifestolarında varsayılandır; sayısal bölümleri oval bir
  halkada saat yönünde sıralar. Bu geometri kalıcı plan şemasında değil, geçici
  doğrulama durumunda `inferredFrom: "section-order"` olarak işaretlenir.

Bulunan her grup kabul edilmeli veya kaynağa dayalı bir gerekçeyle dışlanmalıdır.
Çözülemeyen her belirsizlik ve yinelenen koltuk kimliği derlemeden önce açıkça
çözülmelidir. Excel formüllerindeki uyuşmazlıklar, kullanıcı hangi kaynağın
asıl kabul edileceğini seçse bile görünür kalır.

## Deterministik Derleme

Yeni `build_spreadsheet_layout()` aracı eklenecek.

Kaynakta konumlandırılmış planlarda hücre merkezleri, komşu koltuklar arasındaki
medyan uzaklık 50 cm olacak biçimde tek bir ölçekle editör koordinatlarına
çevrilir. Düz sıra segmentleri mevcut `grid`, ortak merkezli kavisli segmentler
mevcut `fan` bloklara derlenir. Her koltuk `ov` düzeltmesiyle ölçülen hücre
merkezine taşınır. Bir sıra içindeki boş hücreler boşluk olarak korunur; komşu
koltukların numarası değiştirilmeden kaldırılmış/boşluk düzeltmesiyle gösterilir.
Kaynakta sınırları belirlenmiş odak bölgesi mevcut `stage`, `screen` veya `pitch`
şekline dönüştürülür. Bütün bloklar ve odak şekli aynı dönüşüm matrisini
kullandığından kaynakta aralarındaki mesafe, yön ve göreli konum değişmez.

Bölüm manifestolarında her sayfanın yerel hücre geometrisi korunur ve bölüm
çakışmasız bir yelpaze dilimine oturtulur. Bölüm kodları saat yönündeki sırayı,
en küçük sayısal kod ise üst orta başlangıcı belirler. Bütün bölüm dış hatları
normal koridor açıklığını sağlayana kadar halka yarıçapı büyütülür. Excel'de
açıkça bulunmayan odak şekli, kapı, sınır, erişilebilir alan veya koridor
üretilmez.

Derleme geçici plan üzerinde yapılır. Mutasyon engelleyici bulgular sıfır
olduktan sonra aktif oturum ve canlı editör tek seferde güncellenir. Başarısızlık
mevcut planı değiştirmez.

## Doğrulama

Yeni `verify_spreadsheet()` aracı eklenecek. Başarı için şu koşulların tamamı
sağlanmalıdır:

- Kabul edilen her kaynak koltuğu planda tam bir koltuğa karşılık gelmeli.
- Fazladan plan koltuğu bulunmamalı.
- Blok, sıra ve koltuk sayıları kabul edilen Excel analiziyle eşleşmeli.
- Kaynak koordinatlı planlarda koltukların en az %99'u, medyan kaynak koltuk
  aralığının 0,35 katı içinde bulunmalı.
- Kaynakta sınırları ölçülmüş odak öğesinin bbox IoU değeri en az 0,90 olmalı;
  yalnız etiketi bulunan odak öğesi için merkez ve yön eşleşmesi raporlanmalı.
- Bölüm manifestolarında yerel sıra şekli ve koltuk sırası eksiksiz korunmalı;
  global konum kaynak doğrulamalı değil, türetilmiş olarak bildirilmeli.
- Yinelenen kaynak kimliği bulunmamalı.
- Mevcut sert geometri ve veri bütünlüğü engelleri sıfır olmalı.
- Excel'deki açık toplamlar bulunan toplamla eşleşmeli veya seçilen uyuşmazlık
  çözümü iki değeri de göstererek raporlanmalı.
- Excel'de bulunmayan fiziksel bir nesne eklenmemiş olmalı.

Sonuç `verifiedSourceGeometry` ile `verifiedInferredLayout` durumlarını ayrı
gösterir. Arayüz ve Codex sonuç raporu, türetilmiş bir halkayı mimari olarak
doğrulanmış mekân diye tanımlayamaz.

## MCP Durum Makinesi

Excel modu şu sırayı kullanır:

```text
no-plan
-> spreadsheet-scanned
-> spreadsheet-semantics-ready
-> spreadsheet-compiled
-> spreadsheet-verified
```

`scan_spreadsheet`, `create_plan` işleminden önce çalışır. Geçersiz veya
desteklenmeyen dosyalar plan listesinde boş plan bırakmaz. Derleme, açıkça
verilmiş kullanıcı adından veya Excel dosya adından yeni plan adını üretir.
Excel modu, doğrulama tamamlanana veya kullanıcı içe aktarmadan açıkça vazgeçene
kadar düşük seviyeli mutasyon araçlarını engeller.

`editor_capabilities`; kabul edilen uzantıları, Excel sınırlarını, algılanan
türü, mevcut fazı, sıradaki izinli araçları ve kaynak/türetilmiş geometri
ayrımını döndürür. MCP sistem promptu Codex'e dosyayı incelemesini, yalnız
raporlanan belirsizlikleri çözmesini, derlemesini ve doğrulamasını söyler;
Excel dosyalarını görsel referans akışına göndermez.

## Uygulama Dosya Yükleme

Mevcut yükleme uç noktası `.xls` ve `.xlsx` kabul edip
`kind: "spreadsheet"` döndürür. Tarayıcı MCP/sohbet köprüsüne yalnız sunucuda
kaydedilen yolu iletir; kullanıcıya özgün dosya adını gösterir. Dosya içeriği
ve geçici tam yol sohbet geçmişine yazılmaz. Mevcut görsel, CSV ve JSON
davranışı değişmez.

## Hata Yönetimi

- Desteklenmeyen veya bozuk Excel: Plan oluşturulmadan reddedilir.
- Belirsiz Excel türü: Kanıtlar gösterilir ve kullanıcıdan tek karar istenir.
- Yinelenen koltuk kimliği: Derleme durdurulur ve sınırlı sayıda örnek verilir.
- Toplam uyuşmazlığı: Formül toplamı ile bulunan toplam gösterilir; derlemeden
  önce asıl kaynağın `cells` veya `summary` olduğu belirtilmelidir.
- Etiketsiz bağlı bileşen: Ölçülen koltuklar korunur; etiket verilmesi veya
  açıkça dışlanması istenir.
- Derleme sonrası blok çakışması: İşlem geri alınır ve ilgili kaynak grupları
  bildirilir.

## Testler

Dört Excel türü için üretilmiş test dosyaları eklenecek. Test kapsamı:

- `.xls` ve `.xlsx` çözümleme.
- Adlandırılmış blok alanları ve birden fazla aralıktan oluşan adlar.
- Sayısal ve harf-rakam koltuk algılama.
- Sahne, perde, futbol sahası ve basketbol sahası odak noktası algılama; birleşik
  hücre sınırı, tek hücre etiketi ve birden fazla aday senaryoları.
- Birleşik etiketler, stille ayrılan bölgeler, boş koridorlar, gizli hücreler ve
  özet tablo dışlama.
- Bölüm sayfası sıralaması ve çakışmasız türetilmiş halka yerleşimi.
- Yinelenen kimlikler, çelişkili toplamlar, bozuk dosyalar, sınırlar ve belirsiz
  sınıflandırma.
- Derleme başarısızlığında atomik geri alma.
- Kesin koltuk sayısı ve kaynak kimliği doğrulaması.
- Yükleme sınıflandırması ve dosya yolu gizleme.
- MCP durum geçişleri ve düşük seviyeli mutasyon engelleme.

Kullanıcının `Downloads` dizinindeki dosyalara test bağımlılığı oluşturmamak
için verilen üç Excel biçimi sentetik test dosyalarıyla temsil edilecek. Mevcut
testlerin tamamı, mekân geometri kontrolleri, etkileşim kontrolleri ve üretim
derlemesi yayım kapısı olarak korunacak.

## Kapsam Dışı

- Excel makrolarını çalıştırmak veya dış bağlantıları yenilemek.
- Excel hücrelerinde bulunmayan kapı, erişilebilirlik, duvar, sahne veya saha
  üretmek.
- Bölüm sırasından türetilen halka yerleşimini mimari doğrulukta göstermek.
- Yeni bir kalıcı plan şeması veya ikinci bir geometri motoru oluşturmak.
