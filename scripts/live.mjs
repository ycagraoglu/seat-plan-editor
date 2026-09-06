import { spawn } from "node:child_process";

/* ══════════════════════════════════════════════════════════════════════════
   CANLI GÖRÜNÜM — tek komutla ayağa kaldır

   Canlı görünüm iki süreç istiyor: depoyu tutan sunucu ve editörü servis
   eden vite. Ayrıca editörün API sürücüsünü seçmesi için VITE_API_BASE
   şart — verilmezse localStorage'a düşer ve canlı görünüm HİÇ AÇILMAZ.
   Üç şeyi elle hatırlamak yerine tek komut.

   Bağımlılık eklemedik (concurrently vb.): iki spawn ve bir kapatma
   kancası zaten bu kadar. Biri ölürse öbürü de kapanıyor — yarım kalmış
   arka plan sunucusu bırakmak, bir dahaki sefere "port kullanımda"
   diye geri geliyor.
   ══════════════════════════════════════════════════════════════════════════ */

/* API_PORT — "PORT" DEĞİL. Dışarıdaki PORT'u miras almak, editörü
   çalıştıran kabuk onu ayarlamışsa (önizleme koşucuları ayarlıyor)
   sunucuyla vite'ı AYNI porta gönderiyor; ölçtüm, öyle oldu. */
const PORT = process.env.API_PORT || 8787;
const API = `http://localhost:${PORT}/api`;

const cocuklar = [];
const baslat = (ad, komut, arg, env) => {
  const c = spawn(komut, arg, { stdio: "inherit", env: { ...process.env, ...env } });
  c.on("exit", (kod) => { console.log(`\n[${ad}] çıktı (${kod})`); kapat(); });
  cocuklar.push(c);
  return c;
};
let kapaniyor = false;
const kapat = () => {
  if (kapaniyor) return;
  kapaniyor = true;
  for (const c of cocuklar) { try { c.kill("SIGTERM"); } catch { /* zaten ölmüş */ } }
  process.exit(0);
};
process.on("SIGINT", kapat);
process.on("SIGTERM", kapat);

console.log(`● sunucu  http://localhost:${PORT}`);
console.log(`● editör  http://localhost:5173  (VITE_API_BASE=${API})`);
console.log("  MCP tarafında:  SEAT_EDITOR_API=" + API + " node mcp/index.mjs\n");

baslat("sunucu", process.execPath, ["server/index.mjs"], { PORT });
baslat("editör", "npx", ["vite"], { VITE_API_BASE: API });
