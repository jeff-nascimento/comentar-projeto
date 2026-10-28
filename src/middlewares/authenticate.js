import { AppError } from "../utils/AppError.js";
import { verifyAccessToken } from "../services/token.service.js";
import { getAuthContext } from "../services/authContext.service.js";

// AUTENTICAÇÃO: "quem é você?"
//
// Request -> lê "Authorization: Bearer <token>" -> verifica o JWT
//         -> busca o usuário (e suas roles/permissions) no banco
//         -> req.user -> next() -> controller
export async function authenticate(req, res, next) {
  const header = req.headers.authorization;

  if (!header?.startsWith("Bearer ")) {
    throw AppError.unauthorized("Token de acesso ausente");
  }
  const token = header.slice("Bearer ".length).trim();

  let payload;
  try {
    payload = verifyAccessToken(token); // lança erro se inválido ou expirado
  } catch {
    throw AppError.unauthorized("Token de acesso inválido ou expirado");
  }

  // O token só diz QUEM é (sub). Roles e permissions vêm do banco a cada
  // requisição: se algo mudar (ex.: o admin remover uma role), vale na hora.
  const user = await getAuthContext(payload.sub);
  if (!user) throw AppError.unauthorized("Usuário não existe mais");

  req.user = user; // { id, name, email, roles: [...], permissions: [...] }
  next();
}
