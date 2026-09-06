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
  "PLAN KOLTUK BLOKLARINDAN İBARET DEĞİLDİR. Bir seyirci bu çizime bakıp",
  "'ben neredeyim, sahne ne yönde, hangi kapıdan gireceğim' sorularını",
  "cevaplayabilmeli. add_shape ile şunları da koy:",
  "· REFERANS — bu ZORUNLU. Editördeki on örnek mekânın ONUNDA da var:",
  "  tiyatro/konser stage, sinema screen, stadyum pitch. Referanssız bir",
  "  plana bakan seyirci hangi yöne baktığını bilemez.",
  "· KAPILAR — giriş/çıkışlar (type:\"door\"). On örneğin ONUNDA da var",
  "  (2 ile 96 arası). Kaç kapı olduğunu bilmiyorsan makul bir sayı VARSAY",
  "  ve varsaydığını raporunda yaz — kapısız plan eksiktir.",
  "  (Kapıyı bloklara BAĞLAMAK zorunda değilsin; bu yalnız stadyumda,",
  "  seyirciyi tribün kapısına yönlendirmek gerektiğinde anlamlıdır.)",
  "· DIŞ HAT — salon sınırı (type:\"wall\", dolgu yok; düzensiz salonda",
  "  points ile çokgen). Kapalı salonda koltukların boşlukta yüzmemesi",
  "  için güçlü tavsiye; ZORUNLU DEĞİL — örneklerin yarısında yok, açık",
  "  hava ve stadyumda sahanın kendisi sınırı anlatıyor.",
  "",
  "BİTTİ DEMEDEN ÖNCE validate çağır. Açık 'err' bulgu varken işi bitmiş",
  "sayma: ya düzelt, ya da neden düzeltmediğini raporunda AÇIKÇA yaz.",
  "Operatör senin sustuğun eksiği ekranda görüyor.",
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
