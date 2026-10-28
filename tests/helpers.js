import request from "supertest";
import { prisma } from "../src/lib/prisma.js";
import { ROLES } from "../src/config/rbac.js";

export const PASSWORD = "Senha12345";
let counter = 0;

export const bearer = (token) => ({ Authorization: `Bearer ${token}` });

// Cadastra um usuário pela própria API (como um cliente real faria).
export async function registerUser(app, overrides = {}) {
  const body = {
    name: "Usuário Teste",
    email: `user${++counter}@example.com`,
    password: PASSWORD,
    ...overrides,
  };
  const res = await request(app).post("/auth/register").send(body).expect(201);
  return { ...res.body.data, password: body.password };
}

// Faz login e devolve o access token + o cookie do refresh token ("nome=valor").
export async function login(app, email, password = PASSWORD) {
  const res = await request(app).post("/auth/login").send({ email, password });
  return {
    res,
    accessToken: res.body.data?.accessToken,
    cookie: res.headers["set-cookie"]?.[0].split(";")[0],
  };
}

export async function makeAdmin(userId) {
  const role = await prisma.role.findUniqueOrThrow({ where: { name: ROLES.ADMIN } });
  await prisma.userRole.create({ data: { userId, roleId: role.id } });
}

// Atalho: cria usuário (opcionalmente admin) e já faz login.
export async function createLoggedUser(app, { admin = false, ...overrides } = {}) {
  const user = await registerUser(app, overrides);
  if (admin) await makeAdmin(user.id);
  const session = await login(app, user.email);
  return { user, ...session };
}
