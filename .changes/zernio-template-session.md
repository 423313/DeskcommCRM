---
impacto: nada_mudou
secao: corrigido
titulo: Atualização de modelo pelo Zernio passa a filtrar pela conexão correspondente
---

A sincronização de status de modelo vinda de webhook do Zernio (`lib/channels/zernio/avisos.ts`) atualizava o espelho local (`meta_templates`) filtrando apenas por organização e nome. Em organizações com mais de uma conexão espelhando modelos de mesmo nome (ou conexões com múltiplos idiomas), o estado recebido do Zernio podia sobrescrever a linha de outro canal. Agora a atualização filtra por `channel_session_id` e idioma, isolando as conexões.
