/* ─────────────────────────  SALON DİZİNİ  ─────────────────────────
   9 örnek salon + boş şablon, tek yerden toplanıp dışa veriliyor.

   ⚠ IMPORT SIRASI KUTSAL. Blok/şekil id'leri (`b73`, `s402`…) core/ids.js
   içindeki TEK modül-düzeyi sayaçtan (uid) geliyor, salon dosyaları modül
   yüklenirken (top-level) nid() çağırıyor. Yani her id, salonların
   DEĞERLENDİRİLME SIRASINA bağlı — bu da ES modüllerinde import
   ifadelerinin YAZILDIĞI sıradır (Node/bundler'lar bir modülü İLK import
   edildiği yerde, o satıra gelindiğinde değerlendirir; sonraki import'lar
   önbellekten döner ve yeniden çalışmaz).

   Aşağıdaki sıra, A3 öncesi src/PlanEditor.jsx'teki tanım sırasıyla
   BİREBİR aynı olmalı: CSO → ZORLU → GS → ULKER → HARBIYE → AYLAK →
   SUREYYA → AKM → YENIKAPI → EMPTY. Bunu değiştirmek TÜM id'leri kaydırır
   ve test/golden/** ile check-golden.mjs'i 9/9 FARKLI'ya düşürür.

   (BUILTINS nesnesindeki ANAHTAR sırası bunun dışında — o sadece bir
   sözlük, id üretimini etkilemez. Sıra ancak import satırlarının
   sırasıyla belirlenir.) */
import { CSO } from "./cso.venue.js";
import { ZORLU } from "./zorlu.venue.js";
import { GS } from "./gs.venue.js";
import { ULKER } from "./ulker.venue.js";
import { HARBIYE } from "./harbiye.venue.js";
import { AYLAK } from "./aylak.venue.js";
import { SUREYYA } from "./sureyya.venue.js";
import { AKM } from "./akm.venue.js";
import { YENIKAPI } from "./yenikapi.venue.js";
import { EMPTY } from "./empty.venue.js";
/* FENER EN SONDA — id üretimi import sırasına bağlı (bkz. dosya başı
   uyarısı). Sona eklemek mevcut dokuz salonun tek bir id'sini bile
   kaydırmaz; araya sokmak test/golden'ı 9/9 FARKLI'ya düşürürdü. */
import { FENER } from "./fener.venue.js";

export { CSO, ZORLU, GS, ULKER, HARBIYE, AYLAK, SUREYYA, AKM, YENIKAPI, EMPTY, FENER };

/* Anahtar → salon. Kod-kaynaklı örnek salonlar (empty hariç) burada
   toplanır; core/schema.js bu nesneyi "hangi anahtarlar salt-okunur
   örnek" sorusunun TEK kaynağı olarak kullanır (bkz. isProtectedSample) —
   ayrı bir örnek-anahtar listesi tutmuyoruz, o listeyle buranın birbirinden
   sapma riski hiç doğmasın diye.
   Anahtar SIRASI da kozmetik değil aslında önemsiz: id üretimini yukarıdaki
   import sırası belirliyor (bkz. dosya başı uyarısı). Yine de venue
   seçicideki (PlanEditor.jsx) <select> bu nesnenin key sırasıyla
   dolduğundan, eski src/PlanEditor.jsx'teki BUILTINS ile AYNI sırada
   tutuldu — tek amaç açılır listenin görünümünü birebir korumak. */
export const BUILTINS = {
  sureyya: SUREYYA, aylak: AYLAK, harbiye: HARBIYE, gs: GS, ulker: ULKER,
  zorlu: ZORLU, cso: CSO, akm: AKM, yenikapi: YENIKAPI, fener: FENER, empty: EMPTY,
};
