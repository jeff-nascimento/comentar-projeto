import { describe, it, expect } from "vitest";
import request from "supertest";
import bcrypt from "bcrypt";
import { createApp } from "../src/app.js";
import { prisma } from "../src/lib/prisma.js";
import { registerUser, login, PASSWORD } from "./helpers.js";

const app = createApp();

describe("POST /auth/register", () => {
  it("cria o usuário com a role USER e NÃO devolve a senha", async () => {
    const res = await request(app)
      .post("/auth/register")
      .send({ name: "Maria", email: "Maria@Example.com", password: PASSWORD });

    expect(res.status).toBe(201);
    expect(res.body.data).toMatchObject({ name: "Maria", email: "maria@example.com", roles: ["USER"] });
    expect(res.body.data.password).toBeUndefined();
    expect(res.body.data.passwordHash).toBeUndefined();
  });

  it("guarda um hash bcrypt, nunca a senha em texto puro", async () => {
    const user = await registerUser(app);
    const row = await prisma.user.findUnique({ where: { id: user.id } });

    expect(row.passwordHash).not.toBe(PASSWORD);
    expect(row.passwordHash).toMatch(/^\$2[aby]\$/); // formato do bcrypt
    expect(await bcrypt.compare(PASSWORD, row.passwordHash)).toBe(true);
  });

  it("responde 409 para e-mail já cadastrado", async () => {
    const user = await registerUser(app);
    const res = await request(app)
      .post("/auth/register")
      .send({ name: "Outra", email: user.email.toUpperCase(), password: PASSWORD });

    expect(res.status).toBe(409);
    expect(res.body.error.code).toBe("CONFLICT");
  });

  it("responde 400 com detalhes para dados inválidos", async () => {
    const res = await request(app)
      .post("/auth/register")
      .send({ name: "x", email: "nao-e-email", password: "123" });

    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe("VALIDATION_ERROR");
    const fields = res.body.error.details.map((d) => d.field);
    expect(fields).toEqual(expect.arrayContaining(["name", "email", "password"]));
  });

  it("ignora campos extras (ex.: tentar se cadastrar já com role)", async () => {
    const res = await request(app)
      .post("/auth/register")
      .send({ name: "Maria", email: "m@example.com", password: PASSWORD, roles: ["ADMIN"] });

    expect(res.status).toBe(201);
    expect(res.body.data.roles).toEqual(["USER"]);
  });
});

describe("POST /auth/login", () => {
  it("devolve o access token no corpo e o refresh token em cookie HTTPOnly", async () => {
    const user = await registerUser(app);
    const { res } = await login(app, user.email);

    expect(res.status).toBe(200);
    expect(res.body.data.accessToken).toEqual(expect.any(String));
    expect(res.body.data.user).toMatchObject({ id: user.id, email: user.email });

    const cookie = res.headers["set-cookie"][0];
    expect(cookie).toMatch(/^refreshToken=/);
    expect(cookie).toMatch(/HttpOnly/i);
    expect(cookie).toMatch(/SameSite=Strict/i);
    expect(cookie).toMatch(/Path=\/auth/);
    expect(cookie).toMatch(/Max-Age=604800/); // 7 dias em segundos
    // o refresh token NÃO vai no corpo da resposta
    expect(JSON.stringify(res.body)).not.toContain("refreshToken");
  });

  it("guarda no banco apenas o HASH do refresh token", async () => {
    const user = await registerUser(app);
    const { cookie } = await login(app, user.email);
    const token = cookie.split("=")[1];

    const rows = await prisma.refreshToken.findMany({ where: { userId: user.id } });
    expect(rows).toHaveLength(1);
    expect(rows[0].tokenHash).toMatch(/^[0-9a-f]{64}$/);
    expect(rows[0].tokenHash).not.toBe(token);
  });

  it("responde 401 com a MESMA mensagem para senha errada e e-mail inexistente", async () => {
    const user = await registerUser(app);
    const wrongPassword = await request(app).post("/auth/login").send({ email: user.email, password: "Errada123" });
    const unknownEmail = await request(app).post("/auth/login").send({ email: "ninguem@example.com", password: PASSWORD });

    expect(wrongPassword.status).toBe(401);
    expect(unknownEmail.status).toBe(401);
    expect(wrongPassword.body).toEqual(unknownEmail.body); // não revela se o e-mail existe
  });
});
