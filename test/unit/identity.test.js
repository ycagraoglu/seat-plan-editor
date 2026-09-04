import { describe, it, expect } from "vitest";
import { formatId, DEF_TPL } from "../../src/core/identity.js";

describe("formatId — koltuk kimliği şablonu", () => {
  it("basit alan yerleştirme", () => {
    expect(formatId("{block}-{row}-{seat}", { block: "A", row: "5", seat: "12" })).toBe("A-5-12");
  });
  it(":N ile sıfır dolgulu genişlik", () => {
    expect(formatId("{block}-{seat:3}", { block: "A", seat: "7" })).toBe("A-007");
  });
  it("eksik alan boş string olur (kırılmaz)", () => {
    expect(formatId("{block}-{seat}", { block: "A" })).toBe("A-");
  });
  it("şablon verilmezse varsayılan DEF_TPL kullanılır", () => {
    expect(formatId(null, { block: "A", row: "1", seat: "1" })).toBe(formatId(DEF_TPL, { block: "A", row: "1", seat: "1" }));
    expect(formatId(undefined, { block: "A", row: "1", seat: "1" })).toBe("A-1-1");
  });
});
