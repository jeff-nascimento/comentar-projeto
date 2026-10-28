import { config } from "dotenv";
import { z } from "zod";

// 1) Carrega o arquivo .env (ou .env.test quando NODE_ENV=test) para process.env.
//    `quiet: true` evita que o dotenv imprima mensagens no console.
config({ path: process.env.NODE_ENV === "test" ? ".env.test" : ".env", quiet: true });

// Duração no formato "15m", "7d" etc. (usada nos tempos de expiração).
const duration = z.string().regex(/^\d+[smhd]$/, "use o formato número + s|m|h|d (ex.: 15m, 7d)");

// 2) Descreve COMO deve ser cada variável. Tudo que vem de process.env é texto,
//    então usamos z.coerce.number() onde precisamos de número.
const envSchema = z
  .object({
    NODE_ENV: z.enum(["development", "test", "production"]).default("development"),
    PORT: z.coerce.number().int().positive().default(3000),
    DATABASE_URL: z.string().min(1, "obrigatória"),
    ACCESS_TOKEN_SECRET: z.string().min(32, "use pelo menos 32 caracteres"),
    REFRESH_TOKEN_SECRET: z.string().min(32, "use pelo menos 32 caracteres"),
    ACCESS_TOKEN_EXPIRES_IN: duration.default("15m"),
    REFRESH_TOKEN_EXPIRES_IN: duration.default("7d"),
    FRONTEND_URL: z.string().default("http://localhost:5173"),
    BCRYPT_ROUNDS: z.coerce.number().int().min(4).max(15).default(12),
    RATE_LIMIT_GLOBAL_MAX: z.coerce.number().int().positive().default(300),
    RATE_LIMIT_LOGIN_MAX: z.coerce.number().int().positive().default(10),
    RATE_LIMIT_REGISTER_MAX: z.coerce.number().int().positive().default(10),
    RATE_LIMIT_REFRESH_MAX: z.coerce.number().int().positive().default(60),
  })
  .refine((e) => e.ACCESS_TOKEN_SECRET !== e.REFRESH_TOKEN_SECRET, {
    message: "ACCESS_TOKEN_SECRET e REFRESH_TOKEN_SECRET devem ser DIFERENTES",
    path: ["REFRESH_TOKEN_SECRET"],
  });

// 3) Valida. Se algo estiver errado, a aplicação NÃO sobe (falha rápida):
//    é melhor descobrir agora do que em produção, na primeira requisição.
const parsed = envSchema.safeParse(process.env);

if (!parsed.success) {
  console.error("Variáveis de ambiente inválidas:");
  for (const issue of parsed.error.issues) {
    console.error(` - ${issue.path.join(".")}: ${issue.message}`);
  }
  process.exit(1);
}

export const env = {
  ...parsed.data,
  // FRONTEND_URL pode ter várias origens separadas por vírgula
  FRONTEND_ORIGINS: parsed.data.FRONTEND_URL.split(",").map((o) => o.trim()).filter(Boolean),
  isProduction: parsed.data.NODE_ENV === "production",
  isTest: parsed.data.NODE_ENV === "test",
};
