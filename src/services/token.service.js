import jwt from "jsonwebtoken";
import { env } from "../config/env.js";
import { toSeconds } from "../utils/duration.js";

// Algoritmo da assinatura: HS256 (HMAC + SHA-256, uma chave secreta só).
// Sempre informamos o algoritmo ao verificar, para o servidor nunca aceitar
// um token que "escolheu" outro algoritmo no próprio header.
const ALGORITHM = "HS256";

// ---------------------------------------------------------------------------
// ACCESS TOKEN (curta duração, enviado no header Authorization)
// ---------------------------------------------------------------------------
// O payload fica VAZIO de propósito: só vão as claims padrão
//   sub (subject = id do usuário), iat (emitido em) e exp (expira em).
// Nada de e-mail, roles ou permissions: o payload é legível por qualquer um.
export function signAccessToken(userId) {
  return jwt.sign({}, env.ACCESS_TOKEN_SECRET, {
    algorithm: ALGORITHM,
    subject: userId,
    expiresIn: toSeconds(env.ACCESS_TOKEN_EXPIRES_IN),
  });
}

// Lança erro se a assinatura for inválida, o token estiver malformado ou expirado.
export function verifyAccessToken(token) {
  return jwt.verify(token, env.ACCESS_TOKEN_SECRET, { algorithms: [ALGORITHM] });
}
