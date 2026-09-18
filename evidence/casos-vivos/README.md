# Prova em tela — épico "casos vivos"

Bancada: Supabase isolado (portas próprias, sem encostar em outra sessão), `supabase/baseline.sql`
aplicado do zero — 139 tabelas, modo install com `ON_ERROR_STOP=1` —, `scripts/seed-e2e-credentials.ts`
e `scripts/seed-e2e-escalacao.ts`, build de produção (`next build` + `next start`) na porta 3107,
**sem chave de IA** (o dublê `INTERNAL_AGENT_RUN_STUB`, que é como o CI roda). É o mais perto de
uma VPS recém-instalada que esta máquina permite.

## Conversar com a IA que abriu o caso (ondas 4 e 5)

| imagem | o que ela mostra |
|---|---|
| [`evidence/casos-vivos/chat/10-lista.png`](evidence/casos-vivos/chat/10-lista.png) | a tela de Casos aberta por um `manager`, com o cabeçalho e as abas |
| [`evidence/casos-vivos/chat/20-login-resultado.png`](evidence/casos-vivos/chat/20-login-resultado.png) | **o defeito que a tela pegou**: "Email ou senha incorretos" com a senha certa. Não era o produto — o serviço de autenticação da bancada devolveu 500 por tempo esgotado no banco, e o produto traduz isso para credencial inválida. Medido no log do próprio GoTrue e confirmado pelo contraste (as mesmas credenciais entram por `curl` e pelo SDK no mesmo minuto) |
| [`evidence/casos-vivos/chat/30-casos.png`](evidence/casos-vivos/chat/30-casos.png) | a lista com o caso semeado — "Abertos (1) · Desconto acima da alçada · Aguardando você" |
| [`evidence/casos-vivos/chat/31-caso-aberto.png`](evidence/casos-vivos/chat/31-caso-aberto.png) | o caso aberto: o que o cliente precisa, por que a IA travou, as três decisões e o painel "Conversar sobre o caso" com o aviso de que a IA original não está mais no ar |
| [`evidence/casos-vivos/chat/32-pergunta-digitada.png`](evidence/casos-vivos/chat/32-pergunta-digitada.png) | a pergunta do atendente digitada no campo |
| [`evidence/casos-vivos/chat/33-resposta.png`](evidence/casos-vivos/chat/33-resposta.png) | **a prova**: pergunta da equipe e resposta da IA, com autor e hora, sem tocar a conversa do cliente |

**O que estas imagens NÃO provam:** as medidas de layout por ferramenta (a sonda achou o painel numa
rodada e não na seguinte — a bancada oscila sob a carga desta máquina), o aviso no WhatsApp e a
passagem para humano. Isso é a onda 12, com spec Playwright e repetição.

**Captura de página inteira mente sobre posição:** nos PNGs `fullPage`, a barra lateral aparece
empilhada no meio do conteúdo. É artefato de elemento fixo em captura rolada, não defeito de
layout — a medição por `getBoundingClientRect` da onda 12 é quem responde isso.
