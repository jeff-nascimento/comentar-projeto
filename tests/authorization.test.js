import { describe, it, expect } from "vitest";
import request from "supertest";
import { createApp } from "../src/app.js";
import { prisma } from "../src/lib/prisma.js";
import { createLoggedUser, bearer } from "./helpers.js";

const app = createApp();

async function createTask(token, title = "Minha tarefa") {
  const res = await request(app).post("/tasks").set(bearer(token)).send({ title });
  expect(res.status).toBe(201);
  return res.body.data;
}

describe("tarefas: usuário comum (regra do DONO)", () => {
  it("cria, lista, lê, atualiza e exclui as PRÓPRIAS tarefas", async () => {
    const { user, accessToken } = await createLoggedUser(app);
    const task = await createTask(accessToken);
    expect(task.userId).toBe(user.id);
    expect(task.completed).toBe(false);

    const list = await request(app).get("/tasks").set(bearer(accessToken));
    expect(list.body.data).toHaveLength(1);
    expect(list.body.meta).toMatchObject({ page: 1, limit: 20, total: 1 });

    const get = await request(app).get(`/tasks/${task.id}`).set(bearer(accessToken));
    expect(get.status).toBe(200);

    const patch = await request(app).patch(`/tasks/${task.id}`).set(bearer(accessToken)).send({ completed: true });
    expect(patch.status).toBe(200);
    expect(patch.body.data.completed).toBe(true);

    const del = await request(app).delete(`/tasks/${task.id}`).set(bearer(accessToken));
    expect(del.status).toBe(204);
  });

  it("não consegue definir outro dono ao criar (userId do body é ignorado)", async () => {
    const owner = await createLoggedUser(app);
    const other = await createLoggedUser(app);
    const res = await request(app).post("/tasks").set(bearer(owner.accessToken)).send({ title: "x", userId: other.user.id });
    expect(res.body.data.userId).toBe(owner.user.id);
  });

  it("NÃO enxerga nem altera tarefas de outro usuário (404)", async () => {
    const owner = await createLoggedUser(app);
    const intruder = await createLoggedUser(app);
    const task = await createTask(owner.accessToken);

    const get = await request(app).get(`/tasks/${task.id}`).set(bearer(intruder.accessToken));
    const patch = await request(app).patch(`/tasks/${task.id}`).set(bearer(intruder.accessToken)).send({ title: "hack" });
    const del = await request(app).delete(`/tasks/${task.id}`).set(bearer(intruder.accessToken));
    expect([get.status, patch.status, del.status]).toEqual([404, 404, 404]);

    const still = await prisma.task.findUnique({ where: { id: task.id } });
    expect(still.title).toBe("Minha tarefa");
  });

  it("a listagem mostra só as tarefas do próprio usuário", async () => {
    const a = await createLoggedUser(app);
    const b = await createLoggedUser(app);
    await createTask(a.accessToken, "A1");
    await createTask(b.accessToken, "B1");
    const res = await request(app).get("/tasks").set(bearer(a.accessToken));
    expect(res.body.data.map((t) => t.title)).toEqual(["A1"]);
  });

  it("scope=all é proibido (403) para usuário comum", async () => {
    const { accessToken } = await createLoggedUser(app);
    const res = await request(app).get("/tasks?scope=all").set(bearer(accessToken));
    expect(res.status).toBe(403);
    expect(res.body.error.code).toBe("FORBIDDEN");
  });

  it("valida o id (UUID), a paginação e o PATCH vazio", async () => {
    const { accessToken } = await createLoggedUser(app);
    const task = await createTask(accessToken);
    const badId = await request(app).get("/tasks/123").set(bearer(accessToken));
    const badPage = await request(app).get("/tasks?limit=1000").set(bearer(accessToken));
    const empty = await request(app).patch(`/tasks/${task.id}`).set(bearer(accessToken)).send({});
    expect([badId.status, badPage.status, empty.status]).toEqual([400, 400, 400]);
  });
});

describe("tarefas: ADMIN (permissions *:any via role)", () => {
  it("lê, atualiza e exclui tarefas de qualquer usuário", async () => {
    const admin = await createLoggedUser(app, { admin: true });
    const user = await createLoggedUser(app);
    const task = await createTask(user.accessToken);

    const get = await request(app).get(`/tasks/${task.id}`).set(bearer(admin.accessToken));
    const patch = await request(app).patch(`/tasks/${task.id}`).set(bearer(admin.accessToken)).send({ completed: true });
    const all = await request(app).get("/tasks?scope=all").set(bearer(admin.accessToken));
    const del = await request(app).delete(`/tasks/${task.id}`).set(bearer(admin.accessToken));

    expect(get.status).toBe(200);
    expect(patch.status).toBe(200);
    expect(all.status).toBe(200);
    expect(all.body.data[0].user).toMatchObject({ id: user.user.id });
    expect(del.status).toBe(204);
  });
});

describe("roles e permissions", () => {
  it("usuário comum recebe 403 em /roles, /permissions e /users", async () => {
    const { accessToken } = await createLoggedUser(app);
    for (const url of ["/roles", "/permissions", "/users"]) {
      const res = await request(app).get(url).set(bearer(accessToken));
      expect(res.status, url).toBe(403);
    }
  });

  it("ADMIN lista roles (com suas permissions), permissions e usuários", async () => {
    const { accessToken } = await createLoggedUser(app, { admin: true });
    const roles = await request(app).get("/roles").set(bearer(accessToken));
    const admin = roles.body.data.find((r) => r.name === "ADMIN");
    const userRole = roles.body.data.find((r) => r.name === "USER");
    expect(admin.permissions).toContain("tasks:read:any");
    expect(userRole.permissions).toEqual([]);

    expect((await request(app).get("/permissions").set(bearer(accessToken))).body.data.length).toBeGreaterThan(5);
    expect((await request(app).get("/users").set(bearer(accessToken))).body.meta.total).toBe(1);
  });

  it("promover um usuário a ADMIN vale NA HORA (sem novo login)", async () => {
    const admin = await createLoggedUser(app, { admin: true });
    const user = await createLoggedUser(app);

    expect((await request(app).get("/roles").set(bearer(user.accessToken))).status).toBe(403);

    const assign = await request(app).post(`/users/${user.user.id}/roles`).set(bearer(admin.accessToken)).send({ role: "admin" });
    expect(assign.status).toBe(200);
    expect(assign.body.data.roles).toEqual(["ADMIN", "USER"]);

    // MESMO access token de antes: agora funciona, porque roles vêm do banco
    expect((await request(app).get("/roles").set(bearer(user.accessToken))).status).toBe(200);
  });

  it("permission concedida DIRETAMENTE ao usuário (sem role) libera a ação", async () => {
    const admin = await createLoggedUser(app, { admin: true });
    const owner = await createLoggedUser(app);
    const reader = await createLoggedUser(app);
    const task = await createTask(owner.accessToken);

    expect((await request(app).get(`/tasks/${task.id}`).set(bearer(reader.accessToken))).status).toBe(404);

    await request(app).post(`/users/${reader.user.id}/permissions`).set(bearer(admin.accessToken)).send({ permission: "tasks:read:any" }).expect(200);
    expect((await request(app).get(`/tasks/${task.id}`).set(bearer(reader.accessToken))).status).toBe(200);
    // mas só LEITURA: continua sem poder alterar
    expect((await request(app).patch(`/tasks/${task.id}`).set(bearer(reader.accessToken)).send({ title: "x" })).status).toBe(404);

    await request(app).delete(`/users/${reader.user.id}/permissions/tasks:read:any`).set(bearer(admin.accessToken)).expect(204);
    expect((await request(app).get(`/tasks/${task.id}`).set(bearer(reader.accessToken))).status).toBe(404);
  });

  it("remove uma role e protege contra o admin remover o próprio ADMIN", async () => {
    const admin = await createLoggedUser(app, { admin: true });
    const other = await createLoggedUser(app, { admin: true });

    const self = await request(app).delete(`/users/${admin.user.id}/roles/ADMIN`).set(bearer(admin.accessToken));
    expect(self.status).toBe(409);

    const removeOther = await request(app).delete(`/users/${other.user.id}/roles/ADMIN`).set(bearer(admin.accessToken));
    expect(removeOther.status).toBe(204);
    expect((await request(app).get("/roles").set(bearer(other.accessToken))).status).toBe(403);
  });

  it("404 para role/permission/usuário inexistentes", async () => {
    const admin = await createLoggedUser(app, { admin: true });
    const user = await createLoggedUser(app);
    const noRole = await request(app).post(`/users/${user.user.id}/roles`).set(bearer(admin.accessToken)).send({ role: "CHEFE" });
    const noPerm = await request(app).post(`/users/${user.user.id}/permissions`).set(bearer(admin.accessToken)).send({ permission: "x:y" });
    const noUser = await request(app).post(`/users/${crypto.randomUUID()}/roles`).set(bearer(admin.accessToken)).send({ role: "ADMIN" });
    expect([noRole.status, noPerm.status, noUser.status]).toEqual([404, 404, 404]);
  });
});
