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
