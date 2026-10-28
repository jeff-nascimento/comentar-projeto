import { config } from "dotenv";
import { defineConfig, env } from "prisma/config";

// Prisma 7 NÃO carrega o .env sozinho: fazemos isso aqui.
// Em testes (NODE_ENV=test) usamos o banco de testes (.env.test).
config({ path: process.env.NODE_ENV === "test" ? ".env.test" : ".env", quiet: true });

export default defineConfig({
  schema: "prisma/schema.prisma",
  migrations: {
    path: "prisma/migrations",
    // Comando executado por "npx prisma db seed"
    seed: "node prisma/seed.js",
  },
  datasource: {
    url: env("DATABASE_URL"),
  },
});
