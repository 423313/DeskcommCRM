import { createHash, randomBytes } from "node:crypto";

import { audit } from "@/lib/audit";
import { createAdminClient } from "@/lib/supabase/admin";

/**
 * Emite (ou reemite) a API key `dsk_...` de uma organização para uma
 * integração externa — mesmo formato/hash de
 * `app/api/v1/settings/api-tokens/route.ts` (`dsk_<prefix>_<secret>`, SHA256
 * em `token_hash`, plaintext nunca persistido).
 *
 * Sem "recuperar a mesma chave depois": como só o hash fica no banco, uma
 * chamada repetida (replay do provisionamento) revoga a chave anterior desta
 * integração e emite uma nova — nunca duas chaves vivas para o mesmo par
 * (org, integração), e nunca a promessa de devolver texto que não existe mais.
 *
 * ## Os escopos, e por que a chave sem eles não abre NADA
 *
 * Todo consumidor de um bearer `dsk_` cobra `mcp:read` ou `mcp:write`: o MCP
 * (`lib/mcp/server.ts:73`, e os dois são os únicos valores de `requiresScope`
 * nas ferramentas), `app/api/v1/contacts` e o `resolveAuthDual` das rotas de
 * mensagens e conversas. Sem eles a autenticação passa e o despacho devolve
 * 403 `Token missing required scope` — a organização nasceria inoperável pela
 * chave entregue para operá-la. O precedente que funciona ponta a ponta é
 * `lib/ai/runtime/mcp_token.ts:112-118`.
 *
 * ## O papel é o MÍNIMO, de propósito
 *
 * `role:agent` (rank 2) abre as ferramentas de `agent`; as de `ai_operator` e
 * `manager` seguem barradas por `ensureRole` (`lib/mcp/server.ts:74`). Elevar o
 * papel de um parceiro EXTERNO é decisão de produto, não conserto — quem
 * decide é quem responde pelo produto, e enquanto não decide vale o menor
 * privilégio. `scopesRole` (`lib/mcp/auth.ts:49`) lê o primeiro `role:` da
 * lista, então trocar aqui é uma linha.
 */
export async function rotateIntegrationApiKey(input: {
  organizationId: string;
  createdBy: string;
  /** Escopo que marca a origem, ex.: `integration:clinicfx`. Também filtra revogação. */
  integrationScope: string;
  /** Nome da chave na tela de chaves de API da organização. */
  name: string;
  requestId?: string;
}): Promise<string> {
  const admin = createAdminClient();

  // `scopes` é jsonb (baseline.sql:1266), e o `.contains` do postgrest-js
  // serializa ARRAY como `cs.{a,b}` — literal de array do Postgres, que o `@>`
  // de jsonb não aceita. A forma de STRING passa o valor cru, então aqui vai o
  // JSON pronto. Uma sonda que não casa devolveria "não há chave anterior" e a
  // revogação viraria silêncio.
  const { data: previous, error: erroDaBusca } = await admin
    .from("api_tokens")
    .select("id")
    .eq("organization_id", input.organizationId)
    .is("revoked_at", null)
    .contains("scopes", JSON.stringify([input.integrationScope]));

  // Falha FECHADA: não dá para emitir chave nova prometendo que a anterior
  // deixou de valer sem saber se existe anterior. O chamador responde 500.
  if (erroDaBusca) {
    throw new Error(`rotateIntegrationApiKey: busca da chave anterior falhou: ${erroDaBusca.message}`);
  }

  if (previous && previous.length > 0) {
    const ids = previous.map((t) => t.id);
    // `.is("revoked_at", null)` no UPDATE: entre a leitura e a escrita alguém
    // pode ter revogado, e auditar de novo afirmaria um efeito que não houve.
    // `.select("id")` porque a auditoria sai SÓ para o que o banco devolveu —
    // era o caminho em que `token.revoked` era gravado incondicionalmente e o
    // log passava a afirmar o contrário do banco.
    const { data: revogadas, error: erroDaRevogacao } = await admin
      .from("api_tokens")
      .update({ revoked_at: new Date().toISOString(), revoked_by: input.createdBy })
      .in("id", ids)
      .is("revoked_at", null)
      .select("id");

    if (erroDaRevogacao) {
      throw new Error(
        `rotateIntegrationApiKey: revogação da chave anterior falhou: ${erroDaRevogacao.message}`,
      );
    }

    for (const linha of revogadas ?? []) {
      void audit({
        action: "token.revoked",
        actorUserId: null,
        organizationId: input.organizationId,
        resourceType: "api_token",
        resourceId: linha.id,
        requestId: input.requestId,
        bypassedRls: true,
        metadata: {
          reason: "provisioning_replay",
          integration: input.integrationScope,
          owner_user_id: input.createdBy,
        },
      });
    }
  }

  const prefix = `dsk_${randomBytes(4).toString("hex")}`;
  const secret = randomBytes(32).toString("base64url");
  const plaintext = `${prefix}_${secret}`;
  const tokenHash = createHash("sha256").update(plaintext).digest();
  const scopes = [
    "mcp:read",
    "mcp:write",
    "role:agent",
    "actor:ai_agent",
    input.integrationScope,
  ];

  const { data: created, error } = await admin
    .from("api_tokens")
    .insert({
      organization_id: input.organizationId,
      created_by: input.createdBy,
      name: input.name,
      prefix,
      token_hash: `\\x${tokenHash.toString("hex")}`,
      scopes,
    })
    .select("id")
    .single();

  if (error || !created) {
    throw new Error(`rotateIntegrationApiKey: insert falhou: ${error?.message}`);
  }

  // O ator é a MÁQUINA, não o dono da organização: quem chamou é um sistema de
  // fora, e `createdBy` é só a conta que a linha do banco exige. Creditar um
  // humano por ação que ele não fez é o que `actorAuditPayload` já evita nas
  // rotas de máquina (`app/api/v1/contacts/_handler.ts:61-78`).
  void audit({
    action: "token.created",
    actorUserId: null,
    organizationId: input.organizationId,
    resourceType: "api_token",
    resourceId: created.id,
    requestId: input.requestId,
    bypassedRls: true,
    metadata: { name: input.name, prefix, scopes, owner_user_id: input.createdBy },
  });

  return plaintext;
}
