import bcrypt from "bcrypt";
import { prisma } from "../src/lib/prisma.js";
import { env } from "../src/config/env.js";
import { ROLES } from "../src/config/rbac.js";
import { seedRbac } from "./seed-rbac.js";

async function main() {
  await seedRbac(prisma);
  console.log("Roles e permissions criadas/atualizadas.");

  // Primeiro administrador (opcional): definido pelo .env
  const email = process.env.SEED_ADMIN_EMAIL?.toLowerCase();
  const password = process.env.SEED_ADMIN_PASSWORD;
  if (!email || !password) {
    console.log("SEED_ADMIN_EMAIL/SEED_ADMIN_PASSWORD não definidos: nenhum admin criado.");
    return;
  }

  const admin = await prisma.user.upsert({
    where: { email },
    update: {},
    create: {
      name: process.env.SEED_ADMIN_NAME ?? "Administrador",
      email,
      passwordHash: await bcrypt.hash(password, env.BCRYPT_ROUNDS),
    },
  });

  for (const roleName of [ROLES.ADMIN, ROLES.USER]) {
    const role = await prisma.role.findUniqueOrThrow({ where: { name: roleName } });
    await prisma.userRole.upsert({
      where: { userId_roleId: { userId: admin.id, roleId: role.id } },
      update: {},
      create: { userId: admin.id, roleId: role.id },
    });
  }
  console.log(`Admin pronto: ${email}`);
}

main()
  .catch((err) => {
    console.error(err);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
