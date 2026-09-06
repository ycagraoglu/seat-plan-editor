#!/usr/bin/env node
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { createMcpServer } from "./server.mjs";

/* ══════════════════════════════════════════════════════════════════════════
   MCP SUNUCUSU — editörü LLM'e açar (stdio girişi)

   Blender'ın MCP eklentisiyle aynı fikir: uygulamanın kendi API'si araç
   olarak dışarı verilir, LLM onları çağırarak çizer. Blender'da o API
   `bpy`; bizde `src/core/**` ve `src/venues/builders.js` — A1/A3'te saf
   hâle getirildikleri için (React yok, DOM yok) doğrudan çağrılabiliyorlar.

   TASARIM KARARI — serbest kod çalıştırma YOK. Blender `execute_code`
   vermek zorunda çünkü alanı sonsuz; bizim alanımız sınırlı (blok türleri,
   numaralandırma, kapı, şekil) ve asıl değerli olan yüksek seviye kurgular
   (bowl · tier · solveBowlTiers · cutVomitories) zaten fonksiyon. Onları
   ARAÇ olarak açmak yeterli ifade gücünü veriyor ve rastgele kod
   çalıştırma riskini hiç doğurmuyor.

   YAYIM ARACI YOK. LLM plan kurar, doğrular, kaydeder; yayına göndermez.
   Bilet satılan bir sistemde o karar operatörde kalır.

   Kurulum: bkz. docs/MCP-KILAVUZU.md
   ══════════════════════════════════════════════════════════════════════════ */

const { server } = createMcpServer();
await server.connect(new StdioServerTransport());
