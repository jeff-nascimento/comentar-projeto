import { Prisma } from "@prisma/client";
import { env } from "../config/env.js";
import { AppError } from "../utils/AppError.js";

// Rota inexistente: transforma em um AppError 404 e segue para o errorHandler.
export function notFound(req, res, next) {
  next(AppError.notFound(`Rota não encontrada: ${req.method} ${req.originalUrl}`));
}

// Converte QUALQUER erro em { statusCode, code, message, details }.
function normalize(err) {
  // 1) Erros que nós mesmos lançamos (esperados)
  if (err instanceof AppError) return err;

  // 2) JSON malformado ou grande demais (erros do express.json())
  if (err.type === "entity.parse.failed") {
    return AppError.badRequest("O corpo da requisição não é um JSON válido");
  }
  if (err.type === "entity.too.large") {
    return new AppError(413, "PAYLOAD_TOO_LARGE", "Corpo da requisição grande demais");
  }

  // 3) Erros conhecidos do Prisma
  if (err instanceof Prisma.PrismaClientKnownRequestError) {
    if (err.code === "P2002") return AppError.conflict("Já existe um registro com esses dados");
    if (err.code === "P2025") return AppError.notFound("Registro não encontrado");
  }

  // 4) Qualquer outra coisa é um erro INESPERADO (bug, banco fora do ar...)
  return null;
}

// Express reconhece middleware de erro pelos 4 parâmetros (err, req, res, next).
export function errorHandler(err, req, res, next) {
  if (res.headersSent) return next(err);

  const known = normalize(err);

  if (known) {
    return res.status(known.statusCode).json({
      error: { code: known.code, message: known.message, ...(known.details && { details: known.details }) },
    });
  }

  // Inesperado: o detalhe vai para o LOG do servidor; o cliente recebe só uma
  // mensagem genérica (stack trace e mensagens internas podem revelar segredos).
  if (!env.isTest) console.error(err);
  res.status(500).json({
    error: { code: "INTERNAL_ERROR", message: "Erro interno do servidor" },
  });
}
