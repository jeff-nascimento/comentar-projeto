import {
  PERMISSIONS, PERMISSION_DESCRIPTIONS, ROLE_PERMISSIONS, ROLE_DESCRIPTIONS,
} from "../src/config/rbac.js";

// Cria (ou atualiza) permissions, roles e a ligação entre elas.
// É IDEMPOTENTE: pode rodar várias vezes sem duplicar nada (upsert =
// "atualiza se existir, cria se não existir").
// Recebe o client por parâmetro para servir ao seed E aos testes.
export async function seedRbac(client) {
  const permissionIds = {};
  for (const name of Object.values(PERMISSIONS)) {
    const permission = await client.permission.upsert({
      where: { name },
      update: { description: PERMISSION_DESCRIPTIONS[name] },
      create: { name, description: PERMISSION_DESCRIPTIONS[name] },
    });
    permissionIds[name] = permission.id;
  }

  for (const [roleName, permissionNames] of Object.entries(ROLE_PERMISSIONS)) {
    const role = await client.role.upsert({
      where: { name: roleName },
      update: { description: ROLE_DESCRIPTIONS[roleName] },
      create: { name: roleName, description: ROLE_DESCRIPTIONS[roleName] },
    });

    for (const permissionName of permissionNames) {
      await client.rolePermission.upsert({
        // "roleId_permissionId" é o nome que o Prisma dá à chave composta
        where: { roleId_permissionId: { roleId: role.id, permissionId: permissionIds[permissionName] } },
        update: {},
        create: { roleId: role.id, permissionId: permissionIds[permissionName] },
      });
    }
  }
}
