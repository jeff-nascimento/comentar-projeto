import { describe, it, expect } from "vitest";
import { toSeconds, toMilliseconds } from "../src/utils/duration.js";

describe("duration", () => {
  it("converte textos em segundos e milissegundos", () => {
    expect(toSeconds("30s")).toBe(30);
    expect(toSeconds("15m")).toBe(900);
    expect(toSeconds("2h")).toBe(7200);
    expect(toSeconds("7d")).toBe(604800);
    expect(toMilliseconds("1m")).toBe(60000);
  });

  it("rejeita formatos inválidos", () => {
    expect(() => toSeconds("7 dias")).toThrow();
    expect(() => toSeconds("abc")).toThrow();
  });
});
