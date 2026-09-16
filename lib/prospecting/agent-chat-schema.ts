import { z } from "zod";
import { prospectingAgentSetupSchema } from "./agent-setup-schema";

export const agentProposalSchema = prospectingAgentSetupSchema.omit({
  request_id: true,
  campaign_id: true,
  enable_router_continuity: true,
});
export const agentChatDraftSchema = agentProposalSchema.partial();
export const agentChatInputSchema = z
  .object({
    campaign_id: z.string().uuid(),
    messages: z
      .array(
        z
          .object({
            role: z.enum(["user", "assistant"]),
            content: z.string().trim().min(1).max(3000),
          })
          .strict(),
      )
      .min(1)
      .max(24),
    draft: agentChatDraftSchema.optional(),
  })
  .strict()
  .refine((v) => v.messages.at(-1)?.role === "user", "Envie uma mensagem para continuar.")
  .refine(
    (v) => v.messages.reduce((n, m) => n + m.content.length, 0) <= 24000,
    "Conversa longa demais. Revise o resumo antes de continuar.",
  );

export type AgentChatDraft = z.infer<typeof agentChatDraftSchema>;
export type AgentChatInput = z.infer<typeof agentChatInputSchema>;
export interface AgentChatResponse {
  message: string;
  draft: AgentChatDraft;
  ready: boolean;
  choices: { label: string; value: string }[];
  model_label: string;
  needs_continuity: boolean;
}
