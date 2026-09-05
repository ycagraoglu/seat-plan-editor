import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio.js";

/* ══════════════════════════════════════════════════════════════════════════
   GERÇEK STDIO — dağıtımın gerçek şekli

   Öbür testler InMemoryTransport kullanıyor: hızlı ve şema doğrulamasını
   kapsıyor, ama SÜRECİ ve BORUYU hiç sınamıyor. Claude Desktop sunucuyu
   ayrı bir süreç olarak başlatıp stdio'dan konuşuyor; orada bozulabilecek
   şeyler burada bozulmuyor:

   · sunucu ayrı süreçte gerçekten ayağa kalkıyor mu (import hatası, üst
     düzey await, eksik bağımlılık — hiçbiri bellek-içi testte görünmez)
   · yüz kilobaytlık base64 PNG boruyu tıkamadan geçiyor mu
   · oturum durumu ard arda çağrılar boyunca korunuyor mu

   ÖLÇTÜM, YAZDIĞIM GİBİ DEĞİLMİŞ: "stdout'a kaçan bir satır JSON-RPC'yi
   bozar" diye not düşmüştüm; sunucuya kasten console.log koydum ve test
   YEŞİL kaldı — SDK'nın stdio taşıması el sıkışmadan önceki çözümlenemeyen
   satırı yok sayıyor. Akışın ORTASINDAKİ kirlenmeyi denemedim, o yüzden
   "stdout güvenli" de demiyorum; yalnız bu senaryonun zararsız olduğunu
   ölçtüm.

   Bu dosya yavaş (süreç başlatıyor) ve az test içeriyor — amacı kapsam
   değil, YOLUN KENDİSİNİ bir kez gerçekten yürümek.
   ══════════════════════════════════════════════════════════════════════════ */

let client;

beforeAll(async () => {
  client = new Client({ name: "stdio-test", version: "0" });
  await client.connect(new StdioClientTransport({
    command: "node", args: ["mcp/index.mjs"],
  }));
}, 30_000);

afterAll(async () => { await client?.close(); });

const cagir = async (name, args = {}) => {
  const r = await client.callTool({ name, arguments: args });
  if (r.isError) throw new Error(r.content.map((c) => c.text).join("\n"));
  return r;
};

const PNG_BASLIK = Buffer.from([0x89, 0x50, 0x4e, 0x47]);

describe("sunucu ayrı süreçte stdio üstünden çalışıyor", () => {
  it("bağlanıyor ve araçlarını bildiriyor", async () => {
    const { tools } = await client.listTools();
    expect(tools.length).toBeGreaterThanOrEqual(27);
    expect((await cagir("ping")).content[0].text).toContain("hazır");
  });

  it("yapısal çıktı stdio'dan sağlam geçiyor", async () => {
    await cagir("open_sample", { key: "sureyya" });
    const d = JSON.parse((await cagir("plan_summary")).content[0].text);
    expect(d.seatCount).toBe(386);
    expect(d.blocks).toHaveLength(18);
  });

  it("büyük base64 PNG boruyu bozmadan geçiyor", async () => {
    /* En büyük gerçekçi yük: 52.838 koltukluk plan, geniş render. */
    await cagir("open_sample", { key: "fener" });
    const r = await cagir("render", { scope: "all", width: 2000 });
    const buf = Buffer.from(r.content.find((c) => c.type === "image").data, "base64");
    expect(buf.length).toBeGreaterThan(100_000);
    expect(buf.subarray(0, 4)).toEqual(PNG_BASLIK);
  }, 30_000);

  it("araç hatası istemciye ANLAMLI mesajla ulaşıyor", async () => {
    await cagir("create_plan", { name: "T" });
    await expect(cagir("add_block", { kind: "fan", label: "X", level: "L", x: 0, y: 0, rows: 5 }))
      .rejects.toThrow(/r0/);
  });

  it("ard arda çağrılarda oturum durumu korunuyor", async () => {
    await cagir("create_plan", { name: "Oturum" });
    await cagir("add_block", { kind: "grid", label: "A", level: "L", x: 0, y: 0, rows: 5, cols: 10 });
    await cagir("add_block", { kind: "grid", label: "B", level: "L", x: 2000, y: 0, rows: 5, cols: 10 });
    const d = JSON.parse((await cagir("plan_summary")).content[0].text);
    expect(d.seatCount).toBe(100);
  });
});
