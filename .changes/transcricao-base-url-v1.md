---
impacto: nada_mudou
secao: corrigido
titulo: Transcrição aceita base URL com ou sem /v1 e sem duplicar caminho
---

Ao configurar uma URL base customizada para transcrição de áudio (ex.: Groq ou Whisper próprio, como sugerido no `.env.example`), o provedor de transcrição concatenava `/v1/audio/transcriptions` sem normalizar o sufixo `/v1` ou barras finais, resultando em `/v1/v1/audio/transcriptions` e gerando erro 404. O provedor agora normaliza a base removendo barras finais e o sufixo `/v1`, suportando tanto URLs com quanto sem `/v1`.
