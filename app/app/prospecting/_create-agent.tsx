"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { apiClient } from "@/lib/api/client";
import { ApiError } from "@/lib/api/types";
import { randomId } from "@/lib/random-id";
import type { CampaignConfig } from "@/lib/prospecting/schema";
import {
  prospectingAgentSetupSchema,
  type ProspectingAgentSetupInput,
} from "@/lib/prospecting/agent-setup-schema";
import {
  agentChatDraftSchema,
  type AgentChatResponse,
  type AgentChatInput,
} from "@/lib/prospecting/agent-chat-schema";
import { useT } from "@/hooks/i18n/useT";

type AgentSetup = Omit<
  ProspectingAgentSetupInput,
  "request_id" | "campaign_id" | "enable_router_continuity"
>;
export type CreatedProspectingAgent = {
  agent: { id: string; name: string };
  version_id: string;
  model_label: string;
};
type Message = { role: "user" | "assistant"; content: string };
type ChatRequest = AgentChatInput;
type Attempt = AgentSetup & {
  request_id: string;
  campaign_id: string;
  enable_router_continuity: boolean;
};
type Conversation = {
  messages: Message[];
  draft: Partial<AgentSetup>;
  input: string;
  ready: boolean;
  choices: { label: string; value: string }[];
  modelLabel: string;
  needsContinuity: boolean;
  continuity: boolean;
  error: string | null;
  failedTurn?: ChatRequest;
  uncertain: boolean;
  recoverableAgentId?: string;
};
type Props = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  campaign: { id: string; name: string };
  config: CampaignConfig;
  channels: {
    id: string;
    display_name: string | null;
    phone_number: string | null;
    status: string;
  }[];
  stages: { id: string; name: string; pipeline_id: string; pipeline_name: string }[];
  onCreated: (
    campaignId: string,
    result: CreatedProspectingAgent,
    config: AgentSetup,
  ) => Promise<void>;
};

function initialConversation(props: Props): Conversation {
  const draft: Partial<AgentSetup> = { name: props.campaign.name.slice(0, 120), tone: "cordial" };
  const fields = [
    "instruction",
    "qualification",
    "channel_session_id",
    "pipeline_id",
    "stage_id",
    "qualified_stage_id",
  ] as const;
  // An unfinished field from the outer form must not invalidate a chat turn.
  for (const field of fields) {
    if (
      props.config[field] &&
      agentChatDraftSchema.safeParse({ [field]: props.config[field] }).success
    )
      draft[field] = props.config[field];
  }
  return {
    messages: [],
    draft,
    input: "",
    ready: false,
    choices: [],
    modelLabel: "",
    needsContinuity: false,
    continuity: false,
    error: null,
    uncertain: false,
  };
}

/** The conversation prepares a proposal. Only the explicit final action creates an agent. */
export function CreateProspectingAgentDialog(props: Props) {
  const t = useT();
  const [conversations, setConversations] = useState<Record<string, Conversation>>({});
  const [pending, setPending] = useState<"chat" | "create" | null>(null);
  const submitting = useRef(false);
  const attempts = useRef<Record<string, Attempt>>({});
  const transcript = useRef<HTMLDivElement>(null);
  const id = props.campaign.id;
  const state = conversations[id] ?? initialConversation(props);
  const { draft } = state;
  const channel = props.channels.find((item) => item.id === draft.channel_session_id);
  const pipeline = props.stages.find((item) => item.pipeline_id === draft.pipeline_id);
  const initialStage = props.stages.find((item) => item.id === draft.stage_id);
  const qualifiedStage = props.stages.find((item) => item.id === draft.qualified_stage_id);
  const ready =
    state.ready &&
    !!channel &&
    !!pipeline &&
    !!initialStage &&
    !!qualifiedStage &&
    initialStage.pipeline_id === draft.pipeline_id &&
    qualifiedStage.pipeline_id === draft.pipeline_id &&
    draft.stage_id !== draft.qualified_stage_id;

  useEffect(() => {
    if (transcript.current) transcript.current.scrollTop = transcript.current.scrollHeight;
  }, [state.messages.length, pending, props.open]);

  function update(values: Partial<Conversation>) {
    setConversations((current) => ({ ...current, [id]: { ...state, ...values } }));
  }

  async function send(value?: string, retry = false) {
    const content = value ?? state.input.trim();
    if (submitting.current || state.uncertain || (!content && !retry)) return;
    const messages: Message[] =
      retry && state.failedTurn
        ? state.messages
        : [
            ...(state.failedTurn ? state.messages.slice(0, -1) : state.messages),
            { role: "user", content },
          ];
    // The accumulated proposal carries the configuration. Keep the transcript
    // visible, but send only the recent context allowed by the server contract.
    const recent = messages.slice(-24);
    while (
      recent.length > 1 &&
      recent.reduce((length, message) => length + message.content.length, 0) > 24000
    )
      recent.shift();
    const request: ChatRequest =
      retry && state.failedTurn
        ? state.failedTurn
        : {
            campaign_id: id,
            messages: recent,
            draft,
          };
    submitting.current = true;
    setPending("chat");
    update({
      messages,
      input: content || state.input,
      ready: false,
      error: null,
      choices: [],
      failedTurn: undefined,
    });
    try {
      const result = await apiClient.post<{ data: AgentChatResponse }>(
        "/api/v1/prospecting/agents/chat",
        request,
        { timeoutMs: 120_000 },
      );
      setConversations((current) => ({
        ...current,
        [id]: {
          ...state,
          messages: [...messages, { role: "assistant", content: result.data.message }],
          draft: result.data.draft,
          input: "",
          ready: result.data.ready,
          choices: result.data.choices ?? [],
          modelLabel: result.data.model_label,
          needsContinuity: result.data.needs_continuity,
          continuity:
            result.data.draft.channel_session_id === state.draft.channel_session_id
              ? state.continuity
              : false,
          error: null,
          failedTurn: undefined,
        },
      }));
    } catch (error) {
      setConversations((current) => ({
        ...current,
        [id]: {
          ...state,
          messages,
          input: content || state.input,
          ready: false,
          choices: [],
          failedTurn: request,
          error:
            error instanceof Error ? error.message : t("Não foi possível continuar a conversa."),
        },
      }));
    } finally {
      submitting.current = false;
      setPending(null);
    }
  }

  async function create() {
    if (
      !ready ||
      submitting.current ||
      state.input.trim() ||
      (state.needsContinuity && !state.continuity)
    )
      return;
    const payload = {
      ...draft,
      campaign_id: id,
      enable_router_continuity: state.needsContinuity && state.continuity,
    };
    const previous = attempts.current[id];
    const changed =
      previous &&
      Object.entries(payload).some(([key, value]) => previous[key as keyof Attempt] !== value);
    const attempt =
      previous && (!changed || state.uncertain) ? previous : { ...payload, request_id: randomId() };
    const parsed = prospectingAgentSetupSchema.safeParse(attempt);
    if (!parsed.success) {
      update({
        error: t("Ainda faltam informações. Continue a conversa para completar a configuração."),
        ready: false,
      });
      return;
    }
    attempts.current[id] = attempt as Attempt;
    submitting.current = true;
    setPending("create");
    update({ error: null });
    try {
      const result = await apiClient.post<{ data: CreatedProspectingAgent }>(
        "/api/v1/prospecting/agents",
        parsed.data,
      );
      await props.onCreated(id, result.data, parsed.data);
      delete attempts.current[id];
      setConversations((current) => ({
        ...current,
        [id]: {
          ...state,
          ready: false,
          uncertain: false,
          recoverableAgentId: undefined,
          error: null,
        },
      }));
      props.onOpenChange(false);
    } catch (error) {
      const recoverableAgentId =
        error instanceof ApiError && typeof error.details?.agent_id === "string"
          ? error.details.agent_id
          : undefined;
      const knownRejection =
        error instanceof ApiError &&
        error.status >= 400 &&
        error.status < 500 &&
        error.status !== 409 &&
        !recoverableAgentId;
      update({
        error: error instanceof Error ? error.message : t("Não foi possível criar o agente."),
        recoverableAgentId,
        uncertain: !knownRejection,
      });
    } finally {
      submitting.current = false;
      setPending(null);
    }
  }

  return (
    <Dialog
      open={props.open}
      onOpenChange={(open) => {
        if (pending) return;
        if (!open) update({});
        props.onOpenChange(open);
      }}
    >
      <DialogContent className="flex max-h-[90dvh] max-w-2xl flex-col overflow-hidden p-0">
        <DialogHeader className="border-b px-6 pt-6 pb-4">
          <DialogTitle>{t("Vamos montar seu agente")}</DialogTitle>
          <DialogDescription>
            {t("Conte o que você precisa. Eu preparo as instruções e permissões com você.")}
          </DialogDescription>
          <p className="text-xs font-medium text-foreground">{props.campaign.name}</p>
        </DialogHeader>
        <div
          ref={transcript}
          className="min-h-40 flex-1 space-y-4 overflow-y-auto px-6 py-4"
          role="log"
          aria-label={t("Conversa para criar agente")}
          aria-live="polite"
        >
          <div className="mr-8 rounded-2xl rounded-tl-sm bg-muted px-4 py-3 text-sm leading-relaxed">
            <p className="mb-1 text-xs font-medium text-muted-foreground">
              {t("Assistente de configuração")}
            </p>
            <p>
              {t(
                "O que você quer que este agente ofereça e consiga descobrir na conversa com essas empresas?",
              )}
            </p>
          </div>
          {state.messages.map((message, index) => (
            <div
              key={index}
              className={
                message.role === "user"
                  ? "ml-8 rounded-2xl rounded-tr-sm bg-primary px-4 py-3 text-sm leading-relaxed text-primary-foreground"
                  : "mr-8 rounded-2xl rounded-tl-sm bg-muted px-4 py-3 text-sm leading-relaxed"
              }
            >
              <p className="mb-1 text-xs font-medium opacity-70">
                {message.role === "user" ? t("Você") : t("Assistente de configuração")}
              </p>
              <p className="whitespace-pre-wrap">{message.content}</p>
            </div>
          ))}
          {pending === "chat" && (
            <p role="status" className="text-sm text-muted-foreground">
              {t("Pensando na configuração…")}
            </p>
          )}
          {!pending && !state.uncertain && state.choices.length > 0 && (
            <div className="flex flex-wrap gap-2">
              {state.choices.map((choice, index) => (
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  key={`${index}:${choice.value}`}
                  onClick={() => void send(choice.value)}
                >
                  {choice.label}
                </Button>
              ))}
            </div>
          )}
          {ready && (
            <section
              aria-label={t("Resumo do agente")}
              className="space-y-3 rounded-xl border border-primary/30 bg-primary/5 p-4 text-sm"
            >
              <div>
                <p className="text-xs font-medium text-muted-foreground">
                  {t("Pronto para criar")}
                </p>
                <h3 className="mt-1 text-lg font-semibold">{draft.name}</h3>
              </div>
              <dl className="space-y-3">
                <div>
                  <dt className="font-medium">{t("Como vai abordar")}</dt>
                  <dd className="mt-1 whitespace-pre-wrap text-muted-foreground">
                    {draft.instruction}
                  </dd>
                </div>
                <div>
                  <dt className="font-medium">{t("Quando qualificar")}</dt>
                  <dd className="mt-1 whitespace-pre-wrap text-muted-foreground">
                    {draft.qualification}
                  </dd>
                </div>
                <div>
                  <dt className="font-medium">{t("Conexão de saída")}</dt>
                  <dd className="text-muted-foreground">
                    {channel?.display_name ?? channel?.phone_number ?? channel?.id}
                  </dd>
                </div>
                <div>
                  <dt className="font-medium">{t("Funil")}</dt>
                  <dd className="text-muted-foreground">
                    {pipeline?.pipeline_name} · {initialStage?.name} → {qualifiedStage?.name}
                  </dd>
                </div>
              </dl>
              <p className="text-xs text-muted-foreground">
                {t("Permissões: consultar contatos e atualizar negócios neste funil.")}
              </p>
              {state.needsContinuity && (
                <label className="flex items-start gap-3 rounded-lg border bg-background p-3">
                  <input
                    type="checkbox"
                    className="mt-1"
                    checked={state.continuity}
                    disabled={!!pending || state.uncertain}
                    onChange={(event) => update({ continuity: event.target.checked })}
                  />
                  <span>
                    <span className="block font-medium">
                      {t("Manter a continuidade do agente neste canal")}
                    </span>
                    <span className="mt-1 block text-xs text-muted-foreground">
                      {t(
                        "Dar continuidade com o mesmo agente, salvo mudança de assunto ou transferência. Esta configuração vale para as conversas deste canal.",
                      )}
                    </span>
                  </span>
                </label>
              )}
              <p className="text-xs text-muted-foreground">
                {t(
                  "O agente será publicado e poderá atender mensagens recebidas neste canal. As abordagens só começam quando você iniciar a campanha.",
                )}
              </p>
              <Button
                type="button"
                className="w-full"
                disabled={
                  !!pending || !!state.input.trim() || (state.needsContinuity && !state.continuity)
                }
                onClick={() => void create()}
              >
                {pending === "create"
                  ? t("Preparando agente…")
                  : state.uncertain
                    ? t("Recuperar criação do agente")
                    : t("Criar e usar agente")}
              </Button>
            </section>
          )}
          {state.error && (
            <div
              role="alert"
              className="space-y-2 rounded-lg border border-destructive p-3 text-sm"
            >
              <p>{state.error}</p>
              {state.uncertain && (
                <p>
                  {t(
                    "Mantenha os dados desta tentativa. Recuperar a criação consulta a mesma solicitação, sem criar outro agente.",
                  )}
                </p>
              )}
              {state.recoverableAgentId && (
                <Link
                  className="block underline"
                  href={`/app/ai/agents/${state.recoverableAgentId}`}
                >
                  {t("Revisar o agente salvo")}
                </Link>
              )}
              {state.failedTurn && (
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  disabled={!!pending}
                  onClick={() => void send(undefined, true)}
                >
                  {t("Tentar novamente")}
                </Button>
              )}
            </div>
          )}
        </div>
        <form
          className="space-y-3 border-t px-6 pt-4 pb-5"
          onSubmit={(event) => {
            event.preventDefault();
            event.stopPropagation();
            void send();
          }}
        >
          <Label htmlFor="agent-builder-message" className="sr-only">
            {t("Mensagem para configurar o agente")}
          </Label>
          <Textarea
            id="agent-builder-message"
            autoFocus
            rows={2}
            maxLength={3000}
            placeholder={t("Conte o que você quer que o agente faça…")}
            value={state.input}
            disabled={!!pending || state.uncertain}
            onChange={(event) => update({ input: event.target.value })}
          />
          <DialogFooter className="items-center sm:justify-between">
            <Button
              type="button"
              variant="ghost"
              disabled={!!pending}
              onClick={() => {
                update({});
                props.onOpenChange(false);
              }}
            >
              {t("Voltar à campanha")}
            </Button>
            <Button type="submit" disabled={!!pending || state.uncertain || !state.input.trim()}>
              {pending === "chat" ? t("Pensando…") : t("Enviar mensagem")}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
