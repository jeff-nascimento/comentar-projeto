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
