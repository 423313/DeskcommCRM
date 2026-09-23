/**
 * O AVISO "FALTA A SUA IA PRINCIPAL" SÓ APARECE QUANDO FALTA MESMO.
 *
 * A chave do Jev sozinha não faz ninguém atender: ele decide, não conversa. A
 * tela de Credenciais avisa isso — mas olhava só as LINHAS de credencial. No
 * caso mais comum do kit a chave da IA principal está no `.env` da instalação
 * (`ANTHROPIC_API_KEY`, `AI_GATEWAY_API_KEY`…), que não é linha nenhuma: quem
 * atendia com ela e cadastrava a chave do Jev via um alerta âmbar dizendo que a
 * IA principal faltava, com ela funcionando.
 *
 * Pela PÁGINA, não só pelo componente: o defeito era a página não contar ao
 * componente o que o `.env` tem.
 */
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import "@testing-library/jest-dom/vitest";

import type { CredentialRow } from "@/hooks/ai/useCredentials";
import { IdiomaProvider } from "@/lib/i18n/IdiomaProvider";

const ORG = "11111111-1111-4111-8111-111111111111";

const banco = vi.hoisted(() => ({ linhas: [] as unknown[] }));
const api = vi.hoisted(() => ({ get: vi.fn(), patch: vi.fn(), post: vi.fn(), delete: vi.fn() }));

vi.mock("next/navigation", () => ({
  redirect: vi.fn(),
  useRouter: () => ({ refresh: vi.fn(), push: vi.fn() }),
}));
vi.mock("@/lib/api/client", () => ({ apiClient: api }));
vi.mock("@/components/feedback/ApiErrorToast", () => ({ showApiError: vi.fn() }));
vi.mock("sonner", () => ({ toast: { success: vi.fn(), error: vi.fn(), loading: vi.fn(), dismiss: vi.fn() } }));
vi.mock("@/app/app/ai/credentials/_actions", () => ({ refreshCredentialsView: vi.fn(async () => {}) }));
vi.mock("@/lib/auth/server", () => ({
  requireAuth: vi.fn(async () => ({ id: "actor", idioma: "pt-BR" })),
  resolveActiveOrg: vi.fn(async () => ({ orgId: ORG, role: "admin" })),
}));
vi.mock("@/lib/supabase/server", () => ({
  createClient: async () => ({
    from: (tabela: string) => {
      const dados = tabela === "ai_provider_credentials_safe" ? banco.linhas : [];
      const chain: Record<string, unknown> = {
        then: (ok: (v: unknown) => unknown, erro: (e: unknown) => unknown) =>
          Promise.resolve({ data: dados, error: null }).then(ok, erro),
      };
      for (const m of ["select", "eq", "order", "in"]) chain[m] = () => chain;
      return chain;
    },
  }),
}));

import CredentialsPage from "@/app/app/ai/credentials/page";

function credencial(provider: CredentialRow["provider"], id: string): CredentialRow {
  const agora = new Date().toISOString();
  return {
    id,
    organization_id: ORG,
    provider,
    label: provider,
    api_key_last4: "c0de",
    validated_at: agora,
    validation_error: null,
    models_available: [],
    is_active: true,
    created_by: "actor",
    created_at: agora,
    updated_at: agora,
  };
}

const JEV = credencial("typesafe", "22222222-2222-4222-8222-222222222222");
const ANTHROPIC = credencial("anthropic", "33333333-3333-4333-8333-333333333333");

/** Todas as variáveis que `lerAmbiente` lê para IA — o `.env.local` não entra. */
function ambiente(preenchidas: string[]) {
  for (const nome of ["ANTHROPIC_API_KEY", "OPENAI_API_KEY", "OPENROUTER_API_KEY", "AI_GATEWAY_API_KEY"]) {
    vi.stubEnv(nome, preenchidas.includes(nome) ? "chave-da-instalacao" : "");
  }
}

async function abrir(linhas: CredentialRow[]) {
  banco.linhas = linhas;
  api.get.mockResolvedValue({ data: linhas });
  const pagina = await CredentialsPage();
  render(
    <IdiomaProvider locale="pt-BR">
      <QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}>
        {pagina}
      </QueryClientProvider>
    </IdiomaProvider>,
  );
}

beforeEach(() => vi.clearAllMocks());
afterEach(() => {
  cleanup();
  vi.unstubAllEnvs();
});

describe("tela de Credenciais — o aviso de que falta a IA principal", () => {
  it("só a chave do Jev e nenhuma IA na instalação: avisa", async () => {
    ambiente([]);
    await abrir([JEV]);
    expect(screen.getByTestId("aviso-so-decisao")).toHaveTextContent(/falta a chave da sua IA principal/);
    // Controle positivo: a chave do Jev está na lista (não sumiu no agrupamento).
    expect(screen.getByText("Jev (TypeSafe AI)")).toBeInTheDocument();
  });

  it.each([["ANTHROPIC_API_KEY"], ["OPENAI_API_KEY"], ["OPENROUTER_API_KEY"], ["AI_GATEWAY_API_KEY"]])(
    "só a chave do Jev, mas a instalação trouxe %s: não avisa",
    async (variavel) => {
      ambiente([variavel]);
      await abrir([JEV]);
      expect(screen.getByText("Jev (TypeSafe AI)")).toBeInTheDocument();
      expect(screen.queryByTestId("aviso-so-decisao")).toBeNull();
    },
  );

  it("chave do Jev e chave de IA de conversa cadastrada: não avisa", async () => {
    ambiente([]);
    await abrir([JEV, ANTHROPIC]);
    expect(screen.queryByTestId("aviso-so-decisao")).toBeNull();
  });
});
