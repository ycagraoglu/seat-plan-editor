#!/usr/bin/env node
/* Geometri doğrulama seti — 9 örnek salonun tümünde 5 kontrol:
   1. koltuk-içerme (koltuk köşeleri kendi bloğunun tabanında mı)
   2. taban-taban çakışma, aynı kat (Sutherland-Hodgman, >50cm²)
   2b. taban-taban çakışma, farklı kat (balkon sarkması olabilir ama planda
       üst üste biner — AKM'de %16 böyle bir çakışma vardı, yalnız-aynı-kat
       kontrolü hiç görmemişti)
   3. sınır (koltuk köşeleri + blok tabanı salon duvarı içinde mi)
   4. gerçek render (react-dom/server ile mount — derleme geçse de
      çalışma anı hatası kaçabiliyor)
   5. validate()'in kendi çıktısı (err/warn) — genel entegrasyon testi

   Kuralların KENDİSİ artık burada değil, src/core/rules.js'te: bu betik
   kendi overlapArea/clip/seatCorners kopyasını tutmuyor, runRules()'u
   çağırıp bulguları okuyor. validate() ve PlanEditor.jsx'teki canlı uyarı
   (breach/collide) da AYNI runRules()'u çağırıyor — üçü de artık tek
   kaynaktan besleniyor, biri "temiz" derken öteki "çakışma var" diyemez.

   PlanEditor.jsx JSX içerdiği için Node onu doğrudan import edemez;
   esbuild ile geçici bir modüle derlenip iş bitince silinir (loadModule).
   src/core/*.js düz JS'tir, doğrudan import edilir — esbuild'e gerek yok. */
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { loadModule } from "./lib/load-module.mjs";
import { buildMeta } from "../src/core/geometry.js";
import { gateMap } from "../src/core/gates.js";
import { buildCtx, runRules } from "../src/core/rules.js";

const mod = await loadModule();
const { validate, ATTRS } = mod;
/* seat-in-own-block / seat-corners-outside-boundary kuralları koltuğun
   GERÇEK dikdörtgenini kullanır (merkezini değil) — genişliği ATTRS'ten,
   PlanEditor.jsx'in görünüm sabitinden gelir; core/rules.js kendi
   render/etiket sabitlerini bilmez. */
const WIDE_ATTRS = new Set(Object.keys(ATTRS).filter((k) => ATTRS[k].wide));
/* Salon listesi elle yazılmıyordu ve onuncu salon eklenince bu betik
   sessizce eskisini taramaya devam etmişti. Modülden türetiliyor. */
const VENUES = Object.fromEntries(Object.entries(mod)
  .filter(([k, v]) => k !== "EMPTY" && k !== "BUILTINS" && v && Array.isArray(v.blocks) && v.blocks.length));

console.log("── 4. Gerçek render testi ──");
try {
  renderToStaticMarkup(createElement(mod.default));
  console.log("OK — <PlanEditor/> sunucu tarafında hatasız mount oldu\n");
} catch (e) {
  console.log(`HATA — mount patladı: ${e.message}\n`);
  process.exitCode = 1;
}

/* Bu CI setinin "temiz" bar'ı validate()'in err/warn ayrımından daha sıkı:
   referans salonlarda kat-arası çakışma validate()'te sadece UYARI (balkon
   sarkması fiziksel olarak mümkün olduğu için), ama örnek salonların
   hiçbirinde HİÇ olmamalı — tam da bu yüzden AKM'deki %16'lık çakışma
   gözden kaçmıştı. Geri kalan her kural için validate()'in kendi err
   eşiği (aşağıdaki check 5) zaten yeterli. */
const FAIL_REGARDLESS_OF_SEVERITY = new Set(["footprint-overlap-cross-level"]);
const line = (f) => (!f ? "OK"
  : `${f.t === "err" || FAIL_REGARDLESS_OF_SEVERITY.has(f.id) ? "HATA" : "UYARI"} — ${f.m}${f.d ? ` (${f.d})` : ""}`);

let anyFail = false;
for (const [name, venue] of Object.entries(VENUES)) {
  const metas = venue.blocks.map((b) => ({ b, m: buildMeta(b) }));
  const gates = gateMap(venue);
  const ctx = buildCtx(venue, metas, gates, { wideAttrs: WIDE_ATTRS });
  const findings = runRules(ctx); // liveOnly yok → TÜM kurallar, validate() ile AYNI motor
  const byId = (id) => findings.find((f) => f.id === id);

  const containment = byId("seat-in-own-block");
  const sameLevel = byId("footprint-overlap-same-level");
  const crossLevel = byId("footprint-overlap-cross-level");
  const seatBounds = byId("seat-corners-outside-boundary");
  const blockBounds = byId("blocks-outside-boundary");

  const report = validate(venue, metas, gates); // 5. validate()'in kendi çıktısı — ayrı bir entegrasyon testi
  const errs = report.list.filter((o) => o.t === "err");

  const pass = !containment && !sameLevel && !crossLevel && !seatBounds && !blockBounds && !errs.length;
  if (!pass) anyFail = true;

  console.log(`── ${name} · ${report.total.toLocaleString("tr-TR")} koltuk ──`);
  console.log(`  1. koltuk-içerme:  ${line(containment)}`);
  console.log(`  2. taban çakışma:  ${line(sameLevel)}`);
  console.log(`  2b. kat-arası çak: ${line(crossLevel)}`);
  console.log(`  3. sınır:          ${seatBounds || blockBounds
    ? `HATA — ${[seatBounds?.m, blockBounds?.m].filter(Boolean).join(" · ")}` : "OK"}`);
  console.log(`  5. validate():     ${errs.length ? `HATA — ${errs.map((e) => e.m).join(" · ")}` : "OK"}`);
  console.log("");
}

const venueCount = Object.keys(VENUES).length;
console.log(anyFail ? "SONUÇ: en az bir salonda hata var — yukarıya bak." : `SONUÇ: ${venueCount} salon da temiz.`);
if (anyFail) process.exitCode = 1;
