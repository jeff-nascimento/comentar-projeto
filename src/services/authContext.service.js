import { prisma } from "../lib/prisma.js";

// ---------------------------------------------------------------------------
// Contexto de autorização do usuário (usado pelo middleware authenticate)
// ---------------------------------------------------------------------------
// Uma única query traz o usuário, suas roles, as permissions de cada role e as
// permissions concedidas diretamente. Depois juntamos tudo em um conjunto.
export async function getAuthContext(userId) {
  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: {
      id: true, name: true, email: true, createdAt: true,
      roles: {
        select: {
          role: {
            select: {
              name: true,
              permissions: { select: { permission: { select: { name: true } } } },
            },
          },
        },
      },
      permissions: { select: { permission: { select: { name: true } } } },
    },
  });
  if (!user) return null;

  const viaRoles = user.roles.flatMap((ur) => ur.role.permissions.map((rp) => rp.permission.name));
  const direct = user.permissions.map((up) => up.permission.name);

  return {
    id: user.id,
    name: user.name,
    email: user.email,
    createdAt: user.createdAt,
    roles: user.roles.map((ur) => ur.role.name).sort(),
    permissions: [...new Set([...viaRoles, ...direct])].sort(), // sem duplicados
  };
}

export const hasPermission = (user, permission) => user.permissions.includes(permission);
export const hasAnyRole = (user, roles) => roles.some((role) => user.roles.includes(role));
