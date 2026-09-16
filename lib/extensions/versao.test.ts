import { describe, expect, it } from "vitest";

import { compararVersoes } from "./versao";

describe("compararVersoes", () => {
  it("compara numericamente cada parte, não como texto", () => {
    expect(compararVersoes("1.10.0", "1.9.0")).toBeGreaterThan(0);
    expect(compararVersoes("1.0.0", "1.1.0")).toBeLessThan(0);
    expect(compararVersoes("2.0.0", "10.0.0")).toBeLessThan(0);
    expect(compararVersoes("1.2.3", "1.2.3")).toBe(0);
    expect(compararVersoes("1.2.10", "1.2.9")).toBeGreaterThan(0);
  });
});
