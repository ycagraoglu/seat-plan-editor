/* ══════════════════════════════════════════════════════════════════════════
   BELGE DURUMU — reducer (A6.1)
   --------------------------------------------------------------------------
   PlanEditor.jsx'teki 47 useState'in HEPSİ buraya girmiyor — ölçüt şu:
   doğruluğu BİRDEN FAZLA ALANI ilgilendiren durum burada, saniyede 60 kez
   değişen imleç/sürükleme durumu (cursor, marq, draft…) PlanEditor.jsx'te
   useState olarak kalıyor (bkz. görev raporu, A6.1 — global reducer'a
   bağlamak 48.600 koltukluk tuvalde her fare hareketinde tüm ağacı yeniden
   render ederdi).

   Burada toplananlar: plan(lar) + geçmiş/gelecek + rev (otomatik kayıt
   tetikleyicisi) + seçim + görünüm + kat süzgeci + doğrulama/kalibrasyon/
   eşleştirme + kayıt durumu. Gerekçe: switchVenue eskiden 9 ayrı setState
   çağırıyordu (biri unutulursa sessiz hata); undo/redo plan+geçmiş+rev'i
   BİRLİKTE hareket ettirmeli; blok silinince seçim de düşmeli. Reducer'da
   bunların hepsi TEK eylem — yarım kalan geçiş diye bir şey yok.

   Saf, React'siz — doğrudan test edilebilir (bkz. test/unit/reducer.test.js).
   Araç tercihleri (tool, brush, tema…) BURADA DEĞİL — PlanEditor.jsx'te
   ayrı, tek bir useState nesnesinde; belgeden bağımsız oldukları için bu
   reducer'ın ilgi alanı dışında.
   ══════════════════════════════════════════════════════════════════════════ */

/** Geri-al geçmişinin üst sınırı — mevcut davranış: en fazla 40 kayıt
 *  (commit/finalizeDrag ikisi de son 39'u tutup yeni kaydı ekliyordu). */
export const MAX_HISTORY = 40;

/** setState'in fonksiyonel biçimiyle AYNI sözleşme: payload bir fonksiyonsa
 *  mevcut değerle çağrılır, değilse doğrudan kullanılır. PlanEditor.jsx'teki
 *  ~150 çağrı noktasının (setSelIds(x), setView((v) => ({...v,...})) gibi)
 *  reducer'a taşınırken DEĞİŞMEDEN çalışmasını bu sağlıyor. */
const resolve = (payload, current) => (typeof payload === "function" ? payload(current) : payload);

/** Başlangıç durumu. view, ilk açılan salonun home dikdörtgeni — bugünkü
 *  `useState(GS.home)` ile aynı değeri, salon anahtarı ÜZERİNDEN üretir
 *  (GS'e ayrı bir bağımlılık gerekmesin diye). */
export function initialState(venues, vk) {
  return {
    venues, vk,
    past: [], future: [], rev: 0,
    selIds: [], selShapeId: null, selSeat: null, selSeats: new Set(),
    view: venues[vk].home,
    levelFilter: "*",
    report: null, calib: null, match: null,
    saveState: "idle",
  };
}

export function reducer(state, action) {
  switch (action.type) {
    /* ── plan(lar) — düz alan güncellemesi (ör. localStorage'dan yükleme,
       salon silme, arka planda çatallama). setVenues'ün doğrudan karşılığı. */
    case "venues/set":
      return { ...state, venues: resolve(action.payload, state.venues) };
    case "vk/set":
      return { ...state, vk: resolve(action.payload, state.vk) };
    case "past/set":
      return { ...state, past: resolve(action.payload, state.past) };
    case "future/set":
      return { ...state, future: resolve(action.payload, state.future) };
    case "rev/set":
      return { ...state, rev: resolve(action.payload, state.rev) };

    /* ── düzenleme geçmişi ──────────────────────────────────────────
       commit: sıradan düzenleme. Şimdiki plan geçmişe düşer (40'ta
       sınırlı), gelecek silinir, yeni plan yürürlüğe girer, rev artar
       (otomatik kayıt efekti bunu dinliyor). */
    case "commit": {
      const plan = state.venues[state.vk];
      return {
        ...state,
        past: [...state.past.slice(-(MAX_HISTORY - 1)), plan],
        future: [],
        venues: { ...state.venues, [state.vk]: action.payload },
        rev: state.rev + 1,
      };
    }
    /* finalizeDrag: sürüklemenin checkpoint'i. Plan halihazırda sürükleme
       sırasında (venues/set ile, her onMove karesinde) güncellendi — tek
       eksik geri-al kaydı, bunu tek yerden yapar ki her sürükleme modu
       (move/moveShape/seat/handle/paint) ayrı ayrı unutmasın. Gerçekten
       değişiklik yoksa (salt tıklama) NO-OP: aynı state referansı geri
       döner, React re-render'ı atlar — geçmiş/kayıt boş yere kirlenmez. */
    case "finalizeDrag": {
      const plan = state.venues[state.vk];
      if (plan === action.payload) return state;
      return {
        ...state,
        past: [...state.past.slice(-(MAX_HISTORY - 1)), action.payload],
        future: [],
        rev: state.rev + 1,
      };
    }
    /* nudgeCommit: ok tuşuyla ince taşımanın (PlanEditor.jsx'teki nudge)
       geçişi. 800ms debounce PENCERESİ boyunca art arda basışlar TEK bir
       geri-al kaydına düşsün diye checkpoint payload'dan geliyor (timing
       kararı — lastNudge ref — PlanEditor.jsx'te kalıyor, reducer saf).
       ESKİDEN bu commit'ten AYRI, elle yazılmış bir setPast/setPlan/setRev
       üçlüsüydü ve future'ı TEMİZLEMİYORDU: geri alınmış bir dalı ok
       tuşuyla taşımak, yinelemeyle (⇧⌘Z) o terk edilmiş dalı diriltiyordu
       (bkz. görev raporu). commit'le AYNI kurala (future HER ZAMAN
       temizlenir, geçmiş MAX_HISTORY'de sınırlı — kendi sabiti yok) tek
       yerden uyar. */
    case "nudgeCommit": {
      const { plan: nextPlan, checkpoint } = action.payload;
      const plan = state.venues[state.vk];
      return {
        ...state,
        past: checkpoint ? [...state.past.slice(-(MAX_HISTORY - 1)), plan] : state.past,
        future: [],
        venues: { ...state.venues, [state.vk]: nextPlan },
        rev: state.rev + 1,
      };
    }
    /* undo/redo — ESKİDEN setPast'in updater'ı İÇİNDE setFuture+setPlan
       çağrılıyordu; React updater'ı saf olmak zorunda, StrictMode'da iki
       kez koşunca future'a çift kayıt giriyordu (bkz. görev raporu A6.1).
       Burada TEK geçiş, tanım gereği saf: reducer iki kez çağrılsa bile
       (StrictMode useReducer'ı da aynı şekilde iki kez dener) ikisi de
       AYNI girdiden AYNI çıktıyı üretir, biri atılır — yan etki YOK ki
       birikecek bir şey olsun. rev BİLEREK değişmiyor (mevcut davranış:
       geri al/yinele otomatik kaydı TETİKLEMEZ). */
    case "undo": {
      if (!state.past.length) return state;
      const plan = state.venues[state.vk];
      const prev = state.past[state.past.length - 1];
      return {
        ...state,
        past: state.past.slice(0, -1),
        future: [plan, ...state.future],
        venues: { ...state.venues, [state.vk]: prev },
      };
    }
    case "redo": {
      if (!state.future.length) return state;
      const plan = state.venues[state.vk];
      const next = state.future[0];
      return {
        ...state,
        past: [...state.past, plan],
        future: state.future.slice(1),
        venues: { ...state.venues, [state.vk]: next },
      };
    }

    /* ── salon değiştirme ───────────────────────────────────────────
       Ana salon seçici. Eskiden 9 ayrı setState — biri unutulursa sessiz
       hata; burada TEK geçiş. saveState/rev BİLEREK değişmiyor (mevcut
       davranış). */
    case "switchVenue": {
      const k = action.payload;
      return {
        ...state,
        vk: k,
        past: [], future: [],
        selIds: [], selShapeId: null, selSeat: null, selSeats: new Set(),
        levelFilter: "*",
        view: state.venues[k].home,
        report: null, calib: null, match: null,
      };
    }

    /* ── seçim ──────────────────────────────────────────────────── */
    /* Kural: seçim türleri (blok/şekil/koltuk) birbirini dışlar — biri
       etkinleşince DİĞER İKİSİ kendiliğinden düşer. Tek istisna aşağıda,
       selectSeat/selectSeats'in üstündeki notta.

       selectBlocks ESKİDEN sadece koltuk seçimini (selSeat/selSeats)
       bırakıyordu, selShapeId'ye HİÇ dokunmuyordu (bkz. görev raporu,
       HATA 2 — o zaman ölçülen tek belirti koltuk tarafıydı: koltuk
       çoklu-seçimi açıkken bir bloğa tıklamak selIds'i güncelliyordu ama
       panel selSeats.size>1'i selBlock'tan önce gösterdiği için —
       PlanEditor.jsx aside/props ~2970 — tıklama Esc'e kadar GÖRÜNMEZ
       kalıyordu). selShapeId tarafı da AYNI sınıf hataydı, sadece
       ölçülmemişti: PlanEditor.jsx'te setSelIds'i selShapeId temizliği
       OLMADAN çağıran en az 5 yer var — blok ağacı tıklaması (~2330),
       "kata göre seç" (~1980), "shape" aracıyla dikdörtgen çizme (~1853),
       finishPoly (~1897), "seat" aracının koltuğa tıklama dalı (~1648).
       Her biri kuralı AYRI AYRI unutmuş — bu görevin "kuralı bir yere
       yaz, her üretim noktasında geçerli olduğunu KANITLA" dersi tam
       burada bir daha çıktı. Kural artık TEK yerde: selectBlocks kendi
       karşıtı olan selShapeId'yi de temizliyor, çağıranın hatırlaması
       gerekmiyor (yukarıdaki 5 yerin çoğunda duran elle setSelShapeId(null)
       çağrıları artık gereksiz ama zararsız no-op — DOKUNMA listesindeki
       PlanEditor.jsx'i bu görev başka sebeple değiştirmediği sürece
       silinmedi).

       selectShape BİREBİR simetrik: blok VE koltuk seçimini bırakır
       (asıl HATA 2 — eskiden ikisine de dokunmuyordu, bir şekil seçmek
       önceki çoklu-koltuk seçimini panelde sessizce yutabiliyordu). */
    case "selectBlocks":
      return { ...state, selIds: resolve(action.payload, state.selIds), selShapeId: null, selSeat: null, selSeats: new Set() };
    case "selectShape":
      return { ...state, selShapeId: resolve(action.payload, state.selShapeId), selIds: [], selSeat: null, selSeats: new Set() };
    /* selectSeat/selectSeats BİLEREK selIds'e dokunmuyor — "seat" aracı
       blok+koltuğu BİRLİKTE seçili tutar (PlanEditor.jsx tool==="seat"
       pointerdown'ı: ÖNCE selectBlocks, SONRA selectSeat/selectSeats
       dispatch eder — sıra ÖNEMLİ, tersi olsaydı selectBlocks'un yeni
       selSeat temizliği az önce yazılan koltuk seçimini SİLERDİ; bkz.
       test/unit/reducer.test.js "'seat' aracının blok+tek-koltuk birlikte
       seçimi bozulmaz"). Aynı sebeple selShapeId'ye de dokunmuyor: tek
       gerçek çağıran zaten selectBlocks'tan HEMEN SONRA geliyor, o da artık
       selShapeId'yi kendisi temizliyor (yukarıda) — burada AYRICA temizlemek
       fazladan, davranışı değiştirmeyen bir no-op olurdu. */
    case "selectSeat":
      return { ...state, selSeat: resolve(action.payload, state.selSeat) };
    case "selectSeats":
      return { ...state, selSeats: resolve(action.payload, state.selSeats) };

    /* ── görünüm / kat süzgeci / doğrulama / kalibrasyon / eşleştirme /
       kayıt durumu — her biri tek bir alanlık düz güncelleme. */
    case "setView":
      return { ...state, view: resolve(action.payload, state.view) };
    case "setLevelFilter":
      return { ...state, levelFilter: resolve(action.payload, state.levelFilter) };
    case "setReport":
      return { ...state, report: resolve(action.payload, state.report) };
    case "setCalib":
      return { ...state, calib: resolve(action.payload, state.calib) };
    case "setMatch":
      return { ...state, match: resolve(action.payload, state.match) };
    case "setSaveState":
      return { ...state, saveState: resolve(action.payload, state.saveState) };

    default:
      return state;
  }
}
