import { prisma } from "../lib/prisma.js";
import { AppError } from "../utils/AppError.js";
import { ROLES } from "../config/rbac.js";
import { getAuthContext } from "./authContext.service.js";

// ---------------------------------------------------------------------------
// Consultas
// ---------------------------------------------------------------------------
export async function listRoles() {
  const roles = await prisma.role.findMany({
    orderBy: { name: "asc" },
    include: { permissions: { include: { permission: true } } },
  });
  return roles.map((r) => ({
    id: r.id,
    name: r.name,
    description: r.description,
    permissions: r.permissions.map((rp) => rp.permission.name).sort(),
  }));
}

export function listPermissions() {
  return prisma.permission.findMany({
    orderBy: { name: "asc" },
    select: { id: true, name: true, description: true },
  });
}

// ---------------------------------------------------------------------------
// Atribuição de roles e permissions
// ---------------------------------------------------------------------------
async function findUserOrThrow(id) {
  const user = await prisma.user.findUnique({ where: { id }, select: { id: true } });
  if (!user) throw AppError.notFound("Usuário não encontrado");
}
async function findRoleOrThrow(name) {
  const role = await prisma.role.findUnique({ where: { name } });
  if (!role) throw AppError.notFound(`Role "${name}" não encontrada`);
  return role;
}
async function findPermissionOrThrow(name) {
  const permission = await prisma.permission.findUnique({ where: { name } });
  if (!permission) throw AppError.notFound(`Permission "${name}" não encontrada`);
  return permission;
}

export async function assignRole(userId, roleName) {
  await findUserOrThrow(userId);
  const role = await findRoleOrThrow(roleName);
  await prisma.userRole.upsert({
    where: { userId_roleId: { userId, roleId: role.id } }, // chave composta
    update: {},
    create: { userId, roleId: role.id },
  });
  return getAuthContext(userId);
}

export async function removeRole(actorId, userId, roleName) {
  // Regra de negócio: evita que o admin se "tranque para fora" do sistema.
  if (actorId === userId && roleName === ROLES.ADMIN) {
    throw AppError.conflict("Você não pode remover o seu próprio papel de ADMIN");
  }
  await findUserOrThrow(userId);
  const role = await findRoleOrThrow(roleName);
  await prisma.userRole.deleteMany({ where: { userId, roleId: role.id } });
}

export async function grantPermission(userId, permissionName) {
  await findUserOrThrow(userId);
  const permission = await findPermissionOrThrow(permissionName);
  await prisma.userPermission.upsert({
    where: { userId_permissionId: { userId, permissionId: permission.id } },
    update: {},
    create: { userId, permissionId: permission.id },
  });
  return getAuthContext(userId);
}

export async function revokePermission(userId, permissionName) {
  await findUserOrThrow(userId);
  const permission = await findPermissionOrThrow(permissionName);
  await prisma.userPermission.deleteMany({ where: { userId, permissionId: permission.id } });
}
