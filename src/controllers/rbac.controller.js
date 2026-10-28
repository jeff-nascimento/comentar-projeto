import * as rbacService from "../services/rbac.service.js";

// GET /roles
export async function listRoles(req, res) {
  res.json({ data: await rbacService.listRoles() });
}

// GET /permissions
export async function listPermissions(req, res) {
  res.json({ data: await rbacService.listPermissions() });
}
