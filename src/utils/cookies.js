import { env } from "../config/env.js";
import { toMilliseconds } from "./duration.js";

export const REFRESH_COOKIE = "refreshToken";

// Atributos do cookie do refresh token:
//  httpOnly -> JavaScript do navegador NÃO consegue ler (protege contra XSS)
//  secure   -> só trafega por HTTPS (ligado em produção; em dev usamos http)
//  sameSite -> "strict": o navegador só envia o cookie em requisições originadas
//              do próprio site (mitiga CSRF)
//  path     -> o navegador só envia o cookie para URLs que começam com /auth
const baseOptions = {
  httpOnly: true,
  secure: env.isProduction,
  sameSite: "strict",
  path: "/auth",
};

export function setRefreshCookie(res, token) {
  res.cookie(REFRESH_COOKIE, token, {
    ...baseOptions,
    maxAge: toMilliseconds(env.REFRESH_TOKEN_EXPIRES_IN), // duração em ms
  });
}

// Para apagar, os atributos (path, etc.) precisam ser os mesmos da criação.
export function clearRefreshCookie(res) {
  res.clearCookie(REFRESH_COOKIE, baseOptions);
}
