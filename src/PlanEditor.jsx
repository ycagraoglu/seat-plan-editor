import React, { useState, useReducer, useMemo, useRef, useCallback, useEffect } from "react";
import { RAD, DEF, prep, rowPts, toWorld, toLocal, polarPt, buildMeta, buildSeats, resolveSeatKind, seatKindWidth, legacyAtToKind, DEFAULT_SEAT_KIND, sectionPath, resolveBlockSectionId, resolvePlanSections } from "./core/geometry.js";
import { offsetPoly } from "./core/polygon.js";
import { reLabel, relabelPatch, relevelPatch, freeLabel, DEF_NUM } from "./core/labels.js";
import { linearArray, radialArray, arrayPreview, alignSetup, alignDelta } from "./core/arrays.js";
import { DEF_TPL, ID_TOKENS, parseCSV, mapColumns, seatKey, matchSeats, applyAdoptedIds } from "./core/identity.js";
import { diffPlans, stripUnderlay, planFingerprint, planHome } from "./core/plan.js";
import { gateMap, autoGates } from "./core/gates.js";
import { nid } from "./core/ids.js";
import { buildSeatsPayload } from "./core/export.js";
import { buildDbPayload, dbSeatRows } from "./core/db-export.js";
import { Store } from "./store/index.js";
import { buildCtx, runRules } from "./core/rules.js";
import { BUILTINS, EMPTY } from "./venues/index.js";
import { buildStadiumTemplate, buildHallTemplate } from "./venues/templates.js";
import { mergeSavedVenues, isProtectedSample, forkSample, stampSchema } from "./core/schema.js";
import { reducer, initialState } from "./ui/state/reducer.js";
import { selectPlan, selectLevels, selectLevelCounts, selectTotalSeats, selectSelectedBlocks, levelMatches, selectBlockLevels, deleteTarget } from "./ui/state/selectors.js";

/* ══════════════════════════════════════════════════════════════════════════
   OTURMA PLANI EDİTÖRÜ · v7
   --------------------------------------------------------------------------
   Kapsam: geometri + kimlik. Fiyat, etkinlik, müsaitlik YOK. Birim: cm.

   v7: plan.json içe aktarma · kalibrasyon · tuval tutamakları · doğrulama
   v8'de gelen:
   1. KOLTUK NİTELİKLERİ — tekerlekli sandalye, refakatçi, görüş kısıtlı,
      teknik alan. Blok seviyesinde varsayılan, koltuk seviyesinde
      istisna, "Nitelik boya" aracıyla toplu uygulama.
      Kategoriden bağımsızdır: kategori fiyat etiketi, nitelik koltuğun
      fiziksel gerçeği. Biletleme sistemi ikisini ayrı kullanır.
   2. DİZİ ÖNİZLEME — doğrusal ve radyal dizi, Uygula'dan önce hayalet
      dış hatlarla tuvalde gösteriliyor.
   v9'da gelen:
   1. KAPI–BLOK İLİŞKİSİ — kapı artık etiket değil, blok listesi taşıyan
      bir nesne. Biletin üstüne basılacak kapı bilgisi buradan çıkıyor.
   2. SÜRÜMLEME VE YAYIN — taslak/yayın ayrımı, sürüm geçmişi ve iki sürüm
      arası koltuk farkı. Kritik soru şu: bu değişiklik hangi koltuk
      kimliklerini yok ediyor? Satılmış biletin karşılığı odur.
   ══════════════════════════════════════════════════════════════════════════ */

const SEAT_BUDGET = 3500;







/* ─────────────────────────  DİZİ DÖNÜŞÜMLERİ  ───────────────────────── */



/* ─────────────────────────  SABİTLER  ───────────────────────── */


/* ─────────────────────────  ARAÇ SİMGELERİ  ─────────────────────────
   16'lık ızgarada, 1.4 kalınlık, dolgusuz. Hepsi aynı elden çıksın diye
   tek bir çizim diliyle: köşeler keskin, uçlar açık.
   ─────────────────────────────────────────────────────────────────── */

const ICONS = {
  select: [{d:"M7.904 17.563a1.2 1.2 0 0 0 2.228 .308l2.09 -3.093l4.907 4.907a1.067 1.067 0 0 0 1.509 0l1.047 -1.047a1.067 1.067 0 0 0 0 -1.509l-4.907 -4.907l3.113 -2.09a1.2 1.2 0 0 0 -.309 -2.228l-13.582 -3.904l3.904 13.563"}],
  pan: [{d:"M18 9l3 3l-3 3"},{d:"M15 12h6"},{d:"M6 9l-3 3l3 3"},{d:"M3 12h6"},{d:"M9 18l3 3l3 -3"},{d:"M12 15v6"},{d:"M15 6l-3 -3l-3 3"},{d:"M12 3v6"}],
  grid: [{d:"M4 5a1 1 0 0 1 1 -1h4a1 1 0 0 1 1 1v4a1 1 0 0 1 -1 1h-4a1 1 0 0 1 -1 -1l0 -4"},{d:"M14 5a1 1 0 0 1 1 -1h4a1 1 0 0 1 1 1v4a1 1 0 0 1 -1 1h-4a1 1 0 0 1 -1 -1l0 -4"},{d:"M4 15a1 1 0 0 1 1 -1h4a1 1 0 0 1 1 1v4a1 1 0 0 1 -1 1h-4a1 1 0 0 1 -1 -1l0 -4"},{d:"M14 15a1 1 0 0 1 1 -1h4a1 1 0 0 1 1 1v4a1 1 0 0 1 -1 1h-4a1 1 0 0 1 -1 -1l0 -4"}],
  fan: [{d:"M11 12a1 1 0 1 0 2 0a1 1 0 1 0 -2 0"},{d:"M16.924 11.132a5 5 0 1 0 -4.056 5.792"},{d:"M3 12a9 9 0 1 0 9 -9"}],
  row: [{d:"M4 6a2 2 0 0 1 2 -2h12a2 2 0 0 1 2 2v12a2 2 0 0 1 -2 2h-12a2 2 0 0 1 -2 -2l0 -12"},{d:"M4 12l16 0"}],
  seat: [{d:"M5 11a2 2 0 0 1 2 2v2h10v-2a2 2 0 1 1 4 0v4a2 2 0 0 1 -2 2h-14a2 2 0 0 1 -2 -2v-4a2 2 0 0 1 2 -2"},{d:"M5 11v-5a3 3 0 0 1 3 -3h8a3 3 0 0 1 3 3v5"},{d:"M6 19v2"},{d:"M18 19v2"}],
  seatEd: [{d:"M7 7h-1a2 2 0 0 0 -2 2v9a2 2 0 0 0 2 2h9a2 2 0 0 0 2 -2v-1"},{d:"M20.385 6.585a2.1 2.1 0 0 0 -2.97 -2.97l-8.415 8.385v3h3l8.385 -8.415"},{d:"M16 5l3 3"}],
  brush: [{d:"M3 21v-4a4 4 0 1 1 4 4h-4"},{d:"M21 3a16 16 0 0 0 -12.8 10.2"},{d:"M21 3a16 16 0 0 1 -10.2 12.8"},{d:"M10.6 9a9 9 0 0 1 4.4 4.4"}],
  shape: [{d:"M3 5a2 2 0 0 1 2 -2h14a2 2 0 0 1 2 2v14a2 2 0 0 1 -2 2h-14a2 2 0 0 1 -2 -2v-14"}],
  poly: [{d:"M10 5a2 2 0 1 0 4 0a2 2 0 1 0 -4 0"},{d:"M17 8a2 2 0 1 0 4 0a2 2 0 1 0 -4 0"},{d:"M3 11a2 2 0 1 0 4 0a2 2 0 1 0 -4 0"},{d:"M13 19a2 2 0 1 0 4 0a2 2 0 1 0 -4 0"},{d:"M6.5 9.5l3.5 -3"},{d:"M14 5.5l3 1.5"},{d:"M18.5 10l-2.5 7"},{d:"M13.5 17.5l-7 -5"}],
  measure: [{d:"M17 3l4 4l-14 14l-4 -4l14 -14"},{d:"M16 7l-1.5 -1.5"},{d:"M13 10l-1.5 -1.5"},{d:"M10 13l-1.5 -1.5"},{d:"M7 16l-1.5 -1.5"}],
  cal: [{d:"M19.875 12c.621 0 1.125 .512 1.125 1.143v5.714c0 .631 -.504 1.143 -1.125 1.143h-15.875a1 1 0 0 1 -1 -1v-5.857c0 -.631 .504 -1.143 1.125 -1.143h15.75"},{d:"M9 12v2"},{d:"M6 12v3"},{d:"M12 12v3"},{d:"M18 12v3"},{d:"M15 12v2"},{d:"M3 3v4"},{d:"M3 5h18"},{d:"M21 3v4"}],
  image: [{d:"M15 8h.01"},{d:"M3 6a3 3 0 0 1 3 -3h12a3 3 0 0 1 3 3v12a3 3 0 0 1 -3 3h-12a3 3 0 0 1 -3 -3v-12"},{d:"M3 16l5 -5c.928 -.893 2.072 -.893 3 0l5 5"},{d:"M14 14l1 -1c.928 -.893 2.072 -.893 3 0l3 3"}],
  table: [{d:"M11 12a1 1 0 1 0 2 0a1 1 0 1 0 -2 0"},{d:"M3 12a9 9 0 1 0 18 0a9 9 0 1 0 -18 0"}],
  info: [{d:"M9 11a3 3 0 1 0 6 0a3 3 0 0 0 -6 0"},{d:"M17.657 16.657l-4.243 4.243a2 2 0 0 1 -2.827 0l-4.244 -4.243a8 8 0 1 1 11.314 0"}],
  undo: [{d:"M9 13l-4 -4l4 -4"},{d:"M5 9h7a4 4 0 1 1 0 8h-1"}],
  redo: [{d:"M15 13l4 -4l-4 -4"},{d:"M19 9h-7a4 4 0 1 0 0 8h1"}],
};

/* Tabler Icons (MIT) — 24'lük ızgara, 2 kalınlık, yuvarlak uçlar.
   Parça biçimleri: {d} düz yol · {c} daire · {d,s,dx,dy} ölçekli grup */
const IconParts = ({ parts }) => parts.map((x, i) => {
  const t = x.s ? `translate(${x.dx || 0} ${x.dy || 0}) scale(${x.s})` : undefined;
  return x.c
    ? <circle key={i} cx={x.c[0]} cy={x.c[1]} r={x.c[2]} transform={t} />
    : <path key={i} d={x.d} transform={t} />;
});

const Icon = ({ n }) => (
  <svg className="ic" viewBox="0 0 24 24" fill="none" aria-hidden="true">
    <IconParts parts={ICONS[n] || []} />
  </svg>
);

/* ─────────────────────────  MEKÂN İŞARETLERİ  ─────────────────────────
   24'lük ızgarada, dolgusuz, araç rayındaki simgelerle aynı çizgi dili.
   Salon planında yön bulmayı sağlayan öğeler: tuvalet, giriş, acil çıkış,
   merdiven, asansör, büfe, ilk yardım…
   ───────────────────────────────────────────────────────────────────── */

/* İşaret ikonları. İki kaynak bir arada:
   · img → public/poi/*.png (kullanıcının verdiği icons8 seti). Siyah çizgi
     PNG'ler; koyu temada görünmez olmasınlar diye ham gösterilmiyorlar —
     tuvalde SVG filtresi (feFlood + feComposite, alfayı koruyup rengi
     temadan alır), palette CSS mask ile boyanıyorlar. Böylece vektör
     ikonlarla aynı tema/seçim davranışını gösteriyorlar.
   · p → gömülü SVG çizgileri (Tabler). Yeni sette karşılığı OLMAYAN
     türler bunlarla kalıyor: tuvaletler, satış, ilk yardım, ışık.
     Tuvalet bir mekânda en kritik işaret, ikonu yok diye türü silmek
     doğru olmazdı. */
const POI = {
  wc: { label: "Tuvalet", p: [{d:"M10 16v5",s:0.62,dx:-3.4,dy:4.6},{d:"M14 16v5",s:0.62,dx:-3.4,dy:4.6},{d:"M9 9h6l-1 7h-4l-1 -7",s:0.62,dx:-3.4,dy:4.6},{d:"M5 11c1.333 -1.333 2.667 -2 4 -2",s:0.62,dx:-3.4,dy:4.6},{d:"M19 11c-1.333 -1.333 -2.667 -2 -4 -2",s:0.62,dx:-3.4,dy:4.6},{d:"M10 4a2 2 0 1 0 4 0a2 2 0 1 0 -4 0",s:0.62,dx:-3.4,dy:4.6},{d:"M10 16v5",s:0.62,dx:6.5,dy:4.6},{d:"M14 16v5",s:0.62,dx:6.5,dy:4.6},{d:"M8 16h8l-2 -7h-4l-2 7",s:0.62,dx:6.5,dy:4.6},{d:"M5 11c1.667 -1.333 3.333 -2 5 -2",s:0.62,dx:6.5,dy:4.6},{d:"M19 11c-1.667 -1.333 -3.333 -2 -5 -2",s:0.62,dx:6.5,dy:4.6},{d:"M10 4a2 2 0 1 0 4 0a2 2 0 1 0 -4 0",s:0.62,dx:6.5,dy:4.6}] },
  wcMen: { label: "Erkek WC", p: [{d:"M10 16v5"},{d:"M14 16v5"},{d:"M9 9h6l-1 7h-4l-1 -7"},{d:"M5 11c1.333 -1.333 2.667 -2 4 -2"},{d:"M19 11c-1.333 -1.333 -2.667 -2 -4 -2"},{d:"M10 4a2 2 0 1 0 4 0a2 2 0 1 0 -4 0"}] },
  wcWomen: { label: "Kadın WC", p: [{d:"M10 16v5"},{d:"M14 16v5"},{d:"M8 16h8l-2 -7h-4l-2 7"},{d:"M5 11c1.667 -1.333 3.333 -2 5 -2"},{d:"M19 11c-1.667 -1.333 -3.333 -2 -5 -2"},{d:"M10 4a2 2 0 1 0 4 0a2 2 0 1 0 -4 0"}] },
  entrance: { label: "Giriş", img: "enter", p: [{d:"M13 12v.01"},{d:"M3 21h18"},{d:"M5 21v-16a2 2 0 0 1 2 -2h6m4 10.5v7.5"},{d:"M21 7h-7m3 -3l-3 3l3 3"}] },
  exit: { label: "Acil çıkış", img: "emergency-exit", p: [{d:"M13 12v.01"},{d:"M3 21h18"},{d:"M5 21v-16a2 2 0 0 1 2 -2h7.5m2.5 10.5v7.5"},{d:"M14 7h7m-3 -3l3 3l-3 3"}] },
  stairs: { label: "Merdiven", img: "stairs-up", p: [{d:"M22 5h-5v5h-5v5h-5v5h-5"}] },
  elevator: { label: "Asansör", img: "elevator", p: [{d:"M5 5a1 1 0 0 1 1 -1h12a1 1 0 0 1 1 1v14a1 1 0 0 1 -1 1h-12a1 1 0 0 1 -1 -1l0 -14"},{d:"M10 10l2 -2l2 2"},{d:"M10 14l2 2l2 -2"}] },
  escal: { label: "Yürüyen merdiven", img: "escalator", p: [{d:"M19.5 5h-2.672a2 2 0 0 0 -1.414 .586l-8.414 8.414h-2.5a2.5 2.5 0 1 0 0 5h3.672a2 2 0 0 0 1.414 -.586l8.414 -8.414h1.5a2.5 2.5 0 0 0 0 -5"}] },
  food: { label: "Restoran", img: "restaurant", p: [{d:"M19 3v12h-5c-.023 -3.681 .184 -7.406 5 -12m0 12v6h-1v-3m-10 -14v17m-3 -17v3a3 3 0 1 0 6 0v-3"}] },
  bar: { label: "Bar", img: "cocktail", p: [{d:"M8 21h8"},{d:"M12 15v6"},{d:"M5 5a7 2 0 1 0 14 0a7 2 0 1 0 -14 0"},{d:"M5 5v.388c0 .432 .126 .853 .362 1.206l5 7.509c.633 .951 1.88 1.183 2.785 .517c.191 -.141 .358 -.316 .491 -.517l5 -7.509c.236 -.353 .362 -.774 .362 -1.206v-.388"}] },
  beer: { label: "Büfe", img: "beer", p: [{d:"M9 21h6a1 1 0 0 0 1 -1v-3.625c0 -1.397 .29 -2.775 .845 -4.025l.31 -.7c.556 -1.25 .845 -2.253 .845 -3.65v-4a1 1 0 0 0 -1 -1h-10a1 1 0 0 0 -1 1v4c0 1.397 .29 2.4 .845 3.65l.31 .7a9.931 9.931 0 0 1 .845 4.025v3.625a1 1 0 0 0 1 1"},{d:"M6 8h12"}] },
  cafe: { label: "Kafe", img: "cafe", p: [{d:"M3 14c.83 .642 2.077 1.017 3.5 1c1.423 .017 2.67 -.358 3.5 -1c.83 -.642 2.077 -1.017 3.5 -1c1.423 -.017 2.67 .358 3.5 1"},{d:"M8 3a2.4 2.4 0 0 0 -1 2a2.4 2.4 0 0 0 1 2"},{d:"M12 3a2.4 2.4 0 0 0 -1 2a2.4 2.4 0 0 0 1 2"},{d:"M3 10h14v5a6 6 0 0 1 -6 6h-2a6 6 0 0 1 -6 -6v-5"},{d:"M16.746 16.726a3 3 0 1 0 .252 -5.555"}] },
  shop: { label: "Satış", p: [{d:"M6.331 8h11.339a2 2 0 0 1 1.977 2.304l-1.255 8.152a3 3 0 0 1 -2.966 2.544h-6.852a3 3 0 0 1 -2.965 -2.544l-1.255 -8.152a2 2 0 0 1 1.977 -2.304"},{d:"M9 11v-5a3 3 0 0 1 6 0v5"}] },
  aid: { label: "İlk yardım", p: [{d:"M8 8v-2a2 2 0 0 1 2 -2h4a2 2 0 0 1 2 2v2"},{d:"M4 10a2 2 0 0 1 2 -2h12a2 2 0 0 1 2 2v8a2 2 0 0 1 -2 2h-12a2 2 0 0 1 -2 -2l0 -8"},{d:"M10 14h4"},{d:"M12 12v4"}] },
  access: { label: "Engelli erişimi", img: "wheelchair", p: [{d:"M3 16a5 5 0 1 0 10 0a5 5 0 1 0 -10 0"},{d:"M17 19a2 2 0 1 0 4 0a2 2 0 1 0 -4 0"},{d:"M19 17a3 3 0 0 0 -3 -3h-3.4"},{d:"M3 3h1a2 2 0 0 1 2 2v6"},{d:"M6 8h11"},{d:"M15 8v6"}] },
  info: { label: "Danışma", img: "info", p: [{d:"M3 12a9 9 0 1 0 18 0a9 9 0 0 0 -18 0"},{d:"M12 9h.01"},{d:"M11 12h1v4h1"}] },
  ticket: { label: "Bilet", img: "ticket", p: [{d:"M15 5l0 2"},{d:"M15 11l0 2"},{d:"M15 17l0 2"},{d:"M5 5h14a2 2 0 0 1 2 2v3a2 2 0 0 0 0 4v3a2 2 0 0 1 -2 2h-14a2 2 0 0 1 -2 -2v-3a2 2 0 0 0 0 -4v-3a2 2 0 0 1 2 -2"}] },
  cloak: { label: "Vestiyer", img: "hanger", p: [{d:"M14 6a2 2 0 1 0 -4 0c0 1.667 .67 3 2 4h-.008l7.971 4.428a2 2 0 0 1 1.029 1.749v.823a2 2 0 0 1 -2 2h-14a2 2 0 0 1 -2 -2v-.823a2 2 0 0 1 1.029 -1.749l7.971 -4.428"}] },
  warn: { label: "Uyarı", img: "error", p: [{d:"M12 9v4"},{d:"M10.363 3.591l-8.106 13.534a1.914 1.914 0 0 0 1.636 2.871h16.214a1.914 1.914 0 0 0 1.636 -2.87l-8.106 -13.536a1.914 1.914 0 0 0 -3.274 0"},{d:"M12 16h.01"}] },
  spot: { label: "Işık", p: [{d:"M5 21h9"},{d:"M10 21l-7 -8l8.5 -5.5"},{d:"M13 14c-2.148 -2.148 -2.148 -5.852 0 -8c2.088 -2.088 5.842 -1.972 8 0l-8 8"},{d:"M11.742 7.574l-1.156 -1.156a2 2 0 0 1 2.828 -2.829l1.144 1.144"},{d:"M15.5 12l.208 .274a2.527 2.527 0 0 0 3.556 0c.939 -.933 .98 -2.42 .122 -3.4l-.366 -.369"}] },
  smoke: { label: "Sigara alanı", img: "smoking", p: [{d:"M12 10.941c2.333 -3.308 .167 -7.823 -1 -8.941c0 3.395 -2.235 5.299 -3.667 6.706c-1.43 1.408 -2.333 3.294 -2.333 5.588c0 3.704 3.134 6.706 7 6.706c3.866 0 7 -3.002 7 -6.706c0 -1.712 -1.232 -4.403 -2.333 -5.588c-2.084 3.353 -3.257 3.353 -4.667 2.235"}] },
  parking: { label: "Otopark", img: "parking", p: [{d:"M3 5a2 2 0 0 1 2 -2h14a2 2 0 0 1 2 2v14a2 2 0 0 1 -2 2h-14a2 2 0 0 1 -2 -2v-14"},{d:"M10 16v-8h2.667c.736 0 1.333 .895 1.333 2s-.597 2 -1.333 2h-2.667"}] },
  wifi: { label: "Wi-Fi", img: "wi-fi", p: [] },
  nursery: { label: "Emzirme odası", img: "mother-room", p: [] },
  lounge: { label: "Oturma alanı", img: "restaurant-table", p: [] },
  show: { label: "Gösteri / sahne", img: "theatre-mask", p: [] },
};

/* ─────────────────────────  KOLTUK TÜRÜ + ÖZELLİK  ─────────────────────────
   Evrensel Mekân Yerleşim ve Koltuk Planı Değerlendirme Raporu §5.4: koltuk
   modeli üç ayrı sorumluluğa ayrılır —
     seat_kind  = fiziksel oturma/yer birimi NE (ATTRS, aşağıda — GÖRÜNÜM
                  tarafı; FİZİKSEL tarafı, genişlik, core/geometry.js'teki
                  SEAT_KINDS'te, o çekirdek dosyada kalmalı).
     features   = erişim/görüş özelliği, 0..N (FEATURES, aşağıda).
     seat_group = birlikte satılan yerler — BU GÖREVİN KAPSAMI DIŞINDA.
   Kategoriden (fiyat etiketi) de AYRI bir eksen: biletleme sistemi ikisini
   ayrı kullanır.

   Renkler Biletera tasarım sisteminin anlamsal paletinden (tokens/colors.css):
   info · success · warning · ink-3. Eski dört ATTRS anahtarının (wheel/
   comp/obstr/tech) renkleri BİREBİR korundu (wheelchair_space/companion/
   tech aynı kavramın yeni adı; restrictedView artık bir KIND değil FEATURE
   olduğu için o rengi FEATURES.restrictedView taşıyor). loveseat/stool/
   accessible bu görevle gelen YENİ kavramlar — dördün dışında, DS'in tam
   token adını bilmediğim için kendi seçtiğim ayırt edici renkler (bkz.
   görev raporu). DS'in --seat-selected'ı seçim rengimiz (--sel),
   --seat-free ise --seatoff; --seat-taken/--seat-premium biletleme
   durumu+fiyat kategorisi demek, bu editörün kapsamı dışında, eşlenmedi. */
const ATTRS = {
  wheelchair_space: { label: "Tekerlekli sandalye", short: "Tekerlekli", color: "#5AC8FA", glyph: "T", wide: true },
  companion:        { label: "Refakatçi",           short: "Refakatçi",  color: "#2FD07A", glyph: "R" },
  loveseat:         { label: "İkili (birleşik)",    short: "İkili",      color: "#8E6FD1", glyph: "2" },
  stool:            { label: "Tabure",              short: "Tabure",     color: "#B5834D", glyph: "B" },
  /* raporun kontrollü sözlüğünde KARŞILIĞI YOK — bkz. core/geometry.js'teki
     SEAT_KINDS.tech notu. Editöre özgü bir uzantı olduğu ORADA (fiziksel
     tanım) açıklandı, burada TEKRAR yorumlamıyoruz. */
  tech:             { label: "Teknik alan",         short: "Teknik",     color: "#6E6E70", glyph: "×" },
};
/* "single" (varsayılan tür) burada YOK — eskiden boş `at`in ATTRS'te hiç
   karşılığı olmaması ile aynı fikir, normal koltuğun boyanacak bir
   rengi/rozeti yok.

   İSİM KORUNDU: scripts/validate-venues.mjs (DOKUNMA) esbuild ile derlenmiş
   modülden `ATTRS` adını BİREBİR okuyor (bkz. scripts/lib/load-module.mjs
   EXTRA_EXPORTS) ve kendi WIDE_ATTRS'ini Object.keys(ATTRS).filter(k=>
   ATTRS[k].wide) ile kurup buildCtx'e veriyor — isim ya da `.wide`
   sözleşmesi değişirse o script (DOKUNMA) ve test/invariants/helpers.js
   kırılır. `.wide` artık SADECE kozmetik (dolgusuz/boş gövde render, bkz.
   seat render'daki isWheel) — FİZİKSEL genişlik SEAT_KINDS'ten geliyor
   (core/rules.js'teki seatCorners SEAT_KINDS'i DOĞRUDAN import ediyor,
   artık ctx üzerinden enjeksiyona ihtiyaç yok) — bu ikisi BİLEREK ayrı,
   validate-venues.mjs'in geçtiği wideAttrs opsiyonu artık kullanılmıyor
   ama zararsız (bkz. core/rules.js'teki buildCtx notu). */

/* features — seat_kind'den BAĞIMSIZ ikinci eksen (erişim/görüş özelliği,
   0..N). Aynı koltukta birden fazla bulunabilir; eskiden "wheel"/"comp" bu
   ikisinin ("bir tekerlekli sandalye yeri" + "erişilebilir") ayrılamayan
   tek karşılığıydı, "obstr" da "görüş kısıtlı"nın (artık burada) hem
   tür hem özellik karışığıydı. */
const FEATURES = {
  accessible:     { label: "Erişilebilir",  short: "Erişilebilir", color: "#5AC8FA", glyph: "A" },
  restrictedView: { label: "Görüş kısıtlı", short: "Görüş kıs.",   color: "#F5A623", glyph: "!" },
};

/** Bir koltuğun ROZETİ: seat_kind öncelikli ("single" hariç, boyanacak bir
 *  şeyi yok), yoksa İLK feature. Koltuk kenarlığı/glyph/marquee vurgusu gibi
 *  TEK renk/glyph gösterecek her yerin ORTAK karar noktası — aksi hâlde bu
 *  öncelik sırası render kodunun birkaç yerinde ayrı ayrı elle kopyalanır,
 *  biri güncellenince öteki unutulur. */
const seatBadge = (s) => (s.seatKind !== DEFAULT_SEAT_KIND && ATTRS[s.seatKind])
  || (s.seatFeatures[0] && FEATURES[s.seatFeatures[0]]) || null;

/* features dizisini FEATURES'in kanonik anahtar sırasına göre sıralar +
   tekilleştirir — brush/panelde biriken toggle'lar HER ZAMAN aynı sırada
   dursun diye (sameAttr'ın dizi eşitliği buna güvenir, sırasız bir Set
   kıyası değil). */
const FEATURE_ORDER = Object.keys(FEATURES);
const sortFeatures = (arr) => [...new Set(arr)].sort((a, b) => FEATURE_ORDER.indexOf(a) - FEATURE_ORDER.indexOf(b));
const toggleFeature = (arr, k) => sortFeatures(arr.includes(k) ? arr.filter((f) => f !== k) : [...arr, k]);
const sameAttr = (a, b) => a.seatKind === b.seatKind && a.seatFeatures.length === b.seatFeatures.length
  && a.seatFeatures.every((f, i) => f === b.seatFeatures[i]);

/** Bir koltuk istisnasına (b.ov[r,c]) fırça/panel değerini YAZAR. Blok
 *  varsayılanıYLA (resolveSeatKind(b,{})) AYNIysa istisnayı SİLER — eski
 *  `brush==="" && !b.attr` kısayolunun aynı fikri, artık iki alan için.
 *  Eski tek-alan `at` bu koltuk için HER ZAMAN silinir: PlanEditor bundan
 *  sonra SADECE yeni alanları (seatKind/seatFeatures) yazar — `at` yalnız
 *  venue dosyalarından/göçmemiş kayıtlardan OKUNUR (core/geometry.js'teki
 *  resolveSeatKind), editörün kendisi onu bir daha hiç ÜRETMEZ. */
function paintOv(cur, b, seatKind, seatFeatures) {
  const nx = { ...cur };
  delete nx.at;
  if (sameAttr({ seatKind, seatFeatures }, resolveSeatKind(b, {}))) { delete nx.seatKind; delete nx.seatFeatures; }
  else { nx.seatKind = seatKind; nx.seatFeatures = seatFeatures; }
  return nx;
}




/* ══════════════════════════════════════════════════════════════════════════
   SAHA KÜTÜPHANESİ
   Ölçüler santimetre ve federasyon nizamnamelerinden. Dış dikdörtgen
   değiştirilebilir (futbol sahaları 100–110 × 64–75 m arası değişir), ama
   iç işaretlemeler sabit metrik ölçüde kalır — gerçekte de öyledir.
   ══════════════════════════════════════════════════════════════════════════ */

const arc = (x1, y1, r, sw, x2, y2) =>
  `M ${x1.toFixed(1)} ${y1.toFixed(1)} A ${r} ${r} 0 0 ${sw} ${x2.toFixed(1)} ${y2.toFixed(1)}`;

const PITCHES = {
  football: {
    label: "Futbol sahası (FIFA)", w: 10500, h: 6800, surf: "#2B5236", surf2: "#316049", line: "#DCE8DD", lw: 12,
    note: "105 × 68 m · nizami",
    marks(w, h) {
      const L = w / 2, W = h / 2, m = [];
      m.push({ t: "line", x1: 0, y1: -W, x2: 0, y2: W });
      m.push({ t: "circle", cx: 0, cy: 0, r: 915 });
      m.push({ t: "dot", cx: 0, cy: 0, r: 18 });
      [-1, 1].forEach((s) => {
        const gx = s * L;
        m.push({ t: "rect", x: s > 0 ? gx - 1650 : gx, y: -2016, w: 1650, h: 4032 });   // ceza sahası
        m.push({ t: "rect", x: s > 0 ? gx - 550 : gx, y: -916, w: 550, h: 1832 });      // kale sahası
        const px = gx - s * 1100;                                                        // penaltı noktası
        m.push({ t: "dot", cx: px, cy: 0, r: 18 });
        const ex = gx - s * 1650, dy = Math.sqrt(915 * 915 - 550 * 550);
        m.push({ t: "path", d: arc(ex, -dy, 915, s > 0 ? 0 : 1, ex, dy) });              // ceza yayı
        [-1, 1].forEach((v) => {                                                         // korner yayları
          m.push({ t: "path", d: arc(gx - s * 100, v * W, 100, s * v > 0 ? 1 : 0, gx, v * W - v * 100) });
        });
        m.push({ t: "rect", x: s > 0 ? gx : gx - 200, y: -366, w: 200, h: 732, o: 0.55 }); // kale
      });
      return m;
    },
  },

  basket: {
    label: "Basketbol sahası (FIBA)", w: 2800, h: 1500, surf: "#8A5A32", surf2: "#8F6239",
    stripes: 21, line: "#F2E8DA", lw: 5, blw: 11, paint: "#1B4E75",
    note: "28 × 15 m · nizami",
    marks(w, h) {
      const L = w / 2, W = h / 2, m = [];
      m.push({ t: "circle", cx: 0, cy: 0, r: 180, fill: this.paint });
      m.push({ t: "line", x1: 0, y1: -W, x2: 0, y2: W, lw: 8 });
      [-1, 1].forEach((s) => {
        const gx = s * L, bx = gx - s * 157.5;                                    // pota merkezi
        m.push({ t: "rect", x: s > 0 ? gx - 580 : gx, y: -245, w: 580, h: 490, fill: this.paint }); // boyalı alan
        [90, 180, 290].forEach((off) => {                                          // ribaunt çizgileri
          const hx = gx - s * off;
          [-1, 1].forEach((v) => m.push({ t: "line", x1: hx, y1: v * 245, x2: hx, y2: v * 245 + v * 16, lw: 4 }));
        });
        m.push({ t: "circle", cx: gx - s * 580, cy: 0, r: 180 });                 // serbest atış çemberi
        const cy3 = W - 90, dx3 = Math.sqrt(675 * 675 - cy3 * cy3);               // üçlük
        const ax = bx - s * dx3;                                                  // yayın başladığı yer
        [-1, 1].forEach((v) => m.push({ t: "line", x1: gx, y1: v * cy3, x2: ax, y2: v * cy3 }));
        m.push({ t: "path", d: arc(ax, -cy3, 675, s > 0 ? 0 : 1, ax, cy3) });
        m.push({ t: "path", d: arc(bx, -125, 125, s > 0 ? 0 : 1, bx, 125) });     // yarım daire
        m.push({ t: "line", x1: gx - s * 120, y1: -90, x2: gx - s * 120, y2: 90, lw: 8 }); // panya
        m.push({ t: "circle", cx: bx, cy: 0, r: 22.5 });                          // çember
      });
      return m;
    },
  },

  volley: {
    label: "Voleybol sahası (FIVB)", w: 1800, h: 900, surf: "#2F5F92", line: "#F4F4F0", lw: 5,
    note: "18 × 9 m · nizami",
    marks(w, h) {
      const L = w / 2, W = h / 2, m = [];
      m.push({ t: "line", x1: 0, y1: -W, x2: 0, y2: W, lw: 8 });
      [-1, 1].forEach((s) => m.push({ t: "line", x1: s * 300, y1: -W, x2: s * 300, y2: W })); // hücum çizgileri
      m.push({ t: "line", x1: 0, y1: -W - 100, x2: 0, y2: W + 100, dash: "40 30", o: 0.8 });  // file
      return m;
    },
  },

  handball: {
    label: "Hentbol sahası (IHF)", w: 4000, h: 2000, surf: "#4A7C7E", line: "#F0F4F4", lw: 5,
    note: "40 × 20 m · nizami",
    marks(w, h) {
      const L = w / 2, W = h / 2, m = [];
      m.push({ t: "line", x1: 0, y1: -W, x2: 0, y2: W });
      [-1, 1].forEach((s) => {
        const gx = s * L;
        [[600, null], [900, "60 40"]].forEach(([R, dash]) => {
          m.push({ t: "line", x1: gx - s * R, y1: -150, x2: gx - s * R, y2: 150, dash });
          [-1, 1].forEach((v) => {
            /* 9 m yayı kale çizgisine varmadan kenar çizgisini keser — orada bitirilir */
            const full = 150 + R;
            const ex = full <= W ? gx : gx - s * Math.sqrt(R * R - (W - 150) * (W - 150));
            const ey = v * Math.min(full, W);
            m.push({ t: "path", dash, d: arc(gx - s * R, v * 150, R, s * v < 0 ? 1 : 0, ex, ey) });
          });
        });
        m.push({ t: "line", x1: gx - s * 700, y1: -50, x2: gx - s * 700, y2: 50 });   // 7 m
        m.push({ t: "line", x1: gx - s * 400, y1: -7.5, x2: gx - s * 400, y2: 7.5 }); // 4 m
        m.push({ t: "rect", x: s > 0 ? gx : gx - 100, y: -150, w: 100, h: 300, o: 0.55 });
      });
      return m;
    },
  },

  tennis: {
    label: "Tenis kortu (ITF)", w: 2377, h: 1097, surf: "#2E6DA4", line: "#F4F4F0", lw: 5,
    note: "23,77 × 10,97 m · çiftler",
    marks(w, h) {
      const L = w / 2, W = h / 2, sW = 411.5, m = [];
      [-1, 1].forEach((v) => m.push({ t: "line", x1: -L, y1: v * sW, x2: L, y2: v * sW })); // tekler
      [-1, 1].forEach((s) => {
        m.push({ t: "line", x1: s * 640, y1: -sW, x2: s * 640, y2: sW });                  // servis
        m.push({ t: "line", x1: s * L, y1: -10, x2: s * L - s * 10, y2: 10 });             // orta işaret
      });
      m.push({ t: "line", x1: -640, y1: 0, x2: 640, y2: 0 });                              // orta servis
      m.push({ t: "line", x1: 0, y1: -W - 91, x2: 0, y2: W + 91, dash: "40 30", lw: 8 });  // file
      return m;
    },
  },

  hockey: {
    label: "Buz hokeyi (IIHF)", w: 6000, h: 3000, surf: "#DCE6EC", line: "#B03A4A", lw: 8, rx: 850,
    note: "60 × 30 m · nizami",
    marks(w, h) {
      const L = w / 2, W = h / 2, m = [];
      m.push({ t: "line", x1: 0, y1: -W, x2: 0, y2: W, lw: 30 });                      // orta kırmızı
      m.push({ t: "circle", cx: 0, cy: 0, r: 450, c: "#2E5F9E" });
      [-1, 1].forEach((s) => {
        m.push({ t: "line", x1: s * 714, y1: -W, x2: s * 714, y2: W, lw: 30, c: "#2E5F9E" }); // mavi
        const gl = s * (L - 400);
        m.push({ t: "line", x1: gl, y1: -W + 260, x2: gl, y2: W - 260, lw: 5 });             // gol çizgisi
        m.push({ t: "path", d: arc(gl, -180, 180, s > 0 ? 0 : 1, gl, 180) });                // kale önü
        m.push({ t: "rect", x: s > 0 ? gl : gl - 110, y: -91.5, w: 110, h: 183, o: 0.5 });
        [-1, 1].forEach((v) => {
          m.push({ t: "circle", cx: s * 2000, cy: v * 700, r: 450 });
          m.push({ t: "dot", cx: s * 2000, cy: v * 700, r: 30 });
          m.push({ t: "dot", cx: s * 864, cy: v * 700, r: 30, c: "#2E5F9E" });
        });
      });
      return m;
    },
  },

  generic: { label: "Düz zemin", w: 3000, h: 2000, surf: "#22452C", line: "#3E6B4A", lw: 8,
    note: "işaretlemesiz", marks: () => [] },
};


/* Görünüm paleti. Bunlar sadece bloğu tuvalde ayırt etmek için —
   fiyat, kategori, satış hiçbiri bu uygulamanın konusu değil. */
/* Renkler tint dolgu + doygun kenar + rozet olarak kullanılıyor.
   Bu yüzden doygun seçiliyorlar; düz dolgu olarak kullanılsalardı bağırırlardı. */
const PALETTE = ["#C2415A", "#C1743C", "#B79A32", "#5F9142",
                 "#3E7FBF", "#6E7787", "#7C5BA8", "#3E9092"];
const LEVEL_COLORS = ["#3E7FBF", "#5F9142", "#C1743C", "#7C5BA8", "#3E9092", "#C2415A"];

/* Kat rengi. Altıdan fazla kat olduğunda `% LEVEL_COLORS.length` almak İKİ
   FARKLI KATA AYNI RENGİ veriyordu — Şükrü Saracoğlu'nda sekiz kat var ve
   dört tribünden ikisi ekranda ayırt edilemiyordu. Renk kanalının tek işi
   ayırt ettirmek olduğu için bu, kanalın sessizce yalan söylemesiydi.
   Fazlası altın açı (137.5°) ile ton döndürülerek üretiliyor: N kat her
   zaman N ayrı renk. İlk altı küratörlü renk aynen korunuyor, yani mevcut
   salonların hiçbirinin görünümü değişmiyor. */
export const levelColor = (i) =>
  i < LEVEL_COLORS.length ? LEVEL_COLORS[i] : `hsl(${(i * 137.508) % 360} 46% 46%)`;

/* A6.4: tek renk kanalı. Aktif kanal (colorChan) DIŞINDAKİ her kaynak bu
   nötr griye düşer — LEVEL_COLORS/PALETTE/ATTRS/kapı renklerinin hiçbiriyle
   çakışmayan, iki temada da okunan ayrı bir ton. Amaç: ekranda her an TEK
   bir soru cevaplansın (bkz. görev raporu — yedi renk kaynağı yarışıyordu). */
const NEUTRAL = "#8E8E93";
/* Kanal seçici + lejant başlığı TEK sözlükten besleniyor (SHAPES/ATTRS/POI
   ile aynı üslup) — ikisi ayrı yazılırsa isim er geç sürüklenir. */
const COLOR_CHANS = { level: "Kat", attr: "Nitelik", gate: "Kapı", valid: "Doğrulama" };
const CHAN_TITLE = { level: "Katlar", attr: "Nitelikler", gate: "Kapılar", valid: "Doğrulama" };


/** Bir zemin renginin üstünde okunacak yazı rengi — parlaklığa göre.
 *  Temaya bağlamak yanlış olurdu: soluk sarı blok koyu temada da açık
 *  renktir, üstünde beyaz yazı iki temada da okunmaz. */
function onColor(hex) {
  const h = String(hex).replace("#", "");
  const r = parseInt(h.slice(0, 2), 16), g = parseInt(h.slice(2, 4), 16), b = parseInt(h.slice(4, 6), 16);
  return (0.299 * r + 0.587 * g + 0.114 * b) / 255 > 0.6 ? "#17160F" : "#FBFAF7";
}

/* ── rozet kontrastı ──────────────────────────────────────────────
   Blok rengi tint dolgu için doğru ama rozet zemini olarak beyaz yazıyı
   taşıyamıyor. Rozet, 4.5:1 oranını tutturana kadar koyulaştırılıyor.
   Ölçtüm: paletteki sekiz rengin altısı ham haliyle eşiğin altındaydı. */
const _lin = (c) => { c /= 255; return c <= 0.03928 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4); };
const _rl = (h) => {
  const s = h.replace("#", "");
  return 0.2126 * _lin(parseInt(s.slice(0, 2), 16))
       + 0.7152 * _lin(parseInt(s.slice(2, 4), 16))
       + 0.0722 * _lin(parseInt(s.slice(4, 6), 16));
};
const _hex = (n) => Math.max(0, Math.min(255, Math.round(n))).toString(16).padStart(2, "0");
const _badgeCache = new Map();

function badgeColor(hex) {
  if (_badgeCache.has(hex)) return _badgeCache.get(hex);
  const s = String(hex).replace("#", "");
  let r = parseInt(s.slice(0, 2), 16), g = parseInt(s.slice(2, 4), 16), b = parseInt(s.slice(4, 6), 16);
  let out = `#${_hex(r)}${_hex(g)}${_hex(b)}`;
  for (let i = 0; i < 14; i++) {
    if ((1.05) / (_rl(out) + 0.05) >= 4.5) break;
    r *= 0.9; g *= 0.9; b *= 0.9;
    out = `#${_hex(r)}${_hex(g)}${_hex(b)}`;
  }
  _badgeCache.set(hex, out);
  return out;
}

/* EKSİK 4: çakışma büyüklüğünü canlı şeritte okunur birimde göster — operatör
   bir eşiği (ör. yarıçap) el yordamıyla ararken sayının küçülüp büyüdüğünü
   görüp yön bulabilsin. 1 m² = 10.000 cm²; küçük değerlerde cm² daha net. */
const fmtOverlap = (cm2) => cm2 >= 10000
  ? `${(cm2 / 10000).toLocaleString("tr-TR", { maximumFractionDigits: 1 })} m²`
  : `${Math.round(cm2).toLocaleString("tr-TR")} cm²`;

const SHAPES = {
  stage:    { label: "Sahne",       fill: "var(--shapefill)", stroke: "var(--shapeline)" },
  pitch:    { label: "Saha",        fill: "#22452C",          stroke: "#3E6B4A" },
  door:     { label: "Kapı",        fill: "var(--doorfill)",  stroke: "var(--doorfill)" },
  wall:     { label: "Duvar",       fill: "none",             stroke: "var(--shapeline)" },
  screen:   { label: "Perde",       fill: "var(--shapefill)", stroke: "var(--acc)" },
  standing: { label: "Ayakta alan", fill: "rgba(90,130,102,.16)", stroke: "#5B8266" },
  note:     { label: "Not",         fill: "none",             stroke: "var(--mut)" },
};
/* color: "" (LEVEL_COLORS/kat paletine bırak) dördünde de ORTAK olmalı —
   cc(b) = b.color || LEVEL_COLORS[...] (aşağıda ~953) açık b.color'ı HER
   ZAMAN kat paletine tercih ediyor. Eskiden newTable hariç üçü "#3E7FBF"
   basıyordu: 81966d5 şablonlardan/örnek salonlardan sabit rengi kaldırdı
   ama operatörün TUVALE ÇİZDİĞİ yeni blok buradan geçiyor — elle kurulan
   HER salon, kaç kata dağılırsa dağılsın hep aynı renkte kalıyordu (bkz.
   görev raporu, HATA 1). export: test/unit/block-factories.test.js gerçek
   fabrikayı çağırıp bunu bir daha geri gelmeyeceğini doğruluyor. */
export const newGrid = (x, y, cols, rows) => ({
  id: nid(), label: "A", name: "", level: "", kind: "grid", x, y, rot: 0,
  cols, rows, counts: "", align: "center", seatGap: DEF.seatGap, rowGap: DEF.rowGap,
  curve: 0, taper: 0, color: "", seatKind: DEFAULT_SEAT_KIND, seatFeatures: [], num: { ...DEF_NUM, rowScheme: "letter" }, ov: {},
});
export const newFan = (x, y, r0) => ({
  id: nid(), label: "A", name: "", level: "", kind: "fan", x, y, rot: 0, mode: "span",
  r0, rowGap: DEF.rowGap, aStart: -40, aEnd: 40, aCenter: 0, rows: 8,
  seatGap: DEF.seatGap, counts: "", align: "center", color: "", seatKind: DEFAULT_SEAT_KIND, seatFeatures: [],
  num: { ...DEF_NUM }, ov: {},
});
export const newTable = (x, y) => ({
  id: nid(), label: "M1", name: "", level: "", kind: "table", x, y, rot: 0,
  tShape: "round", tW: 90, tH: 90, seats: 4, a0: 0, clear: 12, pad: 40,
  seatGap: DEF.seatGap, rowGap: DEF.rowGap, counts: "", align: "center",
  cols: 1, rows: 1, curve: 0, taper: 0, color: "", seatKind: DEFAULT_SEAT_KIND, seatFeatures: [],
  num: { ...DEF_NUM, rowScheme: "custom", rowCustom: "1" }, ov: {},
});
export const newFree = (x, y) => ({
  id: nid(), label: "S", name: "", level: "", kind: "free", x, y, rot: 0, pts: [],
  seatGap: DEF.seatGap, counts: "", align: "center", color: "", seatKind: DEFAULT_SEAT_KIND, seatFeatures: [],
  num: { ...DEF_NUM, rowScheme: "custom", rowCustom: "1" }, ov: {},
});

/* mirror()'ın (aşağıda, component içinde) tek bir bloğu Y ekseninde
   yansıtan SAF kısmı — etiket defterini (taken/freeLabel, TÜM seçime
   göre kümülatif) tutan kabuktan AYRILDI ki newGrid/newFan/newTable/
   newFree gibi test GERÇEK fonksiyonu çağırabilsin, hand-copy'e muhtaç
   kalmasın (bkz. block-factories.test.js başlığı). reLabel color'a HİÇ
   dokunmuyor (core/labels.js) — ...b spread'i girdinin renk alanını
   (varsa/yoksa) olduğu gibi kopyaya taşır; bu fonksiyon ne enjekte eder
   ne siler. */
export function mirrorBlock(b, label) {
  const cp = reLabel({ ...b, id: nid(), x: -b.x }, label);
  if (b.kind === "fan") { cp.aCenter = -b.aCenter; cp.aStart = -b.aEnd; cp.aEnd = -b.aStart; }
  else if (b.kind === "free") cp.pts = b.pts.map((p) => ({ ...p, x: -p.x, rot: -(p.rot || 0) }));
  else { cp.rot = -b.rot; cp.align = b.align === "left" ? "right" : b.align === "right" ? "left" : "center"; }
  return cp;
}

/* ─────────────────────────  İÇE AKTARMA  ─────────────────────────
   Dış dosyadaki kimlikler oturumdaki sayaçla çakışabilir; hepsi
   yeniden atanır. Eksik alanlar varsayılanla tamamlanır.

   color: "" (kat paletine bırak) — newGrid/newFan/newTable/newFree'nin
   AYNI varsayılanı (bkz. yukarıdaki not, ~475). Eskiden burada "#3E7FBF"
   sabitleniyordu: renksiz (color alanı olmayan/boş) bir bloklu plan.json
   içe aktarılınca operatörün TUVALE ÇİZDİĞİ blokla AYNI hataya düşüyordu
   — ...b spread'i b.color VARSA onu korur (renkli girdi zaten güvenliydi),
   ama YOKSA bu varsayılana düşer; "#3E7FBF" olduğu sürece dışarıdan gelen
   renksiz blok içe aktarma yoluyla renk KAZANIYORDU (bkz. görev raporu,
   HATA 1 — koordinatör ölçtü). export: test/unit/block-factories.test.js
   gerçek fonksiyonu çağırıp bunu bir daha geri gelmeyeceğini doğruluyor. */
export function adoptPlan(raw, key) {
  if (!raw || !Array.isArray(raw.blocks)) throw new Error("blocks dizisi yok");
  /* seatKind/seatFeatures (ya da eski attr) BİLEREK burada varsayılanla
     doldurulmuyor: resolveSeatKind (core/geometry.js) zaten "hiçbiri yoksa
     single" kuralını kendisi uyguluyor. Burada bir varsayılan YAZILSAYDI
     (ör. seatKind:"single") — resolveSeatKind seatKind'i her zaman ÖNCE
     kontrol ettiği için — dışarıdan gelen ESKİ biçimli bir plan.json'un
     (attr:"wheel" gibi, ör. bir venue'nun kendi plan.json'u) attr'ı hiç
     görülmeden GÖLGELENİRDİ. ...b spread'i ne varsa (attr, ya da
     seatKind/seatFeatures) olduğu gibi taşır, resolveSeatKind ikisini de
     çalışma anında doğru yorumlar. */
  const blocks = raw.blocks.map((b) => ({
    kind: "grid", x: 0, y: 0, rot: 0, cols: 10, rows: 5, counts: "", align: "center",
    seatGap: DEF.seatGap, rowGap: DEF.rowGap, curve: 0, taper: 0, color: "",
    mode: "span", r0: 500, aStart: -40, aEnd: 40, aCenter: 0, pts: [],
    ...b, id: nid(), ov: b.ov || {}, num: { ...DEF_NUM, ...(b.num || {}) },
    label: String(b.label ?? "A"), level: b.level || "",
  }));
  const shapes = (raw.shapes || []).map((s) => ({ ...s, id: nid("s") }));
  /* home türetmesi core/plan.js'te TEK kaynak — burada kopyası vardı ve
     bu yoldan geçmeyen (yerleşik salon, reducer) her giriş korumasızdı. */
  return { key, name: raw.name || "İçe aktarılan plan", unit: "cm",
    home: planHome({ ...raw, blocks }, EMPTY.home), underlay: null, blocks, shapes };
}

/* ─────────────────────────  DOĞRULAMA  ─────────────────────────
   Kuralların kendisi artık core/rules.js'te — burası ince bir sarmalayıcı:
   ctx'i hazırlar, runRules()'u (TÜM kurallarla, liveOnly değil) çağırır,
   eski { list, total } şeklini geri verir. "Hata veya uyarı yok" özeti
   burada kalıyor çünkü bir kural değil, DİĞER TÜM kuralların sonucuna
   bakan bir toplam — onu da bir kural yapmak, kendi tetikleme koşulunu
   diğer ~15 kuralınkiyle ayrı ayrı yeniden yazıp senkron tutmayı
   gerektirirdi (tam da bu görevin ortadan kaldırmaya çalıştığı türden
   bir kopya). */
function validate(plan, metas, gates) {
  const ctx = buildCtx(plan, metas, gates);
  /* runRules() her bulguya hangi kuraldan geldiğini söyleyen `id` ekliyor
     (canlı taraf breach'i collide'dan bu alanla ayırıyor). validate()'in
     dönüş şekli tarihsel olarak { t, m, d, ids } — o alanı burada atarak
     eski çıktıyla BİREBİR (fazladan alan bile olmadan) aynı kalıyor. */
  const list = runRules(ctx).map(({ id, ...f }) => f);
  if (!list.some((o) => o.t === "err" || o.t === "warn"))
    list.push({ t: "ok", m: "Hata veya uyarı yok" });
  return { list, total: ctx.seats.total };
}

/* ─────────────────────────  TUTAMAKLAR  ───────────────────────── */

export function handlesFor(b, m) {
  if (b.foot && b.foot.length >= 3) {
    const cos = Math.cos(b.rot * RAD), sin = Math.sin(b.rot * RAD);
    return b.foot.map((p, i) => ({ k: `foot:${i}`, ...toWorld(b, p, cos, sin) }));
  }
  const cos = Math.cos(b.rot * RAD), sin = Math.sin(b.rot * RAD);
  const L = (p, k) => ({ k, ...toWorld(b, p, cos, sin) });
  let hs = [];
  if (b.kind === "grid") {
    const halfW = ((m.P.maxN - 1) / 2) * b.seatGap;
    const backY = (b.rows - 1) * b.rowGap;
    hs = [
      L({ x: 0, y: -b.rowGap * 1.4 }, "rot"),
      /* kavis: ön sıranın orta noktasının hemen ÖNÜNDE, kavis değeri kadar
         dıştan başlıyor — r0/rows tutamaklarıyla AYNI dil (tutamacın
         dinlenme konumu düzenlediği alanın GÜNCEL değerini taşır). */
      L({ x: 0, y: -b.rowGap * 0.6 - (b.curve || 0) }, "curve"),
      L({ x: halfW + b.seatGap * 0.9, y: backY / 2 }, "cols"),
      L({ x: 0, y: backY + b.rowGap * 0.9 }, "rows"),
    ];
  } else if (b.kind === "fan") {
    const span = (b.mode || "span") === "span";
    const am = span ? (b.aStart + b.aEnd) / 2 : b.aCenter;
    const rOut = b.r0 + (b.rows - 1) * b.rowGap;
    hs = [
      /* "rows" tutamacından (+0.75) belirgin biçimde ayrı dursun diye +2.4 —
         ikisi de dıştan, aynı açıda; çok sıralı/dar yelpazelerde 0.65 katı
         fark ekranda iç içe geçiyordu (bkz. görev raporu, GS köşe bloğu). */
      L(polarPt(rOut + b.rowGap * 2.4, am), "rot"),
      L(polarPt(b.r0 - b.rowGap * 0.75, am), "r0"),
      L(polarPt(rOut + b.rowGap * 0.75, am), "rows"),
    ];
    if (span) {
      hs.push(L(polarPt(rOut, b.aStart), "aStart"));
      hs.push(L(polarPt(rOut, b.aEnd), "aEnd"));
    }
  }
  /* SADECE "cols": duruş noktası m.P.maxN'den (counts/taper varsa b.cols'tan
     FARKLI bir genişlik) türerken handlePatch b.cols'u yazıyor — tutamaç
     durduğu yerle YAZDIĞI alan ayrı BÜYÜKLÜK olabiliyor (bkz. ZORLU,
     counts="19..28" iken cols=10 kalıyor). Bu SEMANTİK bir hata: tutamaç
     orada ne gösterdiğini yazmıyor, round-trip'i ne kadar gevşetirsen
     gevşet düzelmez — gizlemekten başka çare yok (bkz. GATED_HANDLES).
     rot/r0/curve/aStart/aEnd BURAYA GİRMEZ: onlar kendi formüllerinde
     bilerek bir hassasiyete (derece / 10cm) yuvarlıyor ama duruş noktası
     ile yazdığı alan HER ZAMAN aynı büyüklük — sadece kaba. O kabalık
     HANDLE_DRAG_PX eşiğiyle (bkz. onMove) zaten çözülüyor; onları da
     burada gizlemek 255 tutamacın (SÜREYYA/HARBIYE/GS/ULKER'deki çözücü-
     üretimi yelpazelerin çoğu) editörden kaybolması demekti — çözülmüş
     bir sorun için asıl aracı (tutamacın kendisini) çöpe atmak olurdu. */
  return hs.filter((h) => !GATED_HANDLES.has(h.k) || canRoundTrip(b, h));
}

/* Round-trip'i handlesFor'da DOĞRULAMADAN gösterilmeyecek tutamaçların
   sınıfı — bugün tek üye "cols" (yukarıdaki not). Yarın aynı sınıfa
   (duruş NOKTASI ile YAZILAN alan ayrı büyüklük) giren başka bir tutamaç
   çıkarsa buraya eklenir; rot/r0/curve/aStart/aEnd gibi "aynı büyüklük,
   sadece yuvarlanmış" tutamaçlar asla buraya girmez. */
const GATED_HANDLES = new Set(["cols"]);

/* Tolerans 1e-9: sin/cos/atan2 tersine sarınca kalan kayan-nokta gürültüsü
   (~1e-13, bkz. handlePatch'teki rnd() notu) bunun çok altında, gerçek bir
   uyuşmazlık (18 koltuk, bkz. görev raporu) çok üstünde — ikisini
   karıştırmaz. GATED_HANDLES'taki tutamaçlar için formülün kendisi
   İNŞAEN kesin (yuvarlama YOK, bkz. "cols"un handlePatch dalı) — o yüzden
   burada gevşek bir kuantum toleransı YOK, tek sayı yeterli. */
function canRoundTrip(b, h) {
  const startAng = h.k === "rot" ? Math.atan2(h.y - b.y, h.x - b.x) / RAD : undefined;
  const patch = handlePatch(b, h.k, h, startAng);
  return Object.keys(patch).every((f) => Math.abs(patch[f] - b[f]) < 1e-9);
}

/** Bir tutamacın YENİ dünya konumundan (raw) o bloğun alanlarına giden TEK
 *  hesap — onMove ("handle" kipi), handlesFor'un kendi canRoundTrip kontrolü
 *  (yalnız GATED_HANDLES için) ve test/invariants/handle-roundtrip.test.js
 *  ÜÇÜ DE bunu çağırır, kopyası yok. Her sabit (0.8/0.9/0.75/0.6…)
 *  handlesFor'daki duruş konumu sabitinin TAM TERSİ olacak şekilde
 *  seçildi: tutamacı hiç sürüklemeden (raw = kendi duruş konumu) bırakmak
 *  no-op olmalı — aksi hâlde tıklamak bile değer kaydırır (bkz. görev
 *  raporu, eski "size" tutamacının +1 kusuru).
 *
 *  r0/curve/aStart/aEnd/rot BİLEREK bir hassasiyet sınırına (derece /
 *  10cm) yuvarlıyor — gerçek bir sürüklemede kullanıcı temiz sayı ister,
 *  bu yuvarlama giderilmiyor. Alan zaten o hassasiyette DEĞİLSE (çözücünün
 *  ürettiği SÜREYYA rot=84,9622 gibi ince değerler) round-trip TAM olamaz
 *  ama bu bir HATA değil — tutamaç YİNE DE gösterilir (handlesFor onu
 *  GİZLEMEZ, bkz. GATED_HANDLES): kabalık, bilgi kaybı değil. "Sürüklemeden
 *  bırakmak no-op" garantisi bu tutamaçlar için handlesFor'da değil,
 *  onMove'da duruyor — işaretçi mousedown'dan beri birkaç EKRAN pikseli
 *  hareket etmeden bu fonksiyon hiç ÇAĞRILMIYOR (bkz. HANDLE_DRAG_PX).
 *  Yani "tam üstüne denk gelmeyen bir tıklama" sorunu YUVARLAMAYI
 *  gevşeterek ya da tutamacı gizleyerek değil, patch'i hiç UYGULAMAYARAK
 *  çözülüyor — bir kez 3px'i aşan GERÇEK bir sürüklemede bu yuvarlama
 *  aynen uygulanır, temiz sayı üretir. */
export function handlePatch(b0, h, raw, startAng) {
  const a = -b0.rot * RAD;
  const gx = raw.x - b0.x, gy = raw.y - b0.y;
  const lx = gx * Math.cos(a) - gy * Math.sin(a);
  const ly = gx * Math.sin(a) + gy * Math.cos(a);
  const dist = Math.hypot(lx, ly);
  /* sin/cos tersine sarınca üretilen ~1e-13 mertebeli kayan-nokta gürültüsü,
     bir değer TAM ORTADA (ör. r0=825 → 82,5) durduğunda round()'u yanlış
     tarafa yuvarlatabiliyordu (AKM'de görüldü: 825 → 820, olması gereken
     830). Yuvarlamadan önceki bu minik pay onu gideriyor — gerçek bir
     sürüklemede (cm/derece mertebesinde hareket) hissedilmez. */
  const rnd = (v) => Math.round(v + 1e-6);
  if (h.startsWith("foot:")) {
    const k = +h.slice(5);
    return { foot: (b0.foot || []).map((q, j) => j === k ? { x: rnd(lx), y: rnd(ly) } : q) };
  }
  if (h === "rot") {
    const ang = Math.atan2(raw.y - b0.y, raw.x - b0.x) / RAD;
    return { rot: rnd(b0.rot + (ang - startAng)) };
  }
  if (h === "cols") {
    // duruş: x = halfW + 0,9·seatGap = (maxN-1)/2·seatGap + 0,9·seatGap → ters çevirince -0,8
    return { cols: Math.max(1, rnd((Math.abs(lx) * 2) / b0.seatGap - 0.8)) };
  }
  if (h === "rows") {
    return b0.kind === "fan"
      // duruş: dist = rOut + 0,75·rowGap
      ? { rows: Math.max(1, rnd((dist - b0.r0) / b0.rowGap - 0.75) + 1) }
      // duruş: y = backY + 0,9·rowGap
      : { rows: Math.max(1, rnd(ly / b0.rowGap - 0.9) + 1) };
  }
  if (h === "curve") {
    // duruş: y = -0,6·rowGap - kavis → ters formül zaten kavisi geri veriyor
    return { curve: rnd((-b0.rowGap * 0.6 - ly) / 10) * 10 };
  }
  if (h === "r0") {
    // duruş: dist = r0 - 0,75·rowGap → 0,75·rowGap geri eklenir
    return { r0: Math.max(50, rnd((dist + b0.rowGap * 0.75) / 10) * 10) };
  }
  if (h === "aStart" || h === "aEnd") {
    return { [h]: rnd(Math.atan2(lx, -ly) / RAD) };
  }
  return {};
}

const HANDLE_HINT = {
  rot: "Döndür", cols: "Koltuk sayısı (±)", rows: "Sıra sayısı (±)", curve: "Kavis",
  r0: "İlk yarıçap", aStart: "Başlangıç açısı", aEnd: "Bitiş açısı",
};

/* Bir tutamacı tıklayıp bırakmak (fare hiç hareket etmeden de olsa) her
   zaman bir mousemove karesi üretir; o kare handlePatch'e verilirse
   rot/r0/aStart/aEnd'in BİLEREK yuvarlaması (bkz. handlePatch) tek başına
   bunu no-op sanamaz — el titremesi ya da tutamacın geniş dokunma alanı
   yüzünden matematiksel duruş noktasının birkaç piksel dışına düşen bir
   tıklama, yuvarlama sınırını aşıp değeri bir birim kaydırabilir. Eşik
   EKRAN pikselinde: dünya biriminde (cm) olsaydı yakınlaştırma seviyesine
   göre "birkaç piksel"in karşılığı değişir, aynı jest bazen no-op bazen
   gerçek bir sürükleme sayılırdı. 3px — fare/dokunmatik el titremesini
   (tipik 1-2px) yutacak, gerçek bir sürüklemeyi geciktirmeyecek kadar
   küçük; tarayıcıların kendi sürükleme-başlatma eşikleriyle aynı mertebe. */
const HANDLE_DRAG_PX = 3;

/* ─────────────────────────  ANA BİLEŞEN  ───────────────────────── */

export default function PlanEditor({ cssText = "" } = {}) {
  /* ── belge durumu: reducer (bkz. ui/state/reducer.js) ────────────
     venues, vk, past/future/rev, seçim, görünüm, kat süzgeci,
     doğrulama/kalibrasyon/eşleştirme, kayıt durumu — doğruluğu birden
     fazla alanı ilgilendiren HER ŞEY tek bir saf reducer'da. Okuma
     tarafı aşağıda düz const'lara açılıyor, geri kalan ~3000 satır
     bu isimleri DEĞİŞMEDEN okumaya devam ediyor. */
  const [state, dispatch] = useReducer(reducer, initialState(BUILTINS, "gs"));
  const {
    venues, vk, past, future, rev,
    selIds, selShapeId, selSeat, selSeats,
    view, levelFilter, report, calib, match, saveState,
  } = state;
  const plan = selectPlan(state);

  /* value-veya-updater sarmalayıcıları: useState'in fonksiyonel setState
     sözleşmesiyle AYNI (setSelIds(x), setView((v) => ({...v,...})) gibi
     var olan onlarca çağrı noktası bunu bekliyor) — gövdeleri artık
     reducer'a tek tip {type,payload} eylemi gönderiyor. dispatch kararlı
     olduğundan ([]) bunlar da eski useState setter'ları gibi kararlı. */
  const setVenues = useCallback((v) => dispatch({ type: "venues/set", payload: v }), []);
  const setVk = useCallback((v) => dispatch({ type: "vk/set", payload: v }), []);
  const setPast = useCallback((v) => dispatch({ type: "past/set", payload: v }), []);
  const setFuture = useCallback((v) => dispatch({ type: "future/set", payload: v }), []);
  const setRev = useCallback((v) => dispatch({ type: "rev/set", payload: v }), []);
  const setSelIds = useCallback((v) => dispatch({ type: "selectBlocks", payload: v }), []);
  const setSelShapeId = useCallback((v) => dispatch({ type: "selectShape", payload: v }), []);
  const setSelSeat = useCallback((v) => dispatch({ type: "selectSeat", payload: v }), []);
  const setSelSeats = useCallback((v) => dispatch({ type: "selectSeats", payload: v }), []);
  const setView = useCallback((v) => dispatch({ type: "setView", payload: v }), []);
  const setLevelFilter = useCallback((v) => dispatch({ type: "setLevelFilter", payload: v }), []);
  const setReport = useCallback((v) => dispatch({ type: "setReport", payload: v }), []);
  const setCalib = useCallback((v) => dispatch({ type: "setCalib", payload: v }), []);
  const setMatch = useCallback((v) => dispatch({ type: "setMatch", payload: v }), []);
  const setSaveState = useCallback((v) => dispatch({ type: "setSaveState", payload: v }), []);

  /* ── araç tercihleri: TEK useState nesnesi ───────────────────────
     Belgeden bağımsız (hangi salon/plan açık olursa olsun aynı kalır),
     birbirine bağlı değil — reducer'a GİRMİYORLAR. Okuma tarafı yine
     düz const'lara açılıyor ki aşağıdaki kod DEĞİŞMEDEN çalışsın. */
  const [toolPrefs, setToolPrefs] = useState({
    /* Fırça artık İKİ eksen: brushKind (tek seçim, ATTRS'in İLK anahtarı —
       eski `brush:"wheel"` varsayılanıyla AYNI fikir, "en çok boyanan tür
       en başta hazır") + brushFeatures (0..N işaretlenebilir). */
    tool: "select", shapeType: "stage", sport: "football",
    brushKind: Object.keys(ATTRS)[0], brushFeatures: [], poiKind: "wc",
    snapOn: true, gridStep: 50,
    lin: { count: 6, dx: 1500, dy: 0 }, rad: { count: 3, cx: 0, cy: 0, step: -30 },
    wheelPref: "auto", theme: "system", legend: false, plates: true, q: "",
    toolsOpen: true, propsOpen: true,
    /* A6.4: tek renk kanalı — "level" (Kat) varsayılan, bugünkü davranış.
       toolPrefs'te yaşıyor çünkü belgeden bağımsız bir görünüm tercihi,
       tıpkı legend/plates/theme gibi (bkz. dosya başı gerekçesi). */
    colorChan: "level",
    /* blok panelindeki katlanır bölümlerin açık/kapalı durumu — bkz.
       BlockPanel. Burada tutulduğu için (BlockPanel'in kendi state'i
       DEĞİL) bir bloktan diğerine geçmek sıfırlamaz: kullanıcı "Gelişmiş"i
       bir kez açtıysa oturum boyunca açık kalır. */
    footOpen: false, numOpen: false, advOpen: false,
  });
  const {
    tool, shapeType, sport, brushKind, brushFeatures, poiKind, snapOn, gridStep, lin, rad, wheelPref, theme, legend, plates, q,
    toolsOpen, propsOpen, footOpen, numOpen, advOpen, colorChan,
  } = toolPrefs;
  const setToolPref = useCallback((key, v) =>
    setToolPrefs((p) => ({ ...p, [key]: typeof v === "function" ? v(p[key]) : v })), []);
  const setTool = useCallback((v) => setToolPref("tool", v), [setToolPref]);
  const setShapeType = useCallback((v) => setToolPref("shapeType", v), [setToolPref]);
  const setSport = useCallback((v) => setToolPref("sport", v), [setToolPref]);
  const setBrushKind = useCallback((v) => setToolPref("brushKind", v), [setToolPref]);
  const setBrushFeatures = useCallback((v) => setToolPref("brushFeatures", v), [setToolPref]);
  const setPoiKind = useCallback((v) => setToolPref("poiKind", v), [setToolPref]);
  const setSnapOn = useCallback((v) => setToolPref("snapOn", v), [setToolPref]);
  const setGridStep = useCallback((v) => setToolPref("gridStep", v), [setToolPref]);
  const setLin = useCallback((v) => setToolPref("lin", v), [setToolPref]);
  const setRad = useCallback((v) => setToolPref("rad", v), [setToolPref]);
  const setWheelPref = useCallback((v) => setToolPref("wheelPref", v), [setToolPref]);
  const setTheme = useCallback((v) => setToolPref("theme", v), [setToolPref]);
  const setLegend = useCallback((v) => setToolPref("legend", v), [setToolPref]);
  const setColorChan = useCallback((v) => setToolPref("colorChan", v), [setToolPref]);
  const setPlates = useCallback((v) => setToolPref("plates", v), [setToolPref]);
  const setQ = useCallback((v) => setToolPref("q", v), [setToolPref]);
  const setToolsOpen = useCallback((v) => setToolPref("toolsOpen", v), [setToolPref]);
  const setPropsOpen = useCallback((v) => setToolPref("propsOpen", v), [setToolPref]);
  const setFootOpen = useCallback((v) => setToolPref("footOpen", v), [setToolPref]);
  const setNumOpen = useCallback((v) => setToolPref("numOpen", v), [setToolPref]);
  const setAdvOpen = useCallback((v) => setToolPref("advOpen", v), [setToolPref]);

  /* ── geçici / yüksek frekanslı / pencere durumu ──────────────────
     Saniyede 60 kez değişebilen imleç/sürükleme/önizleme durumu ve
     salt bu oturuma ait pencere/panel durumu — reducer'a BİLEREK
     SOKULMUYOR (bkz. ui/state/reducer.js dosya başı gerekçesi). */
  const [draft, setDraft] = useState(null);
  const [marq, setMarq] = useState(null);
  const [poly, setPoly] = useState(null);
  const [cursor, setCursor] = useState({ x: 0, y: 0 });
  const [arrPrev, setArrPrev] = useState(null);
  const [verOpen, setVerOpen] = useState(false);
  const [diff, setDiff] = useState(null);
  const [pubNote, setPubNote] = useState("");
  const [saved, setSaved] = useState([]);
  const [canvasSize, setCanvasSize] = useState({ w: 1000, h: 700 });
  const [spaceDown, setSpaceDown] = useState(false);
  const [guides, setGuides] = useState([]);
  const [hoverId, setHoverId] = useState("");
  const [setOpen, setSetOpen] = useState(false);
  const [footDraft, setFootDraft] = useState(null);
  const [sysDark, setSysDark] = useState(true);
  const [msg, setMsgOk] = useState("");
  const [msgErr, setMsgErr] = useState(false);
  const setMsg = (text) => { setMsgOk(text); setMsgErr(false); };
  const setErr = (text) => { setMsgOk(text); setMsgErr(true); };

  const svgRef = useRef(null);
  const drag = useRef(null);
  const seatCache = useRef(new Map());
  const pointers = useRef(new Map());
  const pinch = useRef(null);

  const setPlan = useCallback((p) => setVenues((v) => ({ ...v, [vk]: p })), [vk]);
  /* commit/finalizeDrag/undo/redo/switchVenue: TEK dispatch, TEK geçiş.
     Eskiden undo/redo setPast'in updater'ı İÇİNDE setFuture+setPlan
     çağırıyordu — React updater'ı saf olmak zorunda, StrictMode'da iki
     kez koşunca future'a çift kayıt giriyordu. Reducer'da bu tanım
     gereği yok: her biri saf, tek bir {type,payload} geçişi (bkz.
     ui/state/reducer.js ve test/unit/reducer.test.js). */
  const commit = useCallback((next) => dispatch({ type: "commit", payload: next }), []);
  /** commit()'in sürükleme-bitti sürümü: plan zaten onMove sırasında
   *  güncellendi, tek eksik checkpoint (geri-al + otomatik kayıt) — bunu
   *  tek yerden yapar ki her sürükleme modu (move/moveShape/seat/handle/
   *  paint) ayrı ayrı unutmasın. Gerçekten değişiklik yoksa (salt tıklama)
   *  no-op — geri-al/kayıt boş yere kirlenmesin. */
  const finalizeDrag = useCallback((snapshot) => dispatch({ type: "finalizeDrag", payload: snapshot }), []);
  /* Sıra/açı/koltuk-aralığı gibi alanlar sıra başına koltuk sayısını
     değiştirebilir; var olan koltuk düzeltmeleri/nitelikleri "r,c" anahtarıyla
     saklandığından, artık var olmayan bir sütuna işaret eden kayıtlar sessizce
     ölü veri olarak kalıyordu (bkz. Aspendos denemesi). Geometri gerçekten
     değişmeden önce kaç tanesinin geçersiz kalacağını uyar. */
  const GEOM_KEYS = ["rows", "counts", "r0", "rowGap", "aStart", "aEnd", "seatGap", "cols", "taper", "mode"];
  const patchBlock = (id, patch) => {
    const b = plan.blocks.find((x) => x.id === id);
    if (b?.ov && Object.keys(b.ov).length && GEOM_KEYS.some((k) => k in patch)) {
      const newCounts = prep({ ...b, ...patch }).counts;
      const orphaned = Object.keys(b.ov).filter((k) => {
        const [r, c] = k.split(",").map(Number);
        return r >= newCounts.length || c >= (newCounts[r] || 0);
      });
      if (orphaned.length) setErr(`${orphaned.length} koltuk düzeltmesi/niteliği artık geçersiz aralıkta kaldı`);
    }
    commit({ ...plan, blocks: plan.blocks.map((x) => (x.id === id ? { ...x, ...patch } : x)) });
  };
  /* patch.level varsa her blok için relevelPatch — toplu kat değişimi de
     HATA 2'yle aynı sınıf: her bloğun adı KENDİ eski adına göre değerlendirilir. */
  const patchSelected = (patch) =>
    commit({ ...plan, blocks: plan.blocks.map((b) => (selIds.includes(b.id)
      ? { ...b, ...patch, ...("level" in patch ? relevelPatch(b, patch.level) : null) } : b)) });
  const patchShape = (id, patch) =>
    commit({ ...plan, shapes: plan.shapes.map((s) => (s.id === id ? { ...s, ...patch } : s)) });
  const undo = () => dispatch({ type: "undo" });
  const redo = () => dispatch({ type: "redo" });
  const switchVenue = (k) => dispatch({ type: "switchVenue", payload: k });

  /* metas/metaById: buildMeta AĞIR (geometri türetimi) — bu yüzden
     PlanEditor.jsx'te useMemo olarak kalıyor (bkz. ui/state/selectors.js
     dosya başı gerekçesi). levels/levelCounts/totalSeats SADECE reducer
     durumuna bağlı saf hesap — mantık ui/state/selectors.js'e taşındı,
     burada sadece useMemo sınırı ve girdiler kaldı. */
  const metas = useMemo(() => plan.blocks.map((b) => ({ b, m: buildMeta(b) })), [plan.blocks]);
  const metaById = useMemo(() => new Map(metas.map((x) => [x.b.id, x.m])), [metas]);
  const totalSeats = useMemo(() => selectTotalSeats(metas), [metas]);
  const levels = useMemo(() => selectLevels(plan), [plan.blocks]);
  /* Renk indeksi yaprak katlara göre — bkz. selectBlockLevels. */
  const renkKatlari = useMemo(() => selectBlockLevels(plan), [plan.blocks]);
  const levelCounts = useMemo(() => selectLevelCounts(metas), [metas]);

  const shown = useMemo(() => {
    const pad = view.w * 0.08;
    const vx0 = view.x - pad, vx1 = view.x + view.w + pad;
    const vy0 = view.y - pad, vy1 = view.y + view.h + pad;
    return metas.filter(({ b, m }) =>
      levelMatches(b.level, levelFilter) &&
      m.bbox.x1 > vx0 && m.bbox.x0 < vx1 && m.bbox.y1 > vy0 && m.bbox.y0 < vy1);
  }, [metas, view, levelFilter]);
  /* Sadece kesişen değil, GERÇEKTEN görünen koltuk sayısı: yelpaze gibi
     büyük bloklarda ekranın köşesine değen tek bir blok bile tüm koltuk
     sayısını eklerse, o blok tek başına koltuk moduna geçişi bloklardı —
     salonun tamamına yakınlaştırılmış gibi davranırdı, oysa asıl görünen
     alan küçücüktü. Kesişim alanının bloğa oranı kadar say. */
  const shownSeats = useMemo(() => {
    const pad = view.w * 0.08;
    const vx0 = view.x - pad, vx1 = view.x + view.w + pad;
    const vy0 = view.y - pad, vy1 = view.y + view.h + pad;
    return shown.reduce((a, { m }) => {
      const ox = Math.max(0, Math.min(m.bbox.x1, vx1) - Math.max(m.bbox.x0, vx0));
      const oy = Math.max(0, Math.min(m.bbox.y1, vy1) - Math.max(m.bbox.y0, vy0));
      const areaB = (m.bbox.x1 - m.bbox.x0) * (m.bbox.y1 - m.bbox.y0);
      return a + m.seatCount * (areaB > 0 ? (ox * oy) / areaB : 1);
    }, 0);
  }, [shown, view]);
  const seatMode = shownSeats <= SEAT_BUDGET;

  /* Bir kat filtrelendiğinde diğer katlar tamamen kaybolmasın — koltuk
     sayısına değil, sadece dış hatta bakan soluk bir "gölge" olarak
     yerinde kalsın. Kullanıcı hangi katta olduğunu değil, o katın
     bina içindeki konumunu da görsün. Seçilemez/tıklanamaz: marquee
     seçimi ve diğer tüm etkileşimler zaten levelFilter'a göre süzülüyor. */
  const dimmedBlocks = useMemo(() => {
    if (levelFilter === "*") return [];
    const pad = view.w * 0.08;
    const vx0 = view.x - pad, vx1 = view.x + view.w + pad;
    const vy0 = view.y - pad, vy1 = view.y + view.h + pad;
    return metas.filter(({ b, m }) => !levelMatches(b.level, levelFilter) &&
      m.bbox.x1 > vx0 && m.bbox.x0 < vx1 && m.bbox.y1 > vy0 && m.bbox.y0 < vy1);
  }, [metas, view, levelFilter]);

  const drawn = useMemo(() => {
    if (!seatMode) return [];
    return shown.map(({ b, m }) => {
      let hit = seatCache.current.get(b);
      if (!hit) { hit = buildSeats(b, m, plan.idTemplate); seatCache.current.set(b, hit); }
      if (seatCache.current.size > 300) seatCache.current.clear();
      return { b, m, ...hit };
    });
  }, [shown, seatMode]);

  const selSeatInfo = useMemo(() => {
    if (!selSeat) return null;
    const hit = drawn.find((d) => d.b.id === selSeat.bid);
    return hit ? hit.seats.find((x) => x.r === selSeat.r && x.c === selSeat.c) : null;
  }, [selSeat, drawn]);

  const selBlocks = useMemo(() => selectSelectedBlocks(plan, selIds), [plan.blocks, selIds]);
  const selBlock = selBlocks.length === 1 ? selBlocks[0] : null;
  /* Çoğaltma/dizi/aynalama planda ZATEN kullanılan bir ön eki bir daha
     üretmesin diye (bkz. görev raporu) — tek kaynak: plandaki tüm etiketler. */
  const usedLabels = useMemo(() => new Set(plan.blocks.map((b) => b.label)), [plan.blocks]);
  const selShape = plan.shapes.find((s) => s.id === selShapeId) || null;
  const handles = useMemo(() => {
    if (!selBlock || tool !== "select") return [];
    const m = metaById.get(selBlock.id);
    return m ? handlesFor(selBlock, m) : [];
  }, [selBlock, metaById, tool]);

  const ghosts = useMemo(() => {
    if (!arrPrev || !selBlocks.length) return [];
    const made = arrayPreview(selBlocks, arrPrev, arrPrev === "lin" ? lin : rad);
    return made.map((b) => buildMeta(b).outline);
  }, [arrPrev, selBlocks, lin, rad]);

  /* Blok rengi yoksa kat sırasına göre otomatik — sadece görünüm. */
  const cc = useCallback((b) => b.color || levelColor(
    Math.max(0, renkKatlari.indexOf(b.level || ""))), [renkKatlari]);
  const gates = useMemo(() => gateMap(plan), [plan.shapes]);

  /* ── A6.4: tek renk kanalı ────────────────────────────────────────
     Kat, blok rengi, nitelik, kapı — dördü de aynı anda çizilince hangi
     rengin ne anlattığı ayırt edilemiyordu (bkz. görev raporu). chanColor
     TEK kapı: aktif kanal "level" değilse blok/koltuk zemini NEUTRAL'a
     düşer, kanalın kendi sinyali (nitelik kanalında koltuk kenarlığı,
     kapı kanalında blok/kapı rengi) ayrı yerde devreye girer. Seçim
     vurgusu (.blk.on rect / .sel — CSS stroke override) ve canlı
     breach/collide bundan ETKİLENMEZ, chanColor'dan hiç geçmiyorlar. */
  const gateShapes = useMemo(() => plan.shapes.filter((s) => s.type === "door"), [plan.shapes]);
  const gateColor = useCallback((label) => {
    if (!label) return NEUTRAL;
    const i = gateShapes.findIndex((d) => d.label === label);
    return PALETTE[(i < 0 ? 0 : i) % PALETTE.length];
  }, [gateShapes]);
  const chanColor = useCallback((b) => {
    if (colorChan === "gate") return gateColor(gates.get(b.id)?.[0]);
    if (colorChan !== "level") return NEUTRAL; // "attr" / "valid": blok rengi bu sorunun cevabı değil
    return cc(b);
  }, [colorChan, cc, gateColor, gates]);

  /* Sınır taşması VE aynı kat çakışması canlı izleniyor — ikisi de artık
     core/rules.js'teki AYNI runRules() motorundan geliyor (liveOnly: true):
     Doğrula raporuyla ayrı bir kopya değil, tek kaynak. bbox ön elemesi
     rules.js içinde KORUNUYOR — 96 bloklu bir stadyumda her sürükleme
     karesinde binlerce çokgen kırpımı yapılamaz; bbox ile pratikte
     birkaç tanesi kalıyor (bkz. görev raporundaki ölçüm). */
  const liveCtx = useMemo(() => buildCtx(plan, metas, gates), [plan, metas, gates]);
  const liveFindings = useMemo(() => runRules(liveCtx, { liveOnly: true }), [liveCtx]);
  /* Sınır taşması: blok dış hattının bir noktası bile duvarın dışındaysa
     blok işaretlenir. Kesin koltuk sayısı Doğrula'da. */
  const breach = useMemo(() =>
    liveFindings.find((f) => f.id === "blocks-outside-boundary")?.ids || [],
    [liveFindings]);
  const breachSet = useMemo(() => new Set(breach), [breach]);

  /* Aynı kattaki iki bloğun tabanı birbirinin içine giremez — fiziksel
     olarak imkânsız ve planı tıklanamaz hale getirir. Kullanıcı bloğu
     sürüklerken anında kırmızıya dönüyor, Doğrula'yı beklemesine gerek
     kalmıyor. Farklı katlar burada kasıtlı olarak karşılaştırılmıyor:
     gerçek bir salonda balkon partere sarkabilir. O durum yine de 2B
     planda sorun olduğu için Doğrula raporunda uyarı olarak çıkıyor. */
  const collide = useMemo(() =>
    liveFindings.find((f) => f.id === "footprint-overlap-same-level")?.ids || [],
    [liveFindings]);
  const collideSet = useMemo(() => new Set(collide), [collide]);
  /* EKSİK 4: en büyük örtüşme büyüklüğü — kuralın zaten hesapladığı maxArea'yı
     taşır, burada yeni bir geometri hesabı YOK (bkz. core/rules.js). */
  const collideArea = useMemo(() =>
    liveFindings.find((f) => f.id === "footprint-overlap-same-level")?.maxArea || 0,
    [liveFindings]);

  /* "Doğrulama" kanalı canlı breach/collide'ı (yukarıda, HER kanalda zaten
     görünür) "vurgular": kanalın kendisi doğrulamaysa, son Doğrula
     raporundaki TÜM bulgular (dar açıklık, kat-arası çakışma, yinelenen
     kimlik gibi live:false kurallar dahil) aynı dış hat vurgusuyla eklenir.
     Rapor hiç çalıştırılmamışsa (report=null) sadece canlı ikisi görünür —
     eksik değil, kullanıcı henüz Doğrula'ya basmadı. */
  const reportMarks = useMemo(() => {
    if (colorChan !== "valid" || !report) return { err: [], warn: [] };
    const err = new Set(), warn = new Set();
    report.list.forEach((f) => {
      if (f.t === "err") (f.ids || []).forEach((id) => err.add(id));
      else if (f.t === "warn") (f.ids || []).forEach((id) => warn.add(id));
    });
    breach.forEach((id) => err.delete(id));
    collide.forEach((id) => err.delete(id));
    err.forEach((id) => warn.delete(id));
    return { err: [...err], warn: [...warn] };
  }, [colorChan, report, breach, collide]);

  /* Lejantın "Nitelik" kanalı iki ayrı toplam gösterir — tür (kind, m.kinds)
     VE özellik (feature, m.features), planın TÜMÜNDE. buildMeta zaten
     blok başına bu ikisini hesaplıyor (bkz. core/geometry.js), burada
     sadece TÜM bloklar üzerinde topluyoruz. */
  const kindTotals = useMemo(() => {
    const t = {};
    metas.forEach(({ m }) => Object.entries(m.kinds || {})
      .forEach(([k, v]) => { t[k] = (t[k] || 0) + v; }));
    return t;
  }, [metas]);
  const featureTotals = useMemo(() => {
    const t = {};
    metas.forEach(({ m }) => Object.entries(m.features || {})
      .forEach(([k, v]) => { t[k] = (t[k] || 0) + v; }));
    return t;
  }, [metas]);

  const toWorldPt = useCallback((cx, cy) => {
    const r = svgRef.current.getBoundingClientRect();
    const s = Math.min(r.width / view.w, r.height / view.h);
    return {
      x: view.x + (cx - r.left - (r.width - view.w * s) / 2) / s,
      y: view.y + (cy - r.top - (r.height - view.h * s) / 2) / s,
    };
  }, [view]);
  const snap = useCallback((p) => snapOn
    ? { x: Math.round(p.x / gridStep) * gridStep, y: Math.round(p.y / gridStep) * gridStep }
    : p, [snapOn, gridStep]);

  /* ── görünüm: zoom, pan, ölçek ────────────────────────────────── */
  const MINW = 200, MAXW = 90000;

  /** Ekrandaki bir noktayı sabit tutarak yakınlaştırır/uzaklaştırır. */
  const zoomAt = useCallback((cx, cy, k) => {
    setView((v) => {
      const r = svgRef.current.getBoundingClientRect();
      const s = Math.min(r.width / v.w, r.height / v.h);
      const wx = v.x + (cx - r.left - (r.width - v.w * s) / 2) / s;
      const wy = v.y + (cy - r.top - (r.height - v.h * s) / 2) / s;
      const nw = Math.min(MAXW, Math.max(MINW, v.w * k)), f = nw / v.w;
      return { x: wx - (wx - v.x) * f, y: wy - (wy - v.y) * f, w: nw, h: v.h * f };
    });
  }, []);
  const zoomCenter = (k) => {
    const r = svgRef.current?.getBoundingClientRect();
    if (r) zoomAt(r.left + r.width / 2, r.top + r.height / 2, k);
  };

  useEffect(() => {
    const el = svgRef.current;
    if (!el || typeof ResizeObserver === "undefined") return;
    const ro = new ResizeObserver(([e]) => {
      const r = e.contentRect;
      setCanvasSize({ w: r.width, h: r.height });
    });
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  /* ekrandaki 1 cm kaç piksel — ölçek çubuğu ve tutamak boyu için */
  const pxPerCm = Math.min(canvasSize.w / view.w, canvasSize.h / view.h);
  /* Koltuk numarası ancak koltuk ekranda okunacak kadar büyükse yazılır.
     Sabit bir zoom eşiği yerine gerçek piksel boyu ölçülüyor. */
  const seatNums = pxPerCm * DEF.seatW > 16;
  /* U = bir ekran pikselinin dünya karşılığı. Koltuk ve masa fiziksel
     nesne, santimetreyle çizilir. Etiket, rozet, işaret ise anotasyondur;
     ekranda sabit boyda durmalı. Stadyumda doğru görünen 6 metrelik yazı
     12 metrelik barda ekranı kaplıyordu — hata buradaydı. */
  const U = 1 / (pxPerCm || 0.01);
  const scaleBar = useMemo(() => {
    const steps = [10, 25, 50, 100, 200, 500, 1000, 2000, 5000, 10000, 20000, 50000];
    let best = steps[0];
    steps.forEach((v) => { if (Math.abs(v * pxPerCm - 110) < Math.abs(best * pxPerCm - 110)) best = v; });
    return { cm: best, px: best * pxPerCm,
      label: best >= 100 ? `${(best / 100).toLocaleString("tr-TR")} m` : `${best} cm` };
  }, [pxPerCm]);

  /* aspect: hedef yükseklik/genişlik oranı. view'in eski oranı yerine
     canvas'ın gerçek piksel oranını kullanır — pencere yeniden
     boyutlandığında view hemen düzelmez, eski oranla sığdırmak
     gereksiz boşluk (letterbox) bırakırdı. */
  const fitBBoxRect = (items, aspect) => {
    const x0 = Math.min(...items.map((m) => m.bbox.x0)), x1 = Math.max(...items.map((m) => m.bbox.x1));
    const y0 = Math.min(...items.map((m) => m.bbox.y0)), y1 = Math.max(...items.map((m) => m.bbox.y1));
    const pad = Math.max(x1 - x0, y1 - y0) * 0.12 + 100;
    const w = Math.max(MINW, (x1 - x0) + 2 * pad);
    const h = w * aspect;
    const need = ((y1 - y0) + 2 * pad) / h;
    const W = need > 1 ? w * need : w;
    return { x: (x0 + x1) / 2 - W / 2, y: (y0 + y1) / 2 - (W * aspect) / 2, w: W, h: W * aspect };
  };
  const zoomToBBox = (items) => {
    if (!items.length) return;
    setView(fitBBoxRect(items, canvasSize.h / canvasSize.w));
  };
  const zoomToSelection = () => zoomToBBox(selIds.length
    ? selIds.map((id) => metaById.get(id)).filter(Boolean)
    : metas.map((x) => x.m));
  /* Sığdır: plan.home sabit bir değer — bir oturumda büyüyen bloklar onun
     dışına taştığında sessizce ekran dışında kalıyordu. Gerçek içerik
     sınırını hesapla; plan boşsa (Yeni plan) home'a düş. */
  const zoomToAll = () => (metas.length ? zoomToBBox(metas.map((x) => x.m)) : setView(planHome(plan)));
  /* Zum yüzdesi: mutlak bir px/cm oranı salon ölçeğine göre anlamsız
     olurdu (47 koltukluk bar ile 50.000 koltukluk stadyum aynı fiziksel
     birimi paylaşmıyor). %100 = Sığdır'ın ürettiği görünüm — Sığdır'a
     basınca bu yüzden her zaman tam %100 görünür. */
  const homeRect = metas.length
    ? fitBBoxRect(metas.map((x) => x.m), canvasSize.h / canvasSize.w)
    : planHome(plan);
  const homePxPerCm = Math.min(canvasSize.w / homeRect.w, canvasSize.h / homeRect.h);
  const zoomPct = Math.round((pxPerCm / homePxPerCm) * 100) || 100;

  const zoomTo = (m) => {
    const w = Math.max(900, (m.bbox.x1 - m.bbox.x0) * 1.6);
    const h = (w * view.h) / view.w;
    setView({ x: m.cx - w / 2, y: m.cy - h / 2, w, h });
  };

  const doLinear = () => {
    if (!selBlocks.length) return;
    const made = linearArray(selBlocks, lin, usedLabels);
    commit({ ...plan, blocks: [...plan.blocks, ...made] });
    setSelIds([...selIds, ...made.map((b) => b.id)]);
    setArrPrev(null);
    setMsg(`${made.length} blok üretildi`);
  };
  const doRadial = () => {
    if (!selBlocks.length) return;
    const made = radialArray(selBlocks, rad, usedLabels);
    commit({ ...plan, blocks: [...plan.blocks, ...made] });
    setSelIds([...selIds, ...made.map((b) => b.id)]);
    setArrPrev(null);
    setMsg(`${made.length} blok üretildi`);
  };
  const doRenumber = ({ start, cx, cy, from, cw, prefix }) => {
    if (!selBlocks.length) return;
    const sorted = selBlocks.map((b) => {
      const m = metaById.get(b.id);
      const a = Math.atan2(m.cy - cy, m.cx - cx) / RAD;
      return { b, rel: ((a - from) * (cw ? 1 : -1) + 3600) % 360 };
    }).sort((p, q) => p.rel - q.rel);
    const map = new Map();
    sorted.forEach(({ b }, i) => map.set(b.id, `${prefix}${start + i}`));
    commit({ ...plan, blocks: plan.blocks.map((b) => map.has(b.id) ? reLabel(b, map.get(b.id)) : b) });
    setMsg(`${sorted.length} blok yeniden numaralandı`);
  };
  const runValidate = () => {
    setMsg("doğrulanıyor…");
    setTimeout(() => { setReport(validate(plan, metas, gates)); setMsg(""); }, 10);
  };
  /* Doğrula rozeti son çalıştırmadan kalır — her düzenlemede yeniden
     hesaplamak büyük salonlarda (bkz. yukarıdaki 10ms'lik yield) fark
     edilir bir gecikme yaratırdı. "Son kontrolde şu vardı" göstermek,
     hiç göstermemekten iyi; tam canlı takip istenirse plan'a bağlı bir
     useMemo'ya çevrilebilir. */
  const reportErrN = report ? report.list.filter((x) => x.t === "err").length : 0;
  const reportWarnN = report ? report.list.filter((x) => x.t === "warn").length : 0;

  /* ── sürümleme ─────────────────────────────────────────────── */
  const versions = plan.versions || [];
  const published = versions.find((v) => v.v === plan.published) || null;
  const dirty = useMemo(
    () => (published ? planFingerprint(published.snapshot) !== planFingerprint(plan) : versions.length === 0),
    [published, plan, versions.length]);

  const doPublish = () => {
    const v = (versions.reduce((a, x) => Math.max(a, x.v), 0) || 0) + 1;
    const snapshot = JSON.parse(JSON.stringify(stripUnderlay(
      { ...plan, versions: undefined, published: undefined })));
    const entry = { v, at: new Date().toISOString(), note: pubNote.trim() || `Sürüm ${v}`,
      seats: totalSeats };
    entry.snapshot = snapshot;
    commit({ ...plan, versions: [...versions, entry], published: v });
    setPubNote(""); setDiff(null);
    setMsg(`v${v} yayınlandı`);
  };
  const doRestore = (entry) => {
    commit({ ...plan, ...entry.snapshot, versions, published: plan.published });
    setSelIds([]); setSelShapeId(null); setDiff(null);
    setMsg(`v${entry.v} taslağa geri yüklendi`);
  };
  const doDiff = (entry) => {
    setMsg("fark hesaplanıyor…");
    setTimeout(() => {
      setDiff({ v: entry.v, ...diffPlans(entry.snapshot, plan) });
      setMsg("");
    }, 10);
  };
  /* ── kalıcılık: açılışta yükle, düzenledikçe otomatik kaydet ──── */
  useEffect(() => {
    let dead = false;
    (async () => {
      const keys = await Store.list();
      if (dead || !keys.length) { setSaved(keys); return; }
      /* Örnek salonlar (BUILTINS'teki empty dışı anahtarlar) burada asla
         kabul edilmez — kod her zaman kazanır (bkz. core/schema.js
         isProtectedSample). Geri kalanı göç ettirip id sayacını ileri
         sarma da aynı saf fonksiyonda (mergeSavedVenues). */
      const entries = [];
      for (const k of keys) entries.push([k, await Store.load(k)]);
      const loaded = mergeSavedVenues(BUILTINS, entries);
      if (!dead && Object.keys(loaded).length) {
        setVenues((v) => ({ ...v, ...loaded }));
        setSaved(keys);
        setMsg(`${Object.keys(loaded).length} kayıtlı plan yüklendi`);
      }
    })();
    return () => { dead = true; };
  }, []);

  useEffect(() => {
    if (!rev) return;
    setSaveState("saving");
    const t = setTimeout(async () => {
      /* plan !== BUILTINS[vk]: sadece venues[vk] BUILTINS'teki taze
         referanstan FARKLI bir nesneyse (yani gerçekten düzenlendiyse)
         çatalla. Salt görüntülemek için başka bir örneğe geçmek plan
         referansını değiştirmez, bu yüzden burada YANLIŞLIKLA tetiklenmez
         (bkz. görev raporu — id/seçim/sürükleme kopmasın diye çatalda
         id'ler bilerek değişmiyor). */
      if (isProtectedSample(vk, BUILTINS) && plan !== BUILTINS[vk]) {
        const fk = `p${Date.now().toString(36)}`;
        const forked = forkSample(plan, fk);
        setVenues((v) => ({ ...v, [vk]: BUILTINS[vk], [fk]: forked }));
        setVk(fk);
        setSaved((s) => (s.includes(fk) ? s : [...s, fk]));
        setMsg(`Örnek salon salt okunur — değişiklikleriniz "${forked.name}" olarak ayrı kaydedildi`);
        const ok = await Store.save(fk, stampSchema(forked));
        setSaveState(ok ? "saved" : "error");
        return;
      }
      const ok = await Store.save(vk, stampSchema(plan));
      setSaveState(ok ? "saved" : "error");
      setSaved((s) => (s.includes(vk) ? s : [...s, vk]));
    }, 1000);
    return () => clearTimeout(t);
  }, [rev, plan, vk]);

  const newPlan = () => {
    const k = `p${Date.now().toString(36)}`;
    const p = { ...EMPTY, key: k, name: "Yeni plan", blocks: [], shapes: [], versions: [], published: null };
    setVenues((v) => ({ ...v, [k]: p }));
    switchVenue2(k, p);
    setRev((r) => r + 1);
  };
  /* Şablondan yeni plan — newPlan() ile AYNI akış (p<timestamp> anahtarı,
     versions/published sıfırlanır), tek fark boş EMPTY yerine şablon
     üretecinin (src/venues/templates.js) döndürdüğü bloklar/şekillerle
     başlaması. build() ÇAĞRILDIĞINDA nid() üretir — duplicatePlan()'daki
     gibi kimlikler o an paylaşılan sayaçtan gelir, örnek salonların modül
     yüklemede sabitlenmiş sırasına hiç dokunmaz (bkz. templates.js başlığı). */
  const newPlanFromTemplate = (build, name) => {
    const k = `p${Date.now().toString(36)}`;
    const p = { ...build(), key: k, name, versions: [], published: null };
    setVenues((v) => ({ ...v, [k]: p }));
    switchVenue2(k, p);
    setRev((r) => r + 1);
  };
  const duplicatePlan = () => {
    const k = `p${Date.now().toString(36)}`;
    const copy = JSON.parse(JSON.stringify({ ...plan, underlay: null }));
    copy.key = k;
    copy.name = `${plan.name} (kopya)`;
    copy.blocks = copy.blocks.map((b) => ({ ...b, id: nid() }));
    const idm = new Map(plan.blocks.map((b, i) => [b.id, copy.blocks[i].id]));
    copy.shapes = copy.shapes.map((s) => ({ ...s, id: nid("s"),
      blocks: (s.blocks || []).map((x) => idm.get(x)).filter(Boolean) }));
    copy.versions = []; copy.published = null;
    setVenues((v) => ({ ...v, [k]: copy }));
    switchVenue2(k, copy);
    setRev((r) => r + 1);
  };
  const deletePlan = async (k) => {
    await Store.remove(k);
    setSaved((s) => s.filter((x) => x !== k));
    setVenues((v) => { const n = { ...v }; delete n[k]; return n; });
    if (k === vk) {
      const first = Object.keys(venues).find((x) => x !== k) || "empty";
      switchVenue(first);
    }
    setMsg("Plan silindi");
  };
  const switchVenue2 = (k, p) => {
    setVk(k); setPast([]); setFuture([]); setSelIds([]); setSelShapeId(null);
    setSelSeat(null); setSelSeats(new Set()); setLevelFilter("*"); setView(planHome(p));
    setReport(null); setMatch(null);
  };

  const exportSVG = () => {
    const svg = svgRef.current.cloneNode(true);
    svg.querySelectorAll(".hnd, .marq, .draft, .ghost, .cal, .mtxt").forEach((n) => n.remove());
    const NS = "http://www.w3.org/2000/svg";
    const bg = document.createElementNS(NS, "rect");
    bg.setAttribute("x", view.x); bg.setAttribute("y", view.y);
    bg.setAttribute("width", view.w); bg.setAttribute("height", view.h);
    bg.setAttribute("fill", dark ? "#0C0D13" : "#E9E6DF");
    svg.insertBefore(bg, svg.firstChild);
    const st = document.createElementNS(NS, "style");
    /* cssText: main.jsx'ten prop olarak geliyor (?raw import). Burada
       doğrudan "./styles/*.css" import edilemez — bu dosya JSX içerdiği
       için test betikleri onu esbuild transform + çıplak Node import'uyla
       yüklüyor (bkz. scripts/lib/load-module.mjs); Node'un ESM'i .css
       uzantısını çözemediğinden bir import burada npm test'i kırar. */
    st.textContent = cssText;
    svg.insertBefore(st, svg.firstChild);
    svg.setAttribute("class", dark ? "ed dark" : "ed light");
    svg.setAttribute("width", 1800);
    svg.setAttribute("height", Math.round((1800 * view.h) / view.w));
    const blob = new Blob(['<?xml version="1.0" encoding="UTF-8"?>\n' + svg.outerHTML],
      { type: "image/svg+xml;charset=utf-8" });
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob); a.download = `${plan.key}-plan.svg`; a.click();
    URL.revokeObjectURL(a.href);
    setMsg("SVG indirildi");
  };

  /* ── hizala / eşit dağıt ──────────────────────────────────────── */

  const alignSel = (mode) => {
    const it = selBlocks.map((b) => ({ b, m: metaById.get(b.id) })).filter((x) => x.m);
    if (it.length < 2) return;
    const all = it.map((x) => x.m.bbox);
    const X0 = Math.min(...all.map((b) => b.x0)), X1 = Math.max(...all.map((b) => b.x1));
    const Y0 = Math.min(...all.map((b) => b.y0)), Y1 = Math.max(...all.map((b) => b.y1));
    const d = new Map();
    it.forEach(({ b, m }) => {
      const bb = m.bbox;
      if (mode === "l") d.set(b.id, [X0 - bb.x0, 0]);
      if (mode === "r") d.set(b.id, [X1 - bb.x1, 0]);
      if (mode === "cx") d.set(b.id, [(X0 + X1) / 2 - (bb.x0 + bb.x1) / 2, 0]);
      if (mode === "t") d.set(b.id, [0, Y0 - bb.y0]);
      if (mode === "b") d.set(b.id, [0, Y1 - bb.y1]);
      if (mode === "cy") d.set(b.id, [0, (Y0 + Y1) / 2 - (bb.y0 + bb.y1) / 2]);
    });
    commit({ ...plan, blocks: plan.blocks.map((b) => {
      const v = d.get(b.id);
      return v ? { ...b, x: Math.round(b.x + v[0]), y: Math.round(b.y + v[1]) } : b;
    }) });
    setMsg("Hizalandı");
  };

  /** Uç iki blok sabit kalır, aradakilerin merkezleri eşit aralıklanır. */
  const distributeSel = (axis) => {
    const it = selBlocks.map((b) => ({ b, m: metaById.get(b.id) })).filter((x) => x.m);
    if (it.length < 3) { setMsg("Eşit dağıtmak için en az 3 blok gerekir"); return; }
    const key = axis === "x" ? "cx" : "cy";
    it.sort((a, z) => a.m[key] - z.m[key]);
    const first = it[0].m[key], last = it[it.length - 1].m[key];
    const step = (last - first) / (it.length - 1);
    const d = new Map();
    it.forEach(({ b, m }, i) => {
      if (i === 0 || i === it.length - 1) return;
      d.set(b.id, first + step * i - m[key]);
    });
    commit({ ...plan, blocks: plan.blocks.map((b) => {
      const v = d.get(b.id);
      if (v == null) return b;
      return axis === "x" ? { ...b, x: Math.round(b.x + v) } : { ...b, y: Math.round(b.y + v) };
    }) });
    setMsg("Eşit dağıtıldı");
  };

  /* "bid|r,c" anahtarını koltuk nesnesine çevirir. Kement bitişinde de,
     tıklamayla seçimde de gerekiyor — iki yere yazılmasın. */
  const anahtarKoltuk = (k) => {
    const [bid, rc] = k.split("|");
    const [r, c] = rc.split(",");
    return { bid, r: +r, c: +c };
  };
  /** Çoklu seçim değiştiğinde tekil seçimi ona göre tazeler (1 ise o, değilse yok). */
  const seatSelSync = (next) => {
    setSelSeats(next);
    setSelSeat(next.size === 1 ? anahtarKoltuk([...next][0]) : null);
  };

  /* ── seçili koltuklara toplu işlem ────────────────────────────── */
  const seatOps = (fn) => {
    if (!selSeats.size) return;
    const byB = new Map();
    selSeats.forEach((k) => {
      const [bid, rc] = k.split("|");
      if (!byB.has(bid)) byB.set(bid, []);
      byB.get(bid).push(rc);
    });
    commit({ ...plan, blocks: plan.blocks.map((b) => {
      const list = byB.get(b.id);
      if (!list) return b;
      const ov = { ...b.ov };
      list.forEach((rc) => {
        const next = fn({ ...(ov[rc] || {}) });
        if (next && Object.keys(next).length) ov[rc] = next; else delete ov[rc];
      });
      return { ...b, ov };
    }) });
  };

  /* ── bölüm türü ───────────────────────────────────────────────────
     Bölümler kat YOLUNDAN türetiliyor (resolvePlanSections), o yüzden
     türü saklayacak yer yok — hepsi varsayılan "floor" alıyordu. Oysa
     Yenikapı'nın "Loca"sı box, Ülker'in "Üst Tribün"ü stand. Tür
     seçilince bölüm plan.sections'a AÇIKÇA yazılıyor; resolvePlanSections
     açık kaydı türetilmişin önüne koyduğu için (ölçüldü) tür böylece
     kalıcı oluyor. Adı tahmin etmeye çalışmıyoruz — bu kırılgan olurdu,
     kullanıcı seçiyor. Sözlük raporun §5.1'inden. */
  const SECTION_KINDS = { floor: "Kat / zemin", balcony: "Balkon", stand: "Tribün",
    tier: "Kademe", section: "Bölüm", box: "Loca", table_area: "Masa alanı",
    general_admission_area: "Ayakta alan" };

  const setSectionKind = (kind) => {
    const id = resolveBlockSectionId(selBlock);
    const parts = sectionPath(selBlock.level);
    const kod = parts[parts.length - 1] || "";
    const ustler = parts.slice(0, -1);
    const parentId = ustler.length ? `lvl:${ustler.join("/")}` : null;
    const mevcut = plan.sections || [];
    const idx = mevcut.findIndex((x) => x.id === id);
    const kayit = { id, code: kod, name: kod, kind, parentId };
    commit({ ...plan, sections: idx >= 0
      ? mevcut.map((x, i) => (i === idx ? { ...x, kind } : x))
      : [...mevcut, kayit] });
  };

  /* ── koltuk grupları: elle gruplama ───────────────────────────────
     Model 50fac97'de geldi (plan.groups + ov.groupId); masa blokları
     otomatik gruplanıyor. Burası elle gruplanması gerekenler için:
     loca, love-seat çifti, tekerlekli+refakatçi ikilisi. seatOps yalnız
     ov'a dokunduğu için ayrı duruyor — grup KAYDI plan.groups'a, koltuk
     ATFI ov'a gidiyor ve ikisi TEK commit'te olmalı, yoksa geri-al
     yarım bir durum bırakır. */
  const GROUP_KINDS = { box: "Loca", loveseat: "Love-seat çifti",
    pod: "Kapsül", companion_group: "Tekerlekli + refakatçi" };

  const groupSelected = (kind) => {
    if (!selSeats.size) return;
    const id = nid("g");
    const mevcut = (plan.groups || []).filter((g) => g.kind === kind).length + 1;
    const kod = `${kind.toUpperCase().slice(0, 3)}-${mevcut}`;
    const byB = new Map();
    selSeats.forEach((k) => { const [bid, rc] = k.split("|");
      if (!byB.has(bid)) byB.set(bid, []); byB.get(bid).push(rc); });
    commit({ ...plan,
      groups: [...(plan.groups || []), { id, code: kod, name: GROUP_KINDS[kind], kind }],
      blocks: plan.blocks.map((b) => {
        const list = byB.get(b.id); if (!list) return b;
        const ov = { ...b.ov };
        list.forEach((rc) => { ov[rc] = { ...(ov[rc] || {}), groupId: id }; });
        return { ...b, ov };
      }) });
    setMsg(`${selSeats.size} koltuk "${kod}" grubuna alındı`);
  };

  /* Gruptan çıkarma grubun KAYDINI silmez — başka koltukları kalmış
     olabilir. Kimsesi kalmayan grup kaydı zararsız (dışa aktarımda
     üyesiz görünür) ama biriktirmemek için burada temizleniyor. */
  const ungroupSelected = () => {
    if (!selSeats.size) return;
    const byB = new Map();
    selSeats.forEach((k) => { const [bid, rc] = k.split("|");
      if (!byB.has(bid)) byB.set(bid, []); byB.get(bid).push(rc); });
    const blocks = plan.blocks.map((b) => {
      const list = byB.get(b.id); if (!list) return b;
      const ov = { ...b.ov };
      list.forEach((rc) => {
        if (!ov[rc]) return;
        const o = { ...ov[rc] }; delete o.groupId;
        if (Object.keys(o).length) ov[rc] = o; else delete ov[rc];
      });
      return { ...b, ov };
    });
    const kullanilan = new Set();
    blocks.forEach((b) => Object.values(b.ov || {}).forEach((o) => o.groupId && kullanilan.add(o.groupId)));
    commit({ ...plan, blocks,
      groups: (plan.groups || []).filter((g) => kullanilan.has(g.id)) });
  };

  /* ── ok tuşlarıyla ince taşıma ────────────────────────────────── */
  const lastNudge = useRef(0);
  const nudge = (dx, dy) => {
    const fresh = Date.now() - lastNudge.current > 800;
    lastNudge.current = Date.now();
    /* checkpoint: fresh — 800ms'lik pencere içindeki art arda basışlar TEK
       geri-al kaydına düşsün. commit'in aksine elle setPast/setFuture/setRev
       yazmıyoruz — future'ı unutmayan TEK yer artık reducer (bkz. nudgeCommit,
       ui/state/reducer.js). */
    const push = (next) => dispatch({ type: "nudgeCommit", payload: { plan: next, checkpoint: fresh } });
    if (selSeats.size) {
      const byB = new Map();
      selSeats.forEach((k) => { const [bid, rc] = k.split("|");
        if (!byB.has(bid)) byB.set(bid, []); byB.get(bid).push(rc); });
      push({ ...plan, blocks: plan.blocks.map((b) => {
        const list = byB.get(b.id);
        if (!list) return b;
        const a = -b.rot * RAD;
        const lx = dx * Math.cos(a) - dy * Math.sin(a), ly = dx * Math.sin(a) + dy * Math.cos(a);
        const ov = { ...b.ov };
        list.forEach((rc) => { const o = ov[rc] || {};
          ov[rc] = { ...o, dx: Math.round((o.dx || 0) + lx), dy: Math.round((o.dy || 0) + ly) }; });
        return { ...b, ov };
      }) });
      return;
    }
    if (selIds.length) {
      push({ ...plan, blocks: plan.blocks.map((b) =>
        selIds.includes(b.id) ? { ...b, x: b.x + dx, y: b.y + dy } : b) });
      return;
    }
    if (selShapeId) {
      push({ ...plan, shapes: plan.shapes.map((s) =>
        s.id === selShapeId ? { ...s, x: s.x + dx, y: s.y + dy } : s) });
    }
  };

  /* ── blok tabanını elle çizme ─────────────────────────────────
     Koltuklardan türetilen taban sütunu, merdiven boşluğunu, düzensiz
     kenarı bilemez. Bunlar ancak elle çizilir. */
  const footStart = () => { if (!selBlock) return; setFootDraft([]); setTool("foot"); };
  const footFinish = () => {
    if (!selBlock || !footDraft || footDraft.length < 3) { setFootDraft(null); setTool("select"); return; }
    patchBlock(selBlock.id, { foot: footDraft.map((p) => toLocal(selBlock, p)) });
    setFootDraft(null); setTool("select");
    setMsg(`${footDraft.length} noktalı taban çizildi`);
  };
  const footSeed = () => {
    if (!selBlock) return;
    const m = metaById.get(selBlock.id);
    if (!m) return;
    patchBlock(selBlock.id, { foot: m.auto.map((p) => toLocal(selBlock, p)) });
    setMsg("Otomatik taban düzenlenebilir hale getirildi");
  };
  const footClear = () => { if (selBlock) patchBlock(selBlock.id, { foot: null }); };

  const doAutoGates = () => {
    const shapes = autoGates(plan, metas);
    commit({ ...plan, shapes });
    setMsg("Bloklar en yakın kapıya atandı");
  };

  /* ── mevcut koltuk listesini içe aktar ve eşleştir ────────────── */

  /* Eşleştirici TEK. Okuyucu iki tane: CSV ve db.json. İkisi de aynı
     {block,row,seat,id} listesine indirgenip buraya girer — "testte var,
     uygulamada yok" sınıfı ayrışmayı doğuran şey kuralın iki yere
     kopyalanmasıydı; kimlik eşleştirmesi de aynı hataya açık. */
  const runMatch = (list, fileName, cols) => {
    /* Eşleştirmenin kendisi core/identity.js'te — MCP'nin match_seat_list
       aracı da AYNI fonksiyonu çağırıyor, iki yerde ayrışmasın diye. */
    const r = matchSeats(list, metas, buildSeats, plan.idTemplate);
    setMatch({ file: fileName, cols, total: list.length, ...r });
    setVerOpen(false); setReport(null);
    setMsg(`${r.hits.length} koltuk eşleşti`);
  };

  const readFile = (e, parse, tur) => {
    const f = e.target.files?.[0];
    e.target.value = "";
    if (!f) return;
    const rd = new FileReader();
    rd.onload = () => {
      try { parse(rd.result, f.name); }
      catch (err) {
        console.error(`${tur} içe aktarma hatası:`, err);
        const detail = (err instanceof TypeError || err instanceof RangeError || err instanceof SyntaxError)
          ? `dosya beklenen ${tur} biçiminde değil` : err.message;
        setErr(`${tur} okunamadı: ${detail}`);
      }
    };
    rd.readAsText(f, "utf-8");
  };

  const importCSV = (e) => readFile(e, (text, name) => {
    const rows = parseCSV(text);
    if (rows.length < 2) throw new Error("satır yok");
    const cols = mapColumns(rows[0]);
    if (cols.id == null) throw new Error("kimlik sütunu bulunamadı (id / kimlik / kod)");
    if (cols.block == null || cols.row == null || cols.seat == null)
      throw new Error("blok / sıra / koltuk sütunları eksik");
    runMatch(
      rows.slice(1).map((r) => ({ block: r[cols.block], row: r[cols.row],
        seat: r[cols.seat], id: r[cols.id] })),
      name, Object.keys(cols));
  }, "CSV");

  /* db.json geri okuma: GEOMETRİ DEĞİL KİMLİK gelir (bkz. core/db-export.js
     dbSeatRows notu). Karşı sistem kalıcı koltuk kodunun sahibiyse çizimi
     burada tutup kimliği ondan benimsiyoruz. */
  const importDb = (e) => readFile(e, (text, name) => {
    const payload = JSON.parse(text);
    if (!Array.isArray(payload?.seats) || !Array.isArray(payload?.rows))
      throw new Error("seats / rows tabloları bulunamadı");
    const list = dbSeatRows(payload);
    if (!list.length) throw new Error("koltuk satırı yok");
    runMatch(list, name, ["sections.code", "rows.code", "seats.label", "seats.code"]);
  }, "db.json");

  /** Eşleşen koltuklara listedeki kimliği yazar — çizim değil, kimlik uyarlanır. */
  const adoptIds = () => {
    if (!match) return;
    commit(applyAdoptedIds(plan, match.changing));
    setMsg(`${match.changing.length} koltuk kimliği benimsendi`);
    setMatch({ ...match, changing: [] });
  };

  const exportCSV = () => {
    const lines = ["id;kat;blok;sira;koltuk"];
    metas.forEach(({ b, m }) => buildSeats(b, m, plan.idTemplate).seats.forEach((s) => {
      if (!s.gap) lines.push([s.id, s.level, s.block, s.row, s.num].join(";"));
    }));
    const blob = new Blob(["\uFEFF" + lines.join("\n")], { type: "text/csv;charset=utf-8" });
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob); a.download = `${plan.key}-seats.csv`; a.click();
    URL.revokeObjectURL(a.href);
    setMsg("CSV indirildi");
  };

  /* ── pointer ──────────────────────────────────────────────────── */
  const onDown = (e) => {
    const raw = toWorldPt(e.clientX, e.clientY);
    const p = snap(raw);
    /* boyarken yakalama yapmıyoruz — sürüklerken altındaki koltuğu görmek gerek */
    if (tool !== "attr") e.currentTarget.setPointerCapture(e.pointerId);
    const t = e.target?.dataset;

    /* iki parmak → pinch ile yakınlaştır */
    pointers.current.set(e.pointerId, { x: e.clientX, y: e.clientY });
    if (pointers.current.size === 2) {
      const [a, b] = [...pointers.current.values()];
      pinch.current = { d: Math.hypot(a.x - b.x, a.y - b.y) };
      drag.current = null; setMarq(null); setDraft(null);
      return;
    }

    /* pan: Kaydır aracı · boşluk tuşu · orta tuş · sağ tuş · Shift */
    if (tool === "pan" || spaceDown || e.button === 1 || e.button === 2 ||
        (e.shiftKey && !t?.b && !t?.h)) {
      drag.current = { mode: "pan", sx: e.clientX, sy: e.clientY, view };
      return;
    }

    if (tool === "attr") {
      if (t?.b && t.r != null) { drag.current = { mode: "paint", snapshot: plan };
        paintSeat(t.b, +t.r, +t.c); }
      else { drag.current = { mode: "seatMarq", paint: true };
        setMarq({ x0: raw.x, y0: raw.y, x1: raw.x, y1: raw.y }); }
      return;
    }
    if (t?.h && selBlock) {
      drag.current = { mode: "handle", h: t.h, b: selBlock, snapshot: plan,
        sx: e.clientX, sy: e.clientY,
        startAng: Math.atan2(raw.y - selBlock.y, raw.x - selBlock.x) / RAD };
      return;
    }
    if (tool === "table") {
      const nb = newTable(p.x, p.y);
      nb.label = `M${plan.blocks.filter((b) => b.kind === "table").length + 1}`;
      nb.level = levelFilter === "*" ? (levels[0] || "") : levelFilter;
      nb.name = nb.label;
      commit({ ...plan, blocks: [...plan.blocks, nb] });
      setSelIds([nb.id]); setSelShapeId(null);
      return;
    }
    if (tool === "poi") {
      const sh = { id: nid("s"), kind: "icon", type: "icon", icon: poiKind,
        x: p.x, y: p.y, rot: 0, size: 34, w: 200, h: 200,
        label: POI[poiKind].label, capacity: 0, fs: 100, blocks: [] };
      commit({ ...plan, shapes: [...plan.shapes, sh] });
      setSelShapeId(sh.id); setSelIds([]);
      return;
    }
    if (tool === "foot") { setFootDraft((q) => [...(q || []), p]); return; }
    if (tool === "poly") { setPoly((q) => (q ? { ...q, pts: [...q.pts, p] } : { pts: [p] })); return; }
    if (tool === "seatAdd") {
      const b = selBlock?.kind === "free" ? selBlock : null;
      if (b) patchBlock(b.id, { pts: [...b.pts, { x: p.x - b.x, y: p.y - b.y, rot: 0 }] });
      else {
        const nb = newFree(p.x, p.y);
        nb.pts = [{ x: 0, y: 0, rot: 0 }];
        nb.label = `S${plan.blocks.length + 1}`;
        commit({ ...plan, blocks: [...plan.blocks, nb] });
        setSelIds([nb.id]);
      }
      return;
    }
    if (tool === "seat") {
      if (t?.b && t.r != null) {
        const anahtar = `${t.b}|${t.r},${t.c}`;
        /* Shift / Cmd / Ctrl ile tıklamak koltuğu seçime EKLER-ÇIKARIR.
           Kement her zaman yetmiyor: bir sıranın iki ucu, farklı bloklardan
           koltuklar, aradaki koltukları kapsamadan seçilemez. */
        if (e.shiftKey || e.metaKey || e.ctrlKey) {
          const next = new Set(selSeats);
          if (next.has(anahtar)) next.delete(anahtar); else next.add(anahtar);
          /* SIRA ÖNEMLİ, aşağıdaki düz tıklamayla AYNI gerekçe (bkz.
             reducer.js "selectBlocks"): selectBlocks koltuk seçimini
             temizliyor, o yüzden ÖNCE blok SONRA koltuk yazılmalı.
             İlk yazışımda tersini yaptım ve seçim her cmd+tıkta
             sıfırlanıyordu. */
          if (!selIds.includes(t.b)) setSelIds([...selIds, t.b]);
          seatSelSync(next);
          drag.current = null;          /* sürükleme başlatma — seçim topluyoruz */
          return;
        }
        /* SIRA ÖNEMLİ: selectBlocks artık koltuk seçimini kendiliğinden
           bırakıyor (bkz. reducer.js "selectBlocks", HATA 2) — önce blok
           seçilip SONRA koltuk yazılmalı, yoksa setSelIds az önce alttaki
           iki satırın yazdığı koltuk seçimini siler. */
        setSelIds([t.b]);
        setSelSeat({ bid: t.b, r: +t.r, c: +t.c });
        setSelSeats(new Set([anahtar]));
        const b = plan.blocks.find((x) => x.id === t.b);
        drag.current = { mode: "seat", bid: t.b, r: +t.r, c: +t.c, p: raw, ov: b.ov, blockRot: b.rot, snapshot: plan };
      } else {
        setSelSeat(null); setSelSeats(new Set());
        drag.current = { mode: "seatMarq", paint: false, add: e.shiftKey, base: selSeats };
        setMarq({ x0: raw.x, y0: raw.y, x1: raw.x, y1: raw.y });
      }
      return;
    }
    if (tool === "select") {
      if (t?.b) {
        setSelShapeId(null); setSelSeat(null);
        const next = e.shiftKey
          ? (selIds.includes(t.b) ? selIds.filter((i) => i !== t.b) : [...selIds, t.b])
          : (selIds.includes(t.b) ? selIds : [t.b]);
        setSelIds(next);
        drag.current = { mode: "move", ids: next, p: raw, snapshot: plan,
          ...alignSetup(next, metas, metaById, plan.shapes) };
      } else if (t?.s) {
        setSelIds([]); setSelShapeId(t.s); setSelSeat(null);
        drag.current = { mode: "moveShape", id: t.s, p: raw, snapshot: plan };
      } else {
        if (!e.shiftKey) { setSelIds([]); setSelShapeId(null); setSelSeat(null); }
        drag.current = { mode: "marq", p: raw, add: e.shiftKey, base: selIds };
        setMarq({ x0: raw.x, y0: raw.y, x1: raw.x, y1: raw.y });
      }
      return;
    }
    drag.current = { mode: "draw", p: tool === "cal" ? raw : p };
    setDraft({ x0: tool === "cal" ? raw.x : p.x, y0: tool === "cal" ? raw.y : p.y,
               x1: tool === "cal" ? raw.x : p.x, y1: tool === "cal" ? raw.y : p.y });
  };

  const onMove = (e) => {
    const raw = toWorldPt(e.clientX, e.clientY);
    setCursor(raw);

    if (pointers.current.has(e.pointerId))
      pointers.current.set(e.pointerId, { x: e.clientX, y: e.clientY });
    if (pinch.current && pointers.current.size === 2) {
      const [a, b] = [...pointers.current.values()];
      const d = Math.hypot(a.x - b.x, a.y - b.y);
      if (pinch.current.d > 0 && d > 0)
        zoomAt((a.x + b.x) / 2, (a.y + b.y) / 2, pinch.current.d / d);
      pinch.current.d = d;
      return;
    }

    const d = drag.current;
    if (!d) {
      /* İmleç altındaki koltuğun kimliği — tıklamadan görünsün. */
      if (seatMode) {
        const t = e.target?.dataset;
        if (t?.b && t.r != null) {
          const hit = drawn.find((x) => x.b.id === t.b);
          const st = hit && hit.seats.find((x) => x.r === +t.r && x.c === +t.c);
          const id = st ? st.id : "";
          if (id !== hoverId) setHoverId(id);
        } else if (hoverId) setHoverId("");
      } else if (hoverId) setHoverId("");
      return;
    }
    if (d.mode === "paint") {
      const t = e.target?.dataset;
      if (t?.b && t.r != null) paintSeat(t.b, +t.r, +t.c);
      return;
    }
    if (d.mode === "pan") {
      const r = svgRef.current.getBoundingClientRect();
      const s = Math.min(r.width / d.view.w, r.height / d.view.h);
      setView({ ...d.view, x: d.view.x - (e.clientX - d.sx) / s, y: d.view.y - (e.clientY - d.sy) / s });
      return;
    }
    if (d.mode === "handle") {
      /* İşaretçi mousedown'dan beri anlamlı bir mesafe hareket etmediyse
         (bkz. HANDLE_DRAG_PX) hiçbir patch uygulama — salt tıklama, blok
         snapshot'tan bir bit bile ayrılmamalı (finalizeDrag'ın referans
         eşitliğiyle no-op sayması da BUNA dayanıyor, bkz. reducer.js). */
      if (Math.hypot(e.clientX - d.sx, e.clientY - d.sy) < HANDLE_DRAG_PX) return;
      const patch = handlePatch(d.b, d.h, raw, d.startAng);
      setPlan({ ...plan, blocks: plan.blocks.map((x) => (x.id === d.b.id ? { ...x, ...patch } : x)) });
      return;
    }
    if (d.mode === "marq" || d.mode === "seatMarq") { setMarq((q) => ({ ...q, x1: raw.x, y1: raw.y })); return; }
    if (d.mode === "move") {
      const rdx = raw.x - d.p.x, rdy = raw.y - d.p.y;
      const tol = 7 / (pxPerCm || 0.01);
      const a = alignDelta(d, rdx, rdy, tol);
      /* hizaya oturmayan eksende ızgaraya yapış */
      const st = snapOn ? gridStep : 0;
      const dx = a.g.some((g) => g.axis === "x") ? a.dx : st ? Math.round(a.dx / st) * st : a.dx;
      const dy = a.g.some((g) => g.axis === "y") ? a.dy : st ? Math.round(a.dy / st) * st : a.dy;
      setGuides(a.g);
      setPlan({ ...plan, blocks: plan.blocks.map((b) => {
        if (!d.ids.includes(b.id)) return b;
        const src = d.snapshot.blocks.find((o) => o.id === b.id);
        return { ...b, x: Math.round(src.x + dx), y: Math.round(src.y + dy) };
      }) });
      return;
    }
    if (d.mode === "moveShape") {
      const dx = raw.x - d.p.x, dy = raw.y - d.p.y;
      const src = d.snapshot.shapes.find((o) => o.id === d.id);
      setPlan({ ...plan, shapes: plan.shapes.map((o) => o.id === d.id ? { ...o, ...snap({ x: src.x + dx, y: src.y + dy }) } : o) });
      return;
    }
    if (d.mode === "seat") {
      const a = -d.blockRot * RAD;
      const gx = raw.x - d.p.x, gy = raw.y - d.p.y;
      const dx = gx * Math.cos(a) - gy * Math.sin(a);
      const dy = gx * Math.sin(a) + gy * Math.cos(a);
      const k = `${d.r},${d.c}`, prev = d.ov[k] || {};
      const nv = { ...prev, dx: Math.round((prev.dx || 0) + dx), dy: Math.round((prev.dy || 0) + dy) };
      setPlan({ ...plan, blocks: plan.blocks.map((b) => b.id === d.bid ? { ...b, ov: { ...b.ov, [k]: nv } } : b) });
      d.p = raw; d.ov = { ...d.ov, [k]: nv };
      return;
    }
    if (d.mode === "draw") {
      const s = tool === "cal" ? raw : snap(raw);
      setDraft((q) => ({ ...q, x1: s.x, y1: s.y }));
    }
  };

  const onUp = (e) => {
    if (e?.pointerId != null) pointers.current.delete(e.pointerId);
    if (pointers.current.size < 2) pinch.current = null;
    const d = drag.current;
    drag.current = null;
    if (d?.mode === "handle" || d?.mode === "paint") {
      finalizeDrag(d.snapshot);
      return;
    }
    if (d?.mode === "seatMarq") {
      const q = marq; setMarq(null);
      if (!q) return;
      const x0 = Math.min(q.x0, q.x1), x1 = Math.max(q.x0, q.x1);
      const y0 = Math.min(q.y0, q.y1), y1 = Math.max(q.y0, q.y1);
      if (x1 - x0 < 20 && y1 - y0 < 20) return;
      const hits = [];
      drawn.forEach(({ b, seats }) => seats.forEach((s) => {
        if (s.x >= x0 && s.x <= x1 && s.y >= y0 && s.y <= y1) hits.push({ bid: b.id, s });
      }));
      if (!hits.length) { setMsg("Seçime koltuk girmedi"); return; }
      if (d.paint) {
        const byB = new Map();
        hits.forEach(({ bid, s }) => {
          if (!byB.has(bid)) byB.set(bid, []);
          byB.get(bid).push(`${s.r},${s.c}`);
        });
        commit({ ...plan, blocks: plan.blocks.map((b) => {
          const list = byB.get(b.id);
          if (!list) return b;
          const ov = { ...b.ov };
          list.forEach((rc) => {
            const nx = paintOv(ov[rc] || {}, b, brushKind, brushFeatures);
            Object.keys(nx).length ? (ov[rc] = nx) : delete ov[rc];
          });
          return { ...b, ov };
        }) });
        setMsg(`${hits.length} koltuk boyandı`);
      } else {
        const next = d.add ? new Set(d.base) : new Set();
        hits.forEach(({ bid, s }) => next.add(`${bid}|${s.r},${s.c}`));
        seatSelSync(next);
        setMsg(`${next.size} koltuk seçildi`);
      }
      return;
    }
    if (d?.mode === "marq") {
      const q = marq; setMarq(null);
      if (!q || (Math.abs(q.x1 - q.x0) < 30 && Math.abs(q.y1 - q.y0) < 30)) return;
      const x0 = Math.min(q.x0, q.x1), x1 = Math.max(q.x0, q.x1);
      const y0 = Math.min(q.y0, q.y1), y1 = Math.max(q.y0, q.y1);
      const hit = metas.filter(({ b, m }) =>
        levelMatches(b.level, levelFilter) &&
        m.bbox.x0 >= x0 && m.bbox.x1 <= x1 && m.bbox.y0 >= y0 && m.bbox.y1 <= y1).map((x) => x.b.id);
      setSelIds(d.add ? [...new Set([...d.base, ...hit])] : hit);
      return;
    }
    if (d?.mode === "move" || d?.mode === "moveShape" || d?.mode === "seat") {
      setGuides([]);
      finalizeDrag(d.snapshot);
      return;
    }
    if (d?.mode !== "draw" || !draft) { setDraft(null); return; }
    const { x0, y0, x1, y1 } = draft;
    setDraft(null);
    const w = Math.abs(x1 - x0), h = Math.abs(y1 - y0), len = Math.hypot(x1 - x0, y1 - y0);

    if (tool === "cal") {
      if (len < 20) return;
      if (!plan.underlay) { setMsg("Önce altlık yükleyin"); return; }
      setCalib({ x0, y0, x1, y1, px: len, meters: (len / 100).toFixed(2) });
      return;
    }
    if (tool === "measure") { setMsg(`Ölçü: ${(len / 100).toFixed(2)} m`); return; }
    if (tool === "shape") {
      const isPitch = shapeType === "pitch";
      if (!isPitch && (w < 20 || h < 20)) return;
      const P = PITCHES[sport];
      const sh = { id: nid("s"), kind: "rect", type: shapeType,
        x: isPitch ? x0 : (x0 + x1) / 2, y: isPitch ? y0 : (y0 + y1) / 2,
        w: isPitch ? P.w : w, h: isPitch ? P.h : h, rot: 0,
        sport: isPitch ? sport : undefined,
        label: isPitch ? P.label : SHAPES[shapeType].label,
        capacity: shapeType === "standing" ? 100 : 0, fs: 100, blocks: [] };
      commit({ ...plan, shapes: [...plan.shapes, sh] });
      setSelShapeId(sh.id); return;
    }
    let b = null;
    if (tool === "grid") {
      if (w < 30 || h < 30) return;
      b = newGrid((x0 + x1) / 2, Math.min(y0, y1),
        Math.max(1, Math.round(w / DEF.seatGap) + 1), Math.max(1, Math.round(h / DEF.rowGap) + 1));
    } else if (tool === "row") {
      if (len < 30) return;
      b = newGrid((x0 + x1) / 2, (y0 + y1) / 2, Math.max(1, Math.round(len / DEF.seatGap) + 1), 1);
      b.rot = Math.atan2(y1 - y0, x1 - x0) / RAD;
    } else if (tool === "fan") {
      b = newFan(x0, y0, Math.max(100, len));
    }
    if (!b) return;
    b.label = String(plan.blocks.length + 1);
    b.level = levelFilter === "*" ? (levels[0] || "") : levelFilter;
    b.name = b.level ? `${b.level} · ${b.label}` : b.label;
    commit({ ...plan, blocks: [...plan.blocks, b] });
    setSelIds([b.id]); setTool("select");
  };

  const applyCal = () => {
    const real = parseFloat(String(calib.meters).replace(",", ".")) * 100;
    if (!real || !plan.underlay) { setCalib(null); return; }
    const f = real / calib.px;
    const u = plan.underlay, ax = calib.x0, ay = calib.y0;
    commit({ ...plan, underlay: { ...u,
      x: ax + (u.x - ax) * f, y: ay + (u.y - ay) * f, w: u.w * f, h: u.h * f } });
    setCalib(null); setTool("select");
    setMsg(`Altlık ölçeklendi ×${f.toFixed(3)}`);
  };

  const finishPoly = () => {
    if (!poly || poly.pts.length < 3) { setPoly(null); return; }
    const xs = poly.pts.map((p) => p.x), ys = poly.pts.map((p) => p.y);
    const cx = (Math.min(...xs) + Math.max(...xs)) / 2, cy = (Math.min(...ys) + Math.max(...ys)) / 2;
    const sh = { id: nid("s"), kind: "poly", type: shapeType, x: cx, y: cy, rot: 0,
      pts: poly.pts.map((p) => ({ x: p.x - cx, y: p.y - cy })),
      label: SHAPES[shapeType].label, capacity: shapeType === "standing" ? 100 : 0, fs: 100 };
    commit({ ...plan, shapes: [...plan.shapes, sh] });
    setPoly(null); setSelShapeId(sh.id); setTool("select");
  };

  /* Tekerlek: macOS'ta pinch, ctrlKey işaretli bir wheel olayı olarak gelir.
     Normal iki parmak kaydırma ctrlKey taşımaz — onu gezinti saymak gerek.
     Ayırt etme: fare tekerleği satır modunda (deltaMode 1) ya da ~100'lük
     tam adımlarla gelir; trackpad küçük, kesirli ve yatay bileşenli gelir. */
  const wheelKind = useRef("mouse");
  const onWheel = (e) => {
    e.preventDefault();
    if (e.deltaMode === 1) wheelKind.current = "mouse";
    else if (e.ctrlKey || e.deltaX !== 0 || !Number.isInteger(e.deltaY) || Math.abs(e.deltaY) < 40)
      wheelKind.current = "trackpad";
    else if (Math.abs(e.deltaY) >= 100) wheelKind.current = "mouse";
    const mode = wheelPref === "auto" ? wheelKind.current : wheelPref;

    /* pinch her iki modda da yakınlaştırır */
    if (e.ctrlKey || e.metaKey) {
      zoomAt(e.clientX, e.clientY, Math.exp(e.deltaY * 0.01));
      return;
    }
    if (mode === "trackpad") {
      const s = pxPerCm || 1;
      setView((v) => ({ ...v, x: v.x + e.deltaX / s, y: v.y + e.deltaY / s }));
      return;
    }
    if (e.shiftKey) {
      const s = pxPerCm || 1;
      setView((v) => ({ ...v, x: v.x + e.deltaY / s }));
      return;
    }
    /* Büyük bir stadyumda tam salondan tek koltuk numarasının okunacağı
       yakınlığa gitmek fiziksel olarak yüzlerce kat zum ister (bkz.
       seatNums eşiği). Adım başına 1.18 ile bu onlarca tekerlek hareketi
       istiyordu; 1.3 aynı mesafeyi ~%35 daha az hareketle aldırıyor. */
    zoomAt(e.clientX, e.clientY, e.deltaY > 0 ? 1.3 : 1 / 1.3);
  };

  const toggleOv = ({ bid, r, c }, key) => {
    const b = plan.blocks.find((x) => x.id === bid);
    if (!b) return;
    const k = `${r},${c}`, cur = b.ov[k] || {}, ov = { ...b.ov };
    if (cur[key]) { const n = { ...cur }; delete n[key]; Object.keys(n).length ? (ov[k] = n) : delete ov[k]; }
    else ov[k] = { ...cur, [key]: true, ...(key === "rm" ? { gap: false } : { rm: false }) };
    patchBlock(bid, { ov });
  };
  const setOv = ({ bid, r, c }, patch) => {
    const b = plan.blocks.find((x) => x.id === bid);
    if (!b) return;
    patchBlock(bid, { ov: { ...b.ov, [`${r},${c}`]: { ...(b.ov[`${r},${c}`] || {}), ...patch } } });
  };

  /** Nitelik boyama — commit değil setPlan; geçmişe fırça bırakıldığında yazılır. */
  const paintSeat = (bid, r, c) => {
    setVenues((vs) => {
      const pl = vs[vk];
      const b = pl.blocks.find((x) => x.id === bid);
      if (!b) return vs;
      const k = `${r},${c}`, cur = b.ov[k] || {};
      if (sameAttr(resolveSeatKind(b, cur), { seatKind: brushKind, seatFeatures: brushFeatures })) return vs;
      const nx = paintOv(cur, b, brushKind, brushFeatures);
      const ov = { ...b.ov };
      Object.keys(nx).length ? (ov[k] = nx) : delete ov[k];
      return { ...vs, [vk]: { ...pl, blocks: pl.blocks.map((x) => (x.id === bid ? { ...x, ov } : x)) } };
    });
  };

  useEffect(() => {
    const h = (e) => {
      if (["INPUT", "SELECT", "TEXTAREA"].includes(e.target.tagName)) return;
      const k = e.key.toLowerCase();
      if ((e.ctrlKey || e.metaKey) && k === "z") { e.preventDefault(); e.shiftKey ? redo() : undo(); return; }
      if ((e.ctrlKey || e.metaKey) && k === "a") {
        e.preventDefault();
        setSelIds(metas.filter(({ b }) => levelMatches(b.level, levelFilter)).map((x) => x.b.id));
        return;
      }
      if (e.key === "Enter" && footDraft) { footFinish(); return; }
      if (e.key === "Enter" && poly) { finishPoly(); return; }
      /* A6.4: Esc, "normal olmayan" altı durumun (arrPrev, levelFilter,
         calib, footDraft, poly, match — bkz. modeChips'in üstündeki not)
         HEPSİNDEN tutarlı çıkış yolu. Önceden yalnız poly/calib/footDraft
         kapanıyordu, arrPrev/levelFilter/match AÇIK KALIYORDU — kullanıcı
         Esc'e basıp "temizlendi" sanırken üçü sessizce aktif kalabiliyordu.
         footDraft ve poly kendi taslaklarını iptal ederken seçili bloğu
         KORUR (o taslağı hangi blok için çizdiğini unutturmamak için) —
         bu yüzden ikisi de erken return ile genel seçim temizliğini atlar. */
      if (e.key === "Escape") {
        setDraft(null); setCalib(null); setReport(null); setSetOpen(false);
        setArrPrev(null); setMatch(null);
        if (levelFilter !== "*") setLevelFilter("*");
        if (footDraft) { setFootDraft(null); setTool("select"); return; }
        if (poly) { setPoly(null); setTool("select"); return; }
        setSelIds([]); setSelShapeId(null); setSelSeat(null); setSelSeats(new Set()); return;
      }

      /* ok tuşları: varsayılan 1 cm, Shift 10×, Alt ızgara adımı */
      const ARR = { ArrowLeft: [-1, 0], ArrowRight: [1, 0], ArrowUp: [0, -1], ArrowDown: [0, 1] };
      if (ARR[e.key]) {
        if (!selIds.length && !selShapeId && !selSeats.size) return;
        e.preventDefault();
        const step = e.altKey ? gridStep : e.shiftKey ? 10 : 1;
        nudge(ARR[e.key][0] * step, ARR[e.key][1] * step);
        return;
      }
      const map = { v: "select", g: "grid", f: "fan", r: "row", t: "table", s: "seatAdd", e: "seat",
        n: "attr", d: "shape", p: "poly", i: "poi", m: "measure", k: "cal", h: "pan" };
      if (map[k]) setTool(map[k]);
      if (k === "y") setSnapOn((s) => !s);
      if (e.key === "Delete" || e.key === "Backspace") {
        /* Öncelik sırası ui/state/selectors.js'te (deleteTarget) — koltuk
           seçimi HER ZAMAN bloktan önce. Sıra oradaki notta anlatılan bir
           veri kaybı hatasının karşılığı, burada tekrar yazılmıyor. */
        switch (deleteTarget({ selSeats, selSeat, selIds, selShapeId })) {
          case "seats":
            seatOps((o) => ({ ...o, rm: true, gap: false }));
            setMsg(`${selSeats.size} koltuk silindi`);
            return;
          case "seat": toggleOv(selSeat, "rm"); return;
          case "blocks":
            commit({ ...plan, blocks: plan.blocks.filter((b) => !selIds.includes(b.id)) });
            setSelIds([]); return;
          case "shape":
            commit({ ...plan, shapes: plan.shapes.filter((s) => s.id !== selShapeId) });
            setSelShapeId(null); return;
          default: return;
        }
      }
    };
    window.addEventListener("keydown", h);
    return () => window.removeEventListener("keydown", h);
  });

  /* tema: sistem tercihini dinle, kullanıcı seçimi varsa onu uygula */
  useEffect(() => {
    if (typeof window === "undefined" || !window.matchMedia) return;
    const m = window.matchMedia("(prefers-color-scheme: dark)");
    const f = () => setSysDark(m.matches);
    f();
    m.addEventListener?.("change", f);
    return () => m.removeEventListener?.("change", f);
  }, []);
  useEffect(() => { (async () => {
    const t = await Store.pref("theme");
    if (t) setTheme(t);
    const w = await Store.pref("wheel");
    if (w) setWheelPref(w);
  })(); }, []);
  const setWheelPrefP = (w) => { setWheelPref(w); Store.pref("wheel", w); };
  const setThemePref = (t) => { setTheme(t); Store.pref("theme", t); };
  const dark = theme === "system" ? sysDark : theme === "dark";

  /* boşluk tuşu basılıyken geçici kaydırma modu */
  useEffect(() => {
    const down = (e) => {
      if (e.code === "Space" && !["INPUT", "SELECT", "TEXTAREA"].includes(e.target.tagName)) {
        e.preventDefault(); setSpaceDown(true);
      }
    };
    const up = (e) => { if (e.code === "Space") setSpaceDown(false); };
    const blur = () => setSpaceDown(false);
    window.addEventListener("keydown", down);
    window.addEventListener("keyup", up);
    window.addEventListener("blur", blur);
    return () => { window.removeEventListener("keydown", down);
      window.removeEventListener("keyup", up); window.removeEventListener("blur", blur); };
  }, []);

  const loadUnderlay = (e) => {
    const f = e.target.files?.[0];
    if (!f) return;
    const rd = new FileReader();
    rd.onload = () => {
      const img = new Image();
      img.onload = () => {
        const sc = (view.w * 0.8) / img.width;
        commit({ ...plan, underlay: { src: rd.result, x: -img.width * sc / 2,
          y: -img.height * sc / 2, w: img.width * sc, h: img.height * sc, opacity: 0.4 } });
        setMsg("Altlık yüklendi · şimdi Kalibre et (K)");
      };
      img.src = rd.result;
    };
    rd.readAsDataURL(f);
    e.target.value = "";
  };

  const importPlan = (e) => {
    const f = e.target.files?.[0];
    if (!f) return;
    const rd = new FileReader();
    rd.onload = () => {
      try {
        const raw = JSON.parse(rd.result);
        const key = `imp${Date.now().toString(36)}`;
        const p = adoptPlan(raw, key);
        setVenues((v) => ({ ...v, [key]: p }));
        setVk(key); setPast([]); setFuture([]); setSelIds([]); setSelShapeId(null);
        setLevelFilter("*"); setView(planHome(p)); setReport(null);
        setMsg(`${p.blocks.length} blok içe aktarıldı`);
      } catch (err) {
        console.error("Plan içe aktarma hatası:", err);
        const detail = err instanceof SyntaxError ? "dosya geçerli bir JSON değil" : err.message;
        setErr(`İçe aktarılamadı: ${detail}`);
      }
    };
    rd.readAsText(f);
    e.target.value = "";
  };

  const download = (name, obj) => {
    const blob = new Blob([JSON.stringify(obj, null, 2)], { type: "application/json" });
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob); a.download = name; a.click();
    URL.revokeObjectURL(a.href); setMsg(`${name} indirildi`);
  };
  const exportSeats = () => {
    setMsg("koltuklar üretiliyor…");
    download(`${plan.key}-seats.json`, buildSeatsPayload(plan, metas, levelCounts, gates));
  };
  /* Hedef şemanın TABLOLARI — seats.json okunabilir bir özet, bu ise
     doğrudan INSERT edilebilir satır listesi (sections/rows/seat_types/
     seat_groups/seats/shapes/entrances, yabancı anahtarlarıyla).
     Referans bütünlüğü test/invariants/db-export.test.js'te 9 salon
     üstünde otomatik sınanıyor. */
  const exportDb = () => {
    setMsg("tablolar üretiliyor…");
    download(`${plan.key}-db.json`, buildDbPayload(plan, metas, gates));
  };
  const exportPlan = () => download(`${plan.key}-plan.json`,
    { ...plan, underlay: plan.underlay ? { ...plan.underlay, src: null } : null });

  const mirror = () => {
    if (!selBlocks.length) return;
    const taken = new Set(usedLabels);
    const made = selBlocks.map((b) => {
      const label = freeLabel(b.label, selBlocks.length, taken);
      taken.add(label);
      return mirrorBlock(b, label);
    });
    commit({ ...plan, blocks: [...plan.blocks, ...made] });
    setSelIds(made.map((b) => b.id));
  };

  const gridLines = useMemo(() => {
    const px = 900 / view.w;
    let step = gridStep;
    while (step * px < 7) step *= 5;
    const out = { minor: [], major: [] };
    const x0 = Math.floor(view.x / step) * step, x1 = view.x + view.w;
    const y0 = Math.floor(view.y / step) * step, y1 = view.y + view.h;
    if ((x1 - x0) / step < 320) {
      for (let x = x0; x <= x1; x += step) (Math.round(x) % (step * 5) === 0 ? out.major : out.minor).push(["v", x]);
      for (let y = y0; y <= y1; y += step) (Math.round(y) % (step * 5) === 0 ? out.major : out.minor).push(["h", y]);
    }
    return out;
  }, [view, gridStep]);

  const TOOL_GROUPS = [
    ["", [["select", "Seç ve taşı", "V", "select"], ["pan", "Kaydır", "H", "pan"]]],
    ["Çiz", [["grid", "Izgara blok", "G", "grid"], ["fan", "Yelpaze blok", "F", "fan"],
             ["row", "Tek sıra", "R", "row"], ["table", "Masa", "T", "table"],
             ["seatAdd", "Tek koltuk", "S", "seat"]]],
    ["Koltuk", [["seat", "Koltuk düzenle", "E", "seatEd"], ["attr", "Nitelik boya", "N", "brush"]]],
    ["Ortam", [["shape", "Şekil", "D", "shape"], ["poly", "Poligon", "P", "poly"],
               ["poi", "İşaret", "I", "info"]]],
    ["Referans", [["cal", "Kalibre et", "K", "cal"], ["measure", "Ölç", "M", "measure"]]],
  ];
  const seatOvBlock = selSeat ? plan.blocks.find((b) => b.id === selSeat.bid) : null;
  const seatOv = selSeat ? seatOvBlock?.ov[`${selSeat.r},${selSeat.c}`] || {} : null;
  /* SeatPanel'in gösterdiği "şu an ne seçili" değeri — seatOv PARÇALI
     olabilir (bkz. resolveSeatKind'in bağımsız override notu), panel yine
     de TEK bir somut {seatKind, seatFeatures} göstermeli. seatOvBlock
     bulunamazsa (selSeat, silinmiş bir bloğa işaret eden BAYAT bir
     referansla kalmışsa — eski seatOv da AYNI durumda sessizce {}'e
     düşüyordu, bkz. yukarıdaki satır) resolveSeatKind({}, {}) güvenle
     "single" varsayılanına döner; SeatPanel eff.seatKind'i KOŞULSUZ okur,
     null asla geçmemeli. */
  const seatEffAttr = selSeat ? resolveSeatKind(seatOvBlock || {}, seatOv || {}) : null;
  const lodFont = 17 * U;
  const hSize = Math.max(24, 9 / (pxPerCm || 0.01));
  const arrProps = { lin, setLin, rad, setRad, onArrayL: doLinear, onArrayR: doRadial,
    prev: arrPrev, setPrev: setArrPrev };
  const selSeatTotal = selBlocks.reduce((a, b) => a + (metaById.get(b.id)?.seatCount || 0), 0);

  /* ── A6.4: mod şeridi ─────────────────────────────────────────────
     Adaylar (görev tanımındaki altısı): arrPrev, levelFilter, calib,
     footDraft, poly, match. Ölçüt: bu durum aktifken uygulama kullanıcının
     beklediğinden farklı davranıyor mu, VE bunu ekranda panel/rayın açık
     olmasına bakmadan HER ZAMAN okuyabiliyor mu?
       - levelFilter: seçici sol rayda (toolsOpen kapalıyken hiç görünmez);
         filtre bloğu SİLMİYOR ama öyle hissettiriyor ("bloklarımı yuttu").
       - arrPrev: paneli (BlockPanel → ArraySection) sağ rayda (propsOpen
         kapalıyken hiç görünmez) VE seçim değişince de panelden düşmüyor;
         hayalet bloklar ekranda kalırken kapatacak kontrol kayboluyor
         ("diziden çıkamadım").
       - poly: tek göstergesi sol raydaki "Poligonu kapat" düğmesi
         (yine toolsOpen'a bağımlı) — footDraft'ın aksine tuval üstünde
         sabit bir ipucu YOK.
     calib ve footDraft BİLEREK dışarıda bırakıldı: ikisi de rayın açık/
     kapalı olmasından bağımsız, tuval üstünde HER ZAMAN görünen kendi
     şeridine sahip (.calbar / .tip) ve ikisi de zaten "Esc ile çık"ı
     söylüyor — ikinci bir şerit eklemek aynı bilgiyi tekrarlar. match da
     dışarıda: kendi geniş panelinde ("Koltuk listesi eşleştirme") zaten
     her zaman görünür ve açık bir "kapat" bağlantısı taşıyor; tek eksiği
     Esc'ti, o aşağıda düzeltildi — ayrıca bir şerit rozeti eklemek
     gürültü olurdu. */
  const modeChips = [];
  if (levelFilter !== "*") modeChips.push({ k: "lf",
    label: `Kat süzgeci: ${levelFilter}`, x: () => setLevelFilter("*") });
  if (arrPrev) modeChips.push({ k: "ap",
    label: `Dizi önizleme: ${arrPrev === "lin" ? "doğrusal" : "radyal"}`, x: () => setArrPrev(null) });
  if (poly) modeChips.push({ k: "pg",
    label: `Çokgen çiziliyor · ${poly.pts.length} nokta`, x: () => { setPoly(null); setTool("select"); } });

  return (
    <div className={`ed ${dark ? "dark" : "light"}`}>
      <div className="gate">
        <p>Bu editör geniş bir çalışma alanı gerektirir.
          <span>Lütfen masaüstü tarayıcıda veya en az 1024px genişliğinde bir pencerede açın.</span>
        </p>
      </div>

      <header className="top">
        <select className="venue" value={vk} onChange={(e) => switchVenue(e.target.value)}>
          {Object.entries(venues).map(([k, v]) => <option key={k} value={k}>{v.name}</option>)}
        </select>
        <span className={`sv ${saveState}`}>
          {saveState === "saving" ? "kaydediliyor" : saveState === "saved" ? "kaydedildi"
            : saveState === "error" ? "kaydedilemedi" : "otomatik kayıt"}
        </span>
        <span className="tsep" />
        <span className={dirty ? "pub dirty" : "pub"}>
          {published ? `v${published.v}` : "taslak"}{dirty ? " · değişiklik var" : " · yayında"}
        </span>
        <span className="tsep" />
        <label className="chk" title="Tuvalde tek bir soru cevaplansın diye seçili kanal dışındaki her şey griye düşer">
          Renklendir
          <select className="mini" value={colorChan} onChange={(e) => setColorChan(e.target.value)}>
            {Object.entries(COLOR_CHANS).map(([k, l]) => <option key={k} value={k}>{l}</option>)}
          </select>
        </label>

        <div className="grow" />

        <button className="ib" onClick={undo} disabled={!past.length} title="Geri al (⌘Z)"><Icon n="undo" /></button>
        <button className="ib" onClick={redo} disabled={!future.length} title="Yinele (⇧⌘Z)"><Icon n="redo" /></button>
        <span className="tsep" />
        <button className={setOpen ? "on" : ""} onClick={() => { setSetOpen(!setOpen); setVerOpen(false); }}>Ayarlar</button>
        <button className={verOpen ? "on" : ""} onClick={() => { setVerOpen(!verOpen); setSetOpen(false); }}>Sürümler</button>
        <button onClick={runValidate}>Doğrula
          {reportErrN > 0 && <span className="badge err">{reportErrN}</span>}
          {reportErrN === 0 && reportWarnN > 0 && <span className="badge warn">{reportWarnN}</span>}
        </button>
        <span className="tsep" />
        <label className="btn">Aç<input type="file" accept="application/json,.json" onChange={importPlan} hidden /></label>
        <button onClick={exportPlan}>plan.json</button>
        <button onClick={exportDb} title="Hedef şemanın tabloları — doğrudan INSERT edilebilir">db.json</button>
        <button className="pri" onClick={exportSeats}>seats.json</button>
      </header>

      {/* Mod şeridi: ray/panel kapalıyken de HER ZAMAN görünür — hangi
          "normal olmayan" durumun aktif olduğunu tahmin ettirmez, tek
          tıkla (ya da Esc ile) çıkış verir. Gerekçe için modeChips'in
          üstündeki not. */}
      {modeChips.length > 0 && (
        <div className="modestrip">
          {modeChips.map((c) => (
            <span key={c.k} className="chip">
              {c.label}
              <button onClick={c.x} title="Çık (Esc)">×</button>
            </span>
          ))}
        </div>
      )}

      <div className={`body${toolsOpen ? "" : " tc"}${propsOpen ? "" : " pc"}`}>
        <nav className={`tools${toolsOpen ? "" : " closed"}`}>
          <button className="pcol" onClick={() => setToolsOpen(!toolsOpen)}
            title={toolsOpen ? "Araç rayını daralt" : "Araç rayını genişlet"}>
            <span className="chev">{toolsOpen ? "‹" : "›"}</span><em>Araçlar</em>
          </button>
          {toolsOpen && <>
          {TOOL_GROUPS.map(([g, list]) => (
            <div className="grp" key={g || "main"}>
              {g && <p className="glab">{g}</p>}
              {list.map(([id, label, key, icon]) => (
                <button key={id} className={tool === id ? "on" : ""}
                  onClick={() => { setTool(id); setPoly(null); }}>
                  <Icon n={icon} /><span>{label}</span><kbd>{key}</kbd>
                </button>
              ))}
            </div>
          ))}

          <div className="grp">
            <label className="tbtn">
              <Icon n="image" /><span>Altlık yükle</span>
              <input type="file" accept="image/*" onChange={loadUnderlay} hidden />
            </label>
          </div>

          {(tool === "shape" || tool === "poly") && (
            <select className="mini full" value={shapeType} onChange={(e) => setShapeType(e.target.value)}>
              {Object.entries(SHAPES).map(([k, v]) => <option key={k} value={k}>{v.label}</option>)}
            </select>
          )}
          {tool === "shape" && shapeType === "pitch" && (<>
            <select className="mini full" value={sport} onChange={(e) => setSport(e.target.value)}>
              {Object.entries(PITCHES).map(([k, v]) => <option key={k} value={k}>{v.label}</option>)}
            </select>
            <p className="mut sm">{PITCHES[sport].note} — tıkladığın yere nizami ölçüde yerleşir</p>
          </>)}
          {tool === "poi" && (
            <div className="poigrid">
              {Object.entries(POI).map(([k, v]) => (
                <button key={k} className={poiKind === k ? "on" : ""} title={v.label}
                  onClick={() => setPoiKind(k)}>
                  {v.img
                    ? <i className="pic" style={{ "--u": `url(${import.meta.env.BASE_URL}poi/${v.img}.png)` }} />
                    : <svg viewBox="0 0 24 24" fill="none"><IconParts parts={v.p || []} /></svg>}
                </button>
              ))}
            </div>
          )}

          {/* Nitelik boya: artık İKİ eksen (bkz. görev tanımı — tek eksenli
              seçici iki eksene döndü). Tür (brushKind) TEK seçim — bir
              koltuk aynı anda yalnız bir fiziksel birimdir. Özellikler
              (brushFeatures) 0..N işaretlenebilir, türden BAĞIMSIZ —
              paintOv ikisini HER fırça darbesinde birlikte (bir "hedef
              değer" olarak) yazar (bkz. paintOv'un dosya başı notu). */}
          {tool === "attr" && (
            <div className="brush">
              <button className={brushKind === DEFAULT_SEAT_KIND ? "on" : ""} onClick={() => setBrushKind(DEFAULT_SEAT_KIND)}>
                <i style={{ background: "transparent", border: "1px solid #5A5F70" }} />Tekli (temizle)
              </button>
              {Object.entries(ATTRS).map(([k, a]) => (
                <button key={k} className={brushKind === k ? "on" : ""} onClick={() => setBrushKind(k)}>
                  <i style={{ background: a.color }} />{a.short}
                </button>
              ))}
              <div className="sep" />
              <p className="lab">Özellikler</p>
              {Object.entries(FEATURES).map(([k, f]) => (
                <label key={k} className="chk">
                  <input type="checkbox" checked={brushFeatures.includes(k)}
                    onChange={() => setBrushFeatures(toggleFeature(brushFeatures, k))} />
                  {f.label}
                </label>
              ))}
            </div>
          )}
          {poly && <button className="pri sm" onClick={finishPoly}>Poligonu kapat ({poly.pts.length})</button>}

          {levels.length > 1 && (<>
            <div className="sep" />
            <p className="lab">Kat / kuşak</p>
            <select className="mini full" value={levelFilter} onChange={(e) => setLevelFilter(e.target.value)}>
              <option value="*">Tümü · {totalSeats.toLocaleString("tr-TR")}</option>
              {/* Yol yazılmış katlar derinliğine göre girintili görünür:
                  "Batı Tribünü / Alt Kat" listede "  › Alt Kat" olur. */}
              {levels.map((l) => {
                const yol = sectionPath(l);
                const etiket = yol.length > 1 ? `${"\u00a0\u00a0".repeat(yol.length - 1)}› ${yol[yol.length - 1]}` : l;
                return <option key={l} value={l}>{etiket} · {(levelCounts[l] || 0).toLocaleString("tr-TR")}</option>;
              })}
            </select>
          </>)}

          <div className="sep" />
          {/* Filtre açıkken toplam sayıyı göstermek yanıltıcı: liste 18
              satır gösterirken başlık 56 diyordu. Süzülmüş sayı + toplam. */}
          <p className="lab">Bloklar ({levelFilter === "*" ? metas.length
            : `${metas.filter(({ b }) => levelMatches(b.level, levelFilter)).length} / ${metas.length}`})</p>
          <input className="find" value={q} placeholder="Blok ara…"
            onChange={(e) => setQ(e.target.value)} />
          <ul className="tree">
            {metas.filter(({ b }) => levelMatches(b.level, levelFilter) &&
                (!q.trim() || `${b.name || ""} ${b.label}`.toLocaleLowerCase("tr").includes(q.toLocaleLowerCase("tr"))))
              .slice(0, 200).map(({ b, m }) => (
              <li key={b.id} className={selIds.includes(b.id) ? "on" : ""}
                onClick={(e) => setSelIds(e.shiftKey
                  ? (selIds.includes(b.id) ? selIds.filter((i) => i !== b.id) : [...selIds, b.id])
                  : [b.id])}
                onDoubleClick={() => zoomTo(m)}>
                <span className="nm">{b.name || b.label}</span>
                <i>{m.seatCount}</i>
              </li>
            ))}
            {plan.shapes.map((s) => (
              <li key={s.id} className={selShapeId === s.id ? "on" : ""}
                onClick={() => { setSelShapeId(s.id); setSelIds([]); }}>
                <span className="nm dim">{s.type === "icon" ? "◈" : "◇"} {s.label || SHAPES[s.type]?.label || POI[s.icon]?.label || "İşaret"}</span>
              </li>
            ))}
            {!plan.blocks.length && !plan.shapes.length && <li className="mut">Boş tuval</li>}
          </ul>
          </>}
        </nav>

        <main className="canvas">
          <svg ref={svgRef} viewBox={`${view.x} ${view.y} ${view.w} ${view.h}`}
            preserveAspectRatio="xMidYMid meet" className={spaceDown ? "t-pan" : `t-${tool}`}
            onWheel={onWheel} onPointerDown={onDown} onPointerMove={onMove}
            onPointerUp={onUp} onPointerCancel={onUp}
            onContextMenu={(e) => e.preventDefault()}
            onDoubleClick={() => { if (footDraft) footFinish(); else if (poly) finishPoly(); }}
            onPointerLeave={() => { drag.current = null; setGuides([]); }}>

            {/* İşaret PNG'leri siyah çizgi; alfayı koruyup rengi temadan
                alıyoruz, yoksa koyu temada görünmezler. flood-color CSS'ten
                (--bone / --sel) geliyor, tema ve seçim ile birlikte döner. */}
            <defs>
              <filter id="poiTint" colorInterpolationFilters="sRGB">
                <feFlood result="c" /><feComposite in="c" in2="SourceAlpha" operator="in" />
              </filter>
              <filter id="poiTintSel" colorInterpolationFilters="sRGB">
                <feFlood result="c" /><feComposite in="c" in2="SourceAlpha" operator="in" />
              </filter>
            </defs>

            {plan.underlay && plan.underlay.src && (
              <image href={plan.underlay.src} x={plan.underlay.x} y={plan.underlay.y}
                width={plan.underlay.w} height={plan.underlay.h}
                opacity={plan.underlay.opacity} style={{ pointerEvents: "none" }} />
            )}

            <g className="grid">
              {gridLines.minor.map(([d, v], i) => d === "v"
                ? <line key={`m${i}`} x1={v} y1={view.y} x2={v} y2={view.y + view.h} />
                : <line key={`m${i}`} x1={view.x} y1={v} x2={view.x + view.w} y2={v} />)}
            </g>
            <g className="grid maj">
              {gridLines.major.map(([d, v], i) => d === "v"
                ? <line key={`M${i}`} x1={v} y1={view.y} x2={v} y2={view.y + view.h} />
                : <line key={`M${i}`} x1={view.x} y1={v} x2={view.x + view.w} y2={v} />)}
            </g>

            {/* fill:none olan şekiller (duvar, not) SVG'de sadece kenardan
                tıklanır — görünmez ama tıklamayı yakalayan bir ikinci hedef
                gerekiyor. Bu hedef, asıl şekillerle AYNI geçişte, kendi
                sırasında çizilirse; bir duvar dizinin başka bir yerinde
                (kapsayıcı) ise üstüne gelen her şeklin (ör. ayakta alan)
                tıklamasını çalar — SVG'de tıklama en üstteki elemana gider.
                Bu yüzden görünmez hedefler HEP en altta, ayrı bir ön geçişte
                çizilir; üstlerine gelen gerçek şekiller tıklamayı önce onlar
                yakalar. */}
            {plan.shapes.map((s) => {
              const st = SHAPES[s.type];
              if (st?.fill !== "none") return null;
              return (
                <g key={`ht${s.id}`} transform={`translate(${s.x} ${s.y}) rotate(${s.rot})`}>
                  {s.kind === "rect"
                    ? <rect data-s={s.id} x={-s.w / 2} y={-s.h / 2} width={s.w} height={s.h}
                        fill="transparent" stroke="none" />
                    : <polygon data-s={s.id} points={s.pts.map((p) => `${p.x},${p.y}`).join(" ")}
                        fill="transparent" stroke="none" />}
                </g>
              );
            })}

            {plan.shapes.map((s) => {
              const st = SHAPES[s.type];
              if (s.type === "icon") return null;
              if (s.type === "pitch") return <Pitch key={s.id} s={s} selected={selShapeId === s.id} />;
              if (s.type === "door") {
                const on = selShapeId === s.id;
                const num = String(s.label).replace(/\D+/g, "") || "?";
                /* Kapı, gerçek bir vomitorium gibi DİKDÖRTGEN bir açıklık —
                   yuvarlak rozet değil. Tribüne oyulmuş tünel ağzını temsil
                   eder; rot ile tünelin radyal yönüne hizalanır. Numara dik
                   (döndürülmemiş) yazılır. */
                const fs = Math.min(s.fs || 95, Math.min(s.w, s.h) * 0.66);
                /* "Kapı" kanalı dışında işaret nötr griye düşer — bugüne
                   kadar sabit --doorfill (tema tersi, hep beyaz/siyah)
                   diğer üç kanalda da aynı canlılıkta kalıyor, greylenmiş
                   bloklar arasında yersiz göze batıyordu. Kanal "Kapı"
                   ise kapının kendi rengiyle (bloklarıyla AYNI) boyanır. */
                const dcol = colorChan === "gate" ? gateColor(s.label) : st.fill;
                return (
                  <g key={s.id} className={on ? "dr on" : "dr"}>
                    {on && (s.blocks || []).map((bid) => {
                      const m = metaById.get(bid);
                      return m ? <line key={bid} x1={s.x} y1={s.y} x2={m.cx} y2={m.cy} /> : null;
                    })}
                    <g transform={`translate(${s.x} ${s.y}) rotate(${s.rot || 0})`}>
                      <rect data-s={s.id} x={-s.w / 2} y={-s.h / 2} width={s.w} height={s.h}
                        rx={14} fill={dcol} stroke={dcol} strokeWidth={6} />
                    </g>
                    <text x={s.x} y={s.y + fs * 0.35} className="dv" style={{ fontSize: fs }}>{num}</text>
                  </g>
                );
              }
              return (
                <g key={s.id} className={selShapeId === s.id ? "shp on" : "shp"}
                  transform={`translate(${s.x} ${s.y}) rotate(${s.rot})`}>
                  {s.kind === "rect"
                    ? <rect data-s={s.id} x={-s.w / 2} y={-s.h / 2} width={s.w} height={s.h} rx={s.type === "pitch" ? 10 : 20}
                        fill={st.fill} stroke={s.type === "note" && s.w < 50 ? "none" : st.stroke}
                        strokeWidth={s.type === "pitch" ? 14 : 6}
                        strokeDasharray={s.type === "standing" ? "40 26" : ""} />
                    : <polygon data-s={s.id} points={s.pts.map((p) => `${p.x},${p.y}`).join(" ")}
                        fill={st.fill} stroke={st.stroke} strokeWidth={6}
                        strokeDasharray={s.type === "standing" ? "40 26" : ""} />}
                  {s.label && (() => {
                    const txt = s.label + (s.type === "standing" && s.capacity ? ` · ${s.capacity} kişi` : "");
                    const w = s.kind === "rect" ? s.w
                      : Math.max(...s.pts.map((p) => p.x)) - Math.min(...s.pts.map((p) => p.x));
                    const h = s.kind === "rect" ? s.h
                      : Math.max(...s.pts.map((p) => p.y)) - Math.min(...s.pts.map((p) => p.y));
                    /* Yazı şeklin içine sığar; ekranda 8 pikselin altına
                       inecekse hiç çizilmez — okunmayan etiket gürültüdür. */
                    const vert = h > w * 1.6;
                    const fit = Math.min(s.fs || 100,
                      (vert ? h : w) * 0.82 / (txt.length * 0.58),
                      (vert ? w : h) * 0.5);
                    if (fit / U < 8) return null;
                    return (
                      <text className="shl" y={vert ? 0 : fit * 0.34} style={{ fontSize: fit }}
                        transform={vert ? `rotate(-90)` : undefined}
                        dy={vert ? fit * 0.34 : 0}>{txt}</text>
                    );
                  })()}
                </g>
              );
            })}

            {dimmedBlocks.length > 0 && (
              <g className="dimmed">
                {dimmedBlocks.map(({ b, m }) => (
                  <polygon key={`dim${b.id}`} pointerEvents="none"
                    points={m.outline.map((p) => `${p.x.toFixed(0)},${p.y.toFixed(0)}`).join(" ")}
                    fill="var(--mut)" fillOpacity={dark ? 0.16 : 0.11}
                    stroke="var(--mut)" strokeOpacity={0.45}
                    strokeWidth={Math.max(3, 1.2 / (pxPerCm || 0.01))} />
                ))}
              </g>
            )}

            {!seatMode && shown.map(({ b, m }) => {
              const col = chanColor(b);
              const bw = lodFont * (String(b.label).length * 0.62 + 0.7);
              return (
                <g key={b.id} className={selIds.includes(b.id) ? "lod on" : "lod"}>
                  <polygon data-b={b.id}
                    points={m.outline.map((p) => `${p.x.toFixed(0)},${p.y.toFixed(0)}`).join(" ")}
                    fill={col} fillOpacity={dark ? 0.24 : 0.17}
                    stroke={col} strokeOpacity={0.95}
                    strokeWidth={Math.max(4, 1.6 / (pxPerCm || 0.01))} />
                  <rect className="badge" x={m.cx - bw / 2} y={m.cy - lodFont * 0.62}
                    width={bw} height={lodFont * 1.24} rx={lodFont * 0.34} fill={badgeColor(col)} />
                  <text x={m.cx} y={m.cy + lodFont * 0.36} fill="#FBFAF7"
                    style={{ fontSize: lodFont }}>{b.label}</text>
                </g>
              );
            })}

            {seatMode && drawn.filter(({ b }) => b.kind === "table").map(({ b }) => (
              <g key={`t${b.id}`} className="tbl"
                transform={`translate(${b.x} ${b.y}) rotate(${b.rot})`}>
                {(b.tShape || "round") === "round"
                  ? <circle r={(b.tW || 90) / 2} fill={chanColor(b)} stroke={chanColor(b)} />
                  : <rect x={-(b.tW || 160) / 2} y={-(b.tH || 90) / 2}
                      width={b.tW || 160} height={b.tH || 90} rx={12}
                      fill={chanColor(b)} stroke={chanColor(b)} />}
                {(() => {
                  const f = Math.min((b.tW || 90) * 0.42, 13 * U);
                  return f / U < 7 ? null : (
                    <text className="tlab" y={f * 0.35} style={{ fontSize: f }}
                      fill={onColor(chanColor(b))}>{b.label}</text>
                  );
                })()}
              </g>
            ))}

            {seatMode && plates && drawn.filter(({ b }) => b.kind !== "table").map(({ b, m }) => (
              <polygon key={`pl${b.id}`} className="plate"
                points={m.outline.map((p) => `${p.x.toFixed(0)},${p.y.toFixed(0)}`).join(" ")}
                fill={chanColor(b)} stroke={chanColor(b)}
                fillOpacity={dark ? 0.16 : 0.13} strokeOpacity={dark ? 0.5 : 0.6}
                strokeWidth={Math.max(2, 1.6 / (pxPerCm || 0.01))} />
            ))}

            {/* Blok kimliği yakınlaşınca kaybolmasın diye rozet ekranda
                sabit kalıyor — ama blok tamamen görünürken rozeti taban
                kenarına yapıştırmak koltukların üstüne oturtuyordu. Şimdi:
                blok tam görünüyorsa rozet tabanın biraz DIŞINA (üstüne)
                taşıyor; blok üstten kesilmişse ekran kenarına sabitleniyor. */}
            {seatMode && drawn.filter(({ b }) => b.kind !== "table").map(({ b, m }) => {
              const vx0 = Math.max(m.bbox.x0, view.x), vx1 = Math.min(m.bbox.x1, view.x + view.w);
              const vy0 = Math.max(m.bbox.y0, view.y), vy1 = Math.min(m.bbox.y1, view.y + view.h);
              if (vx1 <= vx0 || vy1 <= vy0) return null;
              const f = 15 * U;
              const bw = f * (String(b.label).length * 0.62 + 0.9);
              const clipped = view.y > m.bbox.y0 + 1;
              const by = clipped ? view.y + f * 0.35 : m.bbox.y0 - f * 1.5;
              return (
                <g key={`sb${b.id}`} className="stick">
                  <rect x={(vx0 + vx1) / 2 - bw / 2} y={by}
                    width={bw} height={f * 1.32} rx={f * 0.36} fill={badgeColor(chanColor(b))} />
                  <text x={(vx0 + vx1) / 2} y={by + f * 1.04}
                    style={{ fontSize: f }}>{b.label}</text>
                </g>
              );
            })}

            {seatMode && drawn.map(({ b, seats, labels }) => (
              <g key={b.id} className={selIds.includes(b.id) ? "blk on" : "blk"}>
                {seats.map((s) => {
                  const A = seatBadge(s);
                  const w = seatKindWidth(s.seatKind);
                  /* isWheel: SADECE kozmetik (dolgusuz/boş gövde) — eski
                     `A?.wide` ile AYNI görsel özel durum, hâlâ ATTRS'ten
                     (bkz. dosya başı notu), yalnız wheelchair_space'te
                     true. Fiziksel genişlik (w, yukarıda) SEAT_KINDS'ten
                     geliyor ve TÜM türler için doğru — bu ikisi kasıtlı
                     ayrı: biri çizim tercihi, öteki ölçü. */
                  const isWheel = ATTRS[s.seatKind]?.wide;
                  const isSel = selSeats.has(`${b.id}|${s.r},${s.c}`);
                  return (
                    <rect key={s.key} data-b={b.id} data-r={s.r} data-c={s.c}
                      x={-w / 2} y={-DEF.seatH / 2} width={w} height={DEF.seatH} rx={12}
                      className={isSel ? "sel" : ""}
                    style={selIds.includes(b.id) || isSel
                      ? { strokeWidth: (isSel ? 2.6 : 1.4) * U } : undefined}
                      transform={`translate(${s.x.toFixed(1)} ${s.y.toFixed(1)}) rotate(${s.rot.toFixed(1)})`}
                      fill={s.gap ? "none" : s.seatKind === "tech" ? "var(--seatoff)"
                        : isWheel ? "none" : chanColor(b)}
                      fillOpacity={isWheel ? 0 : 1}
                      stroke={s.gap ? "var(--mut)" : A ? (colorChan === "attr" ? A.color : NEUTRAL) : s.tweak ? "var(--acc)" : "none"}
                      strokeWidth={s.gap ? 1.1 * U : A ? 1.8 * U : 1.2 * U}
                      strokeDasharray={s.gap ? `${3 * U} ${2.4 * U}` : ""} />
                  );
                })}
                {/* boyut halesi: eskiden SADECE wheelchair (86cm sabit), artık
                    genişliği DEF.seatW'dan farklı olan HER tür (loveseat/
                    stool dahil) — "bu koltuk standart ölçüde değil" sinyali
                    artık tek bir türe özel değil. */}
                {seats.filter((s) => !s.gap && seatKindWidth(s.seatKind) !== DEF.seatW).map((s) => {
                  const A = seatBadge(s);
                  const hw = seatKindWidth(s.seatKind);
                  return (
                    <rect key={`w${s.key}`} x={-hw / 2} y={-DEF.seatH / 2 - 3} width={hw}
                      height={DEF.seatH + 6} rx={6}
                      fill={colorChan === "attr" && A ? A.color : NEUTRAL} fillOpacity={0.14}
                      transform={`translate(${s.x.toFixed(1)} ${s.y.toFixed(1)}) rotate(${s.rot.toFixed(1)})`}
                      pointerEvents="none" />
                  );
                })}
                {seatNums && seats.filter((s) => !s.gap && seatBadge(s)).map((s) => {
                  const A = seatBadge(s);
                  return (
                    <text key={`a${s.key}`} className="atg" x={s.x} y={s.y + 3.4 * U}
                      style={{ fontSize: 9.5 * U }}
                      fill={colorChan === "attr" ? A.color : NEUTRAL}>{A.glyph}</text>
                  );
                })}
                {seatNums && seats.filter((s) => !s.gap && !seatBadge(s) &&
                  s.x > view.x && s.x < view.x + view.w && s.y > view.y && s.y < view.y + view.h)
                  .map((s) => (
                    <text key={`n${s.key}`} className="snum" fill={onColor(chanColor(b))}
                      x={s.x} y={s.y + 3.1 * U} style={{ fontSize: 8.6 * U }}>{s.num}</text>
                  ))}
                {pxPerCm * b.rowGap > 22 && labels.map((l) => (
                  <text key={l.key} className="rl" x={l.x} y={l.y + 3.6 * U}
                    style={{ fontSize: 10.5 * U }}>{l.text}</text>
                ))}
              </g>
            ))}

            {ghosts.map((g, i) => (
              <polygon key={`gh${i}`} className="ghost"
                points={g.map((p) => `${p.x.toFixed(0)},${p.y.toFixed(0)}`).join(" ")} />
            ))}

            {/* tutamaklar — HANDLE_HINT'teki Türkçe etiket, tarayıcının
                yerleşik <title> ipucuyla üstüne gelince görünür (ayrı bir
                tooltip bileşeni gerekmiyor). */}
            {handles.map((hd) => (
              <g key={hd.k} className="hnd">
                <circle data-h={hd.k} cx={hd.x} cy={hd.y} r={hSize}>
                  <title>{hd.k.startsWith("foot:") ? "Dış hat köşesi" : (HANDLE_HINT[hd.k] || hd.k)}</title>
                </circle>
                {hd.k === "rot" && <text x={hd.x} y={hd.y + hSize * 0.4} style={{ fontSize: hSize * 1.2 }}>↻</text>}
              </g>
            ))}

            {breach.length > 0 && metas.filter(({ b }) => breachSet.has(b.id)).map(({ b, m }) => (
              <polygon key={`br${b.id}`} className="breach"
                points={m.outline.map((p) => `${p.x.toFixed(0)},${p.y.toFixed(0)}`).join(" ")}
                strokeWidth={Math.max(3, 2 / (pxPerCm || 0.01))} />
            ))}

            {collide.length > 0 && metas.filter(({ b }) => collideSet.has(b.id)).map(({ b, m }) => (
              <polygon key={`co${b.id}`} className="collide"
                points={m.outline.map((p) => `${p.x.toFixed(0)},${p.y.toFixed(0)}`).join(" ")}
                strokeWidth={Math.max(3, 2 / (pxPerCm || 0.01))} />
            ))}

            {/* "Doğrulama" kanalının vurgusu: son rapordaki canlı-olmayan
                bulgular da (bkz. reportMarks) breach/collide ile aynı dış
                hat dilinde işaretlenir — err kırmızı kesik, warn amber. */}
            {reportMarks.err.length > 0 && metas.filter(({ b }) => reportMarks.err.includes(b.id)).map(({ b, m }) => (
              <polygon key={`rfe${b.id}`} className="breach"
                points={m.outline.map((p) => `${p.x.toFixed(0)},${p.y.toFixed(0)}`).join(" ")}
                strokeWidth={Math.max(3, 2 / (pxPerCm || 0.01))} />
            ))}
            {reportMarks.warn.length > 0 && metas.filter(({ b }) => reportMarks.warn.includes(b.id)).map(({ b, m }) => (
              <polygon key={`rfw${b.id}`} className="rfwarn"
                points={m.outline.map((p) => `${p.x.toFixed(0)},${p.y.toFixed(0)}`).join(" ")}
                strokeWidth={Math.max(3, 2 / (pxPerCm || 0.01))} />
            ))}

            {plan.shapes.filter((s) => s.type === "icon").map((s) => (
              <Poi key={s.id} s={s} selected={selShapeId === s.id} U={U} />
            ))}

            {guides.map((g, i) => (
              <line key={i} className="guide"
                x1={g.axis === "x" ? g.v : g.a} y1={g.axis === "x" ? g.a : g.v}
                x2={g.axis === "x" ? g.v : g.z} y2={g.axis === "x" ? g.z : g.v}
                strokeWidth={Math.max(2, 1.4 / (pxPerCm || 0.01))} />
            ))}

            {marq && (
              <rect className="marq" x={Math.min(marq.x0, marq.x1)} y={Math.min(marq.y0, marq.y1)}
                width={Math.abs(marq.x1 - marq.x0)} height={Math.abs(marq.y1 - marq.y0)} />
            )}
            {calib && (
              <g className="cal">
                <line x1={calib.x0} y1={calib.y0} x2={calib.x1} y2={calib.y1} />
                <circle cx={calib.x0} cy={calib.y0} r={hSize * 0.7} />
                <circle cx={calib.x1} cy={calib.y1} r={hSize * 0.7} />
              </g>
            )}
            {draft && (tool === "grid" || tool === "shape") && (
              <rect className="draft" x={Math.min(draft.x0, draft.x1)} y={Math.min(draft.y0, draft.y1)}
                width={Math.abs(draft.x1 - draft.x0)} height={Math.abs(draft.y1 - draft.y0)} />
            )}
            {draft && ["row", "fan", "measure", "cal"].includes(tool) && (
              <>
                <line className="draft" x1={draft.x0} y1={draft.y0} x2={draft.x1} y2={draft.y1} />
                <text className="mtxt" x={(draft.x0 + draft.x1) / 2} y={(draft.y0 + draft.y1) / 2 - 40}
                  style={{ fontSize: Math.max(90, view.w / 40) }}>
                  {(Math.hypot(draft.x1 - draft.x0, draft.y1 - draft.y0) / 100).toFixed(2)} m
                </text>
              </>
            )}
            {poly && <polyline className="draft" fill="none" points={poly.pts.map((p) => `${p.x},${p.y}`).join(" ")} />}

            {footDraft && footDraft.length > 0 && (
              <g className="footd">
                <polyline points={[...footDraft, footDraft[0]].map((p) => `${p.x},${p.y}`).join(" ")}
                  strokeWidth={Math.max(3, 2 / (pxPerCm || 0.01))} />
                {footDraft.map((p, i) => (
                  <circle key={i} cx={p.x} cy={p.y} r={Math.max(6, 5 / (pxPerCm || 0.01))} />
                ))}
              </g>
            )}
          </svg>

          {!plan.blocks.length && !plan.shapes.length && (
            <div className="cempty">Sol menüden bir araç seçip çizmeye başlayın, ya da yukarıdan bir örnek salon açın.</div>
          )}

          {/* Lejant aktif kanala göre değişir — gri şeylerin lejantta yeri
              yok (bkz. chanColor gerekçesi). "Kat" dışındaki üç kanalda
              blok/kat rengi zaten görünmüyor, o yüzden lejant da onu
              göstermiyor. */}
          {legend && (
            <div className="lgnd">
              <p>{CHAN_TITLE[colorChan]}<button className="link" onClick={() => setLegend(false)}>gizle</button></p>

              {colorChan === "level" && levels.map((l, i) => (
                <div key={l}>
                  <i style={{ background: levelColor(i) }} />
                  <span>{l}</span>
                  <b className="n">{(levelCounts[l] || 0).toLocaleString("tr-TR")}</b>
                </div>
              ))}

              {/* Nitelik kanalı artık İKİ liste: tür (seat_kind) + özellik
                  (features) — raporun ayrımını lejanta da taşıyoruz, aksi
                  hâlde "3 refakatçi + 1 erişilebilir" gibi bir koltuğun
                  hem türü hem özelliği aynı satırda karışırdı. */}
              {colorChan === "attr" && Object.entries(kindTotals).filter(([k]) => ATTRS[k]).map(([k, v]) => (
                <div key={k} className="at">
                  <i style={{ background: "transparent", border: `2px solid ${ATTRS[k].color}` }} />
                  <span>{ATTRS[k].short}</span>
                  <b className="n">{v.toLocaleString("tr-TR")}</b>
                </div>
              ))}
              {colorChan === "attr" && Object.keys(featureTotals).length > 0 && (
                <p className="lab">Özellikler</p>
              )}
              {colorChan === "attr" && Object.entries(featureTotals).filter(([k]) => FEATURES[k]).map(([k, v]) => (
                <div key={k} className="at">
                  <i style={{ background: "transparent", border: `2px solid ${FEATURES[k].color}` }} />
                  <span>{FEATURES[k].short}</span>
                  <b className="n">{v.toLocaleString("tr-TR")}</b>
                </div>
              ))}
              {colorChan === "attr" && !Object.keys(kindTotals).length && !Object.keys(featureTotals).length && (
                <p className="mut sm">Hiç nitelik atanmamış</p>
              )}

              {colorChan === "gate" && gateShapes.map((d) => (
                <div key={d.id}>
                  <i style={{ background: gateColor(d.label) }} />
                  <span>{d.label}</span>
                  <b className="n">{(d.blocks || []).length}</b>
                </div>
              ))}
              {colorChan === "gate" && !gateShapes.length && (
                <p className="mut sm">Hiç kapı tanımlanmamış</p>
              )}
              {colorChan === "gate" && gateShapes.length > 0 && (() => {
                const assigned = new Set(gateShapes.flatMap((d) => d.blocks || []));
                const n = metas.filter(({ b }) => !assigned.has(b.id)).length;
                return n > 0 ? (
                  <div><i style={{ background: NEUTRAL }} /><span>Kapı atanmamış</span><b className="n">{n}</b></div>
                ) : null;
              })()}

              {colorChan === "valid" && (<>
                <div><i style={{ background: "var(--err)" }} /><span>Sınır ihlali (canlı)</span>
                  <b className="n">{breach.length}</b></div>
                <div><i style={{ background: "var(--err)" }} /><span>Taban çakışması (canlı)</span>
                  <b className="n">{collide.length}</b></div>
                {report
                  ? <div><i style={{ background: "var(--warn)" }} /><span>Diğer bulgular (Doğrula)</span>
                      <b className="n">{reportMarks.err.length + reportMarks.warn.length}</b></div>
                  : <p className="mut sm">Diğer bulgular için Doğrula'yı çalıştır</p>}
              </>)}
            </div>
          )}

          <div className="status">
            <span className="n">{totalSeats.toLocaleString("tr-TR")}</span>&nbsp;koltuk
            <span className="tsep" />
            <span className="n">{metas.length}</span>&nbsp;blok
            {selIds.length > 0 && <><span className="tsep" />
              <span className="hi"><span className="n">{selIds.length}</span> blok ·{" "}
              <span className="n">{selSeatTotal.toLocaleString("tr-TR")}</span> koltuk seçili</span></>}
            {selSeats.size > 1 && <><span className="tsep" />
              <span className="hi"><span className="n">{selSeats.size}</span> koltuk seçili</span></>}
            <span className="tsep" />
            <span className={seatMode ? "ok" : "wr"}>
              {seatMode ? "koltuk görünümü" : "blok görünümü · yakınlaş"}
            </span>
            {breach.length > 0 && <><span className="tsep" />
              <button className="alert" onClick={() => { setSelIds(breach); setSelShapeId(null); }}>
                {breach.length} blok salon sınırı dışında
              </button></>}
            {collide.length > 0 && <><span className="tsep" />
              <button className="alert" onClick={() => { setSelIds(collide); setSelShapeId(null); }}>
                {collide.length} blok birbirinin alanına giriyor · en fazla {fmtOverlap(collideArea)}
              </button></>}
            {msg && <><span className="tsep" />
              <span className={msgErr ? "hi err" : "hi"} title={msg}>{msg}</span></>}

            <div className="grow" />

            <label className="chk"><input type="checkbox" checked={snapOn}
              onChange={(e) => setSnapOn(e.target.checked)} />Yapış</label>
            <select className="mini" value={gridStep} onChange={(e) => setGridStep(+e.target.value)}>
              <option value={10}>10 cm</option><option value={25}>25 cm</option>
              <option value={50}>50 cm</option><option value={100}>1 m</option>
            </select>
            {hoverId && <><span className="tsep" />
              <span className="n hi">{hoverId}</span></>}
            <span className="tsep" />
            <span className="n coord">{(cursor.x / 100).toFixed(1)} · {(cursor.y / 100).toFixed(1)} m</span>
            <span className="tsep" />
            <div className="sbar" title="Ölçek">
              <div className="sline" style={{ width: `${Math.round(scaleBar.px)}px` }} />
              <span className="n">{scaleBar.label}</span>
            </div>
            <span className="tsep" />
            <button className={plates ? "on" : ""} onClick={() => setPlates(!plates)}>Dış hatlar</button>
            <button className={legend ? "on" : ""} onClick={() => setLegend(!legend)}>Lejant</button>
            <button className="ib" onClick={() => zoomCenter(1.35)} title="Uzaklaş">−</button>
            <span className="n zoompct" title="%100'e sıfırla" onClick={zoomToAll}>
              {zoomPct}%
            </span>
            <button className="ib" onClick={() => zoomCenter(1 / 1.35)} title="Yakınlaş">+</button>
            {/* Eskiden "Sığdır" ve "İçeriğe zumla" ayrı düğmelerdi; seçim
                yokken zoomToSelection zaten zoomToAll'a düşüyordu (bkz.
                yukarısı) — yani hiçbir şey seçili değilken birebir aynı
                düğmeydi. Tek düğme: seçim varsa ona odaklan, yoksa Sığdır. */}
            <button onClick={zoomToSelection}>{selIds.length ? "Seçime zumla" : "Sığdır"}</button>
          </div>

          {footDraft && (
            <div className="tip">
              Dış hattın köşelerini tıkla · <b>Enter</b> veya çift tık ile kapat · <b>Esc</b> iptal
              {footDraft.length > 0 && ` · ${footDraft.length} nokta`}
            </div>
          )}

          {tool === "cal" && !calib && (
            <div className="tip">Altlıkta bilinen iki noktayı sürükleyerek işaretle</div>
          )}

          {calib && (
            <div className="calbar">
              <span>Ölçülen: <b>{(calib.px / 100).toFixed(2)} m</b> · gerçek mesafe:</span>
              <input autoFocus value={calib.meters}
                onChange={(e) => setCalib({ ...calib, meters: e.target.value })}
                onKeyDown={(e) => e.key === "Enter" && applyCal()} />
              <span>m</span>
              <button className="pri" onClick={applyCal}>Uygula</button>
              <button onClick={() => setCalib(null)}>İptal</button>
            </div>
          )}

          {plan.underlay && (
            <div className="ulbar">
              <span>Altlık</span>
              <input type="range" min="0" max="1" step="0.05" value={plan.underlay.opacity}
                onChange={(e) => setPlan({ ...plan, underlay: { ...plan.underlay, opacity: +e.target.value } })} />
              <button onClick={() => commit({ ...plan, underlay: null })}>Kaldır</button>
            </div>
          )}

          {setOpen && (
            <PlanSettings plan={plan} sample={metas[0]} onClose={() => setSetOpen(false)}
              onCsv={exportCSV} onSvg={exportSVG} onCsvImport={importCSV} onDbImport={importDb} saved={saved} venues={venues} vk={vk}
              theme={theme} onTheme={setThemePref} wheelPref={wheelPref} onWheelPref={setWheelPrefP}
              onNew={newPlan} onNewStadium={() => newPlanFromTemplate(buildStadiumTemplate, "Yeni stadyum")}
              onNewHall={() => newPlanFromTemplate(buildHallTemplate, "Yeni salon")}
              onDup={duplicatePlan} onDel={deletePlan}
              onChange={(p) => commit({ ...plan, ...p })} />
          )}

          {verOpen && (
            <div className="ver">
              <p>Sürümler
                <button className="link" onClick={() => setVerOpen(false)}>kapat</button></p>

              {breach.length > 0 && (
                <p className="stop">
                  {breach.length} blok salon sınırının dışında. Yayınlamadan önce düzeltilmeli.
                </p>
              )}
              {collide.length > 0 && (
                <p className="stop">
                  {collide.length} blok aynı katta birbirinin alanına giriyor.
                  Yayınlamadan önce düzeltilmeli.
                </p>
              )}

              <div className="pubrow">
                <input value={pubNote} placeholder="Sürüm notu (ör. yan localar eklendi)"
                  onChange={(e) => setPubNote(e.target.value)}
                  onKeyDown={(e) => e.key === "Enter" && doPublish()} />
                <button className="pri" onClick={doPublish} disabled={breach.length > 0 || collide.length > 0}>Yayınla</button>
              </div>

              {!versions.length && <p className="mut sm">Henüz sürüm yok. İlk yayın taban çizgisini kurar.</p>}

              <ul className="vlist">
                {[...versions].reverse().map((v) => (
                  <li key={v.v} className={v.v === plan.published ? "on" : ""}>
                    <div>
                      <strong>v{v.v}{v.v === plan.published && " · yayında"}</strong>
                      <span>{new Date(v.at).toLocaleString("tr-TR")} · {v.seats.toLocaleString("tr-TR")} koltuk</span>
                      <em>{v.note}</em>
                    </div>
                    <button onClick={() => doDiff(v)}>Fark</button>
                    <button onClick={() => doRestore(v)}>Geri yükle</button>
                  </li>
                ))}
              </ul>

              {diff && (
                <div className="diff">
                  <p className="lab">v{diff.v} → taslak ·
                    {" "}{diff.from.toLocaleString("tr-TR")} → {diff.to.toLocaleString("tr-TR")} koltuk</p>
                  <div className={diff.removed.length ? "err" : "ok"}>
                    {diff.removed.length
                      ? `${diff.removed.length} koltuk kimliği YOK OLUYOR — bu kimliklere satılmış bilet varsa karşılığı kalmaz`
                      : "Kaybolan koltuk kimliği yok"}
                    {diff.removed.length > 0 && <em>{diff.removed.slice(0, 6).join(", ")}{diff.removed.length > 6 ? " …" : ""}</em>}
                  </div>
                  {diff.added.length > 0 && <div className="info">{diff.added.length} yeni koltuk<em>{diff.added.slice(0, 5).join(", ")}</em></div>}
                  {diff.moved.length > 0 && <div className="warn">{diff.moved.length} koltuk yer değiştirdi (&gt;25 cm)</div>}
                  {diff.changed.length > 0 && <div className="warn">{diff.changed.length} koltuğun niteliği değişti</div>}
                </div>
              )}
            </div>
          )}

          {match && (
            <div className="ver">
              <p>Koltuk listesi eşleştirme
                <button className="link" onClick={() => setMatch(null)}>kapat</button></p>
              <p className="mut sm">{match.file} · {match.total.toLocaleString("tr-TR")} satır ·
                bulunan sütunlar: {match.cols.join(", ")}</p>

              <div className="diff">
                <div className="ok">{match.hits.length.toLocaleString("tr-TR")} koltuk eşleşti</div>
                {match.changing.length > 0 && (
                  <div className="warn">{match.changing.length.toLocaleString("tr-TR")} koltuğun kimliği listedekinden farklı
                    <em>{match.changing.slice(0, 3).map((h) => `${h.s.id} → ${h.csvId}`).join(" · ")}</em></div>
                )}
                {match.missing.length > 0 && (
                  <div className="err">{match.missing.length.toLocaleString("tr-TR")} koltuk listede var, çizimde yok
                    <em>{match.missing.slice(0, 4).map((m) => m.key.replace(/\|/g, "-")).join(", ")}</em></div>
                )}
                {match.extra.length > 0 && (
                  <div className="err">{match.extra.length.toLocaleString("tr-TR")} koltuk çizimde var, listede yok
                    <em>{match.extra.slice(0, 4).map((s) => `${s.block}-${s.row}-${s.num}`).join(", ")}</em></div>
                )}
                {match.dupes.length > 0 && (
                  <div className="warn">{match.dupes.length} yinelenen satır atlandı</div>
                )}
              </div>

              {match.changing.length > 0 && (
                <button className="wide" onClick={adoptIds}>
                  {match.changing.length.toLocaleString("tr-TR")} kimliği benimse
                </button>
              )}
              <p className="mut sm">
                Benimseme çizimi değiştirmez; eşleşen koltuklara mevcut sistemdeki kimliği yazar.
                Eksik/fazla satırlar sıfırlanana kadar plan yayına verilmemeli.
              </p>
            </div>
          )}

          {report && (
            <div className="val">
              <p>Doğrulama · {report.total.toLocaleString("tr-TR")} koltuk tarandı
                <button className="link" onClick={() => setReport(null)}>kapat</button></p>
              {report.list.map((i, k) => (
                <div key={k} className={i.ids && i.ids.length ? `${i.t} go` : i.t}
                  onClick={i.ids && i.ids.length ? () => {
                    setSelIds(i.ids); setSelShapeId(null);
                    zoomToBBox(i.ids.map((id) => metaById.get(id)).filter(Boolean));
                  } : undefined}>
                  {i.m}{i.d && <em>{i.d}</em>}
                </div>
              ))}
            </div>
          )}
        </main>

        <aside className={`props${propsOpen ? "" : " closed"}`}>
          <button className="pcol" onClick={() => setPropsOpen(!propsOpen)}
            title={propsOpen ? "Özellik panelini daralt" : "Özellik panelini genişlet"}>
            <span className="chev">{propsOpen ? "›" : "‹"}</span><em>Özellikler</em>
          </button>
          {propsOpen && (
          selSeats.size > 1 ? (
            <MultiSeatPanel n={selSeats.size} onOps={seatOps} groupKinds={GROUP_KINDS}
              onGroup={groupSelected} onUngroup={ungroupSelected}
              onClear={() => { setSelSeats(new Set()); setSelSeat(null); }} />
          ) : selSeat && seatOv ? (
            <SeatPanel sel={selSeat} info={selSeatInfo} ov={seatOv} eff={seatEffAttr} onToggle={(k) => toggleOv(selSeat, k)}
              onSet={(p) => setOv(selSeat, p)} onClose={() => setSelSeat(null)} />
          ) : selShape ? (
            <ShapePanel s={selShape} blocks={plan.blocks} metas={metaById} onAuto={doAutoGates}
              onChange={(p) => patchShape(selShape.id, p)}
              onDelete={() => { commit({ ...plan, shapes: plan.shapes.filter((x) => x.id !== selShape.id) }); setSelShapeId(null); }} />
          ) : selBlocks.length > 1 ? (
            <MultiPanel n={selBlocks.length} seats={selSeatTotal} levels={levels} arr={arrProps}
              onAlign={alignSel} onDist={distributeSel} onRenumber={doRenumber} onSet={patchSelected} onMirror={mirror}
              onDelete={() => { commit({ ...plan, blocks: plan.blocks.filter((b) => !selIds.includes(b.id)) }); setSelIds([]); }} />
          ) : selBlock ? (
            <BlockPanel b={selBlock} levels={levels} meta={metaById.get(selBlock.id)} arr={arrProps}
              sectionKinds={SECTION_KINDS} onSectionKind={setSectionKind}
              sectionKind={(resolvePlanSections(plan).find((x) => x.id === resolveBlockSectionId(selBlock)) || {}).kind || "floor"}
              doors={gates.get(selBlock.id)}
              onFootDraw={footStart} onFootSeed={footSeed} onFootClear={footClear}
              footOpen={footOpen} setFootOpen={setFootOpen}
              numOpen={numOpen} setNumOpen={setNumOpen}
              advOpen={advOpen} setAdvOpen={setAdvOpen}
              onZoom={() => zoomTo(metaById.get(selBlock.id))}
              onChange={(p) => patchBlock(selBlock.id, p)} onMirror={mirror}
              onDup={() => {
                const label = freeLabel(selBlock.label, 1, usedLabels);
                const cp = reLabel({ ...selBlock, id: nid(), x: selBlock.x + 300, y: selBlock.y + 300 }, label);
                commit({ ...plan, blocks: [...plan.blocks, cp] }); setSelIds([cp.id]);
              }}
              onDelete={() => { commit({ ...plan, blocks: plan.blocks.filter((x) => x.id !== selBlock.id) }); setSelIds([]); }} />
          ) : (
            <div className="empty">Bir blok, koltuk veya şekil seç</div>
          )
          )}
        </aside>
      </div>
    </div>
  );
}

/* ─────────────────────────  PANELLER  ───────────────────────── */

const Row = ({ label, children }) => <label className="pr"><span>{label}</span>{children}</label>;

/** Dikdörtgen seçimle işaretlenmiş koltuklara toplu işlem. */
function MultiSeatPanel({ n, onOps, onClear, groupKinds, onGroup, onUngroup }) {
  return (
    <div className="panel">
      <div className="phead">
        <span className="plabel wide">{n.toLocaleString("tr-TR")} koltuk seçili</span>
        <button className="link" onClick={onClear}>bırak</button>
      </div>

      {/* Grup = hangi koltuklar birlikte (masa, loca, love-seat çifti,
          tekerlekli+refakatçi). Masa blokları KODDA otomatik gruplanıyor,
          burası elle gruplananlar için. Satış politikası (whole_group,
          contiguous vb.) BU UYGULAMANIN KONUSU DEĞİL — o biletleme
          tarafının işi; editör yalnız kim kiminle bilgisini taşır. */}
      <section>
        <p className="lab">Grupla</p>
        <select className="full" defaultValue="_"
          onChange={(e) => { if (e.target.value === "_") return;
            onGroup(e.target.value); e.target.value = "_"; }}>
          <option value="_">seç…</option>
          {Object.entries(groupKinds).map(([k, l]) => <option key={k} value={k}>{l}</option>)}
        </select>
        <button className="wide" onClick={onUngroup}>Gruptan çıkar</button>
      </section>

      {/* İki AYRI toplu eylem, iki AYRI eksen (bkz. görev tanımı): tür
          BLOK VARSAYILANINA döner ya da belli bir türe SABİTLENİR (eskiden
          "Normal koltuk"in delete o.at ile yaptığı — istisnayı SİLMEK,
          FORCE-etmek değil, bkz. paintOv/SeatPanel'deki AYRI "sıfırla"
          fikriyle karıştırma). Özellik EKLE/KALDIR ise türe hiç dokunmadan
          seatFeatures'ı bağımsız değiştirir (resolveSeatKind'in kısmi
          override desteği tam bunun için var). */}
      <section>
        <p className="lab">Tür ata</p>
        <select className="full" defaultValue="_"
          onChange={(e) => { if (e.target.value === "_") return;
            const v = e.target.value === "-" ? null : e.target.value;
            onOps((o) => {
              delete o.at;
              if (v === null) { delete o.seatKind; delete o.seatFeatures; }
              else o.seatKind = v;
              return o;
            }); e.target.value = "_"; }}>
          <option value="_">seç…</option>
          <option value="-">Bloğun varsayılanı</option>
          <option value={DEFAULT_SEAT_KIND}>Tekli (sabitle)</option>
          {Object.entries(ATTRS).map(([k, a]) => <option key={k} value={k}>{a.label}</option>)}
        </select>
      </section>

      <section>
        <p className="lab">Özellik ekle/kaldır</p>
        <select className="full" defaultValue="_"
          onChange={(e) => { if (e.target.value === "_") return;
            const [action, key] = e.target.value.split(":");
            onOps((o) => {
              const cur = o.seatFeatures !== undefined ? o.seatFeatures
                : (o.at !== undefined ? legacyAtToKind(o.at).seatFeatures : []);
              delete o.at;
              o.seatFeatures = action === "add" ? sortFeatures([...cur, key]) : cur.filter((f) => f !== key);
              return o;
            }); e.target.value = "_"; }}>
          <option value="_">seç…</option>
          {Object.entries(FEATURES).flatMap(([k, f]) => [
            <option key={`a${k}`} value={`add:${k}`}>{f.label} ekle</option>,
            <option key={`r${k}`} value={`remove:${k}`}>{f.label} kaldır</option>,
          ])}
        </select>
      </section>

      <section>
        <p className="lab">Varlık</p>
        <div className="acts">
          <button onClick={() => onOps((o) => { o.gap = true; delete o.rm; return o; })}>Boşluk yap</button>
          <button onClick={() => onOps((o) => { o.rm = true; delete o.gap; return o; })}>Sil</button>
          <button onClick={() => onOps((o) => { delete o.gap; delete o.rm; return o; })}>Geri getir</button>
        </div>
        <p className="mut sm">Boşluk koltuğu gizler ama numarayı tüketir; sil numarayı da geri verir.</p>
      </section>

      <section>
        <p className="lab">Düzeltmeleri sıfırla</p>
        <div className="acts">
          <button onClick={() => onOps((o) => { delete o.dx; delete o.dy; delete o.rot; return o; })}>Konum</button>
          <button onClick={() => onOps((o) => { delete o.label; return o; })}>Etiket</button>
          <button onClick={() => onOps((o) => { delete o.id; return o; })}>Kimlik</button>
        </div>
        <p className="mut sm">Ok tuşlarıyla seçili koltukları hep birlikte kaydırabilirsin.</p>
      </section>
    </div>
  );
}

/** Seçim yokken: plan seviyesindeki ayarlar. */
function PlanSettings({ plan, sample, onClose, onCsv, onSvg, onCsvImport, onDbImport, saved, venues, vk, theme, onTheme, wheelPref, onWheelPref, onNew, onNewStadium, onNewHall, onDup, onDel, onChange }) {
  const tpl = plan.idTemplate || DEF_TPL;
  const s = sample ? buildSeats(sample.b, sample.m, tpl).seats.find((x) => !x.gap) : null;
  return (
    <div className="ver">
      <p>Plan ayarları<button className="link" onClick={onClose}>kapat</button></p>

      <input className="tplin name" value={plan.name}
        onChange={(e) => onChange({ name: e.target.value })} />

      <div className="sec">
        <p className="lab">Koltuk kimliği şablonu</p>
        <input className="tplin" value={tpl} onChange={(e) => onChange({ idTemplate: e.target.value })} />
        <div className="toks">
          {ID_TOKENS.map((t) => (
            <button key={t} onClick={() => onChange({ idTemplate: tpl + t })}>{t}</button>
          ))}
          <button onClick={() => onChange({ idTemplate: DEF_TPL })}>sıfırla</button>
        </div>
        {s && <p className="sample">Örnek: <b>{s.id}</b>{s.adopted && " (benimsenmiş)"}</p>}
        <p className="mut sm">
          Mekân zaten bilet satıyorsa kimlik onlarda. Listeyi yükle; blok, sıra ve koltuk
          üzerinden eşleştirip kimlikleri benimseriz.
        </p>
        <label className="wide asfile">
          Koltuk listesi yükle (CSV)
          <input type="file" accept=".csv,text/csv" onChange={onCsvImport} hidden />
        </label>
        <label className="wide asfile">
          Veritabanı çıktısı yükle (db.json)
          <input type="file" accept=".json,application/json" onChange={onDbImport} hidden />
        </label>
      </div>

      <div className="sec">
        <p className="lab">Planlar</p>
        <div className="acts">
          <button onClick={onNew}>Yeni (boş)</button>
          <button onClick={onNewStadium}>Yeni (stadyum)</button>
          <button onClick={onNewHall}>Yeni (salon)</button>
          <button onClick={onDup}>Kopyala</button>
          <button className="dgr" disabled={!saved.includes(vk) || Object.keys(venues).length < 2}
            onClick={() => onDel(vk)}>Sil</button>
        </div>
        <p className="mut sm">
          Stadyum/salon, boş tuval yerine düzenlenebilir bir başlangıç iskeleti (tribün/kademe +
          gerçek vomitorium ya da kapı) verir. Plan geçişi üstteki menüden. Düzenlemeler otomatik
          kaydediliyor; altlık görseli kaydedilmez.
        </p>
      </div>

      <div className="sec">
        <p className="lab">Görünüm</p>
        <div className="seg">
          {[["light", "Açık"], ["dark", "Koyu"], ["system", "Sistem"]].map(([k, l]) => (
            <button key={k} className={theme === k ? "on" : ""} onClick={() => onTheme(k)}>{l}</button>
          ))}
        </div>
        <p className="mut sm">Sistem seçiliyken işletim sisteminin tercihini izler.</p>

        <p className="lab" style={{ marginTop: 14 }}>Tekerlek davranışı</p>
        <div className="seg">
          {[["auto", "Otomatik"], ["trackpad", "Trackpad"], ["mouse", "Fare"]].map(([k, l]) => (
            <button key={k} className={wheelPref === k ? "on" : ""} onClick={() => onWheelPref(k)}>{l}</button>
          ))}
        </div>
        <p className="mut sm">
          <b>Trackpad</b>: iki parmak kaydırma gezinir, pinch yakınlaştırır.
          <b> Fare</b>: tekerlek yakınlaştırır, Shift ile yatay gezinir.
          Otomatik ilk kaydırmadan hangisi olduğunu anlar.
        </p>
      </div>

      <div className="sec">
        <p className="lab">Çıktılar</p>
        <div className="acts">
          <button onClick={onCsv}>CSV</button>
          <button onClick={onSvg}>SVG</button>
        </div>
        <p className="mut sm">SVG, görünen alanı mekâna onaya göndermek için verir.</p>
      </div>
    </div>
  );
}

/** Mekân işareti: yuvarlak plaka + simge + isteğe bağlı etiket.
 *  Ölçü santimetre; salon ölçeğinde okunur kalması için plaka ile birlikte
 *  büyüyor, çizgi kalınlığı da onunla ölçekleniyor. */
function Poi({ s, selected, U }) {
  const ic = POI[s.icon] || POI.info;
  /* İşaret bir harita imidir, fiziksel nesne değil: ekranda sabit boyda.
     Salonda 90 cm, stadyumda 3,4 m diye ayrı ayrı ayarlanması yanlıştı. */
  const R = (s.size || 34) * U * 0.5;
  const k = (R * 1.25) / 24;
  return (
    <g className={selected ? "poi on" : "poi"} transform={`translate(${s.x} ${s.y}) rotate(${s.rot || 0})`}>
      <circle data-s={s.id} r={R} strokeWidth={1.6 * U} />
      {ic.img
        ? <image href={`${import.meta.env.BASE_URL}poi/${ic.img}.png`}
            x={-R * 0.62} y={-R * 0.62} width={R * 1.24} height={R * 1.24}
            filter={selected ? "url(#poiTintSel)" : "url(#poiTint)"} />
        : <g transform={`translate(${-12 * k} ${-12 * k}) scale(${k})`} strokeWidth={1.9}>
            <IconParts parts={ic.p || []} />
          </g>}
      {s.label && <text y={R * 2.05} style={{ fontSize: R * 0.68 }}>{s.label}</text>}
    </g>
  );
}

/* Zemin dokusu: düz tek renk bir dikdörtgen oyuncak gibi durur — çimde
   biçme şeridi, parkede tahta şeridi gerçek bir zemin hissi verir.
   Sadece surf2 tanımlı sahalarda (P.stripes şerit sayısını belirler). */
function MowStripes({ w, h, surf2, n = 9 }) {
  const sw = w / n;
  return Array.from({ length: n }, (_, i) => i % 2 === 1 && (
    <rect key={i} x={-w / 2 + i * sw} y={-h / 2} width={sw} height={h} fill={surf2} />
  ));
}

/** Saha zemini + nizami çizgi işaretlemeleri. */
function Pitch({ s, selected }) {
  const P = PITCHES[s.sport] || PITCHES.generic;
  const marks = useMemo(() => P.marks(s.w, s.h), [P, s.w, s.h]);
  return (
    <g className={selected ? "pit on" : "pit"} transform={`translate(${s.x} ${s.y}) rotate(${s.rot})`}>
      <rect data-s={s.id} x={-s.w / 2} y={-s.h / 2} width={s.w} height={s.h}
        rx={P.rx || 0} fill={P.surf} stroke={P.line} strokeWidth={P.blw || P.lw} />
      {P.surf2 && <MowStripes w={s.w} h={s.h} surf2={P.surf2} n={P.stripes || 9} />}
      <g fill="none" strokeLinecap="butt" pointerEvents="none">
        {marks.map((k, i) => {
          const st = { stroke: k.c || P.line, strokeWidth: k.lw || P.lw,
            strokeDasharray: k.dash || undefined, opacity: k.o || 1, fill: k.fill || "none" };
          if (k.t === "line") return <line key={i} x1={k.x1} y1={k.y1} x2={k.x2} y2={k.y2} {...st} />;
          if (k.t === "rect") return <rect key={i} x={k.x} y={k.y} width={k.w} height={k.h} {...st} />;
          if (k.t === "circle") return <circle key={i} cx={k.cx} cy={k.cy} r={k.r} {...st} />;
          if (k.t === "dot") return <circle key={i} cx={k.cx} cy={k.cy} r={k.r}
            fill={k.c || P.line} stroke="none" />;
          return <path key={i} d={k.d} {...st} />;
        })}
      </g>
    </g>
  );
}

const Num = ({ v, on, step = 1, min }) => (
  <input type="number" value={v} step={step} min={min}
    onChange={(e) => on(e.target.value === "" ? 0 : +e.target.value)} />
);

function ArraySection({ lin, setLin, rad, setRad, onArrayL, onArrayR, prev, setPrev }) {
  return (
    <>
      <details className={`sec${prev === "lin" ? " prev" : ""}`}
        onToggle={(e) => setPrev(e.target.open ? "lin" : null)}>
        <summary className="lab">Doğrusal dizi{prev === "lin" && <em>önizleme açık</em>}</summary>
        <div className="g3">
          <Row label="Kopya"><Num v={lin.count} on={(v) => setLin({ ...lin, count: Math.max(2, v) })} min={2} /></Row>
          <Row label="ΔX (cm)"><Num v={lin.dx} on={(v) => setLin({ ...lin, dx: v })} step={50} /></Row>
          <Row label="ΔY (cm)"><Num v={lin.dy} on={(v) => setLin({ ...lin, dy: v })} step={50} /></Row>
        </div>
        <button className="wide" onClick={onArrayL}>Doğrusal çoğalt</button>
      </details>
      <details className={`sec${prev === "rad" ? " prev" : ""}`}
        onToggle={(e) => setPrev(e.target.open ? "rad" : null)}>
        <summary className="lab">Radyal dizi{prev === "rad" && <em>önizleme açık</em>}</summary>
        <div className="g2">
          <Row label="Merkez X"><Num v={rad.cx} on={(v) => setRad({ ...rad, cx: v })} step={100} /></Row>
          <Row label="Merkez Y"><Num v={rad.cy} on={(v) => setRad({ ...rad, cy: v })} step={100} /></Row>
          <Row label="Kopya"><Num v={rad.count} on={(v) => setRad({ ...rad, count: Math.max(2, v) })} min={2} /></Row>
          <Row label="Açı adımı °"><Num v={rad.step} on={(v) => setRad({ ...rad, step: v })} step={5} /></Row>
        </div>
        <button className="wide" onClick={onArrayR}>Radyal çoğalt</button>
      </details>
    </>
  );
}

function MultiPanel({ n, seats, levels, arr, onAlign, onDist, onRenumber, onSet, onMirror, onDelete }) {
  const [rn, setRn] = useState({ start: 100, cx: 0, cy: 0, from: 135, cw: true, prefix: "" });
  return (
    <div className="panel">
      <div className="phead"><span className="plabel wide">{n} blok seçili</span></div>
      <div className="cap"><b>{seats.toLocaleString("tr-TR")}</b> koltuk</div>

      <section>
        <p className="lab">Hizala</p>
        <div className="alg">
          <button onClick={() => onAlign("l")} title="Sola">⇤</button>
          <button onClick={() => onAlign("cx")} title="Yatay ortala">⇔</button>
          <button onClick={() => onAlign("r")} title="Sağa">⇥</button>
          <button onClick={() => onAlign("t")} title="Üste">⇡</button>
          <button onClick={() => onAlign("cy")} title="Dikey ortala">⇕</button>
          <button onClick={() => onAlign("b")} title="Alta">⇣</button>
        </div>
        <div className="acts" style={{ marginTop: 7 }}>
          <button onClick={() => onDist("x")}>Yatay eşit dağıt</button>
          <button onClick={() => onDist("y")}>Dikey eşit dağıt</button>
        </div>
        <p className="mut sm">Ok tuşları 1 cm kaydırır · Shift 10 cm · Alt ızgara adımı.</p>
      </section>

      <ArraySection {...arr} />
      <section>
        <p className="lab">Toplu yeniden numaralandırma</p>
        <div className="g2">
          <Row label="Başlangıç no"><Num v={rn.start} on={(v) => setRn({ ...rn, start: v })} /></Row>
          <Row label="Ön ek"><input value={rn.prefix} placeholder="boş" onChange={(e) => setRn({ ...rn, prefix: e.target.value })} /></Row>
          <Row label="Merkez X"><Num v={rn.cx} on={(v) => setRn({ ...rn, cx: v })} step={100} /></Row>
          <Row label="Merkez Y"><Num v={rn.cy} on={(v) => setRn({ ...rn, cy: v })} step={100} /></Row>
          <Row label="Başlangıç açısı °"><Num v={rn.from} on={(v) => setRn({ ...rn, from: v })} step={15} /></Row>
          <Row label="Yön">
            <select value={rn.cw ? "cw" : "ccw"} onChange={(e) => setRn({ ...rn, cw: e.target.value === "cw" })}>
              <option value="cw">Saat yönü</option><option value="ccw">Saat yönü tersi</option>
            </select>
          </Row>
        </div>
        <button className="wide" onClick={() => onRenumber(rn)}>Yeniden numarala</button>
      </section>
      <section>
        <p className="lab">Toplu değiştir</p>
        <div className="g2">
          <Row label="Görünüm rengi">
            <div className="sw">
              <button title="Kat rengini kullan" onClick={() => onSet({ color: "" })}>A</button>
              {PALETTE.map((c) => (
                <button key={c} title={c} style={{ background: c }} onClick={() => onSet({ color: c })} />
              ))}
            </div>
          </Row>
          <Row label="Kat / kuşak">
            <input list="lv2" placeholder="değiştirme  ·  A / B ile iç içe" onBlur={(e) => e.target.value && onSet({ level: e.target.value })} />
            <datalist id="lv2">{levels.map((l) => <option key={l} value={l} />)}</datalist>
          </Row>
          <Row label="Dış hat payı (cm)">
            <input type="number" min="0" step="5" placeholder="değiştirme"
              onBlur={(e) => e.target.value !== "" && onSet({ pad: Math.max(0, +e.target.value) })} />
          </Row>
        </div>
        <Row label="Varsayılan tür">
          <select defaultValue="_" onChange={(e) => e.target.value !== "_"
            && onSet({ seatKind: e.target.value, seatFeatures: [], attr: undefined })}>
            <option value="_">değiştirme</option>
            <option value={DEFAULT_SEAT_KIND}>Tekli (normal)</option>
            {Object.entries(ATTRS).map(([k, a]) => <option key={k} value={k}>{a.label}</option>)}
          </select>
        </Row>
      </section>
      <section className="acts">
        <button onClick={onMirror}>Aynala</button>
        <button className="dgr" onClick={onDelete}>Sil</button>
      </section>
    </div>
  );
}

function SeatPanel({ sel, info, ov, eff, onToggle, onSet, onClose }) {
  return (
    <div className="panel">
      <div className="phead">
        <span className="plabel wide seatid">{info ? info.id : "Koltuk"}</span>
        <button className="link" onClick={onClose}>kapat</button>
      </div>
      {info && (
        <div className="cap">
          <b>{info.block}</b> blok · <b>{info.row}</b> sıra · <b>{info.num}</b>. koltuk
        </div>
      )}
      <section>
        <p className="lab">Konum düzeltmesi (cm)</p>
        <div className="g2">
          <Row label="X kaydır"><Num v={ov.dx || 0} on={(v) => onSet({ dx: v })} step={5} /></Row>
          <Row label="Y kaydır"><Num v={ov.dy || 0} on={(v) => onSet({ dy: v })} step={5} /></Row>
          <Row label="Döndür °"><Num v={ov.rot || 0} on={(v) => onSet({ rot: v })} step={5} /></Row>
          <Row label="Etiket"><input value={ov.label ?? ""} placeholder="otomatik" onChange={(e) => onSet({ label: e.target.value })} /></Row>
        </div>
      </section>
      {/* İki eksen: tür (tek seçim, eff.seatKind gösterir/yazar) + özellik
          (0..N, eff.seatFeatures gösterir/toggler). Değişiklik HER İKİSİ de
          doğrudan koltuğa yazılır (ov.seatKind/ov.seatFeatures) — blok
          varsayılanına geri dönmek isteyen "Sıfırla"yı DEĞİL, türü elle
          "Bloğun varsayılanı"na çevirmek yerine burada YOK (eskiden de
          yoktu — bkz. görev raporu, bu panel her zaman somut bir değer
          yazdı, MultiSeatPanel'in "Bloğun varsayılanı"na dönen toplu
          eylemi ayrı bir şey). */}
      <section>
        <p className="lab">Tür</p>
        <select className="full" value={eff.seatKind}
          onChange={(e) => onSet({ seatKind: e.target.value, at: undefined })}>
          <option value={DEFAULT_SEAT_KIND}>Tekli (normal)</option>
          {Object.entries(ATTRS).map(([k, a]) => <option key={k} value={k}>{a.label}</option>)}
        </select>
      </section>
      <section>
        <p className="lab">Özellikler</p>
        {Object.entries(FEATURES).map(([k, f]) => (
          <label key={k} className="chk">
            <input type="checkbox" checked={eff.seatFeatures.includes(k)}
              onChange={() => onSet({ seatFeatures: toggleFeature(eff.seatFeatures, k), at: undefined })} />
            {f.label}
          </label>
        ))}
      </section>
      <section className="acts">
        <button className={ov.gap ? "on" : ""} onClick={() => onToggle("gap")}>Boşluk</button>
        <button className={ov.rm ? "on" : ""} onClick={() => onToggle("rm")}>Sil</button>
        <button onClick={() => onSet({ dx: 0, dy: 0, rot: 0, label: "" })}>Sıfırla</button>
      </section>
      <p className="ovinfo">Boşluk koltuğu gizler ama numarayı tüketir. Sil numarayı da geri verir.</p>
    </div>
  );
}

function ShapePanel({ s, blocks, metas, onChange, onDelete, onAuto }) {
  const isDoor = s.type === "door";
  const set = new Set(s.blocks || []);
  const toggle = (id) => {
    const n = new Set(set);
    n.has(id) ? n.delete(id) : n.add(id);
    onChange({ blocks: [...n] });
  };
  const seats = (s.blocks || []).reduce((a, id) => a + (metas.get(id)?.seatCount || 0), 0);
  return (
    <div className="panel">
      <div className="phead">
        <input className="plabel wide" value={s.label} placeholder="Etiket" onChange={(e) => onChange({ label: e.target.value })} />
      </div>
      {isDoor && <div className="cap"><b>{set.size}</b> blok · {seats.toLocaleString("tr-TR")} koltuk</div>}
      {s.type === "icon" ? (
        <section>
          <p className="lab">İşaret</p>
          <div className="poigrid wide">
            {Object.entries(POI).map(([k, v]) => (
              <button key={k} className={s.icon === k ? "on" : ""} title={v.label}
                onClick={() => onChange({ icon: k, label: s.label === (POI[s.icon] || {}).label ? v.label : s.label })}>
                {v.img
                  ? <i className="pic" style={{ "--u": `url(${import.meta.env.BASE_URL}poi/${v.img}.png)` }} />
                  : <svg viewBox="0 0 24 24" fill="none"><IconParts parts={v.p || []} /></svg>}
              </button>
            ))}
          </div>
          <div className="g2" style={{ marginTop: 9 }}>
            <Row label="Boyut (px)">
              <Num v={s.size || 34} on={(v) => onChange({ size: Math.max(16, Math.min(80, v)) })} step={4} />
            </Row>
            <Row label="Döndür °"><Num v={s.rot} on={(v) => onChange({ rot: v })} step={15} /></Row>
            <Row label="X (cm)"><Num v={Math.round(s.x)} on={(v) => onChange({ x: v })} step={10} /></Row>
            <Row label="Y (cm)"><Num v={Math.round(s.y)} on={(v) => onChange({ y: v })} step={10} /></Row>
          </div>
          <p className="mut sm">Etiketi boş bırakırsan sadece simge görünür.</p>
        </section>
      ) : (
      <section>
        <div className="g2">
          <Row label="Tip">
            <select value={s.type} onChange={(e) => onChange({ type: e.target.value })}>
              {Object.entries(SHAPES).map(([k, v]) => <option key={k} value={k}>{v.label}</option>)}
            </select>
          </Row>
          <Row label="Döndür °"><Num v={s.rot} on={(v) => onChange({ rot: v })} step={5} /></Row>
          <Row label="X (cm)"><Num v={Math.round(s.x)} on={(v) => onChange({ x: v })} step={10} /></Row>
          <Row label="Y (cm)"><Num v={Math.round(s.y)} on={(v) => onChange({ y: v })} step={10} /></Row>
          {s.kind === "rect" && <>
            <Row label={isDoor ? "Çap" : "Genişlik"}><Num v={Math.round(s.w)} on={(v) => onChange({ w: Math.max(10, v) })} step={10} /></Row>
            {!isDoor && <Row label="Derinlik"><Num v={Math.round(s.h)} on={(v) => onChange({ h: Math.max(10, v) })} step={10} /></Row>}
          </>}
          <Row label="Yazı boyu"><Num v={s.fs || 100} on={(v) => onChange({ fs: Math.max(20, v) })} step={20} /></Row>
          {s.type === "standing" &&
            <Row label="Kapasite"><Num v={s.capacity} on={(v) => onChange({ capacity: Math.max(0, v) })} step={10} /></Row>}
        </div>
      </section>
      )}

      {isDoor && (
        <section>
          <p className="lab">Hizmet ettiği bloklar</p>
          <p className="mut sm">Biletin üstüne basılacak kapı bu listeden çıkar.</p>
          <ul className="picklist">
            {blocks.map((b) => (
              <li key={b.id} className={set.has(b.id) ? "on" : ""} onClick={() => toggle(b.id)}>
                <input type="checkbox" readOnly checked={set.has(b.id)} />
                <span>{b.name || b.label}</span>
                <i>{metas.get(b.id)?.seatCount ?? ""}</i>
              </li>
            ))}
          </ul>
          <button className="wide" onClick={onAuto}>Tüm blokları en yakın kapıya ata</button>
        </section>
      )}

      {s.type === "pitch" && (
        <section>
          <p className="lab">Saha tipi</p>
          <select className="full" value={s.sport || "generic"}
            onChange={(e) => { const P = PITCHES[e.target.value];
              onChange({ sport: e.target.value, w: P.w, h: P.h, label: P.label }); }}>
            {Object.entries(PITCHES).map(([k, v]) => <option key={k} value={k}>{v.label}</option>)}
          </select>
          <p className="mut sm">
            {PITCHES[s.sport]?.note} · şu an {(s.w / 100).toFixed(2)} × {(s.h / 100).toFixed(2)} m.
            Dış ölçüyü değiştirebilirsin; ceza sahası, çemberler ve yaylar nizami ölçüde kalır.
          </p>
          <button className="wide" onClick={() => { const P = PITCHES[s.sport] || PITCHES.generic;
            onChange({ w: P.w, h: P.h }); }}>Nizami ölçüye dön</button>
        </section>
      )}

      <section className="acts"><button className="dgr" onClick={onDelete}>Sil</button></section>
    </div>
  );
}

function BlockPanel({ b, levels, meta, arr, doors, sectionKinds, sectionKind, onSectionKind, onFootDraw, onFootSeed, onFootClear, onChange, onMirror, onDup, onDelete, onZoom,
  footOpen, setFootOpen, numOpen, setNumOpen, advOpen, setAdvOpen }) {
  const n = b.num;
  const setNum = (p) => onChange({ num: { ...n, ...p } });
  const kindLabel = b.kind === "fan" ? "Yelpaze" : b.kind === "free" ? "Serbest"
    : b.kind === "table" ? "Masa" : "Izgara";
  /* b.attr (ESKİ, venue dosyaları hâlâ yazıyor — ör. CSO'nun "obstr"
     bloğu) doğrudan OKUNMAZ: resolveSeatKind ikisini de (yeni seatKind/
     seatFeatures ya da eski attr) doğru yorumlar, panel HER ZAMAN
     çözülmüş, somut değeri gösterir. */
  const blockDefault = resolveSeatKind(b, {});
  /* A6.2'den beri rot/cols/rows/curve/r0/aStart/aEnd tuvaldeki tutamaçla
     doğrudan ayarlanabiliyor (bkz. handlesFor) — panelde ikinci kez tam
     genişlikte sunulmaları artık zorunlu değil, "Gelişmiş" altına inerler.
     Yine de klavye/hassas giriş için kalıyorlar, sadece varsayılan olarak
     kapalılar. Etkisi tuvalde her zaman görünür olsa da (rotasyon/kavis
     gözle fark edilir) kullanıcı panel kapalıyken HANGİ bloğun bu tür bir
     özel değere sahip olduğunu göremez — bu yüzden varsayılandan (0)
     farklıysa özet satırında belirtiliyor. X/Y'nin "varsayılanı" yok
     (her blok bir yerde durur), o yüzden onlar için rozet yok.
     Masa/Serbest'te ise handlesFor HİÇ tutamaç üretmiyor (grid/fan
     dalları dışında düz []) — Döndür°'ü oralarda "Gelişmiş"e atmak
     ölçütün ("tutamacın karşılığı var mı?") kendisini çiğnerdi, o yüzden
     bu iki kind'da çekirdekte kalıyor; rozet de sadece gerçekten
     Gelişmiş'te gizliyken anlamlı. */
  const rotInAdv = b.kind === "grid" || b.kind === "fan";
  const advBits = [];
  if (rotInAdv && Math.round(b.rot) % 360 !== 0) advBits.push(`${Math.round(b.rot)}° döndürülmüş`);
  if (b.kind === "grid" && b.curve) advBits.push("kavisli");
  return (
    <div className="panel">
      <div className="phead">
        <input className="plabel wide" value={b.name || ""} placeholder="Blok adı"
          onChange={(e) => onChange({ name: e.target.value })} />
        <span className="kind">{kindLabel}</span>
      </div>
      <div className="cap">
        <b>{meta ? meta.seatCount.toLocaleString("tr-TR") : "—"}</b> koltuk
        <button className="link" onClick={onZoom}>bloğa zumla</button>
      </div>
      <div className="chips">
        {doors && doors.length
          ? doors.map((d) => <span key={d}><i style={{ background: "#E4B13E" }} />{d}</span>)
          : <span className="warnc">Kapı atanmamış</span>}
      </div>
      <section>
        <div className="g2">
          <Row label="Kimlik ön eki"><input value={b.label} onChange={(e) => onChange(relabelPatch(b, e.target.value))} /></Row>
          {/* Kat alanı YOL kabul eder: "Batı Tribünü / Alt Kat" iki düğümlük
              bir bölüm zinciri kurar, blok yaprağa bağlanır. Böylece aynı
              blok kodu ("H") iki farklı katta yaşayabiliyor — mimari
              raporun (§5.1) istediği N seviye, ayrı bir ağaç seçici
              arayüzü yazmadan. Düz ad yazmak eskisi gibi tek düğüm. */}
          <Row label="Kat / kuşak">
            <input value={b.level || ""} list="lv" placeholder="Alt Tribün  ·  Batı Tribünü / Alt Kat"
              onChange={(e) => onChange(relevelPatch(b, e.target.value))} />
            <datalist id="lv">{levels.map((l) => <option key={l} value={l} />)}</datalist>
          </Row>
          {sectionPath(b.level).length > 1 && (
            <p className="hint">{sectionPath(b.level).join(" › ")} — {sectionPath(b.level).length} seviye</p>
          )}
          {/* Bölümün TÜRÜ (rapor §5.1 sözlüğü). Bloğun ait olduğu YAPRAK
              bölüme yazılır; üst düğümlerin türü onlara ait bir blok
              seçilince ayarlanır. */}
          <Row label="Bölüm türü">
            <select value={sectionKind} onChange={(e) => onSectionKind(e.target.value)}>
              {Object.entries(sectionKinds).map(([k, l]) => <option key={k} value={k}>{l}</option>)}
            </select>
          </Row>
          {!rotInAdv && (
            <Row label="Döndür °"><Num v={Math.round(b.rot)} on={(v) => onChange({ rot: v })} step={5} /></Row>
          )}
          <Row label="Yandan erişim">
            <label className="chk" style={{ height: 32 }}>
              <input type="checkbox" checked={!b.noAisle}
                onChange={(e) => onChange({ noAisle: !e.target.checked })} />
              {b.noAisle ? "Kapalı (loca gibi)" : "Gerekli"}
            </label>
          </Row>
          <Row label="Görünüm rengi">
            <div className="sw">
              <button className={!b.color ? "on" : ""} title="Kat rengini kullan"
                onClick={() => onChange({ color: "" })}>A</button>
              {PALETTE.map((c) => (
                <button key={c} title={c} style={{ background: c }} className={b.color === c ? "on" : ""}
                  onClick={() => onChange({ color: c })} />
              ))}
            </div>
          </Row>
          <Row label="Varsayılan tür">
            <select value={blockDefault.seatKind}
              onChange={(e) => onChange({ seatKind: e.target.value, seatFeatures: blockDefault.seatFeatures, attr: undefined })}>
              <option value={DEFAULT_SEAT_KIND}>Tekli (normal)</option>
              {Object.entries(ATTRS).map(([k, a]) => <option key={k} value={k}>{a.label}</option>)}
            </select>
          </Row>
          <Row label="Varsayılan özellikler">
            {Object.entries(FEATURES).map(([k, f]) => (
              <label key={k} className="chk">
                <input type="checkbox" checked={blockDefault.seatFeatures.includes(k)}
                  onChange={() => onChange({ seatFeatures: toggleFeature(blockDefault.seatFeatures, k), attr: undefined })} />
                {f.label}
              </label>
            ))}
          </Row>
        </div>
        {meta && (Object.keys(meta.kinds || {}).length > 0 || Object.keys(meta.features || {}).length > 0) && (
          <div className="chips">
            {Object.entries(meta.kinds || {}).map(([k, v]) => ATTRS[k] && (
              <span key={k}><i style={{ background: ATTRS[k].color }} />{ATTRS[k].short} {v}</span>
            ))}
            {Object.entries(meta.features || {}).map(([k, v]) => FEATURES[k] && (
              <span key={`f${k}`}><i style={{ background: FEATURES[k].color }} />{FEATURES[k].short} {v}</span>
            ))}
          </div>
        )}
      </section>

      {b.kind === "table" && (
        <section>
          <p className="lab">Masa</p>
          <div className="g2">
            <Row label="Biçim">
              <select value={b.tShape || "round"} onChange={(e) => onChange({ tShape: e.target.value })}>
                <option value="round">Yuvarlak</option>
                <option value="rect">Dikdörtgen</option>
              </select>
            </Row>
            <Row label="Kişi"><Num v={b.seats || 4} on={(v) => onChange({ seats: Math.max(1, v) })} min={1} /></Row>
            <Row label={(b.tShape || "round") === "round" ? "Çap (cm)" : "Genişlik (cm)"}>
              <Num v={b.tW || 90} on={(v) => onChange({ tW: Math.max(40, v) })} step={10} />
            </Row>
            {(b.tShape || "round") === "rect" && (
              <Row label="Derinlik (cm)"><Num v={b.tH || 90} on={(v) => onChange({ tH: Math.max(40, v) })} step={10} /></Row>
            )}
            <Row label="Başlangıç açısı °"><Num v={b.a0 || 0} on={(v) => onChange({ a0: v })} step={15} /></Row>
            <Row label="Sandalye payı"><Num v={b.clear != null ? b.clear : 12}
              on={(v) => onChange({ clear: Math.max(0, v) })} step={5} /></Row>
          </div>
          <p className="mut sm">
            {b.seats || 4} kişilik {(b.tShape || "round") === "round" ? "yuvarlak" : "dikdörtgen"} masa.
            Çoğaltmak için aşağıdaki dizi araçlarını kullan.
          </p>
        </section>
      )}

      {b.kind !== "free" && b.kind !== "table" && (
        <section>
          <p className="lab">Geometri (cm)</p>
          {b.kind === "grid" ? (
            <div className="g2">
              <Row label="Koltuk aralığı"><Num v={b.seatGap} on={(v) => onChange({ seatGap: Math.max(20, v) })} step={5} /></Row>
              <Row label="Sıra aralığı"><Num v={b.rowGap} on={(v) => onChange({ rowGap: Math.max(20, v) })} step={5} /></Row>
              <Row label="Sıra başına ±"><Num v={b.taper} on={(v) => onChange({ taper: v })} /></Row>
            </div>
          ) : (
            <>
              <Row label="Mod">
                <select value={b.mode || "span"} onChange={(e) => onChange({ mode: e.target.value })}>
                  <option value="span">Sabit açı dilimi</option>
                  <option value="pitch">Sabit koltuk aralığı</option>
                </select>
              </Row>
              <div className="g2" style={{ marginTop: 8 }}>
                {/* aCenter'ın tutamacı YOK (handlesFor sadece span modunda
                    aStart/aEnd ekliyor) — o yüzden rot/r0/rows/aStart/aEnd
                    "Gelişmiş"e inerken bu burada, çekirdekte kalıyor. */}
                {(b.mode || "span") === "pitch" &&
                  <Row label="Merkez açı °"><Num v={b.aCenter} on={(v) => onChange({ aCenter: v })} /></Row>}
                <Row label="Sıra aralığı"><Num v={b.rowGap} on={(v) => onChange({ rowGap: Math.max(20, v) })} step={5} /></Row>
                <Row label="Koltuk aralığı"><Num v={b.seatGap} on={(v) => onChange({ seatGap: Math.max(20, v) })} step={5} /></Row>
              </div>
            </>
          )}
          <div className="g2" style={{ marginTop: 8 }}>
            <Row label="Sıra başına koltuk">
              <input value={b.counts} placeholder='"21..15" veya "5,5,6"' onChange={(e) => onChange({ counts: e.target.value })} />
            </Row>
            <Row label="Hizalama">
              <select value={b.align || "center"} onChange={(e) => onChange({ align: e.target.value })}>
                <option value="center">Ortalı</option><option value="left">Sola dayalı</option><option value="right">Sağa dayalı</option>
              </select>
            </Row>
          </div>
        </section>
      )}

      <details className="sec" open={advOpen} onToggle={(e) => setAdvOpen(e.target.open)}>
        <summary className="lab">Gelişmiş{advBits.length > 0 && <em>{advBits.join(" · ")}</em>}</summary>
        <p className="mut sm">
          Konum ve şekil artık tuvalde bloğun üstündeki tutamaçlarla doğrudan
          ayarlanabiliyor — buradakiler klavye veya tam sayı girişi içindir.
        </p>
        <div className="g2">
          <Row label="X (cm)"><Num v={Math.round(b.x)} on={(v) => onChange({ x: v })} step={10} /></Row>
          <Row label="Y (cm)"><Num v={Math.round(b.y)} on={(v) => onChange({ y: v })} step={10} /></Row>
          {rotInAdv &&
            <Row label="Döndür °"><Num v={Math.round(b.rot)} on={(v) => onChange({ rot: v })} step={5} /></Row>}
          {b.kind === "grid" && <>
            <Row label="Sıra"><Num v={b.rows} on={(v) => onChange({ rows: Math.max(1, v) })} min={1} /></Row>
            <Row label="Koltuk"><Num v={b.cols} on={(v) => onChange({ cols: Math.max(1, v) })} min={1} /></Row>
            <Row label="Kavis"><Num v={b.curve} on={(v) => onChange({ curve: v })} step={10} /></Row>
          </>}
          {b.kind === "fan" && <>
            <Row label="Sıra"><Num v={b.rows} on={(v) => onChange({ rows: Math.max(1, v) })} min={1} /></Row>
            <Row label="İlk yarıçap"><Num v={Math.round(b.r0)} on={(v) => onChange({ r0: Math.max(50, v) })} step={10} /></Row>
            {(b.mode || "span") === "span" && <>
              <Row label="Başlangıç °"><Num v={b.aStart} on={(v) => onChange({ aStart: v })} /></Row>
              <Row label="Bitiş °"><Num v={b.aEnd} on={(v) => onChange({ aEnd: v })} /></Row>
            </>}
          </>}
        </div>
      </details>

      {b.kind !== "free" && (
        <details className="sec" open={footOpen} onToggle={(e) => setFootOpen(e.target.open)}>
          <summary className="lab">Dış hat{b.foot && b.foot.length >= 3 && <em>elle çizilmiş</em>}</summary>
          {b.foot && b.foot.length >= 3 ? (<>
            <p className="mut sm">
              {b.foot.length} nokta. Köşeleri tuvalde sürükleyerek düzeltebilirsin.
            </p>
            <div className="acts">
              <button onClick={onFootDraw}>Yeniden çiz</button>
              <button onClick={onFootClear}>Otomatiğe dön</button>
            </div>
          </>) : (<>
            <Row label="Dış hat payı (cm)">
              <Num v={b.pad != null ? b.pad : 55} on={(v) => onChange({ pad: Math.max(0, v) })} step={5} />
            </Row>
            <p className="mut sm">
              Dış hat koltuklardan türetiliyor. Sütun, merdiven boşluğu veya düzensiz
              kenar varsa elle çiz.
            </p>
            <div className="acts">
              <button onClick={onFootDraw}>Elle çiz</button>
              <button onClick={onFootSeed}>Otomatikten başla</button>
            </div>
          </>)}
        </details>
      )}

      <ArraySection {...arr} />

      {/* Eskiden iki ayrı katlanır bölümdü (Sıra etiketi / Koltuk numarası)
          — numaralandırma tek bir alt konu, tek bir aç/kapa yeter. */}
      <details className="sec" open={numOpen} onToggle={(e) => setNumOpen(e.target.open)}>
        <summary className="lab">Numaralandırma</summary>
        <p className="lab">Sıra etiketi</p>
        <div className="g2">
          <Row label="Şema">
            <select value={n.rowScheme} onChange={(e) => setNum({ rowScheme: e.target.value })}>
              <option value="number">Sayı (1, 2, 3)</option>
              <option value="letter">Harf (A, B, C)</option>
              <option value="custom">Özel liste</option>
            </select>
          </Row>
          <Row label="Sıra başlangıcı"><Num v={n.rowStart} on={(v) => setNum({ rowStart: v })} /></Row>
        </div>
        {n.rowScheme === "custom" && (
          <Row label="Liste"><input value={n.rowCustom} onChange={(e) => setNum({ rowCustom: e.target.value })} /></Row>
        )}
        <div className="checks">
          <label><input type="checkbox" checked={n.rowRev} onChange={(e) => setNum({ rowRev: e.target.checked })} />Ters sırala</label>
          {n.rowScheme === "letter" &&
            <label><input type="checkbox" checked={n.skipAmbig} onChange={(e) => setNum({ skipAmbig: e.target.checked })} />I, O, Q atla</label>}
        </div>

        <p className="lab" style={{ marginTop: 10 }}>Koltuk numarası</p>
        <div className="g2">
          <Row label="Şema">
            <select value={n.seatScheme} onChange={(e) => setNum({ seatScheme: e.target.value })}>
              <option value="seq">Ardışık (1, 2, 3)</option>
              <option value="odd">Sadece tek (101, 103…)</option>
              <option value="even">Sadece çift (102, 104…)</option>
              <option value="center">Merkezden dışa · tek/çift (1-2 ortada)</option>
              <option value="center-in">Duvardan içeri · tek/çift (1-2 kenarda)</option>
            </select>
          </Row>
          <Row label="Yön">
            <select value={n.seatDir} disabled={n.seatScheme === "center"} onChange={(e) => setNum({ seatDir: e.target.value })}>
              <option value="ltr">Soldan sağa</option><option value="rtl">Sağdan sola</option>
            </select>
          </Row>
          <Row label="Koltuk başlangıcı"><Num v={n.seatStart} on={(v) => setNum({ seatStart: v })} /></Row>
          <Row label="Atlanacak"><input value={n.skip} placeholder="13, 4" onChange={(e) => setNum({ skip: e.target.value })} /></Row>
        </div>
        <Row label="Numara bağlama">
          <select value={n.anchor || "order"} disabled={n.seatScheme === "center"} onChange={(e) => setNum({ anchor: e.target.value })}>
            <option value="order">Sıradaki koltuk sırasına göre</option>
            <option value="column">Bloktaki sütun konumuna göre</option>
          </select>
        </Row>
      </details>

      <section className="acts">
        <button onClick={onMirror}>Aynala</button>
        <button onClick={onDup}>Çoğalt</button>
        <button className="dgr" onClick={onDelete}>Sil</button>
      </section>
      <p className="ovinfo">
        {Object.keys(b.ov).length} koltuk düzeltmesi ·{" "}
        <button className="link" onClick={() => onChange({ ov: {} })}>sıfırla</button>
      </p>
    </div>
  );
}

