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
