// Fonte ÚNICA da verdade sobre roles e permissions do sistema.
// Usada pelo seed (que grava no banco), pelas rotas (que exigem permissions)
// e pelos testes. Assim evitamos "strings mágicas" espalhadas pelo código.

export const ROLES = {
  ADMIN: "ADMIN",
  USER: "USER",
};

export const PERMISSIONS = {
  TASKS_READ_ANY: "tasks:read:any",
  TASKS_WRITE_ANY: "tasks:write:any",
  TASKS_DELETE_ANY: "tasks:delete:any",
  USERS_READ: "users:read",
  ROLES_READ: "roles:read",
  ROLES_ASSIGN: "roles:assign",
  PERMISSIONS_READ: "permissions:read",
  PERMISSIONS_ASSIGN: "permissions:assign",
};

export const PERMISSION_DESCRIPTIONS = {
  [PERMISSIONS.TASKS_READ_ANY]: "Ver tarefas de qualquer usuário",
  [PERMISSIONS.TASKS_WRITE_ANY]: "Criar/editar tarefas de qualquer usuário",
  [PERMISSIONS.TASKS_DELETE_ANY]: "Excluir tarefas de qualquer usuário",
  [PERMISSIONS.USERS_READ]: "Listar e consultar usuários",
  [PERMISSIONS.ROLES_READ]: "Listar roles",
  [PERMISSIONS.ROLES_ASSIGN]: "Atribuir/remover roles de usuários",
  [PERMISSIONS.PERMISSIONS_READ]: "Listar permissions",
  [PERMISSIONS.PERMISSIONS_ASSIGN]: "Conceder/remover permissions diretas de usuários",
};

// Quais permissions cada role recebe. USER não tem nenhuma permission especial:
// a regra "usuário comum mexe nas PRÓPRIAS tarefas" é de PROPRIEDADE (ownership),
// não de permission (veja tasks.service.js).
export const ROLE_PERMISSIONS = {
  [ROLES.ADMIN]: Object.values(PERMISSIONS),
  [ROLES.USER]: [],
};

export const ROLE_DESCRIPTIONS = {
  [ROLES.ADMIN]: "Administrador do sistema",
  [ROLES.USER]: "Usuário comum",
};
