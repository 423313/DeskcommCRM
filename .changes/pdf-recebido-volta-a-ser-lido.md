---
impacto: nada_mudou
secao: corrigido
titulo: PDFs recebidos pelo WhatsApp voltam a ser lidos pela IA
---

Todo PDF recebido falhava na extração de texto com "Extração de PDF
indisponível: o binário nativo @napi-rs/canvas não foi instalado nesta
plataforma" — mesmo a dependência estando instalada. O `next build`
gera o `.next/standalone` copiando só o que o file-tracing consegue seguir
por `import`/`require` estático, e o `@napi-rs/canvas` resolve seu binário
nativo com um `require()` computado em runtime (por `process.platform` e
detecção de musl/glibc); o tracer não segue isso e o binário ficava de fora
da imagem — o mesmo defeito que já havia sido corrigido para o
`@swc/helpers`. `next.config.ts` agora inclui o `@napi-rs/canvas` (e suas
variantes de plataforma) na mesma lista.

De quebra, o log do cron `attendant-heartbeat` (AT-08) passou a registrar
`code`/`details`/`hint` do erro do Postgres/PostgREST, não só a mensagem —
uma falha observada em produção só mostrava "column ... does not exist"
sem informação suficiente para diagnosticar a causa real.
