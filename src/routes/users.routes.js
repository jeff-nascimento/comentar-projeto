import { Router } from "express";
import * as controller from "../controllers/users.controller.js";
import { authenticate } from "../middlewares/authenticate.js";
import { requirePermission } from "../middlewares/authorize.js";
import { validate } from "../middlewares/validate.js";
import { PERMISSIONS } from "../config/rbac.js";
import { idParam, paginationQuery } from "../schemas/common.schema.js";
import {
  assignRoleBody, assignPermissionBody, userRoleParams, userPermissionParams,
} from "../schemas/rbac.schema.js";

const router = Router();

// Todas as rotas deste arquivo exigem usuário autenticado.
router.use(authenticate);

// "/me" precisa vir ANTES de "/:id", senão "me" seria interpretado como um id.
router.get("/me", controller.me);

router.get("/", requirePermission(PERMISSIONS.USERS_READ), validate({ query: paginationQuery }), controller.list);
router.get("/:id", requirePermission(PERMISSIONS.USERS_READ), validate({ params: idParam }), controller.getById);

router.post(
  "/:id/roles",
  requirePermission(PERMISSIONS.ROLES_ASSIGN),
  validate({ params: idParam, body: assignRoleBody }),
  controller.assignRole,
);
router.delete(
  "/:id/roles/:role",
  requirePermission(PERMISSIONS.ROLES_ASSIGN),
  validate({ params: userRoleParams }),
  controller.removeRole,
);

router.post(
  "/:id/permissions",
  requirePermission(PERMISSIONS.PERMISSIONS_ASSIGN),
  validate({ params: idParam, body: assignPermissionBody }),
  controller.grantPermission,
);
router.delete(
  "/:id/permissions/:permission",
  requirePermission(PERMISSIONS.PERMISSIONS_ASSIGN),
  validate({ params: userPermissionParams }),
  controller.revokePermission,
);

export default router;
