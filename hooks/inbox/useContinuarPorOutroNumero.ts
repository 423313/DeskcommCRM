"use client";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";

import { showApiError } from "@/components/feedback/ApiErrorToast";
import { useT } from "@/hooks/i18n/useT";
import { apiClient } from "@/lib/api/client";
import { ApiError } from "@/lib/api/types";

interface Args {
  contact_id: string;
  channel_session_id: string;
}

/**
 * Continua o atendimento do MESMO contato por outro número da organização.
 *
 * A conversa é o fio com aquele contato naquele número (índice único por
 * org, contato e sessão), então trocar de número não é mover a conversa: é abrir
 * — ou reabrir — a do outro número. `open-with-contact` já faz exatamente isso;
 * esta tela só dá a porta que faltava quando o telefone da conversa cai.
 *
 * Depois de abrir, quem pediu assume. Sem isso a conversa nova nasce sem dono e
 * o automático daquele número poderia responder no meio do atendimento humano
 * — assumir grava o silêncio do bot na mesma transação (ver a rota `claim`).
 * Se outra pessoa já é dona da conversa no outro número, ninguém rouba: a
 * conversa abre e a tela diz quem atende.
 */
export function useContinuarPorOutroNumero() {
  const qc = useQueryClient();
  const t = useT();

  return useMutation({
    mutationFn: async (args: Args): Promise<string> => {
      const aberta = await apiClient.post<{ data: { conversation_id: string } }>(
        "/api/v1/conversations/open-with-contact",
        args,
      );
      const id = aberta.data.conversation_id;
      try {
        await apiClient.post(`/api/v1/conversations/${id}/claim`, { expected_assignee: null });
      } catch (err) {
        if (!(err instanceof ApiError && err.status === 409)) throw err;
        toast.info(t("A conversa neste número já tem um responsável."));
      }
      return id;
    },
    onError: showApiError,
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["conversations"] });
      toast.success(t("Atendimento continua pelo outro número."));
    },
  });
}
