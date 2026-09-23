---
impacto: nada_mudou
secao: corrigido
titulo: Freio de envio por token aplicado antes de abrir conversa e teto por organização
---

Ao iniciar conversa e envio por token (`crm_start_conversation_and_send`), o freio de ritmo e teto diário do número passa a ser checado antes de registrar a abertura da conversa no banco, impedindo conversas vazias residuais quando o envio for retido por limite de taxa (429). Além disso, a rota `/api/v1/messages` agora respeita um teto global por organização além do teto por token individual.
