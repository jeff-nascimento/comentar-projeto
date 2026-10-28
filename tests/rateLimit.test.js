import { describe, it, expect, vi } from "vitest";
import request from "supertest";

// O arquivo tests/setup.js já carregou a configuração (limite alto). Para este
// teste precisamos de um limite BAIXO: limpamos o cache de módulos, trocamos a
// variável de ambiente e só então importamos o app de novo.
vi.resetModules();
vi.stubEnv("RATE_LIMIT_LOGIN_MAX", "3");
const { createApp } = await import("../src/app.js");
const app = createApp();

describe("rate limiting no login", () => {
  it("após 3 tentativas FALHAS, a 4ª recebe 429 no formato padrão", async () => {
    const attempt = () => request(app).post("/auth/login").send({ email: "a@example.com", password: "errada" });

    for (let i = 0; i < 3; i++) expect((await attempt()).status).toBe(401);

    const blocked = await attempt();
    expect(blocked.status).toBe(429);
    expect(blocked.body.error.code).toBe("TOO_MANY_REQUESTS");
    expect(blocked.headers["ratelimit"]).toBeDefined();
    expect(blocked.headers["ratelimit-policy"]).toBeDefined();
  });
});
