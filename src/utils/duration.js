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
