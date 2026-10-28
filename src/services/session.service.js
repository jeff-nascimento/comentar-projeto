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
