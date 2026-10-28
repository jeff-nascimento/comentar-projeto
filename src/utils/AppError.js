// Erro "esperado": algo que o cliente pode ter causado (dados inválidos,
// não autenticado, não encontrado...). Carrega o status HTTP e um código
// estável (code) que o front-end pode usar sem depender do texto da mensagem.
export class AppError extends Error {
  constructor(statusCode, code, message, details) {
    super(message);
    this.name = "AppError";
    this.statusCode = statusCode;
    this.code = code;
    this.details = details; // opcional: lista de problemas (ex.: validação)
  }

  static badRequest(message = "Requisição inválida", details) {
    return new AppError(400, "BAD_REQUEST", message, details);
  }
  static validation(details) {
    return new AppError(400, "VALIDATION_ERROR", "Dados inválidos", details);
  }
  static unauthorized(message = "Não autenticado") {
    return new AppError(401, "UNAUTHORIZED", message);
  }
  static forbidden(message = "Você não tem permissão para esta ação") {
    return new AppError(403, "FORBIDDEN", message);
  }
  static notFound(message = "Recurso não encontrado") {
    return new AppError(404, "NOT_FOUND", message);
  }
  static conflict(message = "Conflito com o estado atual do recurso") {
    return new AppError(409, "CONFLICT", message);
  }
}
