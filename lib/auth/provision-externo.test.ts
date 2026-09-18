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
  inseridas: [] as Record<string, unknown>[],
  createUser: vi.fn(),
  listUsers: vi.fn(),
}));

vi.mock("@/lib/audit", () => ({ audit: vi.fn() }));
vi.mock("@/lib/supabase/admin", () => ({
  createAdminClient: () => ({
    auth: { admin: { createUser: h.createUser, listUsers: h.listUsers } },
    from: (tabela: string) => {
      const chain = {
        select: () => chain,
        eq: () => chain,
        is: () => chain,
        order: () => chain,
        limit: () => chain,
        maybeSingle: async () => ({ data: tabela === "organizations" ? h.org : null }),
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

const { provisionExternalTenant, slugDoProvisionamento, ProvisionConflictError } = await import(
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

describe("o dono", () => {
  it("e-mail novo: cria a conta, sem varrer a lista", async () => {
    const r = await provisionExternalTenant(ENTRADA);
    expect(r.ownerId).toBe("user-novo");
    expect(h.createUser).toHaveBeenCalledWith(expect.objectContaining({ email: "dona@clinica.test" }));
    expect(h.listUsers).not.toHaveBeenCalled();
  });

  it("e-mail que já tem conta: acha a conta além da primeira página", async () => {
    h.createUser.mockResolvedValue({
      data: { user: null },
      error: { code: "email_exists", status: 422, message: "email exists" },
    });
    const outros = Array.from({ length: 1000 }, (_, i) => ({ id: `u-${i}`, email: `u${i}@x.test` }));
    h.listUsers
      .mockResolvedValueOnce({ data: { users: outros }, error: null })
      .mockResolvedValueOnce({
        data: { users: [{ id: "user-antigo", email: "dona@clinica.test" }] },
        error: null,
      });
    const r = await provisionExternalTenant(ENTRADA);
    expect(r.ownerId).toBe("user-antigo");
    expect(h.listUsers).toHaveBeenCalledTimes(2);
  });

  it("erro que não é 'e-mail já existe' não vira busca: falha", async () => {
    h.createUser.mockResolvedValue({
      data: { user: null },
      error: { code: "unexpected_failure", status: 500, message: "boom" },
    });
    await expect(provisionExternalTenant(ENTRADA)).rejects.toThrow(/criar dono falhou/);
    expect(h.listUsers).not.toHaveBeenCalled();
  });
});
