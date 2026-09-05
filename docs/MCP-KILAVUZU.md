# MCP kılavuzu — editörü LLM'e bağlamak

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

## Araçlar (27)

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
