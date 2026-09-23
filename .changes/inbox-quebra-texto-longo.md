---
impacto: nada_mudou
secao: corrigido
titulo: Textos longos sem espaços no Inbox não estouram mais a largura da tela
---

No Inbox, mensagens com sequências longas e contínuas de caracteres sem espaço (como códigos Pix copia-e-cola de 150+ caracteres) estufavam a bolha de mensagem para além da coluna de conversa, desalinhando o layout e ocultando os botões de ação do topo. A bolha e o scroller ganharam contenção de largura mínima e quebra forçada (`[overflow-wrap:anywhere]`), mantendo o layout íntegro em qualquer resolução.

Contribuição de @webtecnica (#1451).
