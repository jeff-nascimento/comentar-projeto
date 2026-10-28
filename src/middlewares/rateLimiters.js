import { rateLimit } from "express-rate-limit";
import { env } from "../config/env.js";
import { AppError } from "../utils/AppError.js";

const MINUTE = 60 * 1000;

// Quando o limite estoura, em vez de responder direto, passamos um AppError
// ao middleware de erro: assim o 429 sai no MESMO formato dos outros erros.
const handler = (req, res, next) =>
  next(new AppError(429, "TOO_MANY_REQUESTS", "Muitas requisições. Tente novamente mais tarde."));

// Contadores ficam na MEMÓRIA do processo (suficiente para estudo e uma única
// instância). Com várias instâncias seria necessário um armazenamento
// compartilhado (ex.: Redis).
const create = (options) =>
  rateLimit({
    standardHeaders: "draft-8", // envia os headers RateLimit / RateLimit-Policy
    legacyHeaders: false,       // não envia os antigos X-RateLimit-*
    handler,
    ...options,
  });

// Rede de proteção para a API inteira (por IP).
export const globalLimiter = create({ windowMs: 15 * MINUTE, limit: env.RATE_LIMIT_GLOBAL_MAX });

// Login: protege contra força bruta. skipSuccessfulRequests = só tentativas
// que FALHAM contam; um usuário legítimo que acerta a senha não é punido.
export const loginLimiter = create({
  windowMs: 15 * MINUTE,
  limit: env.RATE_LIMIT_LOGIN_MAX,
  skipSuccessfulRequests: true,
});

// Cadastro: dificulta criação em massa de contas.
export const registerLimiter = create({ windowMs: 60 * MINUTE, limit: env.RATE_LIMIT_REGISTER_MAX });

// Refresh: um cliente normal renova poucas vezes; um limite evita abuso.
export const refreshLimiter = create({ windowMs: 15 * MINUTE, limit: env.RATE_LIMIT_REFRESH_MAX });
