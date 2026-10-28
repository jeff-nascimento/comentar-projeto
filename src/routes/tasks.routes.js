import { Router } from "express";
import * as controller from "../controllers/tasks.controller.js";
import { authenticate } from "../middlewares/authenticate.js";
import { validate } from "../middlewares/validate.js";
import { idParam } from "../schemas/common.schema.js";
import { createTaskBody, updateTaskBody, listTasksQuery } from "../schemas/tasks.schema.js";

const router = Router();

// Qualquer usuário autenticado pode usar as tarefas; a regra "dono ou permission
// *:any" é aplicada dentro do service (depende da tarefa acessada).
router.use(authenticate);

router.get("/", validate({ query: listTasksQuery }), controller.list);
router.post("/", validate({ body: createTaskBody }), controller.create);
router.get("/:id", validate({ params: idParam }), controller.getById);
router.patch("/:id", validate({ params: idParam, body: updateTaskBody }), controller.update);
router.delete("/:id", validate({ params: idParam }), controller.remove);

export default router;
