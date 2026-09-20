"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import dynamic from "next/dynamic";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useQueryClient } from "@tanstack/react-query";
import { usePecaDoRodape, type PecaDoRodape } from "@/lib/ui/rodape-ocupado";
import { useAuth } from "@/hooks/auth/AuthProvider";
import { useT } from "@/hooks/i18n/useT";
import { useConversationCounts } from "@/hooks/inbox/useConversationCounts";
import { useConversationsRealtime } from "@/hooks/inbox/useConversationsRealtime";
import { useConversation } from "@/hooks/inbox/useConversation";
import { useMarkAsRead } from "@/hooks/inbox/useMarkAsRead";
import { useRealtimeChannel } from "@/hooks/realtime/useRealtimeChannel";
import { OpenConversationProvider } from "@/hooks/notifications/OpenConversationContext";
import { useVoiceCall } from "@/components/voice/VoiceCallContext";
import { ConversationListItem } from "./ConversationListItem";
import { ChannelLogo } from "./ChannelLogo";
import { JanelaSelo } from "./JanelaSelo";
import { RetentionNotice } from "./RetentionNotice";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { ArrowsOutSimple, CaretLeft, ChatsCircle, PencilSimple, X } from "@/lib/ui/icons";
import { estadoDaJanela } from "@/lib/channels/janela";
import { rotuloDoContato } from "@/lib/contacts/rotulo-do-contato";
import { buscaValeConsulta } from "@/lib/inbox/termo-de-busca";
import { cn } from "@/lib/utils";
import type { Message } from "@/lib/types/messaging";

const ChatThread = dynamic(() => import("./ChatThread").then((m) => m.ChatThread));
const Composer = dynamic(() => import("./Composer").then((m) => m.Composer));

/**
 * O QUE ESTE ATALHO OCUPA DO RODAPÉ — e é por aqui, e só por aqui, que a casca
 * sabe disso.
 *
 * A conta é a do CSS daqui: `distancia: 16` é o `bottom-4` do estado
 * permanente, e `altura: 56` é o `h-14` do gatilho — o que fica visível com o
 * painel fechado. São PISOS: `usePecaDoRodape` mede a caixa real e só aumenta.
 *
 * O `bottom-24` de quando há chamada de voz fica de fora de propósito: nesse
 * estado o canto já é do `ActiveCallPanel`, que declara a peça dele, e o
 * contrato reserva o MAIOR alcance — peças no mesmo canto não se somam.
 *
 * Por que a declaração mora junto do componente: quem desmonta o atalho
 * desmonta o registro no mesmo ato, porque é o mesmo objeto. Enquanto a reserva
 * era um `pb-20` escrito na casca, a guarda de rota tirava o aside e DEIXAVA o
 * padding — e no Inbox, que tem grid de altura fixa, isso não sobrava espaço:
 * rolava a tela, com o campo de envio abaixo da dobra.
 */
export const ATALHO_DE_MENSAGENS: PecaDoRodape = {
  dono: "components/inbox/FloatingInbox.tsx",
  distancia: 16,
  altura: 56,
};

/**
 * O atalho SOBE enquanto existe chamada de voz, porque aí o canto de baixo é do
 * `ActiveCallPanel`. Fica fora da declaração da peça de propósito: o contrato
 * reserva o MAIOR alcance, e nesse estado quem declara o alcance é o painel de
 * chamada, que já está lá. Aqui é só onde este atalho se desenha.
 */
const DISTANCIA_ACIMA_DA_CHAMADA = 96;

/** Mounted in the authenticated shell: navigation does not destroy the draft. */
export function FloatingInbox() {
  const { activeOrg, user } = useAuth();
  const rota = usePathname();
  // No próprio Inbox o atalho é o que a tela já é — e não era só redundância
  // visual: o gatilho é `h-14 w-64`, 256×56px fixos no canto inferior direito,
  // exatamente onde o Inbox põe o campo de envio.
  if (rota?.startsWith("/app/inbox")) return null;
  if (!activeOrg) return null;
  return <InboxDock key={`${activeOrg.orgId}:${user.id}`} orgId={activeOrg.orgId} />;
}

function InboxDock({ orgId }: { orgId: string }) {
  const t = useT();
  const { call, minha } = useVoiceCall();
  const ancora = usePecaDoRodape(ATALHO_DE_MENSAGENS);
  const [open, setOpen] = useState(false);
  const [selected, setSelected] = useState<string | null>(null);
  const [drafts, setDrafts] = useState<Record<string, { text: string; mode: "reply" | "note" }>>(
    {},
  );
  const trigger = useRef<HTMLButtonElement>(null);
  const counts = useConversationCounts(orgId, { unread: true });
  const qc = useQueryClient();
  const refresh = useCallback(() => {
    void qc.invalidateQueries({ queryKey: ["conversation-counts", orgId] });
    if (selected) void qc.invalidateQueries({ queryKey: ["conversation", selected] });
  }, [qc, orgId, selected]);
  useRealtimeChannel({
    name: `floating-inbox:${orgId}`,
    postgresChanges: {
      event: "*",
      schema: "public",
      table: "conversations",
      filter: `organization_id=eq.${orgId}`,
    },
    onChange: refresh,
  });
  const saveDraft = useCallback(
    (text: string, mode: "reply" | "note") => {
      if (!selected) return;
      setDrafts((previous) =>
        previous[selected]?.text === text && previous[selected]?.mode === mode
          ? previous
          : { ...previous, [selected]: { text, mode } },
      );
    },
    [selected],
  );
  const unread = counts.data?.all ?? 0;
  const elevated = minha && call && call.status !== "ended";
  function minimize() {
    setOpen(false);
    requestAnimationFrame(() => trigger.current?.focus());
  }
  return (
    <aside
      ref={ancora}
      aria-label={t("Mensagens rápidas")}
      style={{ bottom: elevated ? DISTANCIA_ACIMA_DA_CHAMADA : ATALHO_DE_MENSAGENS.distancia }}
      className="fixed right-4 z-40 max-w-[calc(100vw-2rem)]"
      onKeyDown={(event) => {
        if (event.key === "Escape" && !event.defaultPrevented) {
          event.stopPropagation();
          minimize();
        }
      }}
    >
      <div
        id="floating-inbox-panel"
        className={cn(
          "mb-3 flex h-[min(640px,calc(100dvh-8rem))] w-[380px] max-w-[calc(100vw-2rem)] flex-col overflow-hidden rounded-2xl border border-border bg-background shadow-2xl",
          !open && "hidden",
        )}
      >
        <div className="flex shrink-0 items-center gap-2 border-b px-4 py-3">
          {selected && (
            <Button
              size="icon"
              variant="ghost"
              aria-label={t("Voltar às conversas")}
              onClick={() => setSelected(null)}
            >
              <CaretLeft size={18} aria-hidden />
            </Button>
          )}
          <h2 className="min-w-0 flex-1 text-sm font-semibold">{t("Mensagens")}</h2>
          {unread > 0 && (
            <span className="rounded-full bg-destructive px-1.5 text-xs font-semibold text-destructive-foreground">
              {unread > 99 ? "99+" : unread}
            </span>
          )}
          <Link
            href={selected ? `/app/inbox/${selected}` : "/app/inbox?filter=all"}
            onClick={minimize}
            aria-label={t("Abrir no Inbox")}
            title={t("Abrir no Inbox")}
            className="rounded-md p-2 hover:bg-muted focus-visible:outline-2"
          >
            <ArrowsOutSimple size={18} aria-hidden />
          </Link>
          <Button
            size="icon"
            variant="ghost"
            aria-label={t("Minimizar mensagens")}
            onClick={minimize}
          >
            <X size={18} aria-hidden />
          </Button>
        </div>
        {selected ? (
          <CompactConversation
            key={selected}
            conversationId={selected}
            visible={open}
            initialDraft={drafts[selected]?.text ?? ""}
            initialMode={drafts[selected]?.mode ?? "reply"}
            onDraftChange={saveDraft}
          />
        ) : open ? (
          <DockList orgId={orgId} onSelect={setSelected} />
        ) : null}
      </div>
      <button
        ref={trigger}
        type="button"
        aria-expanded={open}
        aria-controls="floating-inbox-panel"
        onClick={() => setOpen((value) => !value)}
        className="ml-auto flex h-14 w-64 max-w-full items-center gap-3 rounded-full border border-border bg-background px-5 text-sm font-semibold shadow-xl transition-shadow hover:shadow-2xl focus-visible:outline-2 focus-visible:outline-offset-2"
      >
        <ChatsCircle size={24} aria-hidden />
        <span>{t("Mensagens")}</span>
        {unread > 0 && (
          <span
            aria-label={`${unread} ${t("conversas não lidas")}`}
            className="ml-auto rounded-full bg-destructive px-2 py-0.5 text-xs text-destructive-foreground"
          >
            {unread > 99 ? "99+" : unread}
          </span>
        )}
        {counts.isError && (
          <span
            className="ml-auto text-xs text-muted-foreground"
            title={t("Não foi possível atualizar as mensagens.")}
          >
            !
          </span>
        )}
      </button>
    </aside>
  );
}

function DockList({ orgId, onSelect }: { orgId: string; onSelect: (id: string) => void }) {
  const t = useT();
  const [search, setSearch] = useState("");
  const [term, setTerm] = useState("");
  useEffect(() => {
    const timer = setTimeout(() => setTerm(search.trim()), 250);
    return () => clearTimeout(timer);
  }, [search]);
  const query = useConversationsRealtime(
    { search: buscaValeConsulta(term) ? term : undefined },
    orgId,
  );
  const conversations = query.data?.pages.flatMap((page) => page.data) ?? [];
  return (
    <>
      <div className="shrink-0 p-3">
        <Input
          aria-label={t("Buscar conversas")}
          placeholder={t("Buscar conversas")}
          value={search}
          onChange={(event) => setSearch(event.target.value)}
        />
      </div>
      <div className="min-h-0 flex-1 overflow-y-auto">
        {query.isPending ? (
          <p className="p-5 text-sm text-muted-foreground" role="status">
            {t("Carregando…")}
          </p>
        ) : query.isError ? (
          <div className="space-y-3 p-5 text-sm">
            <p role="alert">{t("Não foi possível carregar as conversas.")}</p>
            <Button variant="outline" onClick={() => void query.refetch()}>
              {t("Tentar novamente")}
            </Button>
          </div>
        ) : conversations.length === 0 ? (
          <p className="p-5 text-sm text-muted-foreground">{t("Nenhuma conversa encontrada.")}</p>
        ) : (
          conversations.map((conversation) => (
            <ConversationListItem
              key={conversation.id}
              conversation={conversation}
              isSelected={false}
              onSelect={onSelect}
              mostrarCanal={false}
              mostrarAutomatico={false}
            />
          ))
        )}
        {query.hasNextPage && (
          <div className="p-3">
            <Button
              variant="ghost"
              className="w-full"
              disabled={query.isFetchingNextPage}
              onClick={() => void query.fetchNextPage()}
            >
              {t("Carregar mais")}
            </Button>
          </div>
        )}
      </div>
      <div className="flex shrink-0 justify-end border-t p-3">
        <Link
          href="/app/contacts"
          aria-label={t("Escolher contato para conversar")}
          title={t("Escolher contato para conversar")}
          className="flex items-center gap-2 rounded-full border px-3 py-2 text-xs hover:bg-muted"
        >
          <PencilSimple size={18} aria-hidden />
          {t("Contatos")}
        </Link>
      </div>
    </>
  );
}

function CompactConversation({
  conversationId,
  visible,
  initialDraft,
  initialMode,
  onDraftChange,
}: {
  conversationId: string;
  visible: boolean;
  initialDraft: string;
  initialMode: "reply" | "note";
  onDraftChange: (text: string, mode: "reply" | "note") => void;
}) {
  const t = useT();
  const { user } = useAuth();
  const query = useConversation(conversationId, visible);
  const conversation = query.data;
  const [reply, setReply] = useState<Message | null>(null);
  const [now, setNow] = useState(() => new Date());
  useEffect(() => {
    const timer = setInterval(() => setNow(new Date()), 30000);
    return () => clearInterval(timer);
  }, []);
  useMarkAsRead(
    visible && conversation ? conversationId : null,
    conversation?.unread_count_for_assignee ?? 0,
  );
  const window = estadoDaJanela(
    conversation?.channel_sessions?.provider ?? null,
    conversation?.last_inbound_at ?? null,
    now,
  );
  const blocked =
    user.support?.access_mode === "support_readonly"
      ? t("Acompanhamento somente leitura")
      : conversation?.contacts?.is_blocked
        ? t("Contato bloqueado — envio de mensagens desabilitado.")
        : conversation?.contacts?.is_anonymized
          ? t("Contato anonimizado — não é possível enviar mensagens.")
          : null;
  if (query.isError)
    return (
      <div className="space-y-3 p-4">
        <p role="alert" className="text-sm">
          {t("Conversa não encontrada ou fora do seu acesso.")}
        </p>
        <Button variant="outline" onClick={() => void query.refetch()}>
          {t("Tentar novamente")}
        </Button>
      </div>
    );
  if (!conversation)
    return (
      <p role="status" className="p-4 text-sm text-muted-foreground">
        {t("Carregando…")}
      </p>
    );
  return (
    <OpenConversationProvider conversationId={visible ? conversationId : null}>
      <div className="flex shrink-0 items-center gap-2 border-b px-4 py-3">
        <ChannelLogo channel={conversation.channel_sessions} />
        <span className="min-w-0 flex-1 truncate text-sm font-medium">
          {rotuloDoContato(conversation.contacts, t)}
        </span>
        <JanelaSelo
          provider={conversation.channel_sessions?.provider ?? null}
          lastInboundAt={conversation.last_inbound_at}
        />
      </div>
      <div className="min-h-0 flex-1 overflow-hidden">
        <ChatThread conversationId={conversationId} onResponder={setReply} />
      </div>
      <div className="max-h-[45%] shrink-0 overflow-y-auto">
        <RetentionNotice conversationId={conversationId} />
        <Composer
          conversationId={conversationId}
          initialDraft={initialDraft}
          initialMode={initialMode}
          active={visible}
          onDraftChange={onDraftChange}
          blockedReason={blocked}
          janelaFechada={
            window.tipo === "fechada"
              ? t("A janela de atendimento fechou. Abra o Inbox para ver as opções deste canal.")
              : null
          }
          disabled={["closed", "resolved", "archived"].includes(conversation.status)}
          contactName={conversation.contacts?.name ?? null}
          currentContactId={conversation.contact_id}
          respondendo={reply}
          onCancelarResposta={() => setReply(null)}
        />
      </div>
    </OpenConversationProvider>
  );
}
