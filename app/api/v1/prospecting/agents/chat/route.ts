import { randomUUID } from "node:crypto";
import { requireRole } from "@/lib/auth/require-role";
import { requireSupportWrite } from "@/lib/impersonate/support";
import { getRequestPool } from "@/lib/agent-engine/db/request-pool";
import { ok, fail } from "@/lib/api/wrappers";
import { agentChatInputSchema } from "@/lib/prospecting/agent-chat-schema";
import { chatAboutAgent } from "@/lib/prospecting/agent-chat";
import { AgentSetupError } from "@/lib/prospecting/agent-setup";

export const dynamic = "force-dynamic";
export const maxDuration = 120;

export async function POST(req: Request) {
  const requestId = randomUUID();
  const support = await requireSupportWrite();
  if (support) return support;
  const auth = await requireRole("admin", { requestId, resource: "prospecting" });
  if (!auth.ok) return auth.response;
  const parsed = agentChatInputSchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success)
    return fail("validation_failed", "Confira a mensagem e o tamanho da conversa.", 422, {
      requestId,
    });
  try {
    const data = await chatAboutAgent(getRequestPool(), auth.org.orgId, parsed.data);
    return ok(data, { requestId, headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    return fail(
      "prospecting_agent_chat_failed",
      error instanceof AgentSetupError
        ? error.message
        : "Não consegui conversar com a IA agora. Confira a credencial e o orçamento de IA; sua conversa foi mantida.",
      error instanceof AgentSetupError ? error.status : 503,
      { requestId, headers: { "Cache-Control": "no-store" } },
    );
  }
}
