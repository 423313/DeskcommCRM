/**
 * POST /api/internal/voice/knowledge-search
 *
 * Chamada pelo serviço Python (workers/voice-agent-pipecat) quando o agente
 * de voz precisa consultar a base de conhecimento — reaproveita
 * buscarConhecimento/resolverAcervoDoAgente (RAG com embeddings + pgvector)
 * já testados pelo canal de texto (WhatsApp), em vez de duplicar essa lógica
 * em Python. Mesma auth por secret compartilhado de app/api/internal/agents/run/route.ts
 * (x-internal-secret, com fallback Authorization: Bearer <secret> legado).
 */
import { randomUUID } from "node:crypto";
import { type NextRequest } from "next/server";
import { z } from "zod";

import { ok, fail } from "@/lib/api/wrappers";
import { env } from "@/lib/env";
import { createAdminClient } from "@/lib/supabase/admin";
import { buscarConhecimento, resolverAcervoDoAgente } from "@/lib/ai/knowledge/busca";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

function timingSafeEq(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let mismatch = 0;
  for (let i = 0; i < a.length; i++) {
    mismatch |= a.charCodeAt(i) ^ b.charCodeAt(i);
  }
  return mismatch === 0;
}

function authorize(req: NextRequest): boolean {
  const expected = env.INTERNAL_SECRET;
  if (!expected) return false;
  const headerSecret = req.headers.get("x-internal-secret");
  if (headerSecret && timingSafeEq(headerSecret, expected)) return true;
  const authz = req.headers.get("authorization");
  if (authz) {
    const match = /^Bearer\s+(.+)$/i.exec(authz.trim());
    if (match && timingSafeEq(match[1]!.trim(), expected)) return true;
  }
  return false;
}

const bodySchema = z.object({
  organization_id: z.string().uuid(),
  agent_id: z.string().uuid(),
  pergunta: z.string().trim().min(1).max(2000),
  top_k: z.number().int().min(1).max(20).default(5),
  limiar: z.number().min(0).max(1).default(0.4),
});

export async function POST(req: NextRequest): Promise<Response> {
  const requestId = randomUUID();

  if (!authorize(req)) {
    return fail("unauthenticated", "Internal secret missing or invalid.", 401, { requestId });
  }

  let raw: unknown;
  try {
    raw = await req.json();
  } catch {
    return fail("invalid_request", "Body JSON inválido.", 400, { requestId });
  }

  const parsed = bodySchema.safeParse(raw);
  if (!parsed.success) {
    return fail("validation_failed", "Campos inválidos.", 422, { requestId, details: parsed.error.flatten() });
  }
  const input = parsed.data;
  const admin = createAdminClient();

  const knowledgeSourceIds = await resolverAcervoDoAgente(admin, input.organization_id, input.agent_id).catch(
    () => [] as string[],
  );

  if (knowledgeSourceIds.length === 0) {
    return ok({ trechos: [] }, { requestId });
  }

  const resultado = await buscarConhecimento(admin, {
    organizationId: input.organization_id,
    knowledgeSourceIds,
    pergunta: input.pergunta,
    topK: input.top_k,
    limiar: input.limiar,
  });

  return ok({ trechos: resultado.trechos }, { requestId });
}
