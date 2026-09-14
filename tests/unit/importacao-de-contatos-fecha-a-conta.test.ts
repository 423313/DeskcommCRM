/**
 * O relatório da importação FECHA: toda linha aparece em algum contador.
 *
 * O defeito, medido numa importação real de 647 clientes: a resposta dizia
 * "500 linhas, 487 duplicadas, 0 importadas, 0 erros" — e não dizia nada sobre
 * as outras 13. Linha repetida DENTRO do arquivo fazia `continue` seco, sem
 * incrementar contador nenhum, sumindo de `imported`, `skipped_duplicates` e
 * `errors` ao mesmo tempo.
 *
 * Quem importa uma base de clientes precisa fechar a conta. Sem isso não há como
 * distinguir "o resto era repetido" de "o resto se perdeu" — e a diferença entre
 * as duas é ligar para 13 clientes ou não.
 *
 * O segundo caso é o outro lado do mesmo achado: a dedup DENTRO do arquivo usava
 * o telefone literal enquanto a dedup contra o BANCO usa `phoneLookupVariants`.
 * Duas grafias do mesmo número na mesma planilha passavam as duas.
 */
import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

const deps = vi.hoisted(() => ({
  role: vi.fn(),
  support: vi.fn(),
  audit: vi.fn(),
  client: vi.fn(),
}));

vi.mock("@/lib/auth/require-role", () => ({ requireRole: deps.role }));
vi.mock("@/lib/impersonate/support", () => ({ requireSupportWrite: deps.support }));
vi.mock("@/lib/audit", () => ({ audit: deps.audit }));
vi.mock("@/lib/supabase/server", () => ({ createClient: deps.client }));

const ORG = "11111111-1111-4111-8111-111111111111";

/** Banco vazio: nenhum contato existente, todo insert dá certo. */
function bancoVazio(inseridos: Array<Record<string, unknown>>) {
  return {
    from: () => ({
      select: () => ({
        eq: () => ({
          not: () => ({ in: async () => ({ data: [] }) }),
          in: async () => ({ data: [] }),
        }),
        in: async () => ({ data: [] }),
      }),
      insert: (linha: Record<string, unknown>) => {
        inseridos.push(linha);
        return {
          select: () => ({
            single: async () => ({ data: { id: `c${inseridos.length}` }, error: null }),
          }),
        };
      },
    }),
    rpc: async () => ({ data: null, error: null }),
  };
}

/**
 * A rota só usa `req.formData()`. Construir um `NextRequest` com `body: form`
 * NÃO funciona aqui — medido: `formData()` falha e a rota devolve 422 na borda,
 * antes de qualquer contagem. O parsing multipart de verdade é exercitado por
 * `planilha-em-latin-1-nao-entra-corrompida`; o que este arquivo mede é o que
 * acontece DEPOIS dele.
 */
function req(csv: string) {
  const form = new FormData();
  form.set("file", new File([csv], "contatos.csv", { type: "text/csv" }));
  return { formData: async () => form } as unknown as NextRequest;
}

async function importar(csv: string) {
  const inseridos: Array<Record<string, unknown>> = [];
  deps.client.mockResolvedValue(bancoVazio(inseridos));
  const { POST } = await import("@/app/api/v1/contacts/import/route");
  const res = await POST(req(csv));
  const body = (await res.json()) as { data?: Record<string, unknown> };
  return { status: res.status, resumo: body.data ?? {}, inseridos };
}

beforeEach(() => {
  vi.clearAllMocks();
  deps.support.mockResolvedValue(null);
  deps.role.mockResolvedValue({
    ok: true,
    user: { id: "u", idioma: "pt-BR" },
    org: { orgId: ORG, role: "agent" },
  });
});

describe("relatório da importação de contatos", () => {
  it("toda linha cai em algum contador — a conta FECHA", async () => {
    const { status, resumo } = await importar(
      [
        "nome,celular",
        "Ana,+5541999990001",
        "Bruno,+5541999990002",
        "Ana de novo,+5541999990001", // repetida DENTRO do arquivo
        "Carla,+5541999990003",
      ].join("\n"),
    );

    expect({ status, resumo }).toMatchObject({ status: 200 });
  const total = resumo.total_linhas as number;
    const soma =
      (resumo.imported as number) +
      (resumo.skipped_duplicates as number) +
      (resumo.errors as unknown[]).length;

    expect(total).toBe(4);
    // A asserção que teria pego o defeito original: antes, soma era 3 e total 4.
    expect(soma, "linha que não aparece em contador nenhum some sem explicação").toBe(total);
    expect(resumo.imported).toBe(3);
    expect(resumo.skipped_duplicates).toBe(1);
  });

  it("duas GRAFIAS do mesmo número na mesma planilha não viram dois contatos", async () => {
    // +5541999990001 e +554199990001 são o mesmo telefone: a segunda é a
    // primeira sem o nono dígito. A dedup contra o banco já sabia disso; a de
    // dentro do arquivo não sabia, e as duas entravam.
    const { resumo, inseridos } = await importar(
      ["nome,celular", "Ana,+5541999990001", "Ana sem o nove,+554199990001"].join("\n"),
    );

    expect(inseridos).toHaveLength(1);
    expect(resumo.imported).toBe(1);
    expect(resumo.skipped_duplicates).toBe(1);
  });

  it("planilha inteiramente repetida não reporta zero duplicadas", async () => {
    // `candidatos` fica vazio e a rota retorna cedo — o caminho que zerava o
    // contador justamente quando ele mais importa.
    const { resumo } = await importar(
      ["nome,celular", "Ana,+5541999990001", "Ana,+5541999990001", "Ana,+5541999990001"].join("\n"),
    );

    expect(resumo.imported).toBe(1);
    expect(resumo.skipped_duplicates).toBe(2);
    expect(
      (resumo.imported as number) +
        (resumo.skipped_duplicates as number) +
        (resumo.errors as unknown[]).length,
    ).toBe(resumo.total_linhas);
  });

  it("linha inválida continua contando como ERRO, não como duplicada", async () => {
    const { resumo } = await importar(
      ["nome,celular", "Ana,+5541999990001", "Sem telefone,"].join("\n"),
    );

    expect((resumo.errors as unknown[]).length).toBeGreaterThan(0);
    expect(
      (resumo.imported as number) +
        (resumo.skipped_duplicates as number) +
        (resumo.errors as unknown[]).length,
    ).toBe(resumo.total_linhas);
  });
});
