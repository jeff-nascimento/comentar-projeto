import { prisma } from "../lib/prisma.js";
import { AppError } from "../utils/AppError.js";
import { PERMISSIONS } from "../config/rbac.js";
import { hasPermission } from "./authContext.service.js";

// ---------------------------------------------------------------------------
// REGRA DE AUTORIZAÇÃO DAS TAREFAS
//   - O DONO da tarefa sempre pode ler/alterar/excluir.
//   - Quem NÃO é o dono precisa da permission "*:any" correspondente
//     (o ADMIN a recebe através da role).
//   - Se não puder, respondemos 404 (e não 403): para esse usuário a tarefa
//     "não existe", então não revelamos se o id pertence a outra pessoa.
// ---------------------------------------------------------------------------
async function findTaskForUser(user, taskId, permissionForOthers) {
  const task = await prisma.task.findUnique({ where: { id: taskId } });
  if (!task) throw AppError.notFound("Tarefa não encontrada");

  const isOwner = task.userId === user.id;
  if (!isOwner && !hasPermission(user, permissionForOthers)) {
    throw AppError.notFound("Tarefa não encontrada");
  }
  return task;
}

export async function listTasks(user, { page, limit, completed, scope }) {
  if (scope === "all" && !hasPermission(user, PERMISSIONS.TASKS_READ_ANY)) {
    throw AppError.forbidden("Você não tem permissão para listar tarefas de todos os usuários");
  }

  // where dinâmico: só inclui os filtros que foram informados
  const where = {
    ...(scope === "own" && { userId: user.id }),
    ...(completed !== undefined && { completed }),
  };

  const [items, total] = await prisma.$transaction([
    prisma.task.findMany({
      where,
      skip: (page - 1) * limit,
      take: limit,
      orderBy: { createdAt: "desc" },
      // no escopo "all" mostramos quem é o dono de cada tarefa
      ...(scope === "all" && { include: { user: { select: { id: true, name: true, email: true } } } }),
    }),
    prisma.task.count({ where }),
  ]);

  return { data: items, meta: { page, limit, total, totalPages: Math.ceil(total / limit) } };
}

export function getTask(user, taskId) {
  return findTaskForUser(user, taskId, PERMISSIONS.TASKS_READ_ANY);
}

export function createTask(user, { title, description }) {
  // O dono é SEMPRE o usuário autenticado. Mesmo que o cliente envie "userId"
  // no body, o schema Zod descarta campos desconhecidos (evita "mass assignment").
  return prisma.task.create({ data: { title, description, userId: user.id } });
}

export async function updateTask(user, taskId, changes) {
  await findTaskForUser(user, taskId, PERMISSIONS.TASKS_WRITE_ANY);
  return prisma.task.update({ where: { id: taskId }, data: changes });
}

export async function deleteTask(user, taskId) {
  await findTaskForUser(user, taskId, PERMISSIONS.TASKS_DELETE_ANY);
  await prisma.task.delete({ where: { id: taskId } });
}
