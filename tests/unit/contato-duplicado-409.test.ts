/**
 * Fatia S1 da issue #852: telefone já cadastrado deixou de ser 500.
 *
 * `POST /api/v1/contacts` normaliza o telefone e tenta o insert. O índice
 * parcial `uniq_contacts_org_phone` (organization_id, phone_number) barra o
 * número repetido com 23505 — e o handler devolvia `internal_error`, então a
 * tela nem sabia que o cadastro já existia, muito menos qual era. Agora a
 * resposta é 409 `contact_exists` com `details.contact_id`, sempre do contato
 * vivo da MESMA organização (o id nunca vem do corpo da requisição).
 *
 * O cliente falso abaixo simula o índice de verdade: mesmo telefone (comparado
 * pela forma canônica, como o Postgres compara a coluna já gravada) na mesma
 * organização estoura; em outra organização, passa.
 */
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { HandlerCtx } from "@/lib/api/handlers/types";
import { canonicalPhoneBR, phoneLookupVariants } from "@/lib/channels/phone-variants";

const auditSpy = vi.fn(async () => undefined);

vi.mock("@/lib/audit", () => ({
  audit: auditSpy,
  isServiceRoleConfigured: () => false,
  hashEmail: (e: string) => e,
}));

const ORG = "c05e7a00-0000-4000-8000-000000000001";
const OUTRA_ORG = "c05e7a00-0000-4000-8000-000000000002";
const EXISTENTE = "c05e7a00-0000-4000-8000-0000000000c1";
const NOVO = "c05e7a00-0000-4000-8000-0000000000c2";
const USUARIO = "c05e7a00-0000-4000-8000-0000000000a1";
const TELEFONE = "(32) 98479-3302";

interface LinhaContato {
  id: string;
  organization_id: string;
  phone_number: string | null;
  is_merged_into?: string | null;
}

interface OpcoesFake {
  /** O que já está gravado na tabela antes do POST. */
  contatos?: LinhaContato[];
  /** Erro cru do INSERT, no lugar do simulador do índice (ex.: e-mail, CPF, FK). */
  falhaDoInsert?: { code: string; message: string } | null;
}

interface Cadeia {
  select: (colunas?: string, opcoes?: unknown) => Cadeia;
  insert: (linha: Record<string, unknown>) => Cadeia;
  update: (linha: Record<string, unknown>) => Cadeia;
  eq: (coluna: string, valor: unknown) => Cadeia;
  in: (coluna: string, valores: unknown) => Cadeia;
  is: (coluna: string, valor: unknown) => Cadeia;
  order: (coluna: string, opcoes?: unknown) => Cadeia;
  limit: (n: number) => Cadeia;
  single: () => Promise<{ data: unknown; error: unknown }>;
  maybeSingle: () => Promise<{ data: unknown; error: unknown }>;
  then: (resolve: (v: unknown) => unknown) => unknown;
}

const buscas: Array<{ tabela: string; filtros: Array<[string, unknown]> }> = [];
const inserts: Array<Record<string, unknown>> = [];

/** Cadeia de qualquer tabela que não seja `contacts`: responde vazio. */
function cadeiaQualquer(tabela: string): Cadeia {
  const cadeia: Cadeia = {
    select: () => cadeia,
    insert: () => cadeia,
    update: () => cadeia,
    eq: () => cadeia,
    in: () => cadeia,
    is: () => cadeia,
    order: () => cadeia,
    limit: () => cadeia,
    single: async () => ({ data: null, error: null }),
    maybeSingle: async () => ({ data: null, error: null }),
    then: (resolve) => resolve({ data: [], error: null, tabela }),
  };
  return cadeia;
}

function cadeiaDeContatos(opts?: OpcoesFake, gravados: LinhaContato[] = []): Cadeia {
  const filtros: Array<[string, unknown]> = [];
  let variantes: string[] = [];
  let limite: number | null = null;
  let linhaDoInsert: Record<string, unknown> | null = null;

  const erroDeIndex = (linha: Record<string, unknown>) => {
    if (opts?.falhaDoInsert) return opts.falhaDoInsert;
    const telefone = typeof linha.phone_number === "string" ? linha.phone_number : null;
    if (!telefone) return null;
    const repetido = gravados.some(
      (c) =>
        c.organization_id === linha.organization_id &&
        !c.is_merged_into &&
        canonicalPhoneBR(c.phone_number ?? "") === canonicalPhoneBR(telefone),
    );
    return repetido
      ? {
          code: "23505",
          message: 'duplicate key value violates unique constraint "uniq_contacts_org_phone"',
        }
      : null;
  };

  const cadeia: Cadeia = {
    select: () => cadeia,
    insert: (linha) => {
      linhaDoInsert = linha;
      inserts.push(linha);
      return cadeia;
    },
    update: () => cadeia,
    eq: (coluna, valor) => {
      filtros.push([coluna, valor]);
      return cadeia;
    },
    in: (coluna, valores) => {
      filtros.push([coluna, valores]);
      variantes = Array.isArray(valores) ? (valores as string[]) : [];
      return cadeia;
    },
    is: (coluna, valor) => {
      filtros.push([coluna, valor]);
      return cadeia;
    },
    order: () => cadeia,
    limit: (n) => {
      limite = n;
      return cadeia;
    },
    maybeSingle: async () => ({ data: null, error: null }),
    single: async () => {
      if (!linhaDoInsert) return { data: null, error: null };
      const error = erroDeIndex(linhaDoInsert);
      if (error) return { data: null, error };
      return {
        data: {
          ...linhaDoInsert,
          id: NOVO,
          created_at: "2026-01-01T00:00:00.000Z",
          updated_at: "2026-01-01T00:00:00.000Z",
        },
        error: null,
      };
    },
    then: (resolve) => {
      buscas.push({ tabela: "contacts", filtros });
      const daOrg = filtros.find(([coluna]) => coluna === "organization_id")?.[1];
      const soVivos = filtros.some(([coluna]) => coluna === "is_merged_into");
      const achados = gravados
        .filter((c) => c.organization_id === daOrg)
        .filter((c) => !soVivos || !c.is_merged_into)
        .filter((c) => variantes.length === 0 || variantes.includes(c.phone_number ?? ""))
        .map((c) => ({ id: c.id, phone_number: c.phone_number }));
      return resolve({ data: limite === null ? achados : achados.slice(0, limite), error: null });
    },
  };
  return cadeia;
}

function clienteFalso(opts?: OpcoesFake): unknown {
  return {
    from: (tabela: string) =>
      tabela === "contacts"
        ? cadeiaDeContatos(opts, [...(opts?.contatos ?? [])])
        : cadeiaQualquer(tabela),
    rpc: () => ({ then: (r: (v: unknown) => unknown) => r({ error: null }) }),
  };
}

function ctxFalso(organizationId = ORG): HandlerCtx {
  return { organization_id: organizationId, actor: { type: "user", id: USUARIO }, requestId: "req-1" };
}

function criar(cliente: unknown, entrada: Record<string, unknown> = { name: "Ana" }) {
  return import("@/app/api/v1/contacts/_handler").then(({ createContactHandler }) =>
    createContactHandler(cliente as never, ctxFalso(), {
      phone_number: TELEFONE,
      ...entrada,
    } as never),
  );
}

async function erroDe(promessa: Promise<unknown>): Promise<Record<string, unknown>> {
  try {
    await promessa;
  } catch (e) {
    return e as unknown as Record<string, unknown>;
  }
  throw new Error("esperava que o handler falhasse, e ele resolveu");
}

const contatoDaOrg = (organization_id: string): LinhaContato => ({
  id: EXISTENTE,
  organization_id,
  phone_number: canonicalPhoneBR(TELEFONE),
});

describe("createContactHandler — telefone repetido (fatia S1 da #852)", () => {
  beforeEach(() => {
    auditSpy.mockClear();
    buscas.length = 0;
    inserts.length = 0;
  });

  it("telefone que já existe na organização: 409 contact_exists com o id de quem já estava lá", async () => {
    const erro = await erroDe(criar(clienteFalso({ contatos: [contatoDaOrg(ORG)] })));

    expect(erro).toMatchObject({
      status: 409,
      code: "contact_exists",
      details: { contact_id: EXISTENTE },
    });

    // O telefone vai para o insert na forma canônica e a releitura repete o
    // filtro por organização: sem ele, contato de OUTRA org seria oferecido.
    expect(inserts[0]?.phone_number).toBe(canonicalPhoneBR(TELEFONE));
    expect(buscas).toEqual([
      {
        tabela: "contacts",
        filtros: [
          ["organization_id", ORG],
          ["phone_number", phoneLookupVariants(TELEFONE)],
          ["is_merged_into", null],
        ],
      },
    ]);
    // Nada foi criado: não há audit de `contact.created` para um cadastro que
    // não passou.
    expect(auditSpy).not.toHaveBeenCalledWith(expect.objectContaining({ action: "contact.created" }));
  });

  it("mesmo telefone em OUTRA organização: cria normalmente", async () => {
    const out = (await criar(clienteFalso({ contatos: [contatoDaOrg(OUTRA_ORG)] }))) as {
      contact: { id: string };
      action: string;
    };

    expect(out.action).toBe("created");
    expect(out.contact.id).toBe(NOVO);
    // Caminho feliz não relê contato: a busca por telefone só existe depois do
    // 23505 (o primeiro teste trava os filtros exatos dela). Aqui o valor da
    // asserção é o oposto — garantir que criar contato novo não ganha consulta
    // extra.
    expect(buscas).toEqual([]);
    expect(auditSpy).toHaveBeenCalledWith(
      expect.objectContaining({ action: "contact.created", organizationId: ORG }),
    );
  });

  it("23505 sem nenhum contato vivo com aquele telefone: continua 500, sem inventar 409", async () => {
    // Conflito de outra trava única da tabela (e-mail/CPF): o 23505 não diz qual
    // índice bateu, então quem decide é a releitura do telefone.
    const erro = await erroDe(
      criar(clienteFalso({ falhaDoInsert: { code: "23505", message: "uniq_contacts_org_email" } })),
    );

    expect(erro).toMatchObject({ status: 500, code: "internal_error" });
    expect(erro.details).toBeUndefined();
  });

  it("23505 cru: se existe contato vivo com o telefone, o estado já garante a trava de telefone", async () => {
    // O Postgres nomeia UM dos índices violados; o estado (contato vivo com o
    // mesmo telefone na mesma org) implica que a trava de telefone está lá de
    // qualquer jeito — por isso a resposta não depende do texto do erro.
    const erro = await erroDe(
      criar(
        clienteFalso({
          contatos: [contatoDaOrg(ORG)],
          falhaDoInsert: { code: "23505", message: 'duplicate key value violates unique constraint "contacts_pkey"' },
        }),
      ),
    );

    expect(erro).toMatchObject({ status: 409, code: "contact_exists", details: { contact_id: EXISTENTE } });
  });

  it("erro de outra natureza (23503) mantém o desfecho de antes", async () => {
    const erro = await erroDe(
      criar(clienteFalso({ falhaDoInsert: { code: "23503", message: "fk de organização" } })),
    );

    expect(erro).toMatchObject({ status: 500, code: "internal_error" });
    // Não é 23505: nem chega a procurar contato pelo telefone.
    expect(buscas).toEqual([]);
  });
});
