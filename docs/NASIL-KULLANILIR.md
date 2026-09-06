# Nasıl kullanılır

Bu belge **kullanmak** içindir. Neden öyle tasarlandığı, hangi hataların nasıl
bulunduğu ve deneme raporları `MCP-KILAVUZU.md`'de.

Dört bölüm, dört farklı okuyucu:

| Bölüm | Kim okur |
|---|---|
| [1. Operatör](#1-operatör--panelde-salon-çizmek) | Panelde salon çizen kişi |
| [2. Kurulum](#2-kurulum--sistemi-ayağa-kaldırmak) | Sistemi kuran kişi |
| [3. Geliştirici](#3-geliştirici--claude-desktop--codex-ile-yerel) | Bu depoda çalışan kişi |
| [4. Ana uygulamaya taşıma](#4-ana-uygulamaya-taşıma) | Panele entegre edecek ekip |

---

## 1. Operatör — panelde salon çizmek

### Ne yapabilirsin

Editörü açarsın, sağdaki kutuya ne istediğini **düz Türkçe** yazarsın. Yapay
zekâ salonu çizer, sen izlersin.

Kendi bilgisayarında hiçbir program çalıştırmazsın, hiçbir ayar yapmazsın,
anahtar görmezsin. Sohbet kutusu sayfanın bir parçası.

### İlk çizim

**1.** Editörü aç. Sağda **Yapay zekâ yardımcısı** kutusu yoksa sistem
sohbet için kurulmamış demektir — [Bölüm 2](#2-kurulum--sistemi-ayağa-kaldırmak).

**2.** Ne istediğini yaz. Örnekler:

```
Bursa Tayyare Kültür Merkezi'ni çiz
600 kişilik bir tiyatro salonu kur, balkonlu
kayıtlı planlarımı listele
```

**3.** İzle. Şunlar olur:

- Üstte pembe şerit çıkar: `● Yapay zekâ çiziyor — düzenleme kapalı`
- Bloklar tuvalde **birer birer** belirir
- Sağdaki akışta ne yapıldığı yazar:

```
14:42:04  Izgara blok eklendi: "SALON-ON" · 10 sıra · Zemin / Salon
          195 koltuk · 1 blok
          ✕ Tekerlekli sandalye alanı tanımlanmamış — en az 5 gerekiyor
```

**4.** Bitince şerit **yeşile döner**: `✓ Çizim durdu · 594 koltuk · 19 blok`

**5.** Devralmak için şeritteki **×** (KES). Kilit düşer, düzenleme açılır,
yapay zekânın yazması durur.

### Çizerken ne yapabilirsin, ne yapamazsın

| Yapabilirsin | Yapamazsın |
|---|---|
| Kaydırma, yakınlaştırma | Blok ekleme/silme/taşıma |
| Blok seçme, inceleme | Sıra/koltuk düzenleme |
| Doğrulama sonuçlarını okuma | Salon değiştirme |

Kamera serbest çünkü **izlemek** bu modun bütün anlamı. Düzenleme kapalı
çünkü aynı anda ikinizin yazması planı bozar.

### KES ne yapar

Üç şey:

1. Kilidi düşürür — düzenleme sana geçer
2. Çizimi **kalıcı kılar** — tek `⌘Z` ile yapay zekânın bütün oturumunu geri
   alabilirsin
3. Yapay zekânın yazmasını durdurur — bir sonraki denemesi reddedilir

KES'ten sonra **aynı salonu yeniden çizdirebilirsin**; yeni bir çizim
sayılır.

### Var olan salonu düzenletmek

```
kayıtlı planlarımı listele
Bursa Tayyare'nin balkonuna iki sıra daha ekle
```

**Orijinalin ezilmez.** Yapay zekâ senin kaydının bir kopyası üzerinde
çalışır (`ai-` ön ekiyle); beğenirsen üstüne sen geçersin.

### Çıktıyı okurken dikkat

**Yapay zekâ görselden koltuk sayamaz.** Sıra başına koltuk sayısı ya
verdiğin listeden gelir ya varsayımdır. Bitirdiğinde **ne okuduğunu ve ne
varsaydığını ayrı ayrı** söylemesi gerekir; söylemiyorsa sor.

**Kural bulgularını oku.** Akışta `✕` ve `⚠` işaretli satırlar çıkar ve
hedef değer verir ("en az 90 cm gerekir"). Yapay zekâ çoğunu kendi düzeltir
ama hepsini değil.

**Yayına yapay zekâ alamaz.** Ürettiği şey taslaktır; yayın kararı sende.

### Sık karşılaşılanlar

| Ne görüyorsun | Ne demek |
|---|---|
| `Çizim durdu — 25 sn'dir değişiklik yok` | İşi bitmiş **olabilir** ya da düşünüyor olabilir. "Bitti" demiyoruz çünkü bilemeyiz — bakıp karar ver |
| `Araç çağrısı sınırına ulaşıldı (40)` | Tek turda çok iş istendi. Plana bak, "devam et" de |
| `Operatör devraldı (KES)` | KES'e basılmış. Yeniden çizdirmek için yeni bir istek yaz |
| `API anahtarı geçersiz` | Sunucu ayarı bozuk — sistemi kurana söyle |
| Sohbet kutusu hiç yok | Sohbet kurulmamış — [Bölüm 2](#2-kurulum--sistemi-ayağa-kaldırmak) |

---

## 2. Kurulum — sistemi ayağa kaldırmak

### Tek komut

```bash
GEMINI_API_KEY=...  npm run live
```

Bu, iki şeyi birlikte başlatır: depo sunucusu (`:8787`) ve editör (`:5173`).

### Üç sağlayıcıdan biri

Sahada en çok bu üçü kullanılıyor; hangisinin anahtarı elindeyse o çalışır:

```bash
ANTHROPIC_API_KEY=sk-ant-...   npm run live      # Claude
OPENAI_API_KEY=sk-...          npm run live      # GPT
GEMINI_API_KEY=...             npm run live      # Gemini
```

**Anahtar sunucuda durur, tarayıcıya asla gitmez.** Panel yalnız "sohbet
açık mı" cevabını alır.

Hiç anahtar yoksa sohbet paneli **hiç görünmez** ve editör normal çalışır.

### Ortam değişkenleri

| Değişken | İşi |
|---|---|
| `ANTHROPIC_API_KEY` / `OPENAI_API_KEY` / `GEMINI_API_KEY` | Hangisi varsa o kullanılır |
| `SOHBET_SAGLAYICI` | Birden fazla anahtar varsa açıkça seç: `anthropic` · `openai` · `gemini` |
| `SOHBET_MODEL` | Modeli değiştir. OpenAI/Gemini varsayılanları hesaptan hesaba değişir — kendi hesabında ne varsa onu yaz |
| `API_PORT` | Depo sunucusu portu (varsayılan 8787) |
| `TENANT_ID` | Tek kiracılı kurulumda kimlik (varsayılan `t1`) |
| `SEAT_EDITOR_API` | MCP sunucusunun depoya bakacağı adres — canlı görünüm ve `open_plan` için |

Birden çok anahtar tanımlıysa seçim sırası: **anthropic → openai → gemini**.
Sıra bir tercih değil, tahmin edilebilir olsun diye sabit.

### Doğrulama

```bash
curl localhost:8787/api/chat/durum      # {"acik":true} bekleniyor
```

`{"acik":false}` geliyorsa hiçbir anahtar görülmüyor demektir.

### Sunucusuz kullanım

`npm run dev` — editör tek başına açılır, tarayıcı deposuna kaydeder.
Sohbet ve canlı görünüm **olmaz**; geri kalan her şey çalışır.

### Sorun giderme

| Belirti | Sebep |
|---|---|
| Sunucu kalkmıyor, "table already exists" | Eski bir sürümdesin; şema kurulumu artık tekrarlanabilir |
| Port kullanımda | `API_PORT` ile değiştir ya da eski süreci kapat |
| Sohbet var ama cevap gelmiyor | Akıştaki hata satırını oku — anahtar, kota ya da ağ |
| Bloklar tuvalde belirmiyor | `VITE_API_BASE` verilmemiş; `npm run live` bunu kendisi yapıyor |

---

## 3. Geliştirici — Claude Desktop / Codex ile yerel

Bu bölüm **bu depoda çalışanlar** içindir. Canlı kullanımda kimse bunu
yapmaz (Bölüm 1'e bak).

### Claude Code

Depoda `.mcp.json` var; klonlayıp Claude Code'u bu klasörde açman yeter.
29 araç `mcp__seat-plan-editor__*` olarak görünür.

### Claude Desktop

`claude_desktop_config.json`:

```json
{
  "mcpServers": {
    "seat-plan-editor": {
      "command": "node",
      "args": ["/MUTLAK/YOL/seat-editor/mcp/index.mjs"],
      "env": { "SEAT_EDITOR_API": "http://localhost:8787/api" }
    }
  }
}
```

`env` isteğe bağlı — canlı görünüm ve `open_plan` için. Verilmezse MCP hiç
ağa çıkmaz.

### Codex

`~/.codex/config.toml`:

```toml
[mcp_servers.seat-plan-editor]
command = "node"
args = ["/MUTLAK/YOL/seat-editor/mcp/index.mjs"]

[mcp_servers.seat-plan-editor.env]
SEAT_EDITOR_API = "http://localhost:8787/api"
```

### Komut satırı (hata ayıklama)

```bash
node mcp/cli.mjs tools                   # araçlar ve açıklamaları
node mcp/cli.mjs describe add_block      # tek aracın tam şeması
node mcp/cli.mjs call create_plan '{"name":"Deneme"}'
node mcp/cli.mjs reset
```

> **Kod değişince istemciyi yeniden başlat.** MCP sunucusu oturum başında
> ayağa kalkıp `src/core/**`'u belleğe alıyor; sonraki değişikliği görmüyor.

### 29 araç

**Plan**

| Araç | İşi | Zorunlu |
|---|---|---|
| `create_plan` | Yeni boş plan | `name` |
| `open_sample` | On yerleşik salondan birini taban al | `key` |
| `list_samples` | Yerleşik salonları listele | — |
| `list_plans` | **Kayıtlı** planları listele | — |
| `open_plan` | Kayıtlı planı aç | `key` |
| `plan_summary` | Planı yapısal olarak oku | — |
| `validate` | 26 kurala göre denetle, hedef değerlerle | — |

**Blok**

| Araç | İşi | Zorunlu |
|---|---|---|
| `add_block` | grid · fan · table blok | `kind,label,level,x,y` |
| `update_block` | Alanlarını değiştir | `id` |
| `delete_block` | Sil | `id` |
| `array_blocks` | Doğrusal/radyal çoğalt | `id,mode,count` |
| `set_numbering` | Sıra/koltuk numaralandırması | `id` |

**Yüksek seviye kurgu** — asıl alan bilgisi burada

| Araç | İşi | Zorunlu |
|---|---|---|
| `solve_tiers` | Kademe yarıçaplarını niyetten hesapla | `mode,tiers` |
| `create_bowl` | Tek çağrıda tam kâse (stadyum/arena) | `W,H,Rc,rows,…` |
| `add_tier` | Radyal kademe (amfi, açıkhava) | `r0,rows,rowGap,span,count,…` |
| `add_box_wing` | Loca kanadı | `r0,rows,…,countPerSide,…` |
| `cut_vomitories` | Tüneli tribünün içine oy | — |
| `add_accessible` | Tekerlekli sandalye + refakatçi çifti | `pairs` |
| `define_section` | Bölüme tür ver | `level,kind` |

**Şekil ve kapı**

| Araç | İşi | Zorunlu |
|---|---|---|
| `add_shape` | Sahne · saha · kapı · duvar · ayakta alan · ikon | `type,x,y` |
| `assign_gate` | Kapıya blok ata | `gate,blocks` |
| `auto_gates` | Mesafeye göre ata (tahmindir) | — |

**Görme ve kaynak**

| Araç | İşi | Zorunlu |
|---|---|---|
| `render` | Çizimin PNG'si | — |
| `set_underlay` | Organizatörün planını altlık yap | `path` |
| `match_seat_list` | CSV/db.json listesiyle karşılaştır | `path` |
| `remove_extra_seats` | Listede olmayanları kaldır | — |
| `adopt_ids` | Listedeki kalıcı kimliği benimse | — |

**Çıktı**

| Araç | İşi | Zorunlu |
|---|---|---|
| `export_plan` | `plan` · `seats` · `db` biçimlerinde yaz | `format,path` |
| `ping` | Bağlantı denetimi | — |

**Yayım aracı yoktur** ve bilerek yoktur.

---

## 4. Ana uygulamaya taşıma

### Ne taşınır

Her şey. `src/core/**` saf (React yok, DOM yok); MCP katmanı onu tüketiyor,
sohbet katmanı MCP'yi tüketiyor.

```
src/core/**          geometri, kurallar, numaralandırma, dışa aktarım
src/venues/**         salon kurguları
mcp/**                29 araç + oturum
chat/**               sohbet döngüsü + üç sağlayıcı adaptörü
server/index.mjs      depo + canlı görünüm + sohbet rotaları
db/                   şema
```

### Ne değişir

**Kimlik.** `x-tenant-id` başlığı hazır. Auth yazılmadı — ana uygulama
kendi oturum katmanından dolduracak. Başlık yoksa tek kiracılı davranış
sürüyor.

```js
// Ana uygulamanın proxy'si:
headers["x-tenant-id"] = oturum.tenantId;
```

**Oturum ömrü.** Konuşma başına bir MCP oturumu, bellekte, 30 dk boşta
kalınca düşüyor. Çok sunuculu kurulumda yapışkan oturum ya da paylaşımlı
durum gerekir.

**Sohbet dökümü** bellekte; kaybolursa çizim kaybolmaz (plan
`editor_plans`'ta).

### Değiştirmeyin

| | Neden |
|---|---|
| Araç tanımları tek kaynakta (`mcp/tools/**`) | Sohbet katmanı onları `listTools()` ile okuyor. İkinci bir tanım yazmak ayrışma başlatır |
| Yayım aracı yok | Çıktı taslak; yayın kararı operatörde |
| Araçlar sırayla çalışır | Determinizm ve okunur günlük için |
| `ai-` ad alanı | Yapay zekâ operatörün kaydını ezmiyor |

### Sağlayıcı eklemek

`chat/saglayici/` altına bir dosya; döngüye, rotalara, panele ve 29 araca
dokunulmuyor. Test paketi üç sağlayıcıyı aynı senaryolarla koşuyor —
yenisini oraya bir satırla eklersin.

### Doğrulama

```bash
npx vitest run                  # 825 test
node scripts/check-golden.mjs   # 10/10 — on salonun geometrisi değişmedi
npm run build
```

`check-golden` en önemlisi: on gerçek salonun geometrisi bit bit
korunuyor mu, cevabı orada.

---

## Bilinen sınırlar

| Sınır | Sonuç |
|---|---|
| Görselden **tek tek koltuk sayılamaz** | Sıra başına koltuk ya listeden gelir ya varsayımdır — işaretlenmeli |
| İlk turda konumlar tutmaz | `render` + `validate` döngüsüyle düzelir; 2–3 tur normal |
| Kapı verisi hiçbir görselde yok | Organizatörden ayrıca istenmeli |
| Excel doğrudan okunamaz | CSV dışa aktarımı istenmeli |
| Yayına alma yok | Operatör editörde onaylar |
| Sohbet için sunucu şart | `npm run dev` ile editör çalışır ama sohbet olmaz |
