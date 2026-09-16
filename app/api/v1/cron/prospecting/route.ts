import { randomUUID } from "node:crypto";
import { env } from "@/lib/env";
import { ok, fail } from "@/lib/api/wrappers";
import { getRequestPool } from "@/lib/agent-engine/db/request-pool";
import { createAdminClient } from "@/lib/supabase/admin";
import { tickProspecting } from "@/lib/prospecting/worker";

export const dynamic = "force-dynamic";
export const maxDuration = 300;
async function handle(req: Request) {
  const requestId = randomUUID();
  const value = /^Bearer (.+)$/.exec(req.headers.get("authorization") ?? "")?.[1];
  const accepted = [env.INTERNAL_CRON_SECRET, env.INTERNAL_SECRET].filter(Boolean);
  if (!value || !accepted.includes(value))
    return fail("forbidden", "Credencial de execução inválida.", 403, { requestId });
  try {
    return ok(await tickProspecting(getRequestPool(), createAdminClient()), { requestId });
  } catch {
    return fail("internal_error", "Falha ao processar a prospecção.", 500, { requestId });
  }
}
export const GET = handle;
export const POST = handle;
