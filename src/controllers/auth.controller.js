import * as authService from "../services/auth.service.js";
import * as sessionService from "../services/session.service.js";
import { AppError } from "../utils/AppError.js";
import { REFRESH_COOKIE, setRefreshCookie, clearRefreshCookie } from "../utils/cookies.js";

// POST /auth/register
export async function register(req, res) {
  const user = await authService.register(req.validated.body);
  res.status(201).json({ data: user });
}

// POST /auth/login
export async function login(req, res) {
  const { user, accessToken, refreshToken } = await authService.login(req.validated.body);
  setRefreshCookie(res, refreshToken); // refresh token vai no cookie HTTPOnly...
  res.json({ data: { user, accessToken } }); // ...e o access token no corpo
}

// POST /auth/refresh
export async function refresh(req, res) {
  // req.cookies é preenchido pelo cookie-parser
  const token = req.cookies?.[REFRESH_COOKIE];
  if (!token) throw AppError.unauthorized("Refresh token ausente");

  try {
    const { accessToken, refreshToken } = await sessionService.refresh(token);
    setRefreshCookie(res, refreshToken); // cookie atualizado com o NOVO token
    res.json({ data: { accessToken } });
  } catch (err) {
    clearRefreshCookie(res); // falhou: o navegador deve parar de enviar este cookie
    throw err;
  }
}

// POST /auth/logout
export async function logout(req, res) {
  const token = req.cookies?.[REFRESH_COOKIE];
  if (token) await sessionService.logout(token);
  clearRefreshCookie(res);
  res.status(204).end();
}
