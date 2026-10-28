# API de Tarefas (Node.js + Express 5 + Prisma 7 + PostgreSQL)

API REST de tarefas com **autenticação JWT**, **refresh token rotation com reuse detection** (cookie HTTPOnly), **autorização por roles e permissions**, **Helmet**, **CORS**, **rate limiting**, **validação com Zod**, **tratamento centralizado de erros**, **documentação OpenAPI** e **testes automatizados** (Vitest + Supertest).

Projeto de estudo: o guia passo a passo explica cada arquivo e cada decisão.

## Requisitos
- Node.js **22.12+**
- PostgreSQL 15+ (testado com 16)

## Primeira execução

```bash
npm install

# 1) bancos (no psql, como superusuário)
#    CREATE USER app WITH PASSWORD 'app123' CREATEDB;
#    CREATE DATABASE tasksdb OWNER app;
#    CREATE DATABASE tasksdb_test OWNER app;

# 2) variáveis de ambiente
cp .env.example .env            # edite: gere dois segredos DIFERENTES para os tokens

# 3) tabelas, client e dados iniciais
npx prisma migrate dev --name init
npx prisma generate
npx prisma db seed              # roles, permissions e o primeiro ADMIN (veja SEED_ADMIN_* no .env)

# 4) subir
npm run dev                     # http://localhost:3000   (docs em /docs)
```

## Scripts

| Comando | O que faz |
|---|---|
| `npm run dev` | servidor com reinício automático (`node --watch`) |
| `npm start` | servidor |
| `npm test` | testes (usa o banco `tasksdb_test`) |
| `npm run db:migrate` | `prisma migrate dev` (cria/aplica migrations) |
| `npm run db:migrate:test` | aplica as migrations no banco de testes |
| `npm run db:generate` | gera o Prisma Client |
| `npm run db:seed` | roda o seed |
| `npm run db:studio` | interface web do banco |

## Testes

```bash
cp .env.test.example .env.test
npm run db:migrate:test
npm test
```

## Estrutura

```text
src/config        env validado e lista de roles/permissions
src/lib           Prisma Client
src/utils         AppError, hash, cookies, duração
src/schemas       validação (Zod)
src/middlewares   authenticate, authorize, validate, rate limit, erros
src/routes        URL + método -> middlewares -> controller
src/controllers   traduzem HTTP <-> service
src/services      regras de negócio e acesso ao banco (Prisma)
src/docs          OpenAPI
prisma/           schema, migrations, seed
tests/            testes automatizados
```

## Segurança em resumo
- Senhas com **bcrypt** (hash + salt); nunca em texto puro.
- **Access token** JWT de 15 min com só `sub`; **refresh token** de 7 dias em cookie **HttpOnly, SameSite=Strict, Path=/auth** (e **Secure** em produção).
- Refresh tokens guardados como **hash SHA-256**; **rotação** a cada uso e **revogação da família** se um token já usado reaparecer.
- Roles e permissions consultadas no banco a cada requisição (mudanças valem na hora).
- Helmet, CORS com lista de origens, rate limiting, validação de entrada e erros que não vazam detalhes internos.
- Valores de rate limit e custos são de **estudo**; revise-os para produção.
# comentar-projeto
