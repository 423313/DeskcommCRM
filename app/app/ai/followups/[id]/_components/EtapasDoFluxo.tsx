"use client";

import { createContext, useContext, useMemo, type ReactNode } from "react";

import { nomeDaEtapa, useEtapasDeGatilho, type EtapaDeGatilho } from "@/hooks/followup/useEtapasDeGatilho";
import type { NomesDeValor } from "@/lib/followup/vocabulario";

/**
 * As etapas do funil que o construtor inteiro enxerga — UMA leitura para o
 * seletor da regra, o card, a etiqueta da aresta e o painel da aresta.
 *
 * A regra de etapa GRAVA o `stage_id` (é o que o motor compara) e MOSTRA o nome.
 * São quatro superfícies mostrando a mesma regra: se cada uma resolvesse o nome
 * por conta própria, bastaria uma esquecer para o uuid aparecer na tela.
 */
export interface EtapasDoFluxo {
  /** Etapas ATIVAS da organização, na ordem do funil. */
  etapas: EtapaDeGatilho[];
  carregando: boolean;
  nomes: NomesDeValor;
}

const SEM_ETAPAS: EtapasDoFluxo = { etapas: [], carregando: false, nomes: {} };

const Contexto = createContext<EtapasDoFluxo>(SEM_ETAPAS);

export function EtapasDoFluxoProvider({ children }: { children: ReactNode }) {
  const { etapas, carregando } = useEtapasDeGatilho();

  // O provider fica ACIMA do canvas: arrastar um nó re-renderiza o canvas, não
  // este componente — o valor só muda quando as consultas de etapas mudam.
  const valor = useMemo<EtapasDoFluxo>(() => {
    const porId = new Map(etapas.map((e) => [e.stageId, e]));
    return {
      etapas,
      carregando,
      nomes: {
        // Enquanto a lista não chegou, reticências: "(não encontrada)" seria uma
        // mentira de um segundo sobre uma etapa que existe.
        etapa: (id) => {
          const etapa = porId.get(id);
          if (etapa) return nomeDaEtapa(etapa);
          return carregando ? "…" : null;
        },
      },
    };
  }, [etapas, carregando]);

  return <Contexto.Provider value={valor}>{children}</Contexto.Provider>;
}

export function useEtapasDoFluxo(): EtapasDoFluxo {
  return useContext(Contexto);
}
