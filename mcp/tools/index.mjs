import { z } from "zod";
import { registerPlanTools } from "./plan.mjs";
import { registerBlockTools } from "./blocks.mjs";
import { registerVenueTools } from "./venue.mjs";
import { registerRenderTools } from "./render.mjs";

/* Araç kaydı tek yerden. Konu başına bir dosya; yeni faz yeni dosya ekler,
   burası sadece toplar. */
export function registerTools(server, session) {
  server.registerTool("ping", {
    title: "Bağlantı denetimi",
    description: "Sunucu ayakta mı, hangi sürüm — bağlantıyı doğrulamak için.",
    inputSchema: {},
  }, async () => ({
    content: [{ type: "text", text: "seat-plan-editor MCP 0.1.0 · hazır" }],
  }));

  registerPlanTools(server, session, z);
  registerBlockTools(server, session, z);
  registerVenueTools(server, session, z);
  registerRenderTools(server, session, z);
}
