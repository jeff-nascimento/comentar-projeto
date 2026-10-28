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
