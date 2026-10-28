import { beforeAll, beforeEach, afterAll } from "vitest";
import { prisma } from "../src/lib/prisma.js";
import { seedRbac } from "../prisma/seed-rbac.js";

// Roda em TODOS os arquivos de teste.
beforeAll(async () => {
  await seedRbac(prisma); // roles e permissions precisam existir
});

beforeEach(async () => {
  // Apaga usuários e, em cascata (ON DELETE CASCADE), tarefas, refresh tokens e
  // ligações de roles/permissions. As roles e permissions em si permanecem.
  await prisma.$executeRawUnsafe('TRUNCATE TABLE "users" CASCADE');
});

afterAll(async () => {
  await prisma.$disconnect();
});
