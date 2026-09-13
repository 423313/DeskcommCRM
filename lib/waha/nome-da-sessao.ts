import { randomUUID } from "node:crypto";

/**
 * Teto do nome da sessão no WAHA (`SessionCreateRequest.name`).
 *
 * Medido no DTO do WAHA 2026.7.2: `@maxLength 54` + `@pattern /^[a-zA-Z0-9_-]*$/`.
 * Estourar isso devolve HTTP 400 no POST /api/sessions — e a tela de Conexões
 * mostra `connection_repair_required` sem QR. A reserva da 0228/0230 gerava
 * `org_` + uuid da org sem hífen (32) + `_` + uuid novo sem hífen (32) = 69.
 */
export const TETO_NOME_WAHA = 54;

const PADRAO_NOME_WAHA = /^[a-zA-Z0-9_-]+$/;

export function cabeNoWaha(nome: string): boolean {
  return nome.length <= TETO_NOME_WAHA && PADRAO_NOME_WAHA.test(nome);
}

/** Mesmo formato da 0232 no banco: `org_` + 8 hex da org + `_` + uuid sem hífen = 45. */
export function nomeWahaNovo(orgId: string, uniq = randomUUID()): string {
  const org = orgId.replaceAll("-", "").slice(0, 8);
  const sufixo = uniq.replaceAll("-", "");
  return `org_${org}_${sufixo}`;
}
