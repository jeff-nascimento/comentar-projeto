import { PrismaClient } from "@prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";
import { env } from "../config/env.js";

// Prisma 7 exige um "driver adapter": é o driver "pg" que realmente conversa
// com o PostgreSQL. O Prisma Client monta as queries e entrega ao adapter.
const adapter = new PrismaPg({ connectionString: env.DATABASE_URL });

// UMA única instância para toda a aplicação (ela gerencia um pool de conexões).
// Criar um PrismaClient por requisição esgotaria as conexões do banco.
// log: só avisos. Erros inesperados já são registrados pelo errorHandler; se
// deixássemos "error" aqui, o Prisma também imprimiria erros que TRATAMOS de
// propósito (ex.: e-mail duplicado -> 409), gerando ruído no console.
export const prisma = new PrismaClient({ adapter, log: ["warn"] });
