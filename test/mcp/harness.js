import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { InMemoryTransport } from "@modelcontextprotocol/sdk/inMemory.js";
import { createMcpServer } from "../../mcp/server.mjs";

/* Testler araçları GERÇEK MCP yolundan çağırır — şema doğrulaması dahil.
   İşleyicileri doğrudan çağırmak, "testte çalışıyor ama istemciden
   çalışmıyor" ayrışmasına açık kapı bırakırdı. */
export async function baglan() {
  const { server, session } = createMcpServer();
  const [istemciT, sunucuT] = InMemoryTransport.createLinkedPair();
  const client = new Client({ name: "test", version: "0" });
  await Promise.all([server.connect(sunucuT), client.connect(istemciT)]);

  const cagir = async (name, args = {}) => {
    const r = await client.callTool({ name, arguments: args });
    if (r.isError) throw new Error(r.content?.map((c) => c.text).join("\n") || "araç hatası");
    return r.content.map((c) => c.text).join("\n");
  };
  const jsonCagir = async (name, args = {}) => JSON.parse(await cagir(name, args));

  return { client, server, session, cagir, jsonCagir,
    kapat: () => Promise.all([client.close(), server.close()]) };
}
