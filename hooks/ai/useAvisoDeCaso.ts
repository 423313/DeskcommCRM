"use client";
/**
 * O AVISO DE CASO NO WHATSAPP — o lado do cliente.
 *
 * ## Por que não há `refetchInterval`
 *
 * Esta é uma tela de CONFIGURAÇÃO: quem a abre está digitando um número, não
 * acompanhando um fluxo. Uma consulta periódica aqui recarregaria o estado por
 * baixo de um campo meio preenchido — e o formulário é controlado, então a
 * pessoa veria o próprio texto voltar atrás. A lista de entregas envelhece
 * alguns minutos; o botão de recarregar existe para quem quiser conferir.
 *
 * ## Uma consulta só para a tela inteira
 *
 * Alertas, conexões, configuração, entregas e o laço de retorno saem do MESMO
 * GET. Não é economia de requisição: é que os alertas são derivados de todos os
 * outros, e duas consultas independentes deixariam a tela num estado onde o
 * aviso diz "nenhuma conexão" enquanto o seletor já tem três — o tipo de
 * incoerência que faz quem opera desconfiar da tela certa.
 *
 * ## `salvar` e `testar` invalidam a mesma chave
 *
 * O PUT já devolve o estado recalculado, e ainda assim a chave é invalidada: o
 * teste NÃO devolve estado, e ele muda o que a tela deve dizer (a mensagem que
 * saiu entra na conta do aquecimento). Uma regra só para os dois é mais barata
 * que duas certas.
 */
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

import { apiClient } from "@/lib/api/client";
import type { AvisoDaTela, ConexaoParaAviso } from "@/lib/escalacao/estado-do-aviso";
import type { MotivoDoTeste } from "@/lib/escalacao/aviso-de-teste";
import type { EntregaNaTela } from "@/lib/escalacao/tela-do-aviso";
import type { LacoDoAviso } from "@/lib/escalacao/laco-do-aviso";

export const CHAVE_DO_AVISO = ["ai-aviso-de-caso"] as const;

export interface ConfigDoAvisoNaTela {
  channel_session_id: string | null;
  telefone: string;
  rotulo: string | null;
  ligado: boolean;
  atualizado_em: string;
}

export interface EstadoDoAviso {
  config: ConfigDoAvisoNaTela | null;
  conexoes: ConexaoParaAviso[];
  avisos: AvisoDaTela[];
  pode_ligar: boolean;
  entregas: EntregaNaTela[];
  laco: LacoDoAviso;
}

export interface ResultadoDoTeste {
  enviado: boolean;
  destinoMascarado?: string;
  codigo?: MotivoDoTeste;
  liberaEm?: string;
  detalhe?: string;
}

export function useAvisoDeCaso() {
  return useQuery({
    queryKey: CHAVE_DO_AVISO,
    // Papel insuficiente devolve 403, e repetir não muda isso.
    retry: false,
    queryFn: () =>
      apiClient.get<{ data: EstadoDoAviso }>("/api/v1/ai/cases/alerta").then((r) => r.data),
  });
}

export interface EntradaDoSalvar {
  channel_session_id: string;
  telefone: string;
  rotulo: string | null;
  ligado: boolean;
  /** `true` = "eu sei que esse número é um cliente meu, e quero mesmo assim". */
  confirma_contato?: boolean;
}

export function useSalvarAvisoDeCaso() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (entrada: EntradaDoSalvar) =>
      apiClient
        .put<{ data: EstadoDoAviso }>("/api/v1/ai/cases/alerta", entrada)
        .then((r) => r.data),
    onSuccess: (estado) => {
      // O PUT devolve o estado recalculado: escrever no cache evita o piscar de
      // uma tela que volta ao valor antigo enquanto o GET seguinte não chega.
      qc.setQueryData(CHAVE_DO_AVISO, estado);
    },
  });
}

export function useTestarAvisoDeCaso() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: () =>
      apiClient
        .post<{ data: ResultadoDoTeste }>(
          "/api/v1/ai/cases/alerta/teste",
          {},
          {
            // O envio passa por transporte de terceiro com timeout próprio de 5s
            // no motor; 30s é o default de mutação e não cobre a fila antes dele.
            timeoutMs: 45_000,
          },
        )
        .then((r) => r.data),
    onSettled: () => {
      // A mensagem de teste SAIU pelo número: ela entra na conta do aquecimento,
      // e o "hoje: 7 de 20" da tela precisa refletir isso.
      qc.invalidateQueries({ queryKey: CHAVE_DO_AVISO });
    },
  });
}
