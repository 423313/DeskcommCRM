---
impacto: nada_mudou
secao: corrigido
titulo: Etapa criada pela tela gera slug com hífen e normaliza busca em agendamento e handoff
---

A geração de slug de etapa na interface (`lib/leads/stage-editing.ts`) utilizava sublinhado (`_`), enquanto os módulos de movimentação automática por agendamento (`lib/leads/appointment-stage-move.ts`) e de handoff (`lib/leads/handoff-stage-move.ts`) procuravam slugs padronizados com hífen (`agendamento-solicitado` e `chamar-humano`). Agora o gerador produz slugs com hífens e os consumidores passam a buscar também etapas legadas com sublinhado como fallback, garantindo compatibilidade total sem quebras.
