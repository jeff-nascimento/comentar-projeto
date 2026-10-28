import { describe, it, expect } from "vitest";
import request from "supertest";
import { createApp } from "../src/app.js";

const app = createApp();
const ALLOWED = "http://localhost:5173";

describe("Helmet", () => {
  it("adiciona headers de segurança e remove X-Powered-By", async () => {
    const res = await request(app).get("/health");
    expect(res.headers["x-powered-by"]).toBeUndefined();
    expect(res.headers["x-content-type-options"]).toBe("nosniff");
    expect(res.headers["x-frame-options"]).toBe("SAMEORIGIN");
    expect(res.headers["strict-transport-security"]).toContain("max-age=");
    expect(res.headers["content-security-policy"]).toContain("default-src 'self'");
  });
});

describe("CORS", () => {
  it("origem permitida: devolve Allow-Origin igual à origem e Allow-Credentials", async () => {
    const res = await request(app).get("/health").set("Origin", ALLOWED);
    expect(res.headers["access-control-allow-origin"]).toBe(ALLOWED);
    expect(res.headers["access-control-allow-credentials"]).toBe("true");
    expect(res.headers["vary"]).toContain("Origin");
  });

  it("origem NÃO permitida: não devolve headers CORS (o navegador bloqueia)", async () => {
    const res = await request(app).get("/health").set("Origin", "http://evil.com");
    expect(res.headers["access-control-allow-origin"]).toBeUndefined();
  });

  it("preflight (OPTIONS) é respondido pelo middleware de CORS", async () => {
    const res = await request(app)
      .options("/auth/login")
      .set("Origin", ALLOWED)
      .set("Access-Control-Request-Method", "POST")
      .set("Access-Control-Request-Headers", "content-type,authorization");

    expect(res.status).toBe(204);
    expect(res.headers["access-control-allow-origin"]).toBe(ALLOWED);
    expect(res.headers["access-control-allow-methods"]).toContain("POST");
    expect(res.headers["access-control-allow-headers"]).toContain("Authorization");
    expect(res.headers["access-control-max-age"]).toBe("600");
  });
});

describe("tratamento de erros", () => {
  it("rota inexistente: 404 no formato padrão", async () => {
    const res = await request(app).get("/nada");
    expect(res.status).toBe(404);
    expect(res.body).toEqual({ error: { code: "NOT_FOUND", message: expect.any(String) } });
  });

  it("JSON malformado: 400", async () => {
    const res = await request(app).post("/auth/login").set("Content-Type", "application/json").send("{oops");
    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe("BAD_REQUEST");
  });

  it("corpo grande demais: 413", async () => {
    const res = await request(app).post("/auth/login").send({ email: "a@b.com", password: "x".repeat(20000) });
    expect(res.status).toBe(413);
  });

  it("sem corpo: 400 de validação (Express 5 deixa req.body undefined)", async () => {
    const res = await request(app).post("/auth/login");
    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe("VALIDATION_ERROR");
  });
});

describe("documentação", () => {
  it("serve o OpenAPI em /docs.json e a interface em /docs", async () => {
    const json = await request(app).get("/docs.json");
    expect(json.body.openapi).toMatch(/^3\./);
    expect(Object.keys(json.body.paths)).toContain("/auth/login");
    const ui = await request(app).get("/docs/");
    expect(ui.status).toBe(200);
    expect(ui.text).toContain("swagger-ui");
  });
});
