/**
 * `provisionExternalTenant`: o reencontro exige o MARCADOR, e o dono é achado
 * mesmo além da primeira página de contas.
 *
 * Slug é espaço compartilhado com o cadastro pela tela. Sem o marcador, uma
 * organização criada à mão com o slug certo viraria "replay" — e a rota
 * entregaria uma chave dela a um sistema de fora.
 */
import { beforeEach, describe, expect, it, vi } from "vitest";

const h = vi.hoisted(() => ({
  org: null as Record<string, unknown> | null,
  erroDaOrg: null as { message: string } | null,
  membro: null as Record<string, unknown> | null,
  filtrosDoMembro: [] as unknown[][],
  auditadas: [] as Record<string, unknown>[],
  inseridas: [] as Record<string, unknown>[],
  createUser: vi.fn(),
  listUsers: vi.fn(),
}));

vi.mock("@/lib/audit", () => ({
  audit: (linha: Record<string, unknown>) => {
    h.auditadas.push(linha);
  },
}));
vi.mock("@/lib/supabase/admin", () => ({
  createAdminClient: () => ({
    auth: { admin: { createUser: h.createUser, listUsers: h.listUsers } },
    from: (tabela: string) => {
      const chain = {
        select: () => chain,
        eq: (...args: unknown[]) => {
          if (tabela === "user_organizations") h.filtrosDoMembro.push(args);
          return chain;
        },
        is: () => chain,
        order: () => chain,
        limit: () => chain,
        maybeSingle: async () =>
          tabela === "organizations"
            ? { data: h.org, error: h.erroDaOrg }
            : { data: h.membro, error: null },
        insert: (linha: Record<string, unknown>) => {
          h.inseridas.push({ tabela, ...linha });
          return {
            select: () => ({ single: async () => ({ data: { id: "org-nova" }, error: null }) }),
            then: (ok: (v: unknown) => unknown) => ok({ error: null }),
          };
        },
      };
      return chain;
    },
  }),
}));

const { provisionExternalTenant, slugDoProvisionamento, ProvisionConflictError, EmailJaTemContaError } =
  await import(
  "./provision"
);

const ENTRADA = {
  integration: "clinicfx",
  externalId: "clinica-42",
  organizationName: "Clínica Sorriso",
  ownerEmail: "Dona@Clinica.test",
  ownerName: "Dona",
};

beforeEach(() => {
  vi.clearAllMocks();
  h.org = null;
  h.erroDaOrg = null;
  h.membro = null;
  h.filtrosDoMembro = [];
  h.auditadas = [];
  h.inseridas = [];
  h.createUser.mockResolvedValue({ data: { user: { id: "user-novo" } }, error: null });
});

describe("o reencontro exige o marcador", () => {
  it("organização com o slug e o marcador certo é replay", async () => {
    h.org = {
      id: "org-1",
      created_by: "user-1",
      settings: { provisioning: { integration: "clinicfx", external_id: "clinica-42" } },
    };
    expect(await provisionExternalTenant(ENTRADA)).toEqual({
      organizationId: "org-1",
      ownerId: "user-1",
      replay: true,
    });
    expect(h.createUser).not.toHaveBeenCalled();
  });

  it("organização com o slug e SEM o marcador é conflito, não replay", async () => {
    h.org = { id: "org-alheia", created_by: "user-x", settings: {} };
    await expect(provisionExternalTenant(ENTRADA)).rejects.toBeInstanceOf(ProvisionConflictError);
  });

  it("marcador de outro id externo também é conflito", async () => {
    h.org = {
      id: "org-1",
      created_by: "user-1",
      settings: { provisioning: { integration: "clinicfx", external_id: "outra" } },
    };
    await expect(provisionExternalTenant(ENTRADA)).rejects.toBeInstanceOf(ProvisionConflictError);
  });

  it("organização nova grava o marcador que o reencontro vai conferir", async () => {
    await provisionExternalTenant(ENTRADA);
    const org = h.inseridas.find((l) => l.tabela === "organizations");
    expect(org?.slug).toBe(slugDoProvisionamento("clinicfx", "clinica-42"));
    expect(org?.settings).toEqual({
      provisioning: { integration: "clinicfx", external_id: "clinica-42" },
    });
  });

  it("ids externos diferentes nunca dividem o slug, nem os longos de prefixo igual", () => {
    const longo = "x".repeat(40);
    expect(slugDoProvisionamento("clinicfx", `${longo}-1`)).not.toBe(
      slugDoProvisionamento("clinicfx", `${longo}-2`),
    );
  });
});

describe("o que a revisão de segurança pediu", () => {
  it("falha na busca da organização não vira 'não existe'", async () => {
    h.erroDaOrg = { message: "PostgREST fora" };
    await expect(provisionExternalTenant(ENTRADA)).rejects.toThrow(/busca da organização falhou/);
    expect(h.createUser).not.toHaveBeenCalled();
  });

  it("o replay sem created_by procura um ADMIN, não o primeiro vínculo qualquer", async () => {
    h.org = {
      id: "org-1",
      created_by: null,
      settings: { provisioning: { integration: "clinicfx", external_id: "clinica-42" } },
    };
    h.membro = { user_id: "admin-1" };
    const r = await provisionExternalTenant(ENTRADA);
    expect(r.ownerId).toBe("admin-1");
    expect(h.filtrosDoMembro).toContainEqual(["role", "admin"]);
  });

  it("a auditoria da criação credita a máquina e leva o requestId", async () => {
    await provisionExternalTenant({ ...ENTRADA, requestId: "req-9" });
    const criada = h.auditadas.find((a) => a.action === "tenant.created_by_provisioning");
    expect(criada?.actorUserId).toBeNull();
    expect(criada?.requestId).toBe("req-9");
    expect((criada?.metadata as { owner_user_id: string }).owner_user_id).toBe("user-novo");
  });
});

describe("o dono", () => {
  it("e-mail novo: cria a conta, sem varrer a lista", async () => {
    const r = await provisionExternalTenant(ENTRADA);
    expect(r.ownerId).toBe("user-novo");
    expect(h.createUser).toHaveBeenCalledWith(expect.objectContaining({ email: "dona@clinica.test" }));
    expect(h.listUsers).not.toHaveBeenCalled();
  });

  it("e-mail que já tem conta é RECUSADO, e nada é criado (decisão do dono, 19/09)", async () => {
    // Reaproveitar fazia de uma pessoa que já usa a instalação admin de uma
    // empresa nova, sem aceite, com o nome escolhido por um sistema de fora.
    h.createUser.mockResolvedValue({
      data: { user: null },
      error: { code: "email_exists", status: 422, message: "email exists" },
    });
    await expect(provisionExternalTenant(ENTRADA)).rejects.toBeInstanceOf(EmailJaTemContaError);
    expect(h.inseridas).toEqual([]);
    expect(h.listUsers).not.toHaveBeenCalled();
  });

  it("a forma antiga do GoTrue (422 'already registered') também é recusa", async () => {
    h.createUser.mockResolvedValue({
      data: { user: null },
      error: { status: 422, message: "A user with this email address has already been registered" },
    });
    await expect(provisionExternalTenant(ENTRADA)).rejects.toBeInstanceOf(EmailJaTemContaError);
    expect(h.inseridas).toEqual([]);
  });

  it("erro que não é 'e-mail já existe' não vira recusa: falha", async () => {
    h.createUser.mockResolvedValue({
      data: { user: null },
      error: { code: "unexpected_failure", status: 500, message: "boom" },
    });
    await expect(provisionExternalTenant(ENTRADA)).rejects.toThrow(/criar dono falhou/);
    expect(h.listUsers).not.toHaveBeenCalled();
  });
});
