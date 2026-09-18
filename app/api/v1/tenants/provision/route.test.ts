/**
 * A porta que cria organizações por API nasce FECHADA (doc 38, opção b).
 *
 * O caso que mais importa aqui é o primeiro: numa instalação que não definiu
 * `TENANT_PROVISIONING_SECRET`, a rota não existe para ninguém — nem com um
 * Bearer qualquer, nem com um vazio. O resto prova a ordem das guardas: limite
 * antes do segredo (é o limite que segura quem tenta adivinhá-lo), segredo antes
 * do corpo, e o provisionamento só roda depois das três.
 */
import { NextRequest } from "next/server";
import { beforeEach, describe, expect, it, vi } from "vitest";

import type * as ProvisionModule from "@/lib/auth/provision";

const h = vi.hoisted(() => ({
  env: { TENANT_PROVISIONING_SECRET: "" },
  provision: vi.fn(),
  rotate: vi.fn(),
  limite: vi.fn(),
}));

vi.mock("@/lib/env", () => ({ env: h.env }));
vi.mock("@/lib/ai/dispatcher/rate-limit", () => ({ checkRateLimit: h.limite }));
vi.mock("@/lib/tenants/api-key", () => ({ rotateIntegrationApiKey: h.rotate }));
vi.mock("@/lib/auth/provision", async (original) => {
  const real = await original<typeof ProvisionModule>();
  return { ProvisionConflictError: real.ProvisionConflictError, provisionExternalTenant: h.provision };
});

const { POST } = await import("./route");
const { ProvisionConflictError } = await import("@/lib/auth/provision");

const SEGREDO = "s".repeat(40);
const CORPO = {
  integration: "clinicfx",
  external_id: "clinica-42",
  organization_name: "Clínica Sorriso",
  owner_email: "dona@clinica.test",
  owner_name: "Dona da Clínica",
};

function pedido(bearer: string | null, corpo: unknown = CORPO): NextRequest {
  return new NextRequest("http://localhost/api/v1/tenants/provision", {
    method: "POST",
    headers: {
      "content-type": "application/json",
      ...(bearer === null ? {} : { authorization: `Bearer ${bearer}` }),
    },
    body: JSON.stringify(corpo),
  });
}

beforeEach(() => {
  vi.clearAllMocks();
  h.env.TENANT_PROVISIONING_SECRET = SEGREDO;
  h.limite.mockResolvedValue({ allowed: true, count: 1, limit: 10, window_sec: 60 });
  h.provision.mockResolvedValue({ organizationId: "org-1", ownerId: "user-1", replay: false });
  h.rotate.mockResolvedValue("dsk_abcd1234_segredo");
});

describe("desligada por padrão", () => {
  it("sem o segredo da instalação, a rota não existe — nem com Bearer", async () => {
    h.env.TENANT_PROVISIONING_SECRET = "";
    for (const bearer of [null, "", "qualquer-coisa", SEGREDO]) {
      const res = await POST(pedido(bearer));
      expect(res.status, `bearer=${String(bearer)}`).toBe(404);
    }
    expect(h.provision).not.toHaveBeenCalled();
  });

  it("segredo curto demais também deixa a rota desligada", async () => {
    h.env.TENANT_PROVISIONING_SECRET = "s".repeat(31);
    expect((await POST(pedido("s".repeat(31)))).status).toBe(404);
    expect(h.provision).not.toHaveBeenCalled();
  });
});

describe("ligada: as guardas, em ordem", () => {
  it("Bearer errado ou ausente → 401, sem provisionar", async () => {
    expect((await POST(pedido("s".repeat(39) + "x"))).status).toBe(401);
    expect((await POST(pedido(null))).status).toBe(401);
    expect(h.provision).not.toHaveBeenCalled();
  });

  it("acima do limite → 429 com Retry-After, antes de olhar o segredo", async () => {
    h.limite.mockResolvedValue({ allowed: false, count: 11, limit: 10, window_sec: 60 });
    const res = await POST(pedido(SEGREDO));
    expect(res.status).toBe(429);
    expect(res.headers.get("Retry-After")).toBe("60");
    expect(res.headers.get("X-RateLimit-Limit")).toBe("10");
    expect(h.provision).not.toHaveBeenCalled();
  });

  it("corpo inválido → 422, sem provisionar", async () => {
    const res = await POST(pedido(SEGREDO, { ...CORPO, integration: "tem espaço" }));
    expect(res.status).toBe(422);
    expect(h.provision).not.toHaveBeenCalled();
  });

  it("campo a mais no corpo é recusado — organization_id não entra pelo cliente", async () => {
    const res = await POST(pedido(SEGREDO, { ...CORPO, organization_id: "org-de-outro" }));
    expect(res.status).toBe(422);
    expect(h.provision).not.toHaveBeenCalled();
  });
});

describe("ligada: o provisionamento", () => {
  it("cria → 201 com a chave, uma vez, e o escopo da integração", async () => {
    const res = await POST(pedido(SEGREDO));
    expect(res.status).toBe(201);
    expect(await res.json()).toEqual({
      data: { organization_id: "org-1", api_key: "dsk_abcd1234_segredo", replay: false },
    });
    expect(h.provision).toHaveBeenCalledWith({
      integration: "clinicfx",
      externalId: "clinica-42",
      organizationName: "Clínica Sorriso",
      ownerEmail: "dona@clinica.test",
      ownerName: "Dona da Clínica",
    });
    expect(h.rotate).toHaveBeenCalledWith(
      expect.objectContaining({
        organizationId: "org-1",
        createdBy: "user-1",
        integrationScope: "integration:clinicfx",
      }),
    );
  });

  it("replay → 200", async () => {
    h.provision.mockResolvedValue({ organizationId: "org-1", ownerId: "user-1", replay: true });
    expect((await POST(pedido(SEGREDO))).status).toBe(200);
  });

  it("slug de organização que não nasceu deste provisionamento → 409, sem chave", async () => {
    h.provision.mockRejectedValue(new ProvisionConflictError());
    expect((await POST(pedido(SEGREDO))).status).toBe(409);
    expect(h.rotate).not.toHaveBeenCalled();
  });
});
