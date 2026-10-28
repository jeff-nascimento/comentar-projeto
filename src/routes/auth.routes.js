import { Router } from "express";
import * as controller from "../controllers/auth.controller.js";
import { validate } from "../middlewares/validate.js";
import { loginLimiter, registerLimiter, refreshLimiter } from "../middlewares/rateLimiters.js";
import { registerBody, loginBody } from "../schemas/auth.schema.js";

const router = Router();

// ordem em cada rota: rate limit -> validação -> controller
router.post("/register", registerLimiter, validate({ body: registerBody }), controller.register);
router.post("/login", loginLimiter, validate({ body: loginBody }), controller.login);
router.post("/refresh", refreshLimiter, controller.refresh); // o token vem do cookie, não do body
router.post("/logout", controller.logout);

export default router;
