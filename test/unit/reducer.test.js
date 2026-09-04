import { describe, it, expect } from "vitest";
import { reducer, initialState, MAX_HISTORY } from "../../src/ui/state/reducer.js";

/* Reducer plan'ın İÇİNİ hiç bilmiyor (opak değer) — testlerde gerçek
   core/venues yerine minik, tanınabilir fixture'lar yeterli. */
const plan = (key, blocks = []) => ({ key, blocks, shapes: [] });
const venuesFixture = () => ({
  a: { ...plan("a"), home: { x: 0, y: 0, w: 100, h: 100 } },
  b: { ...plan("b"), home: { x: 10, y: 10, w: 200, h: 200 } },
});

describe("initialState", () => {
  it("view'i aktif salonun home dikdörtgeninden alır, geri kalan alanlar boş/varsayılan", () => {
    const venues = venuesFixture();
    const s = initialState(venues, "b");
    expect(s.vk).toBe("b");
    expect(s.view).toBe(venues.b.home);
    expect(s.past).toEqual([]);
    expect(s.future).toEqual([]);
    expect(s.rev).toBe(0);
    expect(s.selIds).toEqual([]);
    expect(s.selShapeId).toBeNull();
    expect(s.selSeat).toBeNull();
    expect(s.selSeats).toEqual(new Set());
    expect(s.levelFilter).toBe("*");
    expect(s.report).toBeNull();
    expect(s.calib).toBeNull();
    expect(s.match).toBeNull();
    expect(s.saveState).toBe("idle");
  });
});

describe("commit", () => {
  it("şimdiki planı geçmişe düşürür, yeni planı yürürlüğe koyar, geleceği siler, rev'i artırır", () => {
    const s0 = initialState(venuesFixture(), "a");
    const before = s0.venues.a;
    const p1 = plan("a", [{ id: "b1" }]);
    const s1 = reducer(s0, { type: "commit", payload: p1 });
    expect(s1.venues.a).toBe(p1);
    expect(s1.past).toEqual([before]);
    expect(s1.future).toEqual([]);
    expect(s1.rev).toBe(1);
    /* saflık: s0 hiç değişmedi */
    expect(s0.venues.a).toBe(before);
    expect(s0.rev).toBe(0);
  });

  it("var olan geleceği siler (yeni bir dal açmak eskisini geçersiz kılar)", () => {
    let s = initialState(venuesFixture(), "a");
    const p1 = plan("a", [{ id: "b1" }]);
    const p2 = plan("a", [{ id: "b1" }, { id: "b2" }]);
    s = reducer(s, { type: "commit", payload: p1 });
    s = reducer(s, { type: "undo" }); // future=[p1]
    expect(s.future).toEqual([p1]);
    s = reducer(s, { type: "commit", payload: p2 }); // yeni dal — future silinir
    expect(s.future).toEqual([]);
    expect(s.venues.a).toBe(p2);
  });
});

describe("finalizeDrag", () => {
  it("gerçek değişiklik yoksa (aynı referans) NO-OP — aynı state referansı döner", () => {
    const s0 = initialState(venuesFixture(), "a");
    const samePlan = s0.venues.a;
    const s1 = reducer(s0, { type: "finalizeDrag", payload: samePlan });
    expect(s1).toBe(s0); // React bu durumda re-render'ı atlar
  });

  it("gerçek değişiklik varsa checkpoint düşer; venues'e KENDİSİ dokunmaz (plan sürüklemede zaten güncellendi)", () => {
    const s0 = initialState(venuesFixture(), "a");
    const before = s0.venues.a; // sürükleme başlangıcının anlık görüntüsü
    const dragged = plan("a", [{ id: "b1", x: 10 }]);
    /* sürükleme sırasında onMove'un yaptığı gibi: plan doğrudan güncellenir */
    const s1 = reducer(s0, { type: "venues/set", payload: (v) => ({ ...v, a: dragged }) });
    const s2 = reducer(s1, { type: "finalizeDrag", payload: before });
    expect(s2.past).toEqual([before]);
    expect(s2.future).toEqual([]);
    expect(s2.rev).toBe(1);
    expect(s2.venues.a).toBe(dragged);
  });
});

describe("nudgeCommit", () => {
  /* Koordinatörün doğruladığı gerçek hata: nudge'ın ESKİ hali (elle
     setPast/setPlan/setRev, future'ı TEMİZLEMEDEN) geri alınmış bir dalı
     ok tuşuyla taşıdıktan sonra yinelemenin (⇧⌘Z) o terk edilmiş, bayat
     dalı diriltmesine yol açıyordu. 4 adım: */
  it("geri alınmış dal, nudge'dan SONRA yinelemeyle dirilmez (future her nudge'da temizlenir)", () => {
    let s = initialState(venuesFixture(), "a");
    const p0 = s.venues.a;
    const pA = plan("a", [{ id: "b1" }]); // 1. bir düzenleme yap
    s = reducer(s, { type: "commit", payload: pA });
    expect(s.past).toEqual([p0]); expect(s.future).toEqual([]);

    s = reducer(s, { type: "undo" }); // 2. ⌘Z
    expect(s.venues.a).toBe(p0); expect(s.past).toEqual([]); expect(s.future).toEqual([pA]);

    const nudged = plan("a", [{ id: "b1", x: 1 }]); // 3. ok tuşuyla taşı (fresh — checkpoint)
    s = reducer(s, { type: "nudgeCommit", payload: { plan: nudged, checkpoint: true } });
    expect(s.venues.a).toBe(nudged); // taşıma uygulandı
    expect(s.past).toEqual([p0]);    // taşımadan ÖNCEKİ plan geçmişe düştü
    expect(s.future).toEqual([]);    // ESKİ HATA: burası [pA] kalıyordu — artık temiz

    const beforeRedo = s;
    s = reducer(s, { type: "redo" }); // 4. ⇧⌘Z
    expect(s).toBe(beforeRedo);       // future boş → NO-OP, pA'ya SIÇRAMAZ
    expect(s.venues.a).toBe(nudged);  // ok tuşuyla taşınmış hâlde KALDI
  });

  it("checkpoint=true: mevcut planı MAX_HISTORY sınırıyla geçmişe düşürür, planı ve rev'i günceller", () => {
    const s0 = initialState(venuesFixture(), "a");
    const before = s0.venues.a;
    const nudged = plan("a", [{ id: "b1", x: 1 }]);
    const s1 = reducer(s0, { type: "nudgeCommit", payload: { plan: nudged, checkpoint: true } });
    expect(s1.past).toEqual([before]);
    expect(s1.future).toEqual([]);
    expect(s1.venues.a).toBe(nudged);
    expect(s1.rev).toBe(1);
  });

  it("checkpoint=false: 800ms penceresindeki takip eden basış geçmişe YENİ kayıt eklemez, ama planı/rev'i günceller ve future'ı yine temizler", () => {
    let s = initialState(venuesFixture(), "a");
    const p0 = s.venues.a;
    const step1 = plan("a", [{ id: "b1", x: 1 }]);
    s = reducer(s, { type: "nudgeCommit", payload: { plan: step1, checkpoint: true } }); // ilk basış — checkpoint
    expect(s.past).toEqual([p0]);

    /* future'ı elle dolu bir duruma getiriyoruz (gerçek akışta undo'dan
       gelirdi) — amaç checkpoint=false'un future'ı YİNE DE temizlediğini
       izole görmek. */
    s = { ...s, future: [plan("a", [{ id: "bayat-dal" }])] };

    const step2 = plan("a", [{ id: "b1", x: 2 }]); // 800ms İÇİNDE ikinci basış — checkpoint YOK
    s = reducer(s, { type: "nudgeCommit", payload: { plan: step2, checkpoint: false } });
    expect(s.past).toEqual([p0]);     // yeni kayıt EKLENMEDİ (past DEĞİŞMEDİ)
    expect(s.future).toEqual([]);     // yine de temizlendi
    expect(s.venues.a).toBe(step2);
    expect(s.rev).toBe(2);
  });

  it("geçmiş sınırı: checkpoint'te de MAX_HISTORY'de sabitlenir (kendi ayrı sabiti yok)", () => {
    let s = initialState(venuesFixture(), "a");
    const plans = [];
    for (let i = 0; i < MAX_HISTORY + 1; i++) {
      const p = plan("a", [{ id: `b${i}` }]);
      plans.push(p);
      s = reducer(s, { type: "nudgeCommit", payload: { plan: p, checkpoint: true } });
    }
    expect(s.past.length).toBe(MAX_HISTORY);
    expect(s.past[0]).toBe(plans[0]);
  });
});

describe("undo/redo", () => {
  it("geçmiş/gelecek boşken NO-OP — aynı state referansı döner", () => {
    const s0 = initialState(venuesFixture(), "a");
    expect(reducer(s0, { type: "undo" })).toBe(s0);
    expect(reducer(s0, { type: "redo" })).toBe(s0);
  });

  it("art arda 3 commit + 3 undo + 3 redo başlangıç durumuna BİREBİR tutarlı döner", () => {
    let s = initialState(venuesFixture(), "a");
    const p0 = s.venues.a;
    const p1 = plan("a", [{ id: "b1" }]);
    const p2 = plan("a", [{ id: "b1" }, { id: "b2" }]);
    const p3 = plan("a", [{ id: "b1" }, { id: "b2" }, { id: "b3" }]);
    s = reducer(s, { type: "commit", payload: p1 });
    s = reducer(s, { type: "commit", payload: p2 });
    s = reducer(s, { type: "commit", payload: p3 });
    const afterCommits = s;
    expect(s.past).toEqual([p0, p1, p2]);

    s = reducer(s, { type: "undo" }); expect(s.venues.a).toBe(p2);
    s = reducer(s, { type: "undo" }); expect(s.venues.a).toBe(p1);
    s = reducer(s, { type: "undo" }); expect(s.venues.a).toBe(p0);
    expect(s.past).toEqual([]);
    expect(s.future).toEqual([p1, p2, p3]);

    /* sınırda: geçmiş boşken bir undo daha — no-op */
    const atOldest = s;
    expect(reducer(s, { type: "undo" })).toBe(atOldest);

    s = reducer(s, { type: "redo" }); expect(s.venues.a).toBe(p1);
    s = reducer(s, { type: "redo" }); expect(s.venues.a).toBe(p2);
    s = reducer(s, { type: "redo" }); expect(s.venues.a).toBe(p3);
    expect(s.past).toEqual([p0, p1, p2]);
    expect(s.future).toEqual([]);
    expect(s).toEqual(afterCommits); // tam tur — plan/geçmiş bire bir aynı

    /* sınırda: gelecek boşken bir redo daha — no-op */
    expect(reducer(s, { type: "redo" })).toBe(s);

    /* commit/finalizeDrag'ın aksine undo/redo rev'e DOKUNMAZ (mevcut davranış:
       geri al/yinele otomatik kaydı tetiklemez) */
    expect(s.rev).toBe(3);
  });
});

describe("undo/redo saflığı — A6.1 madde 2 düzeltmesi", () => {
  /* Eski kod: setPast'in updater'ı İÇİNDE setFuture+setPlan çağırıyordu.
     React bu updater'ı StrictMode'da (geliştirmede) iki kez çağırır; yan
     etkili bir updater'da bu future'a ÇİFT kayıt eklerdi. Saf bir reducer
     bu sınıf hatayı yapısal olarak ortadan kaldırır: AYNI girdiden yapılan
     iki bağımsız çağrı HER ZAMAN aynı, tek geçişlik sonucu üretir — biri
     atılsa da (React'in StrictMode'da yaptığı tam olarak bu) fark etmez. */
  it("aynı state'ten iki kez çağrılan undo AYNI sonucu üretir — future'da tek kayıt, iki değil", () => {
    let s = initialState(venuesFixture(), "a");
    const p1 = plan("a", [{ id: "b1" }]);
    s = reducer(s, { type: "commit", payload: p1 });

    const r1 = reducer(s, { type: "undo" }); // StrictMode'un "birinci deneme"si
    const r2 = reducer(s, { type: "undo" }); // "ikinci deneme" — AYNI girdi (s)
    expect(r1).toEqual(r2);
    expect(r1.future).toEqual([p1]); // İKİ kayıt değil, TEK
    expect(r2.future).toEqual([p1]);
  });

  it("aynı state'ten iki kez çağrılan redo AYNI sonucu üretir — past'ta tek kayıt, iki değil", () => {
    let s = initialState(venuesFixture(), "a");
    const p1 = plan("a", [{ id: "b1" }]);
    s = reducer(s, { type: "commit", payload: p1 });
    s = reducer(s, { type: "undo" });

    const r1 = reducer(s, { type: "redo" });
    const r2 = reducer(s, { type: "redo" });
    expect(r1).toEqual(r2);
    expect(r1.past).toEqual([s.venues.a]); // İKİ kayıt değil, TEK
    expect(r2.past).toEqual([s.venues.a]);
  });
});

describe("geçmiş sınırı (MAX_HISTORY)", () => {
  it(`${MAX_HISTORY + 1}. commit'te en eski kayıt düşer, geçmiş ${MAX_HISTORY}'te sabitlenir (FIFO)`, () => {
    let s = initialState(venuesFixture(), "a");
    const p0 = s.venues.a;
    const plans = [];
    for (let i = 0; i < MAX_HISTORY + 1; i++) {
      const p = plan("a", [{ id: `b${i}` }]);
      plans.push(p);
      s = reducer(s, { type: "commit", payload: p });
    }
    expect(s.past.length).toBe(MAX_HISTORY);
    expect(s.past).not.toContain(p0); // en eski (başlangıç) kaydı düştü
    expect(s.past[0]).toBe(plans[0]);
    expect(s.past[s.past.length - 1]).toBe(plans[MAX_HISTORY - 1]);
    expect(s.venues.a).toBe(plans[MAX_HISTORY]); // son commit her zaman yürürlükte
  });
});

describe("switchVenue", () => {
  it("sıfırladığı HER alanı sıfırlar; venues/rev/saveState'e dokunmaz (mevcut davranış)", () => {
    const venues = venuesFixture();
    const dirty = {
      ...initialState(venues, "a"),
      past: [plan("a")], future: [plan("a")],
      selIds: ["x"], selShapeId: "s1", selSeat: { bid: "x", r: 0, c: 0 }, selSeats: new Set(["x|0,0"]),
      levelFilter: "1", report: { total: 1, list: [] }, calib: { x0: 0 }, match: { file: "x" },
      rev: 5, saveState: "saved",
    };
    const s = reducer(dirty, { type: "switchVenue", payload: "b" });
    expect(s.vk).toBe("b");
    expect(s.past).toEqual([]);
    expect(s.future).toEqual([]);
    expect(s.selIds).toEqual([]);
    expect(s.selShapeId).toBeNull();
    expect(s.selSeat).toBeNull();
    expect(s.selSeats).toEqual(new Set());
    expect(s.levelFilter).toBe("*");
    expect(s.view).toBe(venues.b.home);
    expect(s.report).toBeNull();
    expect(s.calib).toBeNull();
    expect(s.match).toBeNull();
    /* switchVenue'nun BUGÜN de sıfırlamadığı alanlar — bunları da
       sıfırlamak davranış değişikliği olurdu (bkz. görev tanımı A6.1) */
    expect(s.rev).toBe(5);
    expect(s.saveState).toBe("saved");
    expect(s.venues).toBe(dirty.venues);
  });
});

describe("blok silince seçim temizlenir", () => {
  /* PlanEditor.jsx'teki silme akışı (Delete tuşu, panel "Sil" düğmesi)
     BUGÜN de commit + seçim-temizleme'yi AYRI dispatch ediyor (bkz.
     satır ~1732, 2570, 2578) — reducer'a taşınırken bu ikili DEĞİŞMEDİ.
     Test aynı sırayı izliyor: blok plandan düşer, seçim ayrıca temizlenir,
     sonuçta kalıntı seçim kalmadığını doğruluyor. */
  it("commit (bloksuz plan) + selectBlocks([]) sonrası kalıntı seçim kalmaz", () => {
    let s = initialState(venuesFixture(), "a");
    s = reducer(s, { type: "commit", payload: plan("a", [{ id: "b1" }]) });
    s = reducer(s, { type: "selectBlocks", payload: ["b1"] });
    expect(s.selIds).toEqual(["b1"]);

    s = reducer(s, { type: "commit", payload: plan("a", []) }); // blok silindi
    s = reducer(s, { type: "selectBlocks", payload: [] });      // seçim temizlendi

    expect(s.selIds).toEqual([]);
    expect(s.venues.a.blocks).toEqual([]);
  });

  it("aynı şekilde: tek şekil seçiliyken şekil silinince selectShape(null) seçimi temizler", () => {
    let s = initialState(venuesFixture(), "a");
    s = reducer(s, { type: "selectShape", payload: "s1" });
    expect(s.selShapeId).toBe("s1");
    s = reducer(s, { type: "selectShape", payload: null });
    expect(s.selShapeId).toBeNull();
  });
});

describe("selectBlocks koltuk seçimini bırakır (HATA 2)", () => {
  /* Kök neden: PlanEditor.jsx panel önceliği selSeats.size>1'i HER ZAMAN
     selBlock'tan önce gösteriyor (~2939). selectBlocks eskiden selSeats/
     selSeat'e hiç dokunmuyordu: koltuk çoklu-seçimi açıkken blok
     ağacından/tuvalden bir bloğa tıklamak selIds'i GÜNCELLİYORDU ama
     panel hâlâ "N koltuk seçili" gösterdiği için operatöre tıklama
     SESSİZCE yutulmuş gibi görünüyordu (bkz. görev raporu). Düzeltme:
     selectBlocks artık koltuk seçimini kendiliğinden temizliyor — seçim
     türleri birbirini dışlıyor. */
  it("blok seçilince önceki çoklu koltuk seçimi (selSeats) temizlenir", () => {
    let s = initialState(venuesFixture(), "a");
    s = reducer(s, { type: "selectSeats", payload: new Set(["b1|0,0", "b1|0,1"]) });
    expect(s.selSeats.size).toBe(2);

    s = reducer(s, { type: "selectBlocks", payload: ["b2"] });
    expect(s.selIds).toEqual(["b2"]);
    expect(s.selSeats.size).toBe(0);
  });

  it("tek koltuk seçimi (selSeat) de blok seçilince temizlenir", () => {
    let s = initialState(venuesFixture(), "a");
    s = reducer(s, { type: "selectSeat", payload: { bid: "b1", r: 0, c: 0 } });
    expect(s.selSeat).not.toBeNull();

    s = reducer(s, { type: "selectBlocks", payload: ["b2"] });
    expect(s.selSeat).toBeNull();
  });

  it("'seat' aracının blok+tek-koltuk birlikte seçimi bozulmaz (önce blok, sonra koltuk sırasıyla)", () => {
    /* PlanEditor.jsx'teki tool==="seat" pointerdown'ı artık BU sırayla
       dispatch ediyor (bkz. satır ~1611): önce selectBlocks, SONRA
       selectSeat/selectSeats. Ters sıra olsaydı selectBlocks'un yeni yan
       etkisi koltuk seçimini SİLERDİ — bu test o regresyonu yakalar. */
    let s = initialState(venuesFixture(), "a");
    s = reducer(s, { type: "selectBlocks", payload: ["b1"] });
    s = reducer(s, { type: "selectSeat", payload: { bid: "b1", r: 2, c: 3 } });
    s = reducer(s, { type: "selectSeats", payload: new Set(["b1|2,3"]) });

    expect(s.selIds).toEqual(["b1"]);
    expect(s.selSeat).toEqual({ bid: "b1", r: 2, c: 3 });
    expect(s.selSeats).toEqual(new Set(["b1|2,3"]));
  });
});

describe("value-veya-updater sözleşmesi (setState ile aynı)", () => {
  it("selectBlocks doğrudan değer VE fonksiyonel güncelleyici kabul eder", () => {
    let s = initialState(venuesFixture(), "a");
    s = reducer(s, { type: "selectBlocks", payload: ["x"] });
    expect(s.selIds).toEqual(["x"]);
    s = reducer(s, { type: "selectBlocks", payload: (prev) => [...prev, "y"] });
    expect(s.selIds).toEqual(["x", "y"]);
  });

  it("setView fonksiyonel güncelleyiciyle MEVCUT view'i okuyabilir (pan/zoom sözleşmesi)", () => {
    const venues = venuesFixture();
    let s = initialState(venues, "a");
    s = reducer(s, { type: "setView", payload: (v) => ({ ...v, x: v.x + 10 }) });
    expect(s.view).toEqual({ ...venues.a.home, x: venues.a.home.x + 10 });
  });

  it("tanınmayan eylem türünde state DEĞİŞMEDEN (aynı referansla) döner", () => {
    const s = initialState(venuesFixture(), "a");
    expect(reducer(s, { type: "bilinmeyen/eylem" })).toBe(s);
  });
});
