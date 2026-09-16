/**
 * O AVISO na Central quando o assistente esbarra na etapa de perda (issue #917).
 *
 * ═══ POR QUE ESTE ARQUIVO EXISTE ═══
 *
 * O ponto de uso do caminho da IA (`lib/agent-engine/agent/inbound-turn.ts`,
 * a ferramenta `update_lead_state`) decidia o texto do aviso num encadeado de
 * `if` dentro do próprio handler. Medido: apagar o ramo de `perda_sem_motivo`
 * inteiro deixava **ZERO** caso vermelho em toda a suíte — a execução caía no
 * ramo genérico, que TAMBÉM grava um item de caixa, e nada distinguia os dois.
 *
 * Só que o item genérico diz "Espelho de stage no CRM falhou — funil
 * possivelmente inconsistente" e "Reconcilie o stage no CRM manualmente" — que é
 * literalmente a mensagem de incidente que a #917 veio eliminar. Nada quebrou; o
 * que falta é uma decisão de quem está no negócio. Mandar o dono reconciliar um
 * funil é pedir que ele procure um defeito que não existe.
 *
 * Dois ramos que gravam um item cada, com textos opostos, não se separam pela
 * pergunta "houve item?". Separam-se pelo TEXTO — e texto só vira asserção
 * quando a decisão é uma função que se pode chamar. Daí
 * `avisoDoEspelhoRecusado`, em `edge/crm/move-lead-stage`, junto do vocabulário
 * de motivos que ela traduz.
 *
 * O que fica congelado aqui:
 *  1. `perda_sem_motivo` produz o aviso de PERDA, e nunca o de incidente;
 *  2. `fora_do_escopo` continua com o aviso DELE (as duas recusas legítimas não
 *     se confundem: uma pede liberar um funil, a outra pede informar um motivo);
 *  3. motivo de incidente de verdade continua produzindo o aviso de incidente —
 *     senão o conserto viraria um jeito de calar o funil quebrado;
 *  4. warn-only não produz item nenhum.
 */
import { describe, expect, it } from "vitest";

import { avisoDoEspelhoRecusado } from "@/lib/agent-engine/edge/crm/move-lead-stage";

const ETAPA = "Perdido";

describe("a etapa de perda sem motivo vira AÇÃO para o humano, não incidente", () => {
  it("o aviso fala em negócio PERDIDO e em informar o motivo", () => {
    const aviso = avisoDoEspelhoRecusado({
      motivo: "perda_sem_motivo",
      detalhe: "a etapa de destino fecha o negócio como perdido",
      etapaDeDestino: ETAPA,
    });

    expect(aviso).not.toBeNull();
    expect(aviso!.title.toLowerCase()).toContain("perdido");
    expect(aviso!.title.toLowerCase()).toContain("motivo");
    expect(aviso!.body).toContain("informe o motivo");
  });

  it("e NÃO é o aviso de incidente — nada quebrou, não há o que reconciliar", () => {
    const aviso = avisoDoEspelhoRecusado({
      motivo: "perda_sem_motivo",
      detalhe: "a etapa de destino fecha o negócio como perdido",
      etapaDeDestino: ETAPA,
    });

    expect(aviso!.body).not.toContain("Reconcilie");
    expect(aviso!.title).not.toContain("Espelho de stage no CRM falhou");
    expect(aviso!.title).not.toContain("inconsistente");
  });

  it("diz para qual etapa o assistente quis levar o negócio", () => {
    // Sem o nome da etapa o dono não sabe QUAL perda o assistente enxergou, e o
    // aviso vira um pedido genérico de atenção.
    const aviso = avisoDoEspelhoRecusado({
      motivo: "perda_sem_motivo",
      detalhe: "…",
      etapaDeDestino: "Cancelado pelo paciente",
    });
    expect(aviso!.body).toContain("Cancelado pelo paciente");
  });
});

describe("as outras recusas continuam com o aviso delas", () => {
  it("`fora_do_escopo` pede liberar o funil, não informar motivo", () => {
    const aviso = avisoDoEspelhoRecusado({
      motivo: "fora_do_escopo",
      detalhe: "nenhum funil liberado para este assistente",
      etapaDeDestino: ETAPA,
    });

    expect(aviso!.title).toContain("funil que não é dele");
    expect(aviso!.body).toContain("nenhum funil liberado para este assistente");
    expect(aviso!.body).not.toContain("informe o motivo");
    expect(aviso!.body).not.toContain("Reconcilie");
  });

  it("incidente de verdade continua sendo incidente", () => {
    // A recusa de negócio não pode virar um jeito de calar o funil quebrado: o
    // banco fora do ar segue mandando reconciliar.
    const aviso = avisoDoEspelhoRecusado({
      motivo: "crm_unavailable",
      detalhe: "o banco do CRM não respondeu",
      etapaDeDestino: ETAPA,
    });

    expect(aviso!.title).toContain("Espelho de stage no CRM falhou");
    expect(aviso!.body).toContain("Reconcilie");
  });

  it("warn-only não produz item nenhum na Central", () => {
    for (const motivo of ["not_configured", "human_conflict"] as const) {
      expect(
        avisoDoEspelhoRecusado({ motivo, detalhe: "…", etapaDeDestino: ETAPA }),
        `esperava warn-only para ${motivo}`,
      ).toBeNull();
    }
  });
});
