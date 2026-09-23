---
impacto: capacidade_nova
secao: adicionado
titulo: Variável META_WEBHOOK_BASE_URL para separar a URL pública dos webhooks da Meta
---

Adiciona a variável opcional `META_WEBHOOK_BASE_URL`, permitindo configurar uma URL pública dedicada para o callback dos webhooks da Meta (WhatsApp Cloud API / canais oficiais), separada de `NEXT_PUBLIC_APP_URL`. Mantém compatibilidade total com instalações existentes por fallback automático.

Contribuição de @webtecnica (#1554).
