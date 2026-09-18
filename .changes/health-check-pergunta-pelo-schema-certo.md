---
impacto: nada_mudou
secao: corrigido
titulo: A checagem de saúde não diz mais que o banco caiu quando ele está de pé
---

Quem instalou o CRM num projeto Supabase que **já servia outra aplicação** podia ver a
atualização terminar dizendo que o app não respondeu "ok" — com o CRM atendendo
normalmente, o login abrindo e os dados todos no lugar.

A causa era da sonda, não do banco. A checagem de saúde consultava a API do Supabase sem
dizer em qual schema procurar, e aí valia o **schema padrão do projeto** — que é `public`
em projeto novo, mas é o da outra aplicação quando ela chegou primeiro. A sonda procurava a
tabela no lugar errado, recebia "não existe" e concluía que o banco estava fora. Agora ela
pergunta pelo mesmo schema que o CRM usa de verdade.

Isso importa além do susto: a atualização usa essa resposta para decidir se deu certo, e um
"não" falso fazia a versão nova ser **revertida sozinha** logo depois de instalar. Quem
atualiza pela tela podia ver a versão voltar ao que era, sem nenhum erro aparecendo no CRM.

Nada muda para quem instalou num projeto Supabase dedicado ao CRM — nesses, a sonda já
acertava o schema por acaso, e continua acertando.
