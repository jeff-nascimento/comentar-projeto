import * as tasksService from "../services/tasks.service.js";

// GET /tasks
export async function list(req, res) {
  const { data, meta } = await tasksService.listTasks(req.user, req.validated.query);
  res.json({ data, meta });
}

// GET /tasks/:id
export async function getById(req, res) {
  res.json({ data: await tasksService.getTask(req.user, req.validated.params.id) });
}

// POST /tasks
export async function create(req, res) {
  const task = await tasksService.createTask(req.user, req.validated.body);
  res.status(201).json({ data: task });
}

// PATCH /tasks/:id
export async function update(req, res) {
  const task = await tasksService.updateTask(req.user, req.validated.params.id, req.validated.body);
  res.json({ data: task });
}

// DELETE /tasks/:id
export async function remove(req, res) {
  await tasksService.deleteTask(req.user, req.validated.params.id);
  res.status(204).end();
}
