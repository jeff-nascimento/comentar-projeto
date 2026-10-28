import express from "express";
import helmet from "helmet";
import cors from "cors";
import cookieParser from "cookie-parser";
import swaggerUi from "swagger-ui-express";
import { env } from "./config/env.js";
import { openapi } from "./docs/openapi.js";
import { globalLimiter } from "./middlewares/rateLimiters.js";
import { notFound, errorHandler } from "./middlewares/errorHandler.js";
import routes from "./routes/index.js";

// Separar "criar o app" de "ligar o servidor" permite que os testes usem o app
// (via Supertest) sem abrir uma porta de rede.
export function createApp() {
  const app = express();

  // 1) CORS: quais origens (sites) o navegador pode deixar chamar esta API.
  //    Vem primeiro para que até as respostas de erro (ex.: 429) levem os headers CORS.
  app.use(
    cors({
      origin: env.FRONTEND_ORIGINS,
      credentials: true, // permite o navegador enviar/receber cookies
      methods: ["GET", "POST", "PATCH", "DELETE"],
      allowedHeaders: ["Content-Type", "Authorization"],
      maxAge: 600, // o navegador pode "lembrar" a resposta do preflight por 10 min
    }),
  );

  // 2) Helmet: headers HTTP de segurança (configuração padrão).
  app.use(helmet());

  // 3) Rate limit global (por IP).
  app.use(globalLimiter);

  // 4) Leitura do corpo (JSON, com limite de tamanho) e dos cookies.
  app.use(express.json({ limit: "10kb" }));
  app.use(cookieParser());

  // 5) Documentação (Swagger UI) e rotas da API.
  app.get("/docs.json", (req, res) => res.json(openapi));
  app.use("/docs", swaggerUi.serve, swaggerUi.setup(openapi));
  app.use(routes);

  // 6) Por último: rota não encontrada e tratamento centralizado de erros.
  app.use(notFound);
  app.use(errorHandler);

  return app;
}
