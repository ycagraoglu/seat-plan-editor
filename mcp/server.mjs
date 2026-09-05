import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { registerTools } from "./tools/index.mjs";
import { Session } from "./session.mjs";

/* Sunucu KURULUMU taşımadan ayrı. index.mjs onu stdio'ya bağlar; testler
   bellek-içi taşımaya bağlar. Aynı sunucu, aynı araçlar — test ettiğim şey
   gerçekten çalışan şey olsun diye. */

export const INSTRUCTIONS = [
  "Mekân oturma planı çizen editör. Blok ekleyip numaralandırır, kural",
  "motoruyla doğrular, tabloya dışa aktarırsın.",
  "",
  "ÇALIŞMA BİÇİMİ:",
  "1. create_plan ile başla (ya da open_sample ile bir örneği taban al).",
  "2. Blokları ekle. Ölçü birimi SANTİMETREDİR ve varsayılanlar gerçektir",
  "   (koltuk 41 cm, koltuk aralığı 50 cm, sıra aralığı 90 cm) — bloğu",
  "   koltuk SAYISINDAN kurarsın, sonuç kendiliğinden gerçek ölçüde olur.",
  "   Kaynak görselden mesafe ÖLÇMENE GEREK YOK.",
  "3. Her adımdan sonra dönen özeti oku; plan_summary ile tam resmi al.",
  "4. Kural bulguları sana HEDEF DEĞER verir ('en az 90 cm gerekir').",
  "   Onlara göre düzelt, tekrar bak.",
  "5. Kat alanına YOL yaz (\"Maraton / Üst\") — bölüm ağacı böyle kurulur.",
  "6. Sonunda ne okuduğunu ve ne VARSAYDIĞINI ayrı ayrı raporla.",
  "",
  "Ürettiğin şey TASLAKTIR. Operatör editörde açıp onaylar, yayına sen",
  "göndermezsin.",
].join("\n");

export function createMcpServer() {
  const session = new Session();
  const server = new McpServer(
    { name: "seat-plan-editor", version: "0.1.0" },
    { instructions: INSTRUCTIONS },
  );
  registerTools(server, session);
  return { server, session };
}
