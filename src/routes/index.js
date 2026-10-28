import { Router } from "express";
import authRoutes from "./auth.routes.js";
import usersRoutes from "./users.routes.js";
import tasksRoutes from "./tasks.routes.js";
import { rolesRouter, permissionsRouter } from "./rbac.routes.js";

const router = Router();

router.get("/health", (req, res) => res.json({ status: "ok" }));

router.use("/auth", authRoutes);
router.use("/users", usersRoutes);
router.use("/tasks", tasksRoutes);
router.use("/roles", rolesRouter);
router.use("/permissions", permissionsRouter);

export default router;
