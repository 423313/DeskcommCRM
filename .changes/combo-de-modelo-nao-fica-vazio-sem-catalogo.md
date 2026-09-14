---
impacto: nada_mudou
secao: corrigido
titulo: Modelo padrão em IA → Provedores volta a ser salvável quando o catálogo do provedor ainda não sincronizou
---

O catálogo que alimenta o combo de modelo da tela IA → Provedores nasce de uma sincronização
que só alguns provedores já têm semeada na instalação: quem escolhia um provedor cujo catálogo
ainda não tinha sido baixado encontrava a lista vazia. Combo vazio, nada para escolher, e o
botão de gravar o modelo padrão desabilitado — a tela existia justamente para configurar essa
escolha, mas não oferecia nenhum caminho para fazê-lo, e não dizia por quê.

Agora, quando não há nenhum modelo conhecido para o provedor selecionado, o campo deixa de ser
uma lista e passa a aceitar o identificador digitado, com uma nota explicando que a lista
completa aparece sozinha depois da primeira sincronização. A gravação avisa que não deu para
conferir o identificador contra o catálogo, em vez de dizer apenas que salvou: com o catálogo
presente, um nome de modelo errado continua sendo recusado como antes.

Para quem opera uma VPS, nada muda: é conserto de tela, sem comando novo, sem variável nova e
sem migração. Ninguém precisa fazer nada ao atualizar.
