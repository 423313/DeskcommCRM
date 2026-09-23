---
impacto: nada_mudou
secao: corrigido
titulo: Ação de automação assign_owner passa a ajustar owner_kind e limpar owner_agent_id
---

A ação de automação `assign_owner` atualizava `owner_user_id` diretamente no `crm_leads` sem ajustar `owner_kind` nem limpar `owner_agent_id`, violando a constraint `crm_leads_owner_kind_coherence` em leads previamente atribuídos a agentes de IA ou gerando incoerência em leads com dono sem tipo. Agora a ação roteia a atribuição por `resolveOwnerPatch`, garantindo a coerência do trio `owner_user_id`, `owner_kind` e `owner_agent_id`.
