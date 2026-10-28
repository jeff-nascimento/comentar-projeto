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
