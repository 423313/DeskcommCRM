/**
 * PT-BR/PT-AO PII anonymizer for the conversations RAG ingestion pipeline (S-06.07).
 *
 * Replaces, in order:
 *   1. CPF       -> [CPF]   (Brasil: 3+3+3+2 dígitos, com ou sem pontuação)
 *   2. NIF (BI)  -> [NIF]   (Angola: 9 dígitos + 2 letras de província + 3 dígitos)
 *   3. Email     -> [EMAIL]
 *   4. Telefone  -> [TELEFONE]
 *   5. CEP       -> [CEP]
 *   6. Nomes PT-BR (lookup) -> [NOME]
 *
 * CPF/NIF rodam antes de CEP e telefone porque compartilham forma de dígitos.
 *
 * ─── O que o padrão do NIF fecha, medido ───────────────────────────────────
 *
 * Nenhum padrão daqui capturava LETRA no meio de um número, então o NIF no
 * formato do BI angolano ia inteiro para o LLM. Rodando as regex desta função
 * (antes do padrão novo) sobre três frases:
 *
 *     "Meu NIF e 003862011LA042"  -> saiu IGUAL, 0 hits     ← vazamento
 *     "Meu NIF e 541712345"       -> saiu IGUAL, 0 hits     ← vazamento
 *     "Meu CPF e 52998224725"     -> "[CPF]", 1 hit         ← controle, funcionava
 *
 * ⚠️ O QUE ESTE PADRÃO NÃO COBRE: o NIF numérico puro (empresa e estrangeiro,
 * 9 dígitos sem as letras do BI) continua saindo intacto. É a segunda linha da
 * medição acima, e ela desmente a explicação que acompanhava este padrão quando
 * ele foi proposto — "já cai no padrão de telefone e sai como [TELEFONE], o
 * rótulo erra mas o dado não vaza". Não cai: `phone` é
 * `\b\(?\d{2}\)?\s*9?\d{4,5}-?\d{4}\b`, que exige 10 dígitos no mínimo.
 * Medido nos dois sentidos — 10 dígitos ("5417123456") viram `[TELEFONE]`;
 * 9 não viram nada. Um `\b\d{9}\b` fecharia o buraco e levaria junto todo
 * número de pedido, protocolo e código de rastreio de 9 dígitos que aparece
 * numa conversa de atendimento; a decisão de pagar esse preço não é deste
 * conserto, e fica escrita aqui para a próxima pessoa não a tomar por engano.
 *
 * Returns the anonymized string AND the list of hits (used by the ingestor's
 * ">=10 messages, 0 hits -> flag for manual review" guard).
 */

import { FIRST_NAMES_PT_BR } from "./pt-br-first-names";

/**
 * Build fresh regex instances per call. The `g` flag carries `lastIndex`
 * across `.test()` calls and would silently corrupt the leak guard.
 */
export function buildPiiPatterns(): Record<string, RegExp> {
  return {
    cpf: /\b\d{3}\.?\d{3}\.?\d{3}-?\d{2}\b/g,
    nif: /\b\d{9}[A-Za-z]{2}\d{3}\b/g,
    email: /[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/g,
    phone: /\b\(?\d{2}\)?\s*9?\d{4,5}-?\d{4}\b/g,
    cep: /\b\d{5}-?\d{3}\b/g,
  };
}

export const PII_PATTERNS = buildPiiPatterns();

export interface AnonymizeHit {
  type: "cpf" | "nif" | "email" | "phone" | "cep" | "name";
  original: string;
  replacement: string;
}

export interface AnonymizeResult {
  anonymized: string;
  hits: AnonymizeHit[];
}

const REPLACEMENT_BY_TYPE: Record<AnonymizeHit["type"], string> = {
  cpf: "[CPF]",
  nif: "[NIF]",
  email: "[EMAIL]",
  phone: "[TELEFONE]",
  cep: "[CEP]",
  name: "[NOME]",
};

export function anonymize(text: string): AnonymizeResult {
  const hits: AnonymizeHit[] = [];
  let out = text;

  const passes: { type: AnonymizeHit["type"]; pattern: RegExp }[] = [
    { type: "cpf", pattern: /\b\d{3}\.?\d{3}\.?\d{3}-?\d{2}\b/g },
    { type: "nif", pattern: /\b\d{9}[A-Za-z]{2}\d{3}\b/g },
    { type: "email", pattern: /[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/g },
    { type: "phone", pattern: /\b\(?\d{2}\)?\s*9?\d{4,5}-?\d{4}\b/g },
    { type: "cep", pattern: /\b\d{5}-?\d{3}\b/g },
  ];

  for (const { type, pattern } of passes) {
    const replacement = REPLACEMENT_BY_TYPE[type];
    out = out.replace(pattern, (match) => {
      hits.push({ type, original: match, replacement });
      return replacement;
    });
  }

  // Name pass: tokenize on Unicode letters; replace tokens whose lowercase
  // form is in the curated PT-BR set.
  const nameRe = /\b[\p{L}]+\b/gu;
  out = out.replace(nameRe, (match) => {
    const lower = match.toLowerCase();
    if (FIRST_NAMES_PT_BR.has(lower)) {
      hits.push({ type: "name", original: match, replacement: "[NOME]" });
      return "[NOME]";
    }
    return match;
  });

  return { anonymized: out, hits };
}

/**
 * Final guard: scans `text` with a fresh pattern instance for each PII type
 * and returns the first matching type, or null when clean.
 */
export function detectResidualPii(text: string): AnonymizeHit["type"] | null {
  const patterns = buildPiiPatterns();
  for (const [type, pattern] of Object.entries(patterns)) {
    if (pattern.test(text)) {
      return type as AnonymizeHit["type"];
    }
  }
  return null;
}
