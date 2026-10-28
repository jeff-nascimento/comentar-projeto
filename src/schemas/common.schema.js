import { z } from "zod";

// Parâmetro de rota :id (precisa ser um UUID)
export const idParam = z.object({ id: z.uuid() });

// Query string ?page=2&limit=20  (chega como TEXTO; coerce converte para número)
export const paginationQuery = z.object({
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(100).default(20),
});
