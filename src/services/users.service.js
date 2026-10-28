import { prisma } from "../lib/prisma.js";
import { AppError } from "../utils/AppError.js";
import { getAuthContext } from "./authContext.service.js";

export async function listUsers({ page, limit }) {
  // $transaction com um array executa as duas consultas juntas, de forma consistente.
  const [items, total] = await prisma.$transaction([
    prisma.user.findMany({
      skip: (page - 1) * limit, // pula os registros das páginas anteriores
      take: limit,              // quantos registros trazer
      orderBy: { createdAt: "desc" },
      select: {
        id: true, name: true, email: true, createdAt: true,
        roles: { select: { role: { select: { name: true } } } },
      },
    }),
    prisma.user.count(),
  ]);

  const data = items.map((u) => ({ ...u, roles: u.roles.map((r) => r.role.name).sort() }));
  return { data, meta: { page, limit, total, totalPages: Math.ceil(total / limit) } };
}

export async function getUserById(id) {
  const user = await getAuthContext(id);
  if (!user) throw AppError.notFound("Usuário não encontrado");
  return user;
}
