import { AppError } from "../utils/AppError.js";
import { hasAnyRole, hasPermission } from "../services/authContext.service.js";

// AUTORIZAÇÃO: "o que você pode fazer?"
// Sempre vêm DEPOIS do authenticate (que preenche req.user).

// Libera se o usuário tiver QUALQUER uma das roles informadas.
export const requireRole = (...roles) => (req, res, next) => {
  if (!hasAnyRole(req.user, roles)) throw AppError.forbidden();
  next();
};

// Libera se o usuário tiver a permission (direta ou herdada de alguma role).
export const requirePermission = (permission) => (req, res, next) => {
  if (!hasPermission(req.user, permission)) throw AppError.forbidden();
  next();
};
