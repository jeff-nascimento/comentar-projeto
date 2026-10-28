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
