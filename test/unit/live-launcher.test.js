import { readFile } from "node:fs/promises";
import { describe, expect, it } from "vitest";

describe("yerel live başlatıcısı", () => {
  it("auth bypass'ı yalnız sunucu child'ına açıkça verir", async () => {
    const source = await readFile(new URL("../../scripts/live.mjs", import.meta.url), "utf8");
    const server = source.match(/baslat\("sunucu"[\s\S]*?\n\}\);/)?.[0] || "";
    const editor = source.match(/baslat\("editör"[^\n]+/)?.[0] || "";

    expect(server).toContain('SEAT_EDITOR_AUTH_DEV_BYPASS: "1"');
    expect(editor).not.toContain("SEAT_EDITOR_AUTH_DEV_BYPASS");
  });
});
