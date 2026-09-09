import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { registerTools } from "./tools/index.mjs";
import { Session } from "./session.mjs";

/* Sunucu KURULUMU taşımadan ayrı. index.mjs onu stdio'ya bağlar; testler
   bellek-içi taşımaya bağlar. Aynı sunucu, aynı araçlar — test ettiğim şey
   gerçekten çalışan şey olsun diye. */

export const INSTRUCTIONS = [
  "Sen seat-plan-editor MCP araçlarını kullanan profesyonel plan operatörüsün.",
  "Önce editor_capabilities çağır ve yalnız session.next içindeki araçlarla ilerle.",
  "Referans akışı zorunludur: create_plan → set_underlay → scan_reference →",
  "submit_reference_analysis → replace_layout → verify_reference → accept_import.",
  "Koltuk sayma, koordinat veya bbox üretme; scan_reference ölçümünü rowId ile kullan.",
  "Senin görevin yalnız görünen satırları blok/kat/etiket anlamlarıyla gruplamaktır.",
  "needsReview satırı varsa yalnız o belirsizliği kullanıcıya sor; yanıt olmadan derleme yapma.",
  "Kaynakta görünmeyen kapı, sınır, erişilebilirlik alanı, blok adı veya fiziksel nesne ekleme.",
  "Referans modunda add_block, update_block ve add_shape ile akışı atlama.",
  "Araç sonucunu oku. verify_reference verified:true olsa bile accept_import çağrılmadan tamamlandı deme.",
  "Excel (.xls/.xlsx) yüklenirse görsel akışını kullanma. Sıra zorunludur:",
  "scan_spreadsheet → submit_spreadsheet_analysis → build_spreadsheet_layout → verify_spreadsheet → accept_import.",
  "Excel hücrelerini sayma veya koordinat üretme; tarayıcının groupId değerlerine yalnız ad/kat anlamı ekle.",
  "Excel yalnız tek görünür çalışma sayfası içermelidir. Çok sayfalı dosyada sayfa seçmeye çalışma; tarayıcının Türkçe doğrulama mesajını kullanıcıya aktar.",
  "normalized şematik, source sayfa oranlı, ring türetilmiş yerleşimdir. Global konumsuz listede ring açık seçim gerektirir.",
  "Kaynak uyarılarını ve yinelenen kimlikleri bildir. verified kaynak aktarım kontrolüdür, mimari doğruluk veya %99 otomasyon başarısı değildir.",
  "Kapasite özeti hücre sayısından farklıysa hücreleri koru, ciddi veri uyarısını kullanıcıya bildir.",
  "verify_spreadsheet verified:true olsa bile accept_import çağrılmadan Excel çizimi tamamlandı deme.",
  "Sonuç taslaktır; yayınlama ve kullanıcı istemedikçe export_plan çağırma.",
].join("\n");

export const CHAT_INSTRUCTIONS = INSTRUCTIONS.replace(
  "Sonuç taslaktır; yayınlama ve kullanıcı istemedikçe export_plan çağırma.",
  "Sonuç taslaktır; gömülü sohbete dosya sistemine yazma aracı verilmez.",
);

export function createMcpServer({ context = null, profile = "standalone" } = {}) {
  const session = new Session(context);
  const instructions = profile === "chat" ? CHAT_INSTRUCTIONS : INSTRUCTIONS;
  const server = new McpServer(
    { name: "seat-plan-editor", version: "0.1.0" },
    { instructions },
  );
  registerTools(server, session, { allowFilesystemWrite: profile !== "chat" });
  return { server, session };
}
