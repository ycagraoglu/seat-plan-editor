# MCP kılavuzu — tasarım ve kanıt

> **Kullanmak mı istiyorsun?** → [`NASIL-KULLANILIR.md`](NASIL-KULLANILIR.md)
> Operatör adımları, kurulum, araç tablosu ve ana uygulamaya taşıma orada.
> Bu belge NEDEN öyle tasarlandığını ve hangi hataların nasıl bulunduğunu
> anlatıyor.

Blender'ın MCP eklentisiyle aynı fikir: uygulamanın kendi API'si araç olarak
dışarı verilir, LLM onları çağırarak çizer. Operatör sohbet ekranına
*"organizatörden gelen şu planı çiz"* yazar; LLM blokları kurar, kural
motoruyla doğrular, çizimini kaynakla karşılaştırır.

**Çıktı bir TASLAKTIR.** Yayım aracı bilerek yoktur — bilet satılan bir
sistemde yayına gönderme kararı operatörde kalır.

---

## Kurulum

```bash
npm install
npm run mcp          # elle denemek için; istemci kendisi başlatır
```

**Claude Desktop** — `claude_desktop_config.json` dosyasına:

```json
{
  "mcpServers": {
    "seat-plan-editor": {
      "command": "node",
      "args": ["/MUTLAK/YOL/seat-editor/mcp/index.mjs"]
    }
  }
}
```

**Claude Code** — proje kökünde:

```bash
claude mcp add seat-plan-editor -- node ./mcp/index.mjs
```

Bağlantıyı doğrulamak için LLM'e `ping` çağırt: *"seat-plan-editor MCP · hazır"*.

---

## Neden bu tasarım

**Serbest kod çalıştırma YOK.** Blender `execute_code` vermek zorunda çünkü
alanı sonsuz. Bizim alanımız sınırlı (blok türleri, numaralandırma, kapı,
şekil) ve asıl değerli olan yüksek seviye kurgular — `bowl`, `tier`,
`solveBowlTiers`, `cutVomitories` — zaten fonksiyon. Onları **araç olarak
açmak** yeterli ifade gücünü veriyor ve rastgele kod çalıştırma riskini hiç
doğurmuyor.

**Blender'da olmayan avantaj: kural motoru.** Orada modelin tek geri bildirimi
ekran görüntüsüdür ("güzel göründü mü"). Burada 26 kural ölçüyor ve sadece
"hata var" demiyor, **hedef değer** veriyor:

```
Tekerlekli sandalye alanı tanımlanmamış — en az 6 gerekiyor
Bloklar arasında yürüme payı yok — en dar açıklık 74 cm
  → geçit için en az 90 cm gerekir
```

LLM bunlara göre kendini düzeltebiliyor. Her değiştirici araç çağrısı zaten
kısa bir özet + yeni bulguları döndürüyor; ayrıca `validate` çağırmak şart
değil.

**Ölçek sorun değil.** Bloklar koltuk SAYISINDAN kurulduğu ve varsayılanlar
gerçek olduğu için (koltuk 41 cm, koltuk aralığı 50 cm, sıra aralığı 90 cm)
sonuç kendiliğinden gerçek santimetrede çıkar. Kaynak görselden mesafe
ölçmeye gerek yoktur.

---

## Araçlar (29)

| Araç | İşi |
|---|---|
| `ping` | Bağlantı denetimi |
| **Plan** | |
| `create_plan` | Yeni boş plan |
| `open_sample` | On gerçek salondan birini taban al |
| `list_samples` | Örnekleri listele |
| `plan_summary` | Planı yapısal olarak oku (blok, kat ağacı, kapı, bulgular) |
| `validate` | 26 kurala göre denetle, hedef değerlerle |
| **Blok** | |
| `add_block` | grid · fan · table blok ekle |
| `update_block` | Alanlarını değiştir |
| `delete_block` | Sil |
| `array_blocks` | Doğrusal/radyal çoğalt |
| `set_numbering` | Sıra/koltuk numaralandırması |
| **Yüksek seviye kurgu** | |
| `solve_tiers` | Kademe yarıçaplarını niyetten hesapla |
| `create_bowl` | Tek çağrıda tam kâse (stadyum/arena) |
| `add_tier` | Radyal kademe (amfi, açıkhava) |
| `add_box_wing` | Loca kanadı |
| `cut_vomitories` | Tüneli tribünün içine oy |
| `add_accessible` | Tekerlekli sandalye + refakatçi çifti |
| `define_section` | Bölüme tür ver (rapor sözlüğü) |
| **Şekil / kapı** | |
| `add_shape` | Sahne · saha · perde · kapı · duvar · ayakta alan · not · **ikon** (çokgen destekli) |
| `assign_gate` | Kapıya blok ata (çok kapılı blok destekli) |
| `auto_gates` | Mesafeye göre ata (tahmindir) |
| **Görme** | |
| `render` | Çizimin PNG'si; kapsam ve altlık bindirmesiyle |
| `set_underlay` | Organizatörün plan görselini altlık yap |
| **Kaynak** | |
| `match_seat_list` | CSV/db.json listesiyle karşılaştır |
| `remove_extra_seats` | Listede olmayan koltukları kaldır |
| `adopt_ids` | Listedeki kalıcı kimliği benimse |
| **Çıktı** | |
| `export_plan` | plan · seats · db biçimlerinde yaz |

---

## LLM'e verilecek talimat

Sunucu bunu `instructions` olarak zaten gönderiyor (`mcp/server.mjs`).
Operatör kendi sistem talimatına ekleyecekse taslak:

```
Sen bir mekân oturma planı çiziyorsun. Kaynak organizatörden gelir:
görsel (nerede ne var) ve/veya liste (kaç tane).

SIRAYLA:
1. Kaynağı oku. Görsel varsa set_underlay ile altlık yap — karşılaştırma
   yapacaksan x/y/width/height ver, yoksa altlık gerilir ve HİZALANMAZ.
2. create_plan. Sahneyi/sahayı add_shape ile koy — yönü kaynaktan oku.
3. Blokları kur. Kat alanına YOL yaz ("Maraton / Üst"), böylece bölüm
   ağacı oluşur. Stadyum/arena ise önce solve_tiers, sonra create_bowl —
   yarıçapları elle uydurma.
4. Numaralandırmayı kaynağa göre ayarla. Sıra 1'den başlamak zorunda
   değil ve ters akabilir (set_numbering: rowStart, rowRev).
5. Her adımdan sonra dönen özeti oku. Kural bulgusu HEDEF DEĞER verir,
   ona göre düzelt.
6. render ile ÇİZİMİNE BAK; altlık varsa üstüne bindir ve karşılaştır.
7. Liste varsa match_seat_list. "eksik" ya da "fazla" varsa plan HENÜZ
   DOĞRU DEĞİL — önce blok sıra/koltuk sayılarını düzelt. Geriye dağınık
   birkaç "fazla" kalıyorsa (kapı, merdiven boşluğu) remove_extra_seats.
8. export_plan ile teslim et.
9. RAPORLA: kaynaktan neyi OKUDUN, neyi VARSAYDIN, operatörün neyi
   doğrulaması gerekiyor. Varsayımı gerçek gibi sunma.

Yayına sen göndermezsin. Ürettiğin şey taslaktır.
```

---

## Panel içi sohbet — asıl kullanım biçimi

Bu editör ana uygulamaya, bir biletleme platformunun yönetim paneline
taşınacak: `ticketmanager.com` gibi bir adreste, **login'in arkasında bir
sayfa**. Orada operatörün kendi bilgisayarında Claude Desktop çalıştırması
beklenemez.

Onun için ikinci bir yol var ve **canlıda kullanılacak olan budur**:

| | stdio MCP (geliştirme) | Panel içi sohbet (canlı) |
|---|---|---|
| Modeli kim çalıştırır | Claude Desktop / Codex | **Sunucu** |
| Operatör ne ayarlar | `.mcp.json` | **Hiçbir şey** |
| Token | operatörün makinesinde | sunucuda, tarayıcıya **hiç gitmez** |
| Sohbet nerede | Claude Desktop penceresi | **panelin kendi sayfası** |

Operatörün gördüğü şey: sayfayı açar, sağdaki kutuya *"Bursa Tayyare'yi
çiz"* yazar, izler.

### Kurulum — üç sağlayıcıdan biri

Sahada en çok bu üçü kullanılıyor; hangisinin anahtarı elindeyse o çalışır:

```bash
ANTHROPIC_API_KEY=sk-ant-...  npm run live     # Claude
OPENAI_API_KEY=sk-...         npm run live     # GPT
GEMINI_API_KEY=...            npm run live     # Gemini
```

Birden çok anahtar tanımlıysa sıra **anthropic → openai → gemini**; açıkça
seçmek için `SOHBET_SAGLAYICI=gemini`. Modeli değiştirmek için
`SOHBET_MODEL=...` (OpenAI/Gemini varsayılanları hesaptan hesaba değişiyor,
kendi hesabında ne varsa onu yaz).

Hiç anahtar **yoksa sohbet paneli hiç görünmez** ve editör eskisi gibi
çalışır. Panel yalnız "açık mı" cevabını alır; anahtarın kendisi tarayıcıya
gitmez.

### Sağlayıcı katmanı

```
chat/dongu.mjs            ← sağlayıcıdan BAĞIMSIZ
chat/saglayici/
  ├─ anthropic.mjs
  ├─ openai.mjs
  ├─ gemini.mjs
  └─ sema.mjs             ← katı şema bekleyenler için temizleyici
```

Dördüncü bir sağlayıcı eklemek **tek dosya** demek; döngüye, rotalara,
panele, 29 araca dokunulmuyor. Test paketi üçünü de aynı senaryolarla
koşuyor — soyutlamanın tuttuğunun kanıtı orada.

**İki gerçek fark, ikisi de çözüldü:**

| Fark | Çözüm |
|---|---|
| Gemini'nin şeması OpenAPI 3.0 alt kümesi; `exclusiveMinimum` (19 yerde) ve tip dizisi (3 araçta) kabul edilmiyor | `sema.mjs` sadeleştiriyor ve **düşen kısıtı açıklamaya taşıyor** — sessizce atmak modelin `rows: 0` göndermesine kapı açardı |
| Araç yanıtı yalnız Anthropic'te görsel taşıyabiliyor | Diğer ikisinde görsel **ayrı bir tur** olarak gidiyor. Bir mesaj fazla; "çiz → kendi çizimine bak → düzelt" döngüsü üçünde de çalışıyor |

### Nasıl kurulu

```
Tarayıcı ──POST /api/chat──► sunucu ──► Claude (claude-opus-5)
         ◄─GET /api/chat 1sn─┘   │           │ tool_use
                                 │  ┌────────┘
                                 ▼  ▼
                         süreç-içi MCP istemcisi
                                 │
                                 ▼  29 araç — TEK KAYNAK
                            src/core/**
```

**Araç tanımları iki kez yazılmıyor.** Sohbet katmanı MCP sunucusuna
süreç-içi bağlanıp (`chat/kopru.mjs`) `listTools()` ile şemaları okuyor;
sistem talimatı da `mcp/server.mjs`'ten geliyor. Yani Claude Desktop ile
panelin sohbeti **aynı araçları ve aynı talimatı** kullanıyor. Bir araç
değişince sohbet tarafında hiçbir şey yapılmıyor.

### Kararlar ve gerekçeleri

| Karar | Neden |
|---|---|
| Tool Runner değil **elle döngü** | SDK'nın runner'ı araçların dekoratörle tanımlanmasını bekliyor; bizimkiler MCP'den geliyor ve tek kaynakta kalmaları bu işin bel kemiği |
| **Yoklama**, SSE değil | Tur arka planda koşuyor, panel saniyede bir okuyor — canlı görünümün kalıbı. Sunucuya ilk durumlu bağlantı girmiyor, testlerdeki `srv.close()` asılı kalmıyor |
| Tur başına **40 araç sınırı** | Kaçak döngü bir biletleme panelinde hem para hem çöp plan demek. Sınır aşılınca durup **sebebini söylüyor** |
| Araçlar **sırayla** | Doğruluk taşıma katmanının işleme düzenine bağlı kalmasın ve adım günlüğü operatöre sırayla aksın. *(Not: "paralel çalışırsa veri yarışı olur" diye yazmıştım — ölçtüm, doğru değil; `mutate` senkron. Bu bir determinizm tercihi.)* |
| **Yayım aracı yok** | Çıktı taslaktır; yayına gönderme kararı operatörde |

### Var olan salonu düzenleme

`list_plans` operatörün kayıtlı planlarını listeler, `open_plan` birini
açar. **Orijinal ezilmez:** çizim `ai-` ad alanına yazılır, operatörün
kaydı olduğu gibi durur, beğenirse üstüne kendisi geçer.

### Ana uygulamaya taşırken

- **Kimlik:** `x-tenant-id` başlığı hazır (`server/index.mjs`). Auth
  yazılmadı — ana uygulama kendi oturum katmanından dolduracak. Başlık
  yoksa tek kiracılı davranış sürüyor.
- **Oturum:** konuşma başına bir MCP oturumu (`chat/oturumlar.mjs`),
  bellekte, 30 dk boşta kalınca düşüyor. Kalıcı olması gereken şey plan,
  o zaten `editor_plans`'ta.
- **Sohbet dökümü** bellekte; kaybolursa çizim kaybolmaz.

### Sınanmayan tek halka

Uçtan uca deneme sahte anahtarla yapıldı: mesaj gidiyor, döngü koşuyor,
hata akışa düşüyor, panel gösteriyor. **Başarılı bir model çağrısı gerçek
anahtar gerektiriyor** ve bu depoda denenmedi — ilk gerçek turu
çalıştıran kişi bunu bilerek yapsın.

---

## Canlı görünüm — çizerken izlemek

Blender'daki his: bir ekranda sohbet, öbüründe editör. "Bu salonu çiz"
dediğinde bloklar editörde **belirirken** izlersin.

```bash
npm run live      # sunucu (8787) + editör (5173) birlikte
```

MCP tarafında tek değişken:

```json
{ "mcpServers": { "seat-plan-editor": {
    "command": "node", "args": ["mcp/index.mjs"],
    "env": { "SEAT_EDITOR_API": "http://localhost:8787/api" } } } }
```

Değişken **verilmezse hiçbir şey değişmez** — sunucusuz akış (çiz →
`export_plan` → editörde "Aç") aynen çalışır, ağa hiç çıkılmaz.

### Nasıl çalışıyor

Her araç çağrısı planı değiştirdikten sonra sunucuya yazıyor; editör
saniyede bir sorup güncelliyor. Akış (SSE) değil **yoklama** — bilinçli:
sunucu 195 satırlık, bağlantı durumu tutmayan saf bir istek→yanıt
fonksiyonu ve olayın kaynağı zaten ayrı bir süreç; SSE yalnız son adımı
≤1 sn kısaltırdı, oysa LLM'in kendi araç turu saniyeler sürüyor.

**Yapay zekâ çizerken düzenleme kapalı.** Editörde ~40 mutasyon girişi var
ama hepsi 11 reducer eylemine düşüyor, kilit orada — kırk yerde değil.
Kapalı olmayanlar bilerek açık: **kaydırma, yakınlaştırma ve seçim**.
İzlerken kamerayı gezdirebilmek bu modun bütün anlamı. Çizim büyüdükçe
çerçeve kendiliğinden açılıyor, ama yalnız içerik taştığında — her karede
sığdırmak senin kaydırmanı saniyede bir geri alırdı.

**Özellikler paneli, çizerken ADIM GÜNLÜĞÜ gösterir.** Tuvalde bloklar
belirirken sağdaki panel ne yapıldığını operatör diliyle yazar — en yenisi
üstte:

```
14:42:13   Izgara blok eklendi: "B1" · 6 sıra · Balkon 1
           402 koltuk · 12 blok
           ✕ Tekerlekli sandalye alanı tanımlanmamış — en az 6 gerekiyor
           ⚠ Hiç kapı tanımlanmamış
14:42:09   "LOCA 1" 9 bloğa çoğaltıldı (yan yana)
           303 koltuk · 11 blok
```

Şema dili panele sızmaz: `grid` değil "Izgara", `box` değil "loca",
`stage` değil "Sahne". Kural bulguları **hedef değeriyle** anında görünür —
operatör sonunda doğrulama çalıştırmayı beklemez. Adımlar sunucuda son 60
kayıtla sınırlı ve yeni çizime geçilince sıfırlanır.

**Çizim durunca şerit yeşile döner.** 25 saniyedir değişiklik yoksa şerit
`✓ Çizim durdu · <ad> · N koltuk · M blok` olur ve alt çubukta bir kez
mesaj çıkar. **"Bitti" demiyoruz, "durdu" diyoruz** — yapay zekânın işini
bitirdiğini bilmenin yolu yok; sessizlik ya bitiştir, ya uzun bir düşünme,
ya da ölmüş bir süreç. Operatöre doğru olan bilgi "N saniyedir değişiklik
yok". Kilit kendiliğinden açılmaz: kontrolü almak yine KES ile olur.

**KES** (şeritteki ×) üç şey yapıyor: kilidi düşürür, planı kalıcı kılar
(tek ⌘Z ile yapay zekânın bütün oturumunu geri alabilirsin) ve yapay
zekânın yazmasını durdurur — sonraki araç çağrısı *"Operatör devraldı"*
hatası alır.

### Üç tasarım kararı

| Karar | Gerekçe |
|---|---|
| Kilit **sahibe değil çizime** bağlı | `mcp/cli.mjs` her çağrıda yeni bir oturum kuruyor; oturum kimliğine bağlı bir iptal bir sonraki çağrıda geri alınır ve KES hiçbir şey ifade etmezdi. İptal edilen şey çizim: aynı plana yazan 409 alır, **yeni** bir çizim (`create_plan`/`open_sample`) serbesttir |
| Canlı anahtar `ai-` ön ekli | `open_sample` planı yerleşik salonun anahtarıyla tutuyor. O anahtara yazmak editörün "örnek salon değişmiş" çatallamasını tetikler ve yeniden yüklemede plan **sessizce atılır** — yapay zekânın bütün işi kaybolurdu |
| Ağ hatası **yutuluyor**, 409 yutulmuyor | Canlı görünüm bir görüntüleme özelliği. Sunucu kapalı diye `add_block`'un patlaması, işe yarayan bir ürünü göstermelik bir özellik uğruna kırmak olurdu |

### Bilinen sınırlar

- Sunucu gerekiyor: `VITE_API_BASE` verilmemişse editör localStorage'la
  çalışır ve canlı görünüm **hiç açılmaz**.
- KES'ten sonra yapay zekâ **bir çağrı geç** öğreniyor. O yazma da sunucuda
  reddedildiği için operatörün tuvaline dokunulmuyor; yalnız haber bir tur
  gecikiyor.
- `open_sample` tek başına canlı görünümü açmıyor — ilk **değişiklikte**
  açılıyor.
- Altlık canlı görünüme gönderilmiyor (her yazmada megabaytlarca base64
  olurdu). Ayrıca `set_underlay` altlığı düz metin olarak tutuyor, editör
  ise `.src` alanlı nesne bekliyor — bu ayrı bir uyumsuzluk, henüz
  ısırmıyor çünkü çıktıda altlık zaten atılıyor.

---

## Yapamadıkları — baştan bilinsin

| Sınır | Sonuç |
|---|---|
| Görselde **tek tek koltuk sayamaz** | Sıra başına koltuk ya listeden gelir ya varsayımdır; işaretlenmeli |
| İlk turda konumlar tutmaz | `render` + `validate` döngüsüyle düzeltilir; 2–3 tur normaldir |
| Geometri geri okunamaz | `db.json` bölüm/satır/koltuk taşır; koltuk konumlarından "ızgara mıydı yelpaze miydi" çıkarmak tahmindir |
| Yayımlayamaz | Aracı yok; operatör editörde açıp onaylar |
| Excel doğrudan okunamaz | CSV dışa aktarımı istenmeli |
| `free` blok türü açık değil | Editörde var ama on salonun 334 bloğunun HİÇBİRİ kullanmıyor; olmayan ihtiyaç için araç açılmadı. Düzensiz oturma gerekirse eklenir |

---

## Gerçek plan denemesi — Ege Ü. AKM Tiyatro Salonu

İnternetten indirilen resmî bir plan görseli ([akm.ege.edu.tr](https://akm.ege.edu.tr/tr-5048/),
340 koltuk) bu depoyu hiç görmemiş bir modele verildi. Yalnız görsel ve
`mcp/cli.mjs` — kaynak koda erişim yok.

Model 340'ı tutturdu ama **plandaki numaralandırmayı ifade edemedi** ve
sırayı iki bloğa bölmek zorunda kaldı; aradaki koltuk aralığı sahte bir
"dar geçit" hatası doğurdu — araç, olmayan bir orta geçidi olan bir salon
tarif ediyordu.

Sebep: `seatScheme` sözlüğüne olmayan bir değer (`mirror`) yazılmış, gerçek
şema (`center`) hiç açılmamıştı. Üstelik bu salon `center`'ın da tersini
kullanıyor. İkisi de eklendi:

```
center     18,16,…,2 | 3,5,…,17     1 ve 2 MERKEZDE
center-in   2,4,…,18 | 15,13,…,1    1 ve 2 DUVARLARDA   ← bu salon
```

Düzeltmeden sonra salon **tek blokta, 340 koltuk, koltuk numaraları resmî
planla birebir** kuruldu; sahte geçit ve çakışma hataları kayboldu.

Bu salonun ikinci dersi: sıra harfleri **Q'yu atlıyor ama I ve O'yu
kullanıyor**. `skipAmbig` üçünü birden atladığı için işe yaramıyor;
`rowCustom` ile harfler tek tek yazılıyor.

---

## Soğuk stadyum testi — Beşiktaş Tüpraş Stadyumu

Kâse araçları (`create_bowl`, `solve_tiers`, `cut_vomitories`) testlerle
kapsanıyordu — ama **parametrelerini zaten bilen** biri tarafından yazılmış
testlerle. Asıl soru başkaydı: yalnız araç açıklamalarına bakan biri bunları
sürebiliyor mu?

Kod tabanını hiç görmemiş bir modele Beşiktaş'ın **kendi sitesindeki** resmî
blok planı verildi (`images.bjk.com.tr`), tek erişimi `mcp/cli.mjs`.

**Sonucu tuttu:** 56 blok · 41.508 koltuk · 2 kademe · doğrulama 0 hata
(gerçek kapasite ~41.900, fark %1'in altında). `create_bowl` + `solve_tiers`
zinciri açıklamalardan doğru kuruldu.

### Bulunan iki sessiz başarısızlık

**1. `auto_gates` kapı yokken "atandı" diyordu.** Planda hiç kapı şekli
yokken `autoGates()` boş dizi döndürüyor, araç ise koşulsuz *"Kapılar
mesafeye göre atandı"* yazıyordu. Model kapısız bir planı teslim etmek
üzereydi; yalnız `plan_summary`'yi çapraz kontrol ettiği için fark etti.
Araç artık ön koşulu kesiyor ve ne yapılacağını söylüyor.

**2. `add_shape type=pitch` 0×0 saha üretiyordu.** Açıklama *"ölçü
nizamnameden gelir, w/h yok sayılır"* diye söz veriyordu ama nizami ölçü
sözlüğü `PlanEditor.jsx` içindeydi — MCP ona bakamıyordu ve `w: 0, h: 0`
yazıyordu. Üstelik metin "w/h yok sayılır" dediği için dikkatli kullanıcı
onları **bilerek** vermiyor: açıklama doğrudan hataya yönlendiriyordu.
Hiçbir kural da yakalamıyordu (plan 0 hata veriyordu). Ölçüler
`src/core/pitches.js`'e alındı, UI ve MCP artık aynı kaynaktan okuyor.

Bu ikincisini **model raporlamadı** — sahayı eklediğini sanıyordu. Çizimi
render edip bakınca ortaya çıktı. Sebebi de bulundu: `plan_summary` şekillerin
**ölçüsünü hiç göstermiyordu**, yani modelin görmesi mümkün değildi. Özet
artık `w`/`h` taşıyor: okunmayan şey doğrulanamaz.

### Doğrulanmayan iddialar

Modelin bildirdiği her şey doğru çıkmadı; ölçülmeden düzeltme yapılmadı:

| İddia | Ölçüm |
|---|---|
| `create_bowl` (pad 80) ile `solve_tiers` (pad 55) farklı varsayılan taşıyor, kademe çakışması doğurur | Varsayılanlar gerçekten farklı, **ama** kademeler arası çakışma her denemede sıfır çıktı. Testteki çakışmaların hepsi kademe İÇİNDE ve `gapFromPrev`'den bağımsızdı — çözücünün garantisi tutuyor |
| `door` için `w`/`h` zorunluluğu hiçbir yerde yazmıyor | Alan açıklamasında yazıyor ("pitch dışında zorunlu"); eksik olan JSON Schema'nın `required` dizisi. Hata mesajı zaten açık, model tek turda düzeltti |
| `tools` dizi alanlarının iç şemasını vermiyor | Doğru, **ama** yalnız `mcp/cli.mjs`'in özet yazıcısında. Gerçek MCP şeması öğe alanlarını taşıyor; gerçek istemci tam şemayı alıyor |

### Modelin kendi belirttiği sınırlar

Sıra sayısı/aralığı, köşe yarıçapı, kenar başına blok dağılımı ve 8 kapının
konumu kaynakta yok — uydurma olduklarını açıkça yazdı. `create_bowl`'un
numaralandırma **yönü ve başlangıç köşesi** açıklamada yazmıyor; sonuç
kaynağın ters yönünde çıktı ve düzeltmek 28 bloğu elle yeniden adlandırmayı
gerektirdiği için yapılmadı. Vomitoryum kesimi yapılmadı (kaynakta tünel izi
yok). Kapasiteyi hedeflemek için bir parametre yok; model ilk denemede %25
fazla çıkardı ve planı sıfırdan kurmak zorunda kaldı.

---

## Gerçek plan denemesi 2 — Bursa Tayyare Kültür Merkezi

Bu, MCP sunucusunun **araç listesine bağlıyken** (Bash'ten değil) yürütülen
ilk tur. Kaynak: Biletix'in mekân için yayımladığı resmî oturma planı
(`Venue_BL.gif`, 975×600) — organizatörden gelecek görselin gerçek muadili.

Görsel şematiktir: sıra aralığı ölçekli değil, yazılar koltukların üstüne
biniyor. Sıra sayıları **piksel sayarak** çıkarıldı (göz kararı değil):
kırmızı kareler bağlı bileşen olarak etiketlendi, yazı bindiren hücreler
sabit adımlı kafes taramasıyla geri kazanıldı. İki bağımsız yöntem, planın
**basılı numaralarıyla** çapraz doğrulandı.

Sonuç: **594 koltuk · 19 blok · 5 kat · 24 bölüm**, doğrulama 0 hata.

Turun bulduğu ve düzelttiği üç şey:

**1. `seatDir` iki numaralandırma şemasında sessizce yok sayılıyordu.**
Plan sol duvarda 1, merkezde 19|18 diyor; `center-in` ise sol yarıya çift
veriyor. Aynası gerekiyordu ve `seatDir` alanı zaten vardı — ama
`center`/`center-in` dalı onu hiç okumuyordu. Diziyi ters çevirmek de
YETMİYOR: tek sayılı sırada fazlalık koltuk yine aynı yarıda kalıp merkezin
paritesini bozuyor (kod 19 yerine 20 üretiyordu). Aynalanan şey, sayaçların
hangi uçtan başladığı olmalıydı.

```
center-in ltr   2 4 … 18 20 | 17 … 1     Ege Ü. AKM
center-in rtl   1 3 … 17 19 | 18 … 2     Bursa Tayyare   ← eklendi
```

**2. Araç açıklaması bunu anlatmıyordu.** Davranış düzelse de yalnız
açıklamaya bakan bir model yine aynalı çizerdi; `set_numbering` metnine
seatDir'in bu iki şemayı aynaladığı yazıldı.

**3. `render` + altlık bindirmesi üç yapısal eksik gösterdi** — sayılar
tutarken resim tutmuyordu:

| Bindirmenin gösterdiği | Düzeltme |
|---|---|
| Balkonların **yan kanatları** yok (kaynakta bloğun dışında kırmızı alan) | Kanatlar ayrı blok; koltuk 1–6 onlarda, merkez 7'den başlıyor |
| Salon arkasında **orta geçit** yok | K–L iki bloğa ayrıldı (odd/even + seatDir), M–O tek blok |
| Kanat/geçit açıklıkları dar | Kural motoru hedef verdi (110 cm var, 120 gerekir), bloklar ötelendi |

Kanatlar kozmetik değil: koltuk 1–6'yı onlar taşıyor, modellenmezse
numaralandırma da yanlış oluyor.

Taze bir süreçte üretilen koltuk listesi, plandaki **her basılı numarayı**
birebir veriyor:

```
SALON  C sırası   1 3 5 … 19 | 18 16 … 2        plan: "1 —— 19 18 —— 2"
SALON  K sırası   1 3 … 17  ‖  18 … 2           plan: "1 — 17   18 — 2"
SALON  O sırası   1 3 … 27 | 26 … 2             plan: "1 —— 27 26 —— 2"
BALKON A sırası   1 3 5 | 7 … 21 | 20 … 8 | 2 4 6
```

`db` çıktısı şemaya sorunsuz yüklendi: 24 bölüm, 68 sıra, 594 koltuk,
7 refakatçi grubu, 14 koltuk özelliği.

**Operatörün doğrulaması gereken varsayımlar** (kaynak söylemiyor):
sıra başına koltuk sayıları ±1 (şematik görselden sayıldı) · tekerlekli
sandalye yerlerinin KONUMU (kural 7 istiyor, plan yer göstermiyor) ·
kapılar (plan hiç kapı göstermiyor, bu yüzden `validate` hâlâ uyarıyor) ·
balkon kanatlarının basamaklı kenarı dikdörtgene sadeleştirildi.

**Not — sunucu yeniden başlatma:** MCP sunucusu oturum başında ayağa
kalkar ve `src/core/**` kodunu o an belleğe alır. Tur sırasında yapılan
`labels.js` düzeltmesi bağlı sunucuya yansımadı; teslim dosyaları taze bir
süreçte üretildi. Kod değiştiyse istemciyi yeniden başlat.

---

## Uçtan uca deneme (yapıldı)

CSO Ada Ankara planı "organizatörden gelmiş" gibi verildi (görsel + koltuk
listesi) ve yalnız araçlarla kuruldu. Kasten bir blok eksik girildi:

```
1) blok B sıra sayısı 7 yerine 6 girildi
   match_seat_list → EŞLEŞTİ 1.960 · EKSİK 48 · FAZLA 9 · "TUTMUYOR"
                     eksik örnekleri: B|4|55 · B|7|1 · B|7|2
2) update_block rows:7
   match_seat_list → EŞLEŞTİ 2.008 · EKSİK 0 · FAZLA 16
                     (gerçekte kapı için oyulmuş 16 koltuk)
3) remove_extra_seats
   match_seat_list → EŞLEŞTİ 2.008 · EKSİK 0 · FAZLA 0 · "BİREBİR tutuyor"
4) add_accessible + auto_gates → doğrulama hatasız
5) export_plan db → 2.008 koltuk, şemaya yüklendi
```

Bu tur iki gerçek hata ortaya çıkardı ve ikisi de düzeltildi: `create_plan`
boş tuvalin 40×30 m'lik çerçevesini taşıyor ve render o pencereye
kilitleniyordu; altlık dünyada konumlandırılamadığı için üst üste bindirme
hizalanmıyordu.

---

## Doğrulama

```bash
npm run test:mcp                # araç yüzeyi (77 test)
npx vitest run test/mcp/rebuild-sureyya.test.js   # kabul testi
```

**Kabul testi** bütün işin sınavı: Süreyya Operası sıfırdan, yalnız araç
çağrılarıyla kuruluyor ve `src/venues/sureyya.venue.js` ile karşılaştırılıyor
— 18 blok, 386 koltuk, 5 kat, blok başına dağılım birebir. Geçtiği sürece
araç yüzeyi gerçek bir salonu ifade edebiliyor demektir.
