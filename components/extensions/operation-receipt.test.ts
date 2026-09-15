import { describe, expect, it } from "vitest";

import { expectedOperation, parseExtensionOperationView } from "./operation-receipt";

const ID = "00000000-0000-4000-8000-000000000004";
const ORG = "00000000-0000-4000-8000-000000000001";

function receipt(kind: "catalog_admission" | "install" | "configure" = "configure") {
  return {
    id: ID,
    organization_id: ORG,
    kind,
    status: "completed",
    catalog_id: null,
    installation_id: "00000000-0000-4000-8000-000000000003",
    publisher: "equipe-exemplo",
    name: "rotina-comercial",
    version: "1.0.0",
    error_code: null,
    error_message: null,
    created_at: "2026-09-15T00:00:00.000Z",
    updated_at: "2026-09-15T00:01:00.000Z",
  };
}

describe("recibo de operação recebido pela UI", () => {
  it("rejeita JSON que omite organization_id", () => {
    const { organization_id: _, ...missing } = receipt();
    expect(parseExtensionOperationView(missing)).toBeNull();
  });

  it("exige organização exata para configuração", () => {
    expect(
      expectedOperation(receipt(), { id: ID, kind: "configure", organizationId: ORG }),
    ).not.toBeNull();
    expect(
      expectedOperation(
        { ...receipt(), organization_id: null },
        { id: ID, kind: "configure", organizationId: ORG },
      ),
    ).toBeNull();
    expect(
      expectedOperation(
        { ...receipt(), organization_id: "00000000-0000-4000-8000-000000000002" },
        { id: ID, kind: "configure", organizationId: ORG },
      ),
    ).toBeNull();
    expect(
      expectedOperation(receipt("install"), {
        id: ID,
        kind: "configure",
        organizationId: ORG,
      }),
    ).toBeNull();
  });

  it("aceita organização nula somente para operação global do tipo esperado", () => {
    const global = { ...receipt("install"), organization_id: null };
    expect(
      expectedOperation(global, { id: ID, kind: "install", organizationId: ORG }),
    ).not.toBeNull();
    expect(
      expectedOperation(global, { id: ID, kind: "catalog_admission", organizationId: ORG }),
    ).toBeNull();
  });

  it("exige o mesmo UUID solicitado", () => {
    expect(
      expectedOperation(receipt(), {
        id: "00000000-0000-4000-8000-000000000099",
        kind: "configure",
        organizationId: ORG,
      }),
    ).toBeNull();
  });
});
