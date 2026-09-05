#!/usr/bin/env node
import { readFileSync, writeFileSync, existsSync, rmSync } from "node:fs";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { InMemoryTransport } from "@modelcontextprotocol/sdk/inMemory.js";
import { createMcpServer, INSTRUCTIONS } from "./server.mjs";

/* ══════════════════════════════════════════════════════════════════════════
   KOMUT SATIRI — MCP araçlarını elle çağırmak için

   İki işi var:
   1. Sunucuyu MCP istemcisi olmadan kurcalamak (hata ayıklama).
   2. Araç AÇIKLAMALARININ yeterli olup olmadığını sınamak. Bu kod tabanını
      bilen biri araçları doğru çağırabiliyor olabilir; asıl soru, yalnız
      açıklamalara bakan birinin çağırabilmesi. Bu arayüz o testi mümkün
      kılıyor — deneyen kişi/model yalnız `tools` çıktısını görüyor.

   Oturum durumu dosyada tutuluyor (.mcp-session.json), çünkü her çağrı
   ayrı bir süreç. Gerçek kullanımda sunucu sürekli çalışır ve planı
   bellekte tutar; buradaki dosya yalnız komut satırı için bir köprü.

   Kullanım:
     node mcp/cli.mjs tools                    araçları ve açıklamalarını yaz
     node mcp/cli.mjs describe <araç>          tek aracın tam şeması
     node mcp/cli.mjs call <araç> '<json>'     aracı çağır
     node mcp/cli.mjs reset                    oturumu sıfırla
   ══════════════════════════════════════════════════════════════════════════ */

const DURUM = process.env.MCP_SESSION || ".mcp-session.json";

async function baglan() {
  const { server, session } = createMcpServer();
  const [a, b] = InMemoryTransport.createLinkedPair();
  const client = new Client({ name: "cli", version: "0" });
  await Promise.all([server.connect(b), client.connect(a)]);
  /* session.set() ŞART: absorbIds'i çağırıp kimlik sayacını ileri sarıyor.
     Doğrudan atama yapınca sayaç sıfırdan başlıyor ve dosyadan yüklenen her
     oturumda yeni bloklar AYNI kimliği alıyordu (hepsi b587). Kimlikle
     adreslenen her araç o kimliği paylaşan bütün bloklara vuruyordu:
     "Blok silindi: Q" yazıp üçünü birden siliyordu. Soğuk LLM testi buldu. */
  if (existsSync(DURUM)) session.set(JSON.parse(readFileSync(DURUM, "utf8")));
  return { client, server, session };
}

const kaydet = (session) => {
  if (session.plan) writeFileSync(DURUM, JSON.stringify(session.plan));
};

const [, , komut, ...arg] = process.argv;

if (komut === "reset") {
  rmSync(DURUM, { force: true });
  console.log("oturum sıfırlandı");
  process.exit(0);
}

const { client, server, session } = await baglan();

try {
  if (!komut || komut === "tools") {
    const { tools } = await client.listTools();
    console.log(INSTRUCTIONS);
    console.log(`\n${"═".repeat(70)}\nARAÇLAR (${tools.length})\n${"═".repeat(70)}\n`);
    tools.forEach((t) => {
      const alanlar = Object.keys(t.inputSchema?.properties || {});
      console.log(`── ${t.name} ── ${t.title || ""}`);
      console.log(t.description || "");
      console.log(`  girdi: ${alanlar.length ? alanlar.join(", ") : "(yok)"}\n`);
    });
  } else if (komut === "describe") {
    const { tools } = await client.listTools();
    const t = tools.find((x) => x.name === arg[0]);
    if (!t) throw new Error(`Böyle bir araç yok: ${arg[0]}`);
    console.log(JSON.stringify(t, null, 2));
  } else if (komut === "call") {
    const [ad, govde] = arg;
    if (!ad) throw new Error("Kullanım: call <araç> '<json>'");
    const r = await client.callTool({ name: ad, arguments: govde ? JSON.parse(govde) : {} });
    r.content.forEach((c) => {
      if (c.type === "text") console.log(c.text);
      /* Görseli konsola basmanın anlamı yok; nereye yazıldığını söyle. */
      else if (c.type === "image") {
        const yol = `.mcp-render.png`;
        writeFileSync(yol, Buffer.from(c.data, "base64"));
        console.log(`[görsel ${yol} dosyasına yazıldı · ${Math.round(c.data.length * 0.75 / 1024)} KB]`);
      }
    });
    if (r.isError) process.exitCode = 1;
    kaydet(session);
  } else {
    throw new Error(`Bilinmeyen komut: ${komut}. tools · describe · call · reset`);
  }
} catch (e) {
  console.error("HATA:", e.message);
  process.exitCode = 1;
} finally {
  await client.close(); await server.close();
}
