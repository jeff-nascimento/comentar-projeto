import { Router } from "express";
import * as controller from "../controllers/rbac.controller.js";
import { authenticate } from "../middlewares/authenticate.js";
import { requirePermission } from "../middlewares/authorize.js";
import { PERMISSIONS } from "../config/rbac.js";

export const rolesRouter = Router();
rolesRouter.get("/", authenticate, requirePermission(PERMISSIONS.ROLES_READ), controller.listRoles);

export const permissionsRouter = Router();
permissionsRouter.get("/", authenticate, requirePermission(PERMISSIONS.PERMISSIONS_READ), controller.listPermissions);
