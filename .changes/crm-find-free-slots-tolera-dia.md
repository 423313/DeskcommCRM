---
impacto: nada_mudou
secao: corrigido
titulo: crm_find_free_slots tolera dia e dias_a_frente juntos priorizando dia
---

A ferramenta MCP `crm_find_free_slots` não recusa mais chamadas com `periodo_ambiguo` quando o modelo de IA preenche `dia` e `dias_a_frente` simultaneamente, priorizando o campo mais específico (`dia`) e documentando a precedência no schema da ferramenta.
