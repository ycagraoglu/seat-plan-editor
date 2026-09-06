# Codex brief — yapay zekâ katmanını ana uygulamaya taşımak

> **Önce [`CODEX-BRIEF.md`](CODEX-BRIEF.md)'i oku.** O belge editörün kendisini
> anlatıyor: kapsam sınırı, veri modeli, `src/core/**`'un alan bilgisi, depolama
> dikişi. Bu belge onun DEVAMI — editörü bir LLM'e açan katmanı anlatıyor
> (MCP, canlı görünüm, panel içi sohbet, sağlayıcı katmanı).
>
> Bu belge bir UYGULAMA TALİMATIDIR. Her maddenin gerekçesi yazılı, çünkü
> gerekçeyi bilmeden yapılan sadeleştirmeler bu katmanda sessiz veri kaybı
> üretiyor. "Neden böyle?" diye sorduğun her yerde cevabı aynı paragrafta bul.

---

## 0 · Ne inşa ediyorsun

Bir biletleme yönetim panelinde, salon oturma planı sayfasında **sohbet kutusu**.
Operatör *"Bursa Tayyare Kültür Merkezi'ni çiz"* yazar; model sunucuda çalışır,
editörün araçlarını çağırır, bloklar tuvalde canlı belirir; operatör izler ve
istediğinde devralır.

**İKİ AYRI YOL VAR, KARIŞTIRMA:**

| | stdio MCP | Panel içi sohbet |
|---|---|---|
| Kim için | Geliştirme (bu depoda çalışanlar) | **Canlı kullanım** |
| Modeli kim çalıştırır | Operatörün Claude Desktop / Codex'i | **Senin sunucun** |
| Operatör ne ayarlar | `.mcp.json` / `config.toml` | **Hiçbir şey** |
| Anahtar nerede | Operatörün makinesinde | Sunucuda, tarayıcıya **hiç gitmez** |

Ana uygulamaya taşıyacağın şey **ikinci sütun**. Birincisi geliştirme
konforu; kodu taşınıyor ama müşteriye görünmüyor.

**Yapmayacağın şey:** yayım aracı. Model plan çizer, doğrular, kaydeder —
**yayına gönderemez**. Bilet satılan bir sistemde bu sınır bilinçli ve
kaldırılmamalı.

---

## 1 · Mimari — katman katman

```
Tarayıcı (editör sayfası, login arkasında)
   │  POST /api/chat            "Tayyare'yi çiz"
   │  GET  /api/chat   1 sn/kez ← akış: mesajlar
   │  GET  /api/live   1 sn/kez ← plan + adım günlüğü + kilit
   ▼
server/index.mjs ── chat/oturumlar.mjs ── chat/dongu.mjs
                          (konuşma           (sağlayıcıdan
                           başına oturum)     bağımsız döngü)
                                                   │
                              ┌────────────────────┴──────┐
                              ▼                           ▼
                    chat/saglayici/*.mjs          chat/kopru.mjs
                    (anthropic·openai·gemini)     (süreç-içi MCP istemcisi)
                                                          │
                                                          ▼
                                              mcp/server.mjs → mcp/tools/**
                                                          │  29 araç
                                                          ▼
                                                    src/core/**
                                                    (saf: React yok, DOM yok)
```

### Dosya haritası — yapay zekâ katmanı

| Dosya | Satır | İşi |
|---|---|---|
| `mcp/server.mjs` | 37 | `createMcpServer()` + `INSTRUCTIONS`. **Taşımadan bağımsız** |
| `mcp/index.mjs` | 27 | stdio girişi. Taşımaya bağlanan TEK yer |
| `mcp/session.mjs` | 202 | "Sahne": tek aktif plan, `mutate()`, adım kaydı |
| `mcp/live.mjs` | 72 | Canlı görünüme yazma, `ai-` ad alanı |
| `mcp/render.mjs` | 196 | SVG→PNG, LOD, kat renkleri, altlık bindirmesi |
| `mcp/cli.mjs` | 116 | Hata ayıklama arayüzü (üretimde kullanılmaz) |
| `mcp/tools/*.mjs` | 1206 | 29 araç. **Tek kaynak** |
| `chat/kopru.mjs` | 72 | MCP ↔ sohbet. Nötr sonuç üretir |
| `chat/dongu.mjs` | 93 | Araç döngüsü. Sağlayıcıdan bağımsız |
| `chat/oturumlar.mjs` | 102 | Konuşma başına oturum, akış, arka plan turu |
| `chat/saglayici/*.mjs` | 264 | Üç sağlayıcı + şema temizleyici + seçici |
| `server/index.mjs` | 324 | Depo + yayım + canlı görünüm + sohbet rotaları |

---

## 2 · MCP sunucusu

### 2.1 Kuruluş — taşıma katmanı AYRI

`mcp/server.mjs` sunucuyu kurar ve **hangi taşımayla konuşulacağını bilmez**:

```js
export function createMcpServer() {
  const session = new Session();
  const server = new McpServer({ name: "seat-plan-editor", version: "0.1.0" },
                               { instructions: INSTRUCTIONS });
  registerTools(server, session);
  return { server, session };
}
```

Bu ayrım **kasıtlı ve kritik**: stdio'ya bağlanan tek satır `mcp/index.mjs:27`.
Sohbet katmanı aynı `createMcpServer()`'ı çağırıp `InMemoryTransport` ile
bağlanıyor — ağ yok, port yok, süreç yok. Testler de aynı şeyi yapıyor.

**Ana uygulamada bu ayrımı koru.** HTTP taşıması eklemek istersen `mcp/index.mjs`'in
kardeşi bir dosya yazarsın; `mcp/server.mjs` ve araçlar hiç değişmez.

### 2.2 `INSTRUCTIONS` — sistem talimatı tek kaynakta

`mcp/server.mjs:9-27`, 19 satır. Modelin çalışma biçimini anlatıyor
(santimetre, kat yolu, kural bulgularını oku, sonunda ne varsaydığını söyle).

**Sohbet katmanı bunu import ediyor**, ikinci bir sistem metni yazmıyor.
Claude Desktop'tan bağlanan model ile panelin sohbeti AYNI talimatı okuyor.
İki yere yazarsan ayrışırlar ve hangi davranışın nereden geldiğini bir daha
bilemezsin.

### 2.3 `Session` — "sahne"

```js
class Session {
  constructor() { this.plan = null; this.kesildi = false; this.yeniCizim = false; }
  need()                  // aktif plan yoksa NET hata
  set(plan)               // planı değiştir — YENİ ÇİZİM SAYILMAZ
  yeni(plan)              // YENİ ÇİZİM: kesildi temizlenir, yeniCizim işaretlenir
  derive(plan)            // metas + gates + findings — türetilmiş her şey tek yerden
  mutate(fn, baslik)      // TEK HUNİ: her değişiklik buradan geçer
  adim(ne, turetilmis)    // operatörün göreceği adım kaydı
  summaryText(baslik, d)  // LLM'e dönen kısa özet
  summaryData()           // plan_summary/validate'in ham verisi
}
```

#### `mutate()` — her şeyin geçtiği yer

```js
mutate(fn, baslik) {
  const plan = this.need();
  const next = fn(plan) || plan;
  this.plan = next;
  const d = this.derive(next);                    // TEK derive
  canliYaz(next, this.adim(baslik, d), this.yeniCizim, () => { this.kesildi = true; });
  this.yeniCizim = false;
  return this.summaryText(baslik, d);
}
```

Üç şey aynı anda oluyor ve **üçü de zorunlu**:

1. **Tek `derive`.** Hem LLM'e dönen özet hem operatörün göreceği adım kaydı
   aynı hesaptan çıkıyor. İki kez türetmek 52.000 koltukluk planda her araç
   çağrısını iki katına çıkarır.
2. **Canlı görünüme yazma** — beklenmiyor (aşağıda).
3. **Özet dönüyor.** LLM ayrı bir `validate` çağırmadan da geri bildirim
   alıyor: kural bulguları HEDEF DEĞER taşıyor ("en az 90 cm gerekir") ve model
   kendini onlarla düzeltiyor. Bu, Blender'ın MCP eklentisinde olmayan şey —
   orada modelin tek geri bildirimi ekran görüntüsü.

#### `set()` ve `yeni()` — ayrımı bozma

| | `set(plan)` | `yeni(plan)` |
|---|---|---|
| Kim çağırıyor | `set_underlay`, `mcp/cli.mjs` oturum geri yükleme | `create_plan`, `open_sample`, `open_plan` |
| `kesildi` | **DOKUNMAZ** | temizler |
| `yeniCizim` | dokunmaz | işaretler |

**Neden:** KES bir ÇİZİMİ durduruyor, oturumu değil. Altlık yüklemek KES'i geri
almamalı. Ama operatör "şunu bırak, yenisini çiz" diyebilmeli. `set()` her
şeyi temizleseydi `set_underlay` çağırmak kilidi kaldırırdı.

---

## 3 · Araç yazma sözleşmesi

Yeni bir araç eklerken uyacağın kurallar. Bunlar soğuk LLM testlerinde
(kod tabanını hiç görmemiş modellerle) bulunan hatalardan çıktı.

### 3.1 İskelet

```js
server.registerTool("arac_adi", {
  title: "Kısa başlık",
  description: [ /* satır satır, \n ile birleşiyor */ ].join("\n"),
  inputSchema: { alan: z.string().describe("Ne olduğu") },
}, async (a) => metin(session.mutate((plan) => {
  /* saf dönüşüm: plan → yeni plan */
  return { ...plan, blocks: [...plan.blocks, yeniBlok] };
}, `İnsan dilinde ne yapıldı`)));
```

### 3.2 Açıklama modelin TEK bilgi kaynağı

Araç açıklaması dokümantasyon değil, **arayüz**. Model kodu görmüyor.

**Ölçülmüş hata:** `set_numbering`'in açıklamasında olmayan bir enum değeri
(`mirror`) yazılıydı. Sessizce `odd` gibi davrandı; gerçek şema (`center`)
hiç açılmamıştı. Soğuk test edilen model bu yüzden bir sırayı iki bloğa
bölmek zorunda kaldı ve **olmayan bir orta geçit** tarif eden bir salon üretti.

Kurallar:
- Enum değerlerini **tek tek yaz** ve ne yaptıklarını göster
- Gerçek salon örneği ver ("Şükrü Saracoğlu Maraton Alt: sıra 4–25")
- Yapılmaması gerekeni de yaz ("Sırayı iki bloğa BÖLME; bölersen sahte bir
  dar geçit hatası doğar")
- Açıklamayı değiştirdiğinde **davranışın hâlâ eşleştiğini doğrula**

### 3.3 Eksik zorunlu alanı SESSİZCE GEÇME

```js
const eksik = [];
if (a.kind === "table") { if (!a.seats) eksik.push("seats (masa etrafı koltuk sayısı)"); }
else {
  if (!a.rows) eksik.push("rows (sıra sayısı)");
  if (a.kind === "fan" && a.r0 == null) eksik.push("r0 (ilk sıra yarıçapı, cm)");
  if (a.kind === "grid" && !a.cols && !a.counts) eksik.push("cols ya da counts");
}
if (eksik.length) throw new Error(`${a.kind} bloğu için eksik alan: ${eksik.join(" · ")}.`
  + ` Verilmezse blok kurulur ama koltukları yanlış olur.`);
```

**Neden:** `rows`suz bir grid 0 koltuk üretip "Blok eklendi" diyordu. LLM
çalıştı sanıyordu. **Sessiz başarısızlık bu projedeki en pahalı hata sınıfı** —
araç sınırında kesiliyor.

### 3.4 Sonucu GÖSTER, "ayarlandı" deme

`set_numbering` sonuçtaki sıra etiketlerini geri veriyor:

```
Numaralandırma: SALON-ON
  sıralar: A · B · C · …4 sıra… · H · I · J
```

**Neden:** "ayarlandı" yazısı yanlış şema uygulandığında da çıkıyordu.
Doğrulanamayan bir başarı mesajı, başarısızlıktan beterdir.

### 3.5 Adım başlığı OPERATÖR DİLİNDE

`mutate`'in ikinci parametresi paneldeki akışa düşüyor. Şema dili sızmamalı:

```js
const TUR = { grid: "Izgara", fan: "Yelpaze", table: "Masalı" };
const BOLUM_ADI = { floor: "parter/zemin", balcony: "balkon", box: "loca", … };
const SEKIL_ADI = { stage: "Sahne", pitch: "Saha", door: "Kapı", … };
```

**Ölçülmüş hata:** çeviri sırasında `array_blocks`'un başlığını *"9 kopyaya
çoğaltıldı"* yaptım. `count` TOPLAM blok sayısı (asıl dahil) — 9 verince 8
kopya çıkıyor. Doğrusu *"9 bloğa"*. Panelde okuyunca görüldü, testle bağlandı.

---

## 4 · Canlı görünüm

Operatör yapay zekâ çizerken tuvalde oluşumu izliyor, düzenleme kilitli.

### 4.1 Yazma yolu — `mcp/live.mjs`

```js
export function canliYaz(plan, adim, yeni, onKesildi) {
  const taban = process.env.SEAT_EDITOR_API;
  if (!taban || !plan) return;                    // (1)
  const govde = JSON.stringify({
    plan: { ...stripUnderlay(plan), key: canliAnahtar(plan.key) },   // (2)(3)
    adim, yeni: !!yeni,
  });
  bekleyen = fetch(`${taban}/live`, { method: "PUT", … })
    .then((r) => { if (r.status === 409 && onKesildi) onKesildi(); })  // (4)
    .catch(() => { /* sunucu kapalı — çizim devam etmeli */ });        // (5)
}
```

**(1) Tamamen isteğe bağlı.** `SEAT_EDITOR_API` yoksa hiç ağa çıkılmıyor.
Sunucusuz akış (çiz → `export_plan` → dosya) aynen çalışıyor.

**(2) Altlık soyuluyor.** Ölçüm: Bursa Tayyare altlığı 66 KB base64, plan
14.6 KB. Her yazmada göndermek yükü 4.5 katına çıkarırdı.

**(3) `ai-` AD ALANI — bunu kaldırma.**
`open_sample` planı yerleşik salonun anahtarıyla tutuyor (`gs`, `fener`).
O anahtara canlı yazmak editörün `isProtectedSample` çatallamasını tetikler
ve **yeniden yüklemede `mergeSavedVenues` planı SESSİZCE ATAR** — yapay
zekânın bütün işi kaybolur. Ön ek bunu kökten engelliyor; sunucu da ayrıca
denetliyor (`ai-` ile başlamayan canlı yazma 400).

**(4) 409 = operatör devraldı.** Yutulmuyor.

**(5) Ağ hatası YUTULUYOR.** Canlı görünüm bir GÖRÜNTÜLEME özelliği; sunucu
kapalı diye `add_block`'un patlaması, çalışan bir ürünü göstermelik özellik
uğruna kırmak olur.

> **Test tuzağı:** bu `.catch()`'i kaldırınca ilk yazdığım test YEŞİL
> kalıyordu — işlenmemiş bir söz reddi araç çağrısını düşürmüyor, ama
> gerçekte MCP sürecini öldürür. Test artık `unhandledRejection` dinliyor.

### 4.2 Kilit — SAHİBE DEĞİL ÇİZİME bağlı

Sunucu tarafında tek satırlık durum (`editor_prefs`'te `__live` anahtarı):

```json
{ "key": "ai-tayyare", "name": "…", "at": "2026-…", "revoked": false, "gunluk": [ … ] }
```

| Rota | İş |
|---|---|
| `PUT /api/live` | `{plan, adim, yeni}`. Aynı anahtar `revoked` ve `yeni` değilse → **409**. Değilse planı `editor_plans`'a upsert eder, kilidi tazeler, adımı günlüğe ekler (son 60) |
| `GET /api/live` | `{aktif, key, name, at, yasSaniye, gunluk}`. **Yaş sunucuda hesaplanır** — tarayıcı saat kayması yanıltmasın |
| `DELETE /api/live` | KES: `revoked = true` |

**Neden sahibe değil çizime:** `mcp/cli.mjs` her çağrıda YENİ bir `Session`
kuruyor. Oturum kimliğine bağlı bir iptal, bir sonraki çağrıda yeni kimlikle
geri alınırdı ve KES hiçbir şey ifade etmezdi. İptal edilen şey ÇİZİM: aynı
anahtara yazan 409 alır, **`yeni: true` bayrağı taşıyan** (yani
`create_plan`/`open_sample` sonrası ilk yazma) iptali düşürür.

> Bunu tarayıcıda uçtan uca denerken buldum: sunucu yazmaları reddediyordu
> (tuval güvendeydi) ama LLM her seferinde "Blok eklendi" görüyordu — boşluğa
> çiziyor ve haberi yok. `mcp/cli.mjs` artık kesik bayrağını oturum dosyasında
> taşıyor ve kaydetmeden önce uçuştaki yazmayı bekliyor.

### 4.3 Editör tarafı — kilit TEK KAPIDA

Editörde ~40 mutasyon girişi var (tuval sürüklemeleri, klavye, panel alanları,
başlık düğmeleri). **Ölçtüm: hepsi 11 reducer eylemine düşüyor.** `setPlan` da
`paintSeat` de `venues/set`'e iniyor.

```js
const CANLI_KAPALI = new Set([
  "commit", "nudgeCommit", "venues/set", "undo", "redo",   // planı değiştirenler
  "finalizeDrag", "rev/set", "past/set", "future/set",     // geçmiş/otomatik kayıt
  "switchVenue", "vk/set",                                 // canlı görünümden kaçış
]);

export function reducer(state, action) {
  if (state.live && CANLI_KAPALI.has(action.type)) return state;
  …
}
```

Üç öbek, üç ayrı sebep:
- **Planı değiştirenler** — asıl mesele
- **Geçmiş/rev yazanlar** — `rev` otomatik kaydı tetikler ve canlı akışla
  yarışıp **yazma döngüsü** kurar
- **`vk` taşıyanlar** — canlı görünümden kaçış yolu açardı; tek çıkış KES
  olmalı, yoksa operatör salon seçicisiyle kaçar, yoklama onu geri sürükler

**Kilit DIŞINDA kalanlar bilerek serbest:** seçim, kaydırma, yakınlaştırma,
kat süzgeci. İzlerken kamerayı gezdirebilmek bu modun bütün anlamı.

### 4.4 Üç canlı eylem

```js
case "live/start":   // switchVenue'nun sıfırlama kümesinin AYNISI + vk geçişi
case "live/apply":   // YALNIZ venues[key]; past/future'a dokunmaz, rev'i ARTIRMAZ
case "live/stop":    // live = null
```

**`live/start` geçmişi TEMİZLİYOR.** `past`/`future` başka bir anahtarın anlık
görüntülerini tutuyor olabilir; KES'ten sonraki ilk `⌘Z` o eski planı BU
anahtarın üstüne yazardı.

**`live/apply` `rev`'i ARTIRMIYOR.** Artırsaydı 1 sn'lik otomatik kayıt efekti
her karede tetiklenip sunucuya geri yazardı — yapay zekânın yazdığıyla yarışan
bir döngü. İkinci emniyet olarak otomatik kayıt efektinde de `if (live) return`.

**`adoptPlan` KULLANILMAZ.** O fonksiyon her blok/şekil kimliğini `nid()` ile
yeniden üretiyor; canlı güncellemede her karede tüm SVG yeniden doğar ve seçim
ölür.

### 4.5 Yoklama, akış (SSE) değil

Editör saniyede bir `GET /api/live` çağırıyor; `at` değişmediyse planı çekmiyor.

**Neden SSE değil:**
- Sunucu 195 satırlık, bağlantı durumu tutmayan saf bir istek→yanıt fonksiyonu;
  açık akış onu durumlu yapar
- Testlerdeki `srv.close()` açık bir SSE akışında **asılı kalır**
- Olayın kaynağı zaten AYRI BİR SÜREÇ (MCP); SSE yalnız son adımı ≤1 sn
  kısaltır, oysa modelin araç turu saniyeler sürüyor

Gecikme dert olursa aynı rotayı `?since=` ile uzun yoklamaya çevir — istemci
tarafı aynı kalır.

### 4.6 "Bitti" değil "durdu"

25 sn yazma gelmezse şerit yeşile döner ve bir kez mesaj çıkar.

**"Bitti" DEMİYORUZ.** Yapay zekânın işini bitirdiğini bilmenin yolu yok:
sessizlik ya bitiştir, ya uzun bir düşünmedir, ya ölmüş bir süreçtir. Operatöre
doğru olan bilgi *"N saniyedir değişiklik yok"*. Kilit kendiliğinden AÇILMIYOR.

---

## 5 · Sohbet katmanı

### 5.1 Köprü — araç tanımları İKİ KEZ YAZILMAZ

```js
export async function baglan() {
  const { server, session } = createMcpServer();
  const [a, b] = InMemoryTransport.createLinkedPair();
  const client = new Client({ name: "panel-sohbet", version: "0" });
  await Promise.all([server.connect(b), client.connect(a)]);
  return { client, server, session, kapat: … };
}
```

Sonra `client.listTools()` → şemalar. **Bu, bu katmanın bel kemiği.**
29 aracın şeması, açıklaması ve doğrulaması `mcp/tools/**` içinde ve soğuk
LLM testleriyle defalarca düzeltildi. Sohbet için ikinci bir tanım yazmak, o
düzeltmelerin bir kopyasını daha bakmak demek. Bir araç değişince sohbet
tarafında **hiçbir şey yapılmıyor**.

### 5.2 Nötr sonuç

`aracCagir()` sağlayıcı biçimi değil, ortak bir şekil döndürüyor:

```js
{ id, ad, metin, gorseller: [{ data, mimeType }], hata }
```

**Görsel metinden AYRI duruyor** çünkü üç sağlayıcının ikisinde araç yanıtı
görsel taşıyamıyor — oralarda görsel ayrı bir tur olarak gidiyor. Ayrımı
köprüde yapmak, her adaptörün aynı kararı yeniden vermesini önlüyor.

**Bilinmeyen içerik türü SESSİZCE DÜŞMÜYOR** — `[desteklenmeyen içerik: X]`
diye metne giriyor ki model eksik aldığını bilsin.

### 5.3 Döngü

```js
for (;;) {
  const y = await o.s.cagir(o.istemci, { model, system: INSTRUCTIONS, mesajlar, araclar });
  o.s.asistanEkle(o.mesajlar, y.ham);              // HAM yanıt geri konuyor
  if (y.dur === "red")   return { durum: "red", … };
  if (y.dur === "bitti") return { durum: "bitti", metin: y.metin, … };
  if (sayac + y.cagrilar.length > ARAC_SINIRI) return { durum: "sinir", … };
  for (const c of y.cagrilar) {                    // SIRAYLA
    onOlay({ ad: c.ad, girdi: c.girdi });
    sonuclar.push(await aracCagir(o.client, c.id, c.ad, c.girdi));
    sayac++;
  }
  o.s.sonucEkle(o.mesajlar, sonuclar);
  o.s.gorselEkle(o.mesajlar, sonuclar.flatMap((s) => s.gorseller));
}
```

**Hazır "tool runner" kullanılmıyor.** Her SDK'nın kendi araç koşucusu var ama
hepsi araçların o SDK'nın biçiminde tanımlanmasını bekliyor; bizimkiler MCP'den
geliyor.

**Ham yanıtın TAMAMI geri konuyor** (yalnız metin değil): düşünme ve araç
blokları sonraki turda modele lazım.

**`ARAC_SINIRI = 40`.** Kaçak bir döngü bir biletleme panelinde hem para hem
çöp plan demek. Sınır aşılınca durup **sebebini söylüyor** — sessizce kesmiyor.

#### Araçlar sırayla — GERÇEK gerekçe

> Önce "eşzamanlı çalıştırmak veri yarışı doğurur" diye yazmıştım.
> **ÖLÇTÜM, DOĞRU DEĞİL:** `session.mutate` baştan sona senkron ve JS tek iş
> parçacıklı, iki çağrı içeride birbirine giremiyor. `Promise.all` ile bağımlı
> iki çağrıyı (`add_block` + onu güncelleyen `update_block`) denedim, ikisi de
> doğru sırada işlendi.
>
> Sıra yine korunuyor ama gerçek gerekçeyle: (1) doğruluk taşıma katmanının
> işleme düzenine bağlı kalmasın — o bir uygulama ayrıntısı, sözleşme değil;
> (2) adım günlüğü operatöre sırayla aksın. **Determinizm tercihi, hata
> düzeltmesi değil.**

Bu notu sildirme. Yanlış bir gerekçe, doğru bir karardan daha tehlikeli:
biri gelip "yarış yokmuş" diye sırayı bozar.

### 5.4 Sağlayıcı adaptörü — sözleşme

Her adaptör şunları dışa veriyor:

```js
export const ad;                    // "anthropic" | "openai" | "gemini"
export const varMi;                 // () => anahtarı tanımlı mı
export const VARSAYILAN_MODEL;
export const istemciKur;            // () => SDK istemcisi
export const araclariCevir;         // (mcpTools) => sağlayıcı biçimi
export const kullaniciEkle;         // (mesajlar, metin)
export const gorselEkle;            // (mesajlar, gorseller) — ayrı tur ya da no-op
export async function cagir;        // → { dur, metin, cagrilar:[{id,ad,girdi}], ham, sebep }
export const asistanEkle;           // (mesajlar, ham)
export const sonucEkle;             // (mesajlar, nötrSonuclar)
```

**Mesaj geçmişinin BİÇİMİ adaptöre ait.** Döngü `mesajlar`'ı opak tutuyor;
Anthropic `[{role, content}]`, OpenAI aynı ama `role:"tool"` ayrı mesajlarla,
Gemini `[{role, parts}]`.

| | Anthropic | OpenAI | Gemini |
|---|---|---|---|
| Araç biçimi | `{name, description, input_schema}` | `{type:"function", function:{…, parameters}}` | `[{functionDeclarations:[…]}]` |
| Araç sonucu | `tool_result` bloğu (**görsel taşır**) | `{role:"tool", tool_call_id, content}` | `{functionResponse:{name, response}}` |
| Görsel | araç sonucunun İÇİNDE | **ayrı tur** (`image_url`) | **ayrı tur** (`inlineData`) |
| Şema | JSON Schema aynen | sadeleştirilmiş | **sadeleştirme ŞART** |
| Red durumu | `stop_reason:"refusal"` | yok | yok |

### 5.5 Şema temizleyici — `chat/saglayici/sema.mjs`

MCP şemaları zod'dan geliyor, JSON Schema 2020-12. Katı sağlayıcılar bunu
almıyor. **Ölçüm:**

| Yapı | Kaç yerde | Ne yapılıyor |
|---|---|---|
| `exclusiveMinimum` (sayı) | **19** | Düşüyor, bilgi açıklamaya taşınıyor |
| `type: ["number","string"]` | **3 araçta** (`first` alanı) | Tekleşiyor; `string` tercih ediliyor |
| `$schema`, `additionalProperties` | çeşitli | Atılıyor |

**Kısıt düşerken bilgi açıklamaya taşınıyor:**

```js
if (sema.exclusiveMinimum !== undefined) notlar.push(`${sema.exclusiveMinimum}'dan büyük olmalı`);
```

Sessizce atmak modelin `rows: 0` göndermesine kapı açardı. `string` tercih
sebebi: sayıyı metin olarak göndermek her zaman çalışıyor (`first: "101"`),
tersi çalışmıyor.

### 5.6 Sağlayıcı seçimi

```js
export const HEPSI = [anthropic, openai, gemini];
export function sec(istek = process.env.SOHBET_SAGLAYICI) { … }
export const acikMi = () => { try { return !!sec(); } catch { return false; } };
```

`SOHBET_SAGLAYICI` verilmişse o (anahtarı yoksa NET hata). Verilmemişse hangi
anahtar tanımlıysa o, **yukarıdaki sırayla**. Sıra bir tercih değil, tahmin
edilebilir olsun diye sabit.

### 5.7 Konuşma oturumları — `chat/oturumlar.mjs`

```js
const konusmalar = new Map();     // sohbetId → { oturum, akis, calisiyor, sonKullanim }
const OMUR_MS = 30 * 60 * 1000;
const AKIS_SINIRI = 400;
```

**Her konuşmanın KENDİ MCP oturumu var** (kendi planı, kendi geçmişi) — iki
operatör birbirinin çizimini ezmiyor.

**Tur ARKA PLANDA koşuyor:** `POST` hemen dönüyor (202), panel saniyede bir
okuyor. Uzun bir turda tarayıcı bir HTTP isteğini dakikalarca açık tutmuyor.

**Hata YUTULMUYOR, akışa düşüyor** — yoksa operatör sonsuza dek "çalışıyor"
görür ve neden durduğunu hiç öğrenemez. Ve ham SDK hatası gösterilmiyor:

```js
if (/authentication|401/i.test(m)) return "Yapay zekâ servisine bağlanılamadı: "
  + "API anahtarı geçersiz. Sunucudaki ANTHROPIC_API_KEY doğru mu?";
```

Tanınmayan hata **yutulmuyor**, kısaltılıp geçiriliyor.

**Akış bellekte, veritabanında değil.** Bir tur dakikalar sürüyor ve saniyede
bir okunuyor; her okumada diske gitmenin karşılığı yok. Kalıcı olması gereken
şey PLAN, o zaten `editor_plans`'ta. Sohbet dökümü kaybolursa çizim kaybolmaz.

---

## 6 · Sunucu rotaları

| Yol | Metot | İş |
|---|---|---|
| `/api/plans` | GET | Anahtar listesi. **`?detay=1`** ile `{key,name,blok,guncelleme}` |
| `/api/plans/:key` | GET · PUT · DELETE | Taslak belge. PUT `underlay`'i sunucuda soyar |
| `/api/prefs/:key` | GET · PUT | Tercihler |
| `/api/live` | GET · PUT · DELETE | Canlı görünüm + kilit + adım günlüğü |
| `/api/chat/durum` | GET | `{acik}` — **anahtarın kendisi ASLA dönmez** |
| `/api/chat` | GET · POST | Akış okuma · tur başlatma |
| `/api/plans/:key/publish` | POST | SINIR: taslak → kanonik tablolar |
| `/api/versions` … | GET | Yayımlanmış kanonik veri (okuma) |

**`?detay=1` neden sorgu parametresi:** `/api/plans/<şey>` deseni her şeyi
anahtar sanıyor; `/api/plans/ozet` bir plan anahtarı gibi görünürdü.
Parametresiz çağrı depolama sözleşmesinin beklediği düz diziyi aynen
döndürüyor — `list()` hiç değişmedi, `test/store-contract.js` hakem.

### Kimlik dikişi — DEĞİŞTİRECEĞİN YER

```js
const tenant = String(req.headers["x-tenant-id"] || TENANT);
```

`handler`'ın başında, `publish(db, plan, key, tenant)` imzasında. CORS
`allow-headers` listesinde. **Auth YAZILMADI** — ana uygulama kendi oturum
katmanından dolduracak. Başlık yoksa tek kiracılı davranış sürüyor.

```js
// Ana uygulamanın proxy'si:
headers["x-tenant-id"] = oturum.tenantId;
```

### Şema kurulumu tekrarlanabilir olmalı

`db/schema.sql`'deki 14 `CREATE TABLE` ve 4 `CREATE INDEX` **`IF NOT EXISTS`
taşıyor**. Taşımıyorsa sunucu yalnız BOŞ bir dosyaya kalkar; var olan
veritabanına bağlanınca "table already exists" ile ölür. Canlı görünüm
sunucuyu zorunlu kıldığı için bu, kullanıcının çarpacağı ilk duvar.

---

## 7 · Editör entegrasyonu

### 7.1 Panel — sohbet ve adım günlüğü TEK AKIŞ

Sağ panel 292 px; iki kutu sığmaz ve operatörün okuduğu şey zaten tek bir
hikâye. `SohbetPaneli` iki kaynağı zaman damgasıyla birleştiriyor:

- **Mesajlar** sohbet akışından (`GET /api/chat`)
- **Adımlar** canlı günlükten (`GET /api/live` → `gunluk`)

Sohbetin kendi `arac` satırları **atılıyor** — aynı olayın zengin hâli
(koltuk sayısı, kural bulguları) günlükte var, ikisini de göstermek tekrar
olurdu.

### 7.2 İki yoklama efekti

```js
useEffect(() => { if (Store.driver !== "api" || !Store.liveGet) return; … }, []);
useEffect(() => { if (Store.driver !== "api" || !Store.sohbetDurum) return; … }, []);
```

`localStorage` kurulumunda ikisi de hiç açılmıyor; editör sunucusuz aynen
çalışıyor.

### 7.3 Depolama sözleşmesi — sınırı koru

| Sözleşme (beş metot) | Sözleşmenin ÜSTÜNDE |
|---|---|
| `list` `load` `save` `remove` `pref` | `publish` `liveGet` `liveStop` `sohbetDurum` `sohbetGonder` `sohbetOku` |

Sözleşme metotları **throw etmez** (ağ kopunca `null`/`false` döner).
Üstündekiler API sürücüsüne özel; `localStorage` sürücüsünde yok, editör
`Store.liveGet` var mı diye bakıyor. `test/store-contract.js` yalnız beş
metodu sınıyor — fazladan metotlar görünmez.

---

## 8 · Ortam değişkenleri

| Değişken | Nerede okunuyor | İşi |
|---|---|---|
| `ANTHROPIC_API_KEY` | `chat/saglayici/anthropic.mjs` | Claude |
| `OPENAI_API_KEY` | `chat/saglayici/openai.mjs` | GPT |
| `GEMINI_API_KEY` / `GOOGLE_API_KEY` | `chat/saglayici/gemini.mjs` | Gemini |
| `SOHBET_SAGLAYICI` | `chat/saglayici/index.mjs` | Açık seçim |
| `SOHBET_MODEL` | openai/gemini adaptörleri | Model adı |
| `SEAT_EDITOR_API` | `mcp/live.mjs`, `mcp/tools/plan.mjs` | MCP'nin depoya bakacağı adres |
| `TENANT_ID` | `server/index.mjs` | Varsayılan kiracı |
| `PORT` / `API_PORT` | `server/index.mjs` / `scripts/live.mjs` | **Ayrı tutuldu** |
| `DB_FILE` | `server/index.mjs` | SQLite dosyası |
| `MCP_SESSION` | `mcp/cli.mjs` | Hata ayıklama oturum dosyası |
| `VITE_API_BASE` | `src/store/index.js` | Editörün sürücü seçimi |

**`API_PORT` neden ayrı:** `scripts/live.mjs` dışarıdaki `PORT`'u miras
alıyordu; editörü çalıştıran kabuk onu ayarlamışsa (önizleme koşucuları
ayarlıyor) sunucuyla vite AYNI porta gidiyordu. Ölçtüm, öyle oldu.

---

## 9 · Tuzaklar — bize çarpanlar, sana çarpmasın

| # | Tuzak | Belirti | Koruma |
|---|---|---|---|
| 1 | `auto_gates` kapı yokken "atandı" diyordu | Kapısız plan teslim edilmek üzereydi | Ön koşul araç sınırında kesiliyor |
| 2 | `add_shape type=pitch` 0×0 saha üretiyordu | Açıklama "ölçü nizamnameden gelir" diyordu ama sözlük React dosyasındaydı | Ölçüler `src/core/pitches.js`'te, UI ve MCP ortak |
| 3 | `plan_summary` şekil ölçüsünü göstermiyordu | Model 2 numaralı hatayı GÖREMİYORDU | Özet `w`/`h` taşıyor |
| 4 | `seatDir` iki numaralandırma şemasında yok sayılıyordu | İki gerçek salon ters gelenek kullanıyor; karıştırmak bileti yanlış koltuğa gönderir | `center`/`center-in` aynalanıyor |
| 5 | `mcp/cli.mjs` oturumu `session.set()` çağırmadan yüklüyordu | `absorbIds` koşmuyor, tüm yeni bloklar aynı kimliği alıyordu | Yükleme `set()`'ten geçiyor |
| 6 | KES süreç sınırını aşmıyordu | Sunucu reddediyordu ama LLM "eklendi" görüyordu | Bayrak oturum dosyasında taşınıyor |
| 7 | Şerit sonsuza dek "çiziyor" diyordu | Bitti mi düşünüyor mu ayırt edilemiyordu | 25 sn sonra "durdu" + mesaj |
| 8 | `git checkout` ile sabotaj geri alma | Commit edilmemiş işi siler | Sabotaj için yedek dosya kullan |
| 9 | Yanlış gerekçeli doğru karar | "Paralel = veri yarışı" — ölçünce doğru değildi | Ölçmeden gerekçe yazma |

**Ortak ders:** bu katmanda hataların çoğu **sessiz**. Kod patlamıyor, test
yeşil kalıyor, model "başardım" diyor. Her yeni davranış için sor: *bu
bozulursa bir şey kırılır mı, yoksa sadece yanlış mı olur?* İkincisiyse
kesecek bir kapı koy.

---

## 10 · Test stratejisi

| Paket | Ne kanıtlıyor |
|---|---|
| `test/mcp/tools.test.js` | Araç yüzeyi — şema doğrulaması dahil, GERÇEK MCP yolundan |
| `test/mcp/rebuild-sureyya.test.js` | **Kabul testi:** Süreyya Operası yalnız araç çağrılarıyla sıfırdan kuruluyor ve altın dosyayla eşleşiyor |
| `test/mcp/live.test.js` | İki sürecin dikişi: canlı yazma, KES, `ai-` ad alanı, sunucu kapalıyken çizim aksamıyor |
| `test/mcp/stdio.test.js` | Gerçek süreç + gerçek boru (import hatası, büyük PNG) |
| `test/chat/kopru.test.js` | Nötr sonuç, şema temizleyici, sağlayıcı seçimi |
| `test/chat/dongu.test.js` | **Üç sağlayıcı, aynı senaryolar** — soyutlamanın tuttuğunun kanıtı |
| `test/chat/rota.test.js` | Rota sözleşmesi, anahtar sızmıyor, hata akışa düşüyor |
| `scripts/check-golden.mjs` | **On gerçek salonun geometrisi bit bit değişmedi** |

### Sabotaj disiplini

Yeni bir değişmez eklediğinde **onu bilerek boz ve testin kırıldığını gör.**
Bu oturumda dört kez test yazdım ki boşluğun etrafından geçiyordu:

- Görsel eşlemesi testi geri çağrı sırasını ölçüyordu, yürütme sırasını değil
- "Sunucu kapalıyken" testi `.catch()` kalkınca da yeşil kalıyordu
- `apiStore` `describe` toplanırken kuruluyordu (`base` henüz `undefined`)
- Sahte model isteği referansla saklıyordu, dizi sonradan büyüyordu

Sabotaj yakalamıyorsa **test yanlıştır**, kod değil.

---

## 11 · Sırayla ne yap

1. **Çekirdek ve editör** — `CODEX-BRIEF.md`. Bu bitmeden aşağısı anlamsız.
2. **MCP sunucusu** — `mcp/server.mjs`, `mcp/session.mjs`, `mcp/tools/**`.
   *Kapı:* `rebuild-sureyya` geçiyor.
3. **Depo sunucusu** — `/api/plans`, `/api/prefs`. Şema `IF NOT EXISTS`.
   *Kapı:* `store-contract` beş metotla geçiyor.
4. **Canlı görünüm** — `/api/live`, `mcp/live.mjs`, reducer kilidi, yoklama.
   *Kapı:* iki süreç, tarayıcıda bloklar canlı beliriyor, KES durduruyor.
5. **Sohbet** — `chat/kopru.mjs`, `chat/dongu.mjs`, `chat/oturumlar.mjs`, rotalar.
   *Kapı:* sahte modelle döngü testi geçiyor.
6. **Sağlayıcılar** — üç adaptör + şema temizleyici.
   *Kapı:* üç sağlayıcı aynı senaryolarla geçiyor.
7. **Panel** — tek akışlı sohbet bileşeni.
   *Kapı:* tarayıcıda uçtan uca.
8. **Kimlik** — `x-tenant-id` dikişini kendi oturum katmanına bağla.
   *Kapı:* iki kiracı birbirinin planını görmüyor.

---

## 12 · Neyi DEĞİŞTİRME

| Kural | Neden |
|---|---|
| Araç tanımları tek kaynakta (`mcp/tools/**`) | Sohbet katmanı `listTools()` ile okuyor. İkinci tanım ayrışma başlatır |
| Sistem talimatı tek kaynakta (`INSTRUCTIONS`) | İki yol aynı davranışı okumalı |
| Yayım aracı yok | Çıktı taslak; yayın kararı operatörde |
| `ai-` ad alanı | Operatörün kaydı ezilmiyor |
| Kilit çizime bağlı, sahibe değil | Oturum kimliğine bağlarsan KES anlamsızlaşır |
| Araçlar sırayla | Determinizm + okunur günlük |
| Ağ hatası yutulur, 409 yutulmaz | Görüntüleme özelliği ürünü kırmamalı |
| Anahtar sunucuda | Tarayıcıya gitmemeli |
| Sözleşme beş metot | `localStorage` sürücüsü ayakta kalmalı |

---

## 13 · Sorman gerekenler

Bunları kendin karara bağlama:

1. **Sağlayıcı ve model** — hangisi, hangi hesap, kim ödüyor? Maliyet ve veri
   yeri ticari karar.
2. **Oturum ömrü** — 30 dk yeterli mi? Çok sunuculu kurulumda yapışkan oturum
   mu, paylaşımlı durum mu?
3. **Araç sınırı** — 40 sizin iş yükünüz için doğru mu?
4. **Sohbet dökümü saklanacak mı?** Şu an bellekte. Denetim gerekiyorsa
   veritabanına almak gerekir — hangi saklama süresiyle?
5. **Kimlik başlığı adı** — `x-tenant-id` sizin standardınıza uyuyor mu?
6. **Kullanıcı başına kota** — bir operatör günde kaç tur çalıştırabilir?
7. **A seçeneği istenir mi?** Operatörün kendi Claude Desktop'ını sizin
   sunucunuza HTTP MCP ile bağlaması. Ayrı iş: token üretimi, yetkilendirme,
   panelde bağlantı ekranı.

---

## Ek · Hızlı doğrulama

```bash
npx vitest run                  # 825 test
node scripts/check-golden.mjs   # 10/10 AYNI — geometri değişmedi
npm run build

curl localhost:8787/api/chat/durum         # {"acik":true}
node mcp/cli.mjs tools | grep -c "^── "    # 29
```

`check-golden` en önemlisi. On gerçek mekânın (386 koltukluk Süreyya'dan
52.838 koltukluk Şükrü Saracoğlu'na) geometrisi bit bit korunuyor mu, cevabı
orada. Yapay zekâ katmanı çekirdeğe hiç dokunmamalı; bu betik onun kanıtı.
