import { readFileSync } from "node:fs";

import { defineConfig } from "@playwright/test";

/**
 * Lê o `.env.e2e` — o ambiente LOCAL da suíte.
 *
 * Falha ALTO se o arquivo não existir, em vez de deixar o app cair no
 * `.env.local`: o modo de falha silencioso aqui é a suíte rodar contra o banco
 * de PRODUÇÃO, que foi exatamente o que acontecia antes deste arquivo existir
 * (medido em 2026-08-06).
 */
function envDoE2E(): Record<string, string> {
  let bruto: string;
  try {
    bruto = readFileSync(".env.e2e", "utf8");
  } catch {
    throw new Error(
      "Falta o .env.e2e — rode `pnpm e2e:env` (precisa do Supabase local de pé).\n" +
        "Sem ele o app sob teste carregaria o .env.local, que aponta para PRODUÇÃO.",
    );
  }
  const env: Record<string, string> = {};
  for (const linha of bruto.split("\n")) {
    const limpa = linha.trim();
    if (limpa === "" || limpa.startsWith("#")) continue;
    const i = limpa.indexOf("=");
    if (i <= 0) continue;
    env[limpa.slice(0, i)] = limpa.slice(i + 1);
  }
  const url = env.NEXT_PUBLIC_SUPABASE_URL ?? "";
  if (!url.startsWith("http://127.0.0.1") && !url.startsWith("http://localhost")) {
    throw new Error(`.env.e2e aponta para um Supabase que não é local (${url}) — recusado.`);
  }
  return env;
}

function publicarNoProcesso(env: Record<string, string>): Record<string, string> {
  for (const [chave, valor] of Object.entries(env)) {
    if (process.env[chave] === undefined) process.env[chave] = valor;
  }
  return env;
}

const PORT = process.env.E2E_PORT ?? "3001";
const BASE_URL = `http://localhost:${PORT}`;

export default defineConfig({
  testDir: "./tests/e2e",
  globalTeardown: "./tests/e2e/global-teardown.ts",
  timeout: 30_000,
  fullyParallel: false,
  workers: 1,
  retries: 0,
  use: {
    baseURL: BASE_URL,
    trace: "retain-on-failure",
    screenshot: "only-on-failure",
  },
  webServer: {
    command: `pnpm exec next start --port ${PORT}`,
    env: publicarNoProcesso(envDoE2E()),
    url: BASE_URL,
    reuseExistingServer: false,
    timeout: 120_000,
  },
  projects: [{ name: "chromium", use: { browserName: "chromium" } }],
});
