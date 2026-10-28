import { z } from "zod";
import { paginationQuery } from "./common.schema.js";

const title = z.string().trim().min(1, "O título é obrigatório").max(150);
const description = z.string().trim().max(2000);

export const createTaskBody = z.object({
  title,
  description: description.optional(),
});

// PATCH = atualização parcial: todos os campos são opcionais, mas pelo menos
// um deve ser enviado.
export const updateTaskBody = z
  .object({
    title: title.optional(),
    description: description.nullable().optional(),
    completed: z.boolean().optional(),
  })
  .refine((body) => Object.keys(body).length > 0, "Envie ao menos um campo para atualizar");

export const listTasksQuery = paginationQuery.extend({
  // Atenção: z.coerce.boolean() transformaria o texto "false" em true!
  // Por isso aceitamos só "true"/"false" e convertemos manualmente.
  completed: z.enum(["true", "false"]).transform((v) => v === "true").optional(),
  scope: z.enum(["own", "all"]).default("own"),
});
