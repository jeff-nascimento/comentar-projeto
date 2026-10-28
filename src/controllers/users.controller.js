import * as usersService from "../services/users.service.js";
import * as rbacService from "../services/rbac.service.js";

// GET /users/me
export function me(req, res) {
  res.json({ data: req.user }); // req.user foi montado pelo middleware authenticate
}

// GET /users
export async function list(req, res) {
  const { data, meta } = await usersService.listUsers(req.validated.query);
  res.json({ data, meta });
}

// GET /users/:id
export async function getById(req, res) {
  res.json({ data: await usersService.getUserById(req.validated.params.id) });
}

// POST /users/:id/roles
export async function assignRole(req, res) {
  const user = await rbacService.assignRole(req.validated.params.id, req.validated.body.role);
  res.json({ data: user });
}

// DELETE /users/:id/roles/:role
export async function removeRole(req, res) {
  const { id, role } = req.validated.params;
  await rbacService.removeRole(req.user.id, id, role);
  res.status(204).end();
}

// POST /users/:id/permissions
export async function grantPermission(req, res) {
  const user = await rbacService.grantPermission(req.validated.params.id, req.validated.body.permission);
  res.json({ data: user });
}

// DELETE /users/:id/permissions/:permission
export async function revokePermission(req, res) {
  const { id, permission } = req.validated.params;
  await rbacService.revokePermission(id, permission);
  res.status(204).end();
}
