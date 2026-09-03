# Oturma Planı Editörü — Kullanım Kılavuzu

Bu belge, editördeki **her düğmeyi, her alanı ve her aracı** tek tek anlatır.
Hiçbir önkoşul bilgi varsaymadan yazıldı — daha önce hiç oturma planı
çizmemiş biri de baştan sona okuyup uygulayabilir. Sonda, sıfırdan bir
sinema salonu planı kurduğumuz adım adım bir örnek var.

> **Not:** Editör 1024px'in altındaki pencerelerde (telefon, dar tarayıcı
> penceresi) kapanır ve "geniş bir çalışma alanı gerektirir" uyarısı
> gösterir. Masaüstünde, geniş bir pencerede kullanın.

---

## İçindekiler

1. [Ekranın genel yapısı](#1-ekranın-genel-yapısı)
2. [Üst bar](#2-üst-bar)
3. [Sol araç çubuğu](#3-sol-araç-çubuğu)
4. [Sağ panel — hiçbir şey seçili değilken](#4-sağ-panel--hiçbir-şey-seçili-değilken)
5. [Sağ panel — bir blok seçiliyken](#5-sağ-panel--bir-blok-seçiliyken)
6. [Sağ panel — birden çok blok seçiliyken](#6-sağ-panel--birden-çok-blok-seçiliyken)
7. [Sağ panel — bir şekil seçiliyken](#7-sağ-panel--bir-şekil-seçiliyken)
8. [Sağ panel — koltuk seçiliyken](#8-sağ-panel--koltuk-seçiliyken)
9. [Alt durum çubuğu](#9-alt-durum-çubuğu)
10. [Fare ve klavye davranışı](#10-fare-ve-klavye-davranışı)
11. [Klavye kısayolları — tam liste](#11-klavye-kısayolları--tam-liste)
12. [Ayarlar penceresi](#12-ayarlar-penceresi)
13. [Sürümler penceresi (yayınlama)](#13-sürümler-penceresi-yayınlama)
14. [Doğrulama raporu](#14-doğrulama-raporu)
15. [Sık karışan şeyler](#15-sık-karışan-şeyler)
16. [Adım adım: Bir sinema salonu planı oluşturmak](#16-adım-adım-bir-sinema-salonu-planı-oluşturmak)

---

## 1. Ekranın genel yapısı

Ekran 4 ana bölgeye ayrılır:

```
┌──────────────────────── ÜST BAR ─────────────────────────┐
├──────┬──────────────────────────────────┬────────────────┤
│ SOL  │                                  │   SAĞ PANEL    │
│ ARAÇ │           TUVAL (canvas)         │  (seçime göre  │
│ ÇUB. │                                  │   değişir)     │
│      │                                  │                │
├──────┴──────────────────────────────────┴────────────────┤
├──────────────────────── ALT DURUM ÇUBUĞU ─────────────────┤
```

- **Tuval**: Salonun kendisi burada çizilir. Santimetre cinsinden gerçek
  ölçekte çalışılır (1 koltuk ~45-55 cm genişliğinde çizilir).
- **Sağ panel**: Hiçbir şey seçili değilse plan geneli ile ilgili bilgiler
  (kat filtresi, blok listesi) gösterir. Bir blok/şekil/koltuk seçildiğinde
  o seçime özel düzenleme alanları burada belirir.
- Her değişiklik **otomatik kaydedilir** (üst bardaki "otomatik kayıt"
  yazısı). Dosya menüsünden "Kaydet" aramanıza gerek yok.

---

## 2. Üst bar

Soldan sağa:

| Öğe | Ne işe yarar |
|---|---|
| **Salon seçici** (açılır liste) | Hangi salon planı üzerinde çalıştığınızı seçer. Hazır örnek salonlar (stadyum, opera, bar vb.) ve sizin kaydettiğiniz planlar burada listelenir. "Yeni plan" boş bir tuval açar. |
| **"otomatik kayıt" / "kaydediliyor" / "kaydedildi" / "kaydedilemedi"** | Şu an yapılan değişikliğin kayıt durumu. Kırmızı "kaydedilemedi" görürseniz tarayıcının depolama alanı dolu ya da engellenmiş olabilir. |
| **"taslak" / "v3 · yayında"** | Planın **yayın durumu**. Yeni açılan bir plan hep "taslak"tır. "Sürümler" penceresinden bir sürüm yayınlarsanız burada "v1 · yayında" gibi görünür. "· değişiklik var" ibaresi, son yayından beri plan üzerinde değişiklik yaptığınızı, henüz yayınlanmadığını anlatır. |
| **↶ Geri al** (⌘Z) | Son işlemi geri alır. Devre dışıysa (soluk görünüyorsa) geri alınacak işlem yok demektir. |
| **↷ Yinele** (⇧⌘Z) | Geri aldığınız işlemi tekrar uygular. |
| **Ayarlar** | Plan adı, koltuk kimlik şablonu, tema (açık/koyu), fare/trackpad davranışı, CSV/SVG dışa aktarma gibi plan-geneli ayarları açar. Bkz. [§12](#12-ayarlar-penceresi). |
| **Sürümler** | Planı "yayınlama" ve geçmiş sürümleri görme/karşılaştırma/geri yükleme penceresini açar. Bkz. [§13](#13-sürümler-penceresi-yayınlama). |
| **Doğrula** | Planı baştan sona tarar; sınır dışı koltuk, çakışma, kapısız blok gibi sorunları listeler. Buton üzerindeki kırmızı/turuncu rozet, son taramada kaç hata/uyarı bulunduğunu gösterir. Bkz. [§14](#14-doğrulama-raporu). |
| **Aç** | Bilgisayarınızdan bir `plan.json` dosyası yükler (daha önce bu editörden dışa aktarılmış bir plan). Yeni bir salon olarak listeye eklenir. |
| **plan.json** | Şu an açık planın **tamamını** (geometri + ayarlar + sürüm geçmişi) bir dosyaya indirir. Yedek almak ya da başka bir bilgisayarda devam etmek için kullanılır. Altlık görseli dosyaya dahil edilmez (sadece konumu kalır, görselin kendisi değil). |
| **seats.json** | Sadece **koltuk listesini** (her koltuğun kimliği, bloğu, sırası, numarası, niteliği) indirir. Biletleme sistemine verilecek olan dosya budur. |

---

## 3. Sol araç çubuğu

Bir araca tıklamak onu **etkinleştirir** (aktif araç mavi/vurgulu görünür).
Aracı bırakıp tekrar ok/seçim moduna dönmek için `V` tuşuna basın ya da
"Seç ve taşı"ya tıklayın. Her aracın sağındaki tek harf, o aracın klavye
kısayoludur (bkz. [§11](#11-klavye-kısayolları--tam-liste)).

### Genel

| Araç | Kısayol | Ne işe yarar |
|---|---|---|
| **Seç ve taşı** | `V` | Varsayılan araç. Blok/şekil/koltuk seçmek, sürükleyerek taşımak, tutamaçlarla döndürmek/boyutlandırmak için kullanılır. |
| **Kaydır** | `H` | Fareyle tuvalde gezinme (pan) modu. Boşluk tuşunu basılı tutmak da aynı işi yapar, aracı değiştirmenize gerek kalmaz. |

### Çiz

Yeni koltuk grupları oluşturur. Her biri tuval üzerinde **köşeden köşeye
sürükleyerek** çizilir; tam boyut önemli değildir, çizdikten sonra sağ
panelden santimetre cinsinden tam sayılar girersiniz.

| Araç | Kısayol | Ne işe yarar |
|---|---|---|
| **Izgara blok** | `G` | En sık kullanılan araç. Düz sıralar halinde dikdörtgen bir koltuk bloğu (tiyatro koltuğu, stadyum tribünü vb.) oluşturur. |
| **Yelpaze blok** | `F` | Merkezi bir noktadan yay çizen, kavisli sıralar oluşturur (amfitiyatro, stadyum köşesi gibi). |
| **Tek sıra** | `R` | Tek bir düz sıra çizer (örn. balkon ön sırası, loca). |
| **Masa** | `T` | Yuvarlak veya dikdörtgen bir masa + etrafına oturan koltuklar (restoran/gala düzeni). Sürüklemeye gerek yok, tıklamanız yeterli. |
| **Tek koltuk** | `S` | Diğerlerinden farklı: bir **ızgaraya bağlı olmayan**, istediğiniz yere tek tek bırakabileceğiniz bağımsız koltuklar oluşturur. Düzensiz VIP alanları, tek tük yerleştirilmiş koltuklar için. Her tıklama bir koltuk ekler; aynı bloğa eklemeye devam etmek için aynı bloğu seçili tutup tıklamaya devam edin. |

### Koltuk

| Araç | Kısayol | Ne işe yarar |
|---|---|---|
| **Koltuk düzenle** | `E` | **Var olan** bir bloktaki tek tek koltukları seçmenizi sağlar (yeni koltuk oluşturmaz — "Tek koltuk" ile karıştırmayın, bkz. [§15](#15-sık-karışan-şeyler)). Bir koltuğa tıklarsanız sadece o seçilir ve sürükleyerek hafifçe konumunu düzeltebilirsiniz. Boş bir noktadan sürüklerseniz bir seçim dikdörtgeni (marquee) açılır, içine giren tüm koltuklar seçilir. |
| **Nitelik boya** | `N` | Koltuklara **tekerlekli sandalye / refakatçi / görüş kısıtlı / teknik-kapalı** gibi nitelikler "boyar". Araç seçiliyken altta bir fırça paleti belirir (bkz. aşağı). Bir koltuğa tıklamak ya da üzerinden sürüklemek o niteliği anında uygular; boş alandan bir dikdörtgen çizerseniz içine giren tüm koltuklar boyanır. |

Nitelik boya paleti (araç seçiliyken solda görünür):

| Nitelik | Anlamı |
|---|---|
| **Tekerlekli** | Tekerlekli sandalye kullanıcısı için ayrılmış, geniş koltuk alanı. |
| **Refakatçi** | Tekerlekli sandalye kullanıcısının yanına oturacak refakatçi koltuğu. |
| **Görüş kıs.** | Sahne/saha görüşü kısmen engelli koltuk (örn. direk arkası). |
| **Kapalı** | Satışa kapalı / teknik kullanım (kamera platformu, ışık masası vb. yanı). |
| **Temizle** | Koltuğu "normal" haline döndürür, nitelik siler. |

> Nitelik, koltuğun **fiziksel gerçeğidir** — fiyat kategorisiyle karışmaz,
> bu editörde fiyat/kategori kavramı zaten yoktur (kapsam dışı, biletleme
> sisteminde yönetilir).

### Ortam

Koltuk olmayan ama salonun bir parçası olan öğeler.

| Araç | Kısayol | Ne işe yarar |
|---|---|---|
| **Şekil** | `D` | Sahne, duvar, kapı, perde, ayakta alan, saha (spor sahası) veya not gibi bir "şekil" çizer. Araç seçilince solda bir açılır liste belirir, önce **tip** seçersiniz, sonra tuvale sürüklersiniz. Tam liste aşağıda. |
| **Poligon** | `P` | Düzensiz, çok köşeli bir şekil çizer (örn. eğri bir duvar). Tuvalde tıklaya tıklaya köşe noktaları eklersiniz; `Enter`'a basmak ya da çift tıklamak şekli tamamlar. |
| **İşaret** | `I` | Haritadaki gibi küçük bir simge + isteğe bağlı etiket koyar (tuvalet, giriş, asansör, bar vb.). Araç seçilince solda simge listesi belirir. |

**Şekil tipleri** (Şekil aracıyla, açılır listeden seçilir):

| Tip | Ne için kullanılır |
|---|---|
| **Sahne** | Konser/tiyatro sahnesi. |
| **Saha** | Spor sahası (futbol, basketbol vb.) — seçince alt tarafta bir de spor dalı seçimi çıkar, saha çizgileri nizami ölçüde otomatik çizilir. |
| **Kapı** | Salona giriş/çıkış kapısı. Seçildiğinde sağ panelde **hangi blokların bu kapıdan girdiğini** işaretlersiniz — biletin üzerine basılacak "Kapı X" bilgisi buradan gelir. |
| **Duvar** | Salonun dış/iç duvar hattı. Sadece görsel çerçeve, koltuk hesaplamasını etkilemez. |
| **Perde** | Sinema perdesi / LED ekran. |
| **Ayakta alan** | Konserlerde ayakta izleyici alanı. Koltuk içermez, sadece bir kapasite sayısı girilir (bilet/kapasite hesabı için). |
| **Not** | Serbest metin notu (örn. "yapım aşamasında", "bu alan rezerve"). |

**İşaret simgeleri** (İşaret aracıyla): Tuvalet, Erkek WC, Kadın WC, Giriş,
Acil çıkış, Merdiven, Asansör, Yürüyen merdiven, Restoran, Bar, Büfe, Kafe,
Satış, İlk yardım, Engelli erişimi, Danışma, Bilet, Vestiyer, Uyarı, Işık,
Sigara alanı, Otopark.

### Referans

Salonun gerçek ölçülerini doğru kurmanıza yardım eden araçlar.

| Araç | Kısayol | Ne işe yarar |
|---|---|---|
| **Kalibre et** | `K` | Yüklediğiniz bir kat planı görseli (altlık) üzerinde, gerçek uzunluğunu bildiğiniz iki nokta arasını sürükleyip "gerçekte kaç metre" olduğunu yazarsınız; editör tüm görseli o ölçeğe göre otomatik büyütür/küçültür. Altlık yüklemeden bu aracın bir işlevi yoktur. |
| **Ölç** | `M` | Tuval üzerinde iki nokta arası mesafeyi metre cinsinden gösterir (durum çubuğunda mesaj olarak). Hiçbir şeyi değiştirmez, sadece ölçer. |

### Altlık yükle

Sol araç çubuğunun altında ayrı duran bir düğme. Bilgisayarınızdan bir
görsel (JPG/PNG — mimari kat planı, taslak, fotoğraf) yükler; bu görsel
tuvalin arkasına yarı saydam olarak yerleşir, üzerine gerçek koltukları
çizebilirsiniz. Yükledikten hemen sonra **Kalibre et**'i kullanmanız
önerilir (yoksa görsel gerçek ölçekte olmayabilir). Altlık sadece bu
tarayıcıda kalır; `plan.json` ile dışa aktarınca görsel dosyaya dahil
edilmez, sadece konumu/boyutu kalır.

Bir altlık yüklüyken tuvalin üstünde küçük bir kontrol çubuğu belirir:
bir kaydırıcı ile **saydamlığını** ayarlayabilir, "Kaldır" ile tamamen
silebilirsiniz.

---

## 4. Sağ panel — hiçbir şey seçili değilken

- **Kat / kuşak** açılır listesi *(salon birden fazla kat/kuşak içeriyorsa
  görünür)*: Tuvalde sadece seçtiğiniz kata ait blokları gösterir, diğerleri
  gizlenir. Karışık büyük salonlarda çalışmayı kolaylaştırır. "Tümü"
  hepsini gösterir.
- **Blok ara…** kutusu: Yazdığınız metni blok adı/etiketinde arar.
- **Bloklar listesi**: Salondaki tüm bloklar (ve altında şekiller) burada
  sıralanır, her birinin koltuk sayısı yanında görünür. Bir satıra
  **tıklamak** o bloğu seçer, **çift tıklamak** o bloğa yakınlaştırır.
  Shift'e basılı tutarak tıklarsanız birden fazla satırı birlikte
  seçebilirsiniz.

---

## 5. Sağ panel — bir blok seçiliyken

Tek bir blok (ızgara/yelpaze/masa/serbest) seçtiğinizde panelde şunlar
belirir:

**Üst kısım**
- **Blok adı** kutusu: Bloğun görünen adı (serbestçe değiştirilebilir).
- **"bloğa zumla"**: Tuvali bu bloğa ortalar/yakınlaştırır.
- **Kapı rozetleri**: Bu bloğun hangi kapı(lar)dan girildiğini gösterir.
  "Kapı atanmamış" turuncu uyarısı görüyorsanız, bir Kapı şekli ekleyip bu
  bloğu ona atamanız gerekir (bkz. [§7](#7-sağ-panel--bir-şekil-seçiliyken)).

**Temel bilgiler**

| Alan | Ne işe yarar |
|---|---|
| **Kimlik ön eki** | Bloğun kısa etiketi (örn. "A", "12", "Sol"). Koltuk kimliklerinin içine girer. Bunu değiştirmek, eğer blok adını hiç elle düzenlemediyseniz, blok adını da otomatik günceller. |
| **Kat / kuşak** | Bloğun ait olduğu kat/tribün/bölge adı (örn. "Alt Tribün", "Balkon"). Aynı ismi birden fazla blokta kullanırsanız hepsi aynı renk grubunda sayılır ve kat filtresinde birlikte görünürler. |
| **Yandan erişim** | İşaretliyse, bu bloğa bir koridordan (yandan) girilebildiği varsayılır. İşareti kaldırırsanız ("Kapalı (loca gibi)") blok bir loca gibi ele alınır — koltuklar arasında yürüme payı denetimi gevşer. |
| **Görünüm rengi** | Bloğun tuvaldeki rengi. "A" harfli düğme, kat/kuşağın varsayılan rengini kullanır; renk paletindeki bir kareye tıklayarak bloğa özel bir renk atayabilirsiniz. |
| **Varsayılan nitelik** | Bu bloktaki **tüm koltukların** varsayılan niteliğini toptan belirler (örn. tüm blok "Görüş kısıtlı"). Tek tek koltuk istisnaları "Nitelik boya" aracıyla üstüne yazılabilir. |

X/Y konumu ve döndürme burada **değil**, aşağıdaki **Gelişmiş** bölümündedir
— bkz. altta.

**Masa bloğu için ek alanlar** *(sadece Masa aracıyla oluşturulan bloklarda)*:
Biçim (Yuvarlak/Dikdörtgen), Kişi sayısı, Çap/Genişlik, Derinlik, Başlangıç
açısı (koltukların masanın neresinden başlayacağı), Sandalye payı (masa
kenarıyla koltuk arası boşluk).

**Geometri (cm)** *(ızgara ve yelpaze bloklarında)*:

Izgara için: **Koltuk aralığı** ve **Sıra aralığı** (koltuklar arası /
sıralar arası mesafe, santimetre), **Sıra başına ±** (her sırada kaç
koltuk eksiltip/artıracağını belirler — 0'dan büyükse arkaya doğru
genişleyen, negatifse daralan bir blok elde edersiniz).

Yelpaze için: **Mod** (Sabit açı dilimi / Sabit koltuk aralığı), **Sıra
aralığı**, **Koltuk aralığı** — Mod "Sabit koltuk aralığı" ise ayrıca
**Merkez açı**.

Her iki tip için ortak: **Sıra başına koltuk** — elle, sıra sıra koltuk
sayısı yazmak isterseniz (`"21..15"` = 21'den 15'e azalan bir dizi, ya da
`"5,5,6"` = üç sıraya tek tek sayı) buraya yazarsınız; boş bırakırsanız
yukarıdaki Koltuk/± değerleri geçerli olur. **Hizalama**, sıralar farklı
uzunluktaysa (± veya elle liste kullanıldığında) kısa sıraların bloğun
neresine (ortaya/sola/sağa) yaslanacağını belirler.

**Gelişmiş** *(açılır/kapanır bölüm, varsayılan kapalı)*: **X (cm)**, **Y
(cm)**, **Döndür °** — ve ızgarada ayrıca **Sıra**, **Koltuk**, **Kavis**
(sıraları yay gibi büker — stadyum/amfi hissi verir), yelpazede ayrıca
**Sıra**, **İlk yarıçap**, Mod "Sabit açı dilimi" ise de **Başlangıç/Bitiş
açısı**. Bunların hepsi artık seçili bloğun üstünde beliren tutamaçlarla
tuvalde doğrudan ayarlanabildiği için (bkz.
[§10](#10-fare-ve-klavye-davranışı)) panelde ikinci kez göstermek zorunlu
değil; buradaki alanlar klavyeden tam sayı girmek isteyenler içindir.
Bölüm kapalıyken de bir bloğun döndürülmüş ya da kavisli olduğunu fark
edebilesiniz diye, varsayılandan (0) farklı bir değer varsa başlıkta kısaca
belirtilir (örn. "15° döndürülmüş"). Açık/kapalı durumu oturum boyunca
hatırlanır — bir blokta açtıysanız başka bir blok seçtiğinizde de açık
kalır.

**Dış hat** *(açılır/kapanır bölüm)*: Bloğun altındaki fiziksel platform
sınırını gösterir/düzenler. Varsayılan olarak dış hat, koltuklardan otomatik
türetilir (etrafına bir pay bırakılır — **Dış hat payı** alanından
ayarlanır). Salonda gerçek bir sütun, merdiven boşluğu ya da düzensiz kenar
varsa **"Elle çiz"** ile tuvalde köşe köşe tıklayarak kendi dış hattınızı
çizebilir, "Otomatiğe dön" ile otomatik hale geri dönebilirsiniz.

**Doğrusal dizi / Radyal dizi** *(açılır/kapanır bölümler)*: Seçili
bloğun **kopyalarını** düzenli bir örüntüyle çoğaltır. Bölümü açtığınız an
tuvalde kesikli çizgilerle bir **önizleme** belirir; kapatınca önizleme
kaybolur, hiçbir kalıcı değişiklik yapılmamış olur — gerçekten çoğaltmak
için bölüm içindeki **"Doğrusal çoğalt" / "Radyal çoğalt"** düğmesine
basmanız gerekir.
- *Doğrusal*: Kopya sayısı + her kopyanın bir öncekine göre ΔX/ΔY (cm)
  kaymasını girersiniz. Örnek: 6 kopya, ΔX=1500 → yan yana 6 blok, her biri
  15 metre arayla.
- *Radyal*: Bir merkez nokta etrafında açısal olarak dizer (örn. bir
  stadyumun köşesini tekrar tekrar döndürerek tüm çemberi doldurmak).

**Numaralandırma** *(açılır/kapanır bölüm)*: Sıra ve koltuk numaralarının
nasıl üretileceği, iki alt başlık halinde:
- *Sıra etiketi*: Sıraların nasıl adlandırılacağı — Sayı (1,2,3…) / Harf
  (A,B,C…) / Özel liste, başlangıç değeri, ters sıralama, harfte I/O/Q gibi
  karıştırılabilecek harflerin atlanıp atlanmayacağı.
- *Koltuk numarası*: Koltukların nasıl numaralandırılacağı — Ardışık /
  Sadece tek / Sadece çift / Merkezden dışa doğru tek-çift (çoğu gerçek
  salonda koltuk 1 sağda değil ortada başlar, bu seçenek onu taklit eder),
  yön (soldan/sağdan), başlangıç numarası, atlanacak numaralar (örn. "13"
  numarasını hiç kullanma), ve numaranın sıra içindeki **hangi konuma**
  bağlı kalacağı (koltuğun dizideki sırasına göre mi, yoksa bloktaki sabit
  sütun konumuna göre mi — bu ayrım özellikle "Sıra başına koltuk" ile
  düzensiz sıralar kullanıldığında önemlidir).

**Alt düğmeler**
- **Aynala**: Bloğun bir aynadaki yansımasını oluşturur (simetrik salonlarda sağ tarafı sol taraftan türetmek için).
- **Çoğalt**: Bloğun aynı ayarlarla bir kopyasını oluşturur (hemen yanına biraz kaydırılmış olarak biter, sonra X/Y'den tam yerine taşırsınız).
- **Sil**: Bloğu tamamen kaldırır.
- **"N koltuk düzeltmesi · sıfırla"**: Bu blokta tek tek koltuklara elle yaptığınız tüm düzeltmeleri (konum kaydırma, nitelik, silme vb.) toplu olarak geri alır.

---

## 6. Sağ panel — birden çok blok seçiliyken

Shift'e basılı tutarak birden fazla bloğa tıkladığınızda ya da boş bir
alandan bloğun **tamamını içine alacak şekilde** bir dikdörtgen
çizdiğinizde (marquee — kısmen kesişen bloklar seçilmez, tamamı kutunun
içinde kalmalı) bu panel açılır:

- **Hizala**: Seçili blokları sola/sağa/üste/alta yasla ya da yatay/dikey
  ortala (6 düğme).
- **Yatay/Dikey eşit dağıt**: Aralarındaki boşlukları eşitler.
- **Doğrusal dizi / Radyal dizi**: Tek blok panelindekiyle aynı, ama tüm
  seçimi birlikte çoğaltır.
- **Toplu yeniden numaralandırma**: Seçili tüm bloklara, verdiğiniz
  başlangıç numarasından (ve isterseniz bir ön ekten) başlayarak, bir
  merkez noktaya göre açısal sırayla (saat yönü/tersi) yeni etiketler
  dağıtır. Büyük bir stadyumda 40 bloğu elle tek tek numaralamak yerine
  kullanılır.
- **Toplu değiştir**: Seçili tüm bloklara aynı anda yeni bir görünüm
  rengi, kat/kuşak adı ya da varsayılan nitelik atar.
- **Aynala / Sil**: Seçili tüm bloklara birden uygulanır.

---

## 7. Sağ panel — bir şekil seçiliyken

Bir Şekil, Poligon ya da İşaret öğesine tıkladığınızda:

- **Etiket** kutusu (üstte): Şeklin üzerinde/yanında görünen yazı.
- **Tip**: Şekli başka bir türe çevirir (örn. yanlışlıkla "Kapı" çizdiyseniz "Duvar"a çevirebilirsiniz — silip yeniden çizmenize gerek kalmaz).
- **Döndür °, X (cm), Y (cm)**: Konum ve açı.
- **Genişlik / Derinlik** (dikdörtgen şekillerde) ya da **Çap** (kapıda).
- **Yazı boyu**: Etiket yazısının punto ölçeği.
- **Kapasite** (sadece "Ayakta alan"da): O alanda kaç kişi durabileceği — koltuk üretmez, sadece bir sayı olarak kapasiteye eklenir.

**Kapı seçiliyken ek olarak:**
- **"Hizmet ettiği bloklar"** listesi: Hangi blokların bu kapıdan
  girildiğini işaretlediğiniz onay kutulu liste. Biletin üzerine
  basılacak kapı bilgisi buradan gelir.
- **"Tüm blokları en yakın kapıya ata"**: Elle tek tek işaretlemek yerine,
  editörün her bloğu coğrafi olarak en yakın kapıya otomatik atamasını
  sağlar. Çoğu zaman en hızlı yol budur; sonra istisnaları elle
  düzeltirsiniz.

**İşaret (simge) seçiliyken:** Hangi simge olduğunu değiştirebileceğiniz
bir simge ızgarası, boyutu ve döndürmesi.

**Saha seçiliyken:** Spor dalını değiştirebileceğiniz bir liste (ceza
sahası, çember gibi nizami çizgiler otomatik yeniden çizilir) ve dış
ölçüyü resmi ölçüsüne sıfırlayan bir düğme.

**Sil**: Şekli kaldırır.

---

## 8. Sağ panel — koltuk seçiliyken

"Koltuk düzenle" aracıyla **tek bir** koltuğa tıkladığınızda:

- **Konum düzeltmesi (cm)**: Bu **tek koltuğu** bloğun geri kalanından
  bağımsız olarak X/Y yönünde kaydırır ve döndürür — bir sütunun önündeki
  koltuğu birkaç santim kaydırmak gibi ince ayarlar için. Ayrıca bu
  koltuğa özel bir **Etiket** yazabilirsiniz (otomatik numaralamayı bu
  koltuk için geçersiz kılar).
- **Nitelik**: Bu tek koltuğun niteliğini bloğun genelinden farklı olarak
  ayarlar (örn. blok genelinde normal ama bu bir koltuk tekerlekli).
- **Boşluk**: Koltuğu görünmez yapar ama numarasını "yakar" (bir daha
  kullanılmaz) — gerçekte orada bir koltuk olmadığını ama numaralamanın
  atlanması gerektiğini belirtmek için (örn. bir sütunun tam önü).
- **Sil**: Koltuğu tamamen kaldırır; bu durumda numarası **geri
  verilir** (sıradaki koltuk o numarayı alabilir) — "Boşluk"tan farkı budur.
- **Sıfırla**: Konum/döndürme/etiket düzeltmelerini geri alır.

Birden fazla koltuk seçtiğinizde (marquee ile) panel şuna döner:

- **Nitelik ata**: Seçili tüm koltuklara aynı anda bir nitelik uygular.
- **Varlık**: Seçili koltukları toplu **Boşluk yap** / **Sil** / **Geri
  getir** (ilk haline döndür).
- **Düzeltmeleri sıfırla**: Konum, etiket ya da kimlik düzeltmelerini
  seçili tüm koltuklarda topluca siler.
- Not: Seçili koltukları ok tuşlarıyla hep birlikte kaydırabilirsiniz.

---

## 9. Alt durum çubuğu

Soldan sağa (her şey aynı anda görünmez, duruma göre belirir/kaybolur):

| Öğe | Ne işe yarar |
|---|---|
| Seçim özeti | "N blok · N koltuk seçili" gibi bir özet. |
| "koltuk görünümü" / "blok görünümü · yakınlaş" | Şu an tek tek koltukları mı yoksa sadeleştirilmiş blok dikdörtgenlerini mi gördüğünüzü söyler. Çok büyük bir salonda uzaktan bakarken performans için bloklar sadeleştirilir; yakınlaştıkça (özellikle görünen alandaki koltuk sayısı azaldıkça) otomatik olarak tek tek koltuklara geçilir. Elle açılıp kapanan bir anahtar değildir. |
| Kırmızı "N blok salon sınırı dışında" uyarısı | Bir veya daha fazla blok, salonun `home` sınırlarının dışına taşmış. Tıklarsanız o blokları seçer, böylece kolayca bulup içeri çekebilirsiniz. Bu uyarı varken plan **yayınlanamaz**. |
| Mesaj alanı | Son işlemin sonucu (örn. "24 koltuk boyandı") ya da bir hata mesajı (kırmızı, kalın) burada kısaca belirir. |
| **Yapış** kutucuğu + adım seçici (10cm/25cm/50cm/1m) | İşaretliyken, blokları sürüklerken/ok tuşlarıyla kaydırırken konum bu adıma yuvarlanır — elle santim santim hizalamak yerine düzenli bir ızgaraya "yapışır". `Y` tuşuyla açıp kapatabilirsiniz. |
| Fare altındaki koltuk kimliği | Fareniz bir koltuğun üzerindeyken o koltuğun kimliğini gösterir. |
| Koordinat | Farenin tuval üzerindeki konumunu metre cinsinden gösterir. |
| Ölçek çubuğu | Ekrandaki bir çizginin gerçekte kaç metre olduğunu gösterir (yakınlaştıkça/uzaklaştıkça otomatik güncellenir). |
| **Dış hatlar** düğmesi | Tüm bloklarının altına, renkli yarı saydam bir dış hat/platform anahatı çizer — blokların gerçek fiziksel sınırlarını topluca görmek için. Bloğun kendi panelindeki "Dış hat" bölümüyle aynı geometriyi gösterir, sadece topluca ve sadece görünürlük anahtarı olarak (hiçbir şeyi düzenlemez). |
| **Lejant** düğmesi | Tuvalin üzerine, kat/kuşak renklerini ve tekerlekli/refakatçi koltuk sayılarını özetleyen küçük bir kutu açar/kapatır. Varsayılan olarak kapalıdır (gereksiz yer kaplamasın diye); gerektiğinde açıp tekrar kapatabilirsiniz. |
| **− / yüzde / +** | Uzaklaştır / yakınlaştır düğmeleri ve aradaki **zum yüzdesi**. Yüzde, salonun kendi varsayılan (Sığdır) görünümüne göre hesaplanır — %100, "bu salon tamamen ekrana sığmış" demektir; salonun fiziksel büyüklüğüyle ilgisi yoktur (47 koltuklu bir barla 50.000 koltuklu bir stadyum aynı anda %100 gösterebilir). Yüzdeye **tıklamak** görünümü tam %100'e (Sığdır ile aynı sonuca) sıfırlar. |
| **Sığdır / Seçime zumla** | Tek bir düğme: bir seçiminiz varsa sadece ona yakınlaşır ve düğme "Seçime zumla" yazar; seçim yoksa tüm plana (kenarlarda biraz boşluk bırakarak) oturtur ve "Sığdır" yazar. Kaybolan/ekran dışına taşmış bir bloğu bulmanın en hızlı yolu, seçimi temizleyip buna basmaktır. |

---

## 10. Fare ve klavye davranışı

- **Tek tıklama** (Seç aracıyla) bir blok/şekil seçer. Boş bir noktaya
  tıklamak seçimi kaldırır.
- **Shift + tıklama** seçime ekler/çıkarır (birden fazla öğeyi tek tek
  seçmek için).
- **Sürükleme** (bir bloğun/koltuğun üzerinden başlarsa) onu taşır. **Boş
  bir noktadan** başlarsa bunun yerine bir **seçim dikdörtgeni (marquee)**
  açar; bıraktığınızda dikdörtgenin **tamamen içinde kalan** bloklar
  seçilir (kısmen kesişenler seçilmez).
- Bir blok seçiliyken üstünde beliren **döner ok simgesi** onu
  döndürmenizi, köşesindeki **küçük daire** boyutunu (sıra/koltuk
  sayısını) değiştirmenizi sağlar — sürükleyerek kullanılır.
- Sürüklerken yakındaki başka bloklarla hizalanınca kısa **kırmızı
  kılavuz çizgileri** belirir (kenar/merkez hizası) — bunlara "yapışarak"
  bırakırsanız tam hizalı kalır.
- **Fare tekerleği / trackpad** ile yakınlaşıp uzaklaşabilir, iki parmakla
  kaydırabilirsiniz (Ayarlar'dan bu davranışı fare/trackpad'e göre elle de
  ayarlayabilirsiniz, bkz. [§12](#12-ayarlar-penceresi)).
- **Boşluk tuşunu** basılı tutmak, hangi araç seçili olursa olsun geçici
  olarak kaydırma (pan) moduna geçirir — bırakınca eski araca döner.

---

## 11. Klavye kısayolları — tam liste

| Tuş | Ne yapar |
|---|---|
| `V` | Seç ve taşı aracı |
| `H` | Kaydır aracı |
| `G` | Izgara blok |
| `F` | Yelpaze blok |
| `R` | Tek sıra |
| `T` | Masa |
| `S` | Tek koltuk (yeni bağımsız koltuk ekler) |
| `E` | Koltuk düzenle (var olan koltukları seçer) |
| `N` | Nitelik boya |
| `D` | Şekil |
| `P` | Poligon |
| `I` | İşaret |
| `K` | Kalibre et |
| `M` | Ölç |
| `Y` | Izgaraya yapışmayı aç/kapat |
| `Boşluk` (basılı tut) | Geçici kaydırma modu |
| `⌘Z` / `Ctrl+Z` | Geri al |
| `⇧⌘Z` / `Ctrl+Shift+Z` | Yinele |
| `⌘A` / `Ctrl+A` | Görünen (kat filtresine uyan) tüm blokları seç |
| Ok tuşları | Seçili blok/şekil/koltuğu 1 cm kaydırır |
| `Shift` + Ok | 10 cm kaydırır |
| `Alt` + Ok | O anki ızgara adımı kadar kaydırır |
| `Delete` / `Backspace` | Seçili bloğu/şekli siler; seçili tek bir koltuksa onu "sil" olarak işaretler |
| `Enter` | Çizilmekte olan bir dış hat/poligonu tamamlar |
| `Esc` | O an süren çizimi iptal eder; hiçbir şey çizilmiyorsa seçimi temizler, açık pencereleri (Doğrulama raporu, Ayarlar) kapatır |

> Bu kısayollar bir metin kutusuna yazı yazarken **çalışmaz** (harfleriniz
> normal şekilde kutuya girer).

---

## 12. Ayarlar penceresi

Üst bardaki "Ayarlar" düğmesiyle açılır.

- **Plan adı**: Salon seçicide görünen isim.
- **Koltuk kimliği şablonu**: Her koltuğun benzersiz kimliğinin (id)
  hangi parçalardan oluşacağını belirleyen bir kalıp (örn.
  `{blok}-{sıra}{koltuk}`). Altındaki küçük düğmelerle kalıba token
  ekleyebilir, "sıfırla" ile varsayılana dönebilirsiniz. Değişiklik anında
  altta bir örnek kimlik gösterir.
- **Koltuk listesi yükle (CSV)**: Salon zaten başka bir sistemde
  satışa açıksa ve o sistemin **kendi koltuk kimlikleri** varsa, o listeyi
  (CSV) buradan yüklersiniz. Editör blok/sıra/koltuk numarasına göre
  eşleştirme yapıp size bir rapor gösterir; onayladığınız koltuklara o
  dıştaki kimlikleri "benimsetebilirsiniz" (çizim değişmez, sadece
  kimlikler güncellenir). Bu, editörde çizdiğiniz plan ile halihazırda
  satılmış biletlerin koltuk kimliklerinin **uyuşmasını** sağlamak
  içindir.
- **Planlar**: **Yeni** (boş bir plan açar), **Kopyala** (şu anki planın
  aynısından yeni bir kopya oluşturur — büyük bir değişikliği denemeden
  önce güvenli bir yedek almak için idealdir), **Sil** (şu anki planı
  kalıcı olarak siler; son kalan tek planı silemezsiniz).
- **Görünüm → tema**: Açık / Koyu / Sistem (işletim sisteminin
  tercihini izler).
- **Görünüm → Tekerlek davranışı**: Fare tekerleği ile trackpad'in kaydırma
  hareketini editörün nasıl yorumlayacağı. "Otomatik" çoğu durumda doğru
  tahmin eder; yanlış davranıyorsa elle "Trackpad" ya da "Fare" seçin.
- **Çıktılar → CSV**: Koltuk listesini basit bir CSV dosyası olarak
  indirir (kimlik, kat, blok, sıra, koltuk). `seats.json`'dan farkı,
  Excel'de kolayca açılabilecek düz bir tablo olmasıdır.
- **Çıktılar → SVG**: Şu an ekranda görünen alanın vektörel bir çizimini
  indirir — mimara/salona onay için göndermeye uygundur.

---

## 13. Sürümler penceresi (yayınlama)

Üst bardaki "Sürümler" düğmesiyle açılır. Bu editördeki "yayınlama"
kavramı şudur: siz plan üzerinde istediğiniz kadar deneme/değişiklik
yapabilirsiniz (buna **taslak** denir); bir noktada "artık bu hali
kesinleşti, biletleme sistemine bu gitsin" dediğinizde bir **sürüm**
oluşturursunuz. Geçmiş sürümler asla değişmez, hep geri dönülebilir.

- Üstte, salonun sınır dışı bloğu varsa kırmızı bir uyarı çıkar ve
  **Yayınla** düğmesi bu düzeltilene kadar devre dışı kalır.
- **Sürüm notu** kutusuna kısa bir açıklama yazıp (örn. "yan localar
  eklendi") **Yayınla**'ya basarsınız; bu, o andaki tüm planın bir
  "fotoğrafını" alır ve `v1`, `v2`… diye numaralandırır.
- Sürüm listesindeki her satırda:
  - **Fark**: O sürümle şu anki taslağı karşılaştırır — kaç koltuk
    kimliğinin **yok olacağını** (zaten satılmış bir bilete karşılık
    gelebileceği için en kritik uyarı budur), kaç yeni koltuk eklendiğini,
    kaç koltuğun 25 cm'den fazla yer değiştirdiğini, kaç koltuğun
    kategori/niteliğinin değiştiğini gösterir.
  - **Geri yükle**: Taslağı o sürümdeki haline **döndürür** (şu anki
    taslaktaki kaydedilmemiş değişiklikler kaybolur — dikkatli kullanın).

---

## 14. Doğrulama raporu

Üst bardaki "Doğrula" düğmesiyle açılır; tüm planı tarar ve bulduğu
sorunları listeler. Her satır bir renkle işaretlenir:

- 🔴 **Hata (err)**: Mutlaka düzeltilmesi gereken, satışı/yayını
  engelleyebilecek sorunlar (örn. salon sınırının dışına taşmış koltuk,
  üst üste binen koltuklar, çakışan dış hat alanları).
- 🟡 **Uyarı (warn)**: Kesin bir hata değil ama gözden geçirilmeli (örn.
  dar yürüme payı, kapı atanmamış blok, aynı etiketi paylaşan iki blok).
- ⚪ Bilgi (info) / ✅ Tamam (ok): Bilgilendirme amaçlı satırlar.

Bir satırın **yanında/üzerinde imleç değişip tıklanabilir görünüyorsa**,
tıklamak ilgili blok(lar)ı seçer ve tuvali oraya yakınlaştırır — sorunu
elle aramanıza gerek kalmaz. Üst bardaki Doğrula düğmesinin üzerindeki
küçük rozet, son taramadaki hata (kırmızı) veya uyarı (turuncu) sayısını
gösterir; plan değiştikçe otomatik güncellenmez, tekrar "Doğrula"ya
basmanız gerekir.

---

## 15. Sık karışan şeyler

Bu editörde birkaç yerde **aynı kelime, farklı iki şey** için kullanılıyor.
Kafanız karışırsa buraya bakın:

1. **"Tek koltuk" (S) ≠ "Koltuk düzenle" (E)**
   - **Tek koltuk**: **yeni**, bağımsız (ızgaraya bağlı olmayan) koltuklar
     **oluşturur**.
   - **Koltuk düzenle**: var olan bir bloktaki koltukları **seçer/taşır**,
     yeni koltuk oluşturmaz.

2. **Doğrusal/Radyal Dizi "önizlemesi" ile gerçek çoğaltma farklı
   şeylerdir.** Bölümü açtığınızda gördüğünüz kesikli hayalet-kopyalar
   sadece bir önizlemedir; bölümü kapatırsanız hiçbir kalıcı değişiklik
   olmaz. Gerçekten kopya oluşturmak için bölüm içindeki **"Doğrusal
   çoğalt" / "Radyal çoğalt"** düğmesine basmanız şarttır.

3. **Nitelik ≠ Kategori/Fiyat.** Bu editörde koltuğa fiyat ya da satış
   kategorisi **atanmaz** — bu bilinçli bir tasarım kararıdır, o iş
   biletleme sisteminde yapılır. Buradaki "Nitelik" sadece koltuğun
   **fiziksel gerçeğini** (tekerlekli, görüş kısıtlı vb.) tanımlar.

4. **plan.json ≠ seats.json.** `plan.json` düzenlemeye devam etmek için
   bir **yedek/kaynak** dosyasıdır (bu editöre geri yüklenebilir).
   `seats.json` ise **biletleme sistemine verilecek** son koltuk
   listesidir; bu editöre geri yüklenmez.

---

## 16. Adım adım: Bir sinema salonu planı oluşturmak

Bu bölümde, ortasında bir koridor olan, 120 koltuklu, tek perdeli basit
bir sinema salonu kuracağız. Tüm sayılar gerçekçi ölçülerdir (koltuk
aralığı 55 cm, sıra aralığı 105 cm — geriye yaslanan sinema koltuğu için
tiyatroya göre biraz daha geniş).

### Adım 1 — Boş bir plan aç

Üst bardaki salon seçiciden **"Yeni plan"**ı seçin. Tuval bomboş
gelecek, sol altta "Boş tuval" yazacaktır.

### Adım 2 — Sol bloğu çiz

1. Sol araç çubuğundan **Izgara blok** (`G`) aracına tıklayın.
2. Tuval üzerinde herhangi bir yerde, köşeden köşeye kabaca bir dikdörtgen
   sürükleyin (tam boyut önemli değil, birazdan tam sayılarla
   düzelteceğiz). Bırakınca blok otomatik seçilecek ve sağda paneli
   açılacaktır.
3. Panelde şu değerleri girin:
   - **Kimlik ön eki**: `Sol`
   - **Kat / kuşak**: `Salon`
   - **Koltuk aralığı**: `55`
   - **Sıra aralığı**: `105`
   - **Gelişmiş** bölümünü açın (bir kez açtıktan sonra oturum boyunca
     açık kalır): **X (cm)**: `-250`, **Y (cm)**: `0`, **Sıra**: `10`,
     **Koltuk**: `6`

   *(Neden -250? Bloğun koltuk genişliği yaklaşık 6×55=330 cm — ama her
   bloğun bir de görünmez bir "Dış hat payı" vardır (varsayılan 55 cm,
   §5'teki "Dış hat" bölümüne bakın), bu da her iki yanına eklenir. Onu da
   sayarsanız iki bloğu 250'şer cm'de tutmak aralarında yaklaşık 60-80
   cm'lik gerçek bir yürüme koridoru bırakır. Bu hesabı ezberlemenize
   gerek yok — Adım 7'de "Doğrula"ya bastığınızda, iki dış hat birbirine
   çakışırsa editör size zaten söyleyecek; o durumda burada girdiğiniz
   X değerlerini büyütmeniz yeterli.)*

### Adım 3 — Sağ bloğu çiz

En hızlı yol, sol bloğu kopyalamaktır:

1. Sol blok hâlâ seçiliyken, panelin altındaki **"Çoğalt"** düğmesine
   basın. Aynı ayarlarla ikinci bir blok belirir (biraz kaymış halde).
2. Yeni (kopya) blok otomatik seçili gelir. Panelde:
   - **Kimlik ön eki**: `Sağ` olarak değiştirin
   - **Gelişmiş** (Sol blokta açtığınız için hâlâ açık): **X (cm)**: `250`,
     **Y (cm)**: `0`
   - Geometri ve Kat/kuşak zaten Sol blokla aynı kopyalanmış olacak
     (10 sıra, 6 koltuk, `Salon`) — değiştirmenize gerek yok.

Şimdi tuvalde, aralarında bir koridor bırakan, simetrik iki blok
görüyor olmalısınız — toplam 120 koltuk (sol alt köşedeki "N koltuk"
sayacından kontrol edebilirsiniz).

### Adım 4 — Perdeyi ekle

1. Sol araç çubuğundan **Şekil** (`D`) aracına tıklayın.
2. Solda, araç çubuğunun altında beliren açılır listeden **"Perde"**yi
   seçin.
3. Tuvalde, iki bloğun **önünde** (Y ekseninde küçük/negatif tarafta),
   geniş ince bir dikdörtgen sürükleyin.
4. Panelde tam değerleri girin: **Genişlik**: `850`, **Derinlik**: `40`,
   **X**: `0`, **Y**: `-120` (bloklardan 120 cm önde, tam ortada).

> **Dikkat — kolayca karışan bir nokta:** Az önce çizdiğiniz Perde hâlâ
> seçiliyken sağ panelde de bir "Tip" alanı görürsünüz. **O, az önce
> çizdiğiniz Perde'yi başka bir şekle çevirir** — bir sonraki adımda
> çizeceğiniz şekli DEĞİL. Bir sonraki şekli seçmek için her zaman **sol
> araç çubuğundaki** açılır listeyi kullanın (adım 2'deki liste). Bu
> ikisini karıştırırsanız (biz de yazarken bir kez karıştırdık) az önce
> çizdiğiniz şekil aniden başka bir şeye dönüşür — fark ederseniz `⌘Z` ile
> geri alın.

### Adım 5 — Kapıları ekle

1. **Sol araç çubuğundaki** şekil listesinden (Perde'nin seçili kaldığı
   listeden değil) **"Kapı"**yı seçin.
2. Salonun arka sol ve arka sağ köşesine birer kapı sürükleyin (küçük
   kareler yeterli, örn. 100×100 cm). Şekil aracı her kapıdan sonra
   kendini seçili tutar, art arda birden fazla kapı çizmek için araç
   listesine her seferinde geri dönmenize gerek yoktur.
3. Kapılardan birine tıklayıp seçin, panelde **"Tüm blokları en yakın
   kapıya ata"** düğmesine basın.

   Bu düğme her bloğu **coğrafi olarak en yakın** kapıya atar; ama iki
   blok da birbirine ve iki kapı da birbirine yakınsa (tam bu örnekteki
   gibi — bloklar arasında sadece dar bir koridor var), her iki kapı da
   her iki bloğu "yeterince yakın" sayıp ikisini de listesine
   ekleyebilir. Bu bir hata değil — küçük bir salonda arkadaki iki kapının
   her ikisinin de bütün salona hizmet etmesi gayet normaldir. Sadece
   belirli bir bloğun sadece belirli bir kapıdan girmesini **istiyorsanız**
   (örn. büyük bir salonda uzak bir localar bölümü), o kapının **"Hizmet
   ettiği bloklar"** listesinden istemediğiniz bloğun kutucuğunu elle
   kaldırın.

### Adım 6 — Tekerlekli sandalye ve refakatçi alanları

Gerçek salonlarda genelde en arka sırada, en kolay ulaşılan yerde
bırakılır. Kaç tane gerektiği salonun büyüklüğüne göre değişir; 120
koltukluk bir salon için editörün kendi kuralı **en az 4** tekerlekli
alan ister (bunu ezberlemenize gerek yok, bir sonraki adımda Doğrula
size zaten söyleyecek) — o yüzden burada ikişer tane iki bloğa birden
ekliyoruz.

1. Sol araç çubuğundan **Nitelik boya** (`N`) aracına tıklayın.
2. Beliren palette **"Tekerlekli"**yi seçin.
3. Sol bloğun en arka sırasındaki ilk 2 koltuğa tıklayın (ekranda bu sıra
   "K" harfini taşır — varsayılan harflendirme karışmasın diye "I"
   harfini atlar, bu yüzden 10. sıra "J" değil "K"dır; hangi harfi
   taşıdığı önemli değil, en arkadaki sıra olması yeterli).
4. Palette **"Refakatçi"**yi seçin, hemen yanlarındaki 2 koltuğa tıklayın.
5. **Aynısını sağ blokta da tekrarlayın** (2 tekerlekli + 2 refakatçi) —
   toplamda 4 tekerlekli + 4 refakatçi olacak.
6. İşiniz bittiğinde sol araç çubuğundan **Seç ve taşı**'ya (`V`) dönmeyi
   unutmayın — fırça aracı açıkken tuvale her tıklama boyama yapar.

### Adım 7 — Kontrol et

1. Üst bardan **Doğrula**'ya basın. Çıkan raporu okuyun:
   - **"N blok dış hattı başka bir bloğun dış hattıyla çakışıyor"** görürseniz,
     Adım 2-3'teki X değerlerini (±250) daha da büyütün — iki blok
     birbirine fazla yakın demektir.
   - **"N tekerlekli sandalye alanı — bu kapasite için N gerekiyor"**
     görürseniz Adım 6'yı eksik uygulamışsınızdır, eksik kalanı ekleyin.
   - **"kapı atanmamış"** görürseniz Adım 5'teki atama düğmesine
     basmayı unutmuş olabilirsiniz.
   - Sorunlu satırın üzerine gelince imleç değişiyorsa, tıklayın —
     editör ilgili bloğu seçip oraya yakınlaştırır.
   - Her şey doğruysa **"Hata veya uyarı yok"** yazısını göreceksiniz.
2. Alt durum çubuğundan **Sığdır**'a basıp tüm planı gözle kontrol edin:
   iki blok, ortada koridor, önde perde, arkada iki kapı, zum yüzdesi
   tam **%100** olmalı.

### Adım 8 — Yayınla ve dışa aktar

1. Üst bardan **Sürümler**'i açın.
2. Not kutusuna `İlk kurulum` yazıp **Yayınla**'ya basın — bu artık
   `v1` sürümünüz.
3. Üst bardan **seats.json**'a basıp koltuk listesini indirin — bu
   dosyayı biletleme sistemine verebilirsiniz.
4. İsterseniz **plan.json**'ı da indirip bir yedek olarak saklayın.

Tebrikler — 120 koltuklu, koridorlu, tekerlekli sandalye alanlı ve
kapıları atanmış tam bir sinema salonu planınız hazır. Buradan sonra
aynı adımları tekrarlayarak sıra sayısını artırabilir, bir üst kat
(balkon) ekleyebilir ya da **Kavis** değerini artırıp sıraları hafif bir
yay haline getirebilirsiniz.
