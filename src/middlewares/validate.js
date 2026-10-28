import { z } from "zod";
import { AppError } from "../utils/AppError.js";

// Mensagens de erro do Zod em português do Brasil (vale para toda a aplicação).
z.config(z.locales.ptBR());

// Uso: validate({ params: schema, query: schema, body: schema })
//
// Para cada parte da requisição que tiver schema:
//   - valida; se falhar, junta TODOS os problemas e responde 400;
//   - se passar, guarda os dados JÁ VALIDADOS/CONVERTIDOS em req.validated.
//
// Por que não sobrescrever req.query? No Express 5, req.query é somente leitura.
// Por isso o controller sempre lê de req.validated, nunca de req.body/query direto.
export function validate(schemas) {
  return (req, res, next) => {
    const validated = {};
    const details = [];

    for (const part of ["params", "query", "body"]) {
      if (!schemas[part]) continue;

      const result = schemas[part].safeParse(req[part]);
      if (result.success) {
        validated[part] = result.data;
      } else {
        for (const issue of result.error.issues) {
          details.push({ in: part, field: issue.path.join("."), message: issue.message });
        }
      }
    }

    if (details.length > 0) throw AppError.validation(details);

    req.validated = validated;
    next();
  };
}
