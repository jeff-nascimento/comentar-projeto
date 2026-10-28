import { describe, it, expect } from "vitest";
import request from "supertest";
import jwt from "jsonwebtoken";
import { createApp } from "../src/app.js";
import { createLoggedUser, bearer } from "./helpers.js";

const app = createApp();

describe("rota protegida (GET /users/me)", () => {
  it("401 sem token", async () => {
    const res = await request(app).get("/users/me");
    expect(res.status).toBe(401);
    expect(res.body.error.code).toBe("UNAUTHORIZED");
  });

  it("401 com o header em formato errado (sem 'Bearer ')", async () => {
    const { accessToken } = await createLoggedUser(app);
    const res = await request(app).get("/users/me").set("Authorization", accessToken);
    expect(res.status).toBe(401);
  });

  it("401 com token adulterado", async () => {
    const { accessToken } = await createLoggedUser(app);
    const res = await request(app).get("/users/me").set(bearer(accessToken + "x"));
    expect(res.status).toBe(401);
  });

  it("401 com token expirado", async () => {
    const { user } = await createLoggedUser(app);
    const expired = jwt.sign({}, process.env.ACCESS_TOKEN_SECRET, { subject: user.id, expiresIn: -10 });
    const res = await request(app).get("/users/me").set(bearer(expired));
    expect(res.status).toBe(401);
  });

  it("401 se o token foi assinado com OUTRA chave (ex.: a do refresh token)", async () => {
    const { user } = await createLoggedUser(app);
    const forged = jwt.sign({}, process.env.REFRESH_TOKEN_SECRET, { subject: user.id, expiresIn: 60 });
    const res = await request(app).get("/users/me").set(bearer(forged));
    expect(res.status).toBe(401);
  });

  it("200 com token válido, e o payload do JWT não contém dados sensíveis", async () => {
    const { user, accessToken } = await createLoggedUser(app);
    const res = await request(app).get("/users/me").set(bearer(accessToken));

    expect(res.status).toBe(200);
    expect(res.body.data).toMatchObject({ id: user.id, email: user.email, roles: ["USER"] });

    const payload = jwt.decode(accessToken);
    expect(Object.keys(payload).sort()).toEqual(["exp", "iat", "sub"]);
  });
});
