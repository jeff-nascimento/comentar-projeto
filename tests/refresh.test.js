import { describe, it, expect } from "vitest";
import request from "supertest";
import { createApp } from "../src/app.js";
import { prisma } from "../src/lib/prisma.js";
import { createLoggedUser, login, bearer } from "./helpers.js";

const app = createApp();

const refreshWith = (cookie) => {
  const req = request(app).post("/auth/refresh");
  return cookie ? req.set("Cookie", cookie) : req;
};
const cookieOf = (res) => res.headers["set-cookie"]?.[0].split(";")[0];

describe("POST /auth/refresh (rotação)", () => {
  it("401 sem cookie", async () => {
    const res = await refreshWith();
    expect(res.status).toBe(401);
  });

  it("401 com cookie inválido (e manda o navegador apagar o cookie)", async () => {
    const res = await refreshWith("refreshToken=lixo");
    expect(res.status).toBe(401);
    expect(res.headers["set-cookie"][0]).toMatch(/refreshToken=;/);
  });

  it("devolve novo access token e um refresh token DIFERENTE (rotação)", async () => {
    const { cookie: tokenA } = await createLoggedUser(app);
    const res = await refreshWith(tokenA);

    expect(res.status).toBe(200);
    expect(res.body.data.accessToken).toEqual(expect.any(String));

    const tokenB = cookieOf(res);
    expect(tokenB).toMatch(/^refreshToken=/);
    expect(tokenB).not.toBe(tokenA);
  });

  it("o access token novo funciona", async () => {
    const { cookie } = await createLoggedUser(app);
    const res = await refreshWith(cookie);
    const me = await request(app).get("/users/me").set(bearer(res.body.data.accessToken));
    expect(me.status).toBe(200);
  });

  it("marca o token antigo como revogado e cria o novo na MESMA família", async () => {
    const { user, cookie } = await createLoggedUser(app);
    await refreshWith(cookie);

    const rows = await prisma.refreshToken.findMany({ where: { userId: user.id }, orderBy: { createdAt: "asc" } });
    expect(rows).toHaveLength(2);
    expect(rows[0].revokedAt).not.toBeNull(); // o antigo (A)
    expect(rows[1].revokedAt).toBeNull();     // o novo (B)
    expect(rows[0].familyId).toBe(rows[1].familyId);
  });

  it("a cadeia de rotações segue funcionando (A -> B -> C)", async () => {
    const { cookie: a } = await createLoggedUser(app);
    const b = cookieOf(await refreshWith(a));
    const res = await refreshWith(b);
    expect(res.status).toBe(200);
  });
});

describe("REUSE DETECTION", () => {
  it("reusar um refresh token antigo dá 401 e derruba a sessão inteira", async () => {
    const { user, cookie: tokenA } = await createLoggedUser(app);

    // uso legítimo: A -> B
    const first = await refreshWith(tokenA);
    const tokenB = cookieOf(first);

    // alguém (ladrão ou cliente bugado) reapresenta o token A, que já foi usado
    const reuse = await refreshWith(tokenA);
    expect(reuse.status).toBe(401);

    // consequência: o token B (legítimo, ainda não usado) também foi invalidado
    const afterReuse = await refreshWith(tokenB);
    expect(afterReuse.status).toBe(401);

    // no banco, nenhum token da família ficou ativo
    const active = await prisma.refreshToken.count({ where: { userId: user.id, revokedAt: null } });
    expect(active).toBe(0);
  });

  it("o reuso numa sessão NÃO derruba as outras sessões (outro aparelho) do mesmo usuário", async () => {
    const { user, cookie: deviceA } = await createLoggedUser(app);
    const { cookie: deviceB } = await login(app, user.email);

    await refreshWith(deviceA);          // A -> A2
    await refreshWith(deviceA);          // reuso de A: derruba a família do aparelho A

    const res = await refreshWith(deviceB); // o aparelho B continua válido
    expect(res.status).toBe(200);
  });

  it("duas requisições SIMULTÂNEAS com o mesmo token: só uma vence, a sessão é encerrada", async () => {
    const { user, cookie } = await createLoggedUser(app);
    const [r1, r2] = await Promise.all([refreshWith(cookie), refreshWith(cookie)]);

    const statuses = [r1.status, r2.status].sort();
    expect(statuses).toEqual([200, 401]);

    const active = await prisma.refreshToken.count({ where: { userId: user.id, revokedAt: null } });
    expect(active).toBe(0); // a família foi revogada por precaução
  });
});

describe("POST /auth/logout", () => {
  it("revoga a sessão no banco, limpa o cookie e impede novo refresh", async () => {
    const { user, cookie } = await createLoggedUser(app);

    const res = await request(app).post("/auth/logout").set("Cookie", cookie);
    expect(res.status).toBe(204);
    expect(res.headers["set-cookie"][0]).toMatch(/refreshToken=;/);

    const active = await prisma.refreshToken.count({ where: { userId: user.id, revokedAt: null } });
    expect(active).toBe(0);

    // apagar o cookie no navegador não basta; o servidor também recusa o token
    const refresh = await refreshWith(cookie);
    expect(refresh.status).toBe(401);
  });

  it("é idempotente: 204 mesmo sem cookie", async () => {
    const res = await request(app).post("/auth/logout");
    expect(res.status).toBe(204);
  });
});
