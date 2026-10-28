# Guia completo: API REST de Tarefas com Node.js, Express 5, Prisma 7 e PostgreSQL

> Autenticação JWT, **refresh token rotation com reuse detection**, cookies HTTPOnly, RBAC (roles + permissions), Helmet, CORS, rate limiting, validação com Zod, tratamento centralizado de erros, OpenAPI/Swagger e testes automatizados.

Este material é um **curso em formato de guia**. Você vai recriar a API **do zero**, fase por fase, entendendo cada arquivo. Ele usa a sua API anterior (Sequelize) como referência de **arquitetura e regras de negócio**, e o projeto do Dave Gray (`refresh_token_rotation`) como referência de **conceito de refresh token**, mas o código é uma **terceira implementação**, com Prisma.

## Como usar este guia

1. Siga as fases **na ordem**. Cada fase termina com um **checkpoint** (lista de revisão).
2. Cada arquivo segue o mesmo roteiro: **O que é → Por quê → Onde → Como criar → Código completo → Explicação → Fluxo**.
3. Quando um arquivo cresce ao longo do guia (ex.: `app.js`), mostro o arquivo **completo** a cada versão, indicando o que mudou.
4. Junto com este guia vai o projeto final (`api-tasks-prisma.zip`). Use-o para **comparar** com o seu, não para copiar. Todo bloco de código deste guia foi extraído desse projeto testado.

## O que foi verificado (leia antes de começar)

Eu construí e executei este projeto de verdade antes de escrever o guia:

| Verificado | Como |
|---|---|
| **50 testes automatizados passando** (cadastro, login, rota protegida, refresh, rotação, reuso, logout, autorização, Helmet, CORS, rate limit, validação, erros) | Vitest + Supertest contra PostgreSQL 16 real |
| Os testes **detectam defeitos** | Quebrei de propósito 3 regras (reuse detection, regra do dono, verificação do token) e os testes falharam |
| Fluxo manual completo (`curl`), `prisma db seed`, cookie `Secure` em modo produção, OpenAPI válido | Execução real |
| Versões atuais: Node 22.22, Express 5.2, Prisma 7.10, Zod 4.6, Helmet 8.3, express-rate-limit 8.7, bcrypt 6, Vitest 5 | Registro do npm |

**Uma limitação honesta:** no meu ambiente de testes o servidor de binários do Prisma estava bloqueado, então **não consegui executar `prisma migrate dev`**. O schema foi validado (`prisma validate`), o Prisma Client foi gerado e todos os testes rodaram, mas as tabelas do *meu* teste foram criadas por um SQL equivalente escrito à mão. **Na sua máquina `npx prisma migrate dev` funcionará normalmente**; na Fase 4 eu aponto exatamente o que esperar, e se algo diferir, o `prisma validate` e a documentação oficial são a fonte da verdade.

## Sumário

| Fase | Assunto |
|---|---|
| 0 | Visão geral, análise dos repositórios, decisões de arquitetura, REST |
| 1 | Preparação do ambiente |
| 2 | Criando o projeto e instalando dependências |
| 3 | PostgreSQL |
| 4 | Prisma: ORM, schema, relacionamentos e migrations |
| 5 | Estrutura, variáveis de ambiente, erros e o primeiro servidor |
| 6 | Roles e permissions: o modelo e o seed |
| 7 | Validação de entrada com Zod |
| 8 | Cadastro e bcrypt |
| 9 | JWT e Access Token |
| 10 | Refresh Token, cookies HTTPOnly e armazenamento seguro |
| 11 | Login |
| 12 | Middleware de autenticação |
| 13 | Refresh Token Rotation e Reuse Detection |
| 14 | Logout seguro |
| 15 | Tarefas (regra do dono) |
| 16 | Autorização: roles e permissions |
| 17 | Helmet e CORS |
| 18 | Rate limiting |
| 19 | Tratamento de erros: consolidando |
| 20 | Documentação com OpenAPI/Swagger |
| 21 | Testes automatizados |
| 22 | Git e README |
| 23 | Revisão final, perguntas de entrevista e checklist |

---

# FASE 0: Visão geral e decisões

## 0.1 O que vamos construir

Uma API REST de **tarefas** onde:

- pessoas se **cadastram** e fazem **login**;
- cada usuário gerencia **suas próprias tarefas**;
- um **administrador** (ou quem tiver a permission certa) administra tarefas de outros usuários;
- o acesso é controlado por **roles** (`ADMIN`, `USER`) e **permissions** (ex.: `tasks:read:any`);
- a sessão é mantida por **access token** (curto) + **refresh token** (longo, em cookie HTTPOnly, com **rotação** e **detecção de reutilização**).

## 0.2 Análise da sua API anterior (`api-rest-jwt-exercicio-I`)

Eu li o repositório. O que ele tem:

- **Stack:** CommonJS, Express 5, Sequelize, `bcryptjs`, `jsonwebtoken`, `pg`.
- **Camadas:** `routes → controllers → services`, mais `middleware/`. Boa separação, que **mantemos**.
- **Tabelas:** `users`, `tasks`, `roles`, `permissions`, `users_roles`, `users_permissions`, `roles_permissions` (N:N via `belongsToMany`). **Mantemos o modelo.**
- **Autenticação:** `POST /auth/login` devolve **um único token de 1 dia** com `id` e `email` no payload. Sem refresh token, sem cookie.
- **Autorização:** três middlewares (`roles`, `permissions`, `permissionsRoles`), cada um fazendo **sua própria consulta** ao banco, e **todos respondendo 401**. `PUT /users/:id/acl` atribui roles e permissions (somente `Admin`).
- **Permissions por ação:** `create-task`, `list-task`, `edit-task`, `delete-task`. Até para mexer nas **próprias** tarefas o usuário precisa ter essas permissions.
- **Erros:** `throw new Error(...)` nos services e respostas montadas à mão; sem validação de entrada centralizada.

| Tema | API anterior | Esta API | Por quê mudamos |
|---|---|---|---|
| ORM | Sequelize | **Prisma** | Objetivo do estudo; schema declarativo, client tipado |
| Módulos | CommonJS | **ES Modules** | Padrão atual; Prisma 7 e Vitest são ESM-first |
| Token | 1 dia, `id` + `email` no payload | **15 min, só `sub`** + refresh token | Token roubado dura pouco; payload é público |
| Sessão | Não existe | **Refresh token rotation** | Sessão longa sem token longo exposto |
| Autorização | 3 middlewares, 3 consultas, sempre 401 | **1 consulta** (`authenticate`) + `requireRole`/`requirePermission`, **401 x 403** | Menos código duplicado; códigos HTTP corretos |
| Tarefas | permission por ação para tudo | **dono sempre pode** + permissions `*:any` para os demais | Regra mais natural; menos linhas de seed |
| Validação | nenhuma | **Zod** | Nunca confiar em `req.body` |
| Erros | espalhados | **middleware central** | Respostas consistentes |
| Segredos | arquivo `jwtSecret.js` | **`.env` validado na partida** | Falha rápida e sem segredo no código |

## 0.3 Análise do projeto de referência (`refresh_token_rotation`, Dave Gray)

Eu já estudei esse repositório em detalhe antes (ele usa MongoDB). O conceito central: refresh token de **uso único**; se um token já usado reaparece, apaga-se **todos** os tokens do usuário. O que **mantemos** (o conceito) e o que **melhoramos**:

| Ponto | Projeto do Dave | Esta API |
|---|---|---|
| Onde ficam os refresh tokens | Array dentro do documento do usuário | **Tabela própria** `refresh_tokens` (uma linha por token) |
| Token no banco | O token **puro** | **Hash SHA-256** (vazamento do banco não entrega tokens) |
| Identificador do token | Nenhum (tokens iguais no mesmo segundo) | **`jti` único** (o id da linha) |
| Agrupar uma sessão | Não existe | **`familyId`**: reuso derruba só aquela sessão (aparelho) |
| Consumir o token | Consulta e depois grava (não atômico) | **`updateMany` condicional dentro de transação** (atômico) |
| Cookie | `sameSite: None` | **`SameSite=Strict`, `Path=/auth`** |
| Erros | Respostas duplicadas e `async` sem tratamento (derruba o servidor) | **Express 5 + middleware central** |

## 0.4 Decisões de arquitetura

Você pediu que decisões não sejam silenciosas. Aqui estão todas, com a escolha e o motivo.

**D1. CommonJS ou ES Modules?**
- A: CommonJS (`require`), como na API anterior.
- B: ES Modules (`import`).
- **Escolha: B.** Express 5, Prisma 7 e Vitest tratam ESM como padrão; é o que você verá em projetos novos. Custo: usar `import.meta`/`node:` nos imports e `"type": "module"` no `package.json`.

**D2. Onde guardar refresh tokens?**
- A: array no usuário (como o Dave). Simples, mas sem metadados e mistura sessões.
- B: tabela `refresh_tokens` com hash, família, expiração e revogação.
- **Escolha: B.** Permite revogar uma sessão, detectar reuso por família e limpar tokens antigos com uma consulta.

**D3. Refresh token é JWT ou string aleatória ("opaco")?**
- A: string aleatória guardada (hash) no banco.
- B: JWT assinado com `jti` + hash no banco.
- **Escolha: B.** Você pediu `REFRESH_TOKEN_SECRET`, validação da assinatura e comparação de hash. A assinatura barra lixo sem tocar no banco; o `jti` localiza a linha; o hash garante que o token apresentado é exatamente o emitido. (A é igualmente seguro e válido; muita gente prefere.)

**D4. Roles e permissions dentro do access token ou consultadas no banco?**
- A: dentro do token (rápido, mas defasado até o token expirar; payload fica grande).
- B: o token tem só o `sub`; roles/permissions vêm do banco a cada requisição.
- **Escolha: B.** Mudanças valem **na hora** (você verá um teste que promove um usuário a ADMIN sem novo login), usuário apagado perde o acesso, e o JWT não carrega nada além do necessário. Custo: 1 consulta por requisição protegida (aceitável nesta escala).

**D5. Permissão "por ação" ou "dono + `any`"?**
- A: permission para cada ação (`create-task`...), como na API anterior.
- B: o **dono** sempre pode; para tarefas **de outros** é preciso `tasks:read:any`, `tasks:write:any` ou `tasks:delete:any`.
- **Escolha: B.** Reflete a regra de negócio que você descreveu e evita dar 4 permissions a cada usuário novo. (Trocar para A é só mudar o seed e as rotas.)

**D6. Criar camada `repositories`?**
- **Escolha: não.** O Prisma Client **já é** a camada de acesso a dados (queries tipadas e legíveis). Um repository só repassando chamadas seria abstração sem ganho. Se um dia a mesma query for reaproveitada em muitos lugares, aí se extrai.

**D7. Relação N:N no Prisma: implícita ou explícita?**
- A: implícita (`roles Role[]` / `users User[]`, o Prisma cria a tabela oculta).
- B: **explícita** (um model para a tabela de junção).
- **Escolha: B.** Você quer as tabelas `users_roles`, `users_permissions`, `roles_permissions` visíveis e com colunas próprias (ex.: `assigned_at`); consultas ficam mais claras.

**D8. Bibliotecas**: **Zod** (validação), **Vitest + Supertest** (testes; o suporte a ESM do Jest é oficialmente experimental e exige a flag `--experimental-vm-modules`), **swagger-ui-express** com um objeto OpenAPI escrito à mão (sem gerar docs a partir de comentários: um arquivo, nenhuma mágica).

## 0.5 Arquitetura em camadas

```text
src/
├── config/        configuração (env validado, lista de roles/permissions)
├── lib/           instâncias compartilhadas (Prisma Client)
├── utils/         funções pequenas e puras (AppError, hash, cookies, duração)
├── schemas/       regras de validação (Zod) de body/params/query
├── middlewares/   funções que rodam ANTES dos controllers (auth, validação, erros...)
├── routes/        URL + método → (middlewares) → controller
├── controllers/   traduzem HTTP: leem a requisição, chamam o service, devolvem a resposta
├── services/      regras de negócio e acesso ao banco (Prisma)
├── docs/          documentação OpenAPI
├── app.js         monta o Express (sem abrir porta)
└── server.js      abre a porta (ponto de entrada)
prisma/            schema, migrations, seed
tests/             testes automatizados
```

| Camada | Responsabilidade | NÃO deve |
|---|---|---|
| **routes** | Mapear `método + URL` aos middlewares e ao controller | ter lógica |
| **middlewares** | Preocupações transversais (autenticar, validar, limitar, tratar erro) | conhecer regra de negócio específica |
| **controllers** | Ler `req`, chamar **um** service, montar `res` (status + JSON) | acessar o banco, decidir regras |
| **services** | Regras de negócio e Prisma | conhecer `req`/`res` (assim são testáveis e reutilizáveis) |
| **schemas** | Dizer **como** a entrada deve ser | fazer I/O |
| **utils/lib/config** | Peças de apoio | depender das camadas acima |

**Por que controllers magros?** Se a regra "só o dono (ou quem tem permission) altera a tarefa" estivesse no controller, ela seria copiada em PATCH, DELETE e GET, e cada cópia poderia divergir. No service ela existe **uma vez** e protege qualquer porta de entrada.

## 0.6 REST em 5 minutos

| Verbo | Significado | Idempotente? | Usamos para |
|---|---|---|---|
| `GET` | Ler (não altera nada) | sim | listar/consultar |
| `POST` | Criar ou executar uma ação | não | cadastro, login, criar tarefa |
| `PUT` | **Substituir** o recurso inteiro | sim | (não usamos) |
| `PATCH` | Alterar **parte** do recurso | normalmente | atualizar tarefa |
| `DELETE` | Remover | sim | excluir |

*Idempotente* = repetir a mesma requisição deixa o sistema no mesmo estado. Usamos `PATCH` (e não `PUT`) porque o cliente envia só o que mudou (ex.: `{ "completed": true }`).

Onde cada dado viaja numa requisição:

| Parte | Exemplo | Para quê |
|---|---|---|
| **Path param** | `/tasks/9f1c…` | identificar **qual** recurso |
| **Query string** | `/tasks?page=2&completed=true` | filtrar, paginar, ordenar |
| **Body** (JSON) | `{ "title": "Estudar" }` | dados a criar/alterar |
| **Header** | `Authorization: Bearer <jwt>` | metadados e credenciais |
| **Cookie** | `refreshToken=…` | estado que o **navegador** guarda e reenvia sozinho |

Status HTTP que usaremos: **200** OK · **201** criado · **204** sucesso sem corpo · **400** dados inválidos · **401** não autenticado · **403** autenticado mas sem permissão · **404** não existe · **409** conflito (ex.: e-mail repetido) · **413** corpo grande demais · **429** muitas requisições · **500** erro nosso.

## 0.7 O caminho completo de uma requisição

```text
CLIENTE
   ↓ HTTP request
CORS                 (a origem do navegador é permitida?)
   ↓
HELMET               (headers de segurança na resposta)
   ↓
RATE LIMIT           (este IP já passou do limite?)
   ↓
express.json / cookieParser   (req.body, req.cookies)
   ↓
ROUTE                (método + URL → qual cadeia de middlewares)
   ↓
AUTHENTICATION       (token válido? quem é o usuário? → req.user)
   ↓
AUTHORIZATION        (tem a role/permission?)
   ↓
VALIDATION           (body/params/query têm o formato certo? → req.validated)
   ↓
CONTROLLER           (traduz HTTP ↔ service)
   ↓
SERVICE              (regra de negócio)
   ↓
PRISMA CLIENT        (monta a query SQL)
   ↓
POSTGRESQL
   ↓ (resultado volta pelo mesmo caminho)
CONTROLLER → HTTP RESPONSE
   ↑
(qualquer erro, em qualquer ponto, vai direto para o MIDDLEWARE DE ERRO)
```

Na prática, nas rotas protegidas a ordem é `rate limit → authenticate → authorize → validate → controller`: barrar quem não tem credencial é mais barato do que validar o corpo.

## 0.8 Mapa das rotas

| Método | URL | Autenticação | Autorização | Resumo |
|---|---|---|---|---|
| POST | `/auth/register` | não | não | cadastra (recebe role `USER`) |
| POST | `/auth/login` | não | não | access token no corpo + cookie do refresh |
| POST | `/auth/refresh` | cookie | não | rotaciona o refresh token |
| POST | `/auth/logout` | cookie (opcional) | não | revoga a sessão e limpa o cookie |
| GET | `/users/me` | sim | não | meu perfil, roles e permissions |
| GET | `/users`, `/users/:id` | sim | `users:read` | consulta usuários |
| POST/DELETE | `/users/:id/roles[/:role]` | sim | `roles:assign` | atribui/remove role |
| POST/DELETE | `/users/:id/permissions[/:permission]` | sim | `permissions:assign` | concede/remove permission direta |
| GET | `/roles`, `/permissions` | sim | `roles:read`, `permissions:read` | lista |
| GET/POST | `/tasks` | sim | dono (`?scope=all` exige `tasks:read:any`) | lista/cria |
| GET/PATCH/DELETE | `/tasks/:id` | sim | dono **ou** `tasks:read/write/delete:any` | consulta/altera/exclui |
| GET | `/health`, `/docs` | não | não | saúde e documentação |

A **referência completa de cada rota** (body, resposta, erros) está na Fase 23.

### ✅ Checkpoint da Fase 0
Você deve saber explicar: as camadas e o que cada uma **não** faz; por que não há `repositories`; por que o JWT tem só o `sub`; por que o refresh token fica no banco como hash; por que `PATCH` e não `PUT`; a diferença entre 401, 403 e 404.

---

# FASE 1: Preparação do ambiente

**O que fazer:** instalar as ferramentas. **Por quê:** o Prisma 7 exige um Node recente, e precisamos de um PostgreSQL rodando.

### 1.1 Node.js
Use **Node 22.12 ou superior** (eu testei com 22.22; o Prisma 7 não funciona em versões antigas).

```bash
node -v   # esperado: v22.x ou superior
npm -v    # esperado: 10.x ou superior
```
Se estiver abaixo, instale a versão LTS em https://nodejs.org ou use um gerenciador de versões (nvm, fnm).

### 1.2 Git
```bash
git --version
git config --global user.name "Seu Nome"
git config --global user.email "voce@exemplo.com"
```

### 1.3 PostgreSQL
Instale o PostgreSQL (versão 15 ou superior; testei com 16) e **anote a senha do usuário `postgres`**.

- **Windows/macOS:** instalador em https://www.postgresql.org/download/ (ou `brew install postgresql@16` no macOS).
- **Ubuntu/Debian:** `sudo apt install postgresql postgresql-client`.
- **Alternativa com Docker** (opcional; só se você já usa Docker):
  ```bash
  docker run --name pg-tasks -e POSTGRES_PASSWORD=postgres -p 5432:5432 -d postgres:16
  ```

Verifique:
```bash
psql --version
```
O comando `psql` é o cliente de linha de comando do PostgreSQL. Se não for reconhecido no Windows, abra o **SQL Shell (psql)** instalado junto com o PostgreSQL.

### 1.4 Ferramenta para testar a API
Qualquer uma: **`curl`** (já vem no Windows 10+, macOS e Linux), **Postman**, **Insomnia** ou a extensão **Thunder Client** do VS Code. Neste guia uso `curl`; a interface do Swagger (Fase 20) também permite testar.

### 1.5 Editor
VS Code é o mais comum. Extensão útil: **Prisma** (destaque de sintaxe e formatação do `schema.prisma`).

### ✅ Checkpoint da Fase 1
`node -v` ≥ 22.12 · `git --version` · `psql --version` funcionando · você sabe a senha do usuário `postgres`.

---

# FASE 2: Criando o projeto e instalando dependências

### Passo 2.1: Criar a pasta e o `package.json`

**O que é:** o `package.json` é o "RG" do projeto Node: nome, scripts, dependências e configurações.
**Por quê:** o npm precisa dele para instalar pacotes e para você rodar comandos (`npm run dev`).
**Onde:** em qualquer pasta de estudos do seu computador. Eu uso `api-tasks-prisma`.

Terminal (na pasta onde você guarda seus projetos):

```bash
mkdir api-tasks-prisma
cd api-tasks-prisma
git init
npm init -y
npm pkg set type=module main=src/server.js
npm pkg set engines.node=">=22.12.0"
npm pkg set scripts.dev="node --watch src/server.js" scripts.start="node src/server.js"
```

| Comando | O que faz | Resultado esperado |
|---|---|---|
| `git init` | cria o repositório Git (pasta oculta `.git`) | "Initialized empty Git repository" |
| `npm init -y` | cria o `package.json` com respostas padrão (`-y` = sim para tudo) | arquivo `package.json` |
| `npm pkg set ...` | edita campos do `package.json` sem abrir o arquivo | sem saída |

O que cada ajuste significa:
- `"type": "module"` → o Node trata `.js` como **ES Modules** (`import`/`export`), decisão D1.
- `"main"` → arquivo de entrada.
- `"engines"` → documenta a versão mínima do Node.
- `scripts.dev` → `node --watch` reinicia o servidor quando você salva um arquivo (o Node já traz isso, **sem nodemon**).
- `scripts.start` → como rodar "de verdade".

### Passo 2.2: Instalar as dependências (e entender cada uma)

Princípio: **nenhuma biblioteca entra sem motivo.** Aqui está cada uma, o problema que resolve e o que você faria sem ela.

| Pacote | Problema que resolve | Sem ele você teria que... |
|---|---|---|
| **express** (v5) | Receber requisições HTTP, rotear, encadear middlewares | usar o módulo `http` do Node e fazer roteamento e parsing na mão |
| **prisma** (dev) | CLI: valida o schema, cria migrations, gera o client, seed | escrever SQL de criação/alteração das tabelas manualmente |
| **@prisma/client** | O **Prisma Client**: o objeto que o seu código usa para consultar o banco | escrever SQL em strings |
| **@prisma/adapter-pg** + **pg** | No Prisma 7, o *driver adapter* usa o driver `pg` para falar com o PostgreSQL | (obrigatório no Prisma 7) |
| **bcrypt** | Hash de senhas (lento de propósito, com salt) | (nunca implemente criptografia você mesmo) |
| **jsonwebtoken** | Criar e verificar JWT (assinatura HMAC) | montar Base64URL + HMAC e validar `exp` manualmente |
| **cookie-parser** | Transformar o header `Cookie` em `req.cookies` | dar `split` na string do header |
| **helmet** | Definir headers HTTP de segurança | escrever cada header à mão |
| **cors** | Responder ao CORS (incluindo *preflight*) | implementar o protocolo CORS manualmente |
| **express-rate-limit** | Limitar requisições por IP | manter contadores com janela de tempo |
| **zod** | Validar e converter dados de entrada (e o `.env`) | um `if` para cada campo, para cada rota |
| **swagger-ui-express** | Servir a interface web da documentação OpenAPI | montar a página do Swagger UI |
| **dotenv** | Carregar o arquivo `.env` em `process.env` | (o Node 22 também tem `--env-file`; o dotenv é mais portável) |
| **vitest** (dev) | Rodar os testes | (equivalente ao Jest) |
| **supertest** (dev) | Fazer requisições HTTP ao app **sem subir servidor** | abrir uma porta e usar `fetch` |
| **cross-env** (dev) | Definir variáveis de ambiente de forma igual no Windows/Linux/Mac | scripts diferentes por sistema |

Terminal (na raiz do projeto, onde está o `package.json`):

```bash
npm install express@5 @prisma/client@7 @prisma/adapter-pg@7 pg bcrypt jsonwebtoken cookie-parser helmet cors express-rate-limit zod swagger-ui-express dotenv
npm install -D prisma@7 vitest supertest cross-env
```

**O que o npm faz:** baixa os pacotes para a pasta `node_modules/`, registra os nomes e versões em `package.json` (seções `dependencies` e `devDependencies`) e fixa as versões exatas em `package-lock.json`.

> **Atenção com o Prisma:** escreva sempre `prisma@7` e `@prisma/client@7`. Quando conferi (06/10/2026), `npm install prisma` sem versão instalava um **release candidate da versão 8** (a tag `latest` apontava para ele), enquanto a versão estável era a 7.10. Para estudo, use a 7.x estável. Os três pacotes `@prisma/*` e `prisma` devem estar na **mesma versão**.

Como verificar:
```bash
npm ls --depth=0
```
Você deve ver `express@5.x`, `@prisma/client@7.x`, `prisma@7.x` etc.

> **Windows e o `bcrypt`:** ele é um módulo nativo, mas já vem com binários pré-compilados. Se mesmo assim a instalação falhar por falta de compilador, a alternativa pura em JavaScript é o `bcryptjs` (mesma API, um pouco mais lento).

### Passo 2.3: O `.gitignore`

**O que é:** lista do que o Git **não** deve versionar. **Por quê:** `node_modules/` é enorme e recriável; `.env` contém **segredos** (nunca vão para o repositório).
**Onde:** raiz do projeto. **Como criar:** crie o arquivo `.gitignore`.

```text
node_modules/
.env
.env.test
*.log
coverage/
```

Repare que `.env` e `.env.test` ficam de fora, mas `.env.example` e `.env.test.example` (modelos **sem segredos reais**) serão versionados.

### Passo 2.4: Estrutura de pastas

```bash
mkdir -p prisma tests src/config src/lib src/utils src/schemas src/middlewares src/routes src/controllers src/services src/docs
```
(No PowerShell do Windows, crie as pastas uma a uma com `mkdir nome` ou pelo VS Code.)

### 📌 Commit 1
```bash
git add .
git commit -m "chore: initialize project"
```
Consolidou: `package.json` com scripts e dependências, `package-lock.json` e `.gitignore`.

### ✅ Checkpoint da Fase 2
Você deve saber: o que é `package.json` x `package-lock.json` x `node_modules`; por que `"type": "module"`; por que cada pacote existe; por que fixamos `prisma@7`; por que `.env` está no `.gitignore`.

---

# FASE 3: PostgreSQL

## 3.1 Conceitos que usaremos

| Conceito | O que é | Como aparece no Prisma |
|---|---|---|
| **Banco de dados** | Um conjunto de tabelas (`tasksdb`) | a URL de conexão (`DATABASE_URL`) |
| **Tabela** | Uma "planilha" com colunas fixas e N linhas | um `model` |
| **Coluna** | Um campo com tipo (texto, número, data, UUID) | um campo do model |
| **Primary key (PK)** | Identifica uma linha de forma **única** | `@id` |
| **Foreign key (FK)** | Coluna que aponta para a PK de **outra** tabela | `@relation(fields, references)` |
| **Relacionamento 1:N** | 1 usuário tem N tarefas (a FK fica no lado "N") | `Task[]` de um lado, `userId` + `user` do outro |
| **Relacionamento N:N** | usuários x roles (precisa de uma tabela de junção) | models de junção (`UserRole`) |
| **Unique** | Valor não pode repetir (e-mail) | `@unique` |
| **Nullable** | Coluna aceita "vazio" (NULL) | tipo com `?` (`String?`) |
| **Índice** | Estrutura que acelera buscas por uma coluna | `@@index([...])` |
| **Constraint** | Regra que o **banco** garante (unique, FK, NOT NULL) | geradas pelos atributos acima |

**Por que constraints importam:** a validação da API pode falhar, ter um bug ou ser burlada; o banco é a **última linha de defesa**. Exemplo: dois cadastros simultâneos com o mesmo e-mail passam na checagem "já existe?" ao mesmo tempo, mas só um passa pela constraint `unique`.

## 3.2 Criar o usuário e os bancos

**O que:** um usuário do PostgreSQL só para a aplicação e **dois bancos** (desenvolvimento e testes).
**Por quê:** a aplicação não deve usar o superusuário `postgres`; e os testes **apagam dados**, então precisam de um banco separado.

```bash
psql -U postgres -h localhost
```
(informe a senha do `postgres`; você entra em um prompt `postgres=#`)

```sql
CREATE USER app WITH PASSWORD 'app123' CREATEDB;
CREATE DATABASE tasksdb OWNER app;
CREATE DATABASE tasksdb_test OWNER app;
\q
```

| Comando | O que faz |
|---|---|
| `CREATE USER app WITH PASSWORD ... CREATEDB` | cria o usuário. **`CREATEDB`**: o `prisma migrate dev` cria um banco temporário ("shadow database") para comparar migrations, e precisa dessa permissão |
| `CREATE DATABASE ... OWNER app` | cria o banco e define `app` como dono |
| `\q` | sai do `psql` |

Teste a conexão com o novo usuário:
```bash
psql -U app -h localhost -d tasksdb
```
Se pedir a senha (`app123`) e mostrar `tasksdb=>`, está funcionando (saia com `\q`).

> `app123` é uma senha de **estudo**. Em produção: senha forte, usuário com o mínimo de privilégios e conexão por rede privada.

## 3.3 A URL de conexão

```text
postgresql://app:app123@localhost:5432/tasksdb
│            │   │      │         │    └ nome do banco
│            │   │      │         └ porta (5432 é o padrão)
│            │   │      └ servidor
│            │   └ senha
│            └ usuário
└ protocolo
```
Se a senha tiver caracteres especiais (`@`, `/`, `#`), eles precisam ser codificados na URL (ex.: `@` vira `%40`).

### ✅ Checkpoint da Fase 3
Você deve saber: PK, FK, unique, NULL, índice; por que a constraint do banco é a defesa final; por que existem dois bancos; o que cada parte da URL de conexão significa; como entrar no `psql`.

---

# FASE 4: Prisma, schema, relacionamentos e migrations

## 4.1 Conceitos

**ORM** (*Object-Relational Mapper*) traduz entre o mundo das **tabelas** e o mundo dos **objetos JavaScript**. Em vez de escrever `SELECT * FROM users WHERE email = $1`, você escreve `prisma.user.findUnique({ where: { email } })`.

**Por que usar um ORM:** evita montar SQL em string (e com isso a maioria das *SQL injections*), dá consistência (o mesmo estilo para toda consulta), entende relacionamentos e versiona a estrutura do banco (migrations). **Custo:** uma camada a mais para aprender, e consultas muito complexas às vezes pedem SQL puro (o Prisma permite `$queryRaw`).

**Prisma tem três peças:**

| Peça | Função | Quando você usa |
|---|---|---|
| **Prisma Schema** (`schema.prisma`) | Descreve os models (tabelas) e relações. É a **fonte da verdade** | você edita |
| **Prisma Migrate** | Compara o schema com o banco e gera/aplica SQL (**migrations**) | `npx prisma migrate dev` |
| **Prisma Client** | Código JS **gerado a partir do schema**, com um método por tabela | `import { PrismaClient }` |

```text
schema.prisma ──(prisma migrate)──► SQL ──► PostgreSQL (tabelas)
      │
      └─────(prisma generate)─────► Prisma Client (JS) ──► seu código
```

### O que mudou no Prisma 7 (importante se você já viu tutoriais antigos)
1. A **URL do banco não fica mais no `schema.prisma`**: vai em um arquivo `prisma.config` (Passo 4.2).
2. O Prisma **não carrega o `.env` sozinho**: o config faz isso com o `dotenv`.
3. O client precisa de um **driver adapter** (`@prisma/adapter-pg`), criado no código (Fase 5).
4. `migrate dev` **não roda mais `prisma generate` nem o seed automaticamente**: você executa `npx prisma generate` e `npx prisma db seed` explicitamente.

**Equivalências com o Sequelize (sua API anterior):**

| Sequelize | Prisma |
|---|---|
| `models/*.js` + `sequelize-cli` migrations escritas à mão | **um** `schema.prisma`; migrations **geradas** |
| `database.users.findOne({ where })` | `prisma.user.findUnique({ where })` / `findFirst` |
| `findAll` | `findMany` |
| `include: [{ model, as }]` | `include: { relacao: true }` ou `select` aninhado |
| `belongsToMany(..., { through })` | model de junção explícito (`UserRole`) |
| `Op.in` | `{ in: [...] }` |
| `create` / `destroy` | `create` / `delete` (ou `deleteMany`) |

## 4.2 Arquivos de configuração

### Passo 4.2.1: `.env` (por enquanto, só a conexão)

**O que é:** arquivo de variáveis de ambiente (segredos e configurações que mudam entre máquinas). **Onde:** raiz do projeto. **Como criar:** novo arquivo `.env`.

```ini
DATABASE_URL="postgresql://app:app123@localhost:5432/tasksdb"
```
Na Fase 5 ele recebe as demais variáveis, e eu explico cada uma.

### Passo 4.2.2: `prisma.config.js`

**O que é:** configuração da **CLI** do Prisma. **Por quê:** no Prisma 7 é aqui que ficam o caminho do schema, a URL do banco, o diretório das migrations e o comando do seed. **Onde:** raiz. **Como:** novo arquivo `prisma.config.js`.

```js
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
```

**Explicação:**
- `config({ path: ... })` carrega o `.env` (ou `.env.test` quando `NODE_ENV=test`, assim os comandos do Prisma apontam para o banco de **testes**). `quiet: true` silencia mensagens do dotenv.
- `env("DATABASE_URL")` lê a variável; se não existir, o Prisma avisa com erro claro.
- `seed` é o comando que `npx prisma db seed` executa (Fase 6).

## 4.3 O schema

**O que é:** a descrição dos models. **Onde:** `prisma/schema.prisma`. **Como:** crie o arquivo. Abaixo está o schema **completo**; logo depois explico cada grupo.

```prisma
// Prisma Schema: a "planta" do banco de dados.
// Daqui o Prisma gera (1) as migrations SQL e (2) o Prisma Client (código JS).

generator client {
  provider = "prisma-client-js"
}

datasource db {
  provider = "postgresql"
  // Em Prisma 7 a URL de conexão NÃO fica aqui: ela está em prisma.config.js
}

// ---------------------------------------------------------------------------
// USUÁRIOS
// ---------------------------------------------------------------------------
model User {
  id           String   @id @default(uuid()) @db.Uuid
  name         String   @db.VarChar(100)
  email        String   @unique @db.VarChar(255)
  passwordHash String   @map("password_hash")
  createdAt    DateTime @default(now()) @map("created_at")
  updatedAt    DateTime @updatedAt @map("updated_at")

  // Lado "inverso" dos relacionamentos (não viram colunas em "users")
  tasks         Task[]
  refreshTokens RefreshToken[]
  roles         UserRole[]
  permissions   UserPermission[]

  @@map("users")
}

// ---------------------------------------------------------------------------
// TAREFAS (1 usuário tem N tarefas)
// ---------------------------------------------------------------------------
model Task {
  id          String   @id @default(uuid()) @db.Uuid
  title       String   @db.VarChar(150)
  description String?
  completed   Boolean  @default(false)
  userId      String   @map("user_id") @db.Uuid
  createdAt   DateTime @default(now()) @map("created_at")
  updatedAt   DateTime @updatedAt @map("updated_at")

  user User @relation(fields: [userId], references: [id], onDelete: Cascade)

  @@index([userId])
  @@map("tasks")
}

// ---------------------------------------------------------------------------
// ROLES e PERMISSIONS (RBAC)
// ---------------------------------------------------------------------------
model Role {
  id          String   @id @default(uuid()) @db.Uuid
  name        String   @unique @db.VarChar(50)
  description String?
  createdAt   DateTime @default(now()) @map("created_at")

  users       UserRole[]
  permissions RolePermission[]

  @@map("roles")
}

model Permission {
  id          String   @id @default(uuid()) @db.Uuid
  name        String   @unique @db.VarChar(100)
  description String?
  createdAt   DateTime @default(now()) @map("created_at")

  users UserPermission[]
  roles RolePermission[]

  @@map("permissions")
}

// Tabelas de junção (N:N explícito). A chave primária é composta:
// o mesmo par (usuário, role) não pode existir duas vezes.
model UserRole {
  userId     String   @map("user_id") @db.Uuid
  roleId     String   @map("role_id") @db.Uuid
  assignedAt DateTime @default(now()) @map("assigned_at")

  user User @relation(fields: [userId], references: [id], onDelete: Cascade)
  role Role @relation(fields: [roleId], references: [id], onDelete: Cascade)

  @@id([userId, roleId])
  @@index([roleId])
  @@map("users_roles")
}

model UserPermission {
  userId       String   @map("user_id") @db.Uuid
  permissionId String   @map("permission_id") @db.Uuid
  assignedAt   DateTime @default(now()) @map("assigned_at")

  user       User       @relation(fields: [userId], references: [id], onDelete: Cascade)
  permission Permission @relation(fields: [permissionId], references: [id], onDelete: Cascade)

  @@id([userId, permissionId])
  @@index([permissionId])
  @@map("users_permissions")
}

model RolePermission {
  roleId       String @map("role_id") @db.Uuid
  permissionId String @map("permission_id") @db.Uuid

  role       Role       @relation(fields: [roleId], references: [id], onDelete: Cascade)
  permission Permission @relation(fields: [permissionId], references: [id], onDelete: Cascade)

  @@id([roleId, permissionId])
  @@index([permissionId])
  @@map("roles_permissions")
}

// ---------------------------------------------------------------------------
// REFRESH TOKENS (uma linha por refresh token emitido)
// ---------------------------------------------------------------------------
// id        -> vai dentro do JWT como "jti" (identificador único do token)
// tokenHash -> SHA-256 do token (o token puro NUNCA é guardado)
// familyId  -> todos os tokens de UMA sessão (login) compartilham o mesmo familyId
// revokedAt -> preenchido quando o token foi usado (rotação), revogado (logout)
//              ou invalidado por reuso. NULL = ainda utilizável.
model RefreshToken {
  id        String    @id @default(uuid()) @db.Uuid
  tokenHash String    @map("token_hash") @db.VarChar(64)
  familyId  String    @map("family_id") @db.Uuid
  userId    String    @map("user_id") @db.Uuid
  expiresAt DateTime  @map("expires_at")
  revokedAt DateTime? @map("revoked_at")
  createdAt DateTime  @default(now()) @map("created_at")

  user User @relation(fields: [userId], references: [id], onDelete: Cascade)

  @@index([userId])
  @@index([familyId])
  @@map("refresh_tokens")
}
```

### Como ler o schema

**Atributos usados**

| Atributo | Significado |
|---|---|
| `@id` | chave primária |
| `@default(uuid())` | o Prisma gera um UUID v4 ao criar a linha |
| `@db.Uuid` | a coluna é do tipo nativo `uuid` do PostgreSQL |
| `@unique` | constraint unique (e cria um índice) |
| `@map("created_at")` | nome da **coluna** no banco (no código fica `createdAt`) |
| `@@map("users")` | nome da **tabela** no banco (no código o model é `User`) |
| `@default(now())` | data atual na criação |
| `@updatedAt` | o Prisma atualiza sozinho a cada `update` |
| `String?` | coluna **nullable** |
| `@@index([userId])` | índice (buscas por `userId` ficam rápidas) |
| `@@id([userId, roleId])` | chave primária **composta** |
| `@db.VarChar(100)` | `VARCHAR(100)`: limita o tamanho no banco |

**Por que UUID e não 1, 2, 3?** IDs sequenciais deixam adivinhar o próximo (`/tasks/8`, `/tasks/9`); UUIDs não. Além disso, não dependem de uma sequência do banco.

**1) `User` ↔ `Task` (1:N)**
```prisma
// em Task:
userId String @map("user_id") @db.Uuid
user   User   @relation(fields: [userId], references: [id], onDelete: Cascade)
// em User:
tasks  Task[]
```
`userId` é a **coluna real** (a FK). `user` e `tasks` **não são colunas**: são "atalhos" que o Prisma cria para você navegar (`task.user`, `user.tasks`). Toda relação tem **dois lados** no schema. `onDelete: Cascade` = apagar o usuário apaga as tarefas dele (o banco faz isso).

**2) N:N com tabela de junção explícita**
```text
User ──< UserRole >── Role         (users_roles)
User ──< UserPermission >── Permission   (users_permissions)
Role ──< RolePermission >── Permission   (roles_permissions)
```
Um usuário pode ter várias roles **e** uma role pode ter vários usuários; por isso existe uma tabela no meio, com a PK composta `(user_id, role_id)`: o mesmo par não repete. É exatamente a estrutura da sua API anterior. O mapa que você pediu:

```text
User
  ├── Roles        (via users_roles)
  ├── Permissions  (via users_permissions, "diretas")
  └── Tasks        (1:N)

Role
  ├── Users        (via users_roles)
  └── Permissions  (via roles_permissions)

Permission
  ├── Users        (via users_permissions)
  └── Roles        (via roles_permissions)
```
**Permission efetiva** de um usuário = permissions **diretas** ∪ permissions de **todas as suas roles**.

**3) `RefreshToken`**: uma linha por refresh token emitido (Fase 10). `id` vira o `jti` do JWT; `tokenHash` guarda o **hash** (nunca o token); `familyId` agrupa os tokens de uma sessão; `revokedAt` marca token usado/revogado.

## 4.4 Rodando a primeira migration

**Migration** = um arquivo SQL **versionado** que leva o banco de um estado ao próximo. Fica em `prisma/migrations/` e **vai para o Git**: quem clonar o projeto reproduz o mesmo banco.

Terminal (raiz do projeto):
```bash
npx prisma validate
npx prisma format
npx prisma migrate dev --name init
npx prisma generate
```

| Comando | O que faz | Resultado esperado |
|---|---|---|
| `prisma validate` | confere se o schema é válido | "The schema ... is valid" |
| `prisma format` | formata/alinha o schema | "Formatted prisma/schema.prisma" |
| `prisma migrate dev --name init` | gera o SQL da diferença entre o schema e o banco, **aplica** e registra | cria `prisma/migrations/<data>_init/migration.sql` e a tabela `_prisma_migrations` |
| `prisma generate` | gera o **Prisma Client** a partir do schema | "Generated Prisma Client" |

Dentro de `migration.sql` você verá SQL como (o seu pode diferir em detalhes):

```sql
CREATE TABLE "users" (
    "id" UUID NOT NULL,
    "name" VARCHAR(100) NOT NULL,
    "email" VARCHAR(255) NOT NULL,
    "password_hash" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "users_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "users_email_key" ON "users"("email");
ALTER TABLE "tasks" ADD CONSTRAINT "tasks_user_id_fkey" FOREIGN KEY ("user_id")
  REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
```
Leia sempre o SQL gerado: é um ótimo jeito de ver `PRIMARY KEY`, `UNIQUE INDEX` e `FOREIGN KEY` na prática.

Confira as tabelas:
```bash
npx prisma studio      # interface web para ver/editar os dados (Ctrl+C para fechar)
# ou:
psql -U app -h localhost -d tasksdb -c "\dt"
```
Deve listar: `users`, `tasks`, `roles`, `permissions`, `users_roles`, `users_permissions`, `roles_permissions`, `refresh_tokens` e `_prisma_migrations`.

Se `migrate dev` reclamar de permissão para criar o shadow database, volte à Fase 3 (`CREATEDB`).

**Regras de ouro das migrations**
1. Mudou o schema? Rode `npx prisma migrate dev --name descricao_curta` → nasce **uma nova migration** (nunca edite uma migration já aplicada).
2. **Versione** a pasta `prisma/migrations/`.
3. Em produção/CI use `npx prisma migrate deploy` (só aplica as pendentes, não cria nada novo).
4. `npx prisma migrate reset` **apaga o banco** e recria: só em desenvolvimento.

## 4.5 O Prisma Client (prévia das consultas)

Depois do `generate`, existe um método por model (`prisma.user`, `prisma.task`, ...). Prévia do que usaremos:

```js
// criar
await prisma.task.create({ data: { title: "Estudar", userId } });

// buscar um (campo único) com SELECT explícito: só traz o que pedimos
await prisma.user.findUnique({ where: { email }, select: { id: true, name: true } });

// buscar vários com filtro, ordem e limite
await prisma.task.findMany({ where: { userId, completed: false }, orderBy: { createdAt: "desc" }, take: 10 });

// trazer relações junto (JOIN) com include
await prisma.user.findUnique({ where: { id }, include: { roles: { include: { role: true } } } });

// atualizar / excluir
await prisma.task.update({ where: { id }, data: { completed: true } });
await prisma.task.delete({ where: { id } });

// várias operações atômicas: tudo acontece ou nada acontece
await prisma.$transaction([ prisma.task.findMany(), prisma.task.count() ]);
```

| Palavra | Papel |
|---|---|
| `where` | o **filtro** (`WHERE`) |
| `select` | escolhe **quais colunas/relações** vêm (e esconde o resto, como `passwordHash`) |
| `include` | traz as **relações** completas junto |
| `data` | os valores a gravar |
| `orderBy` / `take` / `skip` | ordenação e paginação |

O fluxo de qualquer consulta:
```text
Controller → Service → Prisma Client → driver adapter (pg) → PostgreSQL
                                                  ↑ monta o SQL  ↑ executa e devolve linhas
                         ← objetos JavaScript ←──────────────────┘
```
O **service** chama o Prisma Client; o client converte a chamada em SQL **parametrizado** (valores nunca são concatenados na string, daí a proteção contra SQL injection), o adapter envia ao PostgreSQL e as linhas voltam como objetos JS.

### 📌 Commit 2
```bash
git add .
git commit -m "feat: configure prisma schema and initial migration"
```
(O `.env` não vai: está no `.gitignore`. A pasta `prisma/migrations/` vai.)

### ✅ Checkpoint da Fase 4
Você deve saber: o que é ORM e por que usar; as 3 peças do Prisma; schema x migration x client; por que existem dois lados em uma relação; o que é tabela de junção e PK composta; `@map`/`@@map`; o que `onDelete: Cascade` faz; o que mudou no Prisma 7; e como conferir as tabelas.

---

# FASE 5: Estrutura, variáveis de ambiente, erros e o primeiro servidor

Nesta fase o projeto passa a **responder HTTP**. Criamos a base que todo o resto usa: configuração validada, conexão com o banco, erros padronizados e o app Express.

## 5.1 Variáveis de ambiente

**Por que usar `.env`:** segredos (chaves do JWT, senha do banco) e valores que mudam entre máquinas **não podem estar no código**: o código vai para o Git, o `.env` não. Cada ambiente (seu notebook, testes, produção) tem o seu `.env`.

**O que colocar / o que não colocar:** coloque segredos e configurações por ambiente. **Não** coloque regras de negócio nem valores que são sempre iguais. **Nunca** versione o `.env`; versione um **`.env.example`** com nomes e valores de exemplo (sem segredos reais) para documentar o que a aplicação espera.

### Passo 5.1.1: `.env.example`

**Onde:** raiz. **Como:** crie o arquivo `.env.example` com o conteúdo abaixo e depois copie-o para `.env`.

```ini
# Copie para ".env" e ajuste. NUNCA versione o ".env" real.
NODE_ENV=development
PORT=3000

# postgresql://USUARIO:SENHA@HOST:PORTA/NOME_DO_BANCO
DATABASE_URL="postgresql://app:app123@localhost:5432/tasksdb"

# Segredos do JWT: gere dois valores DIFERENTES com:
#   node -e "console.log(require('crypto').randomBytes(64).toString('hex'))"
ACCESS_TOKEN_SECRET=troque-por-um-segredo-longo-e-aleatorio-1
REFRESH_TOKEN_SECRET=troque-por-um-segredo-longo-e-aleatorio-2

# Formato: número + s|m|h|d  (ex.: 15m, 7d)
ACCESS_TOKEN_EXPIRES_IN=15m
REFRESH_TOKEN_EXPIRES_IN=7d

# Origens permitidas pelo CORS (separe várias por vírgula)
FRONTEND_URL=http://localhost:5173

# Custo do bcrypt (10-12 é comum; 12 = mais seguro e mais lento)
BCRYPT_ROUNDS=12

# Rate limiting (valores de ESTUDO/desenvolvimento)
RATE_LIMIT_GLOBAL_MAX=300
RATE_LIMIT_LOGIN_MAX=10
RATE_LIMIT_REGISTER_MAX=10
RATE_LIMIT_REFRESH_MAX=60

# Opcional: usado só por "npx prisma db seed" para criar o primeiro ADMIN
SEED_ADMIN_NAME=Administrador
SEED_ADMIN_EMAIL=admin@example.com
SEED_ADMIN_PASSWORD=Admin12345
```

```bash
cp .env.example .env          # Windows (cmd): copy .env.example .env
node -e "console.log(require('crypto').randomBytes(64).toString('hex'))"
```
Rode o segundo comando **duas vezes** e cole um valor em `ACCESS_TOKEN_SECRET` e **outro** em `REFRESH_TOKEN_SECRET` no seu `.env`.

| Variável | Para quê | Observações |
|---|---|---|
| `NODE_ENV` | `development`, `test` ou `production` | em `production` o cookie ganha `Secure` |
| `PORT` | porta do servidor | |
| `DATABASE_URL` | conexão com o PostgreSQL | segredo (contém senha) |
| `ACCESS_TOKEN_SECRET` | chave que **assina** o access token | segredo; ≥ 32 caracteres; aleatório |
| `REFRESH_TOKEN_SECRET` | chave que assina o refresh token | segredo; **diferente** da outra, para um tipo de token nunca ser aceito como o outro |
| `ACCESS_TOKEN_EXPIRES_IN` | vida do access token (`15m`) | curto: se vazar, vale pouco |
| `REFRESH_TOKEN_EXPIRES_IN` | vida do refresh token (`7d`) | define quanto tempo a sessão dura sem novo login |
| `FRONTEND_URL` | origens que o CORS aceita (várias, separadas por vírgula) | Fase 17 |
| `BCRYPT_ROUNDS` | custo do bcrypt | Fase 8 |
| `RATE_LIMIT_*` | limites de requisições | Fase 18 |
| `SEED_ADMIN_*` | dados do primeiro ADMIN criado pelo seed | opcional; Fase 6 |

**Desenvolvimento x produção:** em produção os segredos vêm do painel da hospedagem (não de arquivo), `NODE_ENV=production`, `FRONTEND_URL` é o domínio real (HTTPS), e os limites e custos são revistos.

### Passo 5.1.2: `src/config/env.js`

**O que é:** lê o `.env`, **valida** cada variável e exporta um objeto `env` pronto. **Por quê:** `process.env` é só texto e pode estar faltando; se uma variável essencial estiver errada, queremos que a aplicação **não suba** (falha rápida), em vez de quebrar na primeira requisição. **Quem usa:** praticamente todo o código.

```js
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
```

**Explicação:**
- `config({ path })` do `dotenv` copia `CHAVE=valor` do arquivo para `process.env`.
- O schema Zod descreve cada variável. `z.coerce.number()` converte o texto `"3000"` em número; `.default(...)` define o valor quando ela não existe.
- `.refine(...)` é uma regra que envolve **duas** variáveis (segredos diferentes).
- `safeParse` não lança exceção: devolve `{ success, data | error }`. Se falhou, listamos os problemas e `process.exit(1)` encerra o processo.
- O objeto exportado ganha `FRONTEND_ORIGINS` (a lista) e `isProduction`/`isTest` (atalhos).

## 5.2 Conexão com o banco

### Passo 5.2.1: `src/lib/prisma.js`

**O que é:** cria **uma única** instância do Prisma Client. **Por quê:** o client mantém um *pool* de conexões; criar um por requisição esgotaria as conexões do PostgreSQL. **Onde:** `lib/` guarda instâncias compartilhadas.

```js
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
```

**Explicação:** `PrismaPg` é o *driver adapter* (Prisma 7): recebe a URL e usa o driver `pg`. O `PrismaClient` recebe esse adapter. `log: ["warn"]` evita que o Prisma imprima erros que tratamos de propósito (como e-mail duplicado).

## 5.3 Erros: a fundação

Tratamento de erros não é enfeite do final: **todas** as camadas vão lançar erros, então a estratégia nasce agora.

```text
Route → Controller → Service → (erro)
                                  ↓ throw
                    MIDDLEWARE DE ERRO ──► Response { error: { code, message, details? } }
```

**Dois tipos de erro:**
- **Esperados** (o cliente causou: senha errada, dado inválido, recurso inexistente): lançamos um `AppError` com status e `code`. A resposta é **informativa**.
- **Inesperados** (bug, banco fora do ar): o detalhe vai para o **log do servidor**; o cliente recebe só "Erro interno" (500). Stack trace e mensagem interna **vazam informação** que ajuda um atacante.

### Passo 5.3.1: `src/utils/AppError.js`

```js
// Erro "esperado": algo que o cliente pode ter causado (dados inválidos,
// não autenticado, não encontrado...). Carrega o status HTTP e um código
// estável (code) que o front-end pode usar sem depender do texto da mensagem.
export class AppError extends Error {
  constructor(statusCode, code, message, details) {
    super(message);
    this.name = "AppError";
    this.statusCode = statusCode;
    this.code = code;
    this.details = details; // opcional: lista de problemas (ex.: validação)
  }

  static badRequest(message = "Requisição inválida", details) {
    return new AppError(400, "BAD_REQUEST", message, details);
  }
  static validation(details) {
    return new AppError(400, "VALIDATION_ERROR", "Dados inválidos", details);
  }
  static unauthorized(message = "Não autenticado") {
    return new AppError(401, "UNAUTHORIZED", message);
  }
  static forbidden(message = "Você não tem permissão para esta ação") {
    return new AppError(403, "FORBIDDEN", message);
  }
  static notFound(message = "Recurso não encontrado") {
    return new AppError(404, "NOT_FOUND", message);
  }
  static conflict(message = "Conflito com o estado atual do recurso") {
    return new AppError(409, "CONFLICT", message);
  }
}
```

**Explicação:** `AppError` estende `Error` e acrescenta `statusCode`, `code` (estável, para o front-end tratar sem depender do texto) e `details`. Os métodos `static` (`AppError.notFound()`) são atalhos.

### Passo 5.3.2: `src/middlewares/errorHandler.js`

**O que é:** o ponto **único** que transforma qualquer erro em resposta. Contém também `notFound` (rota inexistente).

```js
import { Prisma } from "@prisma/client";
import { env } from "../config/env.js";
import { AppError } from "../utils/AppError.js";

// Rota inexistente: transforma em um AppError 404 e segue para o errorHandler.
export function notFound(req, res, next) {
  next(AppError.notFound(`Rota não encontrada: ${req.method} ${req.originalUrl}`));
}

// Converte QUALQUER erro em { statusCode, code, message, details }.
function normalize(err) {
  // 1) Erros que nós mesmos lançamos (esperados)
  if (err instanceof AppError) return err;

  // 2) JSON malformado ou grande demais (erros do express.json())
  if (err.type === "entity.parse.failed") {
    return AppError.badRequest("O corpo da requisição não é um JSON válido");
  }
  if (err.type === "entity.too.large") {
    return new AppError(413, "PAYLOAD_TOO_LARGE", "Corpo da requisição grande demais");
  }

  // 3) Erros conhecidos do Prisma
  if (err instanceof Prisma.PrismaClientKnownRequestError) {
    if (err.code === "P2002") return AppError.conflict("Já existe um registro com esses dados");
    if (err.code === "P2025") return AppError.notFound("Registro não encontrado");
  }

  // 4) Qualquer outra coisa é um erro INESPERADO (bug, banco fora do ar...)
  return null;
}

// Express reconhece middleware de erro pelos 4 parâmetros (err, req, res, next).
export function errorHandler(err, req, res, next) {
  if (res.headersSent) return next(err);

  const known = normalize(err);

  if (known) {
    return res.status(known.statusCode).json({
      error: { code: known.code, message: known.message, ...(known.details && { details: known.details }) },
    });
  }

  // Inesperado: o detalhe vai para o LOG do servidor; o cliente recebe só uma
  // mensagem genérica (stack trace e mensagens internas podem revelar segredos).
  if (!env.isTest) console.error(err);
  res.status(500).json({
    error: { code: "INTERNAL_ERROR", message: "Erro interno do servidor" },
  });
}
```

**Explicação:**
- O Express identifica um **middleware de erro pelos 4 parâmetros** `(err, req, res, next)`. Ele só roda quando algo lança erro ou chama `next(err)`.
- **Express 5:** funções `async` que **rejeitam** (ou lançam) são encaminhadas ao middleware de erro **automaticamente**. No Express 4 era preciso `try/catch` + `next(err)` em cada handler; esse é um dos grandes ganhos da versão 5.
- `normalize` classifica: `AppError` (esperado) → erros do `express.json()` (JSON inválido = 400, grande demais = 413) → erros conhecidos do Prisma (`P2002` unique = 409, `P2025` não encontrado = 404) → o resto vira `null` (inesperado → 500).
- `if (res.headersSent) return next(err)` evita tentar responder duas vezes.
- Formato **único** de erro: `{ "error": { "code", "message", "details"? } }`.

## 5.4 O app e o servidor

### Passo 5.4.1: `src/routes/index.js` (versão 1)

**O que é:** o "índice" das rotas. Por enquanto só a rota de saúde (`/health`), usada para checar se a API está viva.

```js
import { Router } from "express";

const router = Router();

router.get("/health", (req, res) => res.json({ status: "ok" }));

export default router;
```

### Passo 5.4.2: `src/app.js` (versão 1)

**O que é:** monta o Express (middlewares e rotas) **sem abrir porta**. **Por quê:** os testes precisam do app sem servidor de rede.

```js
import express from "express";
import { notFound, errorHandler } from "./middlewares/errorHandler.js";
import routes from "./routes/index.js";

// Separar "criar o app" de "ligar o servidor" permite que os testes usem o app
// (via Supertest) sem abrir uma porta de rede.
export function createApp() {
  const app = express();

  // Lê o corpo das requisições com "Content-Type: application/json" e coloca
  // o resultado em req.body (com limite de tamanho).
  app.use(express.json({ limit: "10kb" }));

  app.use(routes);

  // Por último: rota não encontrada e tratamento centralizado de erros.
  app.use(notFound);
  app.use(errorHandler);

  return app;
}
```

**Explicação:** `express.json()` lê o corpo JSON e o coloca em `req.body` (**sem ele, `req.body` seria `undefined`**; no Express 5 ele é `undefined` quando não há corpo). **A ordem importa:** o Express executa na ordem do registro. Rotas vêm antes de `notFound`; o `errorHandler` fica por último para capturar o que acontecer nas etapas anteriores.

### Passo 5.4.3: `src/server.js`

**O que é:** o ponto de entrada: cria o app e **abre a porta**.

```js
import { createApp } from "./app.js";
import { env } from "./config/env.js";
import { prisma } from "./lib/prisma.js";

const app = createApp();

const server = app.listen(env.PORT, () => {
  console.log(`API rodando em http://localhost:${env.PORT} (docs em /docs)`);
});

// Encerramento "limpo": para de aceitar conexões e fecha a conexão com o banco.
async function shutdown(signal) {
  console.log(`\n${signal} recebido, encerrando...`);
  server.close(async () => {
    await prisma.$disconnect();
    process.exit(0);
  });
}
process.on("SIGINT", () => shutdown("SIGINT"));
process.on("SIGTERM", () => shutdown("SIGTERM"));
```

**Explicação:** `app.listen` abre a porta. O `shutdown` responde a `Ctrl+C`/`SIGTERM`: para de aceitar conexões e fecha a conexão com o banco (evita conexões penduradas).

### Testando
```bash
npm run dev
```
Você deve ver `API rodando em http://localhost:3000 (docs em /docs)`. Hoje `/docs` ainda não existe: só aparecerá na Fase 20 (o texto já está no `server.js` final, ignore por ora). Em outro terminal:

```bash
curl http://localhost:3000/health
# {"status":"ok"}

curl http://localhost:3000/nada
# {"error":{"code":"NOT_FOUND","message":"Rota não encontrada: GET /nada"}}
```

> **Se o servidor não subir** com "Variáveis de ambiente inválidas": leia a lista, ela diz qual variável está errada (por exemplo, segredos curtos ou iguais).

**Fluxo desta fase:**
```text
curl → Express → express.json → routes/index (/health) → res.json
curl /nada → ... → notFound → AppError 404 → errorHandler → JSON padronizado
```

### 📌 Commit 3
```bash
git add .
git commit -m "feat: add express app, env validation and error handling"
```

### ✅ Checkpoint da Fase 5
Você deve saber: por que `.env` e `.env.example`; por que validar o ambiente na partida; por que há uma única instância do Prisma Client; erros esperados x inesperados; como o Express reconhece um middleware de erro; o que o Express 5 faz com `async`; por que `app.js` e `server.js` são separados.

---

# FASE 6: Roles e permissions: o modelo e o seed

## 6.1 Conceitos

**Autenticação x autorização** (vamos repetir isto várias vezes, de propósito):
- **Autenticação** = "**quem é você?**" (prova de identidade: senha, token).
- **Autorização** = "**o que você pode fazer?**" (regras sobre o que a pessoa já identificada pode acessar).

**Role (papel):** um rótulo que agrupa um conjunto de poderes (`ADMIN`, `USER`). Usamos roles porque é muito mais simples dizer "Maria é ADMIN" do que conceder 20 permissões soltas a cada pessoa.

**Permission:** um poder específico e granular, escrito como `recurso:ação[:escopo]`: `users:read`, `tasks:read:any`. Roles **contêm** permissions.

**Como um usuário recebe uma role:** ao se cadastrar, recebe `USER` automaticamente (Fase 8). `ADMIN` só é dado por quem já tem poder para isso: a primeira vez pelo **seed**, depois pelo endpoint `POST /users/:id/roles` (Fase 16).

**Como verificamos:** a cada requisição protegida carregamos as roles e permissions **atuais** do usuário (Fase 12) e os middlewares `requireRole`/`requirePermission` (Fase 16) comparam.

**Onde a regra deve ficar:** em **middlewares** reutilizáveis (para "quem entra nesta rota") e nos **services** (para regras que dependem do dado, como "é o dono desta tarefa?"). Se ficasse espalhada pelos controllers, cada controller teria sua versão do `if (user.role === ...)`, e basta esquecer **um** para abrir uma brecha.

Duas formas de autorizar, que usaremos juntas:
```text
Ownership (propriedade):   "esta tarefa é MINHA?"            → regra no service
RBAC (roles/permissions):  "eu tenho a permission X?"        → middleware e service
```

## 6.2 A lista oficial de roles e permissions

### Passo 6.2.1: `src/config/rbac.js`

**O que é:** a **fonte única da verdade** de roles e permissions. **Por quê:** evita *strings mágicas* digitadas em vários lugares (um erro de digitação em `"task:read:any"` viraria uma brecha silenciosa). Usada pelo seed, pelas rotas e pelos testes.

```js
// Fonte ÚNICA da verdade sobre roles e permissions do sistema.
// Usada pelo seed (que grava no banco), pelas rotas (que exigem permissions)
// e pelos testes. Assim evitamos "strings mágicas" espalhadas pelo código.

export const ROLES = {
  ADMIN: "ADMIN",
  USER: "USER",
};

export const PERMISSIONS = {
  TASKS_READ_ANY: "tasks:read:any",
  TASKS_WRITE_ANY: "tasks:write:any",
  TASKS_DELETE_ANY: "tasks:delete:any",
  USERS_READ: "users:read",
  ROLES_READ: "roles:read",
  ROLES_ASSIGN: "roles:assign",
  PERMISSIONS_READ: "permissions:read",
  PERMISSIONS_ASSIGN: "permissions:assign",
};

export const PERMISSION_DESCRIPTIONS = {
  [PERMISSIONS.TASKS_READ_ANY]: "Ver tarefas de qualquer usuário",
  [PERMISSIONS.TASKS_WRITE_ANY]: "Criar/editar tarefas de qualquer usuário",
  [PERMISSIONS.TASKS_DELETE_ANY]: "Excluir tarefas de qualquer usuário",
  [PERMISSIONS.USERS_READ]: "Listar e consultar usuários",
  [PERMISSIONS.ROLES_READ]: "Listar roles",
  [PERMISSIONS.ROLES_ASSIGN]: "Atribuir/remover roles de usuários",
  [PERMISSIONS.PERMISSIONS_READ]: "Listar permissions",
  [PERMISSIONS.PERMISSIONS_ASSIGN]: "Conceder/remover permissions diretas de usuários",
};

// Quais permissions cada role recebe. USER não tem nenhuma permission especial:
// a regra "usuário comum mexe nas PRÓPRIAS tarefas" é de PROPRIEDADE (ownership),
// não de permission (veja tasks.service.js).
export const ROLE_PERMISSIONS = {
  [ROLES.ADMIN]: Object.values(PERMISSIONS),
  [ROLES.USER]: [],
};

export const ROLE_DESCRIPTIONS = {
  [ROLES.ADMIN]: "Administrador do sistema",
  [ROLES.USER]: "Usuário comum",
};
```

**Explicação:** `ROLE_PERMISSIONS` define o que cada role recebe. `ADMIN` recebe **todas**. `USER` recebe **nenhuma** permission especial: mexer nas **próprias** tarefas é uma regra de propriedade, não de permission (decisão D5).

## 6.3 O seed

**O que é:** um script que insere os **dados iniciais** que o sistema precisa para funcionar (as roles e permissions, e o primeiro admin). **Por quê:** sem a role `USER` no banco, o cadastro não consegue atribuí-la. Ele é **idempotente**: pode rodar quantas vezes quiser sem duplicar nada (`upsert` = atualiza se existe, cria se não existe).

### Passo 6.3.1: `prisma/seed-rbac.js`

```js
import {
  PERMISSIONS, PERMISSION_DESCRIPTIONS, ROLE_PERMISSIONS, ROLE_DESCRIPTIONS,
} from "../src/config/rbac.js";

// Cria (ou atualiza) permissions, roles e a ligação entre elas.
// É IDEMPOTENTE: pode rodar várias vezes sem duplicar nada (upsert =
// "atualiza se existir, cria se não existir").
// Recebe o client por parâmetro para servir ao seed E aos testes.
export async function seedRbac(client) {
  const permissionIds = {};
  for (const name of Object.values(PERMISSIONS)) {
    const permission = await client.permission.upsert({
      where: { name },
      update: { description: PERMISSION_DESCRIPTIONS[name] },
      create: { name, description: PERMISSION_DESCRIPTIONS[name] },
    });
    permissionIds[name] = permission.id;
  }

  for (const [roleName, permissionNames] of Object.entries(ROLE_PERMISSIONS)) {
    const role = await client.role.upsert({
      where: { name: roleName },
      update: { description: ROLE_DESCRIPTIONS[roleName] },
      create: { name: roleName, description: ROLE_DESCRIPTIONS[roleName] },
    });

    for (const permissionName of permissionNames) {
      await client.rolePermission.upsert({
        // "roleId_permissionId" é o nome que o Prisma dá à chave composta
        where: { roleId_permissionId: { roleId: role.id, permissionId: permissionIds[permissionName] } },
        update: {},
        create: { roleId: role.id, permissionId: permissionIds[permissionName] },
      });
    }
  }
}
```

**Explicação:** recebe o `client` por parâmetro para servir ao seed e aos testes. `roleId_permissionId` é o nome que o Prisma dá à **chave composta** (`@@id([roleId, permissionId])`) para usá-la em `where`.

### Passo 6.3.2: `prisma/seed.js`

```js
import bcrypt from "bcrypt";
import { prisma } from "../src/lib/prisma.js";
import { env } from "../src/config/env.js";
import { ROLES } from "../src/config/rbac.js";
import { seedRbac } from "./seed-rbac.js";

async function main() {
  await seedRbac(prisma);
  console.log("Roles e permissions criadas/atualizadas.");

  // Primeiro administrador (opcional): definido pelo .env
  const email = process.env.SEED_ADMIN_EMAIL?.toLowerCase();
  const password = process.env.SEED_ADMIN_PASSWORD;
  if (!email || !password) {
    console.log("SEED_ADMIN_EMAIL/SEED_ADMIN_PASSWORD não definidos: nenhum admin criado.");
    return;
  }

  const admin = await prisma.user.upsert({
    where: { email },
    update: {},
    create: {
      name: process.env.SEED_ADMIN_NAME ?? "Administrador",
      email,
      passwordHash: await bcrypt.hash(password, env.BCRYPT_ROUNDS),
    },
  });

  for (const roleName of [ROLES.ADMIN, ROLES.USER]) {
    const role = await prisma.role.findUniqueOrThrow({ where: { name: roleName } });
    await prisma.userRole.upsert({
      where: { userId_roleId: { userId: admin.id, roleId: role.id } },
      update: {},
      create: { userId: admin.id, roleId: role.id },
    });
  }
  console.log(`Admin pronto: ${email}`);
}

main()
  .catch((err) => {
    console.error(err);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
```

**Explicação:** cria roles/permissions e, se `SEED_ADMIN_EMAIL`/`SEED_ADMIN_PASSWORD` estiverem no `.env`, cria o **primeiro administrador** (senha com bcrypt) com as roles `ADMIN` e `USER`. `findUniqueOrThrow` lança erro se não achar, o que é desejável aqui.

```bash
npx prisma db seed
```
Esperado: `Roles e permissions criadas/atualizadas.` e `Admin pronto: admin@example.com`. (O comando executa o `seed` configurado no `prisma.config.js`; no Prisma 7 ele **não** roda sozinho após `migrate dev`.)

Conferir no banco:
```bash
psql -U app -h localhost -d tasksdb -c "select r.name role, p.name permission from roles r join roles_permissions rp on rp.role_id=r.id join permissions p on p.id=rp.permission_id order by 1,2;"
```
Deve listar `ADMIN` com 8 permissions e nenhuma linha para `USER`.

### 📌 Commit 4
```bash
git add .
git commit -m "feat: add roles, permissions and seed"
```

### ✅ Checkpoint da Fase 6
Você deve saber: autenticação x autorização; role x permission; ownership x RBAC; por que a lista fica em um arquivo único; o que é seed e idempotência; a relação `users_roles`, `roles_permissions`, `users_permissions` e como se calcula a permission efetiva.

---

# FASE 7: Validação de entrada com Zod

## 7.1 O problema

**Nunca confie em `req.body`, `req.params` ou `req.query`:** quem chama a API controla esses dados. Sem validação: e-mail `123`, senha de 1 caractere, `title` com 10 MB, campos extras (`"roles": ["ADMIN"]`), tipos errados (`completed: "sim"`), UUID inválido que o banco rejeitaria com um erro feio.

**O que validamos:** campos obrigatórios, **tipos**, formato (e-mail, UUID), tamanhos, valores permitidos (enum) e a **conversão** de texto para número/booleano (tudo na query string chega como texto).

## 7.2 Por que Zod

- **Problema que resolve:** descrever "como a entrada deve ser" em **um lugar** (um *schema*), e obter dados já **validados e convertidos**.
- **Sem ele:** um `if` para cada campo, em cada rota, com mensagens diferentes.
- **Como entram os dados:** `schema.safeParse(req.body)` → `{ success: true, data }` ou `{ success: false, error }`.
- **Se falhar:** respondemos **400** com a lista de problemas (`details`).
- **Um detalhe valioso:** por padrão o Zod **descarta campos desconhecidos**, o que nos protege de *mass assignment* (o cliente tentar enviar `roles` ou `userId`).

## 7.3 Arquivos

### Passo 7.3.1: `src/middlewares/validate.js`

**O que é:** a fábrica `validate({ params, query, body })` que devolve um middleware. **Onde:** `middlewares/`.

```js
import { z } from "zod";
import { AppError } from "../utils/AppError.js";

// Mensagens de erro do Zod em português do Brasil (vale para toda a aplicação).
z.config(z.locales.ptBR());

// Uso: validate({ params: schema, query: schema, body: schema })
//
// Para cada parte da requisição que tiver schema:
//   - valida; se falhar, junta TODOS os problemas e responde 400;
//   - se passar, guarda os dados JÁ VALIDADOS/CONVERTIDOS em req.validated.
//
// Por que não sobrescrever req.query? No Express 5, req.query é somente leitura.
// Por isso o controller sempre lê de req.validated, nunca de req.body/query direto.
export function validate(schemas) {
  return (req, res, next) => {
    const validated = {};
    const details = [];

    for (const part of ["params", "query", "body"]) {
      if (!schemas[part]) continue;

      const result = schemas[part].safeParse(req[part]);
      if (result.success) {
        validated[part] = result.data;
      } else {
        for (const issue of result.error.issues) {
          details.push({ in: part, field: issue.path.join("."), message: issue.message });
        }
      }
    }

    if (details.length > 0) throw AppError.validation(details);

    req.validated = validated;
    next();
  };
}
```

**Explicação:**
- `z.config(z.locales.ptBR())` coloca as mensagens do Zod em português do Brasil.
- Percorremos `params`, `query` e `body`; cada schema é aplicado em `req[parte]`. **Todos** os problemas são coletados (o cliente corrige tudo de uma vez).
- Se houver problemas, `throw AppError.validation(details)` → 400 pelo errorHandler.
- Se estiver tudo certo, gravamos o resultado em **`req.validated`** e chamamos `next()`. O controller **lê de `req.validated`**, nunca de `req.body`.
- **Por que não sobrescrevemos `req.query`?** No Express 5, `req.query` é **somente leitura** (testei: atribuir lança `Cannot set property query ... which has only a getter`).

### Passo 7.3.2: `src/schemas/common.schema.js`

```js
import { z } from "zod";

// Parâmetro de rota :id (precisa ser um UUID)
export const idParam = z.object({ id: z.uuid() });

// Query string ?page=2&limit=20  (chega como TEXTO; coerce converte para número)
export const paginationQuery = z.object({
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(100).default(20),
});
```

`z.uuid()` valida o formato do UUID. `z.coerce.number()` converte o texto `"2"` em `2`; `.default(1)` preenche quando falta; `.max(100)` impede `limit=1000000`.

### Passo 7.3.3: `src/schemas/auth.schema.js`

```js
import { z } from "zod";

// Normaliza (trim + minúsculas) ANTES de validar o formato do e-mail.
const email = z.string().trim().toLowerCase().max(255).pipe(z.email());

// bcrypt só considera os primeiros 72 BYTES da senha; por isso limitamos.
const password = z
  .string()
  .min(8, "A senha deve ter pelo menos 8 caracteres")
  .refine((v) => Buffer.byteLength(v, "utf8") <= 72, "A senha deve ter no máximo 72 bytes")
  .regex(/[A-Za-z]/, "A senha deve ter pelo menos uma letra")
  .regex(/\d/, "A senha deve ter pelo menos um número");

export const registerBody = z.object({
  name: z.string().trim().min(2, "O nome deve ter pelo menos 2 caracteres").max(100),
  email,
  password,
});

// No login NÃO aplicamos as regras de força da senha: só exigimos que exista.
export const loginBody = z.object({
  email,
  password: z.string().min(1, "Informe a senha"),
});
```

**Explicação:**
- `email`: `trim` (apara espaços) → `toLowerCase` → `max(255)` → `pipe(z.email())` (valida o formato **depois** de normalizar). Normalizar evita `Maria@X.com` e `maria@x.com` virarem duas contas.
- `password`: ≥ 8, com letra e número, e **no máximo 72 bytes**: o bcrypt ignora tudo depois do 72º byte, então aceitar mais seria enganar o usuário.
- No **login** só exigimos que a senha exista: as regras de força valem para **criar** uma senha, não para conferir uma existente.

**Fluxo da validação:**
```text
req.body ──► validate({ body: registerBody })
                ├─ ok  ──► req.validated.body (limpo, convertido) ──► next() ──► controller
                └─ erro ─► throw AppError.validation ──► errorHandler ──► 400 { details }
```

### ✅ Checkpoint da Fase 7
Você deve saber: por que não confiar em `req.body`; o que é um schema; `safeParse`; coerção; por que campos extras são descartados; por que lemos de `req.validated`; o limite de 72 bytes do bcrypt.

---

# FASE 8: Cadastro e bcrypt

## 8.1 Por que não guardamos senhas

Se o banco vazar (acontece), senhas em texto puro expõem seus usuários **e** as outras contas deles (muita gente repete senha). Por isso guardamos um **hash**.

| Conceito | Explicação |
|---|---|
| **Hash** | Função **de mão única**: dado `senha`, calcula-se o hash; do hash **não** se volta à senha |
| **Salt** | Texto aleatório misturado à senha **antes** do hash. Duas pessoas com a mesma senha terminam com hashes diferentes e tabelas pré-calculadas ("rainbow tables") não servem |
| **Custo (rounds)** | Quantas vezes o algoritmo se repete. O bcrypt é **lento de propósito**: dificulta quem tenta adivinhar milhões de senhas |
| **Comparação** | Para conferir no login, **refazemos** o hash da senha informada com o **mesmo salt** e comparamos. Por isso **não** existe `hash === senha`: seriam valores diferentes por natureza |

Custos medidos (nesta máquina, por hash): custo 4 → 2 ms · 10 → 71 ms · **12 → 284 ms** · 14 → 1132 ms. Cada +1 dobra o tempo. Escolhemos **12** (atraso imperceptível para uma pessoa, caro para um atacante). Nos testes usamos 4 para não ficarem lentos.

Anatomia de um hash do bcrypt:
```text
$2b$10$SeyY3T2shQX9B52/VWndfOZjwKcSUmU76rUsab8dsxH5XLzC1J6NK
 │  │  └ salt (22 caracteres) + hash (31 caracteres)
 │  └ custo (10 = 2^10 repetições)
 └ versão do algoritmo
```
O **salt e o custo ficam dentro do próprio hash**, por isso o banco só precisa de uma coluna (`password_hash`).

```text
CADASTRO:  senha ──► bcrypt.hash(senha, custo) ──► hash ──► banco
LOGIN:     senha ──► bcrypt.compare(senha, hashDoBanco) ──► true / false
```

## 8.2 Arquivos do cadastro

Ordem pedagógica: **service** (regra) → **controller** (HTTP) → **rota**.

### Passo 8.2.1: `src/services/auth.service.js` (versão 1: só cadastro)

**O que é:** a regra de negócio do cadastro. **Onde:** `services/`. **Importante:** o service **não** conhece `req`/`res`.

```js
import bcrypt from "bcrypt";
import { Prisma } from "@prisma/client";
import { env } from "../config/env.js";
import { prisma } from "../lib/prisma.js";
import { AppError } from "../utils/AppError.js";
import { ROLES } from "../config/rbac.js";

const isPrismaError = (err, code) =>
  err instanceof Prisma.PrismaClientKnownRequestError && err.code === code;

// ---------------------------------------------------------------------------
// CADASTRO
// ---------------------------------------------------------------------------
export async function register({ name, email, password }) {
  // bcrypt.hash gera um salt aleatório e embute salt + custo dentro do hash.
  const passwordHash = await bcrypt.hash(password, env.BCRYPT_ROUNDS);

  try {
    // "Nested write": cria o usuário E a ligação em users_roles na mesma
    // operação (o Prisma executa tudo dentro de uma transação).
    const user = await prisma.user.create({
      data: {
        name,
        email,
        passwordHash,
        roles: { create: { role: { connect: { name: ROLES.USER } } } },
      },
      select: {
        id: true, name: true, email: true, createdAt: true,
        roles: { select: { role: { select: { name: true } } } },
      },
    });
    return { ...user, roles: user.roles.map((r) => r.role.name) };
  } catch (err) {
    // P2002 = violação de unique constraint (e-mail já existe).
    // Tratar o erro do banco (em vez de "consultar antes") evita a condição de
    // corrida de dois cadastros simultâneos com o mesmo e-mail.
    if (isPrismaError(err, "P2002")) throw AppError.conflict("E-mail já cadastrado");
    // P2025 aqui = a role USER não existe: o seed não foi executado.
    if (isPrismaError(err, "P2025")) {
      throw new Error('Role "USER" não encontrada. Execute o seed: npx prisma db seed');
    }
    throw err;
  }
}
```

**Explicação:**
- `bcrypt.hash(password, env.BCRYPT_ROUNDS)` → Promise com o hash.
- `prisma.user.create({ data, select })`: o **nested write** `roles: { create: { role: { connect: { name: "USER" } } } }` cria o usuário **e** a linha em `users_roles` ligando-o à role `USER` (existente, por isso `connect`) em uma única transação. `select` define o que **volta**: repare que `passwordHash` **não** está na lista, então nunca sai da função.
- **E-mail duplicado:** em vez de "consultar se existe e depois criar" (duas requisições simultâneas passariam as duas), deixamos a constraint `unique` do banco decidir e tratamos o erro `P2002`.
- `P2025` aqui significa "a role USER não existe" = o seed não rodou. É erro **nosso** (500), não do cliente.

### Passo 8.2.2: `src/controllers/auth.controller.js` (versão 1)

```js
import * as authService from "../services/auth.service.js";

// POST /auth/register
export async function register(req, res) {
  const user = await authService.register(req.validated.body);
  res.status(201).json({ data: user });
}
```

**Explicação:** o controller só: lê `req.validated.body`, chama o service e responde `201`. Sem regra de negócio, sem Prisma. Se o service lançar, o Express 5 encaminha ao `errorHandler`.

### Passo 8.2.3: `src/routes/auth.routes.js` (versão 1)

```js
import { Router } from "express";
import * as controller from "../controllers/auth.controller.js";
import { validate } from "../middlewares/validate.js";
import { registerBody } from "../schemas/auth.schema.js";

const router = Router();

router.post("/register", validate({ body: registerBody }), controller.register);

export default router;
```

A cadeia é `validate → controller`: a validação roda **antes** do controller.

### Passo 8.2.4: `src/routes/index.js` (versão 2)

Acrescentamos o router de autenticação:

```js
import { Router } from "express";
import authRoutes from "./auth.routes.js";

const router = Router();

router.get("/health", (req, res) => res.json({ status: "ok" }));

router.use("/auth", authRoutes);

export default router;
```

`router.use("/auth", authRoutes)` "monta" o router sob o prefixo `/auth`: dentro dele `"/register"` vira `POST /auth/register`.

## 8.3 Testando o cadastro

Com `npm run dev` rodando:

```bash
curl -X POST http://localhost:3000/auth/register -H "Content-Type: application/json" \
  -d '{"name":"Maria","email":"maria@example.com","password":"Senha12345"}'
```
Esperado (`201`): `{"data":{"id":"...","name":"Maria","email":"maria@example.com","createdAt":"...","roles":["USER"]}}`

| Teste | Esperado |
|---|---|
| mesmo comando de novo | `409` `CONFLICT` "E-mail já cadastrado" |
| `-d '{"name":"x","email":"abc","password":"1"}'` | `400` `VALIDATION_ERROR` com `details` por campo |
| `-d '{oops'` | `400` `BAD_REQUEST` (JSON inválido) |

Veja o hash no banco (**nunca** a senha):
```bash
psql -U app -h localhost -d tasksdb -c "select email, password_hash from users;"
```
No Windows (cmd) troque as aspas simples do `-d` por aspas duplas escapadas (`-d "{\"name\":...}"`) ou use Postman/Thunder Client.

**Fluxo completo do cadastro:**
```text
POST /auth/register
   ↓ Express (cors/json)         lê o corpo JSON → req.body
   ↓ Router /auth/register
   ↓ validate({ body })          Zod valida/normaliza → req.validated.body
   ↓ Controller register         extrai os dados, chama o service
   ↓ Service register            bcrypt.hash(senha)
   ↓ Prisma Client               prisma.user.create (INSERT users + INSERT users_roles, numa transação)
   ↓ PostgreSQL                  constraints: unique(email), FKs
   ↓ Service                     devolve o usuário SEM o hash (select)
   ↓ Controller                  res.status(201).json({ data })
   ↓ Response
(erro em qualquer ponto → AppError/Prisma error → errorHandler → { error })
```

### 📌 Commit 5
```bash
git add .
git commit -m "feat: add validation and user registration with bcrypt"
```

### ✅ Checkpoint da Fase 8
Você deve saber: hash x salt x custo; por que não se compara `hash === senha`; o que `bcrypt.compare` faz por dentro; por que o hash não vai na resposta (`select`); por que tratamos `P2002` em vez de consultar antes; o que é um nested write e `connect`; o caminho completo do cadastro.

---

# FASE 9: JWT e Access Token

## 9.1 O que é um JWT

**JWT** (*JSON Web Token*) é uma string que o servidor **assina** para provar, depois, que **ele mesmo** a emitiu, sem precisar guardar nada em memória sobre a sessão (*stateless*). Tem três partes separadas por ponto:

```text
eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9 . eyJpYXQiOjE3OTEz...  . nduqLcOiKKBtwaHOpWZ_7wCH...
└──────────── HEADER ─────────────┘   └──── PAYLOAD ────┘   └──── SIGNATURE ────┘
```

| Parte | Conteúdo | Exemplo (decodificado) |
|---|---|---|
| **Header** | Metadados: algoritmo e tipo | `{"alg":"HS256","typ":"JWT"}` |
| **Payload** | As *claims* (dados) | `{"iat":1791328448,"exp":1791329348,"sub":"2f6c1c1e-..."}` |
| **Signature** | Selo calculado com `header + payload + chave secreta` (HMAC-SHA256) | bytes em Base64URL |

Claims padrão que usamos: **`sub`** (*subject*: de quem é o token, o id do usuário), **`iat`** (*issued at*: emitido em) e **`exp`** (*expires*: expira em), as duas em segundos desde 1970.

### Header e payload NÃO são secretos
Eles são só **codificados** em Base64URL, **não criptografados**. Qualquer pessoa lê o conteúdo; tente:

```bash
node -e "import('jsonwebtoken').then(({default: jwt}) => { const t = jwt.sign({}, 'x'.repeat(40), { subject: 'abc', expiresIn: 900 }); console.log(t); console.log(jwt.decode(t)); })"
```
`jwt.decode` lê o payload **sem checar a assinatura**. A proteção está em outro lugar: **ninguém consegue alterar** o payload (por exemplo trocar `sub` pelo id de outra pessoa) sem **invalidar a assinatura**, porque só o servidor conhece a chave secreta.

**O que colocar no payload:** o mínimo para identificar (`sub`) + tempos (`iat`, `exp`).
**O que NÃO colocar:** senha, hash, e-mail, CPF, qualquer dado sensível ou que mude (roles/permissions: leríamos valores defasados). Qualquer um que capture o token (ou o abra no navegador) lê tudo.

> Sua API anterior colocava `id` e `email` no payload e dava **1 dia** de validade. Aqui o token só tem `sub` e dura **15 minutos**.

## 9.2 Como o servidor verifica

```text
Cliente envia: Authorization: Bearer <JWT>
   ↓
jwt.verify(token, ACCESS_TOKEN_SECRET)
   ├─ recalcula a assinatura com header+payload e a chave
   ├─ compara com a assinatura recebida   → diferente? token adulterado/forjado → erro
   ├─ confere `exp`                       → vencido? → erro
   └─ tudo certo → devolve o payload ({ sub, iat, exp })
```
O servidor **nunca confia no cliente**: o cliente pode enviar qualquer string. Só o que passa em `verify` vale.

## 9.3 Por que o access token vive pouco

Não podemos "cancelar" um JWT (ele é *stateless*: o servidor não guarda lista de tokens válidos). Então, se alguém roubar um access token, ele **vale até expirar**. Por isso:
- **Access token curto (15 min):** o estrago de um vazamento é limitado.
- Se fosse longo (dias/semanas), um vazamento seria quase uma senha roubada. E o usuário teria que digitar a senha **a cada** expiração; a solução é o **refresh token** (Fase 10).

## 9.4 `src/services/token.service.js`

**O que é:** cria e verifica **access tokens**. **Onde:** `services/` (regra de segurança reutilizável). **Quem usa:** `auth.service` (login), `session.service` (refresh), `authenticate` (middleware).

```js
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
```

**Explicação:**
- `jwt.sign(payload, chave, opções)`: payload **vazio** `{}`; as opções `subject` e `expiresIn` geram `sub` e `exp`; o `iat` é automático. `expiresIn` como **número** = segundos (`toSeconds("15m")` = 900).
- `algorithm: "HS256"` e, na verificação, `algorithms: ["HS256"]`: o servidor **impõe** o algoritmo e não aceita o que o header do token "escolher" (ataques de troca de algoritmo).
- `jwt.verify` **lança** erro se algo estiver errado. Quem chama decide como responder.

Esse arquivo importa `src/utils/duration.js`, que criamos agora:

### `src/utils/duration.js`
```js
// Converte textos como "15m" ou "7d" em segundos/milissegundos.
// Precisamos disso porque o mesmo valor (ex.: REFRESH_TOKEN_EXPIRES_IN) é usado
// no JWT (segundos), no cookie (milissegundos) e no banco (data de expiração).
const UNIT_IN_SECONDS = { s: 1, m: 60, h: 3600, d: 86400 };

export function toSeconds(text) {
  const match = /^(\d+)([smhd])$/.exec(text);
  if (!match) throw new Error(`Duração inválida: "${text}" (use ex.: 15m, 7d)`);
  return Number(match[1]) * UNIT_IN_SECONDS[match[2]];
}

export const toMilliseconds = (text) => toSeconds(text) * 1000;
```

Converte `"15m"` em 900 s (JWT) ou 900000 ms (cookie). Um único valor no `.env` serve aos três usos (JWT, cookie, banco).

### ✅ Checkpoint da Fase 9
Você deve saber: as 3 partes do JWT; que payload é legível mas não alterável; `sub`/`iat`/`exp`; o que `sign` e `verify` fazem; por que o payload é mínimo; por que o access token é curto; por que fixamos o algoritmo.

---

# FASE 10: Refresh Token, cookies HTTPOnly e armazenamento seguro

## 10.1 Por que existe refresh token

Queremos duas coisas que se contradizem: **segurança** (token de vida curta) e **conforto** (não pedir a senha a cada 15 minutos). A solução usa **dois** tokens:

| | Access token | Refresh token |
|---|---|---|
| Serve para | **acessar** rotas protegidas | **pedir** um novo access token |
| Vida | curta (15 min) | longa (7 dias) |
| Onde o cliente guarda | **memória** da aplicação | **cookie HTTPOnly** |
| Como viaja | header `Authorization` em **toda** requisição | cookie, **só** para `/auth/*` |
| Servidor guarda? | não (stateless) | **sim**, no banco (hash) |
| Pode ser revogado? | não (expira sozinho) | **sim** |

O token que circula **mais** (access) é o que vive **menos**; o que vive mais (refresh) circula **raramente** e fica protegido. Por que não um access token gigante? Porque seria um token que circula em toda requisição **e** vale por semanas **e** não pode ser revogado.

Importante: o refresh token **não** sustenta requisições. Ele só tem uma função: trocar-se por um access token novo.

## 10.2 Cookies de verdade

**Cookie** é um pequeno dado que o **servidor** manda ao navegador (header `Set-Cookie`) e que o **navegador** guarda e **reenvia sozinho** (header `Cookie`) em requisições futuras para o mesmo servidor.

```text
LOGIN
Servidor ──► Set-Cookie: refreshToken=<jwt>; HttpOnly; Path=/auth; Max-Age=604800; SameSite=Strict
Navegador guarda.

DEPOIS (POST /auth/refresh)
Navegador ──► Cookie: refreshToken=<jwt>        (automático, só porque a URL começa com /auth)
Servidor lê com cookie-parser: req.cookies.refreshToken
```

| Atributo | Significado | Nosso valor e motivo |
|---|---|---|
| **HttpOnly** | JavaScript da página **não** lê o cookie (`document.cookie` não o mostra) | ligado: se houver XSS, o script malicioso não consegue **roubar** o refresh token |
| **Secure** | só é enviado por **HTTPS** | ligado em **produção** (veja abaixo) |
| **SameSite** | quando o cookie acompanha requisições originadas de **outros sites** | `Strict`: nunca (mitiga **CSRF**) |
| **Path** | só é enviado para URLs que começam com este caminho | `/auth`: não viaja em `/tasks`, `/users`... |
| **Max-Age / Expires** | por quanto tempo o navegador guarda | 7 dias, igual à vida do token |

**Cookie x localStorage:** o `localStorage` é legível por **qualquer JavaScript** da página: um único XSS entrega o token. Cookie HttpOnly **não** é legível por JS, e por isso é o lugar adequado para o refresh token. (O access token, curto, fica em **memória** do front-end: nem cookie nem localStorage.)

**HTTPS e desenvolvimento:** `Secure` + `http://localhost` é uma armadilha clássica (alguns navegadores recusam). Por isso `secure: env.isProduction`: ligado só em produção, onde a API estará atrás de HTTPS. O MDN documenta que Chrome 89+ e Firefox 75+ aceitam `Secure` em `localhost`, mas nem todo cliente é assim; a escolha acima funciona em todos.

**CSRF** (outro site fazendo o navegador do usuário disparar uma requisição à sua API com o cookie): reduzimos três vezes: `SameSite=Strict`; `Path=/auth` (o cookie só existe nas rotas de sessão); e o access token **não** é cookie (vai no header), então as rotas de dados não são afetáveis por CSRF.

## 10.3 Guardar no banco, e como

**Por que armazenar um refresh token, se JWT é stateless?** Porque queremos **poder revogar** (logout) e **detectar reuso**. Isso exige memória do lado do servidor.

**O que guardar** (tabela `refresh_tokens`):

| Coluna | Para quê |
|---|---|
| `id` | vira o **`jti`** (id único do token) dentro do JWT; é como achamos a linha |
| `token_hash` | **hash SHA-256** do token (nunca o token puro) |
| `family_id` | agrupa os tokens de **uma sessão** (um login). Veja a Fase 13 |
| `user_id` | de quem é |
| `expires_at` | quando vence (permite limpar tokens vencidos) |
| `revoked_at` | NULL = utilizável; preenchido = já usado/revogado |

**Por que hash e não o token?** Se o banco vazar, o atacante vê só hashes, que **não** servem como cookie. É o mesmo princípio das senhas.

**Por que SHA-256 e não bcrypt aqui?** O bcrypt é lento de propósito para proteger senhas **curtas e previsíveis**. O refresh token é uma string longa, com assinatura e muita aleatoriedade: impossível "adivinhar", então basta um hash rápido (e idêntico a cada cálculo, o que permite comparar).

**Por que `jti`?** Dois JWTs com o mesmo payload gerados no mesmo segundo são **a mesma string** (o `iat` é em segundos). Com um `jti` aleatório cada token é único. (O projeto do Dave não tinha isso, e eu o vi falhar num teste.)

## 10.4 Arquivos

### `src/utils/hash.js`
```js
import { createHash, timingSafeEqual } from "node:crypto";

// SHA-256 em hexadecimal (64 caracteres). Usado para guardar o refresh token
// no banco sem guardar o token em si. Diferente do bcrypt, é rápido e sempre
// dá o mesmo resultado para a mesma entrada; adequado porque o refresh token
// é uma string longa e aleatória (não é uma senha curta que alguém "adivinha").
export const sha256 = (text) => createHash("sha256").update(text).digest("hex");

// Comparação em tempo constante: não "vaza" por quanto tempo demorou
// onde as duas strings começam a diferir.
export function safeEqual(a, b) {
  const bufA = Buffer.from(a);
  const bufB = Buffer.from(b);
  return bufA.length === bufB.length && timingSafeEqual(bufA, bufB);
}
```

`sha256` gera o hash em hexadecimal (64 caracteres). `safeEqual` compara em **tempo constante** (`timingSafeEqual`): uma comparação normal (`===`) pode terminar mais cedo quanto antes as strings diferem, e isso, em teoria, "vaza" informação pelo tempo.

### `src/services/refresh-token.service.js`
**O que é:** emite, verifica e revoga refresh tokens.

```js
import jwt from "jsonwebtoken";
import { randomUUID } from "node:crypto";
import { env } from "../config/env.js";
import { prisma } from "../lib/prisma.js";
import { sha256 } from "../utils/hash.js";
import { toSeconds } from "../utils/duration.js";

// Mesmo algoritmo do access token (veja token.service.js).
const ALGORITHM = "HS256";

// ---------------------------------------------------------------------------
// REFRESH TOKEN (longa duração, cookie HTTPOnly, guardado no banco como HASH)
// ---------------------------------------------------------------------------
// `db` pode ser o prisma normal OU o `tx` de uma transação (veja auth.service.js).
export async function issueRefreshToken({ userId, familyId, db = prisma }) {
  const id = randomUUID(); // vira o "jti" (id único do token) e a PK da linha no banco
  const ttlSeconds = toSeconds(env.REFRESH_TOKEN_EXPIRES_IN);

  const token = jwt.sign({}, env.REFRESH_TOKEN_SECRET, {
    algorithm: ALGORITHM,
    subject: userId,
    jwtid: id,
    expiresIn: ttlSeconds,
  });

  await db.refreshToken.create({
    data: {
      id,
      tokenHash: sha256(token), // guardamos o hash, nunca o token
      familyId,
      userId,
      expiresAt: new Date(Date.now() + ttlSeconds * 1000),
    },
  });

  return token;
}

export function verifyRefreshToken(token, { ignoreExpiration = false } = {}) {
  return jwt.verify(token, env.REFRESH_TOKEN_SECRET, { algorithms: [ALGORITHM], ignoreExpiration });
}

// Revoga TODOS os tokens ainda ativos de uma "família" (uma sessão de login).
export function revokeFamily(familyId, db = prisma) {
  return db.refreshToken.updateMany({
    where: { familyId, revokedAt: null },
    data: { revokedAt: new Date() },
  });
}
```

**Explicação:**
- `issueRefreshToken`: gera o `id` (UUID) **antes** de assinar, para usá-lo como `jti`; assina com a chave **de refresh**; grava a linha com `tokenHash: sha256(token)`; devolve o token **puro** (só quem pediu o vê, uma vez).
- O parâmetro `db = prisma` permite passar um `tx` (cliente de transação) na rotação, para o INSERT participar da mesma transação.
- `revokeFamily`: `updateMany` coloca `revokedAt` em **todos** os tokens ativos da família.

### `src/utils/cookies.js`
```js
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
```

**Explicação:** `res.cookie(nome, valor, opções)` monta o `Set-Cookie`. `clearCookie` precisa dos **mesmos** atributos (principalmente `path`) usados ao criar, senão o navegador não reconhece como o mesmo cookie e não o apaga.

### ✅ Checkpoint da Fase 10
Você deve saber: por que dois tokens; por que não um access longo; o que é cookie e como o navegador o envia; HttpOnly/Secure/SameSite/Path/Max-Age; cookie x localStorage; por que armazenar o refresh no banco; por que hash (e por que SHA-256); o que `jti` e `familyId` fazem; por que `Secure` só em produção.

---

# FASE 11: Login

## 11.1 O fluxo

```text
POST /auth/login { email, password }
   ↓ Express Router /auth/login
   ↓ validate({ body: loginBody })       formato do e-mail, senha informada
   ↓ Controller login
   ↓ Service login
   ↓ Prisma: findUnique({ email })       procura o usuário
   ↓ PostgreSQL
   ↓ bcrypt.compare(senha, hash)         confere a senha
   ↓ signAccessToken(user.id)            Access Token (15 min)
   ↓ issueRefreshToken(...)              Refresh Token (7 d) + INSERT do HASH em refresh_tokens
   ↓ Controller: setRefreshCookie        Set-Cookie HttpOnly
   ↓ Response 200 { data: { user, accessToken } }   (o refresh token NÃO vai no corpo)
```
Cada seta: o **Router** decide a cadeia; o **validate** barra dado ruim; o **Controller** traduz HTTP; o **Service** concentra a regra; o **Prisma** vira SQL; **bcrypt.compare** reutiliza o salt do hash; os dois tokens nascem; o refresh vai para o **banco (hash)** e para o **cookie (token)**.

## 11.2 Segurança do login

- **Mesma resposta para "e-mail não existe" e "senha errada"** (`401 Credenciais inválidas`). Se respondêssemos "e-mail não cadastrado", um atacante descobriria quais e-mails existem (**enumeração de usuários**).
- **Tempo de resposta igual:** se o e-mail não existe e pulássemos o bcrypt, a resposta seria **muito mais rápida** (alguns ms contra ~280 ms), entregando a informação pelo tempo. Por isso comparamos com um **hash falso** (`DUMMY_HASH`) quando não há usuário.
- **Força bruta:** limitada por rate limiting (Fase 18).

## 11.3 Arquivos

### `src/services/auth.service.js` (versão 2: cadastro + login)
Substitua o arquivo da Fase 8 por este (o `register` é o mesmo; entram `DUMMY_HASH`, os imports de token e `login`):

```js
import bcrypt from "bcrypt";
import { randomUUID } from "node:crypto";
import { Prisma } from "@prisma/client";
import { env } from "../config/env.js";
import { prisma } from "../lib/prisma.js";
import { AppError } from "../utils/AppError.js";
import { ROLES } from "../config/rbac.js";
import { signAccessToken } from "./token.service.js";
import { issueRefreshToken } from "./refresh-token.service.js";

// Hash "de mentira" usado quando o e-mail não existe, para que o login demore
// o mesmo tempo com e-mail existente ou não (dificulta descobrir e-mails
// cadastrados medindo o tempo de resposta).
const DUMMY_HASH = bcrypt.hashSync("senha-falsa-apenas-para-igualar-o-tempo", env.BCRYPT_ROUNDS);

const isPrismaError = (err, code) =>
  err instanceof Prisma.PrismaClientKnownRequestError && err.code === code;

// ---------------------------------------------------------------------------
// CADASTRO
// ---------------------------------------------------------------------------
export async function register({ name, email, password }) {
  // bcrypt.hash gera um salt aleatório e embute salt + custo dentro do hash.
  const passwordHash = await bcrypt.hash(password, env.BCRYPT_ROUNDS);

  try {
    // "Nested write": cria o usuário E a ligação em users_roles na mesma
    // operação (o Prisma executa tudo dentro de uma transação).
    const user = await prisma.user.create({
      data: {
        name,
        email,
        passwordHash,
        roles: { create: { role: { connect: { name: ROLES.USER } } } },
      },
      select: {
        id: true, name: true, email: true, createdAt: true,
        roles: { select: { role: { select: { name: true } } } },
      },
    });
    return { ...user, roles: user.roles.map((r) => r.role.name) };
  } catch (err) {
    // P2002 = violação de unique constraint (e-mail já existe).
    // Tratar o erro do banco (em vez de "consultar antes") evita a condição de
    // corrida de dois cadastros simultâneos com o mesmo e-mail.
    if (isPrismaError(err, "P2002")) throw AppError.conflict("E-mail já cadastrado");
    // P2025 aqui = a role USER não existe: o seed não foi executado.
    if (isPrismaError(err, "P2025")) {
      throw new Error('Role "USER" não encontrada. Execute o seed: npx prisma db seed');
    }
    throw err;
  }
}

// ---------------------------------------------------------------------------
// LOGIN
// ---------------------------------------------------------------------------
export async function login({ email, password }) {
  const user = await prisma.user.findUnique({ where: { email } });

  // Sempre executamos um bcrypt.compare (com hash falso se o usuário não existe).
  const passwordMatches = await bcrypt.compare(password, user?.passwordHash ?? DUMMY_HASH);

  // Mesma mensagem para "e-mail não existe" e "senha errada" (anti-enumeração).
  if (!user || !passwordMatches) throw AppError.unauthorized("Credenciais inválidas");

  // Cada LOGIN cria uma nova "família" de refresh tokens (uma sessão).
  const familyId = randomUUID();
  const accessToken = signAccessToken(user.id);
  const refreshToken = await issueRefreshToken({ userId: user.id, familyId });

  return {
    user: { id: user.id, name: user.name, email: user.email },
    accessToken,
    refreshToken,
  };
}
```

**Explicação do `login`:** `findUnique` busca por campo único; **sempre** roda `bcrypt.compare` (com `DUMMY_HASH` se não achou); se algo falhou, o **mesmo** `401`. Cada login cria um `familyId` novo: **uma sessão = uma família**; logar em dois aparelhos cria duas famílias independentes.

### `src/controllers/auth.controller.js` (versão 2)
```js
import * as authService from "../services/auth.service.js";
import { setRefreshCookie } from "../utils/cookies.js";

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
```

O refresh token vai para o **cookie** (`setRefreshCookie`) e o access token para o **corpo**.

### `src/routes/auth.routes.js` (versão 2)
```js
import { Router } from "express";
import * as controller from "../controllers/auth.controller.js";
import { validate } from "../middlewares/validate.js";
import { registerBody, loginBody } from "../schemas/auth.schema.js";

const router = Router();

router.post("/register", validate({ body: registerBody }), controller.register);
router.post("/login", validate({ body: loginBody }), controller.login);

export default router;
```

## 11.4 Testando
```bash
curl -i -c cookies.txt -X POST http://localhost:3000/auth/login -H "Content-Type: application/json" \
  -d '{"email":"maria@example.com","password":"Senha12345"}'
```
Esperado (resumido):
```text
HTTP/1.1 200 OK
Set-Cookie: refreshToken=<jwt>; Max-Age=604800; Path=/auth; Expires=...; HttpOnly; SameSite=Strict
{"data":{"user":{"id":"...","name":"Maria","email":"maria@example.com"},"accessToken":"<jwt>"}}
```
Repare em `HttpOnly`, `Path=/auth`, `SameSite=Strict` e **ausência de `Secure`** (estamos em desenvolvimento). Senha errada ou e-mail inexistente: `401 {"error":{"code":"UNAUTHORIZED","message":"Credenciais inválidas"}}`.

Veja o que ficou no banco: **hash**, não token:
```bash
psql -U app -h localhost -d tasksdb -c "select id, family_id, length(token_hash) hash_len, revoked_at from refresh_tokens;"
```

### 📌 Commit 6
```bash
git add .
git commit -m "feat: add login with access and refresh tokens"
```

### ✅ Checkpoint da Fase 11
Você deve saber: o fluxo seta por seta; por que o refresh não vai no corpo; enumeração de usuários e o `DUMMY_HASH`; o que é uma família; onde o refresh token existe em texto puro (só no cookie) e onde existe como hash (banco).

---

# FASE 12: Middleware de autenticação

## 12.1 O que é um middleware

**Middleware** é uma função `(req, res, next)` que fica **no meio** do caminho entre a requisição e o controller. Ela pode: ler/alterar `req`, responder (encerrando o fluxo) ou chamar `next()` (passar adiante). Os middlewares rodam **na ordem em que foram registrados**.

```text
Request ─► [middleware 1] ─► [middleware 2] ─► [authenticate] ─► Controller ─► Response
                                                   │
                                                   └─ token inválido? lança erro → errorHandler (o controller nem é chamado)
```

## 12.2 O fluxo do `authenticate`

```text
Request com  Authorization: Bearer <accessToken>
   ↓
Middleware: lê o header e extrai o token
   ↓
JWT: jwt.verify(token)  → assinatura ok? não expirou?
   ↓
Banco: getAuthContext(payload.sub)  → o usuário ainda existe? quais roles/permissions TEM AGORA?
   ↓
req.user = { id, name, email, roles, permissions }
   ↓
next()
   ↓
Controller usa req.user
```
**O token só diz *quem*; o banco diz *o quê*.** Por que consultar o banco a cada requisição, se JWT é stateless? Porque assim: (1) mudanças de role/permission valem **na hora**; (2) usuário apagado perde o acesso mesmo com token válido. O custo é uma consulta por requisição (decisão D4).

## 12.3 Arquivos

### `src/services/authContext.service.js`
**O que é:** monta o "contexto de autorização" do usuário: dados básicos + roles + permissions **efetivas** (diretas ∪ das roles).

```js
import { prisma } from "../lib/prisma.js";

// ---------------------------------------------------------------------------
// Contexto de autorização do usuário (usado pelo middleware authenticate)
// ---------------------------------------------------------------------------
// Uma única query traz o usuário, suas roles, as permissions de cada role e as
// permissions concedidas diretamente. Depois juntamos tudo em um conjunto.
export async function getAuthContext(userId) {
  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: {
      id: true, name: true, email: true, createdAt: true,
      roles: {
        select: {
          role: {
            select: {
              name: true,
              permissions: { select: { permission: { select: { name: true } } } },
            },
          },
        },
      },
      permissions: { select: { permission: { select: { name: true } } } },
    },
  });
  if (!user) return null;

  const viaRoles = user.roles.flatMap((ur) => ur.role.permissions.map((rp) => rp.permission.name));
  const direct = user.permissions.map((up) => up.permission.name);

  return {
    id: user.id,
    name: user.name,
    email: user.email,
    createdAt: user.createdAt,
    roles: user.roles.map((ur) => ur.role.name).sort(),
    permissions: [...new Set([...viaRoles, ...direct])].sort(), // sem duplicados
  };
}

export const hasPermission = (user, permission) => user.permissions.includes(permission);
export const hasAnyRole = (user, roles) => roles.some((role) => user.roles.includes(role));
```

**Explicação:** **uma** consulta Prisma traz o usuário com as relações aninhadas (`roles → role → permissions → permission`) usando `select`; depois juntamos tudo em um `Set` (sem duplicados). `hasPermission`/`hasAnyRole` são helpers puros.

### `src/middlewares/authenticate.js`
```js
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
```

**Explicação:**
- `req.headers.authorization?.startsWith("Bearer ")`: formato `Authorization: Bearer <token>`.
- `verifyAccessToken` dentro de `try/catch`: **qualquer** problema (adulterado, expirado, assinado com outra chave) vira o **mesmo** `401`, sem detalhes úteis a um atacante.
- Como é `async` e o Express 5 trata a rejeição, basta `throw`.
- `req.user = user`: o **mesmo** objeto `req` chega ao controller. É assim que um middleware "entrega" dados adiante.

### Uma primeira rota protegida: `GET /users/me`

`src/controllers/users.controller.js` (versão 1):
```js
// GET /users/me
export function me(req, res) {
  res.json({ data: req.user }); // req.user foi montado pelo middleware authenticate
}
```

`src/routes/users.routes.js` (versão 1):
```js
import { Router } from "express";
import * as controller from "../controllers/users.controller.js";
import { authenticate } from "../middlewares/authenticate.js";

const router = Router();

// Todas as rotas deste arquivo exigem usuário autenticado.
router.use(authenticate);

router.get("/me", controller.me);

export default router;
```

`router.use(authenticate)` aplica o middleware a **todas** as rotas deste router.

`src/routes/index.js` (versão 3):
```js
import { Router } from "express";
import authRoutes from "./auth.routes.js";
import usersRoutes from "./users.routes.js";

const router = Router();

router.get("/health", (req, res) => res.json({ status: "ok" }));

router.use("/auth", authRoutes);
router.use("/users", usersRoutes);

export default router;
```

## 12.4 Testando
```bash
# 1) pegue um accessToken fazendo login (copie o valor)
# 2) rota protegida COM token
curl http://localhost:3000/users/me -H "Authorization: Bearer COLE_O_ACCESS_TOKEN"
# {"data":{"id":"...","name":"Maria","email":"...","roles":["USER"],"permissions":[], ...}}

# 3) SEM token  -> 401 "Token de acesso ausente"
curl -i http://localhost:3000/users/me

# 4) token adulterado (acrescente uma letra) -> 401 "Token de acesso inválido ou expirado"
```
Para ver a **expiração**: coloque `ACCESS_TOKEN_EXPIRES_IN=10s` no `.env`, reinicie, faça login, espere 11 segundos e repita a chamada: `401`. Depois volte para `15m`.

### 📌 Commit 7
```bash
git add .
git commit -m "feat: add authentication middleware and /users/me"
```

### ✅ Checkpoint da Fase 12
Você deve saber: o que é middleware e por que a **ordem** importa; o caminho `Request → middleware → JWT → req.user → controller`; por que o `authenticate` consulta o banco; por que todos os erros do token viram o mesmo 401; o que `next()` faz.

---

# FASE 13: Refresh Token Rotation e Reuse Detection

## 13.1 A rotação

**Rotação:** cada refresh token vale para **um único uso**. Ao usá-lo, o servidor o **invalida** e entrega um **novo**.

```text
Login
   ↓
Refresh Token A  (linha no banco, revoked_at = NULL)         ← cookie
   ↓
Cliente chama POST /auth/refresh (cookie com A)
   ↓
Servidor valida A: assinatura, hash, existe, não revogado, não expirado
   ↓
A é invalidado  (revoked_at = agora)
   ↓
Novo Refresh Token B (mesma família) + novo Access Token
   ↓
Cookie atualizado (agora B)
```

**Por que rotacionar?** Sem rotação, um refresh token roubado funciona por **7 dias** sem que ninguém perceba. Com rotação, ele só funciona **até o próximo uso** de quem o tem, e qualquer uso duplicado é detectável.

## 13.2 Reuse detection

**O problema:** alguém roubou o token A. Pode acontecer que:
1. o **dono** use A primeiro (A→B) e depois o **ladrão** apresente A; ou
2. o **ladrão** use A primeiro (A→B') e depois o **dono** apresente A.

Nos dois casos, **A aparece de novo depois de já ter sido usado**: isso nunca acontece num uso normal. É a assinatura do roubo (ou de um cliente defeituoso).

**Como detectar:** o token A existe no banco e tem `revoked_at` preenchido.

**O que fazer:** **revogar a família inteira**, ou seja, todos os refresh tokens daquela sessão, incluindo o B (que pode estar com o ladrão **ou** com o dono). O servidor **não sabe quem é quem**, então o caminho seguro é encerrar a sessão: o dono faz login de novo; o ladrão perde o acesso.

**Por que "família"?** Cada login cria uma família. Se o reuso derrubasse **todos** os tokens do usuário (como no projeto do Dave), o roubo de um celular encerraria também a sessão do notebook. Com famílias, só a sessão comprometida cai. (Se preferir mais rigor, basta revogar por `userId`; é uma troca entre segurança e conveniência.)

**Limite honesto:** se o ladrão usar o token e o dono **nunca mais** voltar, nada é detectado. Rotação reduz o risco, não o elimina.

```text
Linha do tempo (mesma família F):
 t0  login            → A emitido
 t1  dono usa A       → A revogado, B emitido
 t2  ladrão usa A     → A já está revogado → REUSO → família F inteira revogada (A e B)
 t3  dono usa B       → B revogado → 401 → dono precisa logar de novo
```

## 13.3 Corrida entre requisições

E se duas requisições **simultâneas** apresentarem o mesmo token (duas abas)? Se fizéssemos "consulta se está livre → depois revoga", as duas poderiam passar. A solução está em tornar o "consumo" **atômico**:

```js
const { count } = await tx.refreshToken.updateMany({
  where: { id, revokedAt: null },   // só atualiza SE ainda estiver livre
  data: { revokedAt: new Date() },
});
// count === 1 → eu consegui consumir;  count === 0 → alguém chegou antes
```
O banco garante que, entre duas atualizações concorrentes, só **uma** encontra `revoked_at IS NULL`. A perdedora é tratada como reuso. (Consequência aceitável: um cliente que dispara dois refresh simultâneos perde a sessão e precisa logar de novo; a solução no front é **serializar** as renovações.)

## 13.4 Arquivos

### `src/services/session.service.js`
**O que é:** o gerenciamento de **sessões**: `refresh` (esta fase) e `logout` (Fase 14, está no final do mesmo arquivo).

```js
import { env } from "../config/env.js";
import { prisma } from "../lib/prisma.js";
import { AppError } from "../utils/AppError.js";
import { sha256, safeEqual } from "../utils/hash.js";
import { signAccessToken } from "./token.service.js";
import { issueRefreshToken, verifyRefreshToken, revokeFamily } from "./refresh-token.service.js";

// ---------------------------------------------------------------------------
// REFRESH (rotação + detecção de reuso)
// ---------------------------------------------------------------------------
export async function refresh(token) {
  const invalid = () => AppError.unauthorized("Refresh token inválido ou expirado");

  // 1) Assinatura e expiração (barra tokens forjados/vencidos sem tocar no banco)
  let payload;
  try {
    payload = verifyRefreshToken(token);
  } catch {
    throw invalid();
  }
  if (typeof payload.jti !== "string") throw invalid();

  // 2) O token existe no banco? (jti = id da linha)
  const stored = await prisma.refreshToken.findUnique({ where: { id: payload.jti } });
  if (!stored || stored.userId !== payload.sub) throw invalid();

  // 3) O hash do token apresentado confere com o guardado?
  if (!safeEqual(sha256(token), stored.tokenHash)) throw invalid();

  // 4) REUSE DETECTION: token já usado/revogado sendo apresentado de novo.
  //    Pode ser um ladrão (ou o dono com um token velho). Não dá para saber,
  //    então encerramos a sessão inteira (todos os tokens da família).
  if (stored.revokedAt) {
    await revokeFamily(stored.familyId);
    if (!env.isTest) console.warn(`[security] Reuso de refresh token detectado (user=${stored.userId}, family=${stored.familyId})`);
    throw invalid();
  }

  // 5) ROTAÇÃO: consome o token antigo e emite o novo, em UMA transação.
  //    O updateMany só altera se revokedAt ainda for NULL; se duas requisições
  //    chegarem juntas com o mesmo token, só UMA consegue (count === 1).
  const newRefreshToken = await prisma.$transaction(async (tx) => {
    const { count } = await tx.refreshToken.updateMany({
      where: { id: stored.id, revokedAt: null },
      data: { revokedAt: new Date() },
    });
    if (count === 0) return null; // outra requisição consumiu primeiro
    return issueRefreshToken({ userId: stored.userId, familyId: stored.familyId, db: tx });
  });

  if (!newRefreshToken) {
    await revokeFamily(stored.familyId);
    throw invalid();
  }

  return { accessToken: signAccessToken(stored.userId), refreshToken: newRefreshToken };
}

// ---------------------------------------------------------------------------
// LOGOUT (revoga a sessão no banco; o controller limpa o cookie)
// ---------------------------------------------------------------------------
export async function logout(token) {
  let payload;
  try {
    // ignoreExpiration: mesmo um token vencido deve poder encerrar a sessão
    payload = verifyRefreshToken(token, { ignoreExpiration: true });
  } catch {
    return; // token inválido: não há o que revogar (logout é idempotente)
  }
  if (typeof payload.jti !== "string") return;

  const stored = await prisma.refreshToken.findUnique({ where: { id: payload.jti } });
  if (stored && safeEqual(sha256(token), stored.tokenHash)) {
    await revokeFamily(stored.familyId);
  }
}
```

**Explicação do `refresh`, passo a passo:**
1. `verifyRefreshToken`: assinatura e expiração (barra lixo sem tocar no banco). Falhou → 401.
2. `findUnique({ id: payload.jti })`: acha a linha; confere que o `userId` bate com o `sub`.
3. `safeEqual(sha256(token), stored.tokenHash)`: o token apresentado é **exatamente** o emitido.
4. `stored.revokedAt` preenchido → **reuso**: `revokeFamily`, log de segurança e 401.
5. `$transaction`: consome o token antigo (`updateMany` condicional) **e** emite o novo, **juntos**; se emitir falhar, o consumo é desfeito.
6. Se `count === 0` (corrida) → trata como reuso.
7. Devolve novo access token e novo refresh token.

Note que **todas** as falhas respondem a mesma mensagem ("Refresh token inválido ou expirado"): não ajudamos um atacante a distinguir os casos.

### `src/controllers/auth.controller.js` (versão final)
Acrescenta `refresh` e `logout` (a explicação do `logout` fica para a Fase 14):

```js
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
```

**Explicação do `refresh`:** `req.cookies?.refreshToken` só existe por causa do **cookie-parser** (veja o `app.js` abaixo). Se não há cookie → 401. Em caso de **falha**, o `catch` manda o navegador **apagar** o cookie (`clearRefreshCookie`) e relança o erro: um cookie inválido não deve ficar sendo reenviado.

### `src/routes/auth.routes.js` (versão 3)
```js
import { Router } from "express";
import * as controller from "../controllers/auth.controller.js";
import { validate } from "../middlewares/validate.js";
import { registerBody, loginBody } from "../schemas/auth.schema.js";

const router = Router();

router.post("/register", validate({ body: registerBody }), controller.register);
router.post("/login", validate({ body: loginBody }), controller.login);
router.post("/refresh", controller.refresh); // o token vem do cookie, não do body
router.post("/logout", controller.logout);

export default router;
```

Repare que o `/refresh` **não** usa `validate`: o token vem do **cookie**, não do corpo.

### `src/app.js` (versão 2: entra o cookie-parser)
```js
import express from "express";
import cookieParser from "cookie-parser";
import { notFound, errorHandler } from "./middlewares/errorHandler.js";
import routes from "./routes/index.js";

export function createApp() {
  const app = express();

  app.use(express.json({ limit: "10kb" }));

  // Lê o header "Cookie" e preenche req.cookies (o Express não faz isso sozinho).
  app.use(cookieParser());

  app.use(routes);

  app.use(notFound);
  app.use(errorHandler);

  return app;
}
```

**Por que precisamos do `cookieParser()`:** o navegador manda `Cookie: refreshToken=eyJ...` como **uma string**. O Express não a interpreta; o cookie-parser a transforma no objeto `req.cookies`. Sem ele, `req.cookies` seria `undefined`.

## 13.5 Testando rotação e reuso

```bash
# login (guarda o cookie A)
curl -s -c a.txt -X POST http://localhost:3000/auth/login -H "Content-Type: application/json" \
  -d '{"email":"maria@example.com","password":"Senha12345"}' > /dev/null
cp a.txt old.txt          # guarda uma cópia do token A

sleep 1
# 1) uso legítimo: A -> B  (o cookie em a.txt é atualizado)
curl -s -b a.txt -c a.txt -X POST http://localhost:3000/auth/refresh
# {"data":{"accessToken":"..."}}                                  [200]

# 2) REUSO: apresentando o A antigo
curl -s -b old.txt -X POST http://localhost:3000/auth/refresh
# {"error":{"code":"UNAUTHORIZED","message":"Refresh token inválido ou expirado"}}   [401]

# 3) o B, que era legítimo, também foi derrubado
curl -s -b a.txt -X POST http://localhost:3000/auth/refresh
# 401
```

Veja a mudança no banco:
```bash
psql -U app -h localhost -d tasksdb -c "select substr(id::text,1,8) jti, substr(family_id::text,1,8) familia, revoked_at is not null revogado from refresh_tokens order by created_at;"
```
Depois do passo 1: dois tokens na **mesma família**, o primeiro `revogado = t`, o segundo `f`. Depois do passo 2: **ambos** `t`.

**Fluxo completo do refresh:**
```text
POST /auth/refresh  (Cookie: refreshToken=A)
   ↓ cookieParser            req.cookies.refreshToken
   ↓ Controller              sem cookie? 401
   ↓ Service.refresh
   ↓ jwt.verify              assinatura/expiração
   ↓ Prisma findUnique(jti)  linha existe?
   ↓ safeEqual(hash)         é este token mesmo?
   ↓ revokedAt != null?      ──sim──► REUSO: revokeFamily → 401
   ↓ não
   ↓ $transaction: updateMany(revokedAt = agora) + INSERT do novo token
   ↓ signAccessToken
   ↓ Controller              Set-Cookie (B) + { accessToken }
```

### 📌 Commit 8
```bash
git add .
git commit -m "feat: add refresh token rotation with reuse detection"
```

### ✅ Checkpoint da Fase 13
Você deve saber: o que é rotação e por que existe; o que é reuse detection e por que revogamos a **família**; os dois cenários de roubo; por que o `updateMany` condicional resolve a corrida; por que todas as falhas devolvem a mesma mensagem; por que o cookie é limpo quando o refresh falha; a limitação da técnica.

---

# FASE 14: Logout seguro

## 14.1 Por que apagar o cookie não basta

Limpar o cookie só remove o token **do navegador**. Se alguém já copiou o refresh token, ele **continua válido** no servidor até expirar. Um logout de verdade **revoga a sessão no servidor** (e depois limpa o cookie, por conveniência).

```text
Cliente ── POST /auth/logout (cookie com o refresh token)
   ↓
Servidor identifica o refresh token (verifica assinatura, acha a linha, confere o hash)
   ↓
Revoga a FAMÍLIA inteira (revoked_at em todos os tokens ativos daquela sessão)
   ↓
Limpa o cookie (Set-Cookie com validade no passado)
   ↓
Usuário não consegue mais renovar a sessão (refresh → 401)
```

## 14.2 O código

A função `logout` já está no final de `session.service.js`; o controller, em `auth.controller.js`, e a rota em `auth.routes.js` (versão 3). Veja o essencial:

```js
// ---------------------------------------------------------------------------
// LOGOUT (revoga a sessão no banco; o controller limpa o cookie)
// ---------------------------------------------------------------------------
export async function logout(token) {
  let payload;
  try {
    // ignoreExpiration: mesmo um token vencido deve poder encerrar a sessão
    payload = verifyRefreshToken(token, { ignoreExpiration: true });
  } catch {
    return; // token inválido: não há o que revogar (logout é idempotente)
  }
  if (typeof payload.jti !== "string") return;

  const stored = await prisma.refreshToken.findUnique({ where: { id: payload.jti } });
  if (stored && safeEqual(sha256(token), stored.tokenHash)) {
    await revokeFamily(stored.familyId);
  }
}
```

**Explicação:**
- `ignoreExpiration: true`: um token **vencido** ainda deve poder encerrar a sessão (lembre-se: `verifyRefreshToken` normalmente rejeita tokens vencidos).
- Token inválido → apenas retorna: **logout é idempotente** (repetir não é erro). O controller responde `204` de qualquer forma e limpa o cookie.
- Só revoga se o **hash** confere.
- **Limite importante:** o **access token** já emitido continua válido até expirar (≤ 15 min), pois JWT é stateless. É por isso que ele é curto, e por isso o front-end também deve **descartá-lo da memória** ao sair.

## 14.3 Testando
```bash
curl -s -c b.txt -X POST http://localhost:3000/auth/login -H "Content-Type: application/json" \
  -d '{"email":"maria@example.com","password":"Senha12345"}' > /dev/null

curl -i -b b.txt -X POST http://localhost:3000/auth/logout
# HTTP/1.1 204 No Content
# Set-Cookie: refreshToken=; Path=/auth; Expires=Thu, 01 Jan 1970 00:00:00 GMT; HttpOnly; SameSite=Strict

curl -s -b b.txt -X POST http://localhost:3000/auth/refresh
# 401: mesmo mandando o cookie antigo de volta, o servidor recusa
```

### 📌 Commit 9
```bash
git add .
git commit -m "feat: add secure logout"
```

### ✅ Checkpoint da Fase 14
Você deve saber: por que apagar o cookie não basta; o que o logout faz no banco; por que é idempotente; por que o access token ainda vale por alguns minutos; como testar que o refresh falha após o logout.

---

# FASE 15: Tarefas (a regra do dono)

## 15.1 A regra de negócio

| Quem | Pode |
|---|---|
| **Qualquer usuário autenticado** | **criar**, **listar**, **ver**, **atualizar** e **excluir** as **suas próprias** tarefas |
| **Usuário comum** | **não** vê nem altera tarefas de outros |
| **ADMIN** (ou quem tiver a permission) | administra tarefas **de outros**: `tasks:read:any`, `tasks:write:any`, `tasks:delete:any` |

Em palavras: **o dono sempre pode; os demais precisam da permission `*:any` correspondente.**

**Onde essa regra mora?** No **service** (`tasks.service.js`), em **uma função** (`findTaskForUser`) usada por leitura, alteração e exclusão. Controllers não decidem nada.

**404 em vez de 403 para tarefa alheia.** Se Ana pede a tarefa de Bia e respondemos `403 Forbidden`, confirmamos que **essa tarefa existe**. Respondendo `404`, para Ana a tarefa simplesmente **não existe**. Já para recursos cuja existência não é segredo (ex.: `GET /roles`) o código certo é `403`. Resumo: **401** = não sei quem é você · **403** = sei quem é, mas não pode · **404** = não existe (para você).

**Paginação:** `GET /tasks?page=2&limit=20`. Sem ela, uma lista de 100 mil tarefas viraria uma resposta gigante. No Prisma: `skip: (page - 1) * limit` e `take: limit`, mais um `count` para o total. As duas consultas rodam juntas em `$transaction([...])`, para o total e a página serem consistentes.

## 15.2 Arquivos

### `src/schemas/tasks.schema.js`
```js
import { z } from "zod";
import { paginationQuery } from "./common.schema.js";

const title = z.string().trim().min(1, "O título é obrigatório").max(150);
const description = z.string().trim().max(2000);

export const createTaskBody = z.object({
  title,
  description: description.optional(),
});

// PATCH = atualização parcial: todos os campos são opcionais, mas pelo menos
// um deve ser enviado.
export const updateTaskBody = z
  .object({
    title: title.optional(),
    description: description.nullable().optional(),
    completed: z.boolean().optional(),
  })
  .refine((body) => Object.keys(body).length > 0, "Envie ao menos um campo para atualizar");

export const listTasksQuery = paginationQuery.extend({
  // Atenção: z.coerce.boolean() transformaria o texto "false" em true!
  // Por isso aceitamos só "true"/"false" e convertemos manualmente.
  completed: z.enum(["true", "false"]).transform((v) => v === "true").optional(),
  scope: z.enum(["own", "all"]).default("own"),
});
```

**Explicação:** `createTaskBody` exige `title`. `updateTaskBody` (PATCH) torna tudo opcional, mas `refine` exige **pelo menos um** campo. `listTasksQuery` estende a paginação com `completed` e `scope`. **Cuidado clássico:** `z.coerce.boolean()` transformaria o texto `"false"` em `true` (qualquer string não vazia é "verdadeira" em JavaScript). Por isso aceitamos só `"true"`/`"false"` e convertemos na mão.

### `src/services/tasks.service.js`
```js
import { prisma } from "../lib/prisma.js";
import { AppError } from "../utils/AppError.js";
import { PERMISSIONS } from "../config/rbac.js";
import { hasPermission } from "./authContext.service.js";

// ---------------------------------------------------------------------------
// REGRA DE AUTORIZAÇÃO DAS TAREFAS
//   - O DONO da tarefa sempre pode ler/alterar/excluir.
//   - Quem NÃO é o dono precisa da permission "*:any" correspondente
//     (o ADMIN a recebe através da role).
//   - Se não puder, respondemos 404 (e não 403): para esse usuário a tarefa
//     "não existe", então não revelamos se o id pertence a outra pessoa.
// ---------------------------------------------------------------------------
async function findTaskForUser(user, taskId, permissionForOthers) {
  const task = await prisma.task.findUnique({ where: { id: taskId } });
  if (!task) throw AppError.notFound("Tarefa não encontrada");

  const isOwner = task.userId === user.id;
  if (!isOwner && !hasPermission(user, permissionForOthers)) {
    throw AppError.notFound("Tarefa não encontrada");
  }
  return task;
}

export async function listTasks(user, { page, limit, completed, scope }) {
  if (scope === "all" && !hasPermission(user, PERMISSIONS.TASKS_READ_ANY)) {
    throw AppError.forbidden("Você não tem permissão para listar tarefas de todos os usuários");
  }

  // where dinâmico: só inclui os filtros que foram informados
  const where = {
    ...(scope === "own" && { userId: user.id }),
    ...(completed !== undefined && { completed }),
  };

  const [items, total] = await prisma.$transaction([
    prisma.task.findMany({
      where,
      skip: (page - 1) * limit,
      take: limit,
      orderBy: { createdAt: "desc" },
      // no escopo "all" mostramos quem é o dono de cada tarefa
      ...(scope === "all" && { include: { user: { select: { id: true, name: true, email: true } } } }),
    }),
    prisma.task.count({ where }),
  ]);

  return { data: items, meta: { page, limit, total, totalPages: Math.ceil(total / limit) } };
}

export function getTask(user, taskId) {
  return findTaskForUser(user, taskId, PERMISSIONS.TASKS_READ_ANY);
}

export function createTask(user, { title, description }) {
  // O dono é SEMPRE o usuário autenticado. Mesmo que o cliente envie "userId"
  // no body, o schema Zod descarta campos desconhecidos (evita "mass assignment").
  return prisma.task.create({ data: { title, description, userId: user.id } });
}

export async function updateTask(user, taskId, changes) {
  await findTaskForUser(user, taskId, PERMISSIONS.TASKS_WRITE_ANY);
  return prisma.task.update({ where: { id: taskId }, data: changes });
}

export async function deleteTask(user, taskId) {
  await findTaskForUser(user, taskId, PERMISSIONS.TASKS_DELETE_ANY);
  await prisma.task.delete({ where: { id: taskId } });
}
```

**Explicação:**
- `findTaskForUser(user, taskId, permissionForOthers)`: busca a tarefa; se não existe → 404; se o usuário **não é o dono** e **não tem** a permission → **também 404**. Tudo o que é "acessar uma tarefa específica" passa por aqui.
- `listTasks`: `scope=own` (padrão) filtra por `userId`; `scope=all` exige `tasks:read:any` (senão **403**, aqui o recurso "lista geral" não é segredo). O `where` é montado dinamicamente com *spread condicional*: só inclui filtros que foram informados.
- `createTask`: o dono é **sempre** `user.id` (o usuário autenticado). Mesmo que o cliente envie `"userId"` no corpo, o schema já o descartou: isso evita *mass assignment* (criar tarefa "em nome" de outro).
- `updateTask`/`deleteTask` primeiro validam o acesso e só então chamam `prisma.task.update/delete`.

### `src/controllers/tasks.controller.js`
```js
import * as tasksService from "../services/tasks.service.js";

// GET /tasks
export async function list(req, res) {
  const { data, meta } = await tasksService.listTasks(req.user, req.validated.query);
  res.json({ data, meta });
}

// GET /tasks/:id
export async function getById(req, res) {
  res.json({ data: await tasksService.getTask(req.user, req.validated.params.id) });
}

// POST /tasks
export async function create(req, res) {
  const task = await tasksService.createTask(req.user, req.validated.body);
  res.status(201).json({ data: task });
}

// PATCH /tasks/:id
export async function update(req, res) {
  const task = await tasksService.updateTask(req.user, req.validated.params.id, req.validated.body);
  res.json({ data: task });
}

// DELETE /tasks/:id
export async function remove(req, res) {
  await tasksService.deleteTask(req.user, req.validated.params.id);
  res.status(204).end();
}
```

Observe como é **fino**: lê `req.user` e `req.validated`, chama o service e responde. `204 No Content` no DELETE: deu certo e não há corpo.

### `src/routes/tasks.routes.js`
```js
import { Router } from "express";
import * as controller from "../controllers/tasks.controller.js";
import { authenticate } from "../middlewares/authenticate.js";
import { validate } from "../middlewares/validate.js";
import { idParam } from "../schemas/common.schema.js";
import { createTaskBody, updateTaskBody, listTasksQuery } from "../schemas/tasks.schema.js";

const router = Router();

// Qualquer usuário autenticado pode usar as tarefas; a regra "dono ou permission
// *:any" é aplicada dentro do service (depende da tarefa acessada).
router.use(authenticate);

router.get("/", validate({ query: listTasksQuery }), controller.list);
router.post("/", validate({ body: createTaskBody }), controller.create);
router.get("/:id", validate({ params: idParam }), controller.getById);
router.patch("/:id", validate({ params: idParam, body: updateTaskBody }), controller.update);
router.delete("/:id", validate({ params: idParam }), controller.remove);

export default router;
```

Ordem dentro de cada rota: `authenticate` (no `router.use`) → `validate` → controller.

### `src/routes/index.js` (versão 4)
```js
import { Router } from "express";
import authRoutes from "./auth.routes.js";
import usersRoutes from "./users.routes.js";
import tasksRoutes from "./tasks.routes.js";

const router = Router();

router.get("/health", (req, res) => res.json({ status: "ok" }));

router.use("/auth", authRoutes);
router.use("/users", usersRoutes);
router.use("/tasks", tasksRoutes);

export default router;
```

## 15.3 Testando

```bash
# login e guarda o token em uma variável (bash; no Windows use Git Bash ou o Postman)
TOKEN=$(curl -s -X POST http://localhost:3000/auth/login -H "Content-Type: application/json" \
  -d '{"email":"maria@example.com","password":"Senha12345"}' | node -pe "JSON.parse(require('fs').readFileSync(0)).data.accessToken")

# criar
curl -s -X POST http://localhost:3000/tasks -H "Content-Type: application/json" -H "Authorization: Bearer $TOKEN" \
  -d '{"title":"Estudar Prisma","description":"fases 4 a 8"}'

# listar (com filtro e paginação)
curl -s "http://localhost:3000/tasks?completed=false&page=1&limit=10" -H "Authorization: Bearer $TOKEN"

# atualizar (PATCH parcial)
curl -s -X PATCH http://localhost:3000/tasks/ID_DA_TAREFA -H "Content-Type: application/json" \
  -H "Authorization: Bearer $TOKEN" -d '{"completed":true}'

# scope=all como usuário comum -> 403
curl -s -i "http://localhost:3000/tasks?scope=all" -H "Authorization: Bearer $TOKEN"
```
Cadastre uma **segunda** conta, faça login com ela e tente `GET /tasks/ID_DA_TAREFA_DA_MARIA`: **404**.

**Fluxo de uma rota protegida (`PATCH /tasks/:id`):**
```text
PATCH /tasks/:id  + Authorization: Bearer <jwt>
   ↓ authenticate     JWT válido → usuário + roles + permissions → req.user
   ↓ validate         :id é UUID? o body é válido e não vazio? → req.validated
   ↓ Controller       update
   ↓ Service          findTaskForUser: dono? OU tem tasks:write:any?  (senão 404)
   ↓ Prisma           task.update
   ↓ PostgreSQL       UPDATE ... ; updated_at atualizado pelo @updatedAt
   ↓ Controller       200 { data: tarefa }
```

### 📌 Commit 10
```bash
git add .
git commit -m "feat: add tasks with ownership rule"
```

### ✅ Checkpoint da Fase 15
Você deve saber: a regra do dono e das permissions `*:any`; por que a regra fica no service; 404 x 403 para tarefa alheia; mass assignment; skip/take/count; a armadilha do `coerce.boolean`; a diferença entre `PATCH` e `PUT`.

---

# FASE 16: Autorização com roles e permissions

## 16.1 Visão geral

```text
JWT válido
   ↓
Usuário identificado (req.user)
   ↓
Tem a role necessária?            → requireRole("ADMIN")
   ↓
Tem a permission necessária?      → requirePermission("roles:read")
   ↓
(dentro do service) é o dono do recurso?
   ↓
Pode executar a ação?
```
Repetindo, porque é o ponto central: **autenticação = quem é você; autorização = o que você pode fazer.** Um usuário pode estar perfeitamente autenticado e **não** ter permissão.

**Por que middlewares de autorização (e não `if` nos controllers):** uma regra declarada **na rota** (`requirePermission(PERMISSIONS.USERS_READ)`) é visível de relance, está em **um** lugar e não depende de alguém lembrar de escrever o `if` dentro do controller.

**Roles x permissions na prática:** preferimos exigir **permissions** nas rotas (`users:read`) e dar permissions às **roles**. Assim, criar a role `SUPPORT` com `users:read` não exige mexer em nenhuma rota. `requireRole` existe para os casos em que o próprio papel é a regra.

**Permission direta:** além das roles, um usuário pode receber uma permission **sozinha** (ex.: dar `tasks:read:any` a uma pessoa de suporte sem torná-la ADMIN). A permission efetiva é a **união** de ambas.

## 16.2 Arquivos

### `src/middlewares/authorize.js`
```js
import { AppError } from "../utils/AppError.js";
import { hasAnyRole, hasPermission } from "../services/authContext.service.js";

// AUTORIZAÇÃO: "o que você pode fazer?"
// Sempre vêm DEPOIS do authenticate (que preenche req.user).

// Libera se o usuário tiver QUALQUER uma das roles informadas.
export const requireRole = (...roles) => (req, res, next) => {
  if (!hasAnyRole(req.user, roles)) throw AppError.forbidden();
  next();
};

// Libera se o usuário tiver a permission (direta ou herdada de alguma role).
export const requirePermission = (permission) => (req, res, next) => {
  if (!hasPermission(req.user, permission)) throw AppError.forbidden();
  next();
};
```

**Explicação:** **fábricas** de middleware: `requirePermission("x")` **devolve** a função `(req, res, next)`. Isso é necessário porque um middleware do Express só recebe `req, res, next`; para "parametrizar" (qual permission?) usamos uma função que **lembra** o argumento (*closure*). Sempre vêm **depois** do `authenticate` (que cria `req.user`). Sem a permission → `AppError.forbidden()` → **403**.

### `src/schemas/rbac.schema.js`
```js
import { z } from "zod";

const roleName = z.string().trim().toUpperCase().min(1).max(50);
const permissionName = z.string().trim().toLowerCase().min(1).max(100);

export const assignRoleBody = z.object({ role: roleName });
export const assignPermissionBody = z.object({ permission: permissionName });

export const userRoleParams = z.object({ id: z.uuid(), role: roleName });
export const userPermissionParams = z.object({ id: z.uuid(), permission: permissionName });
```

Normaliza roles para MAIÚSCULAS e permissions para minúsculas (`admin` e `ADMIN` viram `ADMIN`).

### `src/services/rbac.service.js`
```js
import { prisma } from "../lib/prisma.js";
import { AppError } from "../utils/AppError.js";
import { ROLES } from "../config/rbac.js";
import { getAuthContext } from "./authContext.service.js";

// ---------------------------------------------------------------------------
// Consultas
// ---------------------------------------------------------------------------
export async function listRoles() {
  const roles = await prisma.role.findMany({
    orderBy: { name: "asc" },
    include: { permissions: { include: { permission: true } } },
  });
  return roles.map((r) => ({
    id: r.id,
    name: r.name,
    description: r.description,
    permissions: r.permissions.map((rp) => rp.permission.name).sort(),
  }));
}

export function listPermissions() {
  return prisma.permission.findMany({
    orderBy: { name: "asc" },
    select: { id: true, name: true, description: true },
  });
}

// ---------------------------------------------------------------------------
// Atribuição de roles e permissions
// ---------------------------------------------------------------------------
async function findUserOrThrow(id) {
  const user = await prisma.user.findUnique({ where: { id }, select: { id: true } });
  if (!user) throw AppError.notFound("Usuário não encontrado");
}
async function findRoleOrThrow(name) {
  const role = await prisma.role.findUnique({ where: { name } });
  if (!role) throw AppError.notFound(`Role "${name}" não encontrada`);
  return role;
}
async function findPermissionOrThrow(name) {
  const permission = await prisma.permission.findUnique({ where: { name } });
  if (!permission) throw AppError.notFound(`Permission "${name}" não encontrada`);
  return permission;
}

export async function assignRole(userId, roleName) {
  await findUserOrThrow(userId);
  const role = await findRoleOrThrow(roleName);
  await prisma.userRole.upsert({
    where: { userId_roleId: { userId, roleId: role.id } }, // chave composta
    update: {},
    create: { userId, roleId: role.id },
  });
  return getAuthContext(userId);
}

export async function removeRole(actorId, userId, roleName) {
  // Regra de negócio: evita que o admin se "tranque para fora" do sistema.
  if (actorId === userId && roleName === ROLES.ADMIN) {
    throw AppError.conflict("Você não pode remover o seu próprio papel de ADMIN");
  }
  await findUserOrThrow(userId);
  const role = await findRoleOrThrow(roleName);
  await prisma.userRole.deleteMany({ where: { userId, roleId: role.id } });
}

export async function grantPermission(userId, permissionName) {
  await findUserOrThrow(userId);
  const permission = await findPermissionOrThrow(permissionName);
  await prisma.userPermission.upsert({
    where: { userId_permissionId: { userId, permissionId: permission.id } },
    update: {},
    create: { userId, permissionId: permission.id },
  });
  return getAuthContext(userId);
}

export async function revokePermission(userId, permissionName) {
  await findUserOrThrow(userId);
  const permission = await findPermissionOrThrow(permissionName);
  await prisma.userPermission.deleteMany({ where: { userId, permissionId: permission.id } });
}
```

**Explicação:**
- `listRoles` usa `include` aninhado e devolve só os **nomes** das permissions.
- `assignRole`/`grantPermission` usam **`upsert`** com a chave composta (`userId_roleId`): se o par já existe, nada muda (**idempotente**); devolvem o contexto atualizado do usuário.
- `removeRole`/`revokePermission` usam `deleteMany` (não falha se não existir).
- **Regra de negócio de proteção:** um admin **não** pode remover o **próprio** `ADMIN` (`409`), senão poderia trancar o sistema sem administradores.

### `src/controllers/rbac.controller.js`
```js
import * as rbacService from "../services/rbac.service.js";

// GET /roles
export async function listRoles(req, res) {
  res.json({ data: await rbacService.listRoles() });
}

// GET /permissions
export async function listPermissions(req, res) {
  res.json({ data: await rbacService.listPermissions() });
}
```

### `src/routes/rbac.routes.js`
```js
import { Router } from "express";
import * as controller from "../controllers/rbac.controller.js";
import { authenticate } from "../middlewares/authenticate.js";
import { requirePermission } from "../middlewares/authorize.js";
import { PERMISSIONS } from "../config/rbac.js";

export const rolesRouter = Router();
rolesRouter.get("/", authenticate, requirePermission(PERMISSIONS.ROLES_READ), controller.listRoles);

export const permissionsRouter = Router();
permissionsRouter.get("/", authenticate, requirePermission(PERMISSIONS.PERMISSIONS_READ), controller.listPermissions);
```

### `src/controllers/users.controller.js` (versão final)
```js
import * as usersService from "../services/users.service.js";
import * as rbacService from "../services/rbac.service.js";

// GET /users/me
export function me(req, res) {
  res.json({ data: req.user }); // req.user foi montado pelo middleware authenticate
}

// GET /users
export async function list(req, res) {
  const { data, meta } = await usersService.listUsers(req.validated.query);
  res.json({ data, meta });
}

// GET /users/:id
export async function getById(req, res) {
  res.json({ data: await usersService.getUserById(req.validated.params.id) });
}

// POST /users/:id/roles
export async function assignRole(req, res) {
  const user = await rbacService.assignRole(req.validated.params.id, req.validated.body.role);
  res.json({ data: user });
}

// DELETE /users/:id/roles/:role
export async function removeRole(req, res) {
  const { id, role } = req.validated.params;
  await rbacService.removeRole(req.user.id, id, role);
  res.status(204).end();
}

// POST /users/:id/permissions
export async function grantPermission(req, res) {
  const user = await rbacService.grantPermission(req.validated.params.id, req.validated.body.permission);
  res.json({ data: user });
}

// DELETE /users/:id/permissions/:permission
export async function revokePermission(req, res) {
  const { id, permission } = req.validated.params;
  await rbacService.revokePermission(id, permission);
  res.status(204).end();
}
```

### `src/services/users.service.js`
```js
import { prisma } from "../lib/prisma.js";
import { AppError } from "../utils/AppError.js";
import { getAuthContext } from "./authContext.service.js";

export async function listUsers({ page, limit }) {
  // $transaction com um array executa as duas consultas juntas, de forma consistente.
  const [items, total] = await prisma.$transaction([
    prisma.user.findMany({
      skip: (page - 1) * limit, // pula os registros das páginas anteriores
      take: limit,              // quantos registros trazer
      orderBy: { createdAt: "desc" },
      select: {
        id: true, name: true, email: true, createdAt: true,
        roles: { select: { role: { select: { name: true } } } },
      },
    }),
    prisma.user.count(),
  ]);

  const data = items.map((u) => ({ ...u, roles: u.roles.map((r) => r.role.name).sort() }));
  return { data, meta: { page, limit, total, totalPages: Math.ceil(total / limit) } };
}

export async function getUserById(id) {
  const user = await getAuthContext(id);
  if (!user) throw AppError.notFound("Usuário não encontrado");
  return user;
}
```

### `src/routes/users.routes.js` (versão final)
```js
import { Router } from "express";
import * as controller from "../controllers/users.controller.js";
import { authenticate } from "../middlewares/authenticate.js";
import { requirePermission } from "../middlewares/authorize.js";
import { validate } from "../middlewares/validate.js";
import { PERMISSIONS } from "../config/rbac.js";
import { idParam, paginationQuery } from "../schemas/common.schema.js";
import {
  assignRoleBody, assignPermissionBody, userRoleParams, userPermissionParams,
} from "../schemas/rbac.schema.js";

const router = Router();

// Todas as rotas deste arquivo exigem usuário autenticado.
router.use(authenticate);

// "/me" precisa vir ANTES de "/:id", senão "me" seria interpretado como um id.
router.get("/me", controller.me);

router.get("/", requirePermission(PERMISSIONS.USERS_READ), validate({ query: paginationQuery }), controller.list);
router.get("/:id", requirePermission(PERMISSIONS.USERS_READ), validate({ params: idParam }), controller.getById);

router.post(
  "/:id/roles",
  requirePermission(PERMISSIONS.ROLES_ASSIGN),
  validate({ params: idParam, body: assignRoleBody }),
  controller.assignRole,
);
router.delete(
  "/:id/roles/:role",
  requirePermission(PERMISSIONS.ROLES_ASSIGN),
  validate({ params: userRoleParams }),
  controller.removeRole,
);

router.post(
  "/:id/permissions",
  requirePermission(PERMISSIONS.PERMISSIONS_ASSIGN),
  validate({ params: idParam, body: assignPermissionBody }),
  controller.grantPermission,
);
router.delete(
  "/:id/permissions/:permission",
  requirePermission(PERMISSIONS.PERMISSIONS_ASSIGN),
  validate({ params: userPermissionParams }),
  controller.revokePermission,
);

export default router;
```

**Atenção à ordem:** `"/me"` vem **antes** de `"/:id"`; senão o Express leria `me` como um `:id`.

### `src/routes/index.js` (versão final)
```js
import { Router } from "express";
import authRoutes from "./auth.routes.js";
import usersRoutes from "./users.routes.js";
import tasksRoutes from "./tasks.routes.js";
import { rolesRouter, permissionsRouter } from "./rbac.routes.js";

const router = Router();

router.get("/health", (req, res) => res.json({ status: "ok" }));

router.use("/auth", authRoutes);
router.use("/users", usersRoutes);
router.use("/tasks", tasksRoutes);
router.use("/roles", rolesRouter);
router.use("/permissions", permissionsRouter);

export default router;
```

## 16.3 Testando

```bash
# login do ADMIN criado pelo seed
ADMIN=$(curl -s -X POST http://localhost:3000/auth/login -H "Content-Type: application/json" \
  -d '{"email":"admin@example.com","password":"Admin12345"}' | node -pe "JSON.parse(require('fs').readFileSync(0)).data.accessToken")

curl -s http://localhost:3000/roles -H "Authorization: Bearer $ADMIN"
curl -s http://localhost:3000/users -H "Authorization: Bearer $ADMIN"          # lista paginada

# usuário comum tentando: 403
curl -s -i http://localhost:3000/roles -H "Authorization: Bearer $TOKEN" | head -1

# promover a Maria a ADMIN (copie o id dela de /users)
curl -s -X POST http://localhost:3000/users/ID_DA_MARIA/roles -H "Content-Type: application/json" \
  -H "Authorization: Bearer $ADMIN" -d '{"role":"admin"}'

# o MESMO token da Maria ($TOKEN) agora passa em /roles, sem novo login (roles vêm do banco)
curl -s -o /dev/null -w "%{http_code}\n" http://localhost:3000/roles -H "Authorization: Bearer $TOKEN"   # 200

# permission direta
curl -s -X POST http://localhost:3000/users/ID/permissions -H "Content-Type: application/json" \
  -H "Authorization: Bearer $ADMIN" -d '{"permission":"tasks:read:any"}'

# admin tentando remover o próprio ADMIN -> 409
curl -s -X DELETE http://localhost:3000/users/ID_DO_ADMIN/roles/ADMIN -H "Authorization: Bearer $ADMIN"
```

**Fluxo de uma rota autorizada (`GET /roles`):**
```text
GET /roles + Bearer
   ↓ authenticate         req.user = { roles, permissions }
   ↓ requirePermission    "roles:read" ∈ req.user.permissions ?  não → 403 (o controller nem roda)
   ↓ Controller listRoles
   ↓ Service              Prisma role.findMany(include permissions)
   ↓ PostgreSQL
   ↓ 200 { data }
```

### 📌 Commit 11
```bash
git add .
git commit -m "feat: add role and permission authorization"
```

### ✅ Checkpoint da Fase 16
Você deve saber: authN x authZ (de novo); role x permission; por que middlewares de autorização e não `if` nos controllers; o que é uma fábrica de middleware e closure; permission direta x via role (união); por que promover um usuário vale na hora; por que `upsert` e `deleteMany` são idempotentes; a regra de não remover o próprio ADMIN; 401 x 403.

---

# FASE 17: Helmet e CORS

## 17.1 Helmet

**O que é:** um middleware que define **headers HTTP de segurança** na resposta. **Problema que resolve:** o Express, sozinho, envia poucos headers de proteção (e ainda anuncia `X-Powered-By: Express`, que ajuda um atacante a saber qual tecnologia você usa). Os headers instruem o **navegador** a se proteger (ex.: não "adivinhar" tipos de arquivo, não permitir que sua página seja embutida em outro site).

Com `app.use(helmet())` (configuração padrão), a resposta passa a ter (medido neste projeto):

| Header | Para quê |
|---|---|
| `Content-Security-Policy` | restringe de onde a página pode carregar scripts/estilos/imagens (mitiga XSS) |
| `Strict-Transport-Security` | manda o navegador usar **só HTTPS** com este domínio (efeito só em HTTPS) |
| `X-Content-Type-Options: nosniff` | o navegador respeita o `Content-Type` declarado (sem "adivinhar") |
| `X-Frame-Options: SAMEORIGIN` | impede embutir o site em `<iframe>` de outro domínio (clickjacking) |
| `Referrer-Policy: no-referrer` | não vaza a URL de origem ao navegar para outro site |
| `Cross-Origin-Opener-Policy`, `Cross-Origin-Resource-Policy: same-origin` | isolam a página de outras origens |
| `Origin-Agent-Cluster`, `X-DNS-Prefetch-Control`, `X-Download-Options`, `X-Permitted-Cross-Domain-Policies` | endurecimentos menores |
| `X-XSS-Protection: 0` | desliga o antigo filtro XSS dos navegadores (ele próprio causava falhas) |
| *(remove)* `X-Powered-By` | para de anunciar "Express" |

**Nossa configuração: a padrão, de propósito.** Para uma API que devolve JSON, o padrão é adequado e **não precisamos ligar/desligar nada para parecer profissional**. Sobre o Swagger UI (`/docs`): conferi que a página usa apenas scripts do **mesmo domínio** (sem script inline), então o CSP padrão não a bloqueia. Se você algum dia ver erros de CSP no console do navegador em `/docs`, aí sim relaxe o CSP **só para essa rota**. Opcionais que **não** usamos: `contentSecurityPolicy` customizado (só faz sentido se a API servir HTML/estáticos com recursos externos) e `crossOriginResourcePolicy: "cross-origin"` (só se outros sites precisarem embutir recursos desta API).

## 17.2 CORS

**Origem** = protocolo + domínio + porta. `http://localhost:5173` (seu front-end) e `http://localhost:3000` (sua API) são **origens diferentes**.

**Por que existe:** o navegador aplica a **Same-Origin Policy**: o JavaScript de uma página **não pode ler** respostas de outra origem (senão um site qualquer poderia chamar a API do seu banco, aproveitando os cookies que o navegador do usuário já tem). O **CORS** é o mecanismo pelo qual o **servidor** diz ao navegador: "esta origem pode".

Pontos que costumam confundir:
- **CORS é imposto pelo navegador.** `curl`, Postman e outros servidores **ignoram** CORS. Ele **não** é uma proteção da API contra "qualquer cliente"; protege o **usuário** dentro do navegador.
- **Preflight (`OPTIONS`):** antes de requisições "não simples" (JSON, header `Authorization`, métodos como `PATCH`/`DELETE`), o navegador envia **sozinho** um `OPTIONS` perguntando "posso?". O middleware `cors` responde `204` com os headers `Access-Control-Allow-*` **antes** de a requisição chegar às rotas. `maxAge` deixa o navegador lembrar a resposta por 10 min.
- **Credentials + cookies:** para o navegador enviar/receber **cookies** em chamadas entre origens, **os dois lados** precisam consentir: o front usa `fetch(url, { credentials: "include" })` e o servidor responde `Access-Control-Allow-Credentials: true`. E, com credentials, `Access-Control-Allow-Origin` **não pode ser `*`**: precisa ser a origem **exata**.

```text
CORS  +  credentials  +  cookies  +  origin   (a relação)

Front (http://localhost:5173)  ── fetch(..., { credentials: "include" }) ──►  API
API responde:   Access-Control-Allow-Origin: http://localhost:5173     (origem EXATA, nunca *)
                Access-Control-Allow-Credentials: true
Só então o navegador aceita guardar/enviar o cookie refreshToken nessa chamada.
```

Por isso **não** usamos `cors()` sem opções (ele liberaria **qualquer** origem). Nossa configuração:
- `origin: env.FRONTEND_ORIGINS`: uma **lista** de origens permitidas (do `.env`); origem fora da lista **não recebe** header CORS e o navegador bloqueia.
- `credentials: true`, por causa do cookie do refresh token.
- `methods` e `allowedHeaders`: só o necessário.
- `maxAge: 600`.

**Cookie e SameSite:** `localhost:5173` e `localhost:3000` são o **mesmo site** (o "site" ignora a porta), então `SameSite=Strict` funciona em desenvolvimento. Em produção, front em `app.exemplo.com` e API em `api.exemplo.com` também são o mesmo *site*. Se estivessem em domínios totalmente diferentes, seria preciso `SameSite=None; Secure` e proteção CSRF adicional.

## 17.3 O `app.js` (versão 3)

```js
import express from "express";
import helmet from "helmet";
import cors from "cors";
import cookieParser from "cookie-parser";
import { env } from "./config/env.js";
import { notFound, errorHandler } from "./middlewares/errorHandler.js";
import routes from "./routes/index.js";

export function createApp() {
  const app = express();

  // 1) CORS: quais origens (sites) o navegador pode deixar chamar esta API.
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

  app.use(express.json({ limit: "10kb" }));
  app.use(cookieParser());

  app.use(routes);

  app.use(notFound);
  app.use(errorHandler);

  return app;
}
```

**Ordem:** CORS **primeiro**: assim até respostas de erro (como um 429) levam os headers CORS; sem eles, o navegador esconderia o erro real atrás de "CORS error". Helmet em seguida.

## 17.4 Testando

```bash
# origem permitida (a do .env): volta Allow-Origin com a origem exata e Allow-Credentials
curl -s -i http://localhost:3000/health -H "Origin: http://localhost:5173" | grep -i "access-control\|vary"

# origem NÃO permitida: nenhum header Access-Control-*
curl -s -i http://localhost:3000/health -H "Origin: http://evil.com" | grep -i "access-control" || echo "(nenhum header CORS)"

# preflight
curl -s -i -X OPTIONS http://localhost:3000/auth/login -H "Origin: http://localhost:5173" \
  -H "Access-Control-Request-Method: POST" -H "Access-Control-Request-Headers: content-type,authorization"
# 204 + access-control-allow-methods / allow-headers / max-age

# headers do Helmet
curl -s -i http://localhost:3000/health | grep -i "x-content-type\|x-frame\|strict-transport\|x-powered" 
```
(`x-powered-by` **não** deve aparecer.)

### 📌 Commit 12
```bash
git add .
git commit -m "feat: add helmet and cors"
```

### ✅ Checkpoint da Fase 17
Você deve saber: o que o Helmet faz e por que mantivemos a configuração padrão; o que é origem; por que o CORS existe e que **o navegador** o impõe; o que é preflight; por que `credentials` exige origem exata; como CORS, credentials, cookies e origin se relacionam; por que o CORS vem primeiro.

---

# FASE 18: Rate limiting

## 18.1 Conceito

**Rate limiting** = limitar quantas requisições um cliente (aqui, um **IP**) pode fazer numa janela de tempo. Passou do limite → **429 Too Many Requests**.

**Ataques que ele dificulta:**
- **Força bruta no login:** testar milhares de senhas para um e-mail.
- **Credential stuffing:** testar listas de e-mail/senha vazadas de outros sites.
- **Criação em massa de contas** (spam) e **abuso do refresh**.
- **Sobrecarga** simples (bots, loops com bug).

**Global x por rota:** um limite **global** generoso protege a API como um todo; limites **específicos e mais rígidos** protegem as rotas **sensíveis** (login, cadastro, refresh), onde uma tentativa a mais é mais perigosa. Um usuário normal usa o app dezenas de vezes por minuto, mas **não** erra a senha dezenas de vezes.

**Valores deste projeto (para estudo/desenvolvimento):**

| Limite | Janela | Máximo | Por quê |
|---|---|---|---|
| Global | 15 min | 300 por IP | folga para uso normal, corta abuso grosseiro |
| Login | 15 min | 10 **falhas** por IP | `skipSuccessfulRequests`: acertar a senha **não** conta |
| Cadastro | 60 min | 10 por IP | dificulta spam de contas |
| Refresh | 15 min | 60 por IP | um cliente normal renova poucas vezes |

> São valores **de estudo**. Em produção os limites dependem do tráfego real (atrás de uma empresa, centenas de pessoas dividem **um IP**) e costumam ser combinados com outras defesas (bloqueio temporário por **conta**, CAPTCHA, monitoramento). Todos vêm do `.env`, então ajustar não exige mexer no código.

## 18.2 Como o middleware funciona

A cada requisição, o `express-rate-limit`: identifica o cliente (IP) → incrementa o contador daquela janela → se passou do limite, **não chama `next()`** (chama o `handler`, que entrega o 429) → caso contrário, deixa passar e adiciona os headers `RateLimit` e `RateLimit-Policy` (ex.: `"300-in-15min"; r=299; t=900`: restam 299, janela de 900 s).

**Duas limitações para saber:** (1) o contador fica na **memória** do processo: perde-se ao reiniciar, e com várias instâncias da API cada uma conta separado (aí se usa um armazenamento compartilhado, como Redis). (2) Atrás de um proxy/balanceador, é preciso configurar `app.set("trust proxy", ...)` corretamente, senão todos os usuários parecem ter o IP do proxy. Não vamos configurar nada disso agora; é conceito.

## 18.3 Arquivos

### `src/middlewares/rateLimiters.js`
```js
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
```

**Explicação:** `standardHeaders: "draft-8"` envia os headers `RateLimit*` no formato novo; `legacyHeaders: false` desliga os antigos `X-RateLimit-*`. O `handler` **encaminha um `AppError` 429 ao `errorHandler`**, para o 429 sair no mesmo formato dos demais erros. `limit` é o máximo por janela (`windowMs`, em milissegundos).

### `src/routes/auth.routes.js` (versão final)
Agora com os limitadores **antes** da validação:

```js
import { Router } from "express";
import * as controller from "../controllers/auth.controller.js";
import { validate } from "../middlewares/validate.js";
import { loginLimiter, registerLimiter, refreshLimiter } from "../middlewares/rateLimiters.js";
import { registerBody, loginBody } from "../schemas/auth.schema.js";

const router = Router();

// ordem em cada rota: rate limit -> validação -> controller
router.post("/register", registerLimiter, validate({ body: registerBody }), controller.register);
router.post("/login", loginLimiter, validate({ body: loginBody }), controller.login);
router.post("/refresh", refreshLimiter, controller.refresh); // o token vem do cookie, não do body
router.post("/logout", controller.logout);

export default router;
```

### `src/app.js` (versão 4)
```js
import express from "express";
import helmet from "helmet";
import cors from "cors";
import cookieParser from "cookie-parser";
import { env } from "./config/env.js";
import { globalLimiter } from "./middlewares/rateLimiters.js";
import { notFound, errorHandler } from "./middlewares/errorHandler.js";
import routes from "./routes/index.js";

export function createApp() {
  const app = express();

  // 1) CORS (primeiro, para até as respostas de erro, como 429, levarem os headers CORS)
  app.use(
    cors({
      origin: env.FRONTEND_ORIGINS,
      credentials: true,
      methods: ["GET", "POST", "PATCH", "DELETE"],
      allowedHeaders: ["Content-Type", "Authorization"],
      maxAge: 600,
    }),
  );

  // 2) Helmet
  app.use(helmet());

  // 3) Rate limit global (por IP).
  app.use(globalLimiter);

  app.use(express.json({ limit: "10kb" }));
  app.use(cookieParser());

  app.use(routes);

  app.use(notFound);
  app.use(errorHandler);

  return app;
}
```

O limitador **global** vem logo depois do Helmet e **antes** de ler o corpo: se o IP está bloqueado, nem gastamos CPU lendo/validando.

## 18.4 Testando

Para ver o 429 sem fazer 10 tentativas, reduza temporariamente no `.env`: `RATE_LIMIT_LOGIN_MAX=3` (reinicie). Depois:

```bash
for i in 1 2 3 4; do
  curl -s -o /dev/null -w "tentativa $i: %{http_code}\n" -X POST http://localhost:3000/auth/login \
    -H "Content-Type: application/json" -d '{"email":"a@a.com","password":"errada"}'
done
# tentativa 1: 401   tentativa 2: 401   tentativa 3: 401   tentativa 4: 429
```
O corpo do 429: `{"error":{"code":"TOO_MANY_REQUESTS","message":"Muitas requisições. Tente novamente mais tarde."}}`. Volte o valor para `10`.

### 📌 Commit 13
```bash
git add .
git commit -m "feat: add rate limiting"
```

### ✅ Checkpoint da Fase 18
Você deve saber: o que é rate limiting e qual ataque ele dificulta; global x por rota; por que o login só conta falhas; o que significa o 429 e os headers `RateLimit`; as limitações (memória, proxy, IP compartilhado); por que os valores são "de estudo".

---

# FASE 19: Tratamento de erros: consolidando

Você já usou o sistema de erros desde a Fase 5. Aqui está o mapa completo.

```text
Route
 ↓
Controller
 ↓
Service  ──► throw AppError.xxx(...)        (esperado)
 ↓          └► erro do Prisma / bug         (esperado conhecido ou inesperado)
 ↓
(Express 5 encaminha a rejeição/exceção)
 ↓
Middleware de erro  (errorHandler)
 ↓
Response  { "error": { "code": "...", "message": "...", "details": [...] } }
```

## 19.1 Quando usar cada status

| Status | Significado | Exemplo neste projeto |
|---|---|---|
| **400** Bad Request | a requisição está **malformada ou inválida** | corpo não é JSON; e-mail inválido; `:id` não é UUID; PATCH vazio |
| **401** Unauthorized | **não sei quem é você** (credencial ausente/inválida) | sem token; token expirado; senha errada; refresh inválido ou reutilizado |
| **403** Forbidden | sei quem é, mas **não pode** | usuário comum em `/roles`; `?scope=all` sem permission |
| **404** Not Found | o recurso **não existe** (para você) | rota inexistente; tarefa que não é sua |
| **409** Conflict | conflita com o **estado atual** | e-mail já cadastrado; admin removendo o próprio ADMIN |
| **413** Payload Too Large | corpo acima do limite (10 KB) | JSON enorme |
| **429** Too Many Requests | passou do rate limit | 11ª tentativa de login errada |
| **500** Internal Server Error | **falha nossa** | bug, banco fora do ar, role USER ausente (seed não rodou) |

> O comum é confundir 401 e 403: **401** = "faça login"; **403** = "logado, mas não é permitido".

## 19.2 O que o cliente nunca vê
- stack trace e mensagens internas (ficam no **log** do servidor);
- se um e-mail existe (login devolve a mesma mensagem);
- se uma tarefa alheia existe (404);
- o **motivo** exato de um refresh token falhar (sempre a mesma mensagem).

## 19.3 Boas práticas aplicadas
1. **Um formato só** de erro, com `code` estável para o front-end tratar.
2. **Erro esperado** = `AppError`; **inesperado** = log + 500 genérico.
3. **Tratar erros do banco** onde fazem sentido de negócio (`P2002` → 409) em vez de consultar antes.
4. **Não engolir erros** (nada de `catch {}` vazio onde um erro real importa; os dois `catch` do projeto, no `refresh` e no `logout`, são intencionais e comentados).
5. **Express 5:** `async` lança → `errorHandler`; sem `try/catch` espalhado.

### ✅ Checkpoint da Fase 19
Você deve saber: o caminho de um erro até a resposta; esperado x inesperado; quando usar 400/401/403/404/409/413/429/500 (com um exemplo do projeto de cada); o que não se deve vazar numa resposta de erro.

---

# FASE 20: Documentação com OpenAPI/Swagger

## 20.1 Por que e o que documentar

Uma API sem documentação obriga cada pessoa do time (e o seu "eu do futuro") a ler o código para descobrir rotas. **OpenAPI** é um formato padrão (JSON/YAML) para descrever uma API REST; o **Swagger UI** transforma esse arquivo em uma página interativa onde dá para **ler e testar** cada endpoint.

**O que documentar:** rotas e métodos; parâmetros, corpo e resposta; **autenticação** necessária; **erros** possíveis.

**Escolha de estudo:** um objeto JavaScript escrito à mão (`src/docs/openapi.js`), servido pelo `swagger-ui-express`. (Há ferramentas que geram a documentação a partir de comentários no código; mais mágica, menos clareza para quem está aprendendo.) Em um projeto real, considere **proteger `/docs` em produção**.

## 20.2 Arquivos

### `src/docs/openapi.js`
```js
// Documentação OpenAPI 3 da API. É um objeto JavaScript simples que o
// swagger-ui-express transforma em uma página interativa (em /docs).
// O mesmo JSON fica disponível em /docs.json.

const ref = (name) => ({ $ref: `#/components/schemas/${name}` });
const json = (schema) => ({ "application/json": { schema } });
const data = (schema) => ({ type: "object", properties: { data: schema } });
const list = (schema) => ({
  type: "object",
  properties: { data: { type: "array", items: schema }, meta: ref("PageMeta") },
});
const res = (description, schema) => ({ description, ...(schema && { content: json(schema) }) });
const err = (description) => res(description, ref("Error"));
const auth = [{ bearerAuth: [] }];
const idParam = { name: "id", in: "path", required: true, schema: { type: "string", format: "uuid" } };
const pageParams = [
  { name: "page", in: "query", schema: { type: "integer", minimum: 1, default: 1 } },
  { name: "limit", in: "query", schema: { type: "integer", minimum: 1, maximum: 100, default: 20 } },
];
const body = (schema) => ({ required: true, content: json(schema) });
const E = { 400: err("Dados inválidos"), 401: err("Não autenticado"), 403: err("Sem permissão"), 404: err("Não encontrado") };

export const openapi = {
  openapi: "3.0.3",
  info: {
    title: "API de Tarefas",
    version: "1.0.0",
    description:
      "API REST com autenticação JWT, refresh token rotation (cookie HTTPOnly), roles e permissions.\n\n" +
      "Para testar rotas protegidas: faça login, copie o `accessToken` e clique em **Authorize**.",
  },
  tags: [
    { name: "Auth" }, { name: "Users" }, { name: "Tasks" }, { name: "Roles & Permissions" },
  ],
  components: {
    securitySchemes: { bearerAuth: { type: "http", scheme: "bearer", bearerFormat: "JWT" } },
    schemas: {
      Error: {
        type: "object",
        properties: {
          error: {
            type: "object",
            properties: {
              code: { type: "string", example: "VALIDATION_ERROR" },
              message: { type: "string" },
              details: { type: "array", items: { type: "object" } },
            },
          },
        },
      },
      PageMeta: {
        type: "object",
        properties: {
          page: { type: "integer" }, limit: { type: "integer" },
          total: { type: "integer" }, totalPages: { type: "integer" },
        },
      },
      User: {
        type: "object",
        properties: {
          id: { type: "string", format: "uuid" }, name: { type: "string" },
          email: { type: "string", format: "email" },
          roles: { type: "array", items: { type: "string" } },
          permissions: { type: "array", items: { type: "string" } },
          createdAt: { type: "string", format: "date-time" },
        },
      },
      Task: {
        type: "object",
        properties: {
          id: { type: "string", format: "uuid" }, title: { type: "string" },
          description: { type: "string", nullable: true }, completed: { type: "boolean" },
          userId: { type: "string", format: "uuid" },
          createdAt: { type: "string", format: "date-time" }, updatedAt: { type: "string", format: "date-time" },
        },
      },
      RegisterInput: {
        type: "object", required: ["name", "email", "password"],
        properties: {
          name: { type: "string", example: "Maria Silva" },
          email: { type: "string", format: "email", example: "maria@example.com" },
          password: { type: "string", minLength: 8, maxLength: 72, example: "Senha12345" },
        },
      },
      LoginInput: {
        type: "object", required: ["email", "password"],
        properties: { email: { type: "string", format: "email" }, password: { type: "string" } },
      },
      TaskInput: {
        type: "object", required: ["title"],
        properties: { title: { type: "string", maxLength: 150 }, description: { type: "string", maxLength: 2000 } },
      },
      TaskPatch: {
        type: "object",
        properties: {
          title: { type: "string" }, description: { type: "string", nullable: true }, completed: { type: "boolean" },
        },
      },
    },
  },
  paths: {
    "/auth/register": {
      post: {
        tags: ["Auth"], summary: "Cadastra um usuário (recebe a role USER)",
        requestBody: body(ref("RegisterInput")),
        responses: { 201: res("Criado", data(ref("User"))), 400: E[400], 409: err("E-mail já cadastrado"), 429: err("Limite de requisições") },
      },
    },
    "/auth/login": {
      post: {
        tags: ["Auth"], summary: "Login: devolve o access token e define o cookie do refresh token",
        requestBody: body(ref("LoginInput")),
        responses: {
          200: res("OK (cookie `refreshToken` HTTPOnly, Path=/auth)", data({
            type: "object",
            properties: { accessToken: { type: "string" }, user: ref("User") },
          })),
          400: E[400], 401: err("Credenciais inválidas"), 429: err("Limite de requisições"),
        },
      },
    },
    "/auth/refresh": {
      post: {
        tags: ["Auth"], summary: "Rotaciona o refresh token (usa o cookie) e devolve novo access token",
        responses: {
          200: res("OK (cookie atualizado)", data({ type: "object", properties: { accessToken: { type: "string" } } })),
          401: err("Refresh token ausente, inválido, expirado ou reutilizado"), 429: err("Limite de requisições"),
        },
      },
    },
    "/auth/logout": {
      post: { tags: ["Auth"], summary: "Revoga a sessão e limpa o cookie", responses: { 204: res("Sem conteúdo") } },
    },
    "/users/me": {
      get: { tags: ["Users"], summary: "Perfil do usuário autenticado (com roles e permissions)", security: auth, responses: { 200: res("OK", data(ref("User"))), 401: E[401] } },
    },
    "/users": {
      get: {
        tags: ["Users"], summary: "Lista usuários (permission users:read)", security: auth, parameters: pageParams,
        responses: { 200: res("OK", list(ref("User"))), 401: E[401], 403: E[403] },
      },
    },
    "/users/{id}": {
      get: {
        tags: ["Users"], summary: "Consulta um usuário (permission users:read)", security: auth, parameters: [idParam],
        responses: { 200: res("OK", data(ref("User"))), 400: E[400], 401: E[401], 403: E[403], 404: E[404] },
      },
    },
    "/users/{id}/roles": {
      post: {
        tags: ["Roles & Permissions"], summary: "Atribui uma role (permission roles:assign)", security: auth, parameters: [idParam],
        requestBody: body({ type: "object", required: ["role"], properties: { role: { type: "string", example: "ADMIN" } } }),
        responses: { 200: res("OK", data(ref("User"))), 400: E[400], 401: E[401], 403: E[403], 404: E[404] },
      },
    },
    "/users/{id}/roles/{role}": {
      delete: {
        tags: ["Roles & Permissions"], summary: "Remove uma role (permission roles:assign)", security: auth,
        parameters: [idParam, { name: "role", in: "path", required: true, schema: { type: "string" } }],
        responses: { 204: res("Removida"), 401: E[401], 403: E[403], 404: E[404], 409: err("Não pode remover o próprio ADMIN") },
      },
    },
    "/users/{id}/permissions": {
      post: {
        tags: ["Roles & Permissions"], summary: "Concede uma permission direta (permission permissions:assign)", security: auth, parameters: [idParam],
        requestBody: body({ type: "object", required: ["permission"], properties: { permission: { type: "string", example: "tasks:read:any" } } }),
        responses: { 200: res("OK", data(ref("User"))), 400: E[400], 401: E[401], 403: E[403], 404: E[404] },
      },
    },
    "/users/{id}/permissions/{permission}": {
      delete: {
        tags: ["Roles & Permissions"], summary: "Remove uma permission direta", security: auth,
        parameters: [idParam, { name: "permission", in: "path", required: true, schema: { type: "string" } }],
        responses: { 204: res("Removida"), 401: E[401], 403: E[403], 404: E[404] },
      },
    },
    "/roles": {
      get: { tags: ["Roles & Permissions"], summary: "Lista roles e suas permissions (roles:read)", security: auth, responses: { 200: res("OK"), 401: E[401], 403: E[403] } },
    },
    "/permissions": {
      get: { tags: ["Roles & Permissions"], summary: "Lista permissions (permissions:read)", security: auth, responses: { 200: res("OK"), 401: E[401], 403: E[403] } },
    },
    "/tasks": {
      get: {
        tags: ["Tasks"], summary: "Lista tarefas (padrão: só as suas; scope=all exige tasks:read:any)", security: auth,
        parameters: [
          ...pageParams,
          { name: "completed", in: "query", schema: { type: "string", enum: ["true", "false"] } },
          { name: "scope", in: "query", schema: { type: "string", enum: ["own", "all"], default: "own" } },
        ],
        responses: { 200: res("OK", list(ref("Task"))), 400: E[400], 401: E[401], 403: E[403] },
      },
      post: {
        tags: ["Tasks"], summary: "Cria uma tarefa para o usuário autenticado", security: auth,
        requestBody: body(ref("TaskInput")),
        responses: { 201: res("Criada", data(ref("Task"))), 400: E[400], 401: E[401] },
      },
    },
    "/tasks/{id}": {
      get: { tags: ["Tasks"], summary: "Consulta uma tarefa (dono ou tasks:read:any)", security: auth, parameters: [idParam], responses: { 200: res("OK", data(ref("Task"))), 400: E[400], 401: E[401], 404: E[404] } },
      patch: {
        tags: ["Tasks"], summary: "Atualiza parcialmente (dono ou tasks:write:any)", security: auth, parameters: [idParam],
        requestBody: body(ref("TaskPatch")),
        responses: { 200: res("OK", data(ref("Task"))), 400: E[400], 401: E[401], 404: E[404] },
      },
      delete: { tags: ["Tasks"], summary: "Exclui (dono ou tasks:delete:any)", security: auth, parameters: [idParam], responses: { 204: res("Excluída"), 400: E[400], 401: E[401], 404: E[404] } },
    },
  },
};
```

**Explicação:** `components.securitySchemes.bearerAuth` declara "Bearer JWT"; as rotas protegidas apontam para ele em `security`. `components.schemas` são modelos reutilizáveis (`User`, `Task`, `Error`...) referenciados por `$ref`. Pequenos helpers no topo (`res`, `err`, `data`, `list`) evitam repetição. Eu validei este documento com um validador independente de OpenAPI 3: é válido (15 paths).

### `src/app.js` (versão final)
```js
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
```

**Explicação:** `/docs.json` devolve o documento; `/docs` serve a interface. `swaggerUi.serve` entrega os arquivos estáticos da interface e `swaggerUi.setup(openapi)` a configura. As rotas de documentação ficam **antes** das rotas da API.

## 20.3 Como acessar e testar
1. `npm run dev` e abra **http://localhost:3000/docs**.
2. Execute `POST /auth/login` ("Try it out" → "Execute"), copie o `accessToken`.
3. Clique em **Authorize** (cadeado), cole o token (sem a palavra `Bearer`), confirme.
4. Teste `GET /users/me`, `POST /tasks`, etc. O refresh token vai no cookie automaticamente, porque o Swagger roda na **mesma origem** da API.

### 📌 Commit 14
```bash
git add .
git commit -m "docs: add openapi and swagger ui"
```

### ✅ Checkpoint da Fase 20
Você deve saber: o que é OpenAPI e Swagger UI; o que documentar; como o Bearer é declarado; como acessar `/docs` e testar uma rota protegida.

---

# FASE 21: Testes automatizados

## 21.1 Conceitos

**Por quê testar:** você acaba de implementar regras de segurança sutis (reuso de refresh token, tarefas de outros usuários). Conferir tudo à mão com `curl` a cada mudança não escala; um teste automatizado **roda tudo em segundos** e avisa quando você quebrar algo sem perceber.

| Tipo | O que testa | Aqui |
|---|---|---|
| **Unitário** | uma função isolada | `tests/duration.test.js` |
| **Integração (de API)** | a requisição HTTP inteira, passando por middlewares, controller, service e **banco real** | todos os outros |

Nosso foco são **testes de API**: enviamos requisições ao app e conferimos **status, corpo, headers e o que ficou no banco**.

**Ferramentas:**
- **Vitest:** o executor de testes (`describe`, `it`, `expect`). Escolhido porque entende ES Modules sem configuração (a documentação oficial do Jest descreve o suporte a ESM como **experimental** e pede para executar o Node com `--experimental-vm-modules`). A API é quase igual à do Jest.
- **Supertest:** faz requisições HTTP ao `app` **sem abrir porta** (por isso separamos `app.js` de `server.js`).

**Princípios que aplicamos:**
1. **Banco separado** (`tasksdb_test`): os testes **apagam dados**. Nunca aponte para o banco de desenvolvimento.
2. **Isolamento:** antes de cada teste, limpamos os usuários (e, por cascata, o resto). Um teste não depende do outro.
3. **Testar comportamento, não implementação:** "o reuso derruba a sessão", não "a função X foi chamada".
4. **Testar também o que NÃO pode acontecer:** senha na resposta, tarefa alheia visível, token expirado aceito.

## 21.2 Preparação

```bash
cp .env.test.example .env.test        # Windows: copy .env.test.example .env.test
npm pkg set scripts.test="vitest run" scripts.test:watch="vitest"
npm pkg set scripts.db:generate="prisma generate" scripts.db:migrate="prisma migrate dev" scripts.db:seed="prisma db seed" scripts.db:studio="prisma studio"
npm pkg set scripts.db:migrate:test="cross-env NODE_ENV=test prisma migrate deploy"
npm run db:migrate:test
```
`db:migrate:test` aplica as migrations no **banco de testes** (`cross-env` define `NODE_ENV=test` em qualquer sistema operacional; o `prisma.config.js` então carrega o `.env.test`). `migrate deploy` só **aplica** migrations já existentes (o comando correto para CI/teste/produção).

### `.env.test.example`
```ini
# Variáveis usadas pelos testes (NODE_ENV=test). Copie para ".env.test".
# ATENÇÃO: use um banco DIFERENTE do de desenvolvimento! Os testes apagam dados.
NODE_ENV=test
DATABASE_URL="postgresql://app:app123@localhost:5432/tasksdb_test"
ACCESS_TOKEN_SECRET=segredo-de-teste-access-com-mais-de-32-caracteres
REFRESH_TOKEN_SECRET=segredo-de-teste-refresh-com-mais-de-32-caracteres
ACCESS_TOKEN_EXPIRES_IN=15m
REFRESH_TOKEN_EXPIRES_IN=7d
FRONTEND_URL=http://localhost:5173
BCRYPT_ROUNDS=4
RATE_LIMIT_GLOBAL_MAX=100000
RATE_LIMIT_LOGIN_MAX=100000
RATE_LIMIT_REGISTER_MAX=100000
RATE_LIMIT_REFRESH_MAX=100000
```

Repare: custo do bcrypt = **4** (testes rápidos) e limites de rate limit enormes (para não atrapalhar os testes comuns).

### `vitest.config.js`
```js
import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    environment: "node",
    // Todos os testes usam o MESMO banco de testes: rodamos um arquivo por vez.
    fileParallelism: false,
    setupFiles: ["./tests/setup.js"],
    testTimeout: 20000,
    hookTimeout: 30000,
  },
});
```

`fileParallelism: false`: todos os arquivos usam **o mesmo banco**; rodando em paralelo eles apagariam os dados uns dos outros.

### `tests/setup.js`
```js
import { beforeAll, beforeEach, afterAll } from "vitest";
import { prisma } from "../src/lib/prisma.js";
import { seedRbac } from "../prisma/seed-rbac.js";

// Roda em TODOS os arquivos de teste.
beforeAll(async () => {
  await seedRbac(prisma); // roles e permissions precisam existir
});

beforeEach(async () => {
  // Apaga usuários e, em cascata (ON DELETE CASCADE), tarefas, refresh tokens e
  // ligações de roles/permissions. As roles e permissions em si permanecem.
  await prisma.$executeRawUnsafe('TRUNCATE TABLE "users" CASCADE');
});

afterAll(async () => {
  await prisma.$disconnect();
});
```

Roda em cada arquivo de teste: garante as roles/permissions (`seedRbac`), limpa os usuários **antes de cada teste** (`TRUNCATE ... CASCADE` apaga também tarefas, refresh tokens e ligações) e fecha a conexão no final.

### `tests/helpers.js`
```js
import request from "supertest";
import { prisma } from "../src/lib/prisma.js";
import { ROLES } from "../src/config/rbac.js";

export const PASSWORD = "Senha12345";
let counter = 0;

export const bearer = (token) => ({ Authorization: `Bearer ${token}` });

// Cadastra um usuário pela própria API (como um cliente real faria).
export async function registerUser(app, overrides = {}) {
  const body = {
    name: "Usuário Teste",
    email: `user${++counter}@example.com`,
    password: PASSWORD,
    ...overrides,
  };
  const res = await request(app).post("/auth/register").send(body).expect(201);
  return { ...res.body.data, password: body.password };
}

// Faz login e devolve o access token + o cookie do refresh token ("nome=valor").
export async function login(app, email, password = PASSWORD) {
  const res = await request(app).post("/auth/login").send({ email, password });
  return {
    res,
    accessToken: res.body.data?.accessToken,
    cookie: res.headers["set-cookie"]?.[0].split(";")[0],
  };
}

export async function makeAdmin(userId) {
  const role = await prisma.role.findUniqueOrThrow({ where: { name: ROLES.ADMIN } });
  await prisma.userRole.create({ data: { userId, roleId: role.id } });
}

// Atalho: cria usuário (opcionalmente admin) e já faz login.
export async function createLoggedUser(app, { admin = false, ...overrides } = {}) {
  const user = await registerUser(app, overrides);
  if (admin) await makeAdmin(user.id);
  const session = await login(app, user.email);
  return { user, ...session };
}
```

Funções de apoio: `registerUser` e `login` usam a **própria API** (como um cliente real); `makeAdmin` usa o Prisma direto (não existe endpoint para criar o *primeiro* admin); `createLoggedUser` junta tudo. `login` extrai o cookie do header `set-cookie` (`nome=valor`).

## 21.3 Os testes

### `tests/auth.test.js`: cadastro e login
```js
import { describe, it, expect } from "vitest";
import request from "supertest";
import bcrypt from "bcrypt";
import { createApp } from "../src/app.js";
import { prisma } from "../src/lib/prisma.js";
import { registerUser, login, PASSWORD } from "./helpers.js";

const app = createApp();

describe("POST /auth/register", () => {
  it("cria o usuário com a role USER e NÃO devolve a senha", async () => {
    const res = await request(app)
      .post("/auth/register")
      .send({ name: "Maria", email: "Maria@Example.com", password: PASSWORD });

    expect(res.status).toBe(201);
    expect(res.body.data).toMatchObject({ name: "Maria", email: "maria@example.com", roles: ["USER"] });
    expect(res.body.data.password).toBeUndefined();
    expect(res.body.data.passwordHash).toBeUndefined();
  });

  it("guarda um hash bcrypt, nunca a senha em texto puro", async () => {
    const user = await registerUser(app);
    const row = await prisma.user.findUnique({ where: { id: user.id } });

    expect(row.passwordHash).not.toBe(PASSWORD);
    expect(row.passwordHash).toMatch(/^\$2[aby]\$/); // formato do bcrypt
    expect(await bcrypt.compare(PASSWORD, row.passwordHash)).toBe(true);
  });

  it("responde 409 para e-mail já cadastrado", async () => {
    const user = await registerUser(app);
    const res = await request(app)
      .post("/auth/register")
      .send({ name: "Outra", email: user.email.toUpperCase(), password: PASSWORD });

    expect(res.status).toBe(409);
    expect(res.body.error.code).toBe("CONFLICT");
  });

  it("responde 400 com detalhes para dados inválidos", async () => {
    const res = await request(app)
      .post("/auth/register")
      .send({ name: "x", email: "nao-e-email", password: "123" });

    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe("VALIDATION_ERROR");
    const fields = res.body.error.details.map((d) => d.field);
    expect(fields).toEqual(expect.arrayContaining(["name", "email", "password"]));
  });

  it("ignora campos extras (ex.: tentar se cadastrar já com role)", async () => {
    const res = await request(app)
      .post("/auth/register")
      .send({ name: "Maria", email: "m@example.com", password: PASSWORD, roles: ["ADMIN"] });

    expect(res.status).toBe(201);
    expect(res.body.data.roles).toEqual(["USER"]);
  });
});

describe("POST /auth/login", () => {
  it("devolve o access token no corpo e o refresh token em cookie HTTPOnly", async () => {
    const user = await registerUser(app);
    const { res } = await login(app, user.email);

    expect(res.status).toBe(200);
    expect(res.body.data.accessToken).toEqual(expect.any(String));
    expect(res.body.data.user).toMatchObject({ id: user.id, email: user.email });

    const cookie = res.headers["set-cookie"][0];
    expect(cookie).toMatch(/^refreshToken=/);
    expect(cookie).toMatch(/HttpOnly/i);
    expect(cookie).toMatch(/SameSite=Strict/i);
    expect(cookie).toMatch(/Path=\/auth/);
    expect(cookie).toMatch(/Max-Age=604800/); // 7 dias em segundos
    // o refresh token NÃO vai no corpo da resposta
    expect(JSON.stringify(res.body)).not.toContain("refreshToken");
  });

  it("guarda no banco apenas o HASH do refresh token", async () => {
    const user = await registerUser(app);
    const { cookie } = await login(app, user.email);
    const token = cookie.split("=")[1];

    const rows = await prisma.refreshToken.findMany({ where: { userId: user.id } });
    expect(rows).toHaveLength(1);
    expect(rows[0].tokenHash).toMatch(/^[0-9a-f]{64}$/);
    expect(rows[0].tokenHash).not.toBe(token);
  });

  it("responde 401 com a MESMA mensagem para senha errada e e-mail inexistente", async () => {
    const user = await registerUser(app);
    const wrongPassword = await request(app).post("/auth/login").send({ email: user.email, password: "Errada123" });
    const unknownEmail = await request(app).post("/auth/login").send({ email: "ninguem@example.com", password: PASSWORD });

    expect(wrongPassword.status).toBe(401);
    expect(unknownEmail.status).toBe(401);
    expect(wrongPassword.body).toEqual(unknownEmail.body); // não revela se o e-mail existe
  });
});
```

Destaques: confere que o **hash** no banco começa com `$2` (formato bcrypt) e que `bcrypt.compare` o aceita; que o cookie tem `HttpOnly`, `SameSite=Strict`, `Path=/auth` e `Max-Age=604800`; que o banco guarda hash de 64 caracteres **diferente** do token; que e-mail inexistente e senha errada dão **corpos idênticos**; e que `roles: ["ADMIN"]` enviado no cadastro é **ignorado**.

### `tests/protected.test.js`: rota protegida
```js
import { describe, it, expect } from "vitest";
import request from "supertest";
import jwt from "jsonwebtoken";
import { createApp } from "../src/app.js";
import { createLoggedUser, bearer } from "./helpers.js";

const app = createApp();

describe("rota protegida (GET /users/me)", () => {
  it("401 sem token", async () => {
    const res = await request(app).get("/users/me");
    expect(res.status).toBe(401);
    expect(res.body.error.code).toBe("UNAUTHORIZED");
  });

  it("401 com o header em formato errado (sem 'Bearer ')", async () => {
    const { accessToken } = await createLoggedUser(app);
    const res = await request(app).get("/users/me").set("Authorization", accessToken);
    expect(res.status).toBe(401);
  });

  it("401 com token adulterado", async () => {
    const { accessToken } = await createLoggedUser(app);
    const res = await request(app).get("/users/me").set(bearer(accessToken + "x"));
    expect(res.status).toBe(401);
  });

  it("401 com token expirado", async () => {
    const { user } = await createLoggedUser(app);
    const expired = jwt.sign({}, process.env.ACCESS_TOKEN_SECRET, { subject: user.id, expiresIn: -10 });
    const res = await request(app).get("/users/me").set(bearer(expired));
    expect(res.status).toBe(401);
  });

  it("401 se o token foi assinado com OUTRA chave (ex.: a do refresh token)", async () => {
    const { user } = await createLoggedUser(app);
    const forged = jwt.sign({}, process.env.REFRESH_TOKEN_SECRET, { subject: user.id, expiresIn: 60 });
    const res = await request(app).get("/users/me").set(bearer(forged));
    expect(res.status).toBe(401);
  });

  it("200 com token válido, e o payload do JWT não contém dados sensíveis", async () => {
    const { user, accessToken } = await createLoggedUser(app);
    const res = await request(app).get("/users/me").set(bearer(accessToken));

    expect(res.status).toBe(200);
    expect(res.body.data).toMatchObject({ id: user.id, email: user.email, roles: ["USER"] });

    const payload = jwt.decode(accessToken);
    expect(Object.keys(payload).sort()).toEqual(["exp", "iat", "sub"]);
  });
});
```

Para simular um token **expirado**, o teste assina um token com `expiresIn: -10` (já vencido). Também prova que um token assinado com a chave do **refresh** não é aceito como access token e que o payload tem **só** `sub`, `iat` e `exp`.

### `tests/refresh.test.js`: refresh, rotação, reuso e logout
```js
import { describe, it, expect } from "vitest";
import request from "supertest";
import { createApp } from "../src/app.js";
import { prisma } from "../src/lib/prisma.js";
import { createLoggedUser, login, bearer } from "./helpers.js";

const app = createApp();

const refreshWith = (cookie) => {
  const req = request(app).post("/auth/refresh");
  return cookie ? req.set("Cookie", cookie) : req;
};
const cookieOf = (res) => res.headers["set-cookie"]?.[0].split(";")[0];

describe("POST /auth/refresh (rotação)", () => {
  it("401 sem cookie", async () => {
    const res = await refreshWith();
    expect(res.status).toBe(401);
  });

  it("401 com cookie inválido (e manda o navegador apagar o cookie)", async () => {
    const res = await refreshWith("refreshToken=lixo");
    expect(res.status).toBe(401);
    expect(res.headers["set-cookie"][0]).toMatch(/refreshToken=;/);
  });

  it("devolve novo access token e um refresh token DIFERENTE (rotação)", async () => {
    const { cookie: tokenA } = await createLoggedUser(app);
    const res = await refreshWith(tokenA);

    expect(res.status).toBe(200);
    expect(res.body.data.accessToken).toEqual(expect.any(String));

    const tokenB = cookieOf(res);
    expect(tokenB).toMatch(/^refreshToken=/);
    expect(tokenB).not.toBe(tokenA);
  });

  it("o access token novo funciona", async () => {
    const { cookie } = await createLoggedUser(app);
    const res = await refreshWith(cookie);
    const me = await request(app).get("/users/me").set(bearer(res.body.data.accessToken));
    expect(me.status).toBe(200);
  });

  it("marca o token antigo como revogado e cria o novo na MESMA família", async () => {
    const { user, cookie } = await createLoggedUser(app);
    await refreshWith(cookie);

    const rows = await prisma.refreshToken.findMany({ where: { userId: user.id }, orderBy: { createdAt: "asc" } });
    expect(rows).toHaveLength(2);
    expect(rows[0].revokedAt).not.toBeNull(); // o antigo (A)
    expect(rows[1].revokedAt).toBeNull();     // o novo (B)
    expect(rows[0].familyId).toBe(rows[1].familyId);
  });

  it("a cadeia de rotações segue funcionando (A -> B -> C)", async () => {
    const { cookie: a } = await createLoggedUser(app);
    const b = cookieOf(await refreshWith(a));
    const res = await refreshWith(b);
    expect(res.status).toBe(200);
  });
});

describe("REUSE DETECTION", () => {
  it("reusar um refresh token antigo dá 401 e derruba a sessão inteira", async () => {
    const { user, cookie: tokenA } = await createLoggedUser(app);

    // uso legítimo: A -> B
    const first = await refreshWith(tokenA);
    const tokenB = cookieOf(first);

    // alguém (ladrão ou cliente bugado) reapresenta o token A, que já foi usado
    const reuse = await refreshWith(tokenA);
    expect(reuse.status).toBe(401);

    // consequência: o token B (legítimo, ainda não usado) também foi invalidado
    const afterReuse = await refreshWith(tokenB);
    expect(afterReuse.status).toBe(401);

    // no banco, nenhum token da família ficou ativo
    const active = await prisma.refreshToken.count({ where: { userId: user.id, revokedAt: null } });
    expect(active).toBe(0);
  });

  it("o reuso numa sessão NÃO derruba as outras sessões (outro aparelho) do mesmo usuário", async () => {
    const { user, cookie: deviceA } = await createLoggedUser(app);
    const { cookie: deviceB } = await login(app, user.email);

    await refreshWith(deviceA);          // A -> A2
    await refreshWith(deviceA);          // reuso de A: derruba a família do aparelho A

    const res = await refreshWith(deviceB); // o aparelho B continua válido
    expect(res.status).toBe(200);
  });

  it("duas requisições SIMULTÂNEAS com o mesmo token: só uma vence, a sessão é encerrada", async () => {
    const { user, cookie } = await createLoggedUser(app);
    const [r1, r2] = await Promise.all([refreshWith(cookie), refreshWith(cookie)]);

    const statuses = [r1.status, r2.status].sort();
    expect(statuses).toEqual([200, 401]);

    const active = await prisma.refreshToken.count({ where: { userId: user.id, revokedAt: null } });
    expect(active).toBe(0); // a família foi revogada por precaução
  });
});

describe("POST /auth/logout", () => {
  it("revoga a sessão no banco, limpa o cookie e impede novo refresh", async () => {
    const { user, cookie } = await createLoggedUser(app);

    const res = await request(app).post("/auth/logout").set("Cookie", cookie);
    expect(res.status).toBe(204);
    expect(res.headers["set-cookie"][0]).toMatch(/refreshToken=;/);

    const active = await prisma.refreshToken.count({ where: { userId: user.id, revokedAt: null } });
    expect(active).toBe(0);

    // apagar o cookie no navegador não basta; o servidor também recusa o token
    const refresh = await refreshWith(cookie);
    expect(refresh.status).toBe(401);
  });

  it("é idempotente: 204 mesmo sem cookie", async () => {
    const res = await request(app).post("/auth/logout");
    expect(res.status).toBe(204);
  });
});
```

É o arquivo mais importante do projeto. Cobre: rotação (token novo diferente), linha antiga revogada e nova na **mesma família**, **reuse detection** (o token legítimo também cai), reuso numa sessão **sem** derrubar outro aparelho, **duas requisições simultâneas** (uma vence, a família é revogada) e logout (revoga no banco, limpa o cookie, refresh depois do logout falha).

### `tests/authorization.test.js`: tarefas, roles e permissions
```js
import { describe, it, expect } from "vitest";
import request from "supertest";
import { createApp } from "../src/app.js";
import { prisma } from "../src/lib/prisma.js";
import { createLoggedUser, bearer } from "./helpers.js";

const app = createApp();

async function createTask(token, title = "Minha tarefa") {
  const res = await request(app).post("/tasks").set(bearer(token)).send({ title });
  expect(res.status).toBe(201);
  return res.body.data;
}

describe("tarefas: usuário comum (regra do DONO)", () => {
  it("cria, lista, lê, atualiza e exclui as PRÓPRIAS tarefas", async () => {
    const { user, accessToken } = await createLoggedUser(app);
    const task = await createTask(accessToken);
    expect(task.userId).toBe(user.id);
    expect(task.completed).toBe(false);

    const list = await request(app).get("/tasks").set(bearer(accessToken));
    expect(list.body.data).toHaveLength(1);
    expect(list.body.meta).toMatchObject({ page: 1, limit: 20, total: 1 });

    const get = await request(app).get(`/tasks/${task.id}`).set(bearer(accessToken));
    expect(get.status).toBe(200);

    const patch = await request(app).patch(`/tasks/${task.id}`).set(bearer(accessToken)).send({ completed: true });
    expect(patch.status).toBe(200);
    expect(patch.body.data.completed).toBe(true);

    const del = await request(app).delete(`/tasks/${task.id}`).set(bearer(accessToken));
    expect(del.status).toBe(204);
  });

  it("não consegue definir outro dono ao criar (userId do body é ignorado)", async () => {
    const owner = await createLoggedUser(app);
    const other = await createLoggedUser(app);
    const res = await request(app).post("/tasks").set(bearer(owner.accessToken)).send({ title: "x", userId: other.user.id });
    expect(res.body.data.userId).toBe(owner.user.id);
  });

  it("NÃO enxerga nem altera tarefas de outro usuário (404)", async () => {
    const owner = await createLoggedUser(app);
    const intruder = await createLoggedUser(app);
    const task = await createTask(owner.accessToken);

    const get = await request(app).get(`/tasks/${task.id}`).set(bearer(intruder.accessToken));
    const patch = await request(app).patch(`/tasks/${task.id}`).set(bearer(intruder.accessToken)).send({ title: "hack" });
    const del = await request(app).delete(`/tasks/${task.id}`).set(bearer(intruder.accessToken));
    expect([get.status, patch.status, del.status]).toEqual([404, 404, 404]);

    const still = await prisma.task.findUnique({ where: { id: task.id } });
    expect(still.title).toBe("Minha tarefa");
  });

  it("a listagem mostra só as tarefas do próprio usuário", async () => {
    const a = await createLoggedUser(app);
    const b = await createLoggedUser(app);
    await createTask(a.accessToken, "A1");
    await createTask(b.accessToken, "B1");
    const res = await request(app).get("/tasks").set(bearer(a.accessToken));
    expect(res.body.data.map((t) => t.title)).toEqual(["A1"]);
  });

  it("scope=all é proibido (403) para usuário comum", async () => {
    const { accessToken } = await createLoggedUser(app);
    const res = await request(app).get("/tasks?scope=all").set(bearer(accessToken));
    expect(res.status).toBe(403);
    expect(res.body.error.code).toBe("FORBIDDEN");
  });

  it("valida o id (UUID), a paginação e o PATCH vazio", async () => {
    const { accessToken } = await createLoggedUser(app);
    const task = await createTask(accessToken);
    const badId = await request(app).get("/tasks/123").set(bearer(accessToken));
    const badPage = await request(app).get("/tasks?limit=1000").set(bearer(accessToken));
    const empty = await request(app).patch(`/tasks/${task.id}`).set(bearer(accessToken)).send({});
    expect([badId.status, badPage.status, empty.status]).toEqual([400, 400, 400]);
  });
});

describe("tarefas: ADMIN (permissions *:any via role)", () => {
  it("lê, atualiza e exclui tarefas de qualquer usuário", async () => {
    const admin = await createLoggedUser(app, { admin: true });
    const user = await createLoggedUser(app);
    const task = await createTask(user.accessToken);

    const get = await request(app).get(`/tasks/${task.id}`).set(bearer(admin.accessToken));
    const patch = await request(app).patch(`/tasks/${task.id}`).set(bearer(admin.accessToken)).send({ completed: true });
    const all = await request(app).get("/tasks?scope=all").set(bearer(admin.accessToken));
    const del = await request(app).delete(`/tasks/${task.id}`).set(bearer(admin.accessToken));

    expect(get.status).toBe(200);
    expect(patch.status).toBe(200);
    expect(all.status).toBe(200);
    expect(all.body.data[0].user).toMatchObject({ id: user.user.id });
    expect(del.status).toBe(204);
  });
});

describe("roles e permissions", () => {
  it("usuário comum recebe 403 em /roles, /permissions e /users", async () => {
    const { accessToken } = await createLoggedUser(app);
    for (const url of ["/roles", "/permissions", "/users"]) {
      const res = await request(app).get(url).set(bearer(accessToken));
      expect(res.status, url).toBe(403);
    }
  });

  it("ADMIN lista roles (com suas permissions), permissions e usuários", async () => {
    const { accessToken } = await createLoggedUser(app, { admin: true });
    const roles = await request(app).get("/roles").set(bearer(accessToken));
    const admin = roles.body.data.find((r) => r.name === "ADMIN");
    const userRole = roles.body.data.find((r) => r.name === "USER");
    expect(admin.permissions).toContain("tasks:read:any");
    expect(userRole.permissions).toEqual([]);

    expect((await request(app).get("/permissions").set(bearer(accessToken))).body.data.length).toBeGreaterThan(5);
    expect((await request(app).get("/users").set(bearer(accessToken))).body.meta.total).toBe(1);
  });

  it("promover um usuário a ADMIN vale NA HORA (sem novo login)", async () => {
    const admin = await createLoggedUser(app, { admin: true });
    const user = await createLoggedUser(app);

    expect((await request(app).get("/roles").set(bearer(user.accessToken))).status).toBe(403);

    const assign = await request(app).post(`/users/${user.user.id}/roles`).set(bearer(admin.accessToken)).send({ role: "admin" });
    expect(assign.status).toBe(200);
    expect(assign.body.data.roles).toEqual(["ADMIN", "USER"]);

    // MESMO access token de antes: agora funciona, porque roles vêm do banco
    expect((await request(app).get("/roles").set(bearer(user.accessToken))).status).toBe(200);
  });

  it("permission concedida DIRETAMENTE ao usuário (sem role) libera a ação", async () => {
    const admin = await createLoggedUser(app, { admin: true });
    const owner = await createLoggedUser(app);
    const reader = await createLoggedUser(app);
    const task = await createTask(owner.accessToken);

    expect((await request(app).get(`/tasks/${task.id}`).set(bearer(reader.accessToken))).status).toBe(404);

    await request(app).post(`/users/${reader.user.id}/permissions`).set(bearer(admin.accessToken)).send({ permission: "tasks:read:any" }).expect(200);
    expect((await request(app).get(`/tasks/${task.id}`).set(bearer(reader.accessToken))).status).toBe(200);
    // mas só LEITURA: continua sem poder alterar
    expect((await request(app).patch(`/tasks/${task.id}`).set(bearer(reader.accessToken)).send({ title: "x" })).status).toBe(404);

    await request(app).delete(`/users/${reader.user.id}/permissions/tasks:read:any`).set(bearer(admin.accessToken)).expect(204);
    expect((await request(app).get(`/tasks/${task.id}`).set(bearer(reader.accessToken))).status).toBe(404);
  });

  it("remove uma role e protege contra o admin remover o próprio ADMIN", async () => {
    const admin = await createLoggedUser(app, { admin: true });
    const other = await createLoggedUser(app, { admin: true });

    const self = await request(app).delete(`/users/${admin.user.id}/roles/ADMIN`).set(bearer(admin.accessToken));
    expect(self.status).toBe(409);

    const removeOther = await request(app).delete(`/users/${other.user.id}/roles/ADMIN`).set(bearer(admin.accessToken));
    expect(removeOther.status).toBe(204);
    expect((await request(app).get("/roles").set(bearer(other.accessToken))).status).toBe(403);
  });

  it("404 para role/permission/usuário inexistentes", async () => {
    const admin = await createLoggedUser(app, { admin: true });
    const user = await createLoggedUser(app);
    const noRole = await request(app).post(`/users/${user.user.id}/roles`).set(bearer(admin.accessToken)).send({ role: "CHEFE" });
    const noPerm = await request(app).post(`/users/${user.user.id}/permissions`).set(bearer(admin.accessToken)).send({ permission: "x:y" });
    const noUser = await request(app).post(`/users/${crypto.randomUUID()}/roles`).set(bearer(admin.accessToken)).send({ role: "ADMIN" });
    expect([noRole.status, noPerm.status, noUser.status]).toEqual([404, 404, 404]);
  });
});
```

Inclui o teste que **promove um usuário a ADMIN e o mesmo token passa a funcionar** (prova a decisão D4), o da **permission direta** (libera leitura, mas não escrita) e o da proteção contra o admin remover o próprio ADMIN.

### `tests/security.test.js`: Helmet, CORS, erros e docs
```js
import { describe, it, expect } from "vitest";
import request from "supertest";
import { createApp } from "../src/app.js";

const app = createApp();
const ALLOWED = "http://localhost:5173";

describe("Helmet", () => {
  it("adiciona headers de segurança e remove X-Powered-By", async () => {
    const res = await request(app).get("/health");
    expect(res.headers["x-powered-by"]).toBeUndefined();
    expect(res.headers["x-content-type-options"]).toBe("nosniff");
    expect(res.headers["x-frame-options"]).toBe("SAMEORIGIN");
    expect(res.headers["strict-transport-security"]).toContain("max-age=");
    expect(res.headers["content-security-policy"]).toContain("default-src 'self'");
  });
});

describe("CORS", () => {
  it("origem permitida: devolve Allow-Origin igual à origem e Allow-Credentials", async () => {
    const res = await request(app).get("/health").set("Origin", ALLOWED);
    expect(res.headers["access-control-allow-origin"]).toBe(ALLOWED);
    expect(res.headers["access-control-allow-credentials"]).toBe("true");
    expect(res.headers["vary"]).toContain("Origin");
  });

  it("origem NÃO permitida: não devolve headers CORS (o navegador bloqueia)", async () => {
    const res = await request(app).get("/health").set("Origin", "http://evil.com");
    expect(res.headers["access-control-allow-origin"]).toBeUndefined();
  });

  it("preflight (OPTIONS) é respondido pelo middleware de CORS", async () => {
    const res = await request(app)
      .options("/auth/login")
      .set("Origin", ALLOWED)
      .set("Access-Control-Request-Method", "POST")
      .set("Access-Control-Request-Headers", "content-type,authorization");

    expect(res.status).toBe(204);
    expect(res.headers["access-control-allow-origin"]).toBe(ALLOWED);
    expect(res.headers["access-control-allow-methods"]).toContain("POST");
    expect(res.headers["access-control-allow-headers"]).toContain("Authorization");
    expect(res.headers["access-control-max-age"]).toBe("600");
  });
});

describe("tratamento de erros", () => {
  it("rota inexistente: 404 no formato padrão", async () => {
    const res = await request(app).get("/nada");
    expect(res.status).toBe(404);
    expect(res.body).toEqual({ error: { code: "NOT_FOUND", message: expect.any(String) } });
  });

  it("JSON malformado: 400", async () => {
    const res = await request(app).post("/auth/login").set("Content-Type", "application/json").send("{oops");
    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe("BAD_REQUEST");
  });

  it("corpo grande demais: 413", async () => {
    const res = await request(app).post("/auth/login").send({ email: "a@b.com", password: "x".repeat(20000) });
    expect(res.status).toBe(413);
  });

  it("sem corpo: 400 de validação (Express 5 deixa req.body undefined)", async () => {
    const res = await request(app).post("/auth/login");
    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe("VALIDATION_ERROR");
  });
});

describe("documentação", () => {
  it("serve o OpenAPI em /docs.json e a interface em /docs", async () => {
    const json = await request(app).get("/docs.json");
    expect(json.body.openapi).toMatch(/^3\./);
    expect(Object.keys(json.body.paths)).toContain("/auth/login");
    const ui = await request(app).get("/docs/");
    expect(ui.status).toBe(200);
    expect(ui.text).toContain("swagger-ui");
  });
});
```

### `tests/rateLimit.test.js`
```js
import { describe, it, expect, vi } from "vitest";
import request from "supertest";

// O arquivo tests/setup.js já carregou a configuração (limite alto). Para este
// teste precisamos de um limite BAIXO: limpamos o cache de módulos, trocamos a
// variável de ambiente e só então importamos o app de novo.
vi.resetModules();
vi.stubEnv("RATE_LIMIT_LOGIN_MAX", "3");
const { createApp } = await import("../src/app.js");
const app = createApp();

describe("rate limiting no login", () => {
  it("após 3 tentativas FALHAS, a 4ª recebe 429 no formato padrão", async () => {
    const attempt = () => request(app).post("/auth/login").send({ email: "a@example.com", password: "errada" });

    for (let i = 0; i < 3; i++) expect((await attempt()).status).toBe(401);

    const blocked = await attempt();
    expect(blocked.status).toBe(429);
    expect(blocked.body.error.code).toBe("TOO_MANY_REQUESTS");
    expect(blocked.headers["ratelimit"]).toBeDefined();
    expect(blocked.headers["ratelimit-policy"]).toBeDefined();
  });
});
```

Aqui precisamos de um limite **baixo**. O `setup.js` já carregou a configuração, então usamos `vi.resetModules()` (limpa o cache de módulos), `vi.stubEnv` (troca a variável) e só então importamos o app de novo.

### `tests/duration.test.js`: teste unitário
```js
import { describe, it, expect } from "vitest";
import { toSeconds, toMilliseconds } from "../src/utils/duration.js";

describe("duration", () => {
  it("converte textos em segundos e milissegundos", () => {
    expect(toSeconds("30s")).toBe(30);
    expect(toSeconds("15m")).toBe(900);
    expect(toSeconds("2h")).toBe(7200);
    expect(toSeconds("7d")).toBe(604800);
    expect(toMilliseconds("1m")).toBe(60000);
  });

  it("rejeita formatos inválidos", () => {
    expect(() => toSeconds("7 dias")).toThrow();
    expect(() => toSeconds("abc")).toThrow();
  });
});
```

## 21.4 Rodando

```bash
npm test
```
Resultado esperado:
```text
 ✓ tests/rateLimit.test.js (1 test)
 ✓ tests/authorization.test.js (13 tests)
 ✓ tests/refresh.test.js (11 tests)
 ✓ tests/protected.test.js (6 tests)
 ✓ tests/auth.test.js (8 tests)
 ✓ tests/security.test.js (9 tests)
 ✓ tests/duration.test.js (2 tests)
 Test Files  7 passed (7)
      Tests  50 passed (50)
```
(A ordem dos arquivos pode variar.)

### Exercício: quebre o código de propósito
Teste os testes. Em `src/services/session.service.js`, comente a linha `await revokeFamily(stored.familyId);` do trecho "REUSE DETECTION" e rode `npm test`: o teste *"reusar um refresh token antigo dá 401 e derruba a sessão inteira"* deve **falhar**. Desfaça. (Fiz isso e mais duas "mutações", e os testes detectaram todas.) Um teste que nunca falha não protege nada.

**Fluxo de um teste:**
```text
beforeEach: TRUNCATE users CASCADE
   ↓
it(): helper registra/loga pela API (Supertest → app → Prisma → banco de testes)
   ↓
requisição sob teste
   ↓
expect(status, corpo, headers)  +  consulta direta ao banco quando preciso (prisma.refreshToken...)
```

### 📌 Commit 15
```bash
git add .
git commit -m "test: add api tests for auth, refresh rotation, authorization and security"
```

### ✅ Checkpoint da Fase 21
Você deve saber: unitário x integração; por que banco de testes separado; por que isolar cada teste; o que Supertest faz; como simulamos token expirado e corrida; por que testar o que **não** pode acontecer; como provar que um teste realmente protege (mutação).

---

# FASE 22: Git e README

## 22.1 Commits

Você deve ter feito commits em pontos naturais ao longo do guia. Convenção usada: **Conventional Commits** (`tipo: descrição`): `feat` (funcionalidade), `fix`, `chore` (manutenção), `docs`, `test`.

| # | Mensagem | O que consolidou |
|---|---|---|
| 1 | `chore: initialize project` | `package.json`, dependências, `.gitignore` |
| 2 | `feat: configure prisma schema and initial migration` | schema completo, `prisma.config.js`, migration `init` |
| 3 | `feat: add express app, env validation and error handling` | `env.js`, Prisma Client, `AppError`, `errorHandler`, `app.js`, `server.js` |
| 4 | `feat: add roles, permissions and seed` | `rbac.js`, seed de roles/permissions e admin |
| 5 | `feat: add validation and user registration with bcrypt` | Zod, `validate`, cadastro |
| 6 | `feat: add login with access and refresh tokens` | login, `token.service`, `refresh-token.service`, cookie |
| 7 | `feat: add authentication middleware and /users/me` | `authenticate`, contexto de autorização |
| 8 | `feat: add refresh token rotation with reuse detection` | `session.service` (refresh), `cookie-parser` |
| 9 | `feat: add secure logout` | logout |
| 10 | `feat: add tasks with ownership rule` | CRUD de tarefas |
| 11 | `feat: add role and permission authorization` | `authorize`, gerenciamento de roles/permissions |
| 12 | `feat: add helmet and cors` | cabeçalhos de segurança e CORS |
| 13 | `feat: add rate limiting` | limitadores |
| 14 | `docs: add openapi and swagger ui` | documentação |
| 15 | `test: add api tests ...` | testes |
| 16 | `docs: add readme` | README |

**Boas práticas:** commits **pequenos e coesos** (uma ideia por commit); mensagem no imperativo/descritivo; **nunca** commitar `.env`; **commitar** `prisma/migrations/` e `package-lock.json`; antes de cada commit, rode `git status` e `git diff` para ver o que está indo.

```bash
git log --oneline      # seu histórico conta a história do projeto
```
Se for publicar no GitHub: `git branch -M main`, `git remote add origin <url>`, `git push -u origin main`. (Confira antes que nenhum segredo foi commitado: `git ls-files | grep -i env` só deve listar os `.example`.)

## 22.2 README.md

O README é a **porta de entrada**: quem chega deve conseguir rodar o projeto sem te perguntar nada.

````markdown
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
````

### `package.json` final (para comparar)
```json
{
  "name": "api-tasks-prisma",
  "version": "1.0.0",
  "description": "API REST de tarefas com autenticação JWT, refresh token rotation, RBAC (roles e permissions), Prisma e PostgreSQL",
  "main": "src/server.js",
  "scripts": {
    "test": "vitest run",
    "dev": "node --watch src/server.js",
    "start": "node src/server.js",
    "test:watch": "vitest",
    "db:generate": "prisma generate",
    "db:migrate": "prisma migrate dev",
    "db:migrate:test": "cross-env NODE_ENV=test prisma migrate deploy",
    "db:seed": "prisma db seed",
    "db:studio": "prisma studio"
  },
  "keywords": [],
  "author": "",
  "license": "ISC",
  "type": "module",
  "engines": {
    "node": ">=22.12.0"
  },
  "dependencies": {
    "@prisma/adapter-pg": "^7.10.0",
    "@prisma/client": "^7.10.0",
    "bcrypt": "^6.0.0",
    "cookie-parser": "^1.4.7",
    "cors": "^2.8.6",
    "dotenv": "^18.0.5",
    "express": "^5.2.1",
    "express-rate-limit": "^8.7.0",
    "helmet": "^8.3.0",
    "jsonwebtoken": "^9.0.3",
    "pg": "^8.23.1",
    "swagger-ui-express": "^5.0.1",
    "zod": "^4.6.5"
  },
  "devDependencies": {
    "cross-env": "^10.1.0",
    "prisma": "^7.10.0",
    "supertest": "^7.3.1",
    "vitest": "^5.0.3"
  }
}
```

### 📌 Commit 16
```bash
git add .
git commit -m "docs: add readme"
```

### ✅ Checkpoint da Fase 22
Você deve saber: o que cada commit consolidou; o que **não** versionar e o que **sempre** versionar; por que o README importa.

---

# FASE 23: Revisão final

## 23.1 O que você aprendeu

- **Arquitetura:** routes → controllers → services → Prisma, e por que controllers magros; por que não criamos repositories.
- **PostgreSQL + Prisma:** PK, FK, unique, índices, constraints; schema, migrations, client; relações 1:N e N:N explícita; `select`/`include`/`where`; nested writes; transações; paginação.
- **Senhas:** hash, salt, custo, `bcrypt.compare`.
- **JWT:** header/payload/signature, claims, assinatura HMAC, expiração, o que **não** colocar.
- **Sessão:** access token curto + refresh token em cookie HttpOnly; armazenar **hash**; `jti`, famílias; **rotação**; **reuse detection**; logout que **revoga** no servidor; atomicidade com `updateMany` condicional.
- **Cookies:** HttpOnly, Secure, SameSite, Path, Max-Age; cookie x localStorage.
- **Middlewares:** ordem, `next()`, `req.user`, fábricas (closures).
- **Autorização:** authN x authZ; roles, permissions (diretas e via role); ownership; 401 x 403 x 404.
- **Segurança de borda:** Helmet, CORS (preflight, credentials), rate limiting.
- **Qualidade:** validação com Zod, erros centralizados, variáveis de ambiente validadas, OpenAPI, testes de API (e como provar que testam), Git organizado.

## 23.2 Mapa de segurança

| Tema | O que fizemos | O que ficou de fora (conscientemente) |
|---|---|---|
| **Senha** | bcrypt custo 12; limite 72 bytes; regras mínimas | verificação de senha vazada, reset por e-mail |
| **JWT** | só `sub`; 15 min; algoritmo fixo; chave ≥ 32 caracteres e **diferente** da do refresh | rotação periódica de chaves (`kid`) |
| **Refresh token** | cookie HttpOnly; hash no banco; rotação; reuso revoga a família; `jti` | "sair de todos os aparelhos"; limpeza periódica de tokens vencidos |
| **Cookies** | HttpOnly, SameSite=Strict, Path=/auth, Secure em produção | — |
| **CORS** | lista explícita de origens + credentials | — |
| **CSRF** | SameSite=Strict + Path restrito + access token fora de cookie | token anti-CSRF (necessário se usar SameSite=None) |
| **XSS** | HttpOnly protege o refresh; CSP do Helmet; a API só devolve JSON | sanitização de HTML (só importa se o conteúdo for exibido como HTML no front) |
| **SQL injection** | consultas **parametrizadas** pelo Prisma; entrada validada | — (`$executeRawUnsafe` só nos testes, com uma string fixa, sem dados do usuário) |
| **Exposição de informação** | `select` explícito (sem hash); erros internos só no log | — |
| **Enumeração de usuários** | login com mensagem única e tempo igualado | o **cadastro** responde 409 para e-mail existente (compromisso comum; o rate limit mitiga) |
| **Força bruta** | rate limit (login só conta falhas) | bloqueio temporário por **conta**, CAPTCHA, 2FA |
| **Segredos / `.env`** | `.env` fora do Git; validação na partida; segredos longos | gerenciador de segredos em produção |
| **Logs** | sem senhas/tokens nos logs; log de reuso de refresh | auditoria estruturada |
| **Headers** | Helmet padrão | CSP customizado, se servir HTML |
| **Entrada** | Zod em body/params/query; limite de 10 KB | — |

## 23.3 Referência completa das rotas

Convenções: **Auth** = precisa de `Authorization: Bearer <accessToken>`. Todas as respostas de erro seguem `{ "error": { "code", "message", "details?" } }`. Sucesso: `{ "data": ..., "meta"? }`. Qualquer rota pode responder `429` (rate limit) e `500`.

### Autenticação

| Rota | Objetivo | Auth / Autorização | Body | Resposta | Erros |
|---|---|---|---|---|---|
| `POST /auth/register` | cadastrar | não | `name` (2-100), `email`, `password` (8-72 bytes, letra+número) | `201` `{ data: { id, name, email, createdAt, roles } }` | `400` validação, `409` e-mail já existe |
| `POST /auth/login` | autenticar | não | `email`, `password` | `200` `{ data: { user, accessToken } }` + cookie `refreshToken` | `400`, `401` credenciais inválidas |
| `POST /auth/refresh` | rotacionar o refresh token | cookie | (nenhum) | `200` `{ data: { accessToken } }` + cookie novo | `401` ausente/inválido/expirado/**reutilizado** (cookie é limpo) |
| `POST /auth/logout` | encerrar sessão | cookie (opcional) | (nenhum) | `204` + cookie limpo | (idempotente) |

### Usuários, roles e permissions

| Rota | Objetivo | Auth / Autorização | Params / Body | Resposta | Erros |
|---|---|---|---|---|---|
| `GET /users/me` | meu perfil | sim | | `200` `{ data: { id, name, email, roles, permissions, createdAt } }` | `401` |
| `GET /users` | listar usuários | `users:read` | query `page`, `limit` | `200` `{ data: [...], meta }` | `401`, `403`, `400` |
| `GET /users/:id` | consultar | `users:read` | `:id` UUID | `200` `{ data }` | `400`, `401`, `403`, `404` |
| `POST /users/:id/roles` | atribuir role | `roles:assign` | `:id`; body `{ role }` | `200` `{ data: usuário atualizado }` | `400`, `401`, `403`, `404` (usuário/role) |
| `DELETE /users/:id/roles/:role` | remover role | `roles:assign` | `:id`, `:role` | `204` | `401`, `403`, `404`, `409` (próprio ADMIN) |
| `POST /users/:id/permissions` | conceder permission direta | `permissions:assign` | `:id`; body `{ permission }` | `200` `{ data }` | `400`, `401`, `403`, `404` |
| `DELETE /users/:id/permissions/:permission` | remover permission direta | `permissions:assign` | `:id`, `:permission` | `204` | `401`, `403`, `404` |
| `GET /roles` | listar roles e suas permissions | `roles:read` | | `200` `{ data: [...] }` | `401`, `403` |
| `GET /permissions` | listar permissions | `permissions:read` | | `200` `{ data: [...] }` | `401`, `403` |

### Tarefas

| Rota | Objetivo | Auth / Autorização | Params / Body | Resposta | Erros |
|---|---|---|---|---|---|
| `GET /tasks` | listar | sim; **`?scope=all`** exige `tasks:read:any` | query: `page`, `limit`, `completed` (`true`/`false`), `scope` (`own`/`all`) | `200` `{ data: [...], meta }` | `400`, `401`, `403` (scope=all) |
| `POST /tasks` | criar (para mim) | sim | body: `title` (1-150), `description?` (≤ 2000) | `201` `{ data }` | `400`, `401` |
| `GET /tasks/:id` | consultar | **dono** ou `tasks:read:any` | `:id` UUID | `200` `{ data }` | `400`, `401`, `404` |
| `PATCH /tasks/:id` | atualizar parcialmente | **dono** ou `tasks:write:any` | body com ≥ 1 de `title`, `description` (ou `null`), `completed` | `200` `{ data }` | `400`, `401`, `404` |
| `DELETE /tasks/:id` | excluir | **dono** ou `tasks:delete:any` | `:id` | `204` | `400`, `401`, `404` |

### Utilitárias
`GET /health` → `200 { status: "ok" }` · `GET /docs` (Swagger UI) · `GET /docs.json` (OpenAPI).

## 23.4 Os fluxos finais

```text
REQUISIÇÃO COMPLETA
CLIENTE → HTTP REQUEST → CORS → HELMET → RATE LIMIT → express.json/cookieParser
        → ROUTE → AUTHENTICATION → AUTHORIZATION → VALIDATION → CONTROLLER
        → SERVICE → PRISMA → POSTGRESQL → SERVICE → CONTROLLER → HTTP RESPONSE
        (erro em qualquer ponto → ERROR MIDDLEWARE → { error })
```
```text
REGISTER
POST /auth/register → VALIDATION (Zod) → SERVICE → BCRYPT (hash+salt) → PRISMA (INSERT users + users_roles) → DATABASE (unique, FKs)
```
```text
LOGIN
POST /auth/login → VALIDATION → SERVICE → PRISMA (busca por e-mail) → DATABASE
  → BCRYPT.compare → ACCESS TOKEN (15 min, sub) + REFRESH TOKEN (7 d, jti)
  → HASH SHA-256 do refresh → DATABASE (refresh_tokens) → COOKIE HTTPONLY (token) + body (access)
```
```text
PROTECTED ROUTE
Bearer ACCESS TOKEN → JWT VERIFY → USER (consulta ao banco) → ROLE/PERMISSION → SERVICE (dono?) → DATABASE
```
```text
REFRESH
COOKIE HTTPONLY → VALIDATE JWT → ACHA A LINHA (jti) → COMPARE HASH → CHECK REVOCATION
  ├─ já revogado → REUSE DETECTION: revoga a família → 401
  └─ livre → ROTATE (revoga o antigo + cria o novo, atomicamente) → NOVOS TOKENS → UPDATE COOKIE
```
```text
LOGOUT
REFRESH TOKEN (cookie) → REVOKE SESSION (família) → CLEAR COOKIE → refresh dá 401
```

## 23.5 Perguntas de entrevista (com respostas de nível Júnior)

**1. O que é JWT?**
É uma string assinada com três partes (header, payload, signature) que carrega dados (como o id do usuário) e permite ao servidor verificar que o token é dele e não foi alterado, sem guardar sessão. O payload é só codificado, não secreto.

**2. Qual a diferença entre access token e refresh token?**
O access token é curto (15 min) e abre as rotas protegidas; vai em todo request. O refresh token é longo (7 dias), fica em cookie HttpOnly e só serve para pedir um novo access token.

**3. Por que usar refresh token?**
Para ter sessão longa sem deixar um token de longa duração circulando. O token exposto o tempo todo vive pouco; o de vida longa circula raramente e fica protegido.

**4. O que é refresh token rotation?**
Cada refresh token só pode ser usado uma vez: ao usá-lo, o servidor o invalida e devolve um novo, junto de um novo access token.

**5. O que é reuse detection?**
É perceber que um refresh token **já usado** foi apresentado de novo (sinal de roubo ou cliente com defeito). Quando acontece, o servidor revoga a sessão inteira (a "família" de tokens) e todos precisam logar de novo.

**6. Por que usar HttpOnly?**
Para o JavaScript da página não conseguir ler o cookie. Se houver XSS, o script malicioso não consegue roubar o refresh token.

**7. O que é CORS?**
Uma regra do **navegador**: o JS de um site não pode ler respostas de outra origem a menos que o servidor autorize com headers `Access-Control-Allow-*`. Com cookies é preciso `credentials` e uma origem exata (não `*`). Ele não protege a API de clientes fora do navegador.

**8. O que é Helmet?**
Um middleware que adiciona headers HTTP de segurança (CSP, nosniff, HSTS, X-Frame-Options...) e remove `X-Powered-By`, instruindo o navegador a se proteger de ataques comuns.

**9. O que é rate limiting?**
Limitar quantas requisições um cliente faz numa janela de tempo, respondendo 429 ao passar. Dificulta força bruta e abuso, principalmente em login, cadastro e refresh.

**10. O que é bcrypt?**
Um algoritmo de hash de senhas com salt e custo configurável, lento de propósito para dificultar adivinhação em massa. Para conferir uma senha usamos `bcrypt.compare`, nunca comparação direta.

**11. O que é Prisma?**
Um ORM para Node: eu descrevo o banco em um `schema.prisma`, ele gera as migrations e um client com métodos tipados (`findMany`, `create`...) que viram SQL parametrizado.

**12. O que é ORM?**
Uma camada que mapeia tabelas para objetos da linguagem, para consultar e gravar sem escrever SQL manualmente, com consistência e proteção contra SQL injection.

**13. O que é middleware?**
Uma função `(req, res, next)` que roda entre a requisição e o controller para tarefas transversais (autenticar, validar, logar). Pode alterar `req`, responder ou chamar `next()`. A ordem de registro define a ordem de execução.

**14. Qual a diferença entre authentication e authorization?**
Autenticação responde "quem é você?" (provar identidade). Autorização responde "o que você pode fazer?" (regras de acesso). Estar autenticado não implica ter permissão.

**15. O que é role?**
Um papel (ex.: ADMIN, USER) que agrupa um conjunto de permissões, facilitando a gestão de acesso.

**16. O que é permission?**
Um poder específico, como `tasks:read:any`. Roles contêm permissions, e um usuário também pode recebê-las diretamente; a permissão efetiva é a união.

**17. Como funciona uma requisição protegida?**
O cliente envia `Authorization: Bearer <token>`; o middleware verifica a assinatura e a validade do JWT, carrega o usuário (com roles/permissions) e coloca em `req.user`; os middlewares de autorização conferem os poderes; o controller chama o service, que aplica a regra de negócio e usa o Prisma.

**18. Por que não colocar regras de negócio no controller?**
Porque o controller deve só traduzir HTTP. Regras no service ficam em um só lugar, são reutilizáveis (e protegem todas as rotas que as usam), e são mais fáceis de testar e manter. Controllers grandes duplicam regras e divergem.

**19. Por que não armazenar senha em texto puro?**
Se o banco vazar, todas as senhas ficam expostas (e como as pessoas reutilizam senhas, outras contas também). Guardando um hash com salt, o vazamento não revela as senhas.

**20. Por que não colocar o refresh token no localStorage?**
Porque qualquer JavaScript da página lê o localStorage; uma falha de XSS entregaria o token. O cookie HttpOnly não é legível por JS.

**21. Por que usar variáveis de ambiente?**
Para manter segredos e configurações que mudam por ambiente (banco, chaves, origens) fora do código e do Git, trocando valores sem alterar o código. Validamos na partida para falhar cedo.

**Bônus**
- *Por que guardar o hash do refresh token e não o token?* Se o banco vazar, os hashes não servem como cookie.
- *Por que 401 x 403 x 404?* 401 = não autenticado; 403 = autenticado sem permissão; 404 = não existe (para você; evita revelar existência).
- *Por que o JWT só tem `sub`?* O payload é público; dados sensíveis ou mutáveis (roles) não devem ficar nele.
- *Por que o login responde igual para e-mail inexistente e senha errada?* Para não revelar quais e-mails estão cadastrados (enumeração de usuários).

## 23.6 Próximos passos (só conceitual)

Quando fizer sentido, e **não agora**: um **job** para apagar refresh tokens vencidos/revogados (a coluna `expires_at` já existe); **"sair de todos os aparelhos"**; e-mail de **verificação** e **reset de senha**; **2FA**; **Redis** como armazenamento do rate limit em várias instâncias; **Docker** para padronizar o ambiente; **CI** executando os testes a cada push; **logs estruturados** e monitoramento; e, só se o projeto crescer muito, padrões mais avançados (CQRS, eventos, microsserviços), que **não** são necessários para uma API Júnior sólida como esta.

## 23.7 Checklist final do projeto

```text
[ ] Node.js configurado (22.12+)
[ ] Express configurado (5.x)
[ ] PostgreSQL configurado (bancos tasksdb e tasksdb_test)
[ ] Prisma configurado (schema, config, client gerado)
[ ] Migrations funcionando (migrate dev / migrate deploy)
[ ] Users
[ ] Tasks
[ ] Roles
[ ] Permissions
[ ] Relationships (1:N e N:N explícitas)
[ ] Register
[ ] bcrypt
[ ] Login
[ ] Access Token
[ ] Refresh Token
[ ] Refresh Token Rotation
[ ] Reuse Detection
[ ] HTTPOnly Cookie
[ ] Logout
[ ] Authentication Middleware
[ ] Authorization (ownership, role, permission)
[ ] Helmet
[ ] CORS
[ ] Rate Limiting
[ ] Validation (Zod)
[ ] Error Handling
[ ] Swagger/OpenAPI (/docs)
[ ] Tests (npm test: 50 passando)
[ ] Git (commits organizados)
[ ] README
```

**Parabéns.** Se você consegue explicar, **sem olhar o código**, o caminho de um login, de uma rota protegida e de um refresh com reuso, você entendeu a API.
