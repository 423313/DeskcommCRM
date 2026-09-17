import { readFileSync } from "node:fs";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

import { NOMES_DE_SESSAO_E2E, ehNomeDeSessaoE2E } from "@/scripts/lib/sessoes-e2e";

const RAIZ = process.cwd();
const ler = (p: string) => readFileSync(join(RAIZ, p), "utf8");

const CONFIG = ler("playwright.config.ts");
const TEARDOWN = ler("tests/e2e/global-teardown.ts");
const CLEANUP = ler("scripts/cleanup-e2e-channel-sessions.ts");

describe("sessões de canal criadas pelo E2E", () => {
  it("mantém os três nomes legados reconhecíveis", () => {
    expect(NOMES_DE_SESSAO_E2E).toEqual([
      "e2e-queue-session",
      "e2e-radar-session",
      "e2e-numero-conectado",
    ]);
    expect(ehNomeDeSessaoE2E("canal-real")).toBe(false);
  });

  it("o Playwright chama a limpeza mesmo quando uma spec falha", () => {
    expect(CONFIG).toContain('globalTeardown: "./tests/e2e/global-teardown.ts"');
    expect(TEARDOWN).toContain("limparSessoesDeCanalE2E");
  });

  it("a limpeza recusa destino remoto e remove dependências antes da sessão", () => {
    expect(CLEANUP).toContain("destinoEhLocal(credenciais.url)");
    expect(CLEANUP).toContain('from("conversations").delete()');
    expect(CLEANUP).toContain('from("channel_session_health")');
    expect(CLEANUP).toContain('from("channel_sessions").delete()');

    const conversas = CLEANUP.indexOf('from("conversations").delete()');
    const sessoes = CLEANUP.indexOf('from("channel_sessions").delete()');
    expect(conversas).toBeGreaterThan(-1);
    expect(sessoes).toBeGreaterThan(conversas);
  });
});
